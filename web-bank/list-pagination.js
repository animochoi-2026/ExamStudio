export const PAGE_SIZE=20;
export function listPagination({node,action,total,offset,onPage}){
 const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),page=Math.floor(offset/PAGE_SIZE)+1;
 const bar=node('nav','','list-pagination');bar.setAttribute('aria-label','목록 페이지');
 const previous=action('이전 페이지',()=>onPage(Math.max(0,offset-PAGE_SIZE))),next=action('다음 페이지',()=>onPage(offset+PAGE_SIZE));
 previous.disabled=offset===0;next.disabled=offset+PAGE_SIZE>=total;
 const label=node('span',`${page} / ${pages}페이지${total>0&&page===pages?' · 마지막 페이지':''}`);label.setAttribute('role','status');
 bar.append(previous,label,next);return bar;
}
