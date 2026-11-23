// A picture file (from the camera, the photo library or a file) -> a small JPEG as a data address, ready to be kept inside a board object.
// Objects may hold 300000 bytes at most, so the picture is made smaller until it fits in 200000 letters.
export async function pictureFromFile(file, maxSide = 1100) {
  if (!file || (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name || ''))) throw new Error('That file is not a picture.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('This picture cannot be opened. Try a JPEG or PNG picture.')); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight;
    if (!W || !H) throw new Error('This picture cannot be opened. Try a JPEG or PNG picture.');
    for (let side = maxSide; side >= 480; side = Math.round(side * 0.8)) {
      const k = Math.min(1, side / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      for (let q = 0.82; q >= 0.45; q -= 0.1) { const d = c.toDataURL('image/jpeg', q); if (d.length <= 200000) return { src: d, w, h }; }
    }
    throw new Error('This picture is too big. Try a smaller one.');
  } finally { URL.revokeObjectURL(url); }
}
