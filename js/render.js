// Drawing and hit-testing. Everything is in "page units": every page is 1000 units wide.

export const PEN_COLORS = [
  ['Black', '#1D2127'], ['Blue', '#1F5FBF'], ['Red', '#D62F2F'], ['Green', '#1F8A4C'],
  ['Orange', '#EE7A1C'], ['Brown', '#7A4A2A'], ['Teal', '#0E8A9A'], ['Pink', '#D9488F'],
];
export const HL_COLORS = [
  ['Yellow', '#FFE45C'], ['Lime', '#B8E65C'], ['Green', '#6FD39A'], ['Cyan', '#6FD8E8'],
  ['Blue', '#8DB7FF'], ['Pink', '#FF9EC4'], ['Orange', '#FFB566'], ['Grey', '#C9CFD6'],
];
export const PEN_SIZES = [2.6, 4.8, 9];
export const HL_SIZES = [14, 24, 38];
export const TEXT_SIZES = [20, 30, 44];
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
      if (o.type === 'highlighter') ctx.globalAlpha = (opts.alpha || 1) * 0.4;
      if (n === 1) { ctx.beginPath(); ctx.arc(p[0], p[1], d.s / 2, 0, Math.PI * 2); ctx.fill(); break; }
      if (!d.pr || o.type === 'highlighter') { ctx.lineWidth = d.s; strokeSmooth(ctx, p, stride); break; }
      for (let i = 1; i < n; i++) {
        const pr = (p[(i - 1) * 3 + 2] + p[i * 3 + 2]) / 2;
        ctx.lineWidth = d.s * (0.35 + 1.1 * pr);
        ctx.beginPath(); ctx.moveTo(p[(i - 1) * 3], p[(i - 1) * 3 + 1]); ctx.lineTo(p[i * 3], p[i * 3 + 1]); ctx.stroke();
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
    default: break;
  }
  ctx.restore();
}

export function drawObjects(ctx, objs, skipId) {
  for (const o of objs) { if (!o.deleted && o.id !== skipId) drawObject(ctx, o); }
}

// ---------------------------------------------------------------- bounds + hit testing
export function bounds(o) {
  if (o._b) return o._b;
  const d = o.data; let x0, y0, x1, y1;
  if (o.type === 'pen' || o.type === 'highlighter') {
    const stride = d.pr ? 3 : 2; x0 = y0 = Infinity; x1 = y1 = -Infinity;
    for (let i = 0; i < d.p.length; i += stride) { x0 = Math.min(x0, d.p[i]); x1 = Math.max(x1, d.p[i]); y0 = Math.min(y0, d.p[i + 1]); y1 = Math.max(y1, d.p[i + 1]); }
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
    case 'text': return true;
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
