// TRUTH-SERIES.md: the TESS truth series every HE window and example reads (experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs spkObjectSeries, states
// by files/orbit-products read_container, epochs by foundation/time) holds only the kernels' ten-minute nodes, and its second differences sit within the bound
// registered there. Module calls for every state; the test's arithmetic is differences of stored states.
//   SDN_MODULES_ROOT=<modules checkout> node experiments/ap6-heo/truth-series.e2e.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { spkObjectSeries, nodeRows } = await import(pathToFileURL(path.join(REPO, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
const { openContainers, readSpk } = await import(pathToFileURL(path.join(REPO, 'experiments/sdn-gp-starlink-ffm-match/lib/containers.mjs')).href);
const { openTime, convertAll } = await import(pathToFileURL(path.join(REPO, 'experiments/sdn-gp-starlink-ffm-match/lib/timeconv.mjs')).href);
const { TESS } = await import(pathToFileURL(path.join(REPO, 'experiments/operator-theory/lib/regimes.mjs')).href);

// Registered (TRUTH-SERIES.md): on equally spaced states h apart, |r(+h) - 2 r + r(-h) - (v(+h) - v(-h)) h / 2| <= 5 m. The truncation term h^4/12 |d2a/dt2| is
// below 1 mm for TESS at h <= 600 s; the kernels' velocity steps (momentum unloads, about 1 cm/s) add at most dv h / 2 = 3 m at 600 s. A triple that straddles
// a solution switch (the reader takes each newer file from its first state, 13:00 UTC) holds the step between two solutions, not an orbit's curvature: those are
// counted and sized apart, and on the example lattice the eight-point stencils that reach across one are left out the same way.
const BOUND_M = 5, NODE_S = 600;
const ms = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);
const residualM = (a, b, c, h) => 1000 * Math.hypot(...[0, 1, 2].map((k) => c.r[k] - 2 * b.r[k] + a.r[k] - ((c.v[k] - a.v[k]) * h) / 2));
// The worst residual over equally spaced triples; `apart(t0, t2)` true sets a triple aside (a solution switch), its residual kept in `joins`.
const worst = (lines, timeOf, apart = () => false) => {
  let max = 0, at = null, triples = 0;
  const joins = [];
  for (let i = 1; i < lines.length - 1; i += 1) {
    const h = (timeOf(lines[i]) - timeOf(lines[i - 1])) / 1000;
    if (Math.abs((timeOf(lines[i + 1]) - timeOf(lines[i])) / 1000 - h) > 1e-3) continue;
    const e = residualM(lines[i - 1], lines[i], lines[i + 1], h);
    if (apart(timeOf(lines[i - 1]), timeOf(lines[i + 1]))) { joins.push(e); continue; }
    triples += 1;
    if (e > max) { max = e; at = lines[i]; }
  }
  return { max, at, triples, joins };
};
const failures = [];
const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
if (!files.length) throw new Error(`no TESS kernels under ${TESS.dir}`);

// 1. The cause, in the kernel as the module reads it: one-minute records, nine in ten on the straight line between ten-minute nodes.
const containers = await openContainers(process.env.SDN_MODULES_ROOT);
const read = await readSpk(containers, files[0]);
const starts = [];
for (const file of files.slice(1)) { const r = await readSpk(containers, file); if (r.error) throw new Error(r.error); starts.push(r.oem.EPHEMERIS_DATA_BLOCK[0].START_TIME); }
await containers.destroy();
if (read.error) throw new Error(read.error);
const time = await openTime(process.env.SDN_MODULES_ROOT);
const switches = (await convertAll(time, starts)).map(ms);
await time.destroy();
let records = 0, kept = 0, rawWorst = 0;
for (const block of read.oem.EPHEMERIS_DATA_BLOCK) {
  const rows = (block.EPHEMERIS_DATA_LINES ?? []).map((l) => ({ tdb: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] }));
  records += rows.length; kept += nodeRows(rows).length;
  rawWorst = Math.max(rawWorst, worst(rows, (x) => ms(x.tdb)).max);
}
const share = 1 - kept / records;
console.log(`cause: ${path.basename(files[0])} holds ${records} one-minute records; ${records - kept} (${(100 * share).toFixed(1)} %) lie on the straight line between ten-minute nodes (position and velocity second difference zero); the one-minute series' worst second-difference residual ${rawWorst.toFixed(1)} m`);
if (share < 0.89) failures.push(`only ${(100 * share).toFixed(1)} % of the records on a line`);
if (rawWorst <= BOUND_M) failures.push('the one-minute records pass the bound: the test does not see the defect');

// 2. The reader's series over the whole TESS span: nodes only, on the ten-minute UTC lattice, within the bound.
const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
const t = s.lines.map((l) => ms(l.epoch));
const offLattice = t.filter((x) => Math.round(x / 1000) % NODE_S !== 0).length;
const spacings = new Map();
for (let i = 1; i < t.length; i += 1) { const d = Math.round((t[i] - t[i - 1]) / 1000); spacings.set(d, (spacings.get(d) ?? 0) + 1); }
const straddles = (pad) => (a, b) => switches.some((x) => a - pad < x && x <= b + pad);
const series = worst(s.lines, (l) => ms(l.epoch), straddles(0));
console.log(`series: ${s.lines.length} states ${s.lines[0].epoch} to ${s.lines.at(-1).epoch}; spacings ${JSON.stringify(Object.fromEntries(spacings))} s; off the ${NODE_S} s lattice ${offLattice}; worst residual ${series.max.toFixed(3)} m on ${series.triples} triples (at ${series.at?.epoch}); ${series.joins.length} triples straddle ${switches.length} solution switches, residual up to ${Math.max(...series.joins).toFixed(1)} m`);
if (offLattice) failures.push(`${offLattice} states off the ${NODE_S} s lattice`);
if ([...spacings.keys()].some((d) => d % NODE_S !== 0)) failures.push('a spacing that is not a multiple of the node spacing');
if (series.max > BOUND_M) failures.push(`series residual ${series.max.toFixed(3)} m above ${BOUND_M} m`);

// 3. The example lattice: the example writer's eight-point Lagrange of the series at 300 s (compare-examples.mjs onGrid), within the bound at its own spacing.
const lag = (tq) => {
  let i = 0;
  while (i + 1 < t.length && t[i + 1] <= tq) i += 1;
  const lo = Math.max(0, Math.min(t.length - 8, i - 3)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
  if (t[lo + 7] - t[lo] > 10 * NODE_S * 1000) return null;
  const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (tq - t[b])) / (t[a] - t[b])), 1));
  const mix = (key) => [0, 1, 2].map((c) => idx.reduce((sum, a, k) => sum + w[k] * s.lines[a][key][c], 0));
  return { t: tq, r: mix('r'), v: mix('v') };
};
const grid = [];
for (let tq = t[0]; tq <= t.at(-1); tq += 300000) { const p = lag(tq); if (p) grid.push(p); }
const lattice = worst(grid, (p) => p.t, straddles(4 * NODE_S * 1000));
console.log(`example lattice (300 s): ${grid.length} states; worst residual ${lattice.max.toFixed(3)} m on ${lattice.triples} triples; ${lattice.joins.length} set aside within four nodes of a switch`);
if (lattice.max > BOUND_M) failures.push(`example-lattice residual ${lattice.max.toFixed(3)} m above ${BOUND_M} m`);

console.log(failures.length ? `TRUTH SERIES FAIL: ${failures.join('; ')}` : `TRUTH SERIES PASS: TESS series ${s.lines.length} nodes, residual ${series.max.toFixed(3)} m <= ${BOUND_M} m, example lattice ${lattice.max.toFixed(3)} m (one-minute records ${rawWorst.toFixed(1)} m); cause: ${(100 * share).toFixed(1)} % of the kernel's records are linear between ten-minute nodes`);
process.exit(failures.length ? 1 : 0);
