const fail=m=>{const e=new Error(m);e.status=400;throw e;};
const enumFields={foreignAllowed:['yes','no','unknown'],freelanceAllowed:['yes','no','unknown'],employeeOnly:['yes','no','unknown'],workMode:['remote','hybrid','onsite','unknown'],visitRequired:['yes','no','unknown'],status:['open','closed','unknown'],contract:['employee','freelance','unknown'],onsite:['yes','no','unknown'],relocation:['yes','no','unknown']};
export function validate(kind,input){
  if(!input || typeof input!=='object' || Array.isArray(input))fail('入力形式が不正です');
  const x=structuredClone(input); delete x.id;delete x.updatedAt;delete x.createdAt;
  if(typeof x[kind==='jobs'?'title':'name']!=='string' || !x[kind==='jobs'?'title':'name'].trim())fail(kind==='jobs'?'案件名を入力してください':'氏名を入力してください');
  if(JSON.stringify(x).length>100000)fail('入力が長すぎます');
  for(const [key,values]of Object.entries(enumFields)){if(x[key]!==undefined && !values.includes(x[key]))fail(`${key}の選択が不正です`);}
  for(const key of ['rateMax','rateMin','age','maxAge','tiers','maxTiers','maxCommute','officeDays','interviews','headcount','paymentDays']){if(x[key]!==undefined && x[key]!==null && (!Number.isFinite(x[key]) || x[key]<0))fail(`${key}は0以上の数値で入力してください`);}
  if(x.officeDays>5)fail('出社頻度は0〜5日で入力してください');
  for(const key of ['start','available','receivedAt']){if(x[key] && !validDate(x[key]))fail(`${key}の日付が不正です`);}
  for(const k of ['requirements','experiences','commute','phases','skills','preferred'])if(x[k]!==undefined && !Array.isArray(x[k]))fail(`${k}は配列で入力してください`);
  for(const k of ['phases','skills','preferred'])if(x[k]?.some(v=>typeof v!=='string'))fail(`${k}に文字列以外が含まれています`);
  for(const [k,v] of Object.entries(x))if(!['requirements','experiences','commute','phases','skills','preferred'].includes(k) && v!==null && typeof v==='object')fail(`${k}の形式が不正です`);
  for(const k of ['title','name','nationality','station','location','raw','role','restrictions','sourceText','pr','notes','affiliation','evidence'])if(x[k]!==undefined && typeof x[k]!=='string')fail(`${k}は文字列で入力してください`);
  for(const r of x.requirements || []){if(typeof r.skill!=='string' || !r.skill.trim() || !Number.isFinite(r.months) || r.months<0)fail('必須スキル・年数が不正です');}
  for(const e of x.experiences || []){
    if(!['commercial','personal','training','learning'].includes(e.kind))fail('経験区分を確認してください');
    if(e.datePrecision==='source'){
      if(typeof e.periodText!=='string' || !e.periodText.trim() || e.start || e.end)fail('期間の原文を入力し、未確認の日付は空欄にしてください');
    }else{
      if(e.datePrecision!==undefined && e.datePrecision!=='exact')fail('期間の確認状況が不正です');
      if(!validDate(e.start) || (e.end && !validDate(e.end)) || (e.end && e.end<=e.start))fail('経験期間を確認してください');
    }
    if(!Array.isArray(e.skills) || e.skills.some(s=>typeof s!=='string') || !Array.isArray(e.phases) || e.phases.some(s=>typeof s!=='string'))fail('経験スキル・工程が不正です');
    if(e.kind==='commercial' && (typeof e.evidence!=='string' || !e.evidence.trim()))fail('商用実務には出典・証跡を記入してください');
  }
  for(const c of x.commute || [])if(typeof c.location!=='string' || !['yes','no'].includes(c.possible) || (c.minutes!==null && (!Number.isFinite(c.minutes) || c.minutes<0)))fail('通勤確認の入力が不正です');
  return x;
}
export function validDate(s){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s)) && new Date(s).toISOString().slice(0,10)===s;}
