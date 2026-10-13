import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,lstatSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
export function encrypt(bytes,key){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([Buffer.from('SESB1'),iv,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);}
export function decrypt(bytes,key){if(bytes.subarray(0,5).toString()!=='SESB1'||bytes.length<33)throw Error('Invalid backup');const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(5,17));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(17,-16)),cipher.final()]);}
if(process.argv[1] && path.resolve(process.argv[1])===path.resolve(new URL(import.meta.url).pathname)){
 const [dbPath,keyPath,output]=process.argv.slice(2);if(!dbPath||!keyPath||!output)throw Error('Usage: encrypted-backup.mjs DATABASE KEYFILE OUTPUT');
 process.umask(0o077);const stat=lstatSync(keyPath);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Key file must be a private regular file');const key=readFileSync(keyPath);if(key.length!==32)throw Error('Key must contain exactly 32 bytes');
 const tmp=mkdtempSync(path.join(tmpdir(),'ses-backup-'));
 try{const snapshot=path.join(tmp,'snapshot.sqlite'),db=new DatabaseSync(dbPath,{readOnly:true});try{db.exec("VACUUM INTO '"+snapshot.replaceAll("'","''")+"'");}finally{db.close();}writeFileSync(output,encrypt(readFileSync(snapshot),key),{mode:0o600,flag:'wx'});console.log('Encrypted database snapshot saved');}finally{rmSync(tmp,{recursive:true,force:true});}
}
