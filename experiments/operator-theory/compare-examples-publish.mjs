// COMPARE.md: what the site's globe reads, from the full examples compare-examples.mjs wrote. Every forecast's positions, and at each time its radial, in-track and cross-track distance from
// the reference, which are results. The reference's own positions go out only where its source's terms allow them to be redrawn. Arithmetic on stored positions only.
//   node experiments/operator-theory/compare-examples-publish.mjs --in <dir>,<dir> --out <dir>
import fs from 'node:fs';
import path from 'node:path';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT || !argOf('--in')) throw new Error('--in and --out');
fs.mkdirSync(OUT, { recursive: true });
// No stated license, a non-commercial license, or terms that bind each recipient. SpaceX is not here: the owner ruled its numbers public on 2026-11-01.
const NOT_REDRAWN = new Set(['ESA', 'ESA navigation', 'ESA ultra-rapid', 'Intelsat', 'SES', 'China Space Station', 'Planet (Flock)']);

/** Radial, in-track, cross-track distance of one track from the reference at each time, Int32 meters. The reference's motion is differenced across a sample. */
function offsetsOf(track, reference, count) {
  const out = new Int32Array(3 * count);
  for (let i = 0; i < count; i += 1) {
    const k = 3 * i, lo = 3 * Math.max(0, i - 1), hi = 3 * Math.min(count - 1, i + 1);
    const p = [reference[k], reference[k + 1], reference[k + 2]], v = [reference[hi] - reference[lo], reference[hi + 1] - reference[lo + 1], reference[hi + 2] - reference[lo + 2]];
    const r = Math.hypot(...p), R = p.map((x) => x / r);
    const c = [p[1] * v[2] - p[2] * v[1], p[2] * v[0] - p[0] * v[2], p[0] * v[1] - p[1] * v[0]], m = Math.hypot(...c), C = c.map((x) => x / m);
    const I = [C[1] * R[2] - C[2] * R[1], C[2] * R[0] - C[0] * R[2], C[0] * R[1] - C[1] * R[0]];
    const d = [track[k] - p[0], track[k + 1] - p[1], track[k + 2] - p[2]];
    const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    out[k] = Math.round(dot(R)); out[k + 1] = Math.round(dot(I)); out[k + 2] = Math.round(dot(C));
  }
  return out;
}

const index = [];
for (const dir of argOf('--in').split(',')) {
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'index.json').sort()) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const raw = fs.readFileSync(path.join(dir, f.replace(/\.json$/, '.bin')));
    const size = 3 * d.count;
    const all = new Int32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    const section = (name) => all.subarray(size * d.tracks.indexOf(name), size * (d.tracks.indexOf(name) + 1));
    const arms = d.tracks.filter((t) => t !== 'reference');
    const referenceDrawn = !NOT_REDRAWN.has(d.provider);
    const tracks = referenceDrawn ? d.tracks : arms;
    const reference = section('reference');
    const parts = [...tracks.map(section), ...arms.map((a) => offsetsOf(section(a), reference, d.count))];
    fs.writeFileSync(path.join(OUT, `${d.id}.bin`), Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
    fs.writeFileSync(path.join(OUT, `${d.id}.json`), `${JSON.stringify({ ...d, tracks, offsets: arms, referenceDrawn })}\n`);
    index.push({ id: d.id, reference: d.reference, regime: d.regime, provider: d.provider, satellite: d.satellite });
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index)}\n`);
console.log('examples', index.length, 'with the reference drawn', index.filter((e) => !NOT_REDRAWN.has(e.provider)).length);
