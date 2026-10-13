import {mkdirSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function prepareServer(host,output){
 if(typeof host!=='string' || host.length>253 || !host.includes('.') || host.split('.').some(label=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))throw Error('A valid hostname without a URL, port or path is required');
 if(!output)throw Error('A new private output directory is required');
 const target=path.resolve(output);
 // Refuse an existing destination, so no credentials can be silently replaced.
 mkdirSync(target,{mode:0o700});
 const password=randomBytes(32).toString('base64url');
 const env=`PORT=4317\nSES_PUBLIC_ORIGIN=https://${host.toLowerCase()}\nSES_AUTH_USER=owner\nSES_AUTH_PASSWORD=${password}\nSES_AI_MODE=chatgpt\nSES_DB=/var/lib/ses-match/ses.sqlite\nSES_CHATGPT_DIR=/var/lib/ses-match/chatgpt\nAI_ENDPOINT=\nAI_API_KEY=\nAI_MODEL=\n`;
 writeFileSync(path.join(target,'app.env'),env,{mode:0o600,flag:'wx'});
 writeFileSync(path.join(target,'backup.key'),randomBytes(32),{mode:0o600,flag:'wx'});
 writeFileSync(path.join(target,'caddy.env'),`SES_DOMAIN=${host.toLowerCase()}\n`,{mode:0o600,flag:'wx'});
 return target;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.umask(0o077);const target=prepareServer(process.argv[2],process.argv[3]);console.log('Private server configuration prepared: '+target);console.log('Keep these files off GitHub and out of chat. Copy over SSH only.');}catch{console.error('Configuration not prepared. Use a valid hostname and a new output directory.');process.exitCode=1;}
}
