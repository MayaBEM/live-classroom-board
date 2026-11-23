// Takes a snapshot of the web apps in Maya's public library (brightengmath.com/library) for the "Pick from my library" list.
// The library does not allow other sites to read it live, so this copies the list (names + cover pictures) into this site.
// Run:  node tools/library-snapshot.mjs     (needs macOS "sips" for the pictures)
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://brightengmath.com';
// Where each app really lives. The library keeps the app file private, so these addresses are told to us, not read.
// A slug is confirmed by opening https://math.brightengmath.com/<slug>.html
const SLUGS = [
  [/gingerbread house/i, 'gingerbread-house-builder'],
  [/cupcake/i, 'cupcake-decorating-studio'],
  [/sandwich/i, 'sandwich-and-lunchbox-maker'],
  [/describing words fish|fish designer/i, 'fish-designer-aquarium'],
  [/ugly sweater/i, 'ugly-sweater-designer'],
  [/angle lab/i, 'angle-lab'],
];

const j = await (await fetch(SITE + '/api/materials')).json();
const apps = j.materials.filter(m => m.fileType === 'Web App' && !m.hidden);
mkdirSync('img/library', { recursive: true });
const tmp = join(tmpdir(), 'lib-snap'); mkdirSync(tmp, { recursive: true });
const out = [];
for (const m of apps) {
  const file = `img/library/${m.id.replace(/[^a-z0-9-]/gi, '')}.jpg`;
  let cover = null;
  if (m.coverImageUrl) {
    try {
      const r = await fetch(SITE + m.coverImageUrl); if (!r.ok) throw new Error(r.status);
      const src = join(tmp, 'src.img'); writeFileSync(src, Buffer.from(await r.arrayBuffer()));
      // a square picture cut from the middle, 360 x 360
      const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src]).toString();
      const w = +info.match(/pixelWidth: (\d+)/)[1], h = +info.match(/pixelHeight: (\d+)/)[1];
      const big = join(tmp, 'big.jpg');
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '--resampleHeightWidthMax', String(Math.round(360 * Math.max(w, h) / Math.min(w, h))), src, '--out', big], { stdio: 'ignore' });
      execFileSync('sips', ['--cropToHeightWidth', '360', '360', big, '--out', file], { stdio: 'ignore' });
      cover = file;
    } catch (e) { console.warn('no cover for', m.title, String(e.message || e)); }
  }
  const slug = (SLUGS.find(([re]) => re.test(m.title)) || [])[1] || null;
  out.push({ id: m.id, title: m.title, subject: m.subject, grades: m.grades, cover, url: slug ? `https://math.brightengmath.com/${slug}.html` : null, bundle: m.bundleName || null });
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync('data/library-apps.json', JSON.stringify({ taken: new Date().toISOString().slice(0, 10), apps: out }, null, 1));
console.log(`${out.length} apps, ${out.filter(a => a.url).length} with a known link, ${out.filter(a => a.cover).length} with a cover`);
