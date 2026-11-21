// PDF.js (bundled in /vendor/pdfjs) + image loading, with small caches.
import { BUCKET } from './db.js';
import { BASE } from './util.js';

let pdfjsP = null;
export function loadPdfjs() {
  if (!pdfjsP) {
    pdfjsP = import(BASE + 'vendor/pdfjs/pdf.min.mjs').then(m => {
      m.GlobalWorkerOptions.workerSrc = BASE + 'vendor/pdfjs/pdf.worker.min.mjs';
      return m;
    });
  }
  return pdfjsP;
}

const docCache = new Map();   // storage path -> Promise<PDFDocumentProxy>
const imgCache = new Map();   // storage path -> Promise<ImageBitmap|HTMLImageElement>
const bmpCache = new Map();   // "path#n@w" -> canvas (small LRU)

async function openDoc(data) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: BASE + 'vendor/pdfjs/standard_fonts/',
    cMapUrl: BASE + 'vendor/pdfjs/cmaps/',
    cMapPacked: true,
    isEvalSupported: false,
  }).promise;
}

export async function pdfFromFile(file) {
  const buf = await file.arrayBuffer();
  return openDoc(new Uint8Array(buf));
}

export async function pdfInfo(doc) {
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    const vp = pg.getViewport({ scale: 1 });
    out.push({ n: i, h: Math.max(200, Math.min(6000, Math.round(1000 * vp.height / vp.width))) });
  }
  return out;
}

export function getDoc(sb, path) {
  if (!docCache.has(path)) {
    const p = (async () => {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) throw error;
      return openDoc(new Uint8Array(await data.arrayBuffer()));
    })();
    p.catch(() => docCache.delete(path));
    docCache.set(path, p);
  }
  return docCache.get(path);
}

export async function getImage(sb, path) {
  if (!imgCache.has(path)) {
    const p = (async () => {
      const { data, error } = await sb.storage.from(BUCKET).download(path);
      if (error) throw error;
      if (window.createImageBitmap) {
        try { return await createImageBitmap(data); } catch (e) { /* fall through */ }
      }
      const url = URL.createObjectURL(data);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      return img;
    })();
    p.catch(() => imgCache.delete(path));
    imgCache.set(path, p);
  }
  return imgCache.get(path);
}

// Render one PDF page to a canvas that is `widthPx` wide. Cached (last 6).
export async function renderPdfPage(sb, path, pageNum, widthPx) {
  const key = `${path}#${pageNum}@${widthPx}`;
  if (bmpCache.has(key)) { const c = bmpCache.get(key); bmpCache.delete(key); bmpCache.set(key, c); return c; }
  const doc = await getDoc(sb, path);
  const page = await doc.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: widthPx / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, canvas }).promise;
  bmpCache.set(key, canvas);
  while (bmpCache.size > 6) bmpCache.delete(bmpCache.keys().next().value);
  return canvas;
}

export function forgetFile(path) { docCache.delete(path); imgCache.delete(path); }

const mmCache = new Map();
// width of a PDF page in millimetres (so the ruler can show real centimetres)
export async function pdfPageMm(sb, path, pageNum) {
  const key = path + '#' + pageNum;
  if (!mmCache.has(key)) {
    const doc = await getDoc(sb, path), page = await doc.getPage(pageNum);
    mmCache.set(key, page.getViewport({ scale: 1 }).width * 25.4 / 72);
  }
  return mmCache.get(key);
}
