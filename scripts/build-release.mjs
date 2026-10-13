import {readFileSync,readdirSync,lstatSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.resolve(process.argv[2] || path.join(root,'dist','ses-match-release.tar.gz'));
const temp=mkdtempSync(path.join(tmpdir(),'ses-release-'));
const files=['package.json','package-lock.json','server.mjs'];
for(const dir of ['lib','public','scripts','tests','deploy']){
 const walk=d=>{for(const name of readdirSync(path.join(root,d))){const p=path.join(d,name),st=lstatSync(path.join(root,p));if(st.isSymbolicLink())throw new Error('Release cannot contain links');if(st.isDirectory())walk(p);else if(st.isFile())files.push(p);}};walk(dir);
}
try{
 const hashes={};for(const file of files){const bytes=readFileSync(path.join(root,file));hashes[file]=createHash('sha256').update(bytes).digest('hex');mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});writeFileSync(path.join(temp,file),bytes);}
 writeFileSync(path.join(temp,'release.json'),JSON.stringify({format:1,createdAt:new Date().toISOString(),files:hashes},null,2));
 mkdirSync(path.dirname(target),{recursive:true});const result=spawnSync('tar',['-czf',target,'-C',temp,'.'],{stdio:'inherit'});if(result.status!==0)throw new Error('Archive creation failed');console.log('Release prepared: '+target);
}finally{rmSync(temp,{recursive:true,force:true});}
