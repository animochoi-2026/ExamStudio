// Only a gesture that starts and ends outside the panel dismisses it.
export function dismissPreviewOnBackdrop(dialog){
 const outside=e=>{const r=dialog.getBoundingClientRect();return e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom);};
 let startedOutside=false;
 dialog.addEventListener('pointerdown',e=>{startedOutside=e.button===0&&outside(e);});
 dialog.addEventListener('pointercancel',()=>{startedOutside=false;});
 dialog.addEventListener('click',e=>{const dismiss=startedOutside&&outside(e);startedOutside=false;if(dismiss)dialog.close();});
}
