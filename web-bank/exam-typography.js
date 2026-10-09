export const bodyFontRange={min:7,max:15,default:10};
export function validateBodyFont(value){const n=Number(value);if(String(value).trim()===''||!Number.isFinite(n)||n<7||n>15||!Number.isInteger(n*2))throw Error('본문 글자 크기는 7~15pt 사이에서 0.5pt 단위로 입력하세요.');return n;}
