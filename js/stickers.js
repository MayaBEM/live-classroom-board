// Cute stickers, paper notes and washi tape, all drawn here with code (no pictures to load).
// Stickers are drawn once in a 200 x 200 box, given a white "die-cut" edge, and kept as small pictures (sprites).
const TAU = Math.PI * 2;
const INK = '#5B4046';          // eyes and small marks
const CHEEK = 'rgba(255,128,150,.55)';

// ---------------------------------------------------------------- small drawing helpers
function path(g, fn, fill, line, lw = 3) {
  g.beginPath(); fn(g);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (line) { g.strokeStyle = line; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}
const ell = (g, x, y, rx, ry, fill, line, rot = 0, lw = 3) => path(g, c => c.ellipse(x, y, rx, ry, rot, 0, TAU), fill, line, lw);
const circ = (g, x, y, r, fill, line, lw = 3) => ell(g, x, y, r, r, fill, line, 0, lw);
function rrect(g, x, y, w, h, r, fill, line, lw = 3) {
  path(g, c => { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }, fill, line, lw);
}
// a kawaii face: two dot eyes, pink cheeks, a tiny mouth
function face(g, x, y, k = 1, mouth = 'w') {
  ell(g, x - 22 * k, y, 5 * k, 6.5 * k, INK); ell(g, x + 22 * k, y, 5 * k, 6.5 * k, INK);
  circ(g, x - 20 * k - 1.6 * k, y - 2.4 * k, 1.7 * k, '#fff'); circ(g, x + 22 * k - 1.6 * k, y - 2.4 * k, 1.7 * k, '#fff');
  ell(g, x - 37 * k, y + 11 * k, 8 * k, 5 * k, CHEEK); ell(g, x + 37 * k, y + 11 * k, 8 * k, 5 * k, CHEEK);
  g.strokeStyle = INK; g.lineWidth = 2.6 * k; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  if (mouth === 'w') { g.moveTo(x - 7 * k, y + 8 * k); g.quadraticCurveTo(x - 3.5 * k, y + 14 * k, x, y + 8 * k); g.quadraticCurveTo(x + 3.5 * k, y + 14 * k, x + 7 * k, y + 8 * k); }
  else if (mouth === 'o') { g.arc(x, y + 11 * k, 3 * k, 0, TAU); }
  else { g.moveTo(x - 6 * k, y + 9 * k); g.quadraticCurveTo(x, y + 16 * k, x + 6 * k, y + 9 * k); }
  g.stroke();
}
const star = (g, x, y, R, r, n = 5, rot = -Math.PI / 2) => { for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, d = i % 2 ? r : R; i ? g.lineTo(x + d * Math.cos(a), y + d * Math.sin(a)) : g.moveTo(x + d * Math.cos(a), y + d * Math.sin(a)); } g.closePath(); };
const heartPath = (g, x, y, s) => { g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.35); g.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); g.closePath(); };

// ---------------------------------------------------------------- the stickers
// each one draws into a 200 x 200 box
const D = {
  bunny(g) {
    ell(g, 66, 52, 17, 42, '#fff', '#C9A3AE', -0.12); ell(g, 66, 54, 8, 28, '#FFC3D3', null, -0.12);
    ell(g, 134, 52, 17, 42, '#fff', '#C9A3AE', 0.12); ell(g, 134, 54, 8, 28, '#FFC3D3', null, 0.12);
    ell(g, 100, 122, 66, 56, '#fff', '#C9A3AE'); face(g, 100, 124, 1.05);
    path(g, c => { c.moveTo(132, 84); c.lineTo(122, 70); c.lineTo(150, 70); c.closePath(); }, null); // (keeps the bow in place below)
    path(g, c => { c.moveTo(140, 82); c.quadraticCurveTo(128, 62, 124, 84); c.quadraticCurveTo(130, 94, 140, 82); c.moveTo(140, 82); c.quadraticCurveTo(158, 66, 160, 90); c.quadraticCurveTo(150, 96, 140, 82); }, '#FF9DB8', '#D9728F', 2.5);
    circ(g, 140, 82, 5, '#FF7FA0', '#D9728F', 2);
  },
  bear(g) {
    circ(g, 52, 62, 24, '#B98557', '#8A5A38'); circ(g, 52, 62, 12, '#E8B88C'); circ(g, 148, 62, 24, '#B98557', '#8A5A38'); circ(g, 148, 62, 12, '#E8B88C');
    ell(g, 100, 112, 70, 62, '#B98557', '#8A5A38'); face(g, 100, 106, 1.05, 'o');
    ell(g, 100, 128, 26, 19, '#F0CBA4'); ell(g, 100, 120, 7, 5, '#5B3A2A');
    g.strokeStyle = '#5B3A2A'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(100, 125); g.lineTo(100, 131); g.moveTo(91, 134); g.quadraticCurveTo(100, 140, 109, 134); g.stroke();
  },
  cat(g) {
    path(g, c => { c.moveTo(38, 92); c.lineTo(44, 30); c.lineTo(86, 62); c.closePath(); }, '#fff', '#B9A59E'); path(g, c => { c.moveTo(162, 92); c.lineTo(156, 30); c.lineTo(114, 62); c.closePath(); }, '#fff', '#B9A59E');
    path(g, c => { c.moveTo(50, 78); c.lineTo(52, 48); c.lineTo(72, 64); c.closePath(); }, '#FFC3D3');
    ell(g, 100, 116, 72, 58, '#fff', '#B9A59E');
    path(g, c => { c.ellipse(138, 92, 28, 24, 0.4, 0, TAU); }, '#E9A66B'); ell(g, 100, 116, 72, 58, null, '#B9A59E');
    face(g, 100, 118, 1.05); path(g, c => { c.moveTo(94, 126); c.lineTo(106, 126); c.lineTo(100, 133); c.closePath(); }, '#FF9DB8');
    g.strokeStyle = '#B9A59E'; g.lineWidth = 2; g.beginPath(); for (const s of [-1, 1]) { g.moveTo(100 + s * 56, 124); g.lineTo(100 + s * 82, 120); g.moveTo(100 + s * 56, 132); g.lineTo(100 + s * 82, 136); } g.stroke();
  },
  dog(g) {
    ell(g, 46, 92, 22, 42, '#D9A066', '#A8723C', 0.25); ell(g, 154, 92, 22, 42, '#D9A066', '#A8723C', -0.25);
    ell(g, 100, 108, 62, 58, '#F6DDB5', '#C9A06A'); ell(g, 100, 132, 30, 22, '#fff'); face(g, 100, 106, 1.0, 'o');
    ell(g, 100, 124, 8, 6, '#5B3A2A'); g.strokeStyle = '#5B3A2A'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(100, 130); g.lineTo(100, 136); g.moveTo(90, 139); g.quadraticCurveTo(100, 146, 110, 139); g.stroke();
    ell(g, 100, 160, 12, 8, '#FF8FAE');
  },
  chick(g) {
    ell(g, 100, 112, 70, 64, '#FFE066', '#E2B73A'); path(g, c => { c.moveTo(94, 50); c.quadraticCurveTo(100, 30, 106, 50); c.moveTo(100, 52); c.quadraticCurveTo(114, 36, 118, 54); }, null, '#E2B73A', 4);
    face(g, 100, 104, 1.05, ''); path(g, c => { c.moveTo(88, 116); c.lineTo(112, 116); c.lineTo(100, 130); c.closePath(); }, '#FFA24D', '#D17C26', 2.5);
    ell(g, 36, 118, 14, 22, '#FFD84A', '#E2B73A', 0.4); ell(g, 164, 118, 14, 22, '#FFD84A', '#E2B73A', -0.4);
    path(g, c => { c.moveTo(80, 172); c.lineTo(80, 186); c.moveTo(120, 172); c.lineTo(120, 186); }, null, '#FFA24D', 5);
  },
  frog(g) {
    circ(g, 62, 56, 22, '#8FD18A', '#5BA356'); circ(g, 138, 56, 22, '#8FD18A', '#5BA356'); circ(g, 62, 56, 12, '#fff'); circ(g, 138, 56, 12, '#fff'); circ(g, 64, 58, 6, INK); circ(g, 136, 58, 6, INK);
    ell(g, 100, 118, 76, 56, '#8FD18A', '#5BA356'); ell(g, 62, 126, 9, 6, CHEEK); ell(g, 138, 126, 9, 6, CHEEK);
    g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(74, 124); g.quadraticCurveTo(100, 150, 126, 124); g.stroke();
    circ(g, 90, 100, 3, '#5BA356'); circ(g, 110, 100, 3, '#5BA356');
  },
  panda(g) {
    circ(g, 50, 60, 22, '#3B3B45'); circ(g, 150, 60, 22, '#3B3B45');
    ell(g, 100, 112, 70, 62, '#fff', '#B8B8C0'); ell(g, 68, 104, 15, 20, '#3B3B45', null, 0.3); ell(g, 132, 104, 15, 20, '#3B3B45', null, -0.3);
    circ(g, 68, 103, 5, '#fff'); circ(g, 132, 103, 5, '#fff'); circ(g, 69, 104, 2.6, INK); circ(g, 131, 104, 2.6, INK);
    ell(g, 54, 132, 8, 5, CHEEK); ell(g, 146, 132, 8, 5, CHEEK); ell(g, 100, 122, 7, 5, '#3B3B45');
    g.strokeStyle = '#3B3B45'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(100, 127); g.lineTo(100, 132); g.moveTo(91, 135); g.quadraticCurveTo(100, 141, 109, 135); g.stroke();
  },
  pig(g) {
    path(g, c => { c.moveTo(50, 70); c.lineTo(46, 32); c.lineTo(84, 54); c.closePath(); }, '#FFB3C7', '#E58AA4'); path(g, c => { c.moveTo(150, 70); c.lineTo(154, 32); c.lineTo(116, 54); c.closePath(); }, '#FFB3C7', '#E58AA4');
    ell(g, 100, 112, 72, 62, '#FFC4D4', '#E58AA4'); face(g, 100, 100, 1.0, ''); ell(g, 100, 128, 24, 17, '#FF9DB8', '#E58AA4'); circ(g, 91, 128, 3.6, '#C95E7E'); circ(g, 109, 128, 3.6, '#C95E7E');
  },
  strawberry(g) {
    path(g, c => { c.moveTo(100, 176); c.bezierCurveTo(36, 150, 26, 88, 56, 66); c.bezierCurveTo(78, 54, 92, 66, 100, 62); c.bezierCurveTo(108, 66, 122, 54, 144, 66); c.bezierCurveTo(174, 88, 164, 150, 100, 176); c.closePath(); }, '#FF6F7F', '#D6455B');
    for (const [x, y] of [[66, 96], [100, 90], [134, 96], [80, 130], [120, 130], [100, 150], [58, 122], [142, 122]]) ell(g, x, y, 3, 4.6, '#FFE9A8');
    face(g, 100, 112, 0.9, 'w');
    path(g, c => { c.moveTo(100, 62); c.lineTo(70, 40); c.lineTo(88, 52); c.lineTo(84, 26); c.lineTo(100, 48); c.lineTo(116, 26); c.lineTo(112, 52); c.lineTo(130, 40); c.closePath(); }, '#7CCB6B', '#4F9C44');
  },
  cherry(g) {
    path(g, c => { c.moveTo(64, 134); c.quadraticCurveTo(76, 70, 112, 34); c.moveTo(138, 144); c.quadraticCurveTo(128, 76, 112, 34); }, null, '#4F9C44', 5);
    path(g, c => { c.moveTo(112, 34); c.quadraticCurveTo(142, 26, 158, 48); c.quadraticCurveTo(130, 56, 112, 34); }, '#7CCB6B', '#4F9C44', 3);
    circ(g, 62, 144, 32, '#E8394F', '#B22338'); circ(g, 138, 152, 32, '#E8394F', '#B22338'); ell(g, 50, 132, 8, 5, 'rgba(255,255,255,.7)', null, -0.6); ell(g, 126, 140, 8, 5, 'rgba(255,255,255,.7)', null, -0.6);
  },
  cake(g) {
    path(g, c => { c.moveTo(24, 150); c.lineTo(36, 78); c.lineTo(176, 100); c.lineTo(176, 150); c.closePath(); }, '#FFF3D6', '#D8B98A');
    path(g, c => { c.moveTo(36, 78); c.lineTo(176, 100); c.lineTo(176, 112); c.lineTo(32, 100); c.closePath(); }, '#FFD0DB', '#E58AA4', 2.5);
    path(g, c => { c.moveTo(28, 128); c.lineTo(176, 130); }, null, '#FFB3C7', 6);
    path(g, c => { c.moveTo(24, 150); c.lineTo(176, 150); c.lineTo(176, 160); c.lineTo(24, 160); c.closePath(); }, '#F2D6A6', '#D8B98A', 2.5);
    path(g, c => { c.moveTo(94, 72); c.bezierCurveTo(72, 70, 70, 40, 94, 38); c.bezierCurveTo(118, 40, 118, 70, 94, 72); c.closePath(); }, '#FF6F7F', '#D6455B'); path(g, c => { c.moveTo(94, 40); c.lineTo(80, 30); c.moveTo(94, 40); c.lineTo(108, 30); }, null, '#4F9C44', 4);
    face(g, 100, 130, 0.5, 'w');
  },
  boba(g) {
    path(g, c => { c.moveTo(118, 8); c.lineTo(104, 62); }, null, '#FF8FAE', 9);
    path(g, c => { c.moveTo(48, 54); c.lineTo(152, 54); c.lineTo(138, 176); c.lineTo(62, 176); c.closePath(); }, 'rgba(255,255,255,.9)', '#C9A3AE');
    path(g, c => { c.moveTo(53, 82); c.lineTo(147, 82); c.lineTo(138, 176); c.lineTo(62, 176); c.closePath(); }, '#FFB8CB');
    for (const [x, y] of [[76, 160], [96, 164], [116, 160], [86, 146], [106, 148], [126, 146]]) circ(g, x, y, 7, '#6B4636');
    rrect(g, 42, 44, 116, 16, 6, '#FFD0DB', '#C9A3AE'); face(g, 100, 112, 0.8, 'w');
  },
  milk(g) {
    path(g, c => { c.moveTo(48, 64); c.lineTo(152, 64); c.lineTo(152, 182); c.lineTo(48, 182); c.closePath(); }, '#fff', '#B8A0A8');
    path(g, c => { c.moveTo(48, 64); c.lineTo(66, 24); c.lineTo(134, 24); c.lineTo(152, 64); c.closePath(); }, '#FFD0DB', '#E58AA4');
    path(g, c => { c.moveTo(66, 24); c.lineTo(134, 24); c.lineTo(134, 36); c.lineTo(66, 36); c.closePath(); }, '#FF9DB8', '#E58AA4', 2.5);
    g.fillStyle = '#E8657F'; g.font = '700 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MILK', 100, 88);
    face(g, 100, 130, 0.9, 'w');
    path(g, c => { c.moveTo(122, 160); c.bezierCurveTo(112, 170, 124, 178, 132, 172); c.bezierCurveTo(140, 178, 150, 170, 142, 160); c.closePath(); }, '#FF6F7F');
  },
  icecream(g) {
    path(g, c => { c.moveTo(64, 98); c.lineTo(136, 98); c.lineTo(100, 186); c.closePath(); }, '#F2C27A', '#C98F43');
    g.strokeStyle = '#D9A24F'; g.lineWidth = 2; g.beginPath(); g.moveTo(74, 112); g.lineTo(116, 126); g.moveTo(66, 100); g.lineTo(104, 150); g.moveTo(134, 100); g.lineTo(96, 150); g.moveTo(126, 112); g.lineTo(84, 126); g.stroke();
    path(g, c => { c.moveTo(52, 100); c.bezierCurveTo(30, 96, 40, 62, 66, 64); c.bezierCurveTo(60, 40, 90, 32, 100, 50); c.bezierCurveTo(112, 30, 146, 44, 136, 66); c.bezierCurveTo(164, 66, 168, 98, 148, 100); c.closePath(); }, '#FFF6E6', '#D8B98A');
    face(g, 100, 82, 0.85, 'w');
  },
  toast(g) {
    path(g, c => { c.moveTo(48, 70); c.bezierCurveTo(28, 62, 36, 28, 70, 32); c.bezierCurveTo(88, 20, 112, 20, 130, 32); c.bezierCurveTo(164, 28, 172, 62, 152, 70); c.lineTo(152, 168); c.lineTo(48, 168); c.closePath(); }, '#E9B572', '#B9803F');
    path(g, c => { c.moveTo(60, 74); c.lineTo(140, 74); c.lineTo(140, 156); c.lineTo(60, 156); c.closePath(); }, '#FFF1D0');
    face(g, 100, 110, 0.95, 'w');
  },
  macaron(g) {
    path(g, c => { c.moveTo(34, 98); c.bezierCurveTo(30, 50, 170, 50, 166, 98); c.closePath(); }, '#FFB3C7', '#E58AA4'); path(g, c => { c.moveTo(34, 112); c.bezierCurveTo(30, 166, 170, 166, 166, 112); c.closePath(); }, '#FFB3C7', '#E58AA4');
    rrect(g, 36, 94, 128, 22, 10, '#FFF3E6', '#E8CFC0'); face(g, 100, 132, 0.7, 'w');
  },
  heart(g) { path(g, c => heartPath(c, 100, 98, 64), '#FF8FB1', '#D9628A'); ell(g, 66, 70, 11, 7, 'rgba(255,255,255,.75)', null, -0.7); circ(g, 82, 58, 3, 'rgba(255,255,255,.8)'); face(g, 100, 108, 0.8, 'w'); },
  star(g) { path(g, c => star(c, 100, 104, 84, 38), '#FFE066', '#E2B73A'); face(g, 100, 108, 0.8, 'w'); ell(g, 76, 66, 8, 5, 'rgba(255,255,255,.7)', null, -0.5); },
  cloud(g) {
    path(g, c => { c.moveTo(44, 142); c.bezierCurveTo(12, 142, 12, 96, 46, 98); c.bezierCurveTo(44, 56, 100, 46, 112, 84); c.bezierCurveTo(132, 56, 176, 78, 160, 108); c.bezierCurveTo(190, 112, 184, 150, 156, 142); c.closePath(); }, '#fff', '#B7C9E4');
    face(g, 100, 112, 0.85, 'w');
  },
  bow(g) {
    path(g, c => { c.moveTo(100, 100); c.bezierCurveTo(70, 50, 24, 40, 20, 80); c.bezierCurveTo(16, 126, 62, 144, 100, 100); c.closePath(); }, '#FFB3D1', '#D9628A'); path(g, c => { c.moveTo(100, 100); c.bezierCurveTo(130, 50, 176, 40, 180, 80); c.bezierCurveTo(184, 126, 138, 144, 100, 100); c.closePath(); }, '#FFB3D1', '#D9628A');
    path(g, c => { c.moveTo(94, 108); c.lineTo(62, 176); c.lineTo(84, 168); c.lineTo(98, 184); c.lineTo(106, 112); c.closePath(); }, '#FF9DB8', '#D9628A'); path(g, c => { c.moveTo(106, 108); c.lineTo(138, 176); c.lineTo(116, 168); c.lineTo(102, 184); c.lineTo(94, 112); c.closePath(); }, '#FF9DB8', '#D9628A');
    ell(g, 100, 98, 16, 20, '#FF8FB1', '#D9628A'); g.strokeStyle = 'rgba(217,98,138,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(50, 78); g.quadraticCurveTo(70, 80, 86, 96); g.moveTo(150, 78); g.quadraticCurveTo(130, 80, 114, 96); g.stroke();
  },
  flower(g) {
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; ell(g, 100 + 46 * Math.cos(a), 100 + 46 * Math.sin(a), 30, 36, '#FFA9C6', '#D9628A', a + Math.PI / 2); }
    circ(g, 100, 100, 24, '#FFE066', '#E2B73A'); circ(g, 92, 96, 3, INK); circ(g, 108, 96, 3, INK); g.strokeStyle = INK; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.arc(100, 102, 6, 0.2, Math.PI - 0.2); g.stroke();
  },
  daisy(g) {
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10; ell(g, 100 + 52 * Math.cos(a), 100 + 52 * Math.sin(a), 15, 34, '#fff', '#C9D3E0', a + Math.PI / 2); }
    circ(g, 100, 100, 26, '#FFD84A', '#E2B73A'); circ(g, 91, 97, 3, INK); circ(g, 109, 97, 3, INK); g.strokeStyle = INK; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.arc(100, 103, 6, 0.2, Math.PI - 0.2); g.stroke();
  },
  butterfly(g) {
    path(g, c => { c.ellipse(60, 70, 44, 50, -0.4, 0, TAU); }, '#C9B3F2', '#9E82D6'); path(g, c => { c.ellipse(140, 70, 44, 50, 0.4, 0, TAU); }, '#C9B3F2', '#9E82D6');
    path(g, c => { c.ellipse(68, 140, 32, 38, 0.5, 0, TAU); }, '#E0D2FA', '#9E82D6'); path(g, c => { c.ellipse(132, 140, 32, 38, -0.5, 0, TAU); }, '#E0D2FA', '#9E82D6');
    circ(g, 56, 66, 11, '#fff', null); circ(g, 144, 66, 11, '#fff', null); ell(g, 100, 108, 10, 50, '#7A5C8E', '#5B4170');
    path(g, c => { c.moveTo(96, 62); c.quadraticCurveTo(86, 36, 74, 34); c.moveTo(104, 62); c.quadraticCurveTo(114, 36, 126, 34); }, null, '#5B4170', 3); circ(g, 100, 74, 2, '#fff');
  },
  paw(g) {
    for (const [x, y, rx, ry, r] of [[44, 90, 14, 20, -0.4], [78, 56, 14, 20, -0.12], [122, 56, 14, 20, 0.12], [156, 90, 14, 20, 0.4]]) ell(g, x, y, rx, ry, '#FFA9C6', '#D9628A', r);
    path(g, c => { c.moveTo(100, 88); c.bezierCurveTo(60, 88, 40, 134, 62, 156); c.bezierCurveTo(78, 172, 90, 160, 100, 160); c.bezierCurveTo(110, 160, 122, 172, 138, 156); c.bezierCurveTo(160, 134, 140, 88, 100, 88); c.closePath(); }, '#FFA9C6', '#D9628A');
  },
  sparkle(g) { path(g, c => star(c, 74, 100, 56, 14, 4), '#FFE066', '#E2B73A'); path(g, c => star(c, 142, 58, 28, 8, 4), '#FFE066', '#E2B73A'); path(g, c => star(c, 146, 146, 24, 7, 4), '#FFE9A0', '#E2B73A'); },
  rainbow(g) {
    const cols = ['#FF8F8F', '#FFC78F', '#FFEA8F', '#A8E6A1', '#9BD0F5', '#C4B0F0'];
    cols.forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 15; g.lineCap = 'butt'; g.beginPath(); g.arc(100, 140, 78 - i * 13, Math.PI, 0); g.stroke(); });
    ell(g, 32, 142, 26, 18, '#fff', '#B7C9E4'); ell(g, 168, 142, 26, 18, '#fff', '#B7C9E4'); circ(g, 50, 146, 18, '#fff'); circ(g, 150, 146, 18, '#fff');
  },
  // ----- paper notes
  noteGrid(g) { rrect(g, 28, 40, 144, 140, 4, '#FFD3DD', '#2F2A2D', 2.4); g.fillStyle = '#fff'; for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) g.fillRect(40 + c * 22, 52 + r * 21, 12, 12); path(g, c => { c.moveTo(18, 54); c.lineTo(52, 30); c.lineTo(70, 52); c.lineTo(36, 76); c.closePath(); }, '#CDBEF0', '#2F2A2D', 2); },
  notePlain(g) { rrect(g, 30, 36, 140, 146, 3, '#fff', '#2F2A2D', 2.4); path(g, c => { c.moveTo(70, 28); c.lineTo(132, 24); c.lineTo(134, 48); c.lineTo(72, 50); c.closePath(); }, '#FFB3C7', '#E58AA4', 2); g.strokeStyle = '#FFD0DB'; g.lineWidth = 3; g.beginPath(); g.moveTo(80, 36); g.lineTo(124, 34); g.stroke(); },
  noteLined(g) { rrect(g, 30, 30, 140, 150, 3, '#DDD3F3', '#2F2A2D', 2.4); path(g, c => { c.rect(30, 30, 30, 150); }, '#B7A5E0', '#2F2A2D', 2); for (const y of [56, 94, 132]) circ(g, 44, y, 6, '#fff', '#2F2A2D', 2); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 6; i++) { g.moveTo(68, 52 + i * 22); g.lineTo(160, 52 + i * 22); } g.stroke(); },
  noteMint(g) { path(g, c => { c.moveTo(34, 32); c.lineTo(168, 32); c.lineTo(168, 134); c.lineTo(138, 176); c.lineTo(34, 176); c.closePath(); }, '#D8F1F2', '#2F2A2D', 2.4); path(g, c => { c.moveTo(138, 176); c.lineTo(138, 142); c.lineTo(168, 134); c.closePath(); }, '#BFC6CC', '#2F2A2D', 2); path(g, c => { c.moveTo(84, 22); c.lineTo(122, 22); c.lineTo(122, 46); c.lineTo(84, 46); c.closePath(); }, '#FFB3C7', '#E58AA4', 2); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); for (let i = -1; i < 4; i++) { g.moveTo(88 + i * 14, 24); g.lineTo(80 + i * 14 + 22, 44); } g.stroke(); },
  noteYellow(g) { rrect(g, 30, 36, 140, 142, 3, '#FBF6DD', '#2F2A2D', 2.4); path(g, c => { c.rect(30, 36, 140, 26); }, '#BBA8DE', '#2F2A2D', 2.4); path(g, c => { c.moveTo(150, 178); c.lineTo(170, 150); c.lineTo(170, 178); c.closePath(); }, '#BFC6CC', '#2F2A2D', 2); },
  noteSpiral(g) { rrect(g, 46, 34, 128, 146, 3, '#D9D0F2', '#2F2A2D', 2.4); g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 6; i++) { g.moveTo(64 + i * 18, 44); g.lineTo(64 + i * 18, 170); g.moveTo(56, 54 + i * 22); g.lineTo(166, 54 + i * 22); } g.stroke(); for (let i = 0; i < 8; i++) { circ(g, 46, 46 + i * 17, 5, '#fff', '#2F2A2D', 2); path(g, c => { c.moveTo(34, 46 + i * 17); c.lineTo(56, 46 + i * 17); }, null, '#2F2A2D', 2.4); } },
  noteCurl(g) { path(g, c => { c.moveTo(34, 30); c.lineTo(168, 30); c.lineTo(168, 164); c.lineTo(122, 182); c.bezierCurveTo(80, 186, 44, 176, 34, 164); c.closePath(); }, '#FFD3DB', '#2F2A2D', 2.4); path(g, c => { c.rect(34, 30, 134, 20); }, '#FFB8C6', null); path(g, c => { c.moveTo(34, 164); c.bezierCurveTo(50, 176, 86, 186, 122, 182); c.bezierCurveTo(90, 160, 60, 160, 34, 164); c.closePath(); }, '#F2B2BE', '#2F2A2D', 2); },
};

// name, group, drawing
export const STICKERS = [
  ['bunny', 'Bunny', 'cute'], ['bear', 'Bear', 'cute'], ['cat', 'Cat', 'cute'], ['dog', 'Puppy', 'cute'], ['chick', 'Chick', 'cute'], ['frog', 'Frog', 'cute'], ['panda', 'Panda', 'cute'], ['pig', 'Piggy', 'cute'],
  ['heart', 'Heart', 'cute'], ['star', 'Star', 'cute'], ['cloud', 'Cloud', 'cute'], ['rainbow', 'Rainbow', 'cute'], ['bow', 'Bow', 'cute'], ['flower', 'Flower', 'cute'], ['daisy', 'Daisy', 'cute'], ['butterfly', 'Butterfly', 'cute'], ['paw', 'Paw', 'cute'], ['sparkle', 'Sparkles', 'cute'],
  ['strawberry', 'Strawberry', 'yummy'], ['cherry', 'Cherries', 'yummy'], ['cake', 'Cake', 'yummy'], ['boba', 'Bubble tea', 'yummy'], ['milk', 'Milk', 'yummy'], ['icecream', 'Ice cream', 'yummy'], ['toast', 'Toast', 'yummy'], ['macaron', 'Macaron', 'yummy'],
  ['noteGrid', 'Grid note', 'notes'], ['notePlain', 'Plain note', 'notes'], ['noteLined', 'Lined note', 'notes'], ['noteMint', 'Mint note', 'notes'], ['noteYellow', 'Memo', 'notes'], ['noteSpiral', 'Notebook', 'notes'], ['noteCurl', 'Pink note', 'notes'],
].map(([k, name, group]) => ({ k, name, group }));
export const STICKER_GROUPS = [['cute', 'Cute'], ['yummy', 'Yummy'], ['notes', 'Notes']];
// the faces that can be used as a student's picture
export const AVATARS = ['bunny', 'bear', 'cat', 'dog', 'chick', 'frog', 'panda', 'pig'];

// ---------------------------------------------------------------- sprites: the picture with a white die-cut edge
const SPR = new Map(), PAD = 16, BOX = 200;
function make(k) {
  const fn = D[k]; if (!fn) return null;
  const body = document.createElement('canvas'); body.width = body.height = BOX + PAD * 2;
  const g = body.getContext('2d'); g.translate(PAD, PAD); fn(g);
  const out = document.createElement('canvas'); out.width = out.height = BOX + PAD * 2;
  const o = out.getContext('2d');
  // a white copy of the picture, put down all around it, makes the edge
  const white = document.createElement('canvas'); white.width = white.height = BOX + PAD * 2;
  const w = white.getContext('2d'); w.drawImage(body, 0, 0); w.globalCompositeOperation = 'source-in'; w.fillStyle = '#fff'; w.fillRect(0, 0, white.width, white.height);
  for (let r of [5, 10]) for (let i = 0; i < 20; i++) { const a = i * TAU / 20; o.drawImage(white, Math.cos(a) * r, Math.sin(a) * r); }
  o.save(); o.shadowColor = 'rgba(60,30,40,.22)'; o.shadowBlur = 5; o.shadowOffsetY = 2; o.drawImage(white, 0, 0); o.restore();
  o.drawImage(body, 0, 0);
  return out;
}
export function stickerSprite(k) { let s = SPR.get(k); if (s === undefined) { s = make(k); SPR.set(k, s); } return s; }
// draw sticker k so that its picture fills the box x, y, w, h (the white edge sits just outside)
export function drawSticker(ctx, k, x, y, w, h) {
  const s = stickerSprite(k); if (!s) return;
  const kx = w / BOX, ky = h / BOX;
  ctx.drawImage(s, x - PAD * kx, y - PAD * ky, (BOX + PAD * 2) * kx, (BOX + PAD * 2) * ky);
}
// a round picture of a face for a student (pictures of faces on a coloured circle)
export function avatarCanvas(k, size, bg = '#FFE3EC') {
  const c = document.createElement('canvas'); c.width = c.height = Math.round(size * 2); c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d'); g.beginPath(); g.arc(c.width / 2, c.width / 2, c.width / 2, 0, TAU); g.fillStyle = bg; g.fill(); g.save(); g.clip();
  const s = stickerSprite(k); if (s) { const m = c.width * 0.9, off = (c.width - m) / 2; g.drawImage(s, off, off + c.width * 0.02, m, m); }
  g.restore(); return c;
}

// ---------------------------------------------------------------- washi tape
export const TAPES = [['pink', 'Pink'], ['gingham', 'Pink check'], ['dots', 'Dots'], ['hearts', 'Hearts'], ['stars', 'Stars'], ['daisy', 'Daisies'], ['diamond', 'Diamonds'], ['stripe', 'Stripes'], ['mint', 'Mint grid'], ['sun', 'Yellow grid'], ['blue', 'Blue check'], ['cherry', 'Cherries']];
const T = 64;
const TILES = {
  pink: g => { g.fillStyle = '#F2B3CA'; g.fillRect(0, 0, T, T); g.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 14; i++) g.fillRect((i * 37) % T, (i * 23) % T, 6, 2); },
  gingham: g => { g.fillStyle = '#FFE3EC'; g.fillRect(0, 0, T, T); g.fillStyle = 'rgba(255,128,170,.55)'; g.fillRect(0, 0, T, 16); g.fillRect(32, 0, 16, T); g.fillRect(0, 32, T, 16); g.fillRect(0, 0, 16, T); },
  dots: g => { g.fillStyle = '#FFF1E6'; g.fillRect(0, 0, T, T); g.fillStyle = '#F29B9B'; for (const [x, y] of [[16, 16], [48, 48], [48, -16], [-16, 48], [16, 80], [80, 16]]) { g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); } },
  hearts: g => { g.fillStyle = '#FFD3E1'; g.fillRect(0, 0, T, T); g.fillStyle = '#FF7FA0'; for (const [x, y, s] of [[18, 20, 6], [48, 46, 5]]) { g.beginPath(); heartPath(g, x, y, s); g.fill(); } },
  stars: g => { g.fillStyle = '#E6A0BA'; g.fillRect(0, 0, T, T); g.fillStyle = '#FFE6EE'; for (const [x, y, s] of [[18, 18, 9], [48, 46, 8]]) { g.beginPath(); star(g, x, y, s, s * 0.45); g.fill(); } },
  daisy: g => { g.fillStyle = '#F7B6C8'; g.fillRect(0, 0, T, T); for (const [x, y] of [[18, 18], [50, 46]]) { g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.ellipse(x + 6 * Math.cos(a), y + 6 * Math.sin(a), 4, 2.6, a, 0, TAU); g.fill(); } g.fillStyle = '#FFC93C'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); } },
  diamond: g => { g.fillStyle = '#F6B8CF'; g.fillRect(0, 0, T, T); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke(); },
  stripe: g => { g.fillStyle = '#D8CCF3'; g.fillRect(0, 0, T, T); g.fillStyle = '#B6A3E8'; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 22, 0); g.lineTo(i * 22 + 11, 0); g.lineTo(i * 22 + 11 + T, T); g.lineTo(i * 22 + T, T); g.closePath(); g.fill(); } },
  mint: g => { g.fillStyle = '#B9D6BC'; g.fillRect(0, 0, T, T); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= T; i += 16) { g.moveTo(i, 0); g.lineTo(i, T); g.moveTo(0, i); g.lineTo(T, i); } g.stroke(); },
  sun: g => { g.fillStyle = '#FFC24D'; g.fillRect(0, 0, T, T); g.strokeStyle = '#FFF4D2'; g.lineWidth = 4; g.beginPath(); for (let i = 8; i <= T; i += 28) { g.moveTo(i, 0); g.lineTo(i, T); g.moveTo(0, i); g.lineTo(T, i); } g.stroke(); },
  blue: g => { g.fillStyle = '#E4EDFC'; g.fillRect(0, 0, T, T); g.fillStyle = 'rgba(120,160,235,.6)'; g.fillRect(0, 0, T, 16); g.fillRect(32, 0, 16, T); g.fillRect(0, 32, T, 16); g.fillRect(0, 0, 16, T); },
  cherry: g => { g.fillStyle = '#EFE0CD'; g.fillRect(0, 0, T, T); g.strokeStyle = '#3E8E4A'; g.lineWidth = 2; g.beginPath(); g.moveTo(24, 44); g.quadraticCurveTo(30, 22, 40, 14); g.moveTo(52, 46); g.quadraticCurveTo(46, 24, 40, 14); g.stroke(); g.fillStyle = '#E8394F'; g.beginPath(); g.arc(24, 48, 8, 0, TAU); g.fill(); g.beginPath(); g.arc(52, 50, 8, 0, TAU); g.fill(); },
};
const PAT = new Map();
export function tileCanvas(k) { let c = PAT.get(k); if (!c) { c = document.createElement('canvas'); c.width = c.height = T; (TILES[k] || TILES.pink)(c.getContext('2d')); PAT.set(k, c); } return c; }
// a strip of tape from (x0, y0) to (x1, y1), w wide, with torn zig-zag ends
export function drawTape(ctx, d) {
  const dx = d.x1 - d.x0, dy = d.y1 - d.y0, L = Math.hypot(dx, dy); if (L < 2) return;
  const w = d.w || 44, ang = Math.atan2(dy, dx), tooth = Math.max(3, w / 7);
  ctx.save(); ctx.translate(d.x0, d.y0); ctx.rotate(ang);
  const n = Math.max(2, Math.round(w / tooth)), step = w / n;
  ctx.beginPath(); ctx.moveTo(0, -w / 2);
  ctx.lineTo(L, -w / 2);
  for (let i = 0; i < n; i++) { ctx.lineTo(L + (i % 2 ? 0 : tooth * 0.9), -w / 2 + (i + 0.5) * step); ctx.lineTo(L, -w / 2 + (i + 1) * step); }   // the far end
  ctx.lineTo(0, w / 2);
  for (let i = n - 1; i >= 0; i--) { ctx.lineTo(i % 2 ? 0 : tooth * 0.9, w / 2 - (n - i - 0.5) * step); ctx.lineTo(0, w / 2 - (n - i) * step); }   // the near end
  ctx.closePath();
  ctx.save(); ctx.shadowColor = 'rgba(60,30,40,.25)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1.5; ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.clip(); ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.94;
  const pat = ctx.createPattern(tileCanvas(d.k), 'repeat'); if (pat && pat.setTransform) pat.setTransform(new DOMMatrix().scale(w / 56)); ctx.fillStyle = pat; ctx.fillRect(-tooth, -w / 2 - 2, L + tooth * 2, w + 4);
  ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(0, -w / 2, L, w * 0.18);          // a little shine along one edge, like real tape
  ctx.restore(); ctx.restore();
}
