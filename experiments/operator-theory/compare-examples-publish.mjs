// COMPARE.md: what the site's globe reads, from the full examples compare-examples.mjs wrote. Every forecast's positions, and at each time its radial, in-track and cross-track distance from
// the reference, which are results, and the orbit-local axes at each time. The reference's own positions go out only where its source's terms allow them to be redrawn. Arithmetic on stored positions only.
//   node experiments/operator-theory/compare-examples-publish.mjs --in <dir>,<dir> --out <dir> [--check]   (a later --in folder's example replaces an earlier one's)
// --check writes nothing: every file this would write must equal the one in --out (the published examples) byte for byte.
// --reflown <dir>: full examples compare-examples.mjs flew again (the same ids); each track is reported equal to --in's byte for byte, or by its largest
// position difference, in m.
import fs from 'node:fs';
import path from 'node:path';
import { axesAt, offsetsOf, exampleSteps, exampleBurns } from './lib/steps.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out'), CHECK = process.argv.includes('--check');
if (!OUT || !argOf('--in')) throw new Error('--in and --out');
if (!CHECK) fs.mkdirSync(OUT, { recursive: true });
const differ = [];
let checked = 0;
/** Write one file, or under --check compare it with the published one. */
const put = (name, bytes) => {
  const file = path.join(OUT, name), b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (!CHECK) { fs.writeFileSync(file, b); return; }
  checked += 1;
  if (!fs.existsSync(file) || !fs.readFileSync(file).equals(b)) differ.push(name);
};
// No stated license, a non-commercial license, or terms that bind each recipient. SpaceX is not here: the owner ruled its numbers public on 2026-11-01.
const NOT_REDRAWN = new Set(['ESA', 'ESA navigation', 'ESA ultra-rapid', 'Intelsat', 'SES', 'China Space Station', 'Planet (Flock)']);

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
// Every example of the --in folders, a later folder's file replacing an earlier one's of the same id. Every Starlink group is held: its example is not parsed,
// and the index names it. An example dropped for want of a window without a step in its fit has no files; the index says why.
const files = new Map();
for (const dir of argOf('--in').split(',')) for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'index.json')) files.set(f, dir);
for (const [f, dir] of [...files].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (/starlink/i.test(f)) { index.push({ id: f.replace(/\.json$/, ''), held: 'every Starlink group is held; its example is not parsed' }); continue; }
  {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (d.dropped) { index.push({ id: d.id, reference: d.reference, regime: d.regime, provider: d.provider, ...(d.showcase ? { showcase: true } : {}), dropped: d.dropped }); continue; }
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
    put(`${d.id}.bin`, Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))));
    const { tracks: _, ...rest } = d;
    const steps = exampleSteps(d, offsets.FFM);
    put(`${d.id}.json`, `${JSON.stringify({ ...rest, center: referenceDrawn ? 'reference' : 'AP', offsets: arms, referenceDrawn, steps, ...exampleBurns(d, steps) })}\n`);
    index.push({ id: d.id, reference: d.reference, regime: d.regime, provider: d.provider, satellite: d.satellite, ...(d.showcase ? { showcase: true } : {}) });
  }
}
put('index.json', `${JSON.stringify(index)}\n`);
console.log('examples', index.filter((e) => !e.held && !e.dropped).length, 'with the reference drawn', index.filter((e) => !e.held && !e.dropped && !NOT_REDRAWN.has(e.provider)).length, 'held', index.filter((e) => e.held).length, 'dropped', index.filter((e) => e.dropped).length);
if (argOf('--reflown')) {
  const dirs = argOf('--in').split(','), tally = {};
  for (const f of fs.readdirSync(argOf('--reflown')).filter((n) => n.endsWith('.json') && n !== 'index.json' && !/starlink/i.test(n)).sort()) {
    const from = dirs.find((d) => fs.existsSync(path.join(d, f)));
    if (!from) { console.log(`${f}: not in --in`); continue; }
    const read = (dir) => ({ d: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), b: fs.readFileSync(path.join(dir, f.replace(/\.json$/, '.bin'))) });
    const x = read(argOf('--reflown')), y = read(from), size = 24 * x.d.count, moved = [];
    for (const t of x.d.tracks) {
      const p = x.b.subarray(size * x.d.tracks.indexOf(t), size * (x.d.tracks.indexOf(t) + 1)), q = y.b.subarray(size * y.d.tracks.indexOf(t), size * (y.d.tracks.indexOf(t) + 1));
      const same = x.d.count === y.d.count && p.equals(q);
      (tally[t] ??= { equal: 0, moved: 0 })[same ? 'equal' : 'moved'] += 1;
      if (!same) { let m = 0; for (let i = 0; i < Math.min(p.length, q.length); i += 8) m = Math.max(m, Math.abs(p.readDoubleLE(i) - q.readDoubleLE(i))); moved.push(`${t} ${(m * 1000).toFixed(1)} m`); }
    }
    console.log(`${f.replace(/\.json$/, '')}: ${moved.length ? moved.join(', ') : 'every track equal'}`);
  }
  console.log(`reflown tracks: ${JSON.stringify(tally)}`);
}
if (CHECK) {
  if (differ.length) { console.log(`COMPARE EXAMPLES CHECK FAIL: ${differ.length} of ${checked} files differ from ${OUT}: ${differ.slice(0, 8).join(', ')}`); process.exit(1); }
  console.log(`COMPARE EXAMPLES CHECK PASS: ${checked} files equal ${OUT} byte for byte`);
}
