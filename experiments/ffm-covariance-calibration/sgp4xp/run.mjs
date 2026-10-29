// C2-A9: the SGP4-XP fairness calibration. B2's SGP4-XP arm exactly: propagator/sdn-ap `fit` with THEORY SGP4XP (B2's registered
// build 62c783262da9, through B2 lib/fits.mjs) on each class's 24 h fit track - ISS: the NASA track (EME2000); type L: the FFM-carried
// 24 h track of the E6 R product (60 s, as part2-laser.mjs); L-P and R1: the precise truth track - and its covariance at each lead by
// `sdnap_covariance_at` (TEME), the truth taken to TEME by foundation/frames; the error and A_xp in the predicted state's RTN axes by
// gp-error-model pair_statistics. The windows, leads, truth and screens are C2's own (the FFM rows of each class define them).
//   node experiments/ffm-covariance-calibration/sgp4xp/run.mjs --class I|L|LP|R1 --set calibration|validation|heldOut [--shard k/n]
// Rows: <store>/rows-sgp4xp/<class>.<set>.s<k>.jsonl. Records and routing only.
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, Opened, store, args, HOUR, DAY, iso, root, results } from '../common.mjs';
import { b2, truthSeries, windowAt, nearest } from '../lib/precise.mjs';

frozen();
const cls = args.class, set = args.set;
if (!['I', 'L', 'LP', 'R1'].includes(cls)) throw new Error('--class I|L|LP|R1');
if (!['calibration', 'validation', 'heldOut'].includes(set)) throw new Error('--set calibration|validation|heldOut');
if (set === 'heldOut' && !fs.existsSync(path.join(results, 'sgp4xp/frozen-constants.json'))) throw new Error('SGP4-XP held-out sets are scored only after its freeze');
const B2C = JSON.parse(fs.readFileSync(b2('config.json')));
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const rowsDir = path.join(store, 'rows'), outDir = path.join(store, 'rows-sgp4xp');
fs.mkdirSync(outDir, { recursive: true });
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const rowsOf = (prefix) => fs.readdirSync(rowsDir).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(rowsDir, f)));
const opened = new Opened();
const out = path.join(outDir, `${cls}.${set}.s${k}.jsonl`);
const done = new Set(readJsonl(out).map((r) => r.id));

const { openFits, fitSdnap, sgp4xpCovarianceAt, convert } = await import(b2('lib/fits.mjs'));
const G1M = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/modules.mjs'));
const a = await openFits(G1M.modulesRoot()); // B2's modules; openFits refuses any SDN-AP build but B2's registered one
const { openPairs } = await import('../lib/pairs.mjs');
const pairs = await openPairs(B2C.a12.modulesLinks);
const tol = B2C.a5.ca.leadToleranceSeconds;

/** The SGP4-XP fit on `track` ([{epoch, r, v}] km in `axes`) and its lead records against truth lines in `axes`. */
async function sgp4xpWindow(object, track, E, leads, axes) {
  const f = await fitSdnap(a, { ...object, frame: axes }, track, E, 'SGP4XP');
  if (!f.ok) return { fit: { ok: false, error: f.error } };
  const epochs = leads.map((x) => Date.parse(x.line.epoch));
  const predicted = await sgp4xpCovarianceAt(a, f.omm, epochs);
  const truth = await convert(a, leads.map((x) => x.line), axes, 'TEME');
  const st = await pairs.stats(predicted.map((p, i) => ({ predicted: { position: p.r.map((q) => q * 1000), velocity: p.v.map((q) => q * 1000), covariance: p.covariance.map((q) => q * 1e6), covarianceAxes: 'INERTIAL' },
    truth: { position: truth[i].r.map((q) => q * 1000), velocity: truth[i].v.map((q) => q * 1000) } })), 'predicted');
  return { fit: { ok: true, epoch: f.epoch, moduleFitRmsKm: f.moduleFitRmsKm, fitMs: f.fitMs }, leads: leads.map((x, i) => ({ L: x.L, epoch: x.line.epoch, errRtnM: st[i].errorRtn, terms: { A: st[i].predictedRtn }, truthSigmaM: x.line.sigma ?? null })) };
}

const tasks = [];
if (cls === 'I') {
  const W = await import(b2('lib/iss-window.mjs'));
  const { leadLines } = await import(b2('lib/leads.mjs'));
  const fitRows = rowsOf('iss-fit.').filter((r) => r.set === set && !r.excluded);
  for (const r of fitRows) tasks.push({ id: r.file, run: async () => {
    const i = W.headers.findIndex((h) => h.date === r.file);
    const w = W.windowOf(i);
    opened.add(W.headers[i].file, 'ISS OEM');
    const leads = leadLines(w.truth, w.E, tol.iss);
    return { file: r.file, E: r.E, ...(await sgp4xpWindow({ name: 'ISS', norad: 25544, originator: 'NASA JSC FOD' }, w.track, w.E, leads, 'EME2000')) };
  } });
} else if (cls === 'LP' || cls === 'R1') {
  const src = cls === 'LP' ? (set === 'heldOut' ? rowsOf('heldout.LP.') : rowsOf(`lp-terms.${set}.`)) : rowsOf(`R1.${set}.s`);
  const P9 = JSON.parse(fs.readFileSync(path.join(results, 'precheck-P9.json')));
  const prefixOf = (norad) => { const o = P9.perObject.find((x) => x.norad === norad); return o.products.includes('nsgf') ? 'nsgf.orb.' : o.products.includes('SW') ? 'SW_OPER' : o.products.includes('GFZOP') ? 'GFZOP' : o.products.includes('leoOrb') ? 'leoOrb' : o.products[0]; };
  const series = new Map();
  const keep = src.filter((x) => !(x.excluded && /fit track|no state at the track start|no truth/.test(x.excluded))).sort((x, y) => x.norad - y.norad || Date.parse(x.E) - Date.parse(y.E));
  const span = new Map(); for (const r of keep) { const e = Date.parse(r.E), s0 = span.get(r.norad) ?? [e, e]; span.set(r.norad, [Math.min(s0[0], e), Math.max(s0[1], e)]); }
  for (const r of keep) tasks.push({ id: `${r.norad}|${r.E}`, run: async () => {
    const E = Date.parse(r.E);
    const key = `${r.norad}`;
    if (!series.has(key)) { series.clear(); const [lo2, hi2] = span.get(r.norad); series.set(key, truthSeries(r.norad, cls === 'LP' ? `nsgf.orb.${r.sphere}.` : prefixOf(r.norad), { opened, from: lo2 - 3 * DAY, to: hi2 + 5 * DAY })); }
    const s = series.get(key);
    const w = windowAt(s, E, { leadToleranceSeconds: cls === 'LP' ? tol.laser : tol.laser });
    if (w.excluded) return { norad: r.norad, E: r.E, excluded: w.excluded };
    return { norad: r.norad, E: r.E, subset: r.subset, cluster: r.cluster ?? r.norad, screen: r.screen ?? null, trackMaxSigmaM: Math.max(...w.track.map((l) => l.sigma ?? 0)), ...(await sgp4xpWindow({ name: `${r.norad}`, norad: r.norad, originator: 'C2 precise track' }, w.track, E, w.leads, 'GCRF')) };
  } });
} else if (cls === 'L') {
  const FFM = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/ffm.mjs'));
  const { ffmEnvironment } = await import(path.join(root, 'experiments/sdn-ap-baselines/lib/environment.mjs'));
  const modules = G1M.modulesRoot();
  const g1Context = await FFM.loadEnvironment(modules, { archive: '/opt/data/sdn-archive', store: path.join('/opt/data/sdn-archive', 'sdn-gp-starlink-ffm-match') });
  const env = await ffmEnvironment(modules, g1Context);
  const P = g1Context.catalog.prw;
  const forces = { THIRD_BODY_IDS: [10, 301], OCEAN_TIDES: P.pcfOceanTideModel.NONE, EARTH_RADIATION: P.pcfEarthRadiationModel.NONE }; // part2-laser.mjs's E6 force model
  const A4 = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../amendments.json')))['C2-A4'].typeL;
  const [lo, hi] = A4[set];
  const runsDir = set === 'heldOut' ? '/Users/tj/software/worktrees/orbit-accuracy-experiments--experiments-b2-ffm-iss-starlink-20261026/runs' : path.join(store, 'runs');
  const prefix = set === 'heldOut' ? 'e6-40-slr-fit-test-' : 'e6-40-slr-fit-dev-';
  const products = fs.readdirSync(runsDir).filter((d) => d.startsWith(prefix)).flatMap((d) => readJsonl(opened.add(path.join(runsDir, d, 'products.jsonl'), 'E6 R products')))
    .filter((q) => q.variant === 'R' && q.cutoff.slice(0, 10) >= lo && q.cutoff.slice(0, 10) <= hi).sort((x, y) => x.norad - y.norad || Date.parse(x.cutoff) - Date.parse(y.cutoff));
  const E6 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/e6-public-observations/config.json'))).slr.targets;
  const nameOf = (norad) => Object.keys(E6).find((t) => E6[t].norad === norad);
  const series = new Map();
  for (const q of products) tasks.push({ id: `${q.norad}|${q.cutoff}`, run: async () => {
    const T = Date.parse(q.cutoff), t = nameOf(q.norad);
    if (!series.has(t)) { series.clear(); series.set(t, truthSeries(q.norad, `nsgf.orb.${t}.`, { opened, from: Date.parse(lo) - 3 * DAY, to: Date.parse(hi) + 5 * DAY })); }
    const leads = config.model.leads_h.flatMap((L) => { const line = nearest(series.get(t), T + L * HOUR, tol.laser * 1000); return line ? [{ L, line }] : []; });
    if (!leads.length) return { norad: q.norad, E: q.cutoff, excluded: 'no truth at any lead' };
    const epochs = Array.from({ length: B2C.part2.trackHours * 3600 / B2C.part2.trackStepSeconds + 1 }, (_, j) => T - B2C.part2.trackHours * HOUR + j * B2C.part2.trackStepSeconds * 1000);
    const ctx = { ...g1Context, inputs: env.inputsFor(T - B2C.part2.trackHours * HOUR - DAY, T + 4 * DAY) };
    const back = await FFM.propagate(modules, ctx, { epoch: iso(T), state: q.state, cdAm: q.parameters?.[0]?.value, crAm: q.fixed?.agom, epochs, forces });
    const track = back.samples.map((s) => ({ epoch: iso(s.ms), r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000) }));
    return { norad: q.norad, sphere: t, E: q.cutoff, cluster: q.norad, ...(await sgp4xpWindow({ name: t, norad: q.norad, originator: 'B2 from E6 R' }, track, T, leads, 'GCRF')) };
  } });
}

for (let i = 0; i < tasks.length; i += 1) {
  const t = tasks[i];
  if (i % n !== k || done.has(t.id)) continue;
  const t0 = Date.now();
  let row;
  try { row = await t.run(); } catch (error) { row = { failed: `refused: ${String(error.message).slice(0, 200)}` }; }
  fs.appendFileSync(out, `${JSON.stringify({ id: t.id, class: cls, set, ...row, seconds: (Date.now() - t0) / 1000 })}\n`);
}
fs.writeFileSync(path.join(store, 'opened', `sgp4xp.${cls}.${set}.s${k}.json`), JSON.stringify(opened.list()));
await pairs.close();
await a.close();
process.exit(0);
