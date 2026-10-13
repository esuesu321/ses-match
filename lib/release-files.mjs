import path from 'node:path';
// Only known source file types are distributed. Runtime/private files fail closed.
export function isReleaseFile(file){
 const normalized=file.replaceAll('\\','/');const parts=normalized.split('/');
 if(parts.some(p=>!p || p==='..' || p.startsWith('.') || p==='node_modules'))return false;
 if(['package.json','package-lock.json','server.mjs'].includes(normalized))return true;
 const [directory]=parts,ext=path.posix.extname(normalized);
 if(['lib','scripts','tests'].includes(directory))return ext==='.mjs';
 if(directory==='public')return ['.js','.css','.html','.svg'].includes(ext);
 if(directory==='deploy')return ext==='.sh' || ext==='.service' || normalized==='deploy/Caddyfile';
 return false;
}
