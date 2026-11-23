// Protractor, ruler and compass: movable, rotatable, resizable instruments drawn over the page (SVG, in page units).
//  - the protractor has an arm you drag to read an angle; the ruler shows real millimetres and centimetres
//  - the teacher can show their instruments to the class (a live class); everybody can also use their own
const NS = 'http://www.w3.org/2000/svg';
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const f = n => Math.round(n * 100) / 100;

export function normAngle(d) { d %= 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return d; }

// angle (0..180) of a point relative to a protractor centre and rotation, as read on the scale
export function readAngle(cx, cy, rotDeg, px, py) {
  const dx = px - cx, dy = py - cy, a = -rad(rotDeg);
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  let th = deg(Math.atan2(-ly, lx));
  if (th < 0) th = th < -90 ? 180 : 0;
  return th;
}

export class Instruments {
  // view: the BoardView (needs .page, .view.s, .currentViewPayload(), .pageMm, .overlay); onChange(state) is called when local instruments change
  constructor(view, onChange) {
    this.view = view; this.onChange = onChange || (() => {});
    this.local = { protractor: null, ruler: null, compass: null }; this.remote = null; this.arc = null; this.remoteTimer = null;
    this.drag = null; this.sharing = false;
    this.layer = document.createElementNS(NS, 'svg');
    this.layer.setAttribute('class', 'instr-layer');
    this.layer.addEventListener('pointerdown', e => this.down(e));
    this.winMove = e => this.move(e); this.winUp = e => this.up(e);
  }

  attach(overlay) { overlay.append(this.layer); this.fit(); this.render(); }
  detach() { window.removeEventListener('pointermove', this.winMove); window.removeEventListener('pointerup', this.winUp); window.removeEventListener('pointercancel', this.winUp); clearTimeout(this.remoteTimer); this.layer.remove(); }
  any() { return !!(this.local.protractor || this.local.ruler || this.local.compass); }
  fit() { const pg = this.view.page; if (!pg) return; this.layer.setAttribute('viewBox', `0 0 1000 ${pg.h}`); }

  // units per millimetre on the current page (a PDF knows its real size; otherwise A4 is assumed)
  upm() {
    const pg = this.view.page; if (!pg) return 4.76;
    const mm = (pg.kind === 'pdf' && this.view.pageMm && this.view.pageMm[pg.id]) || (pg.h > 1000 ? 210 : 297);
    return 1000 / mm;
  }

  toggle(kind) {
    if (this.local[kind]) this.local[kind] = null;
    else {
      const c = this.view.currentViewPayload(), upm = this.upm(), vw = c.vw || 800;
      if (kind === 'protractor') this.local.protractor = { x: c.cx, y: c.cy + c.vh * 0.12, rot: 0, R: clamp(60 * upm, 90, Math.max(90, vw * 0.3)), arm: 45 };
      else if (kind === 'compass') this.local.compass = { x: c.cx - Math.min(vw * 0.1, 120), y: c.cy + c.vh * 0.1, rot: 0, R: Math.round(clamp(40 * upm, 70, Math.max(70, vw * 0.25)) / (5 * upm)) * 5 * upm };
      else this.local.ruler = { x: c.cx, y: c.cy - c.vh * 0.22, rot: 0, L: clamp(150 * upm, 120, Math.max(120, vw * 0.8)) };
    }
    this.render(); this.changed();
  }

  changed() { this.onChange(this.shared()); }
  shared() { return { page: this.view.pageId, protractor: this.local.protractor, ruler: this.local.ruler, compass: this.local.compass, upm: this.upm() }; }

  setRemote(p) {
    clearTimeout(this.remoteTimer);
    this.remote = p && p.page === this.view.pageId && (p.protractor || p.ruler || p.compass) ? p : null;
    this.render();
    if (this.remote) this.remoteTimer = setTimeout(() => { this.remote = null; this.render(); }, 9000);   // the teacher's copy fades if the teacher stops sending
  }

  // ------------------------------------------------------------ drawing
  handleR() { const px = window.matchMedia && matchMedia('(pointer: coarse)').matches ? 22 : 16; return clamp(px / Math.max(0.1, this.view.view.s), 8, 80); }

  render() {
    const hr = this.handleR(), upm = this.upm(), out = [];
    const r = this.remote && this.remote.page === this.view.pageId ? this.remote : null;
    if (r && r.ruler) out.push(this.rulerSvg(r.ruler, r.upm || upm, hr, true));
    if (r && r.protractor) out.push(this.protractorSvg(r.protractor, hr, true));
    if (r && r.compass) out.push(this.compassSvg(r.compass, r.upm || upm, hr, true));
    if (this.local.ruler) out.push(this.rulerSvg(this.local.ruler, upm, hr, false));
    if (this.local.protractor) out.push(this.protractorSvg(this.local.protractor, hr, false));
    if (this.local.compass) out.push(this.compassSvg(this.local.compass, upm, hr, false));
    if (this.arc) out.push(this.arcSvg());
    this.layer.innerHTML = out.join('');
  }

  protractorSvg(p, hr, remote) {
    const R = p.R, col = remote ? '#1F6F78' : '#1D2127', th = clamp(Math.round(p.arm), 0, 180);
    let ticks = '', labels = '';
    for (let a = 0; a <= 180; a++) {
      const len = a % 10 === 0 ? 0.075 * R : a % 5 === 0 ? 0.055 * R : 0.032 * R, c = Math.cos(rad(a)), s = Math.sin(rad(a));
      ticks += `M${f(R * c)} ${f(-R * s)}L${f((R - len) * c)} ${f(-(R - len) * s)}`;
      if (a % 10 === 0) {
        const fs = 0.05 * R, ro = R - 0.135 * R, ri = R - 0.2 * R;
        labels += `<text x="0" y="0" transform="translate(${f(ro * c)} ${f(-ro * s)}) rotate(${90 - a})" font-size="${f(fs)}" text-anchor="middle" dominant-baseline="middle" fill="${col}">${a}</text>`;
        labels += `<text x="0" y="0" transform="translate(${f(ri * c)} ${f(-ri * s)}) rotate(${90 - a})" font-size="${f(fs * 0.8)}" text-anchor="middle" dominant-baseline="middle" fill="#6a727b">${180 - a}</text>`;
      }
    }
    const ar = 1.2 * R, ax = f(ar * Math.cos(rad(th))), ay = f(-ar * Math.sin(rad(th)));
    const bx = f(0.62 * R * Math.cos(rad(th))), by = f(-0.62 * R * Math.sin(rad(th)) - 0.02 * R), fs = 0.085 * R;
    const label = `${th}°`;
    const bw = fs * (label.length * 0.62 + 0.9);
    const handles = remote ? '' : `
      <circle data-k="protractor" data-h="rot" cx="${f(-R - hr * 1.5)}" cy="0" r="${f(hr)}" fill="#D5E8E9" stroke="#1F6F78" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:alias"/>
      <path d="M${f(-R - hr * 1.5 - hr * 0.45)} ${f(-hr * 0.1)}a${f(hr * 0.45)} ${f(hr * 0.45)} 0 1 1 ${f(hr * 0.9)} 0" fill="none" stroke="#1F6F78" stroke-width="2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <rect data-k="protractor" data-h="size" x="${f(R + hr * 0.5)}" y="${f(-hr)}" width="${f(hr * 2)}" height="${f(hr * 2)}" fill="#fff" stroke="#1D2127" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:ew-resize"/>
      <circle data-k="protractor" data-h="arm" cx="${ax}" cy="${ay}" r="${f(hr)}" fill="#FF9150" stroke="#1D2127" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:grab"/>`;
    return `<g class="instr ${remote ? 'remote' : ''}" transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.rot)})" style="pointer-events:${remote ? 'none' : 'auto'}">
      <path data-k="protractor" data-h="move" d="M${-R} 0A${R} ${R} 0 0 1 ${R} 0Z" fill="rgba(255,244,200,${remote ? 0.4 : 0.5})" stroke="${col}" stroke-width="1.8" vector-effect="non-scaling-stroke" style="cursor:move"/>
      <path d="M${f(-0.3 * R)} 0A${f(0.3 * R)} ${f(0.3 * R)} 0 0 1 ${f(0.3 * R)} 0Z" fill="none" stroke="${col}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <path d="${ticks}" fill="none" stroke="${col}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <g style="pointer-events:none">${labels}</g>
      <path d="M${f(-0.05 * R)} 0H${f(0.05 * R)}M0 ${f(-0.05 * R)}V${f(0.05 * R)}" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <line x1="0" y1="0" x2="${ax}" y2="${ay}" stroke="#D62F2F" stroke-width="2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <g transform="translate(${bx} ${by}) rotate(${f(-p.rot)})" style="pointer-events:none">
        <rect x="${f(-bw / 2)}" y="${f(-fs * 0.75)}" width="${f(bw)}" height="${f(fs * 1.5)}" fill="#fff" stroke="#D62F2F" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        <text x="0" y="0" font-size="${f(fs)}" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#D62F2F">${label}</text>
      </g>
      ${handles}
    </g>`;
  }

  rulerSvg(p, upm, hr, remote) {
    const L = p.L, W = 26 * upm, col = remote ? '#1F6F78' : '#1D2127', mm = L / upm;
    let ticks = '', labels = '';
    for (let i = 0; i <= Math.floor(mm); i++) {
      const x = f(-L / 2 + i * upm), len = i % 10 === 0 ? 0.42 * W : i % 5 === 0 ? 0.3 * W : 0.18 * W;
      ticks += `M${x} ${f(-W / 2)}V${f(-W / 2 + len)}`;
      if (i % 10 === 0 && i > 0 && i + 5 < mm + 6) labels += `<text x="${x}" y="${f(-W / 2 + 0.42 * W + 0.2 * W)}" font-size="${f(0.19 * W)}" text-anchor="middle" fill="${col}">${i / 10}</text>`;
    }
    if (true) labels += `<text x="${f(-L / 2 + 0.06 * W)}" y="${f(-W / 2 + 0.42 * W + 0.2 * W)}" font-size="${f(0.19 * W)}" fill="${col}">0</text>`;
    labels += `<text x="${f(L / 2 - 0.1 * W)}" y="${f(W / 2 - 0.12 * W)}" font-size="${f(0.17 * W)}" text-anchor="end" fill="#6a727b">${(mm / 10).toFixed(1)} cm</text>`;
    const handles = remote ? '' : `
      <circle data-k="ruler" data-h="rot" cx="${f(-L / 2 - hr * 1.5)}" cy="0" r="${f(hr)}" fill="#D5E8E9" stroke="#1F6F78" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:alias"/>
      <path d="M${f(-L / 2 - hr * 1.5 - hr * 0.45)} ${f(-hr * 0.1)}a${f(hr * 0.45)} ${f(hr * 0.45)} 0 1 1 ${f(hr * 0.9)} 0" fill="none" stroke="#1F6F78" stroke-width="2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <rect data-k="ruler" data-h="size" x="${f(L / 2 + hr * 0.5)}" y="${f(-hr)}" width="${f(hr * 2)}" height="${f(hr * 2)}" fill="#fff" stroke="#1D2127" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:ew-resize"/>`;
    return `<g class="instr ${remote ? 'remote' : ''}" transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.rot)})" style="pointer-events:${remote ? 'none' : 'auto'}">
      <rect data-k="ruler" data-h="move" x="${f(-L / 2)}" y="${f(-W / 2)}" width="${f(L)}" height="${f(W)}" fill="rgba(214,236,250,${remote ? 0.45 : 0.6})" stroke="${col}" stroke-width="1.8" vector-effect="non-scaling-stroke" style="cursor:move"/>
      <path d="${ticks}" fill="none" stroke="${col}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <g style="pointer-events:none">${labels}</g>
      ${handles}
    </g>`;
  }

  // the compass: the needle stays put, the pencil end goes round it at a fixed radius and draws (a circle or an arc)
  compassGeom(p) {
    const R = p.R, Ll = Math.max(R * 0.75, 140), h = Math.sqrt(Math.max(1, Ll * Ll - (R / 2) * (R / 2)));
    return { R, h };
  }
  compassSvg(p, upm, hr, remote) {
    const { R, h } = this.compassGeom(p), col = remote ? '#1F6F78' : '#1D2127', pen = remote ? '#1F6F78' : (this.view.color || '#1D2127');
    const Hh = [R / 2, -h], u = clamp(Math.hypot(R / 2, h) * 0.05, 4.5, 11);
    const MET = '#BFC6CE', EDGE = '#4A525A', LIGHT = '#F2F5F8', DARK = '#7D858E';
    const P = (x, y) => f(x) + ',' + f(y);
    // a leg piece that gets narrower from A to B (wa, wb: widths; off: slide sideways, used for the shiny stripe)
    const tseg = (A, B, wa, wb, off = 0) => {
      const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      return [[A[0] + nx * (off + wa / 2), A[1] + ny * (off + wa / 2)], [B[0] + nx * (off + wb / 2), B[1] + ny * (off + wb / 2)], [B[0] + nx * (off - wb / 2), B[1] + ny * (off - wb / 2)], [A[0] + nx * (off - wa / 2), A[1] + ny * (off - wa / 2)]].map(q => P(q[0], q[1])).join(' ');
    };
    const poly = (pts, fill, stroke, sw = 1) => `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`;
    const at = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    const leg = (T, pencil) => {
      const K = at(Hh, T, 0.58), C0 = at(Hh, T, pencil ? 0.76 : 0.80), C1 = at(Hh, T, pencil ? 0.83 : 0.86);
      let o = poly(tseg(Hh, K, 2.3 * u, 1.7 * u), MET, EDGE) + poly(tseg(Hh, K, 0.45 * u, 0.3 * u, -0.45 * u), LIGHT, 'none', 0);
      o += poly(tseg(K, C0, 1.5 * u, 1.2 * u), MET, EDGE) + poly(tseg(K, C0, 0.35 * u, 0.25 * u, -0.3 * u), LIGHT, 'none', 0);
      o += `<circle cx="${f(K[0])}" cy="${f(K[1])}" r="${f(1.05 * u)}" fill="${DARK}" stroke="${EDGE}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/><path d="M${P(K[0] - 0.55 * u, K[1])}H${f(K[0] + 0.55 * u)}" stroke="${EDGE}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`;
      if (pencil) {
        const L0 = at(Hh, T, 0.94);
        o += poly(tseg(C0, C1, 1.9 * u, 1.9 * u), '#5A626B', EDGE);                                  // the clamp
        o += poly(tseg(C1, L0, 1.35 * u, 0.55 * u), '#E8C998', '#9A6A2E');                          // the sharpened wood
        o += poly(tseg(L0, T, 0.55 * u, 0.06 * u), pen, EDGE);                                      // the lead (the colour you write with)
      } else {
        o += poly(tseg(C0, C1, 1.8 * u, 1.8 * u), '#8A929B', EDGE);                                  // the collar
        o += poly(tseg(C1, T, 0.9 * u, 0.1 * u), '#DDE2E7', EDGE);                                   // the steel needle
      }
      return o;
    };
    const kx = Hh[0], ky = Hh[1] - 4.8 * u, kr = 2.3 * u;
    let ribs = ''; for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7; ribs += `M${P(kx + Math.cos(a) * kr * 0.72, ky + Math.sin(a) * kr * 0.72)}L${P(kx + Math.cos(a) * kr, ky + Math.sin(a) * kr)}`; }
    const hinge = `<rect x="${f(kx - 0.65 * u)}" y="${f(ky)}" width="${f(1.3 * u)}" height="${f(4.8 * u)}" fill="${MET}" stroke="${EDGE}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <circle cx="${f(kx)}" cy="${f(ky)}" r="${f(kr)}" fill="${DARK}" stroke="${EDGE}" stroke-width="1.2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <path d="${ribs}" stroke="${LIGHT}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <circle cx="${f(Hh[0])}" cy="${f(Hh[1])}" r="${f(1.9 * u)}" fill="${MET}" stroke="${EDGE}" stroke-width="1.2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <circle cx="${f(Hh[0])}" cy="${f(Hh[1])}" r="${f(0.75 * u)}" fill="${DARK}" stroke="${EDGE}" stroke-width="1" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`;
    const cm = Math.round(R / upm / 5) * 5 / 10, label = `r = ${cm} cm`, fs = Math.max(11, hr * 0.95), bw = fs * (label.length * 0.58 + 1);
    const lx = f(kx), ly = f(ky - kr - hr * 1.7);
    const handles = remote ? '' : `
      <circle data-k="compass" data-h="rot" cx="${f(-hr * 3)}" cy="0" r="${f(hr)}" fill="#D5E8E9" stroke="#1F6F78" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:alias"/>
      <path d="M${f(-hr * 3 - hr * 0.45)} ${f(-hr * 0.1)}a${f(hr * 0.45)} ${f(hr * 0.45)} 0 1 1 ${f(hr * 0.9)} 0" fill="none" stroke="#1F6F78" stroke-width="2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      <circle data-k="compass" data-h="size" cx="${f(kx)}" cy="${f(ky)}" r="${f(Math.max(kr + 3, hr * 1.1))}" fill="rgba(255,255,255,0.01)" stroke="#1F6F78" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" style="cursor:ew-resize"/>
      <circle data-k="compass" data-h="draw" cx="${f(R)}" cy="0" r="${f(hr * 1.15)}" fill="rgba(255,145,80,0.28)" stroke="#FF9150" stroke-width="2" vector-effect="non-scaling-stroke" style="cursor:crosshair"/>`;
    return `<g class="instr ${remote ? 'remote' : ''}" transform="translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.rot)})" style="pointer-events:${remote ? 'none' : 'auto'}">
      <line x1="0" y1="0" x2="${f(R)}" y2="0" stroke="${col}" stroke-width="1" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" style="pointer-events:none"/>
      ${leg([0, 0], false)}${leg([R, 0], true)}${hinge}
      <line data-k="compass" data-h="move" x1="0" y1="0" x2="${f(Hh[0])}" y2="${f(Hh[1])}" stroke="transparent" stroke-width="22" stroke-linecap="round" vector-effect="non-scaling-stroke" style="pointer-events:${remote ? 'none' : 'stroke'};cursor:move"/>
      <circle data-k="compass" data-h="move" cx="0" cy="0" r="${f(hr * 1.2)}" fill="rgba(255,255,255,0.01)" stroke="#1F6F78" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" style="cursor:move;pointer-events:${remote ? 'none' : 'auto'}"/>
      <g transform="translate(${lx} ${ly}) rotate(${f(-p.rot)})" style="pointer-events:none">
        <rect x="${f(-bw / 2)}" y="${f(-fs * 0.8)}" width="${f(bw)}" height="${f(fs * 1.6)}" fill="#fff" stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        <text x="0" y="0" font-size="${f(fs)}" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="${col}">${label}</text>
      </g>
      ${handles}
    </g>`;
  }
  // the arc being drawn right now (shown until the pencil is lifted)
  arcSvg() {
    const a = this.arc; if (!a || !a.pts.length) return '';
    const d = a.pts.map((q, i) => (i ? 'L' : 'M') + f(q[0]) + ' ' + f(q[1])).join('');
    return `<path d="${d}" fill="none" stroke="${a.c}" stroke-width="${a.s}" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"/>`;
  }

  // ------------------------------------------------------------ interaction
  down(e) {
    const t = e.target.closest && e.target.closest('[data-h]'); if (!t) return;
    const kind = t.dataset.k, mode = t.dataset.h, st = this.local[kind]; if (!st) return;
    e.preventDefault(); e.stopPropagation();
    const p = this.view.toPage(e);
    this.drag = { kind, mode, id: e.pointerId, ox: p.x - st.x, oy: p.y - st.y };
    if (kind === 'compass' && mode === 'draw') {
      const a0 = Math.atan2(p.y - st.y, p.x - st.x); this.drag.a0 = a0; this.drag.last = a0; this.drag.sweep = 0; st.rot = f(deg(a0));
      this.arc = { c: this.view.color || '#1D2127', s: this.view.penWidth ? this.view.penWidth() : 4.8, pts: [[st.x + st.R * Math.cos(a0), st.y + st.R * Math.sin(a0)]] };
    }
    if (kind === 'compass' && mode === 'size') { const a = rad(st.rot); this.drag.off = (p.x - st.x) * Math.cos(a) + (p.y - st.y) * Math.sin(a) - st.R / 2; }
    if (mode === 'size' && kind === 'ruler') {   // the left end stays where it is
      const a = rad(st.rot); this.drag.p0 = { x: st.x - Math.cos(a) * st.L / 2, y: st.y - Math.sin(a) * st.L / 2 };
    }
    window.addEventListener('pointermove', this.winMove); window.addEventListener('pointerup', this.winUp); window.addEventListener('pointercancel', this.winUp);
  }

  move(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    const st = this.local[d.kind], p = this.view.toPage(e), upm = this.upm();
    if (d.mode === 'move') { st.x = p.x - d.ox; st.y = p.y - d.oy; }
    else if (d.mode === 'rot') { st.rot = f(normAngle(deg(Math.atan2(p.y - st.y, p.x - st.x)) - 180)); }
    else if (d.mode === 'draw') {
      const a = Math.atan2(p.y - st.y, p.x - st.x); let dl = a - d.last; if (dl > Math.PI) dl -= 2 * Math.PI; if (dl < -Math.PI) dl += 2 * Math.PI;
      d.sweep += dl; d.last = a; st.rot = f(deg(a));
      const n = Math.max(1, Math.ceil(Math.abs(d.sweep) / rad(1.5))), pts = [];
      for (let i = 0; i <= n; i++) { const t = d.a0 + d.sweep * i / n; pts.push([st.x + st.R * Math.cos(t), st.y + st.R * Math.sin(t)]); }
      this.arc.pts = pts;
    }
    else if (d.mode === 'size' && d.kind === 'compass') {
      const a = rad(st.rot), lx = (p.x - st.x) * Math.cos(a) + (p.y - st.y) * Math.sin(a) - d.off;
      st.R = clamp(Math.round(lx * 2 / upm / 5) * 5, 10, 120) * upm;   // snaps to 5 mm
    }
    else if (d.mode === 'arm') { st.arm = f(readAngle(st.x, st.y, st.rot, p.x, p.y)); }
    else if (d.mode === 'size' && d.kind !== 'compass') {
      if (d.kind === 'protractor') st.R = clamp(Math.hypot(p.x - st.x, p.y - st.y) - this.handleR() * 1.0, 70, 520);
      else {
        const a = rad(st.rot), u = { x: Math.cos(a), y: Math.sin(a) };
        const t = (p.x - d.p0.x) * u.x + (p.y - d.p0.y) * u.y - this.handleR();
        st.L = clamp(Math.round(t / upm / 10) * 10 * upm || t, 40 * upm, 400 * upm);   // snaps to whole centimetres
        st.x = d.p0.x + u.x * st.L / 2; st.y = d.p0.y + u.y * st.L / 2;
      }
    }
    this.render(); this.changed();
  }

  up(e) {
    const d = this.drag; if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.mode === 'draw') {
      const st = this.local.compass, a = this.arc; this.arc = null;
      if (st && a && Math.abs(d.sweep) > rad(2) && e.type !== 'pointercancel') {
        const full = Math.abs(d.sweep) >= rad(350), sw = full ? Math.sign(d.sweep) * 2 * Math.PI : d.sweep;
        this.view.addCompassArc && this.view.addCompassArc(st.x, st.y, st.R, d.a0, sw);
        if (full) st.rot = f(deg(d.a0));
      }
      this.render();
    }
    window.removeEventListener('pointermove', this.winMove); window.removeEventListener('pointerup', this.winUp); window.removeEventListener('pointercancel', this.winUp);
    this.changed();
  }
}
