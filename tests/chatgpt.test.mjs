import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {generateKeyPair,SignJWT} from 'jose';
import {authorizationUrl,callbackRegistration,verifyIdentity,readCompletedText,prepareHost,createPlanClient} from '../lib/chatgpt.mjs';

test('OAuth uses PKCE, distinct host identity and correct dynamic registration',()=>{
  const args={hostId:'urn:uuid:demo',state:'state',nonce:'nonce',verifier:'verifier',redirectUri:'http://127.0.0.1:1234/auth/callback'};
  const url=new URL(authorizationUrl(args));assert.equal(url.origin,'https://auth.openai.com');
  assert.equal(url.searchParams.get('client_id'),'dynamic_agent_client');assert.equal(url.searchParams.get('agent_name_hint'),'SES MATCH');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.ok(url.searchParams.get('scope').includes('chatgpt.tokens.use.direct'));
  const again=new URL(authorizationUrl({...args,clientId:'oaiapp_test'}));assert.equal(again.searchParams.get('client_id'),'oaiapp_test');assert.equal(again.searchParams.has('agent_name_hint'),false);
});
test('OAuth rejects state mismatch, duplicate state, denied consent and switched registration',()=>{
  const expected={state:'expected',clientId:'oaiapp_test'};
  for(const q of ['state=wrong&code=test','state=expected&state=expected&code=test','state=expected&error=access_denied','state=expected&code=test&client_id=other','state=expected'])
    assert.throws(()=>callbackRegistration(new URL('http://127.0.0.1/auth/callback?'+q),expected));
  assert.equal(callbackRegistration(new URL('http://127.0.0.1/auth/callback?state=expected&code=test'),expected).clientId,'oaiapp_test');
  assert.throws(()=>callbackRegistration(new URL('http://127.0.0.1/auth/callback?state=expected&code=test'),{state:'expected'}));
});
test('ID token signature, issuer, audience, expiration and nonce are validated',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const make=(change={})=>new SignJWT({nonce:'nonce',...change}).setProtectedHeader({alg:'RS256'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('test-subject').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const good=await make();assert.equal((await verifyIdentity(good,'oaiapp_test','nonce',publicKey)).sub,'test-subject');
  await assert.rejects(verifyIdentity(good,'another','nonce',publicKey));
  await assert.rejects(verifyIdentity(good,'oaiapp_test','wrong',publicKey));
  const parts=good.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'attacker',exp:9999999999})).toString('base64url');
  await assert.rejects(verifyIdentity(parts.join('.'),'oaiapp_test','nonce',publicKey));
  const expired=await new SignJWT({nonce:'nonce'}).setProtectedHeader({alg:'RS256'}).setIssuer('https://auth.openai.com').setAudience('oaiapp_test').setSubject('sub').setIssuedAt().setExpirationTime(1).sign(privateKey);
  await assert.rejects(verifyIdentity(expired,'oaiapp_test','nonce',publicKey));
});
function response(events,split=false) {
  const data=events.map(e=>'data: '+JSON.stringify(e)+'\r\n\r\n').join('');const bytes=new TextEncoder().encode(data);
  return new Response(new ReadableStream({start(controller){if(split)for(const b of bytes)controller.enqueue(new Uint8Array([b]));else controller.enqueue(bytes);controller.close();}}));
}
test('failure diagnostics exclude server messages and credentials',async()=>{
  const r=Response.json({error:{code:'insufficient_scope',message:'private-secret-token'}},{status:403});
  await assert.rejects(readCompletedText(r),error=>{
    assert.deepEqual(error.safeDiagnostic,{stage:'AI応答の取得',httpStatus:403,code:'insufficient_scope'});
    assert.equal(JSON.stringify(error.safeDiagnostic).includes('private-secret-token'),false);return true;
  });
});
test('SSE handles split UTF-8, requires completion, rejects failed/incomplete streams',async()=>{
  assert.equal(await readCompletedText(response([{type:'response.output_text.delta',delta:'日本語'},{type:'response.completed'}],true)),'日本語');
  await assert.rejects(readCompletedText(response([{type:'response.output_text.delta',delta:'partial'}])));
  for(const type of ['response.failed','response.incomplete','error'])await assert.rejects(readCompletedText(response([{type:'response.output_text.delta',delta:'partial'},{type}])));
  await assert.rejects(readCompletedText(response([{type:'response.completed'}])));
});
test('host identity persists and protected credentials never reach public status',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'ses-chatgpt-'));
  try {
    assert.equal(prepareHost(dir),prepareHost(dir));
    if(process.platform!=='win32')assert.equal(statSync(path.join(dir,'host.json')).mode&0o777,0o600);
    const record={client_id:'oaiapp_test',access_token:'secret-token',refresh_token:'secret-refresh',scopes:['chatgpt.tokens.use.direct'],expires_at:Date.now()+3600000};
    writeFileSync(path.join(dir,'connection.json'),JSON.stringify(record),{mode:0o600});
    const calls=[];const request=async(url,options)=>{calls.push({url,options});return url.endsWith('/models')?Response.json({models:[{slug:'test-model',display_name:'Test',visibility:'list'},{slug:'hidden',visibility:'hidden'}]}):response([{type:'response.output_text.delta',delta:'done'},{type:'response.completed'}]);};
    const client=createPlanClient({dir,request});assert.deepEqual(client.status(),{connected:true,sharing:true});
    assert.equal(await client.infer({model:'test-model',input:'fictional',instructions:'test'}),'done');
    const sent=JSON.parse(calls.find(c=>c.url.endsWith('/responses')).options.body);
    assert.equal(sent.store,false);assert.equal(sent.stream,true);assert.equal(calls[0].url,'https://api.openai.com/v1/models');
    await assert.rejects(client.infer({model:'unknown',input:'test'}));
  }finally {rmSync(dir,{recursive:true,force:true});}
});
test('refresh is serialized, rotates credentials atomically and never falls back to API key',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'ses-chatgpt-'));let refreshes=0;
  try {
    const file=path.join(dir,'connection.json');writeFileSync(file,JSON.stringify({client_id:'oaiapp_test',access_token:'old-token',refresh_token:'old-refresh',scopes:['chatgpt.tokens.use.direct'],expires_at:0}),{mode:0o600});
    const request=async(url,options)=>{
      if(url.endsWith('/oauth/token')) {refreshes++;assert.equal(options.body.get('grant_type'),'refresh_token');assert.equal(options.body.has('scope'),false);return Response.json({access_token:'new-token',refresh_token:'new-refresh',token_type:'Bearer',expires_in:3600});}
      assert.equal(options.headers.Authorization,'Bearer new-token');return Response.json({models:[{slug:'test-model',visibility:'list'}]});
    };
    const c=createPlanClient({dir,request});await Promise.all([c.models(),c.models()]);assert.equal(refreshes,1);
    const saved=JSON.parse(readFileSync(file));assert.equal(saved.refresh_token,'new-refresh');assert.ok(saved.scopes.includes('chatgpt.tokens.use.direct'));
    writeFileSync(file,JSON.stringify({...saved,scopes:[]}),{mode:0o600});await assert.rejects(c.models());
  }finally {rmSync(dir,{recursive:true,force:true});}
});
