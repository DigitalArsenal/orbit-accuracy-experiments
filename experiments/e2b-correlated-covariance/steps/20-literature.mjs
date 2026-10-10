#!/usr/bin/env node
// E2b step 20: the literature baselines C1a, C1b and C3a/C3b (PLAN.md
// section 5) for every anchor of a step-10 run, at that run's target epochs.
// Orbit computation in analysis/gp-error-model: common_epoch (residuals at a
// common epoch) and map_covariance (SGP4 and Lambert state transition
// matrices); the sample covariances here are statistics.
//   C1a  sets created by the anchor's creation with epochs in the 14 days up to
//        its epoch (at least 7) at the anchor's epoch, residuals about their mean
//        in its RTN axes (n - 1); SGP4 STM to each target.
//   C1b  the same covariance rotated with the anchor's state and mapped back to
//        the oldest set's epoch along that set's Lambert arc, then from the
//        anchor's epoch to each target along the anchor's Lambert arc.
//   C3a  sets created by the anchor's creation with epochs in the W days up to
//        its epoch (at least 4) at the window's midpoint, all unordered pairs'
//        differences in the mean state's axes, f = 1/(2M); taken at the anchor's
//        epoch in its axes, SGP4 STM to each target. C3b = C3a / 2 (f = 1/(4M)).
// Rows: runs/<id>/literature.jsonl.gz {regime, norad, anchor, n1, n3, targets:
// [{tau, epoch, C1a, C1b, C3a}]} with 3x3 position blocks as lower triangles
// (RR, TR, TT, NR, NT, NN; km^2) and per-method errors.
//
//   node experiments/e2b-correlated-covariance/steps/20-literature.mjs --window validation --regime GPS --errors <step-10 run id>
import path from 'node:path';
import { json } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { cli, config, configPath, regimeObjects, windowSets, isoMs, loadGp, jsonlWriter, readRuns, DAY_MS } from '../common.mjs';

const { values, regimes, window, modules, archive, reference: referenceDir, objects: only } = cli({ errors: { type: 'string' } });
if (!values.errors) throw new Error('--errors <step-10 run ids, comma separated> is required');
const run = startRun({ experiment: config.experiment, step: `20-literature-${window.name}-${regimes.join('+')}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await loadGp(modules, run);
const out = jsonlWriter(path.join(run.dir, 'literature.jsonl.gz'));
const P = config.products, CHUNK = config.measurement.chunkDays;

// Lower triangle (21) of the n x 6 rows' covariance about their mean (n - 1).
function covariance(rows) {
  const n = rows.length, mean = [0, 1, 2, 3, 4, 5].map((k) => rows.reduce((a, r) => a + r[k], 0) / n);
  const out = [];
  for (let a = 0; a < 6; ++a) for (let b = 0; b <= a; ++b) out.push(rows.reduce((s, r) => s + (r[a] - mean[a]) * (r[b] - mean[b]), 0) / (n - 1));
  return out;
}
// f * sum over unordered pairs of d d' (lower triangle, 21), f = factor / M.
function pairwise(rows, factor) {
  const out = Array(21).fill(0);
  let m = 0;
  for (let i = 0; i < rows.length; ++i) for (let j = i + 1; j < rows.length; ++j) {
    const d = rows[i].map((x, k) => x - rows[j][k]);
    for (let a = 0, t = 0; a < 6; ++a) for (let b = 0; b <= a; ++b, ++t) out[t] += d[a] * d[b];
    ++m;
  }
  return out.map((v) => (v * factor) / m);
}
const position = (lower) => lower.slice(0, 6);

// map_covariance, and for Lambert targets refused because the arc's plane is
// undefined (transfer angle within 1 degree of 0 or 180 degrees: element-set
// epochs often fall at one orbital phase, so whole revolutions return to the
// start) the two-body STM from SGP4's state instead, counted (PLAN.md,
// changes to the draft).
async function mapWithFallback(requests, elements, c) {
  const results = (await gp.invokeJson('map_covariance', [elements, json('options', { requests })], 'covariance')).results;
  const retry = [], where = [];
  results.forEach((r, k) => (r.targets ?? []).forEach((t, i) => {
    if (requests[k].method === 'lambert' && t.error?.startsWith('transfer angle')) {
      retry.push({ ...requests[k], to: [requests[k].to[i]], method: 'two-body' });
      where.push([k, i]);
    }
  }));
  if (retry.length) {
    const fixed = (await gp.invokeJson('map_covariance', [elements, json('options', { requests: retry })], 'covariance')).results;
    fixed.forEach((r, n) => {
      const [k, i] = where[n];
      const t = r.targets?.[0];
      if (t && !t.error) { results[k].targets[i] = { ...t, fallback: 'two-body' }; ++c.lambertDegenerate; }
    });
  }
  return results;
}

const errorRuns = values.errors.split(',');
const counts = {};
for (const name of regimes) {
  const W = config.regimes[name].c3WindowDays;
  const objects = regimeObjects(referenceDir, name).filter((n) => !only || only.has(n));
  const { byObject, files } = windowSets(archive, referenceDir, window, objects);
  run.addInputs('gpHistory', files);
  // Target epochs per anchor from step 10 (targets with a precise state only).
  const targetsOf = new Map();
  for (const r of await readRuns(errorRuns, 'errors', (r) => r.regime === name && !r.missing)) {
    const k = `${r.norad} ${r.anchor}`;
    if (!targetsOf.has(k)) targetsOf.set(k, []);
    targetsOf.get(k).push({ tau: r.tau, epoch: r.epoch });
  }
  const c = counts[name] = { anchors: 0, c1: 0, c3: 0, c1Refused: 0, c3Refused: 0, lambertFailures: 0, lambertDegenerate: 0, calls: 0 };
  for (const norad of objects) {
    const sets = byObject.get(norad) ?? [];
    for (let chunk = window.lo; chunk < window.hi; chunk += CHUNK * DAY_MS) {
      const anchors = sets.filter((s) => s.ms >= chunk && s.ms < Math.min(chunk + CHUNK * DAY_MS, window.hi) && targetsOf.has(`${norad} ${s.epoch}`));
      if (!anchors.length) continue;
      c.anchors += anchors.length;
      const usable = (s, days) => sets.filter((x) => x.createdMs <= s.createdMs && x.ms <= s.ms && x.ms >= s.ms - days * DAY_MS);
      const members = new Map();
      const residualTargets = [], plan = [];
      for (const s of anchors) {
        const s1 = usable(s, P.c1.spanDays), s3 = usable(s, W);
        for (const x of [...s1, ...s3]) members.set(x.epoch, x);
        const p = { s, s1, s3, targets: targetsOf.get(`${norad} ${s.epoch}`).sort((a, b) => a.tau - b.tau) };
        if (s1.length >= P.c1.minimumSets) { p.i1 = residualTargets.length; residualTargets.push({ norad, epoch: s.epoch, origin: 'set', originSet: s.epoch, sets: s1.map((x) => x.epoch) }); }
        if (s3.length >= P.c3.minimumSets) { p.i3 = residualTargets.length; residualTargets.push({ norad, epoch: isoMs(s.ms - (W / 2) * DAY_MS), origin: 'mean', sets: s3.map((x) => x.epoch) }); }
        plan.push(p);
      }
      const elements = ommFrame([...members.values()]);
      const residuals = residualTargets.length
        ? (await gp.invokeJson('common_epoch', [elements, json('options', { targets: residualTargets })], 'differences')).targets : [];
      ++c.calls;
      // First pass: C1a, C1b mapped back, C3a.
      const requests = [], index = [];
      for (const p of plan) {
        const to = p.targets.map((t) => t.epoch);
        const r1 = p.i1 !== undefined ? residuals[p.i1] : null;
        if (r1 && !r1.missing && r1.sets.length >= P.c1.minimumSets) {
          p.P1 = covariance(r1.sets.map((x) => x.rtn));
          p.oldest = p.s1[0];
          index.push([p, 'C1a']); requests.push({ norad, set: p.s.epoch, covariance: p.P1, to, method: 'sgp4' });
          index.push([p, 'C1b-back']); requests.push({ norad, set: p.oldest.epoch, axesSet: p.s.epoch, from: p.s.epoch, covariance: p.P1, to: [p.oldest.epoch], method: 'lambert' });
        } else ++c.c1Refused;
        const r3 = p.i3 !== undefined ? residuals[p.i3] : null;
        if (r3 && !r3.missing && r3.sets.length >= P.c3.minimumSets) {
          p.P3 = pairwise(r3.sets.map((x) => x.rtn), P.c3.factors.C3a);
          index.push([p, 'C3a']); requests.push({ norad, set: p.s.epoch, covariance: p.P3, to, method: 'sgp4' });
        } else ++c.c3Refused;
      }
      const mapped = requests.length ? await mapWithFallback(requests, elements, c) : [];
      ++c.calls;
      const forward = [], forwardIndex = [];
      mapped.forEach((m, k) => {
        const [p, what] = index[k];
        if (what === 'C1b-back') {
          const back = m.targets?.[0];
          if (!back || back.error) { p.C1bError = back?.error ?? m.error ?? 'map back failed'; ++c.lambertFailures; return; }
          p.C1bBackPerigee = back.lambert?.perigeeRadiusKm ?? null;
          forwardIndex.push(p);
          forward.push({ norad, set: p.s.epoch, covariance: back.covariance, to: p.targets.map((t) => t.epoch), method: 'lambert' });
          return;
        }
        p[what] = m.targets ?? [];
        if (m.error) p[`${what}Error`] = m.error;
      });
      if (forward.length) {
        const fwd = await mapWithFallback(forward, elements, c);
        ++c.calls;
        fwd.forEach((m, k) => { forwardIndex[k].C1b = m.targets ?? []; });
      }
      for (const p of plan) {
        const row = { regime: name, norad, anchor: p.s.epoch, n1: p.s1.length, n3: p.s3.length, targets: [] };
        if (p.C1bError) row.C1bError = p.C1bError;
        p.targets.forEach((t, k) => {
          const entry = { tau: t.tau, epoch: t.epoch };
          for (const method of ['C1a', 'C1b', 'C3a']) {
            const m = p[method]?.[k];
            if (!m) continue;
            if (m.error) { entry[`${method}Error`] = m.error; if (method === 'C1b') ++c.lambertFailures; continue; }
            entry[method] = position(m.covariance);
            if (m.fallback) entry[`${method}Fallback`] = m.fallback;
            if (method === 'C1b') {
              const perigees = [p.C1bBackPerigee, m.lambert?.perigeeRadiusKm].filter(Number.isFinite);
              if (perigees.length) entry.C1bPerigeeKm = Math.min(...perigees);
            }
          }
          row.targets.push(entry);
        });
        if (p.C1a) ++c.c1;
        if (p.C3a) ++c.c3;
        out.write(row);
      }
    }
  }
  log(`${name}: ${JSON.stringify(c)}`);
}
const rows = await out.close();
run.write('counts.json', counts);
run.finish({ counts, rows });
await gp.destroy();
log(`done: ${rows} rows`);
