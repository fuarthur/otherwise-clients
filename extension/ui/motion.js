const EASING = 'cubic-bezier(.22, 1, .36, 1)';
const SNAPSHOT_STYLES = ['display','position','box-sizing','width','height','min-width','min-height','max-width','max-height','top','right','bottom','left','margin','padding','border','border-radius','background','box-shadow','color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration','white-space','overflow-wrap','overflow','opacity','transform','transform-origin','flex','flex-direction','flex-wrap','align-items','align-self','justify-content','gap','grid-template-columns','grid-template-rows','list-style','vertical-align','fill','stroke','stroke-width','appearance','accent-color'];

function visualSnapshot(element, rect) {
  const clone = element.cloneNode(true);
  const originals = [element, ...element.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((original, index) => {
    const copy = copies[index], style = getComputedStyle(original);
    for (const property of SNAPSHOT_STYLES) copy.style.setProperty(property, style.getPropertyValue(property));
    copy.style.animation = 'none'; copy.style.transition = 'none';
  });
  clone.removeAttribute('open');
  Object.assign(clone.style, {position:'relative', inset:'auto', margin:'0', width:`${rect.width}px`, height:`${rect.height}px`, maxWidth:'none', maxHeight:'none', transform:'none'});
  const ghost = document.createElement('div');
  ghost.dataset.uiMotionGhost = ''; ghost.inert = true; ghost.setAttribute('aria-hidden','true');
  Object.assign(ghost.style, {position:'fixed', left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px`, pointerEvents:'none', zIndex:'2147483646'});
  // Isolated visual copies cannot match product selectors or duplicate document IDs.
  ghost.attachShadow({mode:'closed'}).append(clone);
  (document.fullscreenElement || document.body).append(ghost);
  originals.forEach((original, index) => {
    copies[index].scrollTop = original.scrollTop;
    copies[index].scrollLeft = original.scrollLeft;
  });
  return ghost;
}

/** Short presentation effects; state and focus always update synchronously. */
export function createUIMotion() {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const shownNotices = {error:null, undo:null};
  let navigation, observedNavigation;
  const resize = new ResizeObserver(() => placeNavigation(navigation));
  function cancel() {
    for (const animation of animations) animation.cancel();
    animations.clear();
  }
  function play(element, frames, duration = 220, delay = 0) {
    if (!element?.isConnected || preference.matches || document.hidden) return;
    const animation = element.animate(frames, {duration, delay, fill:'backwards', easing:EASING});
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    return animation;
  }
  function enter(element) {
    return play(element, [
      {opacity:0, transform:'translateY(8px)'},
      {opacity:1, transform:'translateY(0)'},
    ]);
  }
  function topic(element, direction = 0) {
    return play(element, [
      {opacity:0, transform:direction ? `translateX(${direction * 14}px)` : 'translateY(4px)'},
      {opacity:1, transform:'translate(0, 0)'},
    ], 200);
  }
  function reveal(element, delay = 0) {
    return play(element, [
      {opacity:0, transform:'translateY(4px)'},
      {opacity:1, transform:'translateY(0)'},
    ], 180, delay);
  }
  function saved(element) {
    return play(element, [
      {opacity:.6, transform:'scale(.92)'},
      {opacity:1, transform:'scale(1)'},
    ], 180);
  }
  function dialog(element) {
    return play(element, [
      {opacity:0, transform:'scale(.98) translateY(6px)'},
      {opacity:1, transform:'scale(1) translateY(0)'},
    ], 180);
  }
  function exit(element, {backdrop = false} = {}) {
    if (!element?.isConnected || preference.matches || document.hidden) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ghosts = [visualSnapshot(element, rect)];
    if (backdrop) {
      const shade = document.createElement('div');
      shade.dataset.uiMotionGhost = ''; shade.inert = true; shade.setAttribute('aria-hidden','true');
      const style = getComputedStyle(element, '::backdrop');
      Object.assign(shade.style, {position:'fixed', inset:'0', background:style.backgroundColor, opacity:style.opacity, pointerEvents:'none', zIndex:'2147483645'});
      (document.fullscreenElement || document.body).append(shade); ghosts.push(shade);
    }
    for (const ghost of ghosts) {
      const animation = play(ghost, [{opacity:Number(ghost.style.opacity || 1)},{opacity:0}], 120);
      if (animation) animation.finished.then(() => ghost.remove(), () => ghost.remove());
      else ghost.remove();
    }
  }
  function results(root) {
    reveal(root.querySelector('.topic-detail'));
    [...root.querySelectorAll('.topic-row')].slice(0, 6).forEach((element, index) => reveal(element, index * 25));
  }
  function notices(root, {error, undo, pending}) {
    for (const [kind, value] of Object.entries({error, undo})) {
      if (!value) { shownNotices[kind] = null; continue; }
      const element = root.querySelector(kind === 'error' ? '.error-banner' : '.interest-undo');
      if (element && !pending && shownNotices[kind] !== value) {
        shownNotices[kind] = value;
        reveal(element);
      }
    }
  }
  function captureNavigation(root) {
    const marker = root?.querySelector('.main-nav-indicator:not([hidden])');
    return marker?.getBoundingClientRect();
  }
  function placeNavigation(root, previous) {
    const nav = root?.querySelector('.main-nav');
    const marker = nav?.querySelector('.main-nav-indicator');
    if (!marker) return;
    const selected = nav.querySelector('[aria-current="page"]');
    marker.hidden = !selected;
    if (selected) {
      const target = selected.getBoundingClientRect(), parent = nav.getBoundingClientRect();
      marker.style.left = `${target.left - parent.left}px`;
      marker.style.top = `${target.top - parent.top}px`;
      marker.style.width = `${target.width}px`;
      marker.style.height = `${target.height}px`;
      if (previous && target.width && target.height) play(marker, [
        {transform:`translate(${previous.left-target.left}px, ${previous.top-target.top}px) scale(${previous.width/target.width}, ${previous.height/target.height})`},
        {transform:'translate(0, 0) scale(1)'},
      ], 210);
    }
    if (observedNavigation !== nav) {
      resize.disconnect(); resize.observe(nav); observedNavigation = nav; navigation = root;
    }
  }
  const preferenceChanged = () => { if (preference.matches) cancel(); };
  const visibilityChanged = () => {
    document.documentElement.dataset.uiMotionPaused = String(document.hidden);
    if (document.hidden) cancel();
  };
  preference.addEventListener('change', preferenceChanged);
  document.addEventListener('visibilitychange', visibilityChanged);
  visibilityChanged();
  function destroy() {
    cancel(); resize.disconnect();
    preference.removeEventListener('change', preferenceChanged);
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('pagehide', destroy);
  }
  window.addEventListener('pagehide', destroy, {once:true});
  return {
    enter, topic, reveal, saved, results, notices, dialog, exit, cancel, captureNavigation, placeNavigation, destroy,
  };
}
