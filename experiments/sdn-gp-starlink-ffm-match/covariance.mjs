// Covariance realism, scored against the FFM truth of the Starlinks of the same-day capture.
//   COMSPOC SynCoPate (local scoring only): their TEME trajectory with 6x6 covariance (180 s grid, 12 days) sampled every
//     30 min where the FFM truth exists; the truth (FFM-1 at exactly those epochs, a module call) is taken to TEME by
//     foundation/frames; d^2 = e' P^-1 e on position comes from gp-error-model `pair_statistics`. Never fitted to, never an
//     input; only aggregates are written (age in days since their ScenarioEpoch).
//   Ours: SGP4 fitted to the first 24 h of the same truth (fit_elements), propagated by the module, with the E14 S3-KC
//     population covariance of gp-error-model `object_covariance` at the set's age; d^2 from `pair_statistics`.
// Output: <store>/rows/covariance.jsonl, one line per object, source and age day: n, sum d2, within the 95 % ellipsoid.
//   node experiments/sdn-gp-starlink-ffm-match/covariance.mjs [--limit N]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store } from './common.mjs';
import { modulesRoot, openModule } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { loadEnvironment, propagate } from './lib/ffm.mjs';
import { transformState } from './lib/frames.mjs';
import { frame, oemBytes, ommFrame, readOem, blockLines, readOmm } from './lib/sds.mjs';
import { DAY, iso, ms, quantile } from './lib/windows.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const CHI2_95_3DOF = 7.814727903251179; // the rule of V1c2: 95 % ellipsoid of three degrees of freedom
const SYN = path.join(config.archive, 'hac/comspoc-spacebook/2026/2026-10-23/syncopate');
const STRIDE = 10; // one sample in ten of the 180 s grid: 30 min

function parseDotE(text) {
  const scenario = /ScenarioEpoch\s+(.+)/.exec(text)[1].trim();
  const scenarioMs = Date.parse(`${scenario} UTC`);
  const eph = [], cov = [];
  let mode = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('EphemerisTimePosVel')) { mode = 'e'; continue; }
    if (line.startsWith('CovarianceTimePosVel')) { mode = 'c'; continue; }
    if (!line || line.startsWith('#') || line.startsWith('End')) continue;
    const f = line.split(/\s+/);
    if (mode === 'e' && f.length === 7) eph.push(f.map(Number));
    if (mode === 'c' && f.length === 22) cov.push(f.map(Number));
  }
  return { scenarioMs, eph, cov };
}
const full = (a) => { const m = Array(36).fill(0); for (let i = 0, k = 0; i < 6; i += 1) for (let j = 0; j <= i; j += 1, k += 1) m[6 * i + j] = m[6 * j + i] = a[k]; return m; };
const summarize = (stats, ageDays) => { // stats: pair_statistics pairs; ageDays: per pair
  const byDay = new Map();
  stats.forEach((s, i) => { const k = Math.floor(ageDays[i]); (byDay.get(k) ?? byDay.set(k, []).get(k)).push(s); });
  return [...byDay.entries()].map(([ageDay, list]) => ({ ageDay, n: list.length, sumD2: list.reduce((s, p) => s + p.d2Predicted, 0), within95: list.filter((p) => p.d2Predicted <= CHI2_95_3DOF).length, errorKmMedian: quantile(list.map((p) => Math.hypot(...p.errorRtn)), 0.5) }));
};

frozen();
const modules = modulesRoot();
const ctx = await loadEnvironment(modules, { archive: config.archive, store });
const b = await openBaselines(modules);
const frames = await openModule(modules, 'foundation/frames');
const gem = b.gem;
const metaDir = path.join(store, 'truth');
const ids = fs.readdirSync(metaDir).filter((n) => /^\d+\.json$/.test(n)).map((n) => Number(n.replace('.json', ''))).filter((n) => fs.existsSync(path.join(SYN, `${n}.e.gz`))).sort((a, c) => a - c);
const outRows = [];
let done = 0;
for (const norad of ids.slice(0, args.limit ? Number(args.limit) : undefined)) {
  const meta = JSON.parse(fs.readFileSync(path.join(metaDir, `${norad}.json`)));
  const t0 = ms(meta.truth.epochUtc), t1 = t0 + meta.truth.hours * 3600e3;
  const syn = parseDotE(zlib.gunzipSync(fs.readFileSync(path.join(SYN, `${norad}.e.gz`))).toString('utf8'));
  const idx = syn.eph.map((_, i) => i).filter((i) => i % STRIDE === 0 && syn.scenarioMs + syn.eph[i][0] * 1000 > t0 && syn.scenarioMs + syn.eph[i][0] * 1000 <= t1 && syn.cov[i]);
  if (idx.length < 20) continue;
  const epochs = idx.map((i) => syn.scenarioMs + syn.eph[i][0] * 1000);
  const truth = await propagate(modules, ctx, { epoch: meta.truth.epochUtc, state: meta.truth.stateGcrfKm.map((x) => x * 1000), cdAm: meta.fit.bEffM2Kg, crAm: meta.fit.crAm, epochs, integrator: config.truth.integrator });
  // 1. SynCoPate against the truth, both in TEME (km)
  const pairs = [];
  for (let n = 0; n < idx.length; n += 1) {
    const i = idx[n];
    const truthTeme = await transformState(frames, 'GCRF', 'TEME', iso(epochs[n]), truth.samples[n].state.map((x) => x / 1000));
    pairs.push({ id: String(n), predicted: { position: syn.eph[i].slice(1, 4), velocity: syn.eph[i].slice(4, 7), covariance: full(syn.cov[i].slice(1)), covarianceAxes: 'INERTIAL' }, truth: { position: truthTeme.slice(0, 3), velocity: truthTeme.slice(3, 6) } });
  }
  const synStats = b.erm.decode((await gem.call('pair_statistics', [b.erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs })])).statistics).pairs;
  for (const r of summarize(synStats, epochs.map((t) => (t - syn.scenarioMs) / DAY))) outRows.push({ norad, source: 'comspoc-syncopate', ...r });
  // 2. ours: SGP4 fitted to the first 24 h of the truth, S3-KC covariance at the set's age
  const flat = new Float64Array(fs.readFileSync(path.join(metaDir, `${norad}.f64`)).buffer.slice(0));
  const n24 = (config.windows.fitHours * 3600) / config.truth.cadenceSeconds;
  const lines = Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: new Date(t0 + i * config.truth.cadenceSeconds * 1000).toISOString(), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] }));
  const ephemeris = frame('ephemeris', 'OEM', oemBytes({ block: { frame: 'GCRF', object: { name: `STARLINK-${norad}`, norad }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch } }));
  const fit = await gem.call('fit_elements', [ephemeris, b.erm.frame('options', 'fitOptions', { from: iso(t0), to: iso(t0 + n24 * config.truth.cadenceSeconds * 1000), epoch: 'first', fitBstar: true, closure: false })]);
  const report = b.erm.decode(fit.report).fits?.[0];
  if (!report?.converged) continue;
  const ageStart = t0 + config.windows.fitHours * 3600e3;
  const held = lines.filter((l, i) => i % 30 === 0 && ms(l.epoch) > ageStart);
  const grid = oemBytes({ block: { frame: 'GCRF', object: { name: 'g', norad }, lines: held.map((l) => ({ epoch: l.epoch, r: [0, 0, 0], v: [0, 0, 0] })), start: held[0].epoch, stop: held.at(-1).epoch } });
  const prop = await b.xp.call('propagate', [ommFrame('omm', fit.elements), frame('grid', 'OEM', grid)]);
  const predicted = blockLines(readOem(prop.ephemeris).EPHEMERIS_DATA_BLOCK[0]);
  const request = b.erm.frame('request', 'objects', { objects: held.map((l, n) => ({ id: String(n), set: { norad, epoch: report.epoch }, ageDays: (ms(l.epoch) - ms(report.epoch + 'Z')) / DAY })) });
  const cov = b.erm.decode((await gem.call('object_covariance', [{ portId: 'elements', payload: fit.elements, typeRef: { schemaName: 'OMM.fbs', fileIdentifier: '$OMM', rootTypeName: 'OMM', wireFormat: 'flatbuffer' }, }, request])).covariance);
  const ok = cov.objects.filter((o) => o.covarianceInertial);
  if (!ok.length) { outRows.push({ norad, source: 's3kc-sgp4', refused: cov.objects[0]?.status ?? 'no covariance' }); continue; }
  const pairs2 = ok.map((o) => { const n = Number(o.id); return { id: o.id, predicted: { position: predicted[n].r.map((x) => x * 1000), velocity: predicted[n].v.map((x) => x * 1000), covariance: o.covarianceInertial, covarianceAxes: 'INERTIAL' }, truth: { position: held[n].r.map((x) => x * 1000), velocity: held[n].v.map((x) => x * 1000) } }; });
  const ourStats = b.erm.decode((await gem.call('pair_statistics', [b.erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs: pairs2 })])).statistics).pairs;
  for (const r of summarize(ourStats, ok.map((o) => (ms(held[Number(o.id)].epoch) - ms(report.epoch + 'Z')) / DAY))) outRows.push({ norad, source: 's3kc-sgp4', ...r, errorKmMedian: r.errorKmMedian / 1000 });
  done += 1;
  console.error(`covariance ${norad} done (${done})`);
}
fs.writeFileSync(path.join(store, 'rows/covariance.jsonl'), outRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
await b.close();
console.log(`${done} objects, ${outRows.length} rows`);
process.exit(0);
