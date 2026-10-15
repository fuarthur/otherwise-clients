// Stable preference IDs. Add a definition, translated label and CSS palette for
// another bundled theme; callers derive their choices from this registry.
export const DEFAULT_THEME='dark';
export const THEMES=Object.freeze([
  Object.freeze({id:'dark',label:'themeDark',colorScheme:'dark'}),
  Object.freeze({id:'light',label:'themeLight',colorScheme:'light'}),
]);

export function getTheme(id) {
  return THEMES.find(theme=>theme.id===id) || null;
}

export function normalizeThemeId(id) {
  return getTheme(id)?.id || DEFAULT_THEME;
}
