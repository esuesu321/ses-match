import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLine,permission,rateCeiling,importWarnings} from '../lib/parser.mjs';
test('取り込み: 角括弧・コロン・記号の見出しで必須と尚可を分離する',()=>{
 for(const raw of ['【必須】\nJava 3年以上\n【尚可】\nPython','必須：Java 3年以上\n尚可：Python','■必須スキル\n・Java 3年以上\n■歓迎スキル\n・Python']){const p=parseLine(raw);assert.deepEqual(p.requirements,[{skill:'Java',months:36}]);assert.deepEqual(p.preferred,['Python']);}
 assert.deepEqual(parseLine('必須：Java 18か月以上').requirements,[{skill:'Java',months:18}]);
});
test('取り込み: 上限・範囲は読めるが、下限・概算・条件付き・逆転範囲は上限にしない',()=>{
 for(const [raw,max] of [['70万円',70],['上限75万円',75],['65〜75万円',75],['65万〜75万円',75],['６５～７５万円',75],['70万円〜',null],['70万円以上',null],['85万ほど/月',null],['70万円前後',null],['70万円・スキル見合い',null],['75〜65万円',null]])assert.equal(rateCeiling(raw),max,raw);
});
test('取り込み: 条件付き・二重否定・矛盾した可否を勝手に確定しない',()=>{
 for(const raw of ['応相談','原則不可','条件付き可','不可ではない','可（日本語流暢な場合）','NG/OK','不可、ただし例外あり'])assert.equal(permission(raw),'unknown',raw);
 assert.equal(permission('不可'),'no');assert.equal(permission('可'),'yes');assert.equal(permission('OK'),'yes');
 assert.equal(parseLine('外国籍：不可\n外国籍：可').foreignAllowed,'unknown');
});
test('取り込み: 開始年月・無効日・相談付き日付は原文だけを保持する',()=>{
 for(const date of ['2026/11','2026/02/30','2026/11/01以降','2026/11/01応相談','即日']){const p=parseLine('開始：'+date);assert.equal(p.start,'');assert.equal(p.startText,date);assert.ok(importWarnings(p).some(w=>w.includes('開始日')));}
 assert.equal(parseLine('開始：2026年11月1日').start,'2026-11-01');
});
test('取り込み: 支払い日・商流・面談人数は明記だけ、曖昧な内容は空欄',()=>{
 const p=parseLine('支払いサイト：45日\n商流：貴社1社先まで\n面談：1回\n募集人数：2名\n工程：詳細設計、製造');assert.equal(p.paymentDays,45);assert.equal(p.maxTiers,1);assert.equal(p.interviews,1);assert.equal(p.headcount,2);assert.deepEqual(p.phases,['詳細設計','製造']);assert.equal(parseLine('面談：1〜2回').interviews,null);assert.equal(parseLine('支払いサイト：45日程度').paymentDays,null);
});

test('取り込み: 重複した見出しの矛盾や別名の見出しを無視しない',()=>{
 const p=parseLine('開始：2026/11/01\n開始時期：2026/12/01\n年齢：50歳まで\n年齢上限：40歳まで\n支払いサイト：35日\n支払サイト：45日\n必須：Java\n必須スキル：SQL');assert.equal(p.start,'');assert.equal(p.maxAge,null);assert.equal(p.paymentDays,null);assert.deepEqual(p.requirements,[{skill:'Java',months:0},{skill:'SQL',months:0}]);
});
