// A small presentation cache paints the last palette before modules/profile loading.
// The profile remains authoritative; no second list of supported themes lives here.
(() => {
  try {
    const preview=new URLSearchParams(location.search).get('preview')==='1';
    const id=localStorage.getItem(preview ? 'otherwise.preview.theme' : 'otherwise.theme');
    if (id && /^[a-z][a-z0-9-]{0,47}$/.test(id)) document.documentElement.dataset.theme=id;
  } catch { /* Storage may be disabled; CSS provides the default palette. */ }
})();
