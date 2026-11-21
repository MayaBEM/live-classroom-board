// Protractor and ruler: movable, rotatable, resizable instruments drawn over the page (SVG, in page units).
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
    this.local = { protractor: null, ruler: null }; this.remote = null; this.remoteTimer = null;
    this.drag = null; this.sharing = false;
    this.layer = document.createElementNS(NS, 'svg');
    this.layer.setAttribute('class', 'instr-layer');
    this.layer.addEventListener('pointerdown', e => this.down(e));
    this.winMove = e => this.move(e); this.winUp = e => this.up(e);
  }

  attach(overlay) { overlay.append(this.layer); this.fit(); this.render(); }
  detach() { window.removeEventListener('pointermove', this.winMove); window.removeEventListener('pointerup', this.winUp); window.removeEventListener('pointercancel', this.winUp); clearTimeout(this.remoteTimer); this.layer.remove(); }
  any() { return !!(this.local.protractor || this.local.ruler); }
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
      else this.local.ruler = { x: c.cx, y: c.cy - c.vh * 0.22, rot: 0, L: clamp(150 * upm, 120, Math.max(120, vw * 0.8)) };
    }
    this.render(); this.changed();
  }

  changed() { this.onChange(this.shared()); }
  shared() { return { page: this.view.pageId, protractor: this.local.protractor, ruler: this.local.ruler, upm: this.upm() }; }

  setRemote(p) {
    clearTimeout(this.remoteTimer);
    this.remote = p && p.page === this.view.pageId && (p.protractor || p.ruler) ? p : null;
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
    if (this.local.ruler) out.push(this.rulerSvg(this.local.ruler, upm, hr, false));
    if (this.local.protractor) out.push(this.protractorSvg(this.local.protractor, hr, false));
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

  // ------------------------------------------------------------ interaction
  down(e) {
    const t = e.target.closest && e.target.closest('[data-h]'); if (!t) return;
    const kind = t.dataset.k, mode = t.dataset.h, st = this.local[kind]; if (!st) return;
    e.preventDefault(); e.stopPropagation();
    const p = this.view.toPage(e);
    this.drag = { kind, mode, id: e.pointerId, ox: p.x - st.x, oy: p.y - st.y };
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
    else if (d.mode === 'arm') { st.arm = f(readAngle(st.x, st.y, st.rot, p.x, p.y)); }
    else if (d.mode === 'size') {
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
    window.removeEventListener('pointermove', this.winMove); window.removeEventListener('pointerup', this.winUp); window.removeEventListener('pointercancel', this.winUp);
    this.changed();
  }
}
