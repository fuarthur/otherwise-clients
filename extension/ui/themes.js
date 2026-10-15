import {DEFAULT_THEME,getTheme} from '../core/themes.js';

export function applyTheme(id) {
  const theme=getTheme(id) || getTheme(DEFAULT_THEME);
  document.documentElement.dataset.theme=theme.id;
  document.documentElement.style.colorScheme=theme.colorScheme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',theme.colorScheme);
  try {
    const preview=new URLSearchParams(location.search).get('preview')==='1';
    localStorage.setItem(preview ? 'otherwise.preview.theme' : 'otherwise.theme',theme.id);
  } catch { /* Theme switching still works when the presentation cache is unavailable. */ }
}
