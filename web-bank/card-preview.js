// Load only visible cards, two at a time; navigation discards queued work.
export function cardPreviewLoader({reader,node,errorText}){
 let observer=null,queue=[],running=0,epoch=0;
 async function pump(){while(running<2&&queue.length){const {box,id,ticket}=queue.shift();if(ticket!==epoch||!box.isConnected)continue;running++;
  void reader.render(id).then(result=>{if(ticket===epoch&&box.isConnected)box.replaceChildren(result.element);}).catch(error=>{if(ticket===epoch&&box.isConnected){const retry=node('button','그림 포함 미리보기 다시 불러오기');retry.type='button';retry.onclick=()=>{retry.disabled=true;queue.push({box,id,ticket:epoch});pump();};box.append(node('p',errorText(error),'hint'),retry);}}).finally(()=>{running--;pump();});
 }}
 function watch(box,id){box.dataset.previewRevision=id;if(!observer&&typeof IntersectionObserver==='function')observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);queue.push({box:e.target,id:e.target.dataset.previewRevision,ticket:epoch});}pump();},{rootMargin:'200px'});
 if(observer)observer.observe(box);else{queue.push({box,id,ticket:epoch});queueMicrotask(pump);}}
 return {watch,clear(){epoch++;queue=[];observer?.disconnect();observer=null;}};
}
