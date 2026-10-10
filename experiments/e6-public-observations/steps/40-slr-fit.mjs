// Laser-ranging arm: anchored fits and scores (PLAN.md §4.5) for one window.
// Per target: cutoffs T every config.slr.cutoffEveryHours, scored at T + tau
// against the truth (NSGF rapid orbits, converted by analysis/reference-states).
// At each T (anchored.mjs): the latest published set propagated by SGP4 (B),
// and the variants of config.slr.variants fitted to the element-set history
// and the ILRS normal points of [T - arcDays, T]. Ranges are one-way at the
// bounce instant; fit_batch does not apply a troposphere model (PLAN.md §7):
// the delay stays in the ranges and in their dev-calibrated sigma.
//   node experiments/e6-public-observations/steps/40-slr-fit.mjs --window dev [--shard 0/4] [--target starlette]
import fs from 'node:fs';
import path from 'node:path';
import { cli, config, guard, windowOf, DAY_MS, HOUR_MS } from '../common.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { decodeOemStream } from '../../../harness/records.mjs';
import { readSets } from '../../e4-operator-ephemeris-parity/products.mjs';
import { anchoredAt, anchoredContext } from '../anchored.mjs';

const { values, modules, archive } = cli({ window: { type: 'string' }, shard: { type: 'string' }, resume: { type: 'string' }, variants: { type: 'string' }, target: { type: 'string' }, limit: { type: 'string' } });
const windowName = values.window ?? 'dev';
const [shard, shards] = (values.shard ?? '0/1').split('/').map(Number);
const modulesDir = modules();
const run = startRun({ experiment: 'e6', step: `40-slr-fit-${windowName}-${shard}of${shards}`, configPath: path.join(repoRoot, 'experiments/e6-public-observations/config.json'), modulesDir, args: values, resume: values.resume });
const env = await anchoredContext(run, modulesDir, repoRoot);
const S = config.slr;
const iso = (ms) => new Date(ms).toISOString();

// Truth: every NSGF product of the target, GCRF states by epoch (ms).
function truthOf(prefix, norad) {
  const states = new Map(), spans = [];
  for (const p of fs.readdirSync(config.inputs.reference).filter((n) => n.startsWith(`${prefix}.`)).sort()) {
    const index = JSON.parse(fs.readFileSync(path.join(config.inputs.reference, p, 'index.json')));
    const o = index.objects.find((x) => x.norad === norad);
    if (!o) continue;
    const bytes = fs.readFileSync(path.join(config.inputs.reference, p, o.file));
    const block = decodeOemStream(new Uint8Array(bytes))[0].EPHEMERIS_DATA_BLOCK[0];
    if (block.REFERENCE_FRAME?.NAME !== 'GCRF') throw new Error(`${p}: not GCRF`);
    const lines = block.EPHEMERIS_DATA_LINES;
    spans.push({ product: p, from: Date.parse(lines[0].EPOCH), to: Date.parse(lines.at(-1).EPOCH), sha256: sha256(bytes) });
    for (const l of lines) { const t = Date.parse(l.EPOCH); if (!states.has(t)) states.set(t, [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT].map((v) => v * 1000)); }
  }
  return { states, spans };
}

const samplesFile = path.join(run.dir, 'samples.jsonl'), productsFile = path.join(run.dir, 'products.jsonl');
const done = new Set(fs.existsSync(samplesFile) ? fs.readFileSync(samplesFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.norad}|${r.T}`; }) : []);
for (const [name, target] of Object.entries(S.targets)) {
  if (values.target && values.target !== name) continue;
  const truth = truthOf(target.truth, target.norad);
  run.addInputs('truth', Object.fromEntries(truth.spans.filter((s) => windowOf(s.from, 'slr') === windowName || windowOf(s.to, 'slr') === windowName).map((s) => [s.product, s.sha256])));
  // Cutoffs every cutoffEveryHours (truth is continuous here); each is scored
  // at every horizon whose epoch has truth in the same window.
  const tasks = new Map();
  for (const [from, to] of config.windows.slr[windowName]) {
    for (let T = Date.parse(from) + S.fit.arcDays * DAY_MS; T < Date.parse(to); T += S.cutoffEveryHours * HOUR_MS) {
      const scoring = config.scoring.horizonsDays.map((tau) => ({ E: T + tau * DAY_MS, tau })).filter((x) => windowOf(x.E, 'slr') === windowName && truth.states.has(x.E));
      if (scoring.length) tasks.set(T, scoring);
    }
  }
  const cutoffs = [...tasks.keys()].sort((a, b) => a - b).filter((_, i) => i % shards === shard).slice(0, values.limit ? Number(values.limit) : undefined);
  console.log(`${name} ${windowName}: ${tasks.size} cutoffs, shard ${shard}/${shards}: ${cutoffs.length}`);
  if (!cutoffs.length) continue;
  const lo = Math.min(...cutoffs) - (S.fit.arcDays + 3) * DAY_MS, hi = Math.max(...cutoffs);
  const sets = readSets(archive, iso(lo).slice(0, 10), iso(hi + DAY_MS).slice(0, 10), new Set([target.norad]), run).get(target.norad) ?? [];
  const passFile = path.join(repoRoot, `runs/cache/e6/slr/${name}-${windowName}.json`);
  const passes = JSON.parse(fs.readFileSync(passFile));
  run.addInputs('passes', { [path.basename(passFile)]: sha256(fs.readFileSync(passFile)) });
  const segments = passes.map((p) => ({
    key: p.key, station: p.station, start: Date.parse(p.points[0].time), end: Date.parse(p.points.at(-1).time),
    points: p.points.filter((x) => x.elevationDeg !== null && x.elevationDeg > S.minimumElevationDeg),
  })).filter((s) => s.points.length >= S.minimumPointsPerPass);
  const B = target.b;
  const arm = {
    name: 'slr', norad: target.norad, regime: target.regime, fit: S.fit,
    settings: {
      ...S.fit.settings, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: B }], fixed: { agom: target.agom }, flags: { LASER_RANGE: S.fit.flags },
      apriori: Array.from({ length: 49 }, (_, k) => { const i = Math.floor(k / 7), j = k % 7; return i !== j ? 0 : i < 3 ? 1e10 : i < 6 ? 1e2 : (S.fit.settings.bPriorFraction * B) ** 2; }),
    },
    variants: S.variants.filter((v) => !values.variants || values.variants.split(',').includes(v.name)),
    segmentsFor: (v, chosen) => chosen.map((sg) => ({
      key: sg.key, station: sg.station, kind: 'LASER_RANGE', nuisance: null,
      points: sg.points.map((pt) => ({ time: pt.time, values: [pt.rangeM], sigmas: [S.calibration.rangeSigmaM], station: pt.station, media: pt.media, elevationDeg: pt.elevationDeg })),
    })),
  };
  for (const T of cutoffs) {
    if (done.has(`${target.norad}|${iso(T)}`)) continue;
    guard(T, 'step 40', 'slr'); guard(T - S.fit.arcDays * DAY_MS, 'step 40', 'slr');
    const scoring = tasks.get(T).sort((a, b) => a.E - b.E);
    for (const s of scoring) guard(s.E, 'step 40', 'slr');
    const truthStates = scoring.map((s) => ({ epoch: iso(s.E), state: truth.states.get(s.E) }));
    const row = await anchoredAt(env, arm, T, scoring, truthStates, sets, segments, productsFile);
    row.target = name;
    fs.appendFileSync(samplesFile, `${JSON.stringify(row)}\n`);
    run.checkpoint();
    const km = (e) => (Math.hypot(...e) / 1000).toFixed(3);
    console.log(name, iso(T), 'passes', row.segmentsInArc, 'sets', row.historySets, (row.scoring ?? []).map((s, k) => `tau ${s.tau}: B ${s.sgp4 ? km(s.sgp4) : '-'} ${Object.entries(row.variants ?? {}).map(([n, x]) => `${n} ${x.scoring ? km(x.scoring[k].error) : (x.skipped ?? x.failed ?? '').slice(0, 30)}`).join(' ')}`).join(' | '), row.skipped ?? '');
  }
}
run.finish({});
