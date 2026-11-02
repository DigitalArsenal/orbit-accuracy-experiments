// COMPARE.md: what the site's globe reads, from the full examples compare-examples.mjs wrote. Every forecast's positions, and at each time its radial, in-track and cross-track distance from
// the reference, which are results, and the orbit-local axes at each time. The reference's own positions go out only where its source's terms allow them to be redrawn. Arithmetic on stored positions only.
//   node experiments/operator-theory/compare-examples-publish.mjs --in <dir>,<dir> --out <dir>
import fs from 'node:fs';
import path from 'node:path';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT || !argOf('--in')) throw new Error('--in and --out');
fs.mkdirSync(OUT, { recursive: true });
// No stated license, a non-commercial license, or terms that bind each recipient. SpaceX is not here: the owner ruled its numbers public on 2026-11-01.
const NOT_REDRAWN = new Set(['ESA', 'ESA navigation', 'ESA ultra-rapid', 'Intelsat', 'SES', 'China Space Station', 'Planet (Flock)']);

/** The reference's radial, in-track and cross-track axes at one sample, in GCRF; its motion is differenced across the sample. */
function axesAt(reference, count, i) {
  const k = 3 * i, lo = 3 * Math.max(0, i - 1), hi = 3 * Math.min(count - 1, i + 1);
  const p = [reference[k], reference[k + 1], reference[k + 2]], v = [reference[hi] - reference[lo], reference[hi + 1] - reference[lo + 1], reference[hi + 2] - reference[lo + 2]];
  const r = Math.hypot(...p), R = p.map((x) => x / r);
  const c = [p[1] * v[2] - p[2] * v[1], p[2] * v[0] - p[0] * v[2], p[0] * v[1] - p[1] * v[0]], m = Math.hypot(...c), C = c.map((x) => x / m);
  return { p, R, I: [C[1] * R[2] - C[2] * R[1], C[2] * R[0] - C[0] * R[2], C[0] * R[1] - C[1] * R[0]], C };
}

/** Radial, in-track, cross-track distance of one track from the reference at each time, Int32 meters. */
function offsetsOf(track, reference, count) {
  const out = new Int32Array(3 * count);
  for (let i = 0; i < count; i += 1) {
    const k = 3 * i, { p, R, I, C } = axesAt(reference, count, i);
    const d = [track[k] - p[0], track[k + 1] - p[1], track[k + 2] - p[2]];
    const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    out[k] = Math.round(dot(R)); out[k + 1] = Math.round(dot(I)); out[k + 2] = Math.round(dot(C));
  }
  return out;
}

/** The rotation from the axes in-track, cross-track, radial to GCRF at each time, Float32 quaternions x, y, z, w. The site reads these and builds no axes of its own. */
function framesOf(reference, count) {
  const out = new Float32Array(4 * count);
  for (let i = 0; i < count; i += 1) {
    const { R, I, C } = axesAt(reference, count, i);
    const m00 = I[0], m10 = I[1], m20 = I[2], m01 = C[0], m11 = C[1], m21 = C[2], m02 = R[0], m12 = R[1], m22 = R[2], t = m00 + m11 + m22;
    let x, y, z, w;
    if (t > 0) { const s = 2 * Math.sqrt(t + 1); w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
    else if (m00 >= m11 && m00 >= m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 >= m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
    out.set([x, y, z, w], 4 * i);
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
    const parts = [...tracks.map(section), ...arms.map((a) => offsetsOf(section(a), reference, d.count)), framesOf(reference, d.count)];
    fs.writeFileSync(path.join(OUT, `${d.id}.bin`), Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
    fs.writeFileSync(path.join(OUT, `${d.id}.json`), `${JSON.stringify({ ...d, tracks, offsets: arms, referenceDrawn })}\n`);
    index.push({ id: d.id, reference: d.reference, regime: d.regime, provider: d.provider, satellite: d.satellite });
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index)}\n`);
console.log('examples', index.length, 'with the reference drawn', index.filter((e) => !NOT_REDRAWN.has(e.provider)).length);
