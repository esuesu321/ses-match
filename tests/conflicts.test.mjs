import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeRecord,applyChoices} from '../public/conflicts.js';
test('編集競合: 独立した項目の変更は双方を引き継ぎ、最新版の版情報を使う',()=>{
 const base={id:'1',revision:'a',title:'架空',rateMax:70,location:'東京'},mine={...base,rateMax:75},current={...base,revision:'b',location:'大阪'};const merged=mergeRecord(base,mine,current);assert.deepEqual(merged.conflicts,[]);assert.deepEqual(applyChoices(merged,{}),{...current,rateMax:75});assert.equal(base.rateMax,70);
});
test('編集競合: 同じ項目を変えた場合は明示選択が必要',()=>{
 const base={title:'架空',revision:'a'},mine={...base,title:'入力A'},current={...base,title:'入力B',revision:'b'};const merged=mergeRecord(base,mine,current);assert.equal(merged.conflicts.length,1);assert.throws(()=>applyChoices(merged,{}));assert.equal(applyChoices(merged,{title:'mine'}).title,'入力A');assert.equal(applyChoices(merged,{title:'current'}).title,'入力B');assert.equal(applyChoices(merged,{title:'mine'}).revision,'b');
});
test('編集競合: 同じ値・配列単位の競合・項目の削除を扱う',()=>{
 const base={skills:['Java'],notes:'旧メモ'},mine={skills:['Java','SQL']},current={skills:['Java','Python'],notes:'別画面のメモ'};const merged=mergeRecord(base,mine,current);assert.equal(merged.conflicts.length,2);const selected=applyChoices(merged,{skills:'current',notes:'mine'});assert.deepEqual(selected.skills,['Java','Python']);assert.ok(!Object.hasOwn(selected,'notes'));assert.equal(mergeRecord(base,{...base,notes:'同じ'},{...base,notes:'同じ'}).conflicts.length,0);
});
test('編集競合: 確認後にもう一度更新されても未保存の入力を保つ',()=>{
 const original={revision:'a',rateMax:70,location:'東京'},mine={...original,rateMax:75},serverB={...original,revision:'b',location:'大阪'};const first=applyChoices(mergeRecord(original,mine,serverB),{});const serverC={...serverB,revision:'c',location:'福岡'};const second=applyChoices(mergeRecord(serverB,first,serverC),{});assert.equal(second.rateMax,75);assert.equal(second.location,'福岡');assert.equal(second.revision,'c');
});
