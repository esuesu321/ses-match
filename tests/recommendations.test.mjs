import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationFor,selectRecommendations} from '../lib/recommendations.mjs';
function item(name,status='要確認',extra=[]){const result={jobName:name,status,checks:[{key:'skill:Java',label:'Java',status:'問題なし',reason:'商用実務48か月／必須36か月'},{key:'phase:実装',label:'工程：実装',status:'問題なし',reason:'証跡あり'},...extra]};result.recommendation=recommendationFor(result);return result;}
test('explicit exclusions never become recommendations, even with matching skills',()=>{
  assert.deepEqual(selectRecommendations([item('NG','対象外')]),[]);
});
test('unverified skills or missing phases remain in all candidates but not recommendations',()=>{
  const r=item('unknown');r.checks[0].status='要確認';r.recommendation=recommendationFor(r);assert.equal(r.recommendation.eligible,false);
  assert.equal(recommendationFor({status:'要確認',checks:[{key:'skills',status:'要確認'}]}).eligible,false);
});
test('negotiation candidates stay eligible and keep their adjustment label',()=>{
  const r=item('rate','懸念あり',[{key:'rate',label:'単価',status:'懸念あり',reason:'5万円差'}]);assert.equal(selectRecommendations([r]).length,1);assert.equal(r.recommendation.label,'調整前提');
});
test('unknown contract restrictions lower priority without converting to an exclusion',()=>{
  const a=item('A','要確認',[{key:'contract',status:'要確認'}]);const b=item('B','要確認',[{key:'role',status:'要確認'}]);assert.deepEqual(selectRecommendations([a,b]).map(r=>r.jobName),['B','A']);assert.equal(a.status,'要確認');
});
test('recommendations are capped at five without filling up with unsuitable jobs',()=>{
  assert.equal(selectRecommendations([item('one'),item('NG','対象外')]).length,1);
  assert.equal(selectRecommendations(Array.from({length:9},(_,i)=>item(String(i))),50).length,5);
});
