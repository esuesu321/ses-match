import {signIn,prepareHost,createPlanClient} from '../lib/chatgpt.mjs';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const envFile=fileURLToPath(new URL('../.env',import.meta.url));
if(existsSync(envFile))process.loadEnvFile(envFile);
const action=process.argv[2];
function openBrowser(url) {
  console.log(url);
  const [command,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
  const browserProcess=spawn(command,args,{shell:false,stdio:'ignore',detached:true});
  browserProcess.on('error',()=>console.log('ブラウザが開かない場合は、表示されたURLを同じPCで開いてください。'));
  browserProcess.unref();
}
async function verifyConnection() {
  const client=createPlanClient();const [model]=await client.models();if(!model)throw new Error('利用できるモデルがありません');
  const result=await client.infer({model:model.slug,input:'Reply with exactly: Token sharing works.'});
  if(result.trim()!=='Token sharing works.')throw new Error('接続テストの応答を確認できません');
  console.log('ChatGPT契約枠での応答を確認しました。');
}
try {
  if(action==='prepare-host') {prepareHost();console.log('このサーバー専用の接続識別子を準備しました。');}
  else if(action==='verify') {
    await verifyConnection();
  }else {
    console.log('このコマンドを実行したPCのブラウザで、次のURLを開いてください。');
    const status=await signIn(openBrowser);
    console.log(status.sharing?'ChatGPT契約枠の利用許可を確認しました。':'本人認証のみ完了。契約枠の利用は許可されていません。');
    if(action==='setup') {if(!status.sharing)throw new Error('契約枠の利用許可が必要です');await verifyConnection();}
  }
}catch {console.error('ChatGPT接続を完了できませんでした。認証または利用枠を確認してください。認証情報をチャットへ貼り付けないでください。');process.exitCode=1;}
