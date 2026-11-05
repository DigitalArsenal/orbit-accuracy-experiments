// The proof that no reference position of a licensed source can be computed from the published examples (results/ap-truth/compare/examples, lib/licensed.mjs).
// Two attacks on every committed licensed example, at every time, and one check of its axes:
//  1. identity: the stored track less the stored track's own offset vector, rotated by the stored axes (the reference, where the file holds both).
//  2. trilateration: every forecast whose absolute position the file yields is an anchor, its distance from the reference the radius; |x - p_a| = d_a solved by
//     Gauss-Newton. Unique only with 4 or more anchors at full rank; fewer leave a sphere, a circle or two mirror points.
//  axes: the stored axes must be the stored track's own (lib/licensed.mjs framesOf on AP's track, byte for byte), so they carry nothing but that track; the reference's axes
//     would put the reference on its radial axis at AP's distance from AP.
// The control: on the pre-change files (the form that leaked, read from this repository's history at PRE, never written anywhere) the identity recovers the
// reference at every time, trilateration at some, and the axes are not the stored track's own. The truth for scoring is the reference track of the full
// examples in the archive the publisher reads; nothing is written.
//   node experiments/operator-theory/compare-examples-proof.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { licensed, framesOf } from './lib/licensed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REL = 'results/ap-truth/compare/examples', DIR = path.join(ROOT, REL);
const PRE = '0b22a8b4d54b2970a275d78e266edb38f56065e7'; // the last commit that wrote the examples in the offsets form
const FULL = ['/opt/data/sdn-archive/operator-theory/ap/b0411/compare-examples-full', '/opt/data/sdn-archive/operator-theory/ap/b051/compare-examples-burn-free'];
const TOL_M = 1;
const pre = (n) => execFileSync('git', ['-C', ROOT, 'cat-file', 'blob', `${PRE}:${REL}/${n}`], { maxBuffer: 1 << 28 });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The reference at each time, m: the full example a later archive folder holds replacing an earlier one's, as compare-examples-publish.mjs reads them. */
function truthOf(id) {
  const dir = FULL.findLast((d) => fs.existsSync(path.join(d, `${id}.json`)));
  if (!dir) throw new Error(`${id}: no full example in ${FULL.join(', ')}`);
  const d = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')), raw = fs.readFileSync(path.join(dir, `${id}.bin`)), size = 3 * d.count;
  const all = new Float64Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)), k0 = size * d.tracks.indexOf('reference');
  return (i) => [all[k0 + 3 * i] * 1000, all[k0 + 3 * i + 1] * 1000, all[k0 + 3 * i + 2] * 1000];
}

/** What a file yields: { d, n, track (km), offsets {arm: Float32 radial, in-track, cross-track m} | null, errors {arm: Float32 m}, frames }. */
function parse(jsonBytes, bin) {
  const d = JSON.parse(jsonBytes.toString('utf8')), n = d.count, size = 3 * n;
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length), track = new Float64Array(ab, 0, size);
  if (Array.isArray(d.offsets)) {
    if (bin.length !== 8 * size + 4 * size * d.offsets.length + 16 * n) throw new Error(`${d.id}: ${bin.length} bytes, not the offsets form`);
    const offsets = Object.fromEntries(d.offsets.map((a, k) => [a, new Float32Array(ab, 8 * size + 4 * size * k, size)]));
    const errors = Object.fromEntries(d.offsets.map((a) => [a, Float32Array.from({ length: n }, (_, i) => Math.hypot(offsets[a][3 * i], offsets[a][3 * i + 1], offsets[a][3 * i + 2]))]));
    return { d, n, track, offsets, errors, frames: new Float32Array(ab, 8 * size + 4 * size * d.offsets.length, 4 * n) };
  }
  if (bin.length !== 8 * size + 4 * n * d.errors.length + 16 * n) throw new Error(`${d.id}: ${bin.length} bytes: the file holds more than the AP-only form`);
  const errors = Object.fromEntries(d.errors.map((a, k) => [a, new Float32Array(ab, 8 * size + 4 * n * k, n)]));
  return { d, n, track, offsets: null, errors, frames: new Float32Array(ab, 8 * size + 4 * n * d.errors.length, 4 * n) };
}

/** The stored rotation at time i as a matrix whose columns are in-track, cross-track, radial in GCRF. */
const quatM = (f, i) => { const x = f[4 * i], y = f[4 * i + 1], z = f[4 * i + 2], w = f[4 * i + 3];
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]; };
const toInertial = (M, [r, it, c]) => [0, 1, 2].map((row) => M[row][0] * it + M[row][1] * c + M[row][2] * r);
const at = (f, i) => [f.track[3 * i] * 1000, f.track[3 * i + 1] * 1000, f.track[3 * i + 2] * 1000];

/** Attack 1. null when the file holds no offset vector of its stored track's arm. */
function identity(f, i) {
  const o = f.offsets?.[f.d.center];
  if (!o) return null;
  const c = at(f, i), dv = toInertial(quatM(f.frames, i), [o[3 * i], o[3 * i + 1], o[3 * i + 2]]);
  return [c[0] - dv[0], c[1] - dv[1], c[2] - dv[2]];
}

/** Every forecast whose absolute position (m) the file yields at time i: the stored track's arm, and with offset vectors every other arm. */
function anchors(f, i) {
  const c = at(f, i), out = { [f.d.center]: c }, base = f.offsets?.[f.d.center];
  if (base) {
    const M = quatM(f.frames, i), k = 3 * i;
    for (const [a, o] of Object.entries(f.offsets)) if (a !== f.d.center) { const dv = toInertial(M, [o[k] - base[k], o[k + 1] - base[k + 1], o[k + 2] - base[k + 2]]); out[a] = [c[0] + dv[0], c[1] + dv[1], c[2] + dv[2]]; }
  }
  return out;
}

/** Attack 2: { x, rank, anchors }. Starts at the anchors' mean pushed out by the first radius (no truth used). */
function trilaterate(f, i) {
  const A = anchors(f, i), arms = Object.keys(A).filter((a) => f.errors[a]);
  if (arms.length < 4) return { x: null, rank: 0, anchors: arms.length };
  const P = arms.map((a) => A[a]), D = arms.map((a) => f.errors[a][i]);
  let x = [0, 1, 2].map((j) => P.reduce((s, p) => s + p[j], 0) / P.length + D[0] * 0.577), rank = 0;
  for (let it = 0; it < 50; it += 1) {
    const J = P.map((p) => { const r = dist(x, p) || 1; return [(x[0] - p[0]) / r, (x[1] - p[1]) / r, (x[2] - p[2]) / r]; });
    const res = P.map((p, a) => dist(x, p) - D[a]), N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    for (let a = 0; a < P.length; a += 1) for (let r = 0; r < 3; r += 1) { g[r] += J[a][r] * res[a]; for (let c = 0; c < 3; c += 1) N[r][c] += J[a][r] * J[a][c]; }
    const ev = eig3(N); rank = ev.filter((e) => e > 1e-6 * Math.max(...ev, 1e-30)).length;
    for (let r = 0; r < 3; r += 1) N[r][r] += 1e-9;
    const s = solve3(N, g); x = [x[0] - s[0], x[1] - s[1], x[2] - s[2]];
  }
  return { x, rank, anchors: P.length };
}
function solve3(A, b) { const m = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < 3; c += 1) { let p = c; for (let r = c + 1; r < 3; r += 1) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r; [m[c], m[p]] = [m[p], m[c]]; for (let r = 0; r < 3; r += 1) if (r !== c) { const q = m[r][c] / m[c][c]; for (let k = c; k < 4; k += 1) m[r][k] -= q * m[c][k]; } } return [0, 1, 2].map((i) => m[i][3] / m[i][i]); }
function eig3(A) { // symmetric 3x3 eigenvalues (Jacobi)
  const a = A.map((r) => [...r]);
  for (let s = 0; s < 50; s += 1) { let p = 0, q = 1; for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p = i; q = j; } if (Math.abs(a[p][q]) < 1e-30) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), sn = Math.sin(th);
    for (let k = 0; k < 3; k += 1) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - sn * akq; a[k][q] = sn * akp + c * akq; }
    for (let k = 0; k < 3; k += 1) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - sn * aqk; a[q][k] = sn * apk + c * aqk; } }
  return [a[0][0], a[1][1], a[2][2]];
}

/** True when the stored axes equal, byte for byte, the Float32 rotations computed from the stored track, so they carry nothing but that track. */
const axesOwn = (f) => Buffer.from(framesOf(f.track, f.n).buffer).equals(Buffer.from(f.frames.buffer, f.frames.byteOffset, f.frames.byteLength));

/** Recovered times for one file: { identity, trilateration, unique, maxAnchors }. */
function attack(f, truth) {
  const out = { identity: 0, trilateration: 0, unique: 0, maxAnchors: 0 };
  for (let i = 0; i < f.n; i += 1) {
    const t = truth(i), x1 = identity(f, i);
    if (x1 && dist(x1, t) <= TOL_M) out.identity += 1;
    const x2 = trilaterate(f, i); out.maxAnchors = Math.max(out.maxAnchors, x2.anchors);
    if (x2.x && x2.rank === 3) { out.unique += 1; if (dist(x2.x, t) <= TOL_M) out.trilateration += 1; }
  }
  return out;
}

const names = fs.readdirSync(DIR).filter((x) => x.endsWith('.json') && x !== 'index.json').sort();
const lines = [];
let failed = 0, files = 0, recovered = 0;
for (const name of names) {
  const pub = JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
  if (!licensed(pub)) continue;
  files += 1;
  const id = name.replace(/\.json$/, ''), truth = truthOf(id);
  const f = parse(fs.readFileSync(path.join(DIR, name)), fs.readFileSync(path.join(DIR, `${id}.bin`)));
  const was = parse(pre(name), pre(`${id}.bin`));
  const now = attack(f, truth), ctrl = attack(was, truth), own = axesOwn(f), wasOwn = axesOwn(was);
  const form = f.offsets === null && pub.center === 'AP' && pub.referenceDrawn === false && now.maxAnchors <= 1 && own;
  const safe = form && now.identity === 0 && now.trilateration === 0 && now.unique === 0;
  const control = ctrl.identity === was.n && ctrl.trilateration > 0 && !wasOwn;
  recovered += now.identity + now.trilateration;
  if (!safe || !control) failed += 1;
  lines.push(`${safe ? 'SAFE' : 'LEAK'}${control ? '' : ' CONTROL-FAIL'} ${id} (${pub.provider}): ${f.n} times; recovered identity ${now.identity}, trilateration ${now.trilateration} (anchors ${now.maxAnchors}, unique solves ${now.unique}), axes AP's own ${own}; control on ${PRE.slice(0, 7)}: identity ${ctrl.identity}/${was.n}, trilateration ${ctrl.trilateration}/${was.n} (anchors ${ctrl.maxAnchors}), axes the stored track's own ${wasOwn}`);
}
console.log(lines.join('\n'));
const expected = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).filter((e) => !e.held && !e.dropped && licensed(e)).length;
if (files !== expected || files === 0) { failed += 1; console.log(`index names ${expected} licensed examples, ${files} found`); }
console.log(`${failed ? 'FAIL' : 'PASS'}: ${files} licensed examples, ${recovered} reference positions recovered by identity or trilateration (tolerance ${TOL_M} m), axes AP's own in every one; ${failed ? 'see above' : `the control recovered the reference from every pre-change file at ${PRE.slice(0, 7)}`}`);
process.exit(failed ? 1 : 0);
