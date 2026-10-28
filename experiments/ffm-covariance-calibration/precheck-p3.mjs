// C2 pre-check P3, empirical step (PLAN.md 3.8; C2-A1 point 3): is the laser spheres' common along-track bias (+4.0 to +5.65 m, about
// 0.66 ms, seen on B2 part 2's normal-point fits) present when FFM is fitted to the NSGF orbit itself? Per sphere (type L, Stella left
// out as R2's held-out object) and calibration-period cutoff (every second day, 2025-10-03 to 2026-03-31), only NSGF arcs whose stated
// overlap RMS is at or under 0.3 m: fit_batch version 3 (harness/ffm-fit-v3.mjs, A12's modules) on the 24 h NSGF track at 10 min,
// 10 m per axis, with E6 R's parameterization (state and B, B seeded at E6's value with a priori 30 %, AGOM fixed at E6's), B2's forces
// and integrator; the product carried by propagator/ffm to E + L; the error in the truth's RTN axes by gp-error-model pair_statistics.
// A bias that survives here sits in FFM or the truth's time labels; one that vanishes sits in the normal-point path.
//   node experiments/ffm-covariance-calibration/precheck-p3.mjs [--shard k/n] [--limit n]     (rows under <store>/p3/)
//   node experiments/ffm-covariance-calibration/precheck-p3.mjs --summary                     (the receipt)
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, Opened, writeReceipt, store, args, DAY, HOUR, iso, root, NAMED } from './common.mjs';
import { truthSeries, windowAt, b2 } from './lib/precise.mjs';

frozen();
const B2C = JSON.parse(fs.readFileSync(b2('config.json')));
const E6 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/e6-public-observations/config.json'))).slr.targets;
const SPHERES = ['lares', 'starlette', 'larets', 'westpac'];
const outDir = path.join(store, 'p3');
fs.mkdirSync(outDir, { recursive: true });
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

if (args.summary) {
  const rows = fs.readdirSync(outDir).filter((f) => /^rows\.s\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(outDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
  const per = {};
  for (const s of SPHERES) {
    const rs = rows.filter((r) => r.sphere === s);
    const ok = rs.filter((r) => r.fit?.ok);
    per[s] = { windows: rs.length, excluded: rs.filter((r) => r.excluded).length, fitted: ok.length, failed: rs.filter((r) => r.fit && !r.fit.ok).map((r) => ({ E: r.E, error: r.fit.error })),
      leads: Object.fromEntries(config.model.leads_h.map((L) => {
        const e = ok.map((r) => r.leads?.[L]).filter(Boolean);
        const T = e.map((x) => x.errM[1]), R = e.map((x) => x.errM[0]), N = e.map((x) => x.errM[2]), sp = e.map((x) => x.speedMs);
        return [L, { n: e.length, meanT_m: mean(T), medianT_m: median(T), meanR_m: mean(R), meanN_m: mean(N), rmsR_m: Math.sqrt(mean(R.map((x) => x * x)) ?? 0), rmsN_m: Math.sqrt(mean(N.map((x) => x * x)) ?? 0), meanT_ms: e.length ? mean(e.map((x) => (x.errM[1] / x.speedMs) * 1000)) : null, speedMs: mean(sp) }];
      })) };
  }
  const opened = new Opened();
  for (const f of fs.readdirSync(outDir)) opened.add(path.join(outDir, f), 'P3 rows and opened logs');
  const listed = fs.readdirSync(outDir).filter((f) => /^opened\.s\d+\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(outDir, f))));
  for (const p of listed) opened.add(p.path, p.label);
  const ref = { lares: 4.0, starlette: 4.8, larets: 5.0, stella: 5.65 };
  console.log(writeReceipt('precheck-P3-empirical', {
    plan: '3.8 P3 (empirical step); C2-A1 point 3; D6', question: 'does the type L along-track bias (+4.0 to +5.65 m) survive a fit to the NSGF orbit itself?',
    design: { spheres: SPHERES, cutoffs: 'every second day, 2025-10-03 to 2026-03-31 (R2 calibration period)', arcs: 'NSGF arcs with statedSigmaM <= 0.3 m only', fit: 'harness/ffm-fit-v3.mjs, one round, 10 m per axis, POSITION_VECTOR GCRF, 24 h at 10 min; state + DRAG_AREA_OVER_MASS (seed E6 b, a priori 30 %), AGOM fixed at E6; a priori 1e5 m, 10 m/s; tolerance 0.01, edit 5, at most 40 evaluations', forces: B2C.part1.starlink.ffm.forces, integrator: B2C.part1.starlink.ffm.integrator, leadToleranceSeconds: B2C.a5.ca.leadToleranceSeconds.laser, modules: { links: B2C.a12.modulesLinks, estimation: B2C.a12.estimation, ffm: B2C.a12.ffm } },
    normalPointBiasInSample_m: ref, perSphere: per,
  }, opened));
  process.exit(0);
}

const { fitV3, propagateV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
const { openV3, fitInput } = await import(b2('lib/a12.mjs'));
const { openPairs } = await import('./lib/pairs.mjs');
const v3 = await openV3();
const a = await openPairs(B2C.a12.modulesLinks);
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const opened = new Opened();
const out = path.join(outDir, `rows.s${k}.jsonl`);
const done = new Set(fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.sphere}|${r.E}`; }) : []);
const F = B2C.part1.starlink.ffm;
const settingsFor = (t) => {
  const diag = [1e5 ** 2, 1e5 ** 2, 1e5 ** 2, 100, 100, 100, (0.3 * E6[t].b) ** 2];
  return { sigmaM: 10, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: E6[t].b }], fixed: { agom: E6[t].agom }, apriori: Array.from({ length: 49 }, (_, i) => (Math.floor(i / 7) === i % 7 ? diag[i % 7] : 0)), maximumIterations: 40, correctionTolerance: 0.01, sigmaEditThreshold: 5, forces: F.forces, integrator: F.integrator };
};
const unit = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6, 0, 0, 0, 0, 0, 0, 1e-6];
const tasks = [];
for (const t of SPHERES) for (let E = Date.parse('2025-10-03T00:00:00Z'); E <= Date.parse('2026-03-31T00:00:00Z'); E += 2 * DAY) tasks.push([t, E]);
let count = 0;
const series = new Map();
for (let i = 0; i < tasks.length; i += 1) {
  const [t, E] = tasks[i];
  if (i % n !== k || done.has(`${t}|${iso(E)}`)) continue;
  if (args.limit && count >= Number(args.limit)) break;
  if (!series.has(t)) { series.clear(); series.set(t, truthSeries(E6[t].norad, `nsgf.orb.${t}.`, { maxSigmaM: 0.3, opened, from: Date.parse('2025-09-25'), to: Date.parse('2026-04-10') })); }
  const s = series.get(t);
  const w = windowAt(s, E, { leadToleranceSeconds: B2C.a5.ca.leadToleranceSeconds.laser });
  const row = { sphere: t, norad: E6[t].norad, E: iso(E) };
  if (w.excluded) row.excluded = w.excluded;
  else if (Math.abs(Date.parse(w.track[0].epoch) - (E - 24 * HOUR)) > 300e3) row.excluded = 'no state at the track start';
  else {
    const t0 = Date.now();
    const { points, reference } = fitInput(w.track);
    const ctx = v3.ctxFor(E - 24 * HOUR, E + 72 * HOUR);
    const settings = settingsFor(t);
    const f = await fitV3(ctx, points, reference, settings);
    row.fit = { ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, b: f.parameters?.[0]?.value ?? null, reducedChiSquare: f.reducedChiSquare ?? null, ffmCalls: f.ffmCalls, seconds: (Date.now() - t0) / 1000 };
    if (f.ok && w.leads.length) {
      const states = await propagateV3(ctx, { epoch: f.epoch, state: f.state, parameters: f.parameters }, w.leads.map((x) => x.line.epoch), settings);
      const stats = await a.stats(states.map((p, j) => ({ predicted: { position: p.state.slice(0, 3).map((q) => q / 1000), velocity: p.state.slice(3, 6).map((q) => q / 1000), covariance: unit, covarianceAxes: 'INERTIAL' }, truth: { position: w.leads[j].line.r, velocity: w.leads[j].line.v } })));
      row.leads = Object.fromEntries(w.leads.map((x, j) => [x.L, { epoch: x.line.epoch, errM: stats[j].errorRtn.map((q) => q * 1000), speedMs: Math.hypot(...x.line.v) * 1000, truthSigmaM: x.line.sigma }]));
    }
  }
  fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  count += 1;
  if (count % 10 === 0) console.error(`p3 shard ${k}/${n}: ${count}`);
}
fs.writeFileSync(path.join(outDir, `opened.s${k}.json`), JSON.stringify(opened.list()));
console.error(`p3 shard ${k}/${n}: ${count} windows`);
await v3.close();
await a.close();
process.exit(0);
