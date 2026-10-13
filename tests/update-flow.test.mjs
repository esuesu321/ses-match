import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url));
function fixture(mode='success'){
 const dir=mkdtempSync(path.join(tmpdir(),'ses-update-flow-')),bin=path.join(dir,'bin');
 for(const p of ['bin','etc/ses-match','opt/ses-match','var/lock','var/lib/ses-match'])mkdirSync(path.join(dir,p),{recursive:true});
 writeFileSync(path.join(dir,'etc/ses-match/app.env'),'SECRET=fixture-only-no-real-credentials\n');writeFileSync(path.join(dir,'opt/ses-match/old-version'),'old');
 const executable=(name,text)=>writeFileSync(path.join(bin,name),'#!/bin/bash\nset -eu\n'+text,{mode:0o755});
 executable('chown','exit 0\n'); // user ownership and systemd are simulated; production helpers stay unchanged.
 executable('runuser',`echo tests >> "$SES_DEPLOY_ROOT/steps"\n${mode==='test-fail'?'exit 1':'exit 0'}\n`);
 executable('systemctl','echo "$*" >> "$SES_DEPLOY_ROOT/steps"\nif [[ $1 == start && ${FLOW_MODE:-} == start-fail && ! -f "$SES_DEPLOY_ROOT/opt/ses-match/old-version" ]]; then exit 1; fi\n');
 executable('sleep','exit 0\n');
 executable('node-probe','if [[ $1 == */check-server.mjs ]]; then echo health >> "$SES_DEPLOY_ROOT/steps"; [[ ${FLOW_MODE:-} != health-fail ]]; else exec "$REAL_NODE" "$@"; fi\n');
 const archive=path.join(dir,'release.tar.gz');const build=spawnSync(process.execPath,['scripts/build-release.mjs',archive],{cwd:root,encoding:'utf8'});assert.equal(build.status,0,build.stderr);
 const env={...process.env,PATH:bin+':'+process.env.PATH,SES_DEPLOY_ROOT:dir,SES_DEPLOY_NODE:path.join(bin,'node-probe'),FLOW_MODE:mode,REAL_NODE:process.execPath};
 return {dir,archive,run:()=>spawnSync('bash',['deploy/update.sh',archive],{cwd:root,env,encoding:'utf8',timeout:20000})};
}
const rootOnly={skip:process.getuid?.()!==0?'Requires isolated root test environment':false};
test('更新フロー: 正常更新は旧版を残し、認証情報を出力しない',rootOnly,()=>{const f=fixture();try{const r=f.run();assert.equal(r.status,0,r.stderr);assert.ok(readFileSync(path.join(f.dir,'opt/ses-match/server.mjs'),'utf8').includes('createServer'));assert.ok(readdirSync(path.join(f.dir,'opt')).some(p=>p.endsWith('-previous')));assert.match(readFileSync(path.join(f.dir,'steps'),'utf8'),/tests\nstop ses-match\nstart ses-match\nhealth/);assert.ok(!r.stdout.includes('fixture-only'));}finally{rmSync(f.dir,{recursive:true,force:true});}});
for(const mode of ['health-fail','start-fail','test-fail'])test('更新フロー: '+mode+'でも旧版と設定を保つ',rootOnly,()=>{const f=fixture(mode);try{const r=f.run();assert.notEqual(r.status,0);assert.equal(readFileSync(path.join(f.dir,'opt/ses-match/old-version'),'utf8'),'old');assert.equal(readFileSync(path.join(f.dir,'etc/ses-match/app.env'),'utf8'),'SECRET=fixture-only-no-real-credentials\n');if(mode==='test-fail')assert.ok(!readFileSync(path.join(f.dir,'steps'),'utf8').includes('stop'));else assert.match(r.stdout,/Previous code restored/);}finally{rmSync(f.dir,{recursive:true,force:true});}});
test('更新フロー: 不正なアーカイブをサービス停止前に拒否',rootOnly,()=>{const f=fixture();try{writeFileSync(f.archive,'invalid archive');const r=f.run();assert.notEqual(r.status,0);assert.equal(readFileSync(path.join(f.dir,'opt/ses-match/old-version'),'utf8'),'old');assert.ok(!readdirSync(f.dir).includes('steps'));}finally{rmSync(f.dir,{recursive:true,force:true});}});
for(const mode of ['private-file','symlink','traversal','wrong-checksum'])test('更新フロー: '+mode+'を起動中の旧版に触れず拒否',rootOnly,()=>{
 const f=fixture();try{
 const alter=spawnSync('python3',['-c',`import tarfile,io,json,hashlib,sys
p,mode=sys.argv[1:];items=[]
with tarfile.open(p,'r:gz') as t:
 for m in t.getmembers():
  if m.isfile():items.append((m.name,t.extractfile(m).read()))
manifest=json.loads(next(data for name,data in items if name=='./release.json'))
if mode=='private-file':
 name='lib/connection.json';data=b'fixture-secret';items.append(('./'+name,data));manifest['files'][name]=hashlib.sha256(data).hexdigest()
if mode=='traversal':items.append(('../outside',b'unsafe'))
if mode=='wrong-checksum':items=[(n,b'changed' if n=='./server.mjs' else d) for n,d in items]
with tarfile.open(p,'w:gz') as t:
 for name,data in items:
  if name=='./release.json':data=json.dumps(manifest).encode()
  m=tarfile.TarInfo(name);m.size=len(data);t.addfile(m,io.BytesIO(data))
 if mode=='symlink':
  m=tarfile.TarInfo('./public/link');m.type=tarfile.SYMTYPE;m.linkname='/etc/passwd';t.addfile(m)
`,f.archive,mode],{encoding:'utf8'});assert.equal(alter.status,0,alter.stderr);
 const r=f.run();assert.notEqual(r.status,0);assert.equal(readFileSync(path.join(f.dir,'opt/ses-match/old-version'),'utf8'),'old');assert.ok(!readdirSync(f.dir).includes('steps'));
 }finally{rmSync(f.dir,{recursive:true,force:true});}
});
