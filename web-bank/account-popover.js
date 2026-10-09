// Own one profile at a time; session replacement removes every document listener.
export function createAccountPopoverController() {
  let profile = null;
  let eventDocument = null;

  function close({restoreFocus = 'inside'} = {}) {
    if (!profile?.open) return;
    const summary = profile.querySelector('summary');
    const active = eventDocument.activeElement;
    const focusWasInside = active !== summary && profile.contains(active);
    profile.open = false;
    if (restoreFocus === true || (restoreFocus === 'inside' && focusWasInside)) {
      summary?.focus({preventScroll: true});
    }
  }

  function outsideInteraction(event) {
    if (!profile?.open) return;
    const path = event.composedPath?.();
    const inside = path ? path.includes(profile) : profile.contains(event.target);
    if (!inside) close({restoreFocus: false});
  }

  function escape(event) {
    if (event.key !== 'Escape' || event.defaultPrevented || !profile?.open) return;
    event.preventDefault();
    close({restoreFocus: true});
  }

  function detach() {
    if (eventDocument) {
      eventDocument.removeEventListener('pointerdown', outsideInteraction, true);
      eventDocument.removeEventListener('click', outsideInteraction, true);
      eventDocument.removeEventListener('keydown', escape);
    }
    profile = null;
    eventDocument = null;
  }

  function attach(nextProfile) {
    if (nextProfile === profile) return;
    detach();
    if (!nextProfile) return;
    profile = nextProfile;
    eventDocument = profile.ownerDocument;
    // Pointer events cover mouse and touch. Click also handles keyboard/AT clicks.
    eventDocument.addEventListener('pointerdown', outsideInteraction, true);
    eventDocument.addEventListener('click', outsideInteraction, true);
    eventDocument.addEventListener('keydown', escape);
  }

  return {attach, close, detach};
}
