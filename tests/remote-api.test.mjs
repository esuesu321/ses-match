import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {request} from 'node:http';

test('remote API protects pages and data; two browser clients see the same persisted data',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'ses-remote-'));const root=fileURLToPath(new URL('..',import.meta.url));
  const password='test-only-password-long-enough-1234';const port=14318;
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),SES_DB:path.join(dir,'test.sqlite'),SES_PUBLIC_ORIGIN:'https://ses.example.test',SES_AUTH_USER:'owner',SES_AUTH_PASSWORD:password,SES_AI_MODE:'chatgpt',SES_CHATGPT_DIR:path.join(dir,'chatgpt')},stdio:['ignore','pipe','pipe']});
  try {
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout')),10000);child.once('error',reject);child.once('exit',()=>reject(new Error('startup failed')));child.stdout.on('data',data=>{if(String(data).includes('SES MATCH ready')) {clearTimeout(timer);resolve();}});});
    const auth='Basic '+Buffer.from('owner:'+password).toString('base64');
    const call=(url,{authenticated=true,method='GET',body,origin}={})=>new Promise((resolve,reject)=>{
      const req=request({hostname:'127.0.0.1',port,path:url,method,headers:{Host:'ses.example.test','X-Forwarded-Proto':'https',...(authenticated?{Authorization:auth}:{}),...(method==='GET'?{}:{'Content-Type':'application/json',Origin:origin || 'https://ses.example.test'})}},res=>{
        let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,json:async()=>JSON.parse(text)}));
      });req.on('error',reject);req.end(body?JSON.stringify(body):undefined);
    });
    for(const url of ['/','/app.js','/api/state','/api/jobs','/api/people','/api/history'])assert.equal((await call(url,{authenticated:false})).status,401);
    assert.equal((await call('/api/jobs',{method:'POST',origin:'https://attacker.test',body:{title:'fictional'}})).status,403);
    const browserA=await call('/api/jobs',{method:'POST',body:{title:'架空の共有案件'}});assert.equal(browserA.status,201);const created=await browserA.json();
    const browserB=await (await call('/api/jobs/'+created.id)).json();assert.equal(browserB.title,'架空の共有案件');
    assert.equal((await call('/api/jobs/'+created.id,{method:'PUT',body:{title:'架空の更新案件'}})).status,200);
    assert.equal((await (await call('/api/jobs/'+created.id)).json()).title,'架空の更新案件');
    const state=await (await call('/api/state')).json();assert.deepEqual(state.chatGPT,{connected:false,sharing:false});assert.equal(state.aiConfigured,false);assert.equal(state.aiProvider,'chatgpt_plan');
    assert.equal((await call('/api/match',{method:'POST',body:{useAi:true}})).status,400);
  }finally {
    if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});
    rmSync(dir,{recursive:true,force:true});
  }
});
