import {validDate} from './validation.mjs';
const aliases={title:['案件名','案件','件名'],location:['勤務地','作業場所','場所','最寄'],rate:['希望単価','単価','単価上限','金額'],start:['稼働開始','開始時期','開始','参画時期'],period:['期間'],work:['勤務形態','リモート','働き方'],foreign:['外国籍','外国籍可否'],freelance:['個人事業主','個人','フリーランス'],age:['年齢','年齢上限'],required:['必須スキル','必須条件','必須'],preferred:['歓迎スキル','尚可スキル','尚可','歓迎'],role:['案件概要','業務内容','作業内容'],settlement:['精算幅','清算幅','精算','清算'],restrictions:['その他の条件','その他','備考'],phases:['担当工程','工程'],tiers:['商流','所属制限'],payment:['支払いサイト','支払サイト','支払い条件','支払条件'],interviews:['面談','面談回数'],headcount:['募集人数','人数']};
const known=new Set(Object.values(aliases).flat());
export function labeledSections(raw){
 const lines=String(raw).normalize('NFKC').split(/\r?\n/),sections=[];let current;
 for(const original of lines){
  let line=original.trim();const clean=line.replace(/^[■●◆◇□・]+\s*/,'');
  const bracket=clean.match(/^【([^】]+)】\s*[:：]?\s*(.*)$/);
  const colon=clean.match(/^([^:：]{1,30})\s*[:：]\s*(.*)$/);
  let label,value;
  if(bracket && bracket[1]!=='共通'){[label,value]=bracket.slice(1);}
  else if(colon && (known.has(colon[1].trim()) || !/^[・-]/.test(line))){[label,value]=colon.slice(1);}
  else if(known.has(clean)){label=clean;value='';}
  if(label){current={label:label.trim(),lines:[value.trim()]};sections.push(current);}
  else if(current && line)current.lines.push(line);
 }
 return sections.map(s=>({...s,value:s.lines.filter(Boolean).join('\n')}));
}
export function permission(value){
 const text=String(value).normalize('NFKC').trim();
 if(!text || /相談|条件|原則|場合|検討|確認|ではない|でない|なく|以外|除く|ただし|但し/.test(text))return 'unknown';
 if(/^(?:不可|NG|禁止|×|✕|不可です)[。.!！]?$/i.test(text))return 'no';
 if(/^(?:可|可能|OK|○|〇|可です)[。.!！]?$/i.test(text))return 'yes';
 return 'unknown';
}
export function rateCeiling(value){
 const text=String(value).normalize('NFKC').trim().replace(/[ \t]/g,'');
 const range=text.match(/^(?:月額)?(\d+(?:\.\d+)?)(?:万円?)?[〜~～-](\d+(?:\.\d+)?)万円?(?:\/月|月額)?$/);
 if(range && Number(range[1])<=Number(range[2]))return Number(range[2]);
 const single=text.match(/^(?:月額)?(?:上限|最大)?(\d+(?:\.\d+)?)万円?(?:まで|以下|上限|\/月)?$/);
 return single?Number(single[1]):null;
}
export function parseLine(raw){
 const sections=labeledSections(raw),read=key=>sections.filter(s=>aliases[key].includes(s.label)).map(s=>s.value).join('\n'),first=key=>read(key).split('\n')[0] || '';
 const list=text=>text.split(/[,、\n]/).map(s=>s.replace(/^[・-]\s*/,'').trim()).filter(s=>s && !/^【/.test(s));
 const requirements=list(read('required')).map(skill=>{const m=skill.match(/^(.+?)\s*(\d+(?:\.\d+)?)\s*(年|か月|ヶ月|月)(?:以上)?$/);return {skill:m?m[1].trim():skill,months:m?Math.round(Number(m[2])*(m[3]==='年'?12:1)):0};});
 const work=read('work'),startText=read('start'),date=startText.match(/^(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})日?(?:開始)?$/);
 const candidate=date?`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`:'';
 const age=read('age').match(/^(\d+)\s*歳(?:まで|以下|上限)$/),tiers=read('tiers').match(/^(?:貴社)?\s*(\d+)\s*社先まで$/);
 const count=(key,suffix)=>{const m=read(key).match(new RegExp('^(\\d+)\\s*'+suffix+'$'));return m?Number(m[1]):null;};
 const remote=/フルリモート|完全リモート/.test(work),onsite=/常駐|出社/.test(work),hybrid=/併用|一部|週[1-5]\s*日/.test(work);
 const mode=remote && onsite?'unknown':remote?'remote':hybrid?'hybrid':onsite?'onsite':'unknown';
 const draft={title:first('title'),location:first('location') || work.match(/[（(]([^）)]+)[）)]/)?.[1] || '',rateText:read('rate'),rateMax:rateCeiling(read('rate')),startText,start:validDate(candidate)?candidate:'',period:first('period'),workMode:mode,foreignAllowed:permission(read('foreign')),freelanceAllowed:permission(read('freelance')),maxAge:age?Number(age[1]):null,maxTiers:tiers?Number(tiers[1]):/^貴社まで$/.test(read('tiers'))?0:null,requirements,preferred:list(read('preferred')),phases:list(read('phases')),role:read('role'),settlement:first('settlement'),restrictions:read('restrictions'),paymentDays:count('payment','日'),interviews:count('interviews','回'),headcount:count('headcount','名'),raw,source:'line',status:'unknown',receivedAt:''};
 draft.importWarnings=JSON.stringify(importWarnings(draft));return draft;
}
export function importWarnings(draft){
 const warnings=[];
 if(!draft.title)warnings.push('案件名を抽出できません。原文から確認してください。');
 if(draft.rateText && draft.rateMax==null)warnings.push('単価の目安・下限・相談条件などを上限として確定していません。');
 if(draft.startText && !draft.start)warnings.push('開始日が未確定、年月のみ、または日付が不正です。原文を確認してください。');
 if(!draft.requirements?.length)warnings.push('必須スキルを抽出できません。尚可と区別して入力してください。');
 if(draft.foreignAllowed!=='yes' && draft.foreignAllowed!=='no')warnings.push('外国籍の可否は要確認です。');
 if(draft.freelanceAllowed!=='yes' && draft.freelanceAllowed!=='no')warnings.push('個人事業主の可否は要確認です。');
 if(draft.workMode==='unknown' || !draft.workMode)warnings.push('勤務形態・出社条件は要確認です。');
 if(draft.paymentDefault)warnings.push('支払いサイト35日は初期値です。先方の条件を確認してください。');
 if(labeledSections(draft.raw || '').filter(s=>aliases.title.includes(s.label)).length>1)warnings.push('複数の案件名があります。案件ごとに本文を分けてください。');
 return warnings;
}
