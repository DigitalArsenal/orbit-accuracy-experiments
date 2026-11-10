// stack #316, the reference's own integration: for cached windows, FFMq's three flights of one fitted product, and FFMq again at half its
// integrator tolerance (goal.md, qualification rule 2). Development windows, read before; every state is a module's.
//   scored    the flight the published FFMq figures come from: the fitted product flown to the scored epochs (one call, 300 s truth lattice)
//   cached    the trajectory cached for the carried record: the product flown at 60 s over the fit arc plus 7 days, each 9,000-state chunk a
//             separate integration from the fit epoch (lib/arms.mjs ffm)
//   one-pass  the same 60 s epochs flown once, each chunk started from the last state of the one before (lib/arms.mjs flyContinuous)
//   half      the product fitted again and flown to the scored epochs at half the integrator tolerance
// Per lead day: RMS and largest distance (m) between cached and one-pass (60 s epochs of the day), scored against one-pass and cached at the
// scored epochs, half against scored; FFMq's error against truth (km) and the change of its day-7 error at half tolerance.
//   node experiments/headline-loop/reference/ffm-integrations.mjs [--per-group 3] [--groups GD,IG,...] [--keys k1;k2] [--out file.jsonl]
import fs from 'node:fs';
import path from 'node:path';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const E = await import('../lib/env.mjs'); E.usePackages();
const W = await import('../lib/windows.mjs');
const A = await import('../lib/arms.mjs');
const { QUALIFIED, SETTINGS } = await import('../lib/settings.mjs');
const arms = await A.openArms({ apWasm: path.join(E.MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm') });
const groups = (args.groups ?? 'GD,IG,GE,HX,HE,LS,GN,GN_GAL,WA,DO,S1,P,T').split(',');
const listed = W.windowsOf(groups), all = [...listed.windows, ...listed.spring];
const dirOf = (g) => path.join(A.STORE_ROOT, 'ffm-cache', A.ffmCacheKey(QUALIFIED[g], 60).key);
const nameOf = (w, arc) => `${w.key.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${arc}`;
const cachedOf = (w) => { const arc = Math.max(...w.arcs), f = path.join(dirOf(w.group), `${nameOf(w, arc)}.json`); return fs.existsSync(f) ? { arc, doc: JSON.parse(fs.readFileSync(f, 'utf8')) } : null; };
let chosen;
if (args.keys) chosen = args.keys.split(';').map((k) => all.find((w) => w.key === k)).filter(Boolean);
else chosen = groups.flatMap((g) => { const c = all.filter((w) => w.group === g && cachedOf(w)?.doc?.trajectory); const n = Number(args['per-group'] ?? 3); return c.length ? Array.from({ length: Math.min(n, c.length) }, (_, i) => c[Math.floor(((i + 0.5) * c.length) / Math.min(n, c.length))]) : []; });
const out = args.out ?? null;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
for (const w of chosen) {
  const t0 = Date.now(), { arc, doc } = cachedOf(w), D0 = w.cutoffMs, G = W.GROUPS[w.group], q = QUALIFIED[w.group];
  const rec = { key: w.key, group: w.group, arc, arm: q };
  try {
    const truth = await W.truthOf(w, D0 - arc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
    const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
    const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
    const wx = G.vacuum ? null : W.weatherAt(D0);
    const cached = arms.trajectoryOf(dirOf(w.group), doc);
    const one = await arms.flyContinuous({ arm: q, product: doc.product, epochs: cached.map((l) => l.epoch), rows: wx?.ffm });
    const at = (list) => new Map(list.map((l) => [W.ms(l.epoch), l]));
    const C = at(cached), O = at(one);
    const scored = sc.epochs.map((e, i) => ({ epoch: e, r: doc.states[i] }));
    const half = await arms.ffm({ arm: q, thin, D0, rows: wx?.ffm, sc, halfTolerance: true });
    rec.days = {};
    for (const [j, d] of sc.entered.entries()) {
      const lo = D0 + (d - 1) * W.DAY, hi = D0 + d * W.DAY;
      const lat = cached.filter((l) => { const t = W.ms(l.epoch); return t > lo && t <= hi; }).map((l) => dist(l.r, O.get(W.ms(l.epoch)).r));
      const idx = sc.epochs.map((e, i) => [W.ms(e), i]).filter(([t]) => t > lo && t <= hi);
      const so = idx.map(([t, i]) => dist(scored[i].r, O.get(t).r)), scd = idx.map(([t, i]) => dist(scored[i].r, C.get(t).r)), hs = idx.map(([, i]) => dist(half.states[i].r, scored[i].r));
      const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / Math.max(1, v.length));
      rec.days[d] = { cachedVsOnePass: { rms: rms(lat), max: Math.max(...lat) }, scoredVsOnePass: { rms: rms(so), max: Math.max(...so) }, scoredVsCached: { rms: rms(scd), max: Math.max(...scd) }, halfVsScored: { rms: rms(hs), max: Math.max(...hs) }, ffmqErrorKm: doc.days[String(d)]?.e ?? null, halfErrorKm: half.days[String(d)]?.e ?? null };
    }
    const d7 = rec.days[7] ?? rec.days[Math.max(...Object.keys(rec.days).map(Number))];
    rec.day7Change = d7?.ffmqErrorKm ? d7.halfErrorKm / d7.ffmqErrorKm - 1 : null;
    rec.tolerance = SETTINGS[q].integrator.tolerance;
  } catch (e) { rec.error = String(e?.message ?? e).slice(0, 200); }
  rec.wallS = (Date.now() - t0) / 1000;
  if (out) fs.appendFileSync(out, `${JSON.stringify(rec)}\n`);
  const f = (x) => (Number.isFinite(x) ? x.toFixed(x >= 100 ? 0 : x >= 1 ? 2 : 4) : '-');
  console.log(rec.error ? `${w.key}: ${rec.error}` : `${w.key} ${arc} h ${q}: cached vs one-pass m (rms/max) d1 ${f(rec.days[1]?.cachedVsOnePass.rms)}/${f(rec.days[1]?.cachedVsOnePass.max)} d7 ${f(rec.days[7]?.cachedVsOnePass.rms)}/${f(rec.days[7]?.cachedVsOnePass.max)}; scored vs one-pass d7 ${f(rec.days[7]?.scoredVsOnePass.rms)}; half vs scored d7 ${f(rec.days[7]?.halfVsScored.rms)} m; FFMq d7 ${f(rec.days[7]?.ffmqErrorKm * 1000)} m, half-tolerance change ${f(rec.day7Change * 100)} %`);
}
process.exit(0);
