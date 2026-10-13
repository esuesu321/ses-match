import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,chmodSync,readdirSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {prepareServer} from '../scripts/prepare-server.mjs';
import {isReleaseFile} from '../lib/release-files.mjs';
import {encrypt,decrypt} from '../scripts/encrypted-backup.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('暗号化バックアップ: 復号、改ざん・別鍵の拒否',()=>{const key=randomBytes(32),data=Buffer.from('架空の登録情報');const sealed=encrypt(data,key);assert.ok(!sealed.includes(data));assert.deepEqual(decrypt(sealed,key),data);const changed=Buffer.from(sealed);changed[20]^=1;assert.throws(()=>decrypt(changed,key));assert.throws(()=>decrypt(sealed,randomBytes(32)));});
test('SQLiteバックアップ: WAL内の登録も含み、復元したDBを照合',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ses-deploy-test-'));let db;
 try{const database=path.join(dir,'data.sqlite'),keyFile=path.join(dir,'key'),out=path.join(dir,'backup.sesb'),restored=path.join(dir,'restored.sqlite'),key=randomBytes(32);writeFileSync(keyFile,key,{mode:0o600});db=new DatabaseSync(database);db.exec("PRAGMA journal_mode=WAL;CREATE TABLE records(body TEXT);INSERT INTO records VALUES ('架空案件');");
 const r=spawnSync(process.execPath,['scripts/encrypted-backup.mjs',database,keyFile,out],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.ok(!r.stdout.includes('架空案件'));writeFileSync(restored,decrypt(readFileSync(out),key));const copy=new DatabaseSync(restored);try{assert.equal(copy.prepare('SELECT body FROM records').get().body,'架空案件');assert.equal(copy.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{copy.close();}
 chmodSync(keyFile,0o644);assert.notEqual(spawnSync(process.execPath,['scripts/encrypted-backup.mjs',database,keyFile,path.join(dir,'unsafe')],{cwd:root}).status,0);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
test('リリース: 許可したコードだけを梱包し、個人情報・認証・DBを含めない',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ses-release-test-'));try{const out=path.join(dir,'release.tar.gz');const r=spawnSync(process.execPath,['scripts/build-release.mjs',out],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);const names=spawnSync('tar',['-tzf',out],{encoding:'utf8'}).stdout.split('\n');assert.ok(names.includes('./release.json'));assert.ok(names.includes('./server.mjs'));for(const name of names)assert.ok(!/\.env|connection\.json|host\.json|\.sqlite|project_sources|node_modules|\/data\//.test(name),name);}finally{rmSync(dir,{recursive:true,force:true});}
});

test('復元コマンド: 新DBへ復元、既存DB・誤った鍵・壊れたバックアップは上書きしない',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ses-restore-cli-'));
 try{const key=randomBytes(32),keyFile=path.join(dir,'key'),source=path.join(dir,'source.sqlite'),backup=path.join(dir,'backup.sesb'),out=path.join(dir,'restored.sqlite');writeFileSync(keyFile,key,{mode:0o600});const db=new DatabaseSync(source);db.exec("CREATE TABLE records(body TEXT); INSERT INTO records VALUES ('架空復元案件');");db.close();writeFileSync(backup,encrypt(readFileSync(source),key));
 const restore=()=>spawnSync(process.execPath,['scripts/restore-backup.mjs',backup,keyFile,out],{cwd:root,encoding:'utf8'});
 const first=restore();assert.equal(first.status,0,first.stderr);const restored=new DatabaseSync(out);try{assert.equal(restored.prepare('SELECT body FROM records').get().body,'架空復元案件');}finally{restored.close();}
 const bytes=readFileSync(out);assert.notEqual(restore().status,0);assert.deepEqual(readFileSync(out),bytes);
 rmSync(out);writeFileSync(keyFile,randomBytes(32));assert.notEqual(restore().status,0);assert.ok(!readdirSync(dir).includes('restored.sqlite'));
 writeFileSync(keyFile,key);writeFileSync(backup,encrypt(Buffer.from('not a database'),key));assert.notEqual(restore().status,0);assert.ok(!readdirSync(dir).includes('restored.sqlite'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('リリース対象: ソース下に混入した認証・添付・DB・隠しファイルも拒否',()=>{for(const file of ['lib/connection.json','public/private.pdf','scripts/.env','tests/data.sqlite','lib/node_modules/index.mjs','../server.mjs','deploy/backup.key'])assert.equal(isReleaseFile(file),false,file);for(const file of ['lib/release-files.mjs','public/app.js','deploy/update.sh','deploy/Caddyfile'])assert.equal(isReleaseFile(file),true,file);});

test('サーバー設定準備: 独立した認証・暗号鍵、保護された保存先、既存設定の上書き拒否',()=>{const dir=mkdtempSync(path.join(tmpdir(),'ses-config-'));try{const a=prepareServer('ses.example.test',path.join(dir,'a')),b=prepareServer('ses.example.test',path.join(dir,'b'));const env=readFileSync(path.join(a,'app.env'),'utf8');assert.ok(env.includes('SES_AI_MODE=chatgpt'));assert.ok(env.includes('AI_API_KEY=\n'));assert.match(env,/SES_AUTH_PASSWORD=[A-Za-z0-9_-]{43}/);assert.notEqual(env,readFileSync(path.join(b,'app.env'),'utf8'));assert.equal(readFileSync(path.join(a,'backup.key')).length,32);if(process.platform!=='win32'){assert.equal(statSync(a).mode&0o777,0o700);assert.equal(statSync(path.join(a,'app.env')).mode&0o777,0o600);}assert.throws(()=>prepareServer('ses.example.test',a));assert.equal(readFileSync(path.join(a,'app.env'),'utf8'),env);for(const invalid of ['https://ses.example.test','evil.test;command','../outside','foo.test:443','foo.test/path','{$SECRET}.test'])assert.throws(()=>prepareServer(invalid,path.join(dir,'bad')));}finally{rmSync(dir,{recursive:true,force:true});}});
