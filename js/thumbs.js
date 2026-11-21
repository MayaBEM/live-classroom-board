// Drawing a whole page (paper + marks) onto a canvas: used for thumbnails, the review grid and PDF export.
import { renderPdfPage, getImage } from './pdf.js';
import { drawPatternBase, drawObjects, FONT } from './render.js';

export async function drawBase(sb, page, ctx, W) {
  const H = Math.round(W * page.h / 1000);
  if (page.kind === 'pdf') { const r = await renderPdfPage(sb, page.file_path, page.pdf_page, W); ctx.drawImage(r, 0, 0, W, H); }
  else if (page.kind === 'image') { const im = await getImage(sb, page.file_path); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(im, 0, 0, W, H); }
  else { ctx.save(); ctx.setTransform(W / 1000, 0, 0, W / 1000, 0, 0); drawPatternBase(ctx, page.kind, 1000, page.h); ctx.restore(); }
}

// cached paper for thumbnails (the marks are drawn on top each time)
export class PageRenderer {
  constructor(sb) { this.sb = sb; this.bases = new Map(); }

  async base(page, W) {
    const key = `${page.id}|${page.kind}|${page.h}|${W}`;
    if (this.bases.has(key)) return this.bases.get(key);
    const p = (async () => {
      const c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * page.h / 1000);
      await drawBase(this.sb, page, c.getContext('2d'), W);
      return c;
    })();
    this.bases.set(key, p);
    p.catch(() => this.bases.delete(key));
    while (this.bases.size > 60) this.bases.delete(this.bases.keys().next().value);
    return p;
  }

  async draw(canvas, page, objects) {
    const W = canvas.width, base = await this.base(page, W), ctx = canvas.getContext('2d');
    if (canvas.height !== base.height) canvas.height = base.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(base, 0, 0);
    ctx.setTransform(W / 1000, 0, 0, W / 1000, 0, 0); drawObjects(ctx, objects);
  }
}

// full-size render for PDF export (no cache). `footer` is a short line printed under the page.
export async function renderPageFull(sb, page, objects, W, footer) {
  const H = Math.round(W * page.h / 1000), FH = footer ? 46 : 0;
  const c = document.createElement('canvas'); c.width = W; c.height = H + FH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H + FH);
  await drawBase(sb, page, ctx, W);
  ctx.setTransform(W / 1000, 0, 0, W / 1000, 0, 0); drawObjects(ctx, objects); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (footer) {
    ctx.fillStyle = '#F2EDE0'; ctx.fillRect(0, H, W, FH);
    ctx.fillStyle = '#1D2127'; ctx.fillRect(0, H, W, 2);
    ctx.font = `500 ${Math.round(FH * 0.42)}px ${FONT}`; ctx.textBaseline = 'middle';
    ctx.fillText(footer, 16, H + FH / 2 + 2);
  }
  return c;
}
