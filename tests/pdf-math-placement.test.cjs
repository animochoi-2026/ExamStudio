const test=require('node:test'),assert=require('node:assert/strict');
test('PDF math placement uses pixel coordinates even after a scaled canvas render',async()=>{
 const {paintPdfMath}=await import('../web-bank/pdf-math.js');
 let scale=3;const stack=[],drawn=[];
 const context={save(){stack.push(scale);},restore(){scale=stack.pop();},setTransform(a){scale=a;},beginPath(){},rect(){},clip(){},drawImage(img,x,y,w,h){drawn.push({x:x*scale,y:y*scale,w:w*scale,h:h*scale});}};
 paintPdfMath({width:3000,getContext:()=>context},{getBoundingClientRect:()=>({left:-10000,top:-400,width:1000})},[{image:{},box:{left:-9950,top:-350,right:-9900,bottom:-330},clip:{left:-9980,top:-380,right:-9100,bottom:900}}]);
 assert.deepEqual(drawn,[{x:150,y:150,w:150,h:60}]);
 assert.equal(scale,3,'caller canvas state is preserved');
});
