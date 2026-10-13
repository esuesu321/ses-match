import http from 'node:http';
// Reads secrets locally without command-line arguments or logging them.
try{
process.loadEnvFile(process.argv[2] || '/etc/ses-match/app.env');
const origin=new URL(process.env.SES_PUBLIC_ORIGIN),password=process.env.SES_AUTH_PASSWORD;
if(origin.protocol!=='https:' || !password || !process.env.SES_AUTH_USER)throw Error('Remote access configuration missing');
const options={hostname:'127.0.0.1',port:Number(process.env.PORT || 4317),path:'/api/health',headers:{Host:origin.host,'X-Forwarded-Proto':'https',Authorization:'Basic '+Buffer.from(process.env.SES_AUTH_USER+':'+password).toString('base64')}};
const probe=opts=>new Promise((resolve,reject)=>{const req=http.get(opts,res=>{let text='';res.on('data',chunk=>{text+=chunk.toString();if(text.length>4096)req.destroy(Error('Response limit'));});res.on('end',()=>resolve({status:res.statusCode,text}));res.on('error',reject);});req.setTimeout(5000,()=>req.destroy(Error('Health timeout')));req.on('error',reject);});
const authenticated=await probe(options);if(authenticated.status!==200 || JSON.parse(authenticated.text).ok!==true)throw Error('Authenticated access failed');const headers={...options.headers};delete headers.Authorization;if((await probe({...options,headers})).status!==401)throw Error('Unauthenticated access not rejected');console.log('Authenticated access and authentication protection verified');}catch{console.error('Server verification failed');process.exitCode=1;}
