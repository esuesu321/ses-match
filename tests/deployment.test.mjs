import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,chmodSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {encrypt,decrypt} from '../scripts/encrypted-backup.mjs';
const root=path.resolve(new URL('..',import.meta.url).pathname);
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
