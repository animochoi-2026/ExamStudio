const test=require('node:test'),assert=require('node:assert/strict');
const {answerTitle}=require('../web-bank/original-question.cjs');
test('answer labels unwrap only question number brackets without changing identity or content',()=>{
 const items=[{id:'q3',originalNumber:'[서답형3]'}, {id:'q4',originalNumber:'서답형4'}];
 const before=JSON.stringify(items);
 assert.deepEqual(items.map(i=>answerTitle(i.originalNumber)),['서답형3','서답형4']);
 for(const text of ['[a,b]','[조건1]','[x+3]'])assert.equal(answerTitle(text),text);
 assert.equal(JSON.stringify(items),before);
});
