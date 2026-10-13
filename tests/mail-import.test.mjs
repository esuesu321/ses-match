import test from 'node:test';
import assert from 'node:assert/strict';
import {mailInput,manualMailDraft,redactContacts,reviewedAiDraft} from '../lib/mail-import.mjs';
const input={raw:'案件名：架空Java開発\n必須：Java 3年以上\n外国籍：不可\n支払いサイト：45日',subject:'架空案件',receivedAt:'2026-10-13'};
test('メール下書き: 原文・受信日・出典を保存、未記載は不明、支払日数は明記優先',()=>{
 const draft=manualMailDraft(input);assert.equal(draft.raw,input.raw);assert.equal(draft.source,'mail');assert.equal(draft.receivedAt,input.receivedAt);assert.equal(draft.status,'unknown');assert.equal(draft.foreignAllowed,'no');assert.equal(draft.paymentDays,45);assert.equal(draft.paymentDefault,false);assert.equal(manualMailDraft({raw:'案件名：架空案件'}).paymentDays,35);
});
test('メール入力: サイズ・日付・抽出方法を検証',()=>{
 for(const bad of [{raw:''},{raw:'a'.repeat(20001)},{raw:'本文',receivedAt:'2026-02-30'},{raw:'本文',useAi:'yes'}])assert.throws(()=>mailInput(bad));
});
test('AI送信前: 連絡先を除去、単価・日付・実務年数は保持',()=>{
 const text='mail@example.com 090-1234-5678 0312345678 09012345678 Java 3年 70万円 2026/11/01';const redacted=redactContacts(text);assert.ok(!redacted.includes('example.com'));for(const phone of ['090-1234-5678','0312345678','09012345678'])assert.ok(!redacted.includes(phone));assert.ok(redacted.includes('70万円 2026/11/01'));
});
test('AI下書き: 原文にない引用は拒否、勝手な公開先・状態・IDを無視',()=>{
 const response={isJob:true,multiple:false,fields:{title:'架空Java開発',foreignAllowed:'no',status:'open',source:'public',id:'invented'},evidence:[{field:'title',quote:'案件名：架空Java開発'},{field:'foreignAllowed',quote:'外国籍：不可'}]};
 const draft=reviewedAiDraft(response,input,input.raw);assert.equal(draft.title,'架空Java開発');assert.equal(draft.status,'unknown');assert.equal(draft.source,'mail');assert.equal(draft.id,undefined);assert.ok(draft.extractionEvidence.includes('外国籍：不可'));
 assert.throws(()=>reviewedAiDraft({...response,evidence:[{field:'title',quote:'実在しない根拠'}]},input,input.raw));
 for(const bad of [{...response,multiple:true},{...response,isJob:false},{...response,fields:{rateMax:'70'},evidence:[{field:'rateMax',quote:'外国籍：不可'}]}])assert.throws(()=>reviewedAiDraft(bad,input,input.raw));
});

test('メール手動取り込み: 複数案件を一つの条件として保存させない',()=>{assert.throws(()=>manualMailDraft({raw:'案件名：架空A\n必須：Java\n案件名：架空B\n必須：Python'}));});
test('AI取り込み: 原文の契約可否・単価・開始日と矛盾する値を拒否する',()=>{
 for(const [field,value,quote] of [['foreignAllowed','yes','外国籍：不可'],['rateMax',80,'単価：70万円'],['start','2026-11-02','開始：2026/11/01']])assert.throws(()=>reviewedAiDraft({isJob:true,multiple:false,fields:{[field]:value},evidence:[{field,quote}]},{...input,raw:quote},quote));
});
test('AI取り込み: 曖昧な可否・単価下限・年月を確定しない',()=>{
 for(const [field,value,quote] of [['foreignAllowed','yes','外国籍：条件付き可'],['rateMax',70,'単価：70万円〜'],['start','2026-11-01','開始：2026/11']]){const draft=reviewedAiDraft({isJob:true,multiple:false,fields:{[field]:value},evidence:[{field,quote}]},{...input,raw:quote},quote);assert.ok(draft[field]===undefined || draft[field]==='unknown');assert.ok(JSON.parse(draft.importWarnings).length);}
});
test('AI取り込み: 尚可を必須に変えたり、引用にない技術を追加したりしない',()=>{
 const raw='必須：Java\n尚可：Python';for(const skill of ['Python','Rust'])assert.throws(()=>reviewedAiDraft({isJob:true,multiple:false,fields:{requirements:[{skill,months:0}]},evidence:[{field:'requirements',quote:raw}]},{...input,raw},raw));
});

test('AI取り込み: JavaScriptをJavaとみなさず、必須年数を増やさない',()=>{
 for(const [skill,months,quote] of [['Java',0,'必須：JavaScript'],['Java',60,'必須：Java 3年以上']])assert.throws(()=>reviewedAiDraft({isJob:true,multiple:false,fields:{requirements:[{skill,months}]},evidence:[{field:'requirements',quote}]},{...input,raw:quote},quote));
 const quote='必須：Java 3年以上';const draft=reviewedAiDraft({isJob:true,multiple:false,fields:{requirements:[{skill:'Java',months:36}]},evidence:[{field:'requirements',quote}]},{...input,raw:quote},quote);assert.equal(draft.requirements[0].months,36);
});

test('AI取り込み: 短い引用で必須年数を消すことを拒否する',()=>{const raw='必須：Java 3年以上';assert.throws(()=>reviewedAiDraft({isJob:true,multiple:false,fields:{requirements:[{skill:'Java',months:0}]},evidence:[{field:'requirements',quote:'Java'}]},{...input,raw},raw));});
