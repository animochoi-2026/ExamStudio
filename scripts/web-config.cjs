'use strict';
const {configuration}=require('../app/shared-bank-auth.cjs');
const routing=require('../release/storage-routing.json');
function webConfiguration(input){
 const config=configuration(input);
 const target=routing.targets.find(t=>t.url===config.url&&t.spaceId===config.spaceId);
 if(target?.storageGateway===true&&config.storageGateway!==true)
  throw Error('운영 R2 파일 연결 설정(storageGateway: true)이 누락되었습니다. 검증된 공개 연결 JSON으로 빌드하세요.');
 return config;
}
module.exports={webConfiguration};
