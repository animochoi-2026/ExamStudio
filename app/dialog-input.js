// Recover a lost native web-view focus only on deliberate input interaction.
// Never synthesize key events or refocus during an IME composition.
export function installDialogInput(dialog,api){
 let composing=false,lastInput=null;
 const restore=document.createElement('button');restore.type='button';restore.className='button compact quiet';restore.textContent='입력 복구';restore.id='restoreDialogInput';restore.hidden=true;dialog.querySelector('.modal-heading').insertBefore(restore,dialog.querySelector('#closeDialog'));
 dialog.addEventListener('focusin',event=>{if(event.target.matches('textarea,input:not([type=checkbox]):not([type=radio])')){lastInput=event.target;restore.hidden=false;}});
 restore.addEventListener('click',async()=>{const target=lastInput?.isConnected?lastInput:dialog.querySelector('textarea');if(!target)return;const start=target.selectionStart,end=target.selectionEnd;target.blur();composing=false;await api.ensureInputFocus(true);if(dialog.open&&target.isConnected){target.focus({preventScroll:true});target.setSelectionRange(start,end);}});
 dialog.addEventListener('compositionstart',()=>{composing=true;});
 dialog.addEventListener('compositionend',()=>{composing=false;});
 dialog.addEventListener('close',()=>{composing=false;lastInput=null;restore.hidden=true;});
 dialog.addEventListener('pointerdown',event=>{
  const target=event.target.closest('textarea,input:not([type=checkbox]):not([type=radio])');
  if(!target||target.disabled||target.readOnly||composing)return;
  // A native dialog can return focus to the window but not its WebContents.
  void api.ensureInputFocus().then(recovered=>{
   if(recovered&&!composing&&dialog.open&&target.isConnected&&document.activeElement!==target)target.focus({preventScroll:true});
  }).catch(()=>{});
 });
}
