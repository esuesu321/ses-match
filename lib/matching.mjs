export const RULE_VERSION = '2026-10-13.1';
const known = v => v !== null && v !== undefined && v !== '' && v !== 'unknown';
// 出典がある商用実務だけを算入し、期間の重複による二重計上を防ぎます。
export function commercialMonths(person, skill, today = new Date().toISOString().slice(0,10)) {
  const periods = (person.experiences || []).filter(e => e.kind === 'commercial' && e.datePrecision!=='source' && e.evidence?.trim() && e.skills?.some(s => s.toLowerCase() === skill.toLowerCase()) && e.start && e.start < today && (e.end || today) > e.start).map(e => ({start:e.start,end:e.end && e.end < today ? e.end : today})).sort((a,b) => a.start.localeCompare(b.start));
  const merged=[];
  for(const p of periods){const last=merged.at(-1); if(last && p.start <= last.end) last.end=last.end > p.end ? last.end : p.end; else merged.push({...p});}
  const calendarMonths=p=>{const s=new Date(p.start),e=new Date(p.end);let whole=(e.getUTCFullYear()-s.getUTCFullYear())*12+e.getUTCMonth()-s.getUTCMonth();if(e.getUTCDate()<s.getUTCDate())whole--;const anchor=new Date(s);anchor.setUTCMonth(anchor.getUTCMonth()+whole);return whole+(e-anchor)/(86400000*365.2425/12);};
  return Math.floor(merged.reduce((sum,p) => sum + calendarMonths(p),0));
}
export function match(job,person,today = new Date().toISOString().slice(0,10)){
  const checks=[];
  const add=(key,label,status,reason,question='')=>checks.push({key,label,status,reason,question});
  const question=(key,label,text)=>add(key,label,'要確認',text,`${label}について確認：${text}`);
  if(person.salesStatus==='placed' || person.salesStatus==='paused')add('salesStatus','要員の営業状況','対象外',person.salesStatus==='placed'?'参画決定済みとして登録':'営業休止として登録');
  else if(person.salesStatus==='open')add('salesStatus','要員の営業状況','問題なし','営業中として登録');
  else question('salesStatus','要員の営業状況','現在提案できるかを要員側の担当者へ確認');
  if(job.status==='closed') add('recruitment','募集状況','対象外','募集終了');
  else if(job.status==='unknown' || (job.receivedAt && (new Date(today)-new Date(job.receivedAt))/86400000>30)) question('recruitment','募集状況','現在も募集中か');
  else add('recruitment','募集状況','問題なし','募集中として登録');
  if(!known(person.nationality) || !known(job.foreignAllowed)) question('nationality','外国籍','要員の国籍／案件の外国籍可否が未確認');
  else add('nationality','外国籍',person.nationality!=='日本' && job.foreignAllowed==='no'?'対象外':'問題なし',person.nationality!=='日本' && job.foreignAllowed==='no'?'外国籍不可に該当':'国籍条件を満たす');
  if(!known(person.contract) || !known(job.freelanceAllowed)) question('contract','個人事業主','契約形態／個人事業主可否が未確認');
  else add('contract','個人事業主',person.contract==='freelance' && job.freelanceAllowed==='no'?'対象外':'問題なし',person.contract==='freelance' && job.freelanceAllowed==='no'?'個人事業主不可に該当':'契約形態の条件を満たす');
  if(!known(job.maxTiers) || !known(person.tiers)) question('tiers','商流・所属','商流／所属の許容範囲が未確認');
  else add('tiers','商流・所属',person.tiers>job.maxTiers?'対象外':'問題なし',`要員は${person.tiers}社先、許容は${job.maxTiers}社先まで`);
  if(job.employeeOnly==='yes') add('employment','所属制限', !known(person.contract)?'要確認':person.contract==='employee'?'問題なし':'対象外','正社員限定');
  else if(!known(job.employeeOnly)) question('employment','所属制限','正社員限定など追加制限の有無');
  else add('employment','所属制限','問題なし','追加の正社員限定なし');
  if(!known(job.maxAge) || !known(person.age)) question('age','年齢','年齢上限／要員年齢が未確認（制限なしは999で登録）');
  else add('age','年齢',person.age>job.maxAge?'対象外':'問題なし',`${person.age}歳／上限${job.maxAge===999?'なし':job.maxAge+'歳'}`);
  const mode=known(job.workMode)?job.workMode:'onsite';
  if(mode==='remote' && job.visitRequired==='no') add('commute','勤務地・出社','問題なし','出社不要のフルリモート');
  else {
    if(mode==='remote' && !known(job.visitRequired)) question('visits','初日・定期出社','フルリモートの出社条件が未確認');
    if(mode==='hybrid' && !known(job.officeDays)) question('frequency','出社頻度','週あたりの出社日数が未確認');
    if(person.onsite==='no' && mode!=='remote') add('onsite','常駐可否','対象外','要員は出社不可');
    else if(!known(person.onsite) && mode!=='remote') question('onsite','常駐可否','要員の常駐対応可否が未確認');
    const c=(person.commute || []).find(c=>c.location===job.location);
    if(person.relocation==='yes') add('commute','勤務地・通勤','問題なし','転居／地方常駐可の明示あり');
    else if(c?.possible==='no') add('commute','勤務地・通勤','対象外',`${person.station || '最寄不明'}→${job.location}は通勤不可として確認済み`);
    else if(c?.possible==='yes' && known(c.minutes) && known(person.maxCommute)) add('commute','勤務地・通勤',c.minutes>person.maxCommute?'対象外':'問題なし',`確認済み片道${c.minutes}分／許容${person.maxCommute}分`);
    else question('commute','勤務地・通勤',`${person.station || '最寄不明'}→${job.location || '勤務地不明'}の実通勤時間と許容時間を確認${!known(job.workMode)?'（出社記載なしのため常駐扱い）':''}`);
  }
  if(!known(job.rateMax) || !known(person.rateMin)) question('rate','単価','案件上限／要員希望下限が未確認');
  else add('rate','単価',person.rateMin>job.rateMax?'懸念あり':'問題なし',`希望下限${person.rateMin}万円／案件上限${job.rateMax}万円`,person.rateMin>job.rateMax?'単価の調整余地を確認':'');
  if(!job.start || !person.available) question('start','開始時期','案件開始／要員稼働日が未確認');
  else if(job.start<today) question('start','開始時期','開始日が過去のため、開始延期・募集継続を確認');
  else add('start','開始時期',person.available>job.start?'懸念あり':'問題なし',`案件${job.start}／要員${person.available}`,person.available>job.start?'参画日の調整可否を確認':'');
  const reqs=job.requirements || [];
  if(!reqs.length) question('skills','必須経験','必須スキル・年数の記載なし');
  for(const req of reqs){
    // 「A|B」はいずれかの経験を求める条件。異なる技術の年数を合算しません。
    const alternatives=req.skill.split('|').map(s=>s.trim());
    const months=Math.max(...alternatives.map(s=>commercialMonths(person,s,today)));
    const evidenced=(person.experiences || []).filter(e=>e.kind==='commercial' && e.evidence?.trim() && e.skills?.some(s=>alternatives.some(a=>s.toLowerCase()===a.toLowerCase())));
    const enough=months>=req.months && months>0;
    const recent=evidenced.some(e=>(e.end || today)>=new Date(new Date(today).setFullYear(new Date(today).getFullYear()-3)).toISOString().slice(0,10));
    const unresolved=evidenced.some(e=>e.datePrecision==='source');
    const mentioned=(person.skills||[]).some(s=>alternatives.some(a=>s.toLowerCase()===a.toLowerCase()));
    const hasCareer=(person.experiences||[]).length>0;
    const status=enough?(recent?'問題なし':'懸念あり'):unresolved?'要確認':evidenced.length?'懸念あり':hasCareer&&!mentioned?'懸念あり':'要確認';
    const display=alternatives.join(' または ');
    const reason=!evidenced.length?`${display}の商用実務を資料・登録経歴から確認できません${mentioned?'（スキル名の登録のみでは確定できません）':''}`:`${unresolved?'日付確定分の商用実務':'証跡付き商用実務'}${months}か月／${req.months?'必須'+req.months+'か月':'必要年数の指定なし'}${unresolved?'（期間未確定の商用経験は別途あり。未経験とは判断しません）':''}${enough&&!recent?'（直近3年の経験なし）':''}`;
    add('skill:'+req.skill,display,status,reason,status==='問題なし'?'':`${display}の商用経験・期間・役割を確認。個人開発／研修／自己学習は算入しません`);
  }
  for(const phase of job.phases || []){const yes=(person.experiences||[]).some(e=>e.kind==='commercial' && e.evidence?.trim() && e.phases?.includes(phase));add('phase:'+phase,'工程：'+phase,yes?'問題なし':'要確認',yes?'商用プロジェクトに工程の証跡あり':'商用経験で工程未確認',yes?'':`${phase}の担当実績を確認`);}
  if(job.role) question('role','役割・経験内容',`求める役割「${job.role}」と担当内容の照合が必要`);
  else question('role','役割・経験内容','求める役割・具体的な経験内容が未確認');
  if(!(job.phases || []).length) question('phases','担当工程','案件の担当工程が未確認');
  if(job.restrictions) question('other','その他の制限',job.restrictions);
  if(mode==='remote' && job.visitRequired==='yes' && person.onsite==='no') add('remote-visits','リモート出社条件','対象外','案件は出社あり、要員は出社不可');
  const excluded=checks.some(c=>c.status==='対象外');
  const status=excluded?'対象外':checks.some(c=>c.status==='懸念あり')?'懸念あり':checks.some(c=>c.status==='要確認')?'要確認':'問題なし';
  const score=Math.round(100*checks.reduce((s,c)=>s+({'問題なし':1,'要確認':0.35,'懸念あり':0.1,'対象外':0}[c.status]),0)/Math.max(checks.length,1));
  return {jobId:job.id,personId:person.id,status,score:excluded?0:score,checks,questions:checks.filter(c=>c.question).map(c=>c.question),ruleVersion:RULE_VERSION,evaluatedAt:new Date().toISOString(),ai:null};
}
