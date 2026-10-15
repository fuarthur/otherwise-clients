/** Native disclosure buttons with consistent keyboard, dismissal and placement. */
export function attachActionPopovers(root, {reveal = () => {}, exit = () => {}} = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const selector = '[data-action-popover]';
  const openPopovers = () => [...root.querySelectorAll(`${selector}[open]`)];
  const panelOf = details => details.querySelector(':scope > .topic-action-menu, :scope > .action-popover-panel');
  const triggerOf = details => details.querySelector(':scope > summary');
  const actionsOf = details => [...(panelOf(details)?.querySelectorAll('button:not(:disabled), a[href]') || [])]
    .filter(element => element.getClientRects().length);

  function focusAction(details, action) {
    if (!action) return;
    action.focus({preventScroll:true});
    const panel = panelOf(details), bounds = panel.getBoundingClientRect(), item = action.getBoundingClientRect();
    const top = bounds.top + panel.clientTop, bottom = top + panel.clientHeight;
    if (item.top < top) panel.scrollTop -= top - item.top + 4;
    else if (item.bottom > bottom) panel.scrollTop += item.bottom - bottom + 4;
  }

  function position(details) {
    const trigger = triggerOf(details), panel = panelOf(details);
    if (!trigger || !panel) return;
    const box = trigger.getBoundingClientRect();
    const below = win.innerHeight - box.bottom - 16, above = box.top - 16;
    const upwards = below < Math.min(panel.scrollHeight, 340) && above > below;
    details.dataset.popoverSide = upwards ? 'above' : 'below';
    details.style.setProperty('--popover-space', `${Math.max(0, upwards ? above : below)}px`);
  }

  function close(details, restore = false) {
    if (!details.open) return;
    exit(panelOf(details));
    details.open = false;
    if (restore) triggerOf(details)?.focus({preventScroll:true});
  }

  function open(details, focusLast) {
    openPopovers().filter(other => other !== details).forEach(other => close(other));
    const changed = !details.open;
    details.open = true;
    position(details);
    if (changed) reveal(panelOf(details));
    if (focusLast !== undefined) {
      const actions = actionsOf(details);
      focusAction(details, focusLast ? actions.at(-1) : actions[0]);
    }
  }

  function onClick(event) {
    const summary = event.target.closest?.('summary');
    const details = summary?.parentElement;
    if (details?.matches(selector) && root.contains(details)) {
      event.preventDefault();
      if (details.open) close(details);
      else open(details, event.detail === 0 ? false : undefined);
      return;
    }
    openPopovers().forEach(details => {
      const action = event.target.closest?.('button, a[href]');
      if (!details.contains(event.target) || (action && panelOf(details)?.contains(action))) close(details);
    });
  }

  function onKeydown(event) {
    if (event.defaultPrevented || event.isComposing) return;
    const details = event.target.closest?.(selector);
    if (details && root.contains(details) && event.target === triggerOf(details)
      && ['ArrowDown','ArrowUp','Enter',' '].includes(event.key)) {
      event.preventDefault();
      if (details.open && ['Enter',' '].includes(event.key)) close(details);
      else open(details, event.key === 'ArrowUp');
      return;
    }
    if (event.key === 'Escape') {
      const current = openPopovers().at(-1);
      if (current) {event.preventDefault();close(current, true);}
      return;
    }
    if (!details?.open || !root.contains(details) || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
    const actions = actionsOf(details), index = actions.indexOf(doc.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
    focusAction(details, actions[next]);
  }

  function onFocusout(event) {
    const details = event.target.closest?.(selector);
    if (!details) return;
    // Native pointer focus briefly makes activeElement the body before focusin.
    // The known destination keeps an action reachable through the full click.
    if (event.relatedTarget) {
      if (!details.contains(event.relatedTarget)) close(details);
      return;
    }
    setTimeout(() => {
      if (details.isConnected && !details.contains(doc.activeElement)) close(details);
    }, 0);
  }

  function onToggle(event) {
    if (!event.target.matches?.(selector) || !event.target.open) return;
    openPopovers().filter(other => other !== event.target).forEach(other => close(other));
    position(event.target);
  }
  const reposition = () => openPopovers().forEach(position);
  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKeydown);
  root.addEventListener('focusout', onFocusout);
  root.addEventListener('toggle', onToggle, true);
  root.addEventListener('scroll', reposition, {capture:true, passive:true});
  win.addEventListener('resize', reposition);
  return () => {
    doc.removeEventListener('click', onClick);
    doc.removeEventListener('keydown', onKeydown);
    root.removeEventListener('focusout', onFocusout);
    root.removeEventListener('toggle', onToggle, true);
    root.removeEventListener('scroll', reposition, true);
    win.removeEventListener('resize', reposition);
  };
}
