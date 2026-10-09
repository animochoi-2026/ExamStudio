export function examPageHeader(node,title,pageIndex){
 const header=node('header','','exam-page-header');header.append(node('span',title,'exam-header-title'));
 if(pageIndex===0)header.append(node('span','이름: __________________','exam-name-line'));
 return header;
}
export function pageContentHeight(){
 const page=document.createElement('section');page.className='exam-page';page.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden';document.body.append(page);
 try{const s=getComputedStyle(page);return page.getBoundingClientRect().height-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom)-parseFloat(s.borderTopWidth)-parseFloat(s.borderBottomWidth);}finally{page.remove();}
}
