// 項目名がある本文から値を抽出します。未記載の契約条件は推測で補いません。
export function parseLine(raw){
  const text=String(raw).normalize('NFKC');
  const lines=text.split(/\r?\n/);
  const read=(labels)=>{for(const l of labels){const re=new RegExp('^\\s*[■●◆◇□・【]?\\s*'+l+'(?:】)?(?:\\s*[:：]\\s*|\\s*$)(.*)$','i');for(let i=0;i<lines.length;i++){const m=lines[i].match(re);if(!m)continue;const values=[m[1].trim()];for(let n=i+1;n<lines.length;n++){const next=lines[n].trim();if(!next)continue;if(/^[■●◆◇□]/.test(next)||/^[^・\-:：]{1,20}[:：]/.test(next))break;values.push(next);}return values.filter(Boolean).join('\n');}}return '';};
  const first=labels=>read(labels).split('\n')[0] || '';
  const permission=v=>/不可|NG|禁止/i.test(v)?'no':/可|OK/i.test(v)?'yes':'unknown';
  const rate=read(['希望単価','単価','金額']);const nums=[...rate.matchAll(/(\d+(?:\.\d+)?)\s*万/g)].map(m=>Number(m[1]));
  const skills=read(['必須スキル','必須']);
  const requirements=skills.split(/[,、\n]/).filter(s=>!/^【/.test(s.trim())).map(s=>{const m=s.replace(/^[・\-]\s*/,'').trim().match(/^(.+?)(?:\s*(\d+(?:\.\d+)?)\s*年(?:以上)?)?$/);return m?{skill:m[1].trim(),months:m[2]?Math.round(Number(m[2])*12):0}:null;}).filter(r=>r?.skill);
  const work=read(['勤務形態','リモート','働き方']);
  const startText=first(['稼働開始','開始時期','開始']);const date=startText.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  const age=first(['年齢']).match(/(\d+)\s*歳(?:まで|以下|上限)/);
  const location=first(['勤務地','場所','最寄']) || (work.match(/[（(]([^）)]+)[）)]/)?.[1] || '');
  return {title:first(['案件名','案件','件名']),location,rateText:rate,rateMax:nums.length&&!/ほど|程度|目安|応相談|\n/.test(rate)?Math.max(...nums):null,startText,start:date?`${date[1]}-${date[2].padStart(2,'0')}-${date[3].padStart(2,'0')}`:'',period:first(['期間']),workMode:/フルリモート/.test(work)?'remote':/併用|週|一部/.test(work)?'hybrid':/常駐/.test(work)?'onsite':'unknown',foreignAllowed:permission(first(['外国籍'])),freelanceAllowed:permission(first(['個人事業主','個人'])),maxAge:age?Number(age[1]):null,requirements,preferred:read(['歓迎スキル','尚可スキル','尚可']).split('\n').filter(Boolean),role:read(['案件概要','業務内容','作業内容']),settlement:first(['精算幅','清算幅','精算','清算']),restrictions:read(['その他の条件']),raw,source:'line',status:'unknown',receivedAt:''};
}

