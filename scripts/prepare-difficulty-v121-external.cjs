'use strict';
// Original user attachments; target labels disambiguate multi-question pages.
// Reference answers remain local validation data and are never sent to a model.
const fs=require('node:fs'),path=require('node:path');
const I=require('../app/difficulty-v12/input.cjs'),B=require('../app/difficulty-v12/bundle-input.cjs'),P=require('../app/difficulty-v121/profile.cjs');
const base='C:/Users/reals/Desktop/문제생성기/.codex-remote-attachments/01a11544-ba5d-7892-b742-a2b4aba07662';
const files=[base+'/a2004676-3705-407a-8a0a-e3ce334b9230/2-1000038773.jpg',base+'/a2004676-3705-407a-8a0a-e3ce334b9230/3-1000038779.jpg',base+'/da605975-cb58-4390-9ca9-19430635d155/1-1000038784.jpg'];
const refs=[
 ['20번',0,'5/2',['3/2','2','5/2','3','7/2'],[]],
 ['21번',0,'49°',['45°','49°','55°','56°','60°'],[]],
 ['서답형 1',0,'(1) AB=5r, r=5 (2) R=25/2, 넓이=625π/4 (3) OE=5/2',[],['피타고라스 정리 사용 금지']],
 ['서답형 2',0,'(1) △ABP≡△BCQ (SAS 합동) (2) 25',[],[]],
 ['서술형 3',1,'(2,4), (2,5), (2,6), (4,2), (5,2), (6,2)',[],[]],
 ['서술형 4',2,'7/162',[],['모듈러 연산 사용 금지']],
 ['서술형 5',2,'(1) △ABD∼△ACB (AA 닮음) (2) 24',[],[]],
 ['서술형 6',2,'(1) 9가지 (2) 4가지 (3) 13/90',[],[]]
];
const root=path.resolve('artifacts/difficulty-v121/external');fs.mkdirSync(path.join(root,'entries'),{recursive:true});
const images=files.map(file=>{const b=fs.readFileSync(file);return {sha256:B.digest(b),dataUrl:'data:'+B.image(b)+';base64,'+b.toString('base64')};});
const entries=refs.map(([target,index,storedAnswer,choices,restrictions],i)=>{
 const id='V'+(i+1),input=I.input({question:{body:'',choices},scope:'중2',images:[images[index]],target,restrictions});
 const entry={id,questionId:'external:'+id,revisionId:images[index].sha256+':'+target,input,profileVersion:P.version,validationContext:{scope:'중2',storedAnswer,choices,requiresImage:true,imageCount:1}};
 const file=path.join(root,'entries',id+'.json');
 if(fs.existsSync(file)){if(I.hash(JSON.parse(fs.readFileSync(file)))!==I.hash(entry))throw Error('External input changed');}else fs.writeFileSync(file,JSON.stringify(entry),{flag:'wx'});
 return {id,inputVersion:input.inputVersion,identity:P.inputIdentity(entry),imageHash:images[index].sha256,target};
});
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({entries,hash:I.hash(entries),profileVersion:P.version,promptHash:P.promptHash}));
console.log(JSON.stringify({prepared:entries.length,images:images.length,modelCalls:0}));
