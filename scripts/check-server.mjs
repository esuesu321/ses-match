import http from 'node:http';
// Reads secrets locally without command-line arguments or logging them.
process.loadEnvFile(process.argv[2] || '/etc/ses-match/app.env');
const origin=new URL(process.env.SES_PUBLIC_ORIGIN),password=process.env.SES_AUTH_PASSWORD;
if(origin.protocol!=='https:' || !password || !process.env.SES_AUTH_USER)throw Error('Remote access configuration missing');
const options={hostname:'127.0.0.1',port:4317,path:'/api/state',headers:{Host:origin.host,'X-Forwarded-Proto':'https',Authorization:'Basic '+Buffer.from(process.env.SES_AUTH_USER+':'+password).toString('base64')}};
const probe=opts=>new Promise((resolve,reject)=>{const req=http.get(opts,res=>{let bytes=0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>10000000)req.destroy(Error('Response limit'));});res.on('end',()=>resolve(res.statusCode));res.on('error',reject);});req.setTimeout(5000,()=>req.destroy(Error('Health timeout')));req.on('error',reject);});
try{if(await probe(options)!==200)throw Error('Authenticated access failed');const headers={...options.headers};delete headers.Authorization;if(await probe({...options,headers})!==401)throw Error('Unauthenticated access not rejected');console.log('Authenticated access and authentication protection verified');}catch{console.error('Server verification failed');process.exitCode=1;}
