import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,chmodSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {createRemoteJWKSet,jwtVerify} from 'jose';

const issuer='https://auth.openai.com';
const tokenEndpoint=issuer+'/api/accounts/oauth/token';
const resource='https://api.openai.com/v1';
const requiredScope='chatgpt.tokens.use.direct';
const jwks=createRemoteJWKSet(new URL(issuer+'/.well-known/jwks.json'));
export const credentialDir=()=>path.resolve(process.env.SES_CHATGPT_DIR || path.join(homedir(),'.config','ses-match','chatgpt'));
function readProtected(file) {
  if(!existsSync(file))return null;
  const stat=lstatSync(file);
  if(!stat.isFile() || stat.isSymbolicLink() || (process.platform!=='win32' && (stat.mode & 0o077)))throw new Error('ChatGPT認証ファイルの権限を確認してください');
  return JSON.parse(readFileSync(file,'utf8'));
}
function saveProtected(file,value) {
  const dir=path.dirname(file);mkdirSync(dir,{recursive:true,mode:0o700});
  if(lstatSync(dir).isSymbolicLink())throw new Error('認証保存先を確認してください');
  chmodSync(dir,0o700);
  const temp=path.join(dir,'.tmp-'+randomUUID());
  writeFileSync(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});
  renameSync(temp,file);
}
export function prepareHost(dir=credentialDir()) {
  const file=path.join(dir,'host.json');const existing=readProtected(file);
  if(existing?.ext_agent_host_id)return existing.ext_agent_host_id;
  const ext_agent_host_id='urn:uuid:'+randomUUID();saveProtected(file,{ext_agent_host_id});return ext_agent_host_id;
}
export async function verifyIdentity(token,clientId,nonce,verifyKey=jwks) {
  const {payload}=await jwtVerify(token,verifyKey,{issuer,audience:clientId,requiredClaims:['sub','exp','iat'],clockTolerance:5});
  if(typeof payload.sub!=='string' || !payload.sub || payload.nonce!==nonce)throw new Error('ChatGPTの本人確認を検証できません');
  return payload;
}
async function tokenRequest(params,request=fetch) {
  const response=await request(tokenEndpoint,{method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('ChatGPT認証の更新が必要です');
  const data=await response.json();
  if(typeof data.access_token!=='string' || data.token_type?.toLowerCase()!=='bearer' || !Number.isFinite(data.expires_in) || data.expires_in<=0)throw new Error('ChatGPT認証の応答を検証できません');
  return data;
}
export function authorizationUrl({clientId,hostId,state,nonce,verifier,redirectUri}) {
  const url=new URL(issuer+'/api/accounts/authorize');
  const params={client_id:clientId || 'dynamic_agent_client',ext_agent_host_id:hostId,response_type:'code',redirect_uri:redirectUri,scope:'openid profile email offline_access resource.invoke '+requiredScope,resource,state,nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')};
  if(!clientId)params.agent_name_hint='SES MATCH';
  url.search=new URLSearchParams(params).toString();return url.href;
}
export function callbackRegistration(url,{state,clientId}) {
  const params=url.searchParams;
  if(params.getAll('state').length!==1 || params.get('state')!==state)throw new Error('認証の状態が一致しません');
  if(params.has('error'))throw new Error('ChatGPT接続が許可されませんでした');
  const issued=params.get('client_id') || clientId;
  if(!issued || issued==='dynamic_agent_client' || (clientId && issued!==clientId) || params.getAll('code').length!==1 || !params.get('code'))throw new Error('ChatGPTの登録を確認できません');
  return {clientId:issued,code:params.get('code')};
}
export async function signIn(onUrl,dir=credentialDir()) {
  const hostId=prepareHost(dir);const file=path.join(dir,'connection.json');const old=readProtected(file);
  const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(64).toString('base64url');
  let active=true,resolveCallback,rejectCallback;
  const callback=new Promise((resolve,reject)=>{resolveCallback=resolve;rejectCallback=reject;});
  const listener=createServer((req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Type','text/plain; charset=utf-8');
    if(req.method!=='GET' || url.pathname!=='/auth/callback' || !active) {res.writeHead(404);res.end();return;}
    try {
      const result=callbackRegistration(url,{state,clientId:old?.client_id});
      active=false;resolveCallback(result);res.end('SES MATCHへ接続を戻しました。この画面を閉じてください。');
    }catch(error) {if(url.searchParams.get('state')===state && url.searchParams.has('error')) {active=false;rejectCallback(error);}res.writeHead(400);res.end('認証の状態を確認できません。元の認証画面からやり直してください。');}
  });
  await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',resolve);});
  const redirectUri=`http://127.0.0.1:${listener.address().port}/auth/callback`;
  const timeout=setTimeout(()=>rejectCallback(new Error('ChatGPT接続が時間切れになりました')),600000);
  try {
    onUrl(authorizationUrl({clientId:old?.client_id,hostId,state,nonce,verifier,redirectUri}));
    const registration=await callback;
    // Preserve the issued registration if the short-lived authorization code expires.
    if(!old)saveProtected(file,{client_id:registration.clientId});
    const data=await tokenRequest(new URLSearchParams({grant_type:'authorization_code',client_id:registration.clientId,code:registration.code,code_verifier:verifier,redirect_uri:redirectUri,resource}));
    const identity=await verifyIdentity(data.id_token,registration.clientId,nonce);
    if(old?.subject && old.subject!==identity.sub)throw new Error('以前と異なるChatGPTアカウントです');
    const record={...data,client_id:registration.clientId,issuer:identity.iss,subject:identity.sub,email:identity.email || '',ext_agent_host_id:hostId,scopes:String(data.scope || '').split(/\s+/),saved_at:new Date().toISOString(),expires_at:Date.now()+data.expires_in*1000};
    saveProtected(file,record);
    return {connected:true,sharing:record.scopes.includes(requiredScope)};
  }finally {clearTimeout(timeout);active=false;listener.close();listener.closeAllConnections();}
}
export async function readCompletedText(response) {
  if(!response.ok || !response.body)throw new Error('ChatGPTの応答を取得できません');
  let buffer='',text='',completed=false,total=0;const decoder=new TextDecoder();
  const handle=frame=>{
    const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data || data==='[DONE]')return;
    const event=JSON.parse(data);
    if(['response.failed','response.incomplete','error'].includes(event.type))throw new Error('ChatGPTの利用枠または接続状態を確認してください');
    if(event.type==='response.output_text.delta')text+=event.delta || '';
    if(event.type==='response.completed')completed=true;
  };
  for await(const chunk of response.body) {
    total+=chunk.length;if(total>2000000)throw new Error('ChatGPTの応答が長すぎます');
    buffer+=decoder.decode(chunk,{stream:true});
    let boundary;while((boundary=buffer.match(/\r?\n\r?\n/))) {const idx=boundary.index;handle(buffer.slice(0,idx));buffer=buffer.slice(idx+boundary[0].length);}
  }
  buffer+=decoder.decode();if(buffer.trim())handle(buffer);
  if(!completed || !text.trim())throw new Error('ChatGPTの処理完了を確認できません');
  return text;
}
export function createPlanClient({dir=credentialDir(),request=fetch}={}) {
  const file=path.join(dir,'connection.json');let refreshing;
  const read=()=>readProtected(file);
  function status() {
    try {const saved=read();return {connected:Boolean(saved?.access_token),sharing:Boolean(saved?.access_token && saved.scopes?.includes(requiredScope))};}
    catch {return {connected:false,sharing:false};}
  }
  async function accessToken() {
    let record=read();if(!record?.access_token || !record.scopes?.includes(requiredScope))throw new Error('ChatGPT契約枠への接続が必要です');
    if(record.expires_at>Date.now()+60000)return record.access_token;
    if(!refreshing)refreshing=(async()=>{
      if(!record.refresh_token)throw new Error('ChatGPTの再接続が必要です');
      const data=await tokenRequest(new URLSearchParams({grant_type:'refresh_token',client_id:record.client_id,refresh_token:record.refresh_token,resource}),request);
      const scopes=data.scope===undefined?record.scopes:String(data.scope).split(/\s+/);
      if(!scopes.includes(requiredScope))throw new Error('ChatGPT契約枠の利用許可が必要です');
      record={...record,...data,refresh_token:data.refresh_token || record.refresh_token,scopes,expires_at:Date.now()+data.expires_in*1000,saved_at:new Date().toISOString()};
      saveProtected(file,record);return record.access_token;
    })().finally(()=>{refreshing=undefined;});
    return refreshing;
  }
  async function models() {
    const token=await accessToken();const res=await request(resource+'/models',{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(30000)});
    if(!res.ok)throw new Error('ChatGPTの利用可能モデルを確認できません');
    const value=await res.json();return (value.models || []).filter(m=>m.visibility==='list' && typeof m.slug==='string').map(m=>({slug:m.slug,displayName:m.display_name || m.slug}));
  }
  async function infer({model,input,instructions}) {
    const available=await models();if(!available.some(m=>m.slug===model))throw new Error('ChatGPTモデルを選択してください');
    const token=await accessToken();const res=await request(resource+'/responses',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({model,input,instructions,store:false,stream:true}),signal:AbortSignal.timeout(90000)});
    return readCompletedText(res);
  }
  return {status,models,infer};
}
