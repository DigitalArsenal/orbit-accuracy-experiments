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

/** Radial, in-track, cross-track distance of one track from the reference at each time, Float32 meters, positions in km. */
function offsetsOf(track, reference, count) {
  const out = new Float32Array(3 * count);
  for (let i = 0; i < count; i += 1) {
    const k = 3 * i, { p, R, I, C } = axesAt(reference, count, i);
    const d = [(track[k] - p[0]) * 1000, (track[k + 1] - p[1]) * 1000, (track[k + 2] - p[2]) * 1000];
    const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
    out[k] = dot(R); out[k + 1] = dot(I); out[k + 2] = dot(C);
  }
  return out;
}

/**
 * Where the reference's orbit steps: a burn the forecast does not know about moves the forecast's orbit-mean radial distance from the reference at once, and drag and fit error move it slowly.
 * At each sample, the mean over the orbit after less the mean over the orbit before, against the median absolute size of that difference for this example; a step is at least 8 of those and
 * at least 5 m. Hours from the first state. On next-prediction examples, only before the newer file starts, since the reference changes source there.
 */
function stepsOf(d, offsets) {
  const t = d.epochsSeconds, period = 86400 / d.meanMotion, lastT = d.reference === 'next' ? (d.scoreFromMs - Date.parse(d.start)) / 1000 : Infinity;
  const stepS = t[1] - t[0], stride = Math.max(1, Math.round(period / 4 / stepS));
  const mean = (from, to) => { let s = 0, n = 0; for (let i = 0; i < t.length; i += 1) if (t[i] >= from && t[i] < to) { s += offsets[3 * i]; n += 1; } return n >= (period / stepS) / 2 ? s / n : NaN; };
  const jumps = [];
  for (let i = 0; i < t.length; i += stride) {
    if (t[i] - period < t[0] || t[i] + period > Math.min(t.at(-1), lastT)) continue;
    const j = mean(t[i], t[i] + period) - mean(t[i] - period, t[i]);
    if (Number.isFinite(j)) jumps.push({ at: t[i], j });
  }
  if (!jumps.length) return [];
  const sizes = jumps.map((x) => Math.abs(x.j)).sort((p, q) => p - q), typical = sizes[sizes.length >> 1], floor = Math.max(5, 8 * typical);
  const events = [];
  for (const x of jumps) {
    if (Math.abs(x.j) < floor) continue;
    const last = events.at(-1);
    if (last && x.at - last.at < 2 * period) { if (Math.abs(x.j) > Math.abs(last.j)) { last.at = x.at; last.j = x.j; } } else events.push({ ...x });
  }
  const passive = /laser spheres|geodetic/i.test(d.regime) || /ajisai|starlette|stella|lares|larets|westpac|beacon|lageos|etalon/i.test(d.satellite);
  return events.map((e) => ({ hour: Math.round((e.at / 3600) * 10) / 10, radialM: Math.round(e.j * 10) / 10, kind: passive ? 'reference-step' : 'maneuver' }));
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
    const all = new Float64Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
    const section = (name) => all.subarray(size * d.tracks.indexOf(name), size * (d.tracks.indexOf(name) + 1));
    const arms = d.tracks.filter((t) => t !== 'reference');
    const referenceDrawn = !NOT_REDRAWN.has(d.provider);
    const reference = section('reference');
    const offsets = Object.fromEntries(arms.map((a) => [a, offsetsOf(section(a), reference, d.count)]));
    // One Float64 track in km, the reference where it may be drawn and AP elsewhere, then each arm's Float32 distances from the reference, then the Float32 rotations: little endian.
    const center = section(referenceDrawn ? 'reference' : 'AP');
    const parts = [center, ...arms.map((a) => offsets[a]), framesOf(reference, d.count)];
    fs.writeFileSync(path.join(OUT, `${d.id}.bin`), Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
    const { tracks: _, ...rest } = d;
    fs.writeFileSync(path.join(OUT, `${d.id}.json`), `${JSON.stringify({ ...rest, center: referenceDrawn ? 'reference' : 'AP', offsets: arms, referenceDrawn, steps: stepsOf(d, offsets.FFM) })}\n`);
    index.push({ id: d.id, reference: d.reference, regime: d.regime, provider: d.provider, satellite: d.satellite });
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index)}\n`);
console.log('examples', index.length, 'with the reference drawn', index.filter((e) => !NOT_REDRAWN.has(e.provider)).length);
