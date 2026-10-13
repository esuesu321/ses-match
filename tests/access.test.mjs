import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccess} from '../lib/access.mjs';
const password='test-only-very-long-password-123456';
const env={SES_PUBLIC_ORIGIN:'https://ses.example.test',SES_AUTH_USER:'owner',SES_AUTH_PASSWORD:password};
function run(access,headers={},method='GET') {
  const set={};const res={setHeader:(k,v)=>set[k]=v};
  return {denied:access({headers,method},res),headers:set};
}
const good={host:'ses.example.test','x-forwarded-proto':'https',authorization:'Basic '+Buffer.from('owner:'+password).toString('base64')};
test('remote fails closed on missing credentials or invalid origin',()=>{
  assert.throws(()=>createAccess({SES_PUBLIC_ORIGIN:env.SES_PUBLIC_ORIGIN},4317));
  for(const origin of ['http://ses.example.test','https://ses.example.test/path','https://user@ses.example.test'])
    assert.throws(()=>createAccess({...env,SES_PUBLIC_ORIGIN:origin},4317));
});
test('remote requires HTTPS and authentication before serving any path',()=>{
  const a=createAccess(env,4317);
  assert.equal(run(a,{host:good.host}).denied.status,403);
  assert.equal(run(a,{host:good.host,'x-forwarded-proto':'https'}).denied.status,401);
  assert.equal(run(a,{...good,authorization:'Basic wrong'}).denied.status,401);
  assert.equal(run(a,{...good,host:'attacker.test'}).denied.status,403);
  assert.equal(run(a,good).denied,null);
  assert.equal(run(a,good).headers['Cache-Control'],'no-store');
});
test('remote blocks cross-origin writes and non-JSON requests',()=>{
  const a=createAccess(env,4317);
  assert.equal(run(a,{...good,origin:'https://attacker.test','content-type':'application/json'},'POST').denied.status,403);
  assert.equal(run(a,{...good,origin:env.SES_PUBLIC_ORIGIN,'content-type':'text/plain'},'POST').denied.status,415);
  assert.equal(run(a,{...good,origin:env.SES_PUBLIC_ORIGIN,'content-type':'application/json'},'POST').denied,null);
});
test('failed authentication is rate limited',()=>{
  const a=createAccess(env,4317);const h={...good,authorization:''};
  for(let i=0;i<20;i++)assert.equal(run(a,h).denied.status,401);
  assert.equal(run(a,h).denied.status,429);
});
test('local mode keeps loopback host and origin restrictions',()=>{
  const a=createAccess({},4317);
  assert.equal(run(a,{host:'127.0.0.1:4317'}).denied,null);
  assert.equal(run(a,{host:'attacker.test'}).denied.status,403);
  assert.equal(run(a,{host:'127.0.0.1:4317',origin:'https://attacker.test','content-type':'application/json'},'POST').denied.status,403);
});
