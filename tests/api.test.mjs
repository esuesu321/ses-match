import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {assessSkills} from '../lib/ai.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('API: CRUD、重複、入力保持、NG判定、履歴、再起動後の永続化',async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'ses-match-test-'));const dbPath=path.join(dir,'test.sqlite');const port=14317;let child;
  const boot=()=>new Promise((resolve,reject)=>{child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),SES_DB:dbPath,AI_ENDPOINT:'',AI_API_KEY:'',AI_MODEL:''},stdio:['ignore','pipe','pipe']});child.once('error',reject);child.once('exit',c=>{if(c!==0)reject(new Error('server startup failed'));});child.stdout.on('data',chunk=>{if(String(chunk).includes('SES MATCH ready'))resolve();});});
  const stop=()=>new Promise(resolve=>{child.once('exit',resolve);child.kill();});
  const call=async(url,method='GET',data,origin)=>{const res=await fetch(`http://127.0.0.1:${port}${url}`,{method,headers:method==='GET'?{}:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:res.status,value:await res.json()};};
  try{
    await boot();const raw='案件名：APIテスト\n外国籍：不可\n個人事業主：可';const draft=(await call('/api/parse','POST',{raw})).value.draft;
    assert.equal(draft.freelanceAllowed,'yes');const created=await call('/api/jobs','POST',draft);assert.equal(created.status,201);const jobId=created.value.id;
    assert.equal((await call('/api/jobs','POST',draft)).status,409);
    const roleA=await call('/api/jobs','POST',{...draft,position:'上流担当'});
    const roleB=await call('/api/jobs','POST',{...draft,position:'アプリエンジニア'});
    assert.equal(roleA.status,201);assert.equal(roleB.status,201);
    assert.equal((await call('/api/jobs','POST',{...draft,position:'上流担当'})).status,409);
    assert.equal((await call(`/api/jobs/${roleA.value.id}`)).value.raw,raw);
    assert.ok((await call('/api/parse','POST',{raw})).value.duplicateId);
    assert.equal((await call('/api/jobs','POST',{title:''})).status,400);
    const mailRaw='案件名：架空メール案件\n外国籍：不可';
    const mail=await call('/api/import/mail','POST',{raw:mailRaw,subject:'架空案件',receivedAt:'2026-10-13'});
    assert.equal(mail.status,200);assert.equal(mail.value.draft.source,'mail');assert.equal(mail.value.draft.paymentDays,35);
    assert.equal((await call('/api/state')).value.jobs.length,3,'抽出では保存しない');
    const savedMail=await call('/api/jobs','POST',mail.value.draft);assert.equal(savedMail.status,201);
    assert.equal((await call('/api/import/mail','POST',{raw:mailRaw})).value.duplicateId,savedMail.value.id);
    assert.equal((await call('/api/import/mail','POST',{raw:'別本文',useAi:true,model:'test'})).status,409);
    assert.equal((await call('/api/import/mail','POST',{raw:'a'.repeat(20001)})).status,400);

    assert.equal((await call('/api/jobs','POST',{title:'別サイト'},'https://example.com')).status,403);
    const p=await call('/api/people','POST',{name:'API架空要員',nationality:'中国',contract:'freelance',experiences:[]});assert.equal(p.status,201);
    const evaluation=await call('/api/match','POST',{jobId,personId:p.value.id});assert.equal(evaluation.value.results[0].status,'対象外');assert.equal((await call('/api/history')).value.length,1);
    assert.equal((await call(`/api/jobs/${jobId}`,'PUT',{...created.value,title:'更新済み'})).status,200);
    await stop();await boot();assert.equal((await call(`/api/jobs/${jobId}`)).value.title,'更新済み');
    assert.equal((await call(`/api/people/${p.value.id}`,'DELETE',{})).status,200);assert.equal((await call('/api/state')).value.people.length,0);
    assert.equal((await call('/api/match','POST',{personId:'missing'})).status,404);
  }finally{if(child?.exitCode===null)await stop();rmSync(dir,{recursive:true,force:true});}
});
test('AIアダプター: HTTP接続、JSON所見の検証、不正応答と未接続',async()=>{
  const original={AI_ENDPOINT:process.env.AI_ENDPOINT,AI_API_KEY:process.env.AI_API_KEY,AI_MODEL:process.env.AI_MODEL};
  let mode='valid',received;
  const mock=createServer(async(req,res)=>{let s='';for await(const c of req)s+=c;received=JSON.parse(s);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(mode==='valid'?{summary:'商用実務の証跡を確認',strengths:['Java実装'],concerns:[],questions:[],evidence:['スキルシートNo.1']}:{summary:12})}}]}));});
  await new Promise(resolve=>mock.listen(0,'127.0.0.1',resolve));
  try{
    process.env.AI_ENDPOINT=`http://127.0.0.1:${mock.address().port}`;process.env.AI_API_KEY='test-only';process.env.AI_MODEL='mock-model';
    const r=await assessSkills({title:'テスト'},{name:'A.B'}, {status:'要確認'});assert.equal(r.state,'completed');assert.equal(r.requiresReview,true);assert.equal(received.response_format.type,'json_object');
    mode='invalid';await assert.rejects(assessSkills({}, {},{status:'要確認'}));
    assert.equal((await assessSkills({}, {},{status:'対象外'})).state,'skipped');
    delete process.env.AI_API_KEY;assert.equal((await assessSkills({}, {},{status:'要確認'})).state,'not_configured');
  }finally{await new Promise(resolve=>mock.close(resolve));for(const [k,v]of Object.entries(original))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
