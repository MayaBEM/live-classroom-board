// Little people for the students' profile pictures (and as stickers): big eyes, rosy cheeks, many hair styles.
// Every one is drawn here with code, in a 200 x 200 box.
const TAU = Math.PI * 2;
const SKIN = { light: ['#FFDCC4', '#F2B79A'], peach: ['#F9CBA7', '#E9A583'], tan: ['#E8B088', '#CF8E66'], brown: ['#C98E68', '#A86C48'], deep: ['#9C6B4B', '#7C4F35'] };
const HAIR = { black: ['#2A2530', '#4A4254'], dark: ['#4A3030', '#6A4848'], brown: ['#8A5A3E', '#A87556'], light: ['#BA8A62', '#D3A67C'], blonde: ['#E6C789', '#F3DDAE'], auburn: ['#9C4A34', '#BB6A52'] };

function path(g, fn, fill, line, lw = 3) {
  g.beginPath(); fn(g);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (line) { g.strokeStyle = line; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}
const ell = (g, x, y, rx, ry, fill, line, rot = 0, lw = 3) => path(g, c => c.ellipse(x, y, rx, ry, rot, 0, TAU), fill, line, lw);
const circ = (g, x, y, r, fill, line, lw = 3) => ell(g, x, y, r, r, fill, line, 0, lw);
const star = (g, x, y, R, r, n = 5, rot = -Math.PI / 2) => { for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, d = i % 2 ? r : R; i ? g.lineTo(x + d * Math.cos(a), y + d * Math.sin(a)) : g.moveTo(x + d * Math.cos(a), y + d * Math.sin(a)); } g.closePath(); };

// a few soft strands over a hair shape, so it is not one flat colour
function strands(g, col, list) { g.strokeStyle = col; g.lineWidth = 2.4; g.lineCap = 'round'; g.globalAlpha = 0.55; g.beginPath(); for (const [x0, y0, cx, cy, x1, y1] of list) { g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); } g.stroke(); g.globalAlpha = 1; }

// ------------------------------------------------------------------ pieces
function backHair(g, c) {
  const [h, hl] = HAIR[c.hair], st = c.style;
  if (st === 'long') { path(g, k => { k.moveTo(36, 100); k.bezierCurveTo(24, 20, 176, 20, 164, 100); k.lineTo(172, 176); k.bezierCurveTo(150, 192, 130, 172, 128, 156); k.lineTo(72, 156); k.bezierCurveTo(70, 172, 50, 192, 28, 176); k.closePath(); }, h); strands(g, hl, [[44, 78, 38, 124, 40, 168], [156, 78, 162, 124, 160, 168], [58, 70, 50, 104, 52, 150]]); }
  else if (st === 'wavy') { path(g, k => { k.moveTo(36, 100); k.bezierCurveTo(22, 18, 178, 18, 164, 100); k.bezierCurveTo(176, 120, 158, 140, 168, 160); k.bezierCurveTo(176, 180, 150, 192, 146, 172); k.bezierCurveTo(140, 190, 120, 176, 124, 158); k.lineTo(76, 158); k.bezierCurveTo(80, 176, 60, 190, 54, 172); k.bezierCurveTo(50, 192, 24, 180, 32, 160); k.bezierCurveTo(42, 140, 24, 120, 36, 100); k.closePath(); }, h); strands(g, hl, [[44, 66, 34, 120, 44, 170], [156, 66, 166, 120, 156, 170]]); }
  else if (st === 'bob') { path(g, k => { k.moveTo(36, 104); k.bezierCurveTo(22, 20, 178, 20, 164, 104); k.lineTo(166, 142); k.bezierCurveTo(140, 156, 60, 156, 34, 142); k.closePath(); }, h); strands(g, hl, [[42, 70, 38, 110, 42, 140], [158, 70, 162, 110, 158, 140]]); }
  else if (st === 'pigtails') {
    path(g, k => { k.moveTo(38, 100); k.bezierCurveTo(30, 24, 170, 24, 162, 100); k.closePath(); }, h);
    for (const s of [-1, 1]) { const x = 100 + s * 78; path(g, k => { k.moveTo(100 + s * 52, 78); k.bezierCurveTo(x + s * 22, 80, x + s * 26, 140, x + s * 4, 168); k.bezierCurveTo(x - s * 12, 176, x - s * 26, 140, 100 + s * 48, 118); k.closePath(); }, h); }
  }
  else if (st === 'bun') { circ(g, 100, 30, 24, h); path(g, k => { k.moveTo(38, 100); k.bezierCurveTo(28, 24, 172, 24, 162, 100); k.closePath(); }, h); circ(g, 100, 30, 24, null, null); strands(g, hl, [[88, 20, 100, 10, 114, 22]]); }
  else if (st === 'curly') { for (const [x, y, r] of [[36, 96, 22], [30, 126, 20], [44, 150, 18], [164, 96, 22], [170, 126, 20], [156, 150, 18], [60, 40, 24], [100, 28, 26], [140, 40, 24], [44, 66, 22], [156, 66, 22]]) circ(g, x, y, r, h); }
}
function frontHair(g, c) {
  const [h, hl] = HAIR[c.hair], st = c.style;
  if (c.boy) {
    if (st === 'short') { path(g, k => { k.moveTo(44, 92); k.bezierCurveTo(36, 26, 164, 26, 156, 92); k.bezierCurveTo(150, 74, 128, 62, 100, 70); k.bezierCurveTo(70, 62, 50, 74, 44, 92); k.closePath(); }, h); strands(g, hl, [[72, 60, 92, 52, 120, 58], [62, 68, 72, 64, 86, 68]]); }
    else if (st === 'spiky') { path(g, k => { k.moveTo(42, 94); k.lineTo(38, 52); k.lineTo(58, 60); k.lineTo(60, 22); k.lineTo(82, 44); k.lineTo(100, 12); k.lineTo(118, 44); k.lineTo(140, 22); k.lineTo(142, 60); k.lineTo(162, 52); k.lineTo(158, 94); k.bezierCurveTo(150, 76, 126, 66, 100, 72); k.bezierCurveTo(74, 66, 50, 76, 42, 94); k.closePath(); }, h); }
    else if (st === 'side') { path(g, k => { k.moveTo(42, 96); k.bezierCurveTo(30, 24, 170, 22, 158, 96); k.bezierCurveTo(156, 80, 140, 64, 118, 62); k.bezierCurveTo(100, 76, 66, 80, 48, 84); k.closePath(); }, h); strands(g, hl, [[64, 62, 92, 52, 130, 58]]); }
    else if (st === 'curlyshort') { for (const [x, y, r] of [[50, 70, 18], [74, 44, 20], [100, 36, 22], [126, 44, 20], [150, 70, 18], [60, 56, 18], [140, 56, 18]]) circ(g, x, y, r, h); path(g, k => { k.moveTo(48, 92); k.bezierCurveTo(60, 70, 140, 70, 152, 92); k.lineTo(152, 80); k.bezierCurveTo(130, 60, 70, 60, 48, 80); k.closePath(); }, h); }
    return;
  }
  if (st === 'long' || st === 'wavy' || st === 'pigtails' || st === 'bun' || st === 'curly') {
    // a straight fringe across the forehead
    path(g, k => { k.moveTo(42, 96); k.bezierCurveTo(36, 22, 164, 22, 158, 96); k.lineTo(158, 80); k.bezierCurveTo(130, 70, 70, 70, 42, 80); k.closePath(); }, h);
    strands(g, hl, [[62, 56, 70, 64, 66, 74], [100, 52, 100, 62, 98, 72], [138, 56, 130, 64, 134, 74]]);
  } else if (st === 'bob') {
    path(g, k => { k.moveTo(42, 100); k.bezierCurveTo(34, 20, 166, 20, 158, 100); k.bezierCurveTo(150, 80, 120, 66, 84, 70); k.bezierCurveTo(66, 74, 50, 86, 42, 100); k.closePath(); }, h);   // a side-swept fringe
    strands(g, hl, [[72, 58, 100, 52, 128, 62]]);
  } else if (st === 'sidepart') {
    path(g, k => { k.moveTo(42, 100); k.bezierCurveTo(34, 20, 166, 20, 158, 100); k.bezierCurveTo(150, 74, 124, 62, 76, 56); k.bezierCurveTo(66, 70, 50, 84, 42, 100); k.closePath(); }, h);
  }
}
function outfit(g, c) {
  const col = c.top, line = 'rgba(60,30,40,.35)';
  path(g, k => { k.moveTo(22, 202); k.bezierCurveTo(26, 168, 62, 152, 100, 154); k.bezierCurveTo(138, 152, 174, 168, 178, 202); k.closePath(); }, col, line, 2.4);
  if (c.outfit === 'stripes') { g.save(); g.beginPath(); g.moveTo(22, 202); g.bezierCurveTo(26, 168, 62, 152, 100, 154); g.bezierCurveTo(138, 152, 174, 168, 178, 202); g.closePath(); g.clip(); g.fillStyle = c.top2; for (let y = 150; y < 204; y += 12) g.fillRect(0, y, 200, 5); g.restore(); }
  if (c.outfit === 'dots') { g.fillStyle = c.top2; for (const [x, y] of [[50, 184], [74, 172], [100, 188], [126, 172], [150, 184], [38, 196], [162, 196]]) circ(g, x, y, 3.4, c.top2); }
  if (c.outfit === 'hoodie') { path(g, k => { k.moveTo(70, 156); k.quadraticCurveTo(100, 176, 130, 156); }, null, line, 2.4); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(88, 168); g.lineTo(86, 190); g.moveTo(112, 168); g.lineTo(114, 190); g.stroke(); }
  if (c.outfit === 'dress') { path(g, k => { k.moveTo(48, 168); k.lineTo(58, 202); k.moveTo(152, 168); k.lineTo(142, 202); }, null, c.top2, 6); }
  // neck and collar
  path(g, k => { k.moveTo(86, 138); k.lineTo(114, 138); k.lineTo(116, 160); k.quadraticCurveTo(100, 172, 84, 160); k.closePath(); }, SKIN[c.skin][1], null);
  path(g, k => { k.moveTo(78, 154); k.quadraticCurveTo(100, 176, 122, 154); }, null, 'rgba(60,30,40,.45)', 3);
  if (c.outfit === 'collar') { path(g, k => { k.moveTo(78, 154); k.lineTo(96, 176); k.lineTo(88, 160); k.closePath(); k.moveTo(122, 154); k.lineTo(104, 176); k.lineTo(112, 160); k.closePath(); }, '#fff', line, 2); }
}
function face(g, c) {
  const [sk, sh] = SKIN[c.skin], hair = HAIR[c.hair][0];
  ell(g, 45, 106, 9, 11, sk, sh, 0, 2.4); ell(g, 155, 106, 9, 11, sk, sh, 0, 2.4);      // ears
  ell(g, 100, 100, 57, 53, sk, sh, 0, 2.6);                                              // head
  ell(g, 64, 124, 14, 8.5, 'rgba(255,105,125,.5)'); ell(g, 136, 124, 14, 8.5, 'rgba(255,105,125,.5)');   // rosy cheeks
  if (c.freckles) { g.fillStyle = 'rgba(190,100,80,.55)'; for (const [x, y] of [[58, 124], [66, 128], [72, 122], [128, 122], [134, 128], [142, 124]]) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); } }
  for (const s of [-1, 1]) {   // big dark eyes with shine
    const x = 100 + s * 30;
    ell(g, x, 104, 17, 21, '#2B2024');
    circ(g, x - s * 4 - 3, 96, 6.2, '#fff'); circ(g, x + s * 6, 112, 3, '#fff');
    g.strokeStyle = '#2B2024'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
    g.moveTo(x - s * 14, 88); g.quadraticCurveTo(x, 80, x + s * 17, 92);      // upper lid
    if (!c.boy) { g.moveTo(x + s * 15, 90); g.lineTo(x + s * 23, 84); g.moveTo(x + s * 17, 95); g.lineTo(x + s * 26, 93); }   // lashes
    g.stroke();
    g.strokeStyle = hair; g.lineWidth = 3; g.globalAlpha = .75; g.beginPath(); g.moveTo(x - s * 14, 70); g.quadraticCurveTo(x, c.boy ? 64 : 66, x + s * 14, 70); g.stroke(); g.globalAlpha = 1;   // brows
  }
  g.strokeStyle = sh; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(97, 122); g.quadraticCurveTo(100, 126, 103, 122); g.stroke();   // nose
  g.strokeStyle = '#B5545F'; g.lineWidth = 2.8; g.beginPath(); if (c.mouth === 'o') g.arc(100, 136, 3.2, 0, TAU); else { g.moveTo(92, 133); g.quadraticCurveTo(100, 142, 108, 133); } g.stroke();
}
function accessory(g, c) {
  const a = c.acc;
  const bow = (x, y, s, col, rot = 0) => { g.save(); g.translate(x, y); g.rotate(rot); path(g, k => { k.moveTo(0, 0); k.bezierCurveTo(-10 * s, -14 * s, -28 * s, -10 * s, -26 * s, 4 * s); k.bezierCurveTo(-24 * s, 16 * s, -8 * s, 12 * s, 0, 0); k.moveTo(0, 0); k.bezierCurveTo(10 * s, -14 * s, 28 * s, -10 * s, 26 * s, 4 * s); k.bezierCurveTo(24 * s, 16 * s, 8 * s, 12 * s, 0, 0); }, col, 'rgba(60,20,30,.45)', 2); circ(g, 0, 0, 5 * s, col, 'rgba(60,20,30,.45)', 2); g.restore(); };
  const clip = (x, y, col, rot) => { g.save(); g.translate(x, y); g.rotate(rot); path(g, k => { k.rect(-13, -4.5, 26, 9); }, col, 'rgba(60,20,30,.4)', 2); g.restore(); };
  const flower = (x, y, col) => { for (let i = 0; i < 5; i++) { const t = i * TAU / 5; ell(g, x + 7 * Math.cos(t), y + 7 * Math.sin(t), 6, 6, col, 'rgba(60,20,30,.35)', 0, 1.6); } circ(g, x, y, 4.4, '#FFD84A', 'rgba(60,20,30,.35)', 1.6); };
  if (a === 'bows') { bow(52, 52, 0.9, '#E23B4B', -0.5); bow(148, 52, 0.9, '#E23B4B', 0.5); }
  if (a === 'clovers') { for (const x of [50, 150]) { path(g, k => { k.moveTo(x - 12, 56); k.lineTo(x + 12, 48); k.lineTo(x + 8, 62); k.closePath(); }, '#7CCB6B', 'rgba(40,90,40,.5)', 2); } }
  if (a === 'starclip') { path(g, k => star(k, 56, 66, 12, 5), '#FF8FB1', 'rgba(150,50,80,.55)', 2); clip(54, 86, '#FFD0DB', -0.6); }
  if (a === 'bluclip') clip(60, 66, '#8FD6E8', -0.5);
  if (a === 'pinkclip') clip(138, 66, '#FFB3D1', 0.4);
  if (a === 'starclips') { path(g, k => star(k, 50, 76, 13, 5.5), '#FF8FB1', 'rgba(150,50,80,.55)', 2); path(g, k => star(k, 150, 76, 13, 5.5), '#FF8FB1', 'rgba(150,50,80,.55)', 2); clip(60, 52, '#FFD0DB', -0.5); }
  if (a === 'pigbows') { bow(34, 112, 0.8, '#FF8FB1', -0.4); bow(166, 112, 0.8, '#FF8FB1', 0.4); }
  if (a === 'flower') flower(128, 46, '#FF9DB8');
  if (a === 'bowband') { path(g, k => { k.moveTo(44, 70); k.quadraticCurveTo(100, 14, 156, 70); }, null, '#FFC0D6', 7); bow(100, 28, 1.1, '#FF8FB1'); }
  if (a === 'headphones') { path(g, k => { k.moveTo(36, 100); k.bezierCurveTo(30, 10, 170, 10, 164, 100); }, null, '#C9A25E', 8); for (const x of [34, 166]) { ell(g, x, 112, 12, 17, '#E3C07A', 'rgba(90,60,20,.5)', 0, 2.5); ell(g, x, 112, 6, 10, '#C9A25E'); } path(g, k => star(k, 100, 40, 11, 4.6), '#fff', 'rgba(90,60,20,.4)', 1.6); }
  if (a === 'glasses') { g.strokeStyle = '#3B3340'; g.lineWidth = 4; for (const s of [-1, 1]) { g.beginPath(); g.arc(100 + s * 30, 104, 24, 0, TAU); g.stroke(); } g.beginPath(); g.moveTo(94, 100); g.lineTo(106, 100); g.moveTo(46, 100); g.lineTo(38, 96); g.moveTo(154, 100); g.lineTo(162, 96); g.stroke(); }
  if (a === 'beanie') { path(g, k => { k.moveTo(40, 80); k.bezierCurveTo(38, 14, 162, 14, 160, 80); k.closePath(); }, c.hat, 'rgba(60,40,10,.4)', 2.4); path(g, k => { k.rect(38, 66, 124, 22); }, c.hat2, 'rgba(60,40,10,.4)', 2.4); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); for (let x = 48; x < 160; x += 12) { g.moveTo(x, 68); g.lineTo(x, 86); } g.stroke(); circ(g, 100, 18, 12, c.hat2, 'rgba(60,40,10,.4)', 2.4); }
  if (a === 'cap') { path(g, k => { k.moveTo(40, 78); k.bezierCurveTo(38, 14, 162, 14, 160, 78); k.closePath(); }, c.hat, 'rgba(20,40,80,.4)', 2.4); path(g, k => { k.moveTo(36, 78); k.quadraticCurveTo(100, 62, 164, 78); k.lineTo(176, 92); k.quadraticCurveTo(100, 76, 24, 92); k.closePath(); }, c.hat2, 'rgba(20,40,80,.4)', 2.4); path(g, k => star(k, 100, 40, 11, 4.6), '#fff', null); }
  if (a === 'cheerbow') bow(100, 30, 1.2, '#FF6F8F');
}

// ------------------------------------------------------------------ the people
const P = {
  clover:  { skin: 'light', hair: 'black', style: 'long', top: '#fff', top2: '#BFD9F2', outfit: 'dots', acc: 'clovers' },
  ruby:    { skin: 'light', hair: 'black', style: 'long', top: '#E0364B', top2: '#B8283B', outfit: 'dress', acc: 'bows' },
  melody:  { skin: 'peach', hair: 'black', style: 'bob', top: '#fff', top2: '#E8C4A8', outfit: 'dots', acc: 'headphones' },
  honey:   { skin: 'light', hair: 'blonde', style: 'wavy', top: '#fff', top2: '#DDD', outfit: 'tee', acc: 'starclip', freckles: true },
  minty:   { skin: 'peach', hair: 'black', style: 'bob', top: '#BFE8DC', top2: '#fff', outfit: 'stripes', acc: 'bluclip' },
  rosie:   { skin: 'tan', hair: 'light', style: 'long', top: '#FFC2D8', top2: '#fff', outfit: 'stripes', acc: 'pinkclip' },
  starry:  { skin: 'light', hair: 'dark', style: 'long', top: '#FFC2D8', top2: '#E58AA4', outfit: 'tee', acc: 'starclips' },
  pippa:   { skin: 'brown', hair: 'dark', style: 'pigtails', top: '#FFD86B', top2: '#E8B53C', outfit: 'tee', acc: 'pigbows', freckles: true },
  bunny:   { skin: 'peach', hair: 'black', style: 'bun', top: '#FF9DB8', top2: '#fff', outfit: 'hoodie', acc: 'flower' },
  curly:   { skin: 'deep', hair: 'dark', style: 'curly', top: '#C9B3F2', top2: '#fff', outfit: 'tee', acc: 'bowband', mouth: 'o' },
  leo:     { skin: 'peach', hair: 'black', style: 'short', boy: true, top: '#7CCB6B', top2: '#fff', outfit: 'tee', acc: '' },
  max:     { skin: 'light', hair: 'light', style: 'spiky', boy: true, top: '#6FA8F2', top2: '#fff', outfit: 'hoodie', acc: '', freckles: true },
  sam:     { skin: 'tan', hair: 'dark', style: 'side', boy: true, top: '#fff', top2: '#ddd', outfit: 'collar', acc: 'glasses' },
  kai:     { skin: 'brown', hair: 'black', style: 'curlyshort', boy: true, top: '#FFA24D', top2: '#fff', outfit: 'tee', acc: '' },
  finn:    { skin: 'light', hair: 'auburn', style: 'short', boy: true, top: '#E0364B', top2: '#fff', outfit: 'tee', acc: 'beanie', hat: '#FFD84A', hat2: '#F2B83C', mouth: 'o' },
  ace:     { skin: 'deep', hair: 'black', style: 'short', boy: true, top: '#5B6FD6', top2: '#fff', outfit: 'tee', acc: 'cap', hat: '#2E3A66', hat2: '#4B5A99' },
};
export const GIRLS = ['clover', 'ruby', 'melody', 'honey', 'minty', 'rosie', 'starry', 'pippa', 'bunny', 'curly'];
export const BOYS = ['leo', 'max', 'sam', 'kai', 'finn', 'ace'];
export const CHAR_KEYS = [...GIRLS, ...BOYS];
// what a student gets until the teacher picks one: girls and boys mixed
export const DEFAULT_AVATARS = ['clover', 'leo', 'ruby', 'max', 'melody', 'sam', 'honey', 'kai', 'minty', 'finn', 'rosie', 'ace', 'starry', 'pippa', 'bunny', 'curly'];
export const CHAR_NAMES = { clover: 'Clover', ruby: 'Ruby', melody: 'Melody', honey: 'Honey', minty: 'Minty', rosie: 'Rosie', starry: 'Starry', pippa: 'Pippa', bunny: 'Bun', curly: 'Curly', leo: 'Leo', max: 'Max', sam: 'Sam', kai: 'Kai', finn: 'Finn', ace: 'Ace' };

export function drawChar(g, key) {
  const c = P[key]; if (!c) return;
  const sp = c.style === 'sidepart';
  backHair(g, c); outfit(g, c); face(g, c); frontHair(g, c); accessory(g, c);
  void sp;
}
