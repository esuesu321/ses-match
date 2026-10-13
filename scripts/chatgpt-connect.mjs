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
  console.log('確認1/2：利用可能なChatGPTモデルを取得します。');
  const client=createPlanClient();const available=await client.models();const model=available.find(m=>m.slug==='gpt-6.1-sol') || available.find(m=>m.slug==='gpt-6-sol') || available[0];if(!model)throw new Error('利用できるモデルがありません');
  console.log('使用モデル：'+model.slug);console.log('確認2/2：架空の短文でAI応答の完了を確認します。');
  const result=await client.infer({model:model.slug,input:'Reply with exactly: Token sharing works.'});
  if(!result.trim())throw new Error('接続テストの応答を確認できません');
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
}catch(error) {
  console.error('ChatGPT接続を完了できませんでした。');
  if(error.safeDiagnostic) {console.error('失敗箇所：'+error.safeDiagnostic.stage);if(error.safeDiagnostic.eventType)console.error('Event type: '+error.safeDiagnostic.eventType);if(error.safeDiagnostic.httpStatus)console.error('HTTP status: '+error.safeDiagnostic.httpStatus);if(error.safeDiagnostic.code)console.error('Error code: '+error.safeDiagnostic.code);}
  else console.error('通信・認証ファイル・保存先を確認してください。');
  console.error('認証情報は表示していません。上の失敗箇所とHTTP statusだけを共有してください。');process.exitCode=1;
}
