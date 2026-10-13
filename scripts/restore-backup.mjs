import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {decrypt,readBackupKey} from './encrypted-backup.mjs';
// Writes a NEW database only. Switching the live service requires a separate step.
const [input,keyPath,output]=process.argv.slice(2);
if(!input||!keyPath||!output)throw Error('Usage: restore-backup.mjs BACKUP KEYFILE NEW_DATABASE');
process.umask(0o077);
const temp=mkdtempSync(path.join(tmpdir(),'ses-restore-'));
try{
 const bytes=decrypt(readFileSync(input),readBackupKey(keyPath)),testPath=path.join(temp,'restored.sqlite');
 writeFileSync(testPath,bytes,{mode:0o600});
 const db=new DatabaseSync(testPath,{readOnly:true});
 try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Restored database failed integrity check');if(!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records'").get())throw Error('Expected records table missing');}finally{db.close();}
 writeFileSync(output,bytes,{mode:0o600,flag:'wx'});
 console.log('Backup restored to a new database; live database was not changed');
}catch{console.error('Restore failed. Check backup, key and unused output path');process.exitCode=1;}finally{rmSync(temp,{recursive:true,force:true});}
