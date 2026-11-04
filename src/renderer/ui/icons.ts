// AKTeX — inline SVG icon sprite.
//
// The base symbols come from `assets/interface icons/aktex-icons (2).svg`.
// They are embedded at runtime so the renderer works from `file://` without
// cross-document SVG requests being blocked by Chromium.
//
// Extra symbols use the same 16×16, 1.5px stroke visual language for the code
// toolbar and the newer panels.

type IconName =
  | 'new-file' | 'folder' | 'folder-open' | 'save' | 'compile' | 'stop'
  | 'search' | 'bib' | 'export' | 'import' | 'settings'
  | 'chevron-left' | 'chevron-right' | 'zoom-out' | 'zoom-in' | 'synctex'
  | 'file-tex' | 'file-bib' | 'file-pdf' | 'file-image' | 'close' | 'plus'
  | 'undo' | 'redo' | 'ai' | 'magic' | 'reference' | 'formula'
  | 'formula-view' | 'table' | 'edit' | 'image' | 'omega' | 'more'
  | 'arrow-left' | 'arrow-right' | 'chevron-down'
  | 'sync-code' | 'sync-pdf' | 'fit-width' | 'fit-page'
  | 'terminal' | 'outline' | 'panel-left' | 'file' | 'check' | 'warning'
  | 'trash' | 'log-open' | 'log-close';

const COMMON = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const SYMBOLS: Record<IconName, string> = {
  'new-file': `<path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/><line x1="8" y1="8.5" x2="8" y2="12.5"/><line x1="6" y1="10.5" x2="10" y2="10.5"/>`,
  folder: `<path d="M2 5a1 1 0 011-1h3.172a1 1 0 01.707.293L8.293 5.7A1 1 0 009 6h4a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1V5z"/>`,
  'folder-open': `<path d="M2 5a1 1 0 011-1h3.172a1 1 0 01.707.293L8.293 5.7A1 1 0 009 6h4a1 1 0 011 1v1H2V5z"/><path d="M2 8h12l-1.5 4.5a1 1 0 01-.95.5H4.45a1 1 0 01-.95-.5L2 8z"/>`,
  save: `<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 2v3.5h6V2"/><rect x="4.5" y="9" width="7" height="5" rx="0.5"/>`,
  compile: `<path d="M4.5 3.2a.8.8 0 011.2-.7l7 4.8a.8.8 0 010 1.4l-7 4.8a.8.8 0 01-1.2-.7V3.2z" fill="currentColor" stroke="none"/>`,
  stop: `<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/>`,
  search: `<circle cx="6.5" cy="6.5" r="4"/><path d="M10 10l3.5 3.5"/>`,
  bib: `<path d="M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M3 5h10"/><line x1="6" y1="8" x2="10" y2="8"/><line x1="6" y1="10.5" x2="9" y2="10.5"/>`,
  export: `<path d="M8 2v7.5"/><path d="M5 7l3 3.5 3-3.5"/><path d="M2.5 12.5h11"/>`,
  import: `<path d="M8 10.5V3"/><path d="M5 5.5l3-3.5 3 3.5"/><path d="M2.5 12.5h11"/>`,
  settings: `<circle cx="8" cy="8" r="2.3"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.27 1.27M11.33 11.33l1.27 1.27M3.4 12.6l1.27-1.27M11.33 4.67l1.27-1.27"/>`,
  'chevron-left': `<path d="M10 4L6 8l4 4"/>`,
  'chevron-right': `<path d="M6 4l4 4-4 4"/>`,
  'zoom-out': `<circle cx="6.5" cy="6.5" r="4"/><path d="M10 10l3.5 3.5"/><line x1="4.5" y1="6.5" x2="8.5" y2="6.5"/>`,
  'zoom-in': `<circle cx="6.5" cy="6.5" r="4"/><path d="M10 10l3.5 3.5"/><line x1="6.5" y1="4.5" x2="6.5" y2="8.5"/><line x1="4.5" y1="6.5" x2="8.5" y2="6.5"/>`,
  synctex: `<path d="M2 5.5h9M8 2.5l3 3-3 3"/><path d="M14 10.5H5M8 7.5l-3 3 3 3"/>`,
  'file-tex': `<path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/>`,
  'file-bib': `<path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/><line x1="5.5" y1="9" x2="10.5" y2="9"/><line x1="5.5" y1="11" x2="8.5" y2="11"/>`,
  'file-pdf': `<path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/><path d="M5 9.5c0-.8.6-1.5 1.5-1.5S8 8.7 8 9.5 7.4 11 6.5 11H5V8"/>`,
  'file-image': `<rect x="2" y="2" width="12" height="12" rx="1.5"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none"/><path d="M2 11.5l3.5-4 3 3 2-2 3 2.5"/>`,
  close: `<line x1="4.5" y1="4.5" x2="11.5" y2="11.5"/><line x1="11.5" y1="4.5" x2="4.5" y2="11.5"/>`,
  plus: `<line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/>`,

  // ── Code toolbar / tools ────────────────────────────────────────────────
  undo: `<path d="M5.5 4.5L2.5 7.5l3 3"/><path d="M2.5 7.5H10a3.5 3.5 0 010 7H8"/>`,
  redo: `<path d="M10.5 4.5l3 3-3 3"/><path d="M13.5 7.5H6a3.5 3.5 0 000 7h2"/>`,
  ai: `<rect x="3" y="5.5" width="10" height="7.5" rx="2"/><circle cx="6" cy="9" r=".9" fill="currentColor" stroke="none"/><circle cx="10" cy="9" r=".9" fill="currentColor" stroke="none"/><path d="M8 2v1.4M6.3 3.2l.7 1.1M9.7 3.2l-.7 1.1M5.5 12v1.2M10.5 12v1.2"/>`,
  magic: `<path d="M9.5 6.5l-6 6a1.4 1.4 0 01-2-2l6-6"/><path d="M8 4l1.5-1.5M12 8l1.5-1.5M12.5 2.5l.5 1 .9.5-.9.5-.5 1-.5-1-.9-.5.9-.5.5-1z"/>`,
  reference: `<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M5.5 9.5l1-1.2 1.2 1.5 1.5-2 1.3 1.7"/><line x1="5" y1="5.5" x2="11" y2="5.5"/>`,
  formula: `<path d="M2.5 9.5l1.8 3.5L7.5 3h6"/><path d="M9 7.5h4M11 5.5v4"/>`,
  'formula-view': `<path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>`,
  table: `<rect x="2" y="2.5" width="12" height="11" rx="1.2"/><path d="M2 6h12M2 9.5h12M6 2.5v11M10 2.5v11"/>`,
  edit: `<path d="M11.2 2.3l2.5 2.5L5 13.5l-3 .5.5-3 8.7-8.7z"/><path d="M9.6 3.9l2.5 2.5"/>`,
  image: `<rect x="2" y="2" width="12" height="12" rx="1.5"/><circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none"/><path d="M2 11.5l3.5-4 3 3 2-2 3 2.5"/>`,
  omega: `<path d="M4.2 12.5H2.3v-1c1.7-.9 2.5-2 2.5-3.6C4.8 5.4 6.2 3.5 8 3.5s3.2 1.9 3.2 4.4c0 1.6.8 2.7 2.5 3.6v1h-1.9"/><path d="M5.6 12.5h4.8"/>`,
  more: `<circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none"/>`,
  'arrow-left': `<path d="M13 8H3M7 4L3 8l4 4"/>`,
  'arrow-right': `<path d="M3 8h10M9 4l4 4-4 4"/>`,
  'chevron-down': `<path d="M4 6l4 4 4-4"/>`,
  'sync-code': `<path d="M2 4.5h7M6.5 2l2.5 2.5L6.5 7"/><rect x="9" y="8.5" width="5" height="5.5" rx="1"/><path d="M14 11.5H7M11.5 14L9 11.5l2.5-2.5"/>`,
  'sync-pdf': `<rect x="2" y="2.5" width="5" height="6.5" rx="1"/><path d="M2 5h5"/><path d="M7 10.5h7M11.5 8l2.5 2.5-2.5 2.5"/><path d="M9 6h5"/>`,
  'fit-width': `<path d="M2 3v10M14 3v10M4.5 8h7M6.5 6L4.5 8l2 2M9.5 6l2 2-2 2"/>`,
  'fit-page': `<rect x="2.5" y="2.5" width="11" height="11" rx="1"/><path d="M5 8h6M6.5 6.5L5 8l1.5 1.5M9.5 6.5L11 8l-1.5 1.5"/>`,
  terminal: `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8 10h4"/>`,
  outline: `<path d="M5.5 3.5H14M5.5 8H14M5.5 12.5H14"/><circle cx="2.5" cy="3.5" r=".8" fill="currentColor" stroke="none"/><circle cx="2.5" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="2.5" cy="12.5" r=".8" fill="currentColor" stroke="none"/>`,
  'panel-left': `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M6 2.5v11"/>`,
  file: `<path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4"/>`,
  check: `<path d="M3 8.5l3.2 3L13 4.8"/>`,
  warning: `<path d="M8 2.2l6 10.8H2L8 2.2z"/><path d="M8 6v3.2"/><circle cx="8" cy="11.2" r=".7" fill="currentColor" stroke="none"/>`,
  trash: `<path d="M3 4.5h10M6 4.5V3h4v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/><path d="M6.8 7v3.8M9.2 7v3.8"/>`,
  'log-open': `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8 10h4"/><path d="M1.5 5h13"/>`,
  'log-close': `<rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M4 6l2.5 2L4 10M8 10h4"/><path d="M12 2.5v11"/>`,
};

/** Build a complete inline `<svg>` for one icon. */
export function icon(name: IconName | string, size = 16, className = ''): string {
  const extra = className ? ` ${className}` : '';
  return `<svg class="ak-icon${extra}" width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true"><use href="#ak-icon-${name}"></use></svg>`;
}

/** Append the sprite once, as the first child of <body>. */
export function installIconSprite(): void {
  if (document.getElementById('ak-icon-sprite')) return;
  const holder = document.createElement('div');
  holder.id = 'ak-icon-sprite';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  const parts = Object.entries(SYMBOLS).map(([name, body]) =>
    `<symbol id="ak-icon-${name}" viewBox="0 0 16 16" ${COMMON}>${body}</symbol>`);
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${parts.join('')}</svg>`;
  document.body.insertBefore(holder, document.body.firstChild);
}
