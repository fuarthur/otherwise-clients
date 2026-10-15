const paths = {
  stats: '<path d="M4 20h16M6 16v-4m6 4V4m6 12V8"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5Z"/>',
  bookmark: '<path d="M6 20V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v15l-6-4Z"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-40 12 12)"/><path d="M5 4a10 10 0 0 1 15 11"/>',
  settings: '<path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10"/><circle cx="11" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 7M4 12l2 7a7 7 0 0 0 12-2"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  shield: '<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7Z"/><path d="m8 12 3 3 5-6"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  single: '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M10 8h4m-4 4h4"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4Z"/><path d="M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  connection: '<rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M15 7h3m-3 10h3"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  eyeOff: '<path d="m3 3 18 18M10 5h2c5 0 9 7 9 7a18 18 0 0 1-3 4M6 6a22 22 0 0 0-3 6s4 7 9 7a12 12 0 0 0 4-1M10 10a3 3 0 0 0 4 4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3h.01"/>',
};

export function icon(name) {
  return `<svg class="ui-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || ''}</svg>`;
}
