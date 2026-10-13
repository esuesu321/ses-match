import {signIn,prepareHost,createPlanClient} from '../lib/chatgpt.mjs';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const envFile=fileURLToPath(new URL('../.env',import.meta.url));
if(existsSync(envFile))process.loadEnvFile(envFile);
const action=process.argv[2];
try {
  if(action==='prepare-host') {prepareHost();console.log('このサーバー専用の接続識別子を準備しました。');}
  else if(action==='verify') {
    const client=createPlanClient();const [model]=await client.models();if(!model)throw new Error('利用できるモデルがありません');
    const result=await client.infer({model:model.slug,input:'Reply with exactly: Token sharing works.'});
    if(result.trim()!=='Token sharing works.')throw new Error('接続テストの応答を確認できません');
    console.log('ChatGPT契約枠での応答を確認しました。');
  }else {
    console.log('このコマンドを実行したPCのブラウザで、次のURLを開いてください。');
    const status=await signIn(url=>console.log(url));
    console.log(status.sharing?'ChatGPT契約枠の利用許可を確認しました。':'本人認証のみ完了。契約枠の利用は許可されていません。');
  }
}catch {console.error('ChatGPT接続を完了できませんでした。認証または利用枠を確認してください。認証情報をチャットへ貼り付けないでください。');process.exitCode=1;}
