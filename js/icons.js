// One icon family: 2px strokes, square caps and mitred corners, 24px grid.
const P = {
  move: '<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>',
  pen: '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M13 7l4 4"/>',
  highlighter: '<path d="M9 14l7-9 4 3-7 9z"/><path d="M9 14l-3 5 5-2"/><path d="M4 21h8"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  line: '<path d="M4 20L20 4"/>',
  arrow: '<path d="M4 20L19 5M10 5h9v9"/>',
  rect: '<path d="M4 6h16v12H4z"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  eraser: '<path d="M14 4l6 6-9 9H6l-3-3z"/><path d="M8 10l6 6M10 19h10"/>',
  laser: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19"/>',
  undo: '<path d="M9 4L4 9l5 5"/><path d="M4 9h10a6 6 0 010 12h-4"/>',
  redo: '<path d="M15 4l5 5-5 5"/><path d="M20 9H10a6 6 0 000 12h4"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  minus: '<path d="M4 12h16"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  pages: '<path d="M7 3h10v14H7z"/><path d="M4 7v14h10"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18 14.4c2 .8 3 2.8 3 5.6"/>',
  lock: '<path d="M6 11h12v9H6z"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<path d="M6 11h12v9H6z"/><path d="M8 11V8a4 4 0 017.5-2"/>',
  follow: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  share: '<path d="M4 13v7h16v-7M12 3v12M7 8l5-5 5 5"/>',
  copy: '<path d="M9 9h11v11H9z"/><path d="M5 15V4h11"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  check: '<path d="M4 13l5 5L20 6"/>',
  upload: '<path d="M4 15v5h16v-5M12 16V4M7 9l5-5 5 5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  back: '<path d="M11 5l-7 7 7 7M4 12h16"/>',
  logout: '<path d="M10 4H4v16h6M9 12h11M16 8l4 4-4 4"/>',
  clear: '<path d="M4 6h16M6 6v14h12V6M9 3h6v3M10 10l4 6M14 10l-4 6"/>',
  protractor: '<path d="M3 19a9 9 0 0118 0z"/><path d="M12 19v-3M6.5 17l1.4-2.2M17.5 17l-1.4-2.2M4.4 14l2.6.9M19.6 14l-2.6.9"/>',
  ruler: '<path d="M2 8h20v8H2z"/><path d="M6 8v3M10 8v4.5M14 8v3M18 8v4.5"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M9 3h6M12 3v3"/>',
  star: '<path d="M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.4 6.4 20.4l1.1-6.3L3 9.7l6.2-.9z"/>',
  hand: '<path d="M8 13V6a1.5 1.5 0 013 0v6M11 12V4.5a1.5 1.5 0 013 0V12M14 12V6a1.5 1.5 0 013 0v8.5c0 4-2.5 6.5-6 6.5-3 0-4.5-2-6-4.5l-1.2-2a1.5 1.5 0 012.5-1.6L8 15"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
};

export function icon(name, size) {
  const s = size ? ` style="width:${size}px;height:${size}px"` : '';
  return `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"${s}>${P[name] || ''}</svg>`;
}
export function iconEl(name, size) {
  const t = document.createElement('template');
  t.innerHTML = icon(name, size);
  return t.content.firstChild;
}
