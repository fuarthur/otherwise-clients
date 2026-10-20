/** Native fullscreen keeps the map and its controls together in the top layer. */
export function createMapFullscreen({surface, button, text, onResize, hasOpenDialog = () => false, onEscape = () => false}) {
  const document = surface.ownerDocument;
  let destroyed = false, pending = false, active = true, exiting = null;
  const error = document.createElement('p');
  error.className = 'map-fullscreen-error'; error.setAttribute('role', 'alert'); error.hidden = true;
  surface.append(error);
  const isFullscreen = () => document.fullscreenElement === surface;
  function update() {
    if (destroyed) return;
    button.textContent = text(isFullscreen() ? 'exitFullscreen' : 'fullscreen');
    button.setAttribute('aria-pressed', String(isFullscreen()));
    button.title = button.textContent;
    if (!error.hidden) error.textContent = text('fullscreenUnavailable');
  }
  function changed() { update(); if (!destroyed) onResize(); }
  async function toggle() {
    if (destroyed || pending || !active) return;
    pending = true; error.hidden = true;
    try {
      if (isFullscreen()) await document.exitFullscreen();
      else { await surface.requestFullscreen(); if (destroyed || !active) exit(); }
    } catch {
      if (!destroyed) { error.textContent = text('fullscreenUnavailable'); error.hidden = false; }
    } finally { pending = false; update(); }
  }
  function exit() {
    if (!isFullscreen()) return Promise.resolve();
    return exiting ??= document.exitFullscreen().catch(() => {}).finally(() => { exiting = null; });
  }
  function keydown(event) {
    if (event.key === 'Escape' && isFullscreen() && !hasOpenDialog()) {
      event.preventDefault(); event.stopPropagation(); if (!onEscape()) exit();
    }
  }
  document.addEventListener('fullscreenchange', changed);
  document.addEventListener('keydown', keydown, true);
  update();
  return {toggle, update, exit, setActive(value) { active = Boolean(value); if (!active) exit(); }, destroy() {
    destroyed = true; exit(); document.removeEventListener('fullscreenchange', changed);
    document.removeEventListener('keydown', keydown, true); error.remove();
  }};
}
