import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {match} from './lib/matching.mjs';
import {parseLine} from './lib/parser.mjs';
import {validate} from './lib/validation.mjs';
import {aiConfigured,assessSkills,usesChatGPTPlan,chatGPTStatus,chatGPTModels} from './lib/ai.mjs';
import {createAccess} from './lib/access.mjs';
import {recommendationFor,selectRecommendations} from './lib/recommendations.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
if(existsSync(path.join(root,'.env'))) process.loadEnvFile(path.join(root,'.env'));
process.umask(0o077);
const dbPath=process.env.SES_DB || path.join(root,'data','ses.sqlite');
mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
const db=new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE INDEX IF NOT EXISTS records_kind ON records(kind); CREATE TABLE IF NOT EXISTS evaluations (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, person_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);`);
const list=kind=>db.prepare('SELECT body FROM records WHERE kind=? ORDER BY updated_at DESC').all(kind).map(r=>JSON.parse(r.body));
const get=(kind,id)=>{const r=db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.body):null;};
const write=(kind,input,id=randomUUID())=>{const now=new Date().toISOString();const old=get(kind,id);const record={...validate(kind,input),id,createdAt:old?.createdAt || now,updatedAt:now};db.prepare('INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at').run(id,kind,JSON.stringify(record),now);return record;};
const bad=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>150000)bad('入力が長すぎます',413);}try{return JSON.parse(text || '{}');}catch{bad('JSON形式が不正です');}}
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const port=Number(process.env.PORT || 4317);
const access=createAccess(process.env,port);
const server=http.createServer(async(req,res)=>{
  try{
    const denied=access(req,res);if(denied)return json(res,{error:denied.message},denied.status);
    const url=new URL(req.url,`http://127.0.0.1:${port}`);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    if(url.pathname==='/api/state' && req.method==='GET')return json(res,{jobs:list('jobs'),people:list('people'),aiConfigured:aiConfigured(),aiProvider:usesChatGPTPlan()?'chatgpt_plan':'legacy',chatGPT:usesChatGPTPlan()?chatGPTStatus():null,integrations:[{name:'LINE',state:'manual'},{name:'Gmail',state:'planned'},{name:'Google Drive',state:'planned'}]});
    if(url.pathname==='/api/chatgpt/models' && req.method==='GET') {
      if(!usesChatGPTPlan())bad('ChatGPT契約枠への接続を設定してください',409);
      return json(res,{models:await chatGPTModels()});
    }
    if(url.pathname==='/api/parse' && req.method==='POST'){const input=await body(req);if(typeof input.raw!=='string' || !input.raw.trim())bad('案件本文を貼り付けてください');const parsed=parseLine(input.raw);const duplicate=list('jobs').find(j=>j.raw?.normalize('NFKC').trim()===input.raw.normalize('NFKC').trim());return json(res,{draft:parsed,duplicateId:duplicate?.id || null,warnings:['ラベル形式の項目だけを抽出しています。登録前に本文と照合してください。','年月のみの開始時期、商流、精算、出社条件などは手動確認が必要です。']});}
    const recordRoute=url.pathname.match(/^\/api\/(jobs|people)(?:\/([^/]+))?$/);
    if(recordRoute){const [,kind,id]=recordRoute;
      if(req.method==='GET')return json(res,id?get(kind,id) || bad('見つかりません',404):list(kind));
      if(req.method==='POST' && !id){const input=await body(req);if(kind==='jobs' && input.raw && list(kind).some(j=>j.raw?.normalize('NFKC').trim()===input.raw.normalize('NFKC').trim() && (j.position||'')===(input.position||'')))bad('同じ案件本文が登録されています',409);return json(res,write(kind,input),201);}
      if(req.method==='PUT' && id){if(!get(kind,id))bad('見つかりません',404);return json(res,write(kind,await body(req),id));}
      if(req.method==='DELETE' && id){if(!get(kind,id))bad('見つかりません',404);db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id);return json(res,{ok:true});}
    }
    if(url.pathname==='/api/match' && req.method==='POST'){
      const input=await body(req);if(input.useAi!==undefined && typeof input.useAi!=='boolean')bad('AI指定が不正です');
      if(input.useAi && usesChatGPTPlan() && (typeof input.model!=='string' || !input.model || input.model.length>200))bad('ChatGPTモデルを選択してください');
      const people=input.personId?[get('people',input.personId)]:list('people');const jobs=input.jobId?[get('jobs',input.jobId)]:list('jobs');
      if(people.some(p=>!p)||jobs.some(j=>!j))bad('案件／要員が見つかりません',404);
      if(input.useAi && jobs.length*people.length>10)bad('AI評価は一度に10組まで。案件・要員を絞り込んでください');
      const results=[];
      for(const j of jobs)for(const p of people){const result=match(j,p,new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'}));result.jobName=j.title;result.personName=p.name;
        if(input.useAi){try{result.ai=await assessSkills(j,p,result,{model:input.model});}catch{result.ai={state:'failed',message:usesChatGPTPlan()?'ChatGPTの利用枠・接続状態を確認してください。ルール判定は表示できます。':'AI評価に失敗しました。ルール判定は表示できます。再実行してください。'};}}
        else result.ai={state:'not_requested',message:aiConfigured()?'ルール判定のみ（AI評価を選択して再実行できます）':'AI未接続・営業ルールによる判定'};
        result.recommendation=recommendationFor(result);
        result.fingerprint=createHash('sha256').update(JSON.stringify([j,p])).digest('hex');
        db.prepare('INSERT INTO evaluations VALUES (?,?,?,?,?)').run(randomUUID(),j.id,p.id,JSON.stringify(result),result.evaluatedAt);results.push(result);
      }
      const order={'問題なし':0,'要確認':1,'懸念あり':2,'対象外':3};results.sort((a,b)=>order[a.status]-order[b.status] || b.score-a.score);return json(res,{results,recommendations:selectRecommendations(results)});
    }
    if(url.pathname==='/api/history' && req.method==='GET')return json(res,db.prepare('SELECT body FROM evaluations ORDER BY created_at DESC LIMIT 50').all().map(r=>JSON.parse(r.body)));
    if(url.pathname.startsWith('/api/'))bad('該当する操作はありません',404);
    if(req.method!=='GET')bad('許可されていない操作です',405);
    const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
    const file=files[url.pathname];if(!file)bad('ページが見つかりません',404);
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.writeHead(200,{'Content-Type':({'html':'text/html','js':'text/javascript','css':'text/css','svg':'image/svg+xml'}[file.split('.').pop()])+'; charset=utf-8'});res.end(readFileSync(path.join(root,'public',file)));
  }catch(e){json(res,{error:e.status?e.message:'保存・読み込みに失敗しました。入力を保持して再試行してください。'},e.status || 500);if(!e.status)console.error('SES MATCH request failed');}
});
server.requestTimeout=30000;
server.headersTimeout=10000;
server.listen(port,'127.0.0.1',()=>console.log(`SES MATCH ready: http://127.0.0.1:${port}`));
