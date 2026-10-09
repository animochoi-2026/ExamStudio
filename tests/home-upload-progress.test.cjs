const test=require('node:test'),assert=require('node:assert/strict');
test('home source progress means original uploads, independently of review status',async()=>{
 const {uploadProgress}=await import('../web-bank/home-view.js');
 const value=uploadProgress({question_count:22,reviewed_count:1,progress:{expected_count:25,status:'complete'}});
 assert.equal(value.text,'업로드 22 / 25');assert.equal(value.ratio,.88);assert.equal(value.uploaded,22);
});
test('unknown source totals do not manufacture a completion percentage',async()=>{
 const {uploadProgress}=await import('../web-bank/home-view.js');
 for(const progress of [null,{}, {status:'complete'}]){const value=uploadProgress({question_count:24,progress});assert.equal(value.total,null);assert.equal(value.ratio,null);assert.match(value.text,/전체 수 미확인/);}
});
test('source numbering supplies only confirmed totals and flags over-counts',async()=>{
 const {uploadProgress}=await import('../web-bank/home-view.js');
 assert.equal(uploadProgress({question_count:3,source:{numbering:{total:25,uncertain:true}}}).total,null);
 assert.equal(uploadProgress({question_count:3,source:{numbering:{total:25,uncertain:false}}}).total,25);
 const excess=uploadProgress({question_count:26,progress:{expected_count:25}});assert.equal(excess.excess,true);assert.equal(excess.text,'업로드 26 / 25');
});
