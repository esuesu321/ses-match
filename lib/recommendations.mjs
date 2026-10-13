// Recommendations are a subset of all candidates. Unknown conditions stay visible.
// The rule score is not a hiring probability or an AI evaluation score.
export function recommendationFor(result) {
  const checks=result.checks || [];
  const skills=checks.filter(c=>c.key?.startsWith('skill:'));
  const phases=checks.filter(c=>c.key?.startsWith('phase:'));
  const eligible=result.status!=='対象外' && skills.length>0 && skills.every(c=>c.status==='問題なし') && phases.length>0 && phases.every(c=>c.status==='問題なし');
  const reasons=eligible?[
    ...skills.map(c=>`${c.label}：${c.reason}`),
    `担当工程：${phases.map(c=>c.label.replace(/^工程：/,'')).join('、')}の実務記録あり`,
    ...checks.filter(c=>['rate','commute'].includes(c.key) && c.status==='問題なし').map(c=>c.reason)
  ]:[];
  const pending=checks.filter(c=>c.status==='要確認');
  const concerns=checks.filter(c=>c.status==='懸念あり');
  const contractKeys=new Set(['salesStatus','nationality','contract','tiers','employment','age','commute','onsite','remote-visits']);
  return {eligible,reasons:reasons.slice(0,4),pendingCount:pending.length,concernCount:concerns.length,blockingUnknowns:pending.filter(c=>contractKeys.has(c.key)).length,label:concerns.length?'調整前提':pending.length?'確認前提':'優先提案候補',basis:'登録条件と証跡付き実務による優先順位'};
}
export function selectRecommendations(results,limit=5) {
  return results.filter(r=>r.recommendation?.eligible).slice().sort((a,b)=>{
    const x=a.recommendation,y=b.recommendation;
    return x.blockingUnknowns-y.blockingUnknowns || x.concernCount-y.concernCount || x.pendingCount-y.pendingCount || (b.ai?.state==='completed'?1:0)-(a.ai?.state==='completed'?1:0) || a.jobName.localeCompare(b.jobName,'ja');
  }).slice(0,Math.max(0,Math.min(limit,5)));
}
