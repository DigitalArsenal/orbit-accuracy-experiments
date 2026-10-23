// Archive selection and bounded dispatch; all state/covariance computation is in worker WASM.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { setTimeout as sleep } from 'node:timers/promises';
import { Products } from '../e3-combined-catalog/truth.mjs';
import { observedFinals } from '../e3-combined-catalog/eop-finals.mjs';
import { readElementSets, readCreationDays, epochMs, dayList, shiftDay } from '../../harness/gp-archive.mjs';
import { loadModule, sha256 } from '../../harness/modules.mjs';
import { finalsRecords, eopFrame } from '../../harness/eop.mjs';
import { readGfzKp, spwRows, spaceWeatherFrame } from '../../harness/full-force.mjs';
import { bindings } from '../v1c-console-ffm-path/modules.mjs';
import { horizons } from './calibration.mjs';

export async function collect({ root, run, modules, phase, split, config, e3, v1, baseline, selection }) {
  const rawFile = path.join(run.dir, `${split}-${phase}.jsonl`);
  const arcs = fs.existsSync(rawFile) ? fs.readFileSync(rawFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const completed = new Set(arcs.map(a => a.key));
  const readInput = (kind, file) => { const bytes = fs.readFileSync(file); (run.inputs[kind] ??= {})[file] = sha256(bytes); return bytes; };
  const truth = new Products(e3.inputs.reference, e3.truthPrefixes);
  const gpsTruth = new Products(e3.inputs.reference, [e3.regimes.GPS.truthPrefix]);
  const indexes = [...truth.products, ...gpsTruth.products].map(p => ({ product: p.product, sha256: p.indexSha256 }));
  if (baseline) assert.deepEqual(indexes, baseline.manifest.e3ProductIndexes, 'frozen truth product index changed');
  for (const p of indexes) readInput('referenceIndex', path.join(e3.inputs.reference, p.product, 'index.json'));
  const regime = new Map();
  for (const [name, spec] of Object.entries(e3.regimes)) if (spec.objects) for (const n of Object.keys(spec.objects)) regime.set(+n, name);
  for (const n of truth.objects()) if (!regime.has(n) && truth.entries(n).some(e => e.product.startsWith(e3.regimes.GPS.truthPrefix) && e.comment.includes(`SP3 satellite ${e3.regimes.GPS.sp3System}`))) regime.set(n, 'GPS');
  const ref = n => regime.get(n) === 'GPS' ? gpsTruth : truth;
  const objects = [...regime.keys()].filter(n => ref(n).entries(n).length).sort((a, b) => a - b);
  const days = dayList(...(split === 'train' ? config.train : e3.windows.test));
  const keep = n => objects.includes(n);
  const { sets, files } = readElementSets(e3.inputs.gpHistory, shiftDay(days[0], -10), days.at(-1), { keep, lagDays: e3.elementSets.creationLagDays,
    theory: e3.elementSets.meanElementTheory, ephemerisType: e3.elementSets.ephemerisType, duplicateEpochSeconds: e3.elementSets.duplicateEpochSeconds });
  for (const [f, hash] of Object.entries(files)) {
    if (baseline) assert.equal(hash, baseline.manifest.inputs.gpHistory[f], `frozen OMM input changed: ${f}`);
    (run.inputs.gpHistory ??= {})[path.join(e3.inputs.gpHistory, f)] = hash;
  }
  const history = readCreationDays(e3.inputs.gpHistory, shiftDay(days[0], -45), days.at(-1), { keep, theory: e3.elementSets.meanElementTheory, ephemerisType: e3.elementSets.ephemerisType });
  for (const [f, hash] of Object.entries(history.files)) {
    if (baseline) assert.equal(hash, baseline.manifest.inputs.history[f], `frozen history changed: ${f}`);
    (run.inputs.history ??= {})[path.join(e3.inputs.gpHistory, f)] = hash;
  }
  let environment;
  if (phase === 'ffm') {
    const b = await bindings(modules), parser = await loadModule(modules, 'data-source/eop-parser');
    run.modules[parser.provenance.path] = parser.provenance;
    const finals = await finalsRecords(parser, observedFinals(readInput('eop', e3.inputs.eopFinals).toString('latin1'))); await parser.destroy();
    const kernelFile = path.join(modules, v1.inputs.kernel);
    const kernel = { portId: 'kernel', typeRef: b.catalog.TYPE, payload: b.catalog.kernelRecord(readInput('kernel', kernelFile)) };
    const gfzFile = '/opt/data/sdn-archive/hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt';
    const forecastFile = '/opt/data/sdn-archive/hac/noaa-swpc/services-20261009/45-day-forecast.txt';
    readInput('weather', gfzFile); const gfz = readGfzKp(gfzFile);
    const forecast = readInput('weather', forecastFile).toString().split('45-DAY F10.7 CM FLUX FORECAST')[1];
    assert(forecast);
    for (const match of forecast.matchAll(/(\d{2})([A-Za-z]{3})(\d{2})\s+(\d{3})/g)) {
      const date = new Date(`${match[1]} ${match[2]} 20${match[3]} 00:00:00 UTC`).toISOString().slice(0, 10);
      if (!(gfz.days.get(date)?.f107obs > 0)) gfz.days.set(date, { ...(gfz.days.get(date) ?? {}), f107obs: +match[4], f107adj: +match[4] });
    }
    environment = (first, last) => [kernel, eopFrame(finals.records, Math.floor(first / 86400000) + 40586, Math.floor(last / 86400000) + 40589),
      spaceWeatherFrame(spwRows(gfz, first - 86400000, last + 2 * 86400000))];
  }
  const pairs = baseline ? baseline.arcs.map(a => ({ ...a, day: a.key.split(':').at(-1) }))
    : objects.flatMap(n => days.map(day => ({ key: `E3:${n}:${day}`, norad: n, group: regime.get(n), day })));
  const save = arc => { arcs.push(arc); fs.appendFileSync(rawFile, JSON.stringify(arc) + '\n'); run.checkpoint();
    console.log(`${split}-${phase}: ${arcs.length}/${pairs.length} ${arc.key}${arc.skipped ? ` skipped: ${arc.skipped}` : ''}`); };
  function job(prior) {
    const n = prior.norad, ms = Date.parse(`${prior.day}T${e3.issueTimeUtc}Z`) + e3.issueOffsetSeconds * 1000;
    if (prior.skipped) return { key: prior.key, norad: n, group: prior.group, ms, skipped: prior.skipped, missingHorizons: prior.missingHorizons };
    const set = sets.filter(s => s.norad === n && epochMs(s.creationDate) <= ms && epochMs(s.epoch) <= ms)
      .sort((a, b) => epochMs(b.epoch) - epochMs(a.epoch) || epochMs(b.creationDate) - epochMs(a.creationDate))[0];
    const targets = horizons.map(hours => {
      const requested = ms + hours * 3600000;
      if (split === 'train') assert(requested + e3.targetToleranceSeconds * 1000 < Date.parse(config.trainingTargetBefore));
      const t = ref(n).firstAtOrAfter(n, requested, e3.targetToleranceSeconds * 1000);
      return t ? { hours, ms: t.ms, state: [...t.r, ...t.v].map(x => x * 1000) } : null;
    }).filter(Boolean);
    for (const [f, hash] of Object.entries({ ...truth.read, ...gpsTruth.read })) {
      if (baseline) assert.equal(hash, baseline.manifest.inputs.e3Reference[f], `frozen truth changed: ${f}`);
      (run.inputs.reference ??= {})[path.join(e3.inputs.reference, f)] = hash;
    }
    truth.dropCache(); gpsTruth.dropCache();
    const missingHorizons = horizons.filter(h => !targets.some(t => t.hours === h));
    if (baseline) { assert(set); assert.deepEqual(targets.map(t => t.hours), prior.samples.map(s => s.hours)); assert.deepEqual(missingHorizons, prior.missingHorizons); }
    if (!set || !targets.length) return { key: prior.key, norad: n, group: prior.group, ms, missingHorizons, skipped: !set ? 'no causal OMM' : 'no truth targets' };
    const anchorMs = epochMs(set.epoch);
    const causal = history.sets.filter(s => s.norad === n && epochMs(s.creationDate) <= ms && epochMs(s.epoch) >= anchorMs - 31 * 86400000 && epochMs(s.epoch) <= anchorMs + 1000);
    return { key: prior.key, group: prior.group, n, ms, set, targets, missingHorizons, elements: [...causal.filter(s => s.gpId !== set.gpId), set],
      ...(environment ? { env: environment(ms, targets.at(-1).ms) } : {}),
      ...(baseline && phase === 'ffm' ? { frozenPositions: baseline.coverage.find(a => a.key === prior.key).methods['Console FFM-1'].samples } : {}) };
  }
  let next = 0;
  const pool = [];
  function makeWorker() {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { modules, phase, config, selection } });
    let resolve, reject;
    const ready = new Promise((a, b) => { resolve = a; reject = b; });
    worker.on('error', e => reject(e));
    worker.on('message', m => {
      if (m.error) return reject(new Error(m.error));
      if (m.ready) { for (const p of m.provenance) run.modules[p.path] = p; resolve(); }
      else resolve(m.result);
    });
    return { ready, worker, request: j => new Promise((a, b) => { resolve = a; reject = b; worker.postMessage(j); }) };
  }
  try {
    for (let i = 0; i < config.workers; i++) { const w = makeWorker(); pool.push(w); await w.ready; }
    async function lane(w, laneIndex) {
      // The registration permits at most four workers. Reserve another unit
      // of load per additional lane so one lane can progress on a busy host.
      const dispatchBelow = config.dispatchLoadBelow - laneIndex;
      while (next < pairs.length) {
        while (next < pairs.length && os.loadavg()[0] >= dispatchBelow) { console.log(`Load ${os.loadavg()[0]}: lane ${laneIndex} waiting below ${dispatchBelow}`); await sleep(15000); }
        assert(fs.statfsSync(root).bavail * fs.statfsSync(root).bsize >= 20 * 1024 ** 3, 'disk guard');
        run.peakDispatchLoad = Math.max(run.peakDispatchLoad ?? 0, os.loadavg()[0]);
        if (next >= pairs.length) break;
        const prior = pairs[next++]; if (completed.has(prior.key)) continue;
        const j = job(prior); save(j.skipped ? j : await w.request(j));
      }
    }
    await Promise.all(pool.map(lane));
  } finally { await Promise.all(pool.map(w => w.worker.terminate())); }
  assert.equal(arcs.length, pairs.length);
  const order = new Map(pairs.map((p, i) => [p.key, i])); arcs.sort((a, b) => order.get(a.key) - order.get(b.key));
  fs.writeFileSync(rawFile, arcs.map(a => JSON.stringify(a)).join('\n') + '\n');
  run.files[path.basename(rawFile)] = sha256(fs.readFileSync(rawFile));
  run.checkpoint(); return arcs;
}
