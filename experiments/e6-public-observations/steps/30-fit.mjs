// SatNOGS arm: anchored fits and scores (PLAN.md §4.3-4.4) for one window.
// Scoring epochs E are ISS truth epochs every config.scoring.everyHours; for
// each horizon tau the cutoff is T = E - tau. At each T (anchored.mjs): the
// latest published set propagated by SGP4 (baseline B), and the variants of
// config.satnogs.variants fitted to the element-set history and the SatNOGS
// segments of [T - arcDays, T], propagated by HPOP with their covariance.
// Per-sample rows and the products (which derive from Space-Track sets)
// stay in runs/; results come from step 90.
//   node experiments/e6-public-observations/steps/30-fit.mjs --window dev [--shard 0/4] [--resume <run>] [--variants P,F2] [--cutoffs <json list>]
import fs from 'node:fs';
import path from 'node:path';
import { cli, config, guard, home, windowOf, DAY_MS, HOUR_MS } from '../common.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { readSets } from '../../e4-operator-ephemeris-parity/products.mjs';
import { IssTruth, issCaptures } from '../truth.mjs';
import { anchoredAt, anchoredContext } from '../anchored.mjs';

const { values, modules, nodes, archive } = cli({ window: { type: 'string' }, shard: { type: 'string' }, resume: { type: 'string' }, variants: { type: 'string' }, limit: { type: 'string' }, cutoffs: { type: 'string' } });
const windowName = values.window ?? 'dev';
const [shard, shards] = (values.shard ?? '0/1').split('/').map(Number);
const modulesDir = modules();
const run = startRun({ experiment: 'e6', step: `30-fit-${windowName}-${shard}of${shards}`, configPath: path.join(repoRoot, 'experiments/e6-public-observations/config.json'), modulesDir, args: values, resume: values.resume });
const env = await anchoredContext(run, modulesDir, repoRoot);
const captures = issCaptures({ nodes, archive: home(config.inputs.issOemArchive) });
run.addInputs('truth', Object.fromEntries(captures.map((c) => [`${c.url}@${c.captured}`, c.sha256])));
const truth = new IssTruth(env.m['foundation/frames'], captures);
const A = config.satnogs;
const iso = (ms) => new Date(ms).toISOString();

// Scoring epochs (every everyHours within each flown span) and cutoffs.
const tasks = new Map();  // T -> [{E, tau}]
for (const span of truth.spans) {
  const epochs = truth.epochs(span.from, span.to);
  for (const E of epochs) {
    if (windowOf(E) !== windowName || (E - epochs[0]) % (config.scoring.everyHours * HOUR_MS) >= 240000) continue;
    for (const tau of config.scoring.horizonsDays) {
      const T = E - tau * DAY_MS;
      if (windowOf(T) !== windowName || windowOf(T - A.fit.arcDays * DAY_MS) !== windowName) continue;
      if (!tasks.has(T)) tasks.set(T, []);
      if (!tasks.get(T).some((x) => x.E === E)) tasks.get(T).push({ E, tau });
    }
  }
}
// --cutoffs <file>: a JSON list of ISO cutoffs of this shard to run (part of
// a shard's remaining work given to another process).
const only = values.cutoffs ? new Set(JSON.parse(fs.readFileSync(values.cutoffs, 'utf8')).map((t) => Date.parse(t))) : null;
const cutoffs = [...tasks.keys()].sort((a, b) => a - b).filter((_, i) => i % shards === shard).filter((t) => !only || only.has(t)).slice(0, values.limit ? Number(values.limit) : undefined);
console.log(`${windowName}: ${tasks.size} cutoffs, shard ${shard}/${shards}: ${cutoffs.length}`);
if (!cutoffs.length) { run.finish({ cutoffs: 0 }); process.exit(0); }

const lo = Math.min(...cutoffs) - (A.fit.arcDays + 3) * DAY_MS, hi = Math.max(...cutoffs);
const sets = readSets(archive, iso(lo).slice(0, 10), iso(hi + DAY_MS).slice(0, 10), new Set([A.norad]), run).get(A.norad) ?? [];

// SatNOGS segments (step 10): range rates corrected to the calibrated common lag.
const C = 299792458;
const segments = [];
for (const f of fs.readdirSync(path.join(repoRoot, 'runs/cache/e6/passes')).sort()) {
  const p = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs/cache/e6/passes', f)));
  if (!p.measurements) continue;
  for (const s of new Set(p.measurements.map((x) => x.segment ?? 0))) {
    const pts = p.measurements.filter((x) => (x.segment ?? 0) === s);
    if (pts.length < config.extraction.minPoints) continue;
    const times = pts.map((x) => Date.parse(x.time) / 1000), tm = times.reduce((a, b) => a + b, 0) / times.length;
    segments.push({
      key: `${p.id}:${s}`, station: p.station, start: Math.min(...times) * 1000, end: Math.max(...times) * 1000,
      bias0: -median(pts.map((x) => x.dfHz)) * C / p.f0,
      points: pts.map((x, k) => ({
        time: x.time, rr: x.rangeRate + ((p.lagSeconds ?? 0) - A.calibration.lagSeconds) * x.rrSetRate, rate: x.rrSetRate, dt: times[k] - tm,
        sigmaRaw: x.sigma, station: x.station, stationVelocity: x.stationVelocity,
      })),
    });
  }
}
// A variant's segments: range rates with the variant's noise scale and the
// segment nuisance model (bias free; drift and lag with their dev priors).
const arm = {
  name: 'satnogs', norad: A.norad, regime: A.prior.regime, settings: { ...A.fit.settings, flags: { RANGE_RATE: A.fit.rangeRateFlags } }, fit: A.fit,
  variants: A.variants.filter((v) => !values.variants || values.variants.split(',').includes(v.name)),
  segmentsFor: (v, chosen) => chosen.map((sg) => ({
    key: sg.key, station: sg.station, kind: 'RANGE_RATE',
    nuisance: {
      basis: (pt) => [1, pt.dt, pt.rate],
      priors: [{ mean: 0, sigma: null }, { mean: 0, sigma: v.drift ? A.calibration.segmentDriftSigmaMps2 : 0 }, { mean: 0, sigma: v.segmentLag ? A.calibration.segmentLagSigmaSeconds : 0 }],
      start: [sg.bias0, 0, 0],
    },
    points: sg.points.map((pt) => ({ ...pt, values: [pt.rr], sigmas: [pt.sigmaRaw * A.calibration[v.sigmaScale]] })),
  })),
};

const samplesFile = path.join(run.dir, 'samples.jsonl'), productsFile = path.join(run.dir, 'products.jsonl');
const done = new Set(fs.existsSync(samplesFile) ? fs.readFileSync(samplesFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).T) : []);
for (const T of cutoffs) {
  if (done.has(iso(T))) continue;
  guard(T, 'step 30'); guard(T - A.fit.arcDays * DAY_MS, 'step 30');
  const scoring = tasks.get(T).sort((a, b) => a.E - b.E);
  for (const s of scoring) guard(s.E, 'step 30');
  const truthStates = [];
  for (const s of scoring) truthStates.push({ epoch: iso(s.E), state: await truth.gcrf(s.E) });
  const row = await anchoredAt(env, arm, T, scoring, truthStates, sets, segments, productsFile);
  fs.appendFileSync(samplesFile, `${JSON.stringify(row)}\n`);
  run.checkpoint();
  const km = (e) => (Math.hypot(...e) / 1000).toFixed(2);
  console.log(iso(T), 'segments', row.segmentsInArc, 'sets', row.historySets, (row.scoring ?? []).map((s, k) => `tau ${s.tau}: B ${s.sgp4 ? km(s.sgp4) : '-'} ${Object.entries(row.variants ?? {}).map(([n, x]) => `${n} ${x.scoring ? km(x.scoring[k].error) : (x.skipped ?? x.failed ?? '').slice(0, 30)}`).join(' ')}`).join(' | '), row.skipped ?? '');
}
run.finish({ cutoffs: cutoffs.length });
