import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const port=4318;
const origin=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),SES_DB:path.join(root,'data','demo.sqlite'),SES_PUBLIC_ORIGIN:'',SES_AI_MODE:'chatgpt',AI_ENDPOINT:'',AI_API_KEY:'',AI_MODEL:''},stdio:['ignore','pipe','inherit']});
let stopping=false;
function stop(){if(!stopping){stopping=true;child.kill();}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
child.on('exit',code=>{process.exitCode=code || 0;});
async function call(route,method='GET',value){
  const res=await fetch(origin+route,{method,headers:method==='GET'?{}:{'Content-Type':'application/json',Origin:origin},body:value===undefined?undefined:JSON.stringify(value)});
  if(!res.ok)throw new Error('テストデータの登録を完了できません');return res.json();
}
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('起動が時間切れです')),10000);child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(new Error('起動できません。すでに起動しているテスト画面があれば閉じてください'));});child.stdout.on('data',data=>{if(String(data).includes('SES MATCH ready')){clearTimeout(timer);resolve();}});});
  const state=await call('/api/state');
  if(!state.jobs.length && !state.people.length) {
    const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
    const start=today.slice(0,7)+'-01';
    const person={name:'架空テスト要員A',salesStatus:'open',nationality:'中国',contract:'freelance',tiers:0,age:30,station:'架空の最寄駅',onsite:'yes',maxCommute:75,rateMin:65,available:start,skills:['Java','SQL'],phases:['詳細設計','実装','単体テスト'],experiences:[{kind:'commercial',start:'2022-01-01',end:start,skills:['Java','SQL'],phases:['詳細設計','実装','単体テスト'],role:'Webアプリ実装',evidence:'架空のテスト経歴No.1：JavaとSQLを用いたECシステムの設計、実装、単体テストを担当。実在する人物の経歴ではありません。'}],pr:'すべて架空の動作確認用データです。',notes:'営業利用・実在要員への提案禁止。'};
    await call('/api/people','POST',person);
    const base={status:'open',receivedAt:today,source:'demo',sourceText:'架空の動作確認用案件。営業利用禁止。',foreignAllowed:'yes',freelanceAllowed:'yes',employeeOnly:'no',maxTiers:1,maxAge:50,workMode:'remote',visitRequired:'no',rateMax:70,start,requirements:[{skill:'Java',months:36}],phases:['詳細設計','実装'],role:'Java Webアプリの設計・実装',notes:'実在しないテスト案件です。'};
    for(const job of [{...base,title:'架空案件1：Java経験が合う案件'},{...base,title:'架空案件2：外国籍不可（対象外の確認）',foreignAllowed:'no'},{...base,title:'架空案件3：個人事業主不可（対象外の確認）',freelanceAllowed:'no'}])await call('/api/jobs','POST',job);
  }
  console.log('架空案件3件・架空要員1名の確認画面を準備しました。');
  console.log('画面で「マッチング」→モデルを選択→「AI評価を追加」→実行してください。');
  console.log('案件2・3は対象外、案件1はAI所見が表示される想定です。');
  console.log('画面を使う間、このウィンドウは開いたままにしてください。終了はCtrl+Cです。');
  console.log(origin);
  if(process.env.SES_SKIP_BROWSER!=='1') {
    const [command,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',origin]]:process.platform==='darwin'?['open',[origin]]:['xdg-open',[origin]];
    const browser=spawn(command,args,{shell:false,stdio:'ignore',detached:true});browser.on('error',()=>console.log('上のURLをブラウザで開いてください。'));browser.unref();
  }
}catch {console.error('テスト画面を起動できませんでした。画面を共有してください。認証情報は共有しないでください。');stop();process.exitCode=1;}
