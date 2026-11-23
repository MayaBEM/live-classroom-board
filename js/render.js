// Drawing and hit-testing. Everything is in "page units": every page is 1000 units wide.

export const PEN_COLORS = [
  ['Black', '#1D2127'], ['Blue', '#1F5FBF'], ['Red', '#D62F2F'], ['Green', '#1F8A4C'],
];
// In an assignment, red is kept for the teacher's feedback, so students get purple instead
export const STUDENT_ASSIGN_COLORS = PEN_COLORS.map(c => c[0] === 'Red' ? ['Purple', '#7A3FA0'] : c);
// a colour a person chose with the colour picker: "#RRGGBB" only
export const isHex = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
// is this colour a red (the teacher's feedback colour)?
export function isRedish(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d || mx < 0.35 || d / mx < 0.45) return false;
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
  return hue < 16 || hue > 344;
}
export const HL_COLORS = [
  ['Yellow', '#FFE45C'], ['Green', '#6FD39A'], ['Blue', '#8DB7FF'], ['Pink', '#FF9EC4'],
];
export const PEN_SIZES = [2.6, 4.8, 9];
export const HL_SIZES = [14, 24, 38];
export const TEXT_SIZES = [20, 30, 44];
export const STAMPS = [['check', 'Tick'], ['cross', 'Cross'], ['star', 'Star'], ['good', 'Good job!'], ['try', 'Try again']];
export const STAMP_SIZES = [60, 100, 150];
export const STAMP_COLORS = { check: '#1F8A4C', cross: '#D62F2F', good: '#1F8A4C', try: '#C2570C' };   // each stamp's own colour until the teacher picks another
export const FONT = "Lexend, system-ui, sans-serif";

// ---------------------------------------------------------------- base pages
export function drawPatternBase(ctx, kind, w, h) {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  if (kind === 'lined') {
    ctx.strokeStyle = '#B9CBE3'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let y = 120; y < h - 40; y += 46) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.strokeStyle = '#E8A9A4'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(110, 0); ctx.lineTo(110, h); ctx.stroke();
  } else if (kind === 'grid') {
    ctx.strokeStyle = '#C9D6D3'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let x = 0; x <= w; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += 40) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- text layout
let measureCtx = null;
function mctx() { return measureCtx || (measureCtx = document.createElement('canvas').getContext('2d')); }

export function layoutText(text, fs, maxW) {
  const ctx = mctx();
  ctx.font = `400 ${fs}px ${FONT}`;
  const lines = [];
  for (const para of String(text).split('\n')) {
    if (para === '') { lines.push(''); continue; }
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width <= maxW || !line) {
        if (ctx.measureText(test).width > maxW && !line) {
          // very long word: break by characters
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxW && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
          }
          line = chunk;
        } else line = test;
      } else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}
export const TEXT_LH = 1.3;

// ---------------------------------------------------------------- drawing
function strokeSmooth(ctx, p, stride) {
  const n = p.length / stride;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  if (n === 2) { ctx.lineTo(p[stride], p[stride + 1]); ctx.stroke(); return; }
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * stride], y = p[i * stride + 1];
    const mx = (x + p[(i + 1) * stride]) / 2, my = (y + p[(i + 1) * stride + 1]) / 2;
    ctx.quadraticCurveTo(x, y, mx, my);
  }
  ctx.lineTo(p[(n - 1) * stride], p[(n - 1) * stride + 1]);
  ctx.stroke();
}

function stampBox(d) {
  const w = d.k === 'good' || d.k === 'try' ? d.s * (d.k === 'good' ? 2.5 : 2.6) : d.s, hh = d.k === 'good' || d.k === 'try' ? d.s * 0.8 : d.s;
  return { w, h: hh };
}

function drawStamp(ctx, d) {
  const { x, y, s, k } = d, cc = isHex(d.c) ? d.c : STAMP_COLORS[k];
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (k === 'check') {
    ctx.strokeStyle = cc; ctx.lineWidth = s * 0.17;
    ctx.beginPath(); ctx.moveTo(x - s * 0.42, y + s * 0.02); ctx.lineTo(x - s * 0.12, y + s * 0.34); ctx.lineTo(x + s * 0.46, y - s * 0.38); ctx.stroke();
  } else if (k === 'cross') {
    ctx.strokeStyle = cc; ctx.lineWidth = s * 0.16;
    ctx.beginPath(); ctx.moveTo(x - s * 0.36, y - s * 0.36); ctx.lineTo(x + s * 0.36, y + s * 0.36); ctx.moveTo(x + s * 0.36, y - s * 0.36); ctx.lineTo(x - s * 0.36, y + s * 0.36); ctx.stroke();
  } else if (k === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.2 : s * 0.48, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); }
    ctx.closePath(); ctx.fillStyle = '#F5B823'; ctx.fill(); ctx.strokeStyle = '#7A4A00'; ctx.lineWidth = s * 0.05; ctx.stroke();
  } else {
    const label = k === 'good' ? 'Good job!' : 'Try again', col = cc, { w, h: hh } = stampBox(d);
    ctx.translate(x, y); ctx.rotate(-0.09);
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.fillRect(-w / 2, -hh / 2, w, hh);
    ctx.strokeStyle = col; ctx.lineWidth = s * 0.06; ctx.lineJoin = 'miter'; ctx.strokeRect(-w / 2, -hh / 2, w, hh);
    ctx.fillStyle = col; ctx.font = `600 ${s * 0.42}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, s * 0.02);
  }
  ctx.restore();
}

import { drawSticker, drawTape } from './stickers.js';

// ---------------------------------------------------------------- pictures (small JPEGs kept inside the object)
const IMGS = new Map(), imgWatchers = new Set();
const validSrc = s => typeof s === 'string' && s.length < 320000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s);   // only our own small pictures: never an address on the internet
export function onImagesReady(fn) { imgWatchers.add(fn); return () => imgWatchers.delete(fn); }
function imgEntry(o) {
  const src = o.data.src; let e = IMGS.get(o.id);
  if (e && e.src === src) return e;
  e = { src, img: null, ok: false, p: Promise.resolve() };
  if (validSrc(src)) {
    const img = new Image(); e.img = img;
    e.p = new Promise(res => { img.onload = () => { e.ok = true; imgWatchers.forEach(f => f()); res(); }; img.onerror = () => res(); });
    img.src = src;
  }
  IMGS.delete(o.id); IMGS.set(o.id, e);
  while (IMGS.size > 120) IMGS.delete(IMGS.keys().next().value);
  return e;
}
// wait until every picture among these objects is ready to draw (thumbnails and PDF export call this first)
export function preloadImages(objs) { return Promise.all((objs || []).filter(o => o.type === 'image' && !o.deleted && o.data).map(o => imgEntry(o).p)); }

export function drawObject(ctx, o, opts = {}) {
  const d = o.data;
  if (!d) return;
  ctx.save();
  if (opts.alpha) ctx.globalAlpha = opts.alpha;
  switch (o.type) {
    case 'pen':
    case 'highlighter': {
      const p = d.p; if (!p || p.length < 2) break;
      const stride = d.pr ? 3 : 2, n = p.length / stride;
      ctx.lineCap = o.type === 'highlighter' ? 'butt' : 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = d.c; ctx.fillStyle = d.c;
      if (o.type === 'highlighter') { ctx.globalAlpha = (opts.alpha || 1) * 0.55; ctx.globalCompositeOperation = 'multiply'; }   // tints the paper; the words under it stay black
      if (n === 1) { ctx.beginPath(); ctx.arc(p[0], p[1], d.s / 2, 0, Math.PI * 2); ctx.fill(); break; }
      if (!d.pr || o.type === 'highlighter') { ctx.lineWidth = d.s; strokeSmooth(ctx, p, stride); break; }
      {
        let sx = p[0], sy = p[1];
        for (let i = 1; i < n; i++) {
          const last = i === n - 1, ex = last ? p[i * 3] : (p[i * 3] + p[(i + 1) * 3]) / 2, ey = last ? p[i * 3 + 1] : (p[i * 3 + 1] + p[(i + 1) * 3 + 1]) / 2;
          ctx.lineWidth = d.s * (0.35 + 1.1 * ((p[(i - 1) * 3 + 2] + p[i * 3 + 2]) / 2));
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(p[i * 3], p[i * 3 + 1], ex, ey); ctx.stroke(); sx = ex; sy = ey;
        }
      }
      break;
    }
    case 'line': case 'arrow': {
      ctx.strokeStyle = d.c; ctx.lineWidth = d.s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(d.x0, d.y0); ctx.lineTo(d.x1, d.y1); ctx.stroke();
      if (o.type === 'arrow') {
        const a = Math.atan2(d.y1 - d.y0, d.x1 - d.x0), L = Math.max(16, d.s * 4.5);
        ctx.beginPath();
        ctx.moveTo(d.x1 - L * Math.cos(a - 0.45), d.y1 - L * Math.sin(a - 0.45));
        ctx.lineTo(d.x1, d.y1);
        ctx.lineTo(d.x1 - L * Math.cos(a + 0.45), d.y1 - L * Math.sin(a + 0.45));
        ctx.stroke();
      }
      break;
    }
    case 'rect': {
      ctx.strokeStyle = d.c; ctx.lineWidth = d.s; ctx.lineJoin = 'miter';
      ctx.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
      break;
    }
    case 'ellipse': {
      ctx.strokeStyle = d.c; ctx.lineWidth = d.s;
      const rx = Math.abs(d.x1 - d.x0) / 2, ry = Math.abs(d.y1 - d.y0) / 2;
      ctx.beginPath(); ctx.ellipse((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, Math.max(rx, .5), Math.max(ry, .5), 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'text': {
      ctx.fillStyle = d.c; ctx.font = `400 ${d.fs}px ${FONT}`; ctx.textBaseline = 'top';
      const lines = layoutText(d.text, d.fs, d.w);
      lines.forEach((ln, i) => ctx.fillText(ln, d.x, d.y + i * d.fs * TEXT_LH + d.fs * 0.1));
      break;
    }
    case 'stamp': drawStamp(ctx, d); break;
    case 'image': {
      const e = imgEntry(o);
      if (e.ok) ctx.drawImage(e.img, d.x, d.y, d.w, d.h); else { ctx.fillStyle = '#E8EDF2'; ctx.fillRect(d.x, d.y, d.w, d.h); }
      break;
    }
    case 'sticker': drawSticker(ctx, d.k, d.x, d.y, d.w, d.h); break;
    case 'tape': drawTape(ctx, d); break;
    default: break;
  }
  ctx.restore();
}

// Pictures, stickers, tape and highlighting sit UNDER the writing: pictures, stickers and tape first (in the order they were put down), then highlighters, then everything else (pen, text, shapes, stamps)
export const DECOR = o => o.type === 'image' || o.type === 'sticker' || o.type === 'tape';
export const UNDER = o => DECOR(o) || o.type === 'highlighter';
export function drawObjects(ctx, objs, skipId) {
  const list = objs.filter(o => !o.deleted && o.id !== skipId);
  for (const o of list) if (DECOR(o)) drawObject(ctx, o);
  for (const o of list) if (o.type === 'highlighter') drawObject(ctx, o);
  for (const o of list) if (!UNDER(o)) drawObject(ctx, o);
}

// ---------------------------------------------------------------- bounds + hit testing
export function bounds(o) {
  if (o._b) return o._b;
  const d = o.data; let x0, y0, x1, y1;
  if (o.type === 'pen' || o.type === 'highlighter') {
    const stride = d.pr ? 3 : 2; x0 = y0 = Infinity; x1 = y1 = -Infinity;
    for (let i = 0; i < d.p.length; i += stride) { x0 = Math.min(x0, d.p[i]); x1 = Math.max(x1, d.p[i]); y0 = Math.min(y0, d.p[i + 1]); y1 = Math.max(y1, d.p[i + 1]); }
  } else if (o.type === 'image' || o.type === 'sticker') {
    x0 = d.x; y0 = d.y; x1 = d.x + d.w; y1 = d.y + d.h;
  } else if (o.type === 'tape') {
    const t = (d.w || 44) / 2; x0 = Math.min(d.x0, d.x1) - t; x1 = Math.max(d.x0, d.x1) + t; y0 = Math.min(d.y0, d.y1) - t; y1 = Math.max(d.y0, d.y1) + t;
  } else if (o.type === 'stamp') {
    const b = stampBox(d); x0 = d.x - b.w / 2; x1 = d.x + b.w / 2; y0 = d.y - b.h / 2; y1 = d.y + b.h / 2;
  } else if (o.type === 'text') {
    const lines = layoutText(d.text, d.fs, d.w);
    x0 = d.x; y0 = d.y; x1 = d.x + d.w; y1 = d.y + lines.length * d.fs * TEXT_LH;
  } else { x0 = Math.min(d.x0, d.x1); x1 = Math.max(d.x0, d.x1); y0 = Math.min(d.y0, d.y1); y1 = Math.max(d.y0, d.y1); }
  const pad = (d.s || 0) / 2;
  return (o._b = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad });
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function hit(o, x, y, r) {
  const b = bounds(o);
  if (x < b.x0 - r || x > b.x1 + r || y < b.y0 - r || y > b.y1 + r) return false;
  const d = o.data, w = (d.s || 0) / 2 + r;
  switch (o.type) {
    case 'pen': case 'highlighter': {
      const stride = d.pr ? 3 : 2, p = d.p, n = p.length / stride;
      if (n === 1) return Math.hypot(x - p[0], y - p[1]) <= w;
      for (let i = 1; i < n; i++) if (distSeg(x, y, p[(i - 1) * stride], p[(i - 1) * stride + 1], p[i * stride], p[i * stride + 1]) <= w) return true;
      return false;
    }
    case 'line': case 'arrow': return distSeg(x, y, d.x0, d.y0, d.x1, d.y1) <= w;
    case 'rect': {
      const l = Math.min(d.x0, d.x1), rt = Math.max(d.x0, d.x1), t = Math.min(d.y0, d.y1), bt = Math.max(d.y0, d.y1);
      return distSeg(x, y, l, t, rt, t) <= w || distSeg(x, y, rt, t, rt, bt) <= w || distSeg(x, y, rt, bt, l, bt) <= w || distSeg(x, y, l, bt, l, t) <= w;
    }
    case 'ellipse': {
      const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2, rx = Math.abs(d.x1 - d.x0) / 2 || .5, ry = Math.abs(d.y1 - d.y0) / 2 || .5;
      const k = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const tol = w / Math.min(rx, ry);
      return Math.abs(k - 1) <= tol;
    }
    case 'text': case 'stamp': case 'image': case 'sticker': return true;
    case 'tape': return distSeg(x, y, d.x0, d.y0, d.x1, d.y1) <= (d.w || 44) / 2 + r;
    default: return false;
  }
}

export function simplify(pts, stride, minDist) {
  // drops points closer than minDist to the previous kept point (keeps the last)
  if (pts.length <= stride * 2) return pts;
  const out = [pts[0], pts[1]]; if (stride === 3) out.push(pts[2]);
  let lx = pts[0], ly = pts[1];
  for (let i = stride; i < pts.length - stride; i += stride) {
    if (Math.hypot(pts[i] - lx, pts[i + 1] - ly) >= minDist) {
      out.push(pts[i], pts[i + 1]); if (stride === 3) out.push(pts[i + 2]); lx = pts[i]; ly = pts[i + 1];
    }
  }
  const e = pts.length - stride;
  out.push(pts[e], pts[e + 1]); if (stride === 3) out.push(pts[e + 2]);
  return out;
}


// ---------------------------------------------------------------- live ink (drawn while the pen is still moving)
// strokeInc draws the finished part of the stroke (up to the midpoint before the last point) and returns where to continue.
// strokeTip draws the small last piece (plus predicted points) on a canvas that is cleared every frame.
function strokeStyleFor(ctx, o) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = o.data.c; ctx.fillStyle = o.data.c; ctx.lineWidth = o.data.s;
}
export function strokeInc(ctx, o, i0) {
  const d = o.data, st = d.pr ? 3 : 2, p = d.p, n = p.length / st, hl = o.type === 'highlighter';
  if (n < 3 || i0 > n - 2) return Math.max(i0, 1);
  ctx.save(); strokeStyleFor(ctx, o);
  let sx = i0 === 1 ? p[0] : (p[(i0 - 1) * st] + p[i0 * st]) / 2, sy = i0 === 1 ? p[1] : (p[(i0 - 1) * st + 1] + p[i0 * st + 1]) / 2;
  if (!d.pr || hl) {
    ctx.beginPath(); ctx.moveTo(sx, sy);
    for (let i = i0; i <= n - 2; i++) ctx.quadraticCurveTo(p[i * st], p[i * st + 1], (p[i * st] + p[(i + 1) * st]) / 2, (p[i * st + 1] + p[(i + 1) * st + 1]) / 2);
    ctx.stroke();
  } else {
    for (let i = i0; i <= n - 2; i++) {
      const ex = (p[i * 3] + p[(i + 1) * 3]) / 2, ey = (p[i * 3 + 1] + p[(i + 1) * 3 + 1]) / 2;
      ctx.lineWidth = d.s * (0.35 + 1.1 * ((p[(i - 1) * 3 + 2] + p[i * 3 + 2]) / 2));
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(p[i * 3], p[i * 3 + 1], ex, ey); ctx.stroke(); sx = ex; sy = ey;
    }
  }
  ctx.restore();
  return n - 1;
}
export function strokeTip(ctx, o, pred) {
  const d = o.data, st = d.pr ? 3 : 2, p = d.p, n = p.length / st;
  if (!n) return;
  ctx.save(); strokeStyleFor(ctx, o);
  if (o.type === 'highlighter') ctx.globalAlpha = 0.55;
  if (d.pr) ctx.lineWidth = d.s * (0.35 + 1.1 * p[(n - 1) * 3 + 2]);
  const lx = p[(n - 1) * st], ly = p[(n - 1) * st + 1];
  if (n === 1 && !(pred && pred.length)) { ctx.beginPath(); ctx.arc(lx, ly, d.s / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); return; }
  const sx = n >= 3 ? (p[(n - 2) * st] + p[(n - 1) * st]) / 2 : p[0], sy = n >= 3 ? (p[(n - 2) * st + 1] + p[(n - 1) * st + 1]) / 2 : p[1];
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(lx, ly);
  if (pred) for (const q of pred) ctx.lineTo(q.x, q.y);
  ctx.stroke(); ctx.restore();
}
