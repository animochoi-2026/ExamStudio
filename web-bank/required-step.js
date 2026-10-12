// Visual guidance only: preserve controls, handlers and accessible labels.
export function requiredStep(element,number){
 element.querySelector(':scope > .required-step')?.remove();
 for(const child of [...element.childNodes])if(child.nodeType===3&&child.textContent.trim()){
  const label=document.createElement('span');label.textContent=child.textContent;child.replaceWith(label);
 }
 const badge=document.createElement('span');badge.className='past-print-step required-step';badge.textContent=String(number);badge.setAttribute('aria-hidden','true');element.prepend(badge,document.createTextNode(' '));return element;
}
