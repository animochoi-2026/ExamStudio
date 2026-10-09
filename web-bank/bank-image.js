// Image type comes from verified bytes, never an uploaded filename.
export function imageMime(value){
 const b=value instanceof Uint8Array?value:new Uint8Array(value);
 if(b.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))return 'image/png';
 if(b.length>=12&&String.fromCharCode(...b.subarray(0,4))==='RIFF'&&String.fromCharCode(...b.subarray(8,12))==='WEBP')return 'image/webp';
 if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';
 throw Error('저장된 그림 형식을 확인할 수 없습니다.');
}
export function materialName(file){return file?.encoding?.policy==='lossless-upload-v1'?file.encoding.originalName:file?.name;}
