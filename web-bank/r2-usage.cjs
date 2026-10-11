'use strict';
const GB=1_000_000_000, FREE=10*GB, DISPLAY=20*GB;
function usage(bytes){
 if(!Number.isSafeInteger(bytes)||bytes<0)throw Error('R2 용량 응답을 확인할 수 없습니다.');
 return {bytes,gb:bytes/GB,percent:bytes/DISPLAY*100,fill:Math.min(100,bytes/DISPLAY*100),aboveFree:bytes>FREE,aboveDisplay:bytes>DISPLAY};
}
module.exports={usage,GB,FREE,DISPLAY};
