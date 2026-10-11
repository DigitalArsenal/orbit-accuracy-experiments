// Step 30, Q1 on train and validation (PLAN.md 5.3–5.6): every candidate fitted per tier O fold on the train window,
// its corrections of the held-out objects' validation OMMs scored by the modules (rescore.mjs), the choice of M* per
// group by the clipped 3D RMS at epoch (ties as config.q1), M* fitted for every tier and fold on the train window
// (the models the test applies), M4 from M*'s held-out validation errors, and the corrected errors' second moments
// that Q2's A-corr weighs with. Reads train and validation only.
//
//   node experiments/e16-cross-regime-epoch/steps/30-q1-select.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startRun } from '../../../harness/provenance.mjs';
import { config, configPath, modulesRoot, readJson, resultsDir, sha256 } from '../common.mjs';
import { Fleet, candidates, clipKept, correctionOf, fitCandidate, fleetSample, loadSamples, responseOf, scalesOf } from '../q1lib.mjs';
import { rescoreAll } from '../rescore.mjs';
import { windowSets } from '../sets.mjs';

const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const run = startRun({ experiment: config.experiment, step: '30-q1-select', configPath, modulesDir: modulesRoot(), args: process.argv.slice(2) });
const inventory = readJson(path.join(resultsDir, 'inventory.json'));
run.addInputs('inventory', { 'inventory.json': sha256(fs.readFileSync(path.join(resultsDir, 'inventory.json'))) });
const meta = new Map(inventory.objects.filter((o) => !o.excluded).map((o) => [o.norad, o]));
const classes = Object.keys(config.regimes);

const train = loadSamples('train', classes), val = loadSamples('validation', classes);
run.manifest.sampleRuns = { train: train.runs, validation: val.runs };
const clipT = clipKept(train.rows), clipV = clipKept(val.rows);
const valSets = new Map(windowSets('validation', inventory.objects.map((o) => o.norad)).sets.map((s) => [s.gpId, s]));
log(`samples: train ${train.rows.length} (${clipT.kept.size} inside the clip), validation ${val.rows.length} (${clipV.kept.size})`);

const usable = (r, group) => r.errors[0] && meta.get(r.norad)?.group === group && (group !== 'LEO' || r.W);
const rms3 = (errs) => Math.sqrt(errs.reduce((t, e) => t + e[0] ** 2 + e[1] ** 2 + e[2] ** 2, 0) / errs.length);
const tieRank = (c) => ['C2', 'M3b', 'M3a', 'C1', 'C3'].indexOf(c.family) * 1e6 - (c.lambda ?? 0) + (c.K ?? 0) * 10 + (c.L ?? 0) / 100 + (c.dn ?? 0);

// The fleet of a fold: kept samples of objects outside it (train window; validation adds the train window's).
const fleetOf = (rows, kept, inFleet) => new Fleet(rows.filter((r) => kept.has(r.gpId) && inFleet(r.norad) && r.errors[0]).map(fleetSample));
function withFleet(rows, fleet, c) {
  return rows.map((r) => ({ ...r, fleet: c.family === 'C2' || c.family === 'C3' ? fleet.value(r, c.L, c.dn, config.q1.groups.LEO.families.C2.minimumContributors) : null }));
}

// Fit `cands` per tier O fold on train; corrections of the fold's held-out validation samples; module scores.
async function scoreCandidates(group, cands, scales) {
  const folds = [...new Set([...meta.values()].filter((o) => o.group === group).map((o) => o.tiers.O))].sort();
  const trainRows = train.rows.filter((r) => usable(r, group) && clipT.kept.has(r.gpId));
  const valRows = val.rows.filter((r) => usable(r, group));
  const dt = new Map();   // gpId -> {candId: s}
  for (const f of folds) {
    const inFold = (n) => meta.get(n)?.tiers.O === f;
    const tr = trainRows.filter((r) => !inFold(r.norad)), ho = valRows.filter((r) => inFold(r.norad));
    const fleetT = group === 'LEO' ? fleetOf(train.rows, clipT.kept, (n) => !inFold(n)) : null;
    const fleetV = group === 'LEO' ? new Fleet([...fleetOf(train.rows, clipT.kept, (n) => !inFold(n)).list, ...fleetOf(val.rows, clipV.kept, (n) => !inFold(n)).list]) : null;
    for (const c of cands) {
      const model = fitCandidate(c, withFleet(tr, fleetT, c), scales);
      for (const r of withFleet(ho, fleetV, c)) { if (!dt.has(r.gpId)) dt.set(r.gpId, {}); dt.get(r.gpId)[c.id] = correctionOf(model, r, scales); }
    }
    log(`${group} fold ${f}: ${cands.length} candidates fitted on ${tr.length} train samples; ${ho.length} held-out validation samples`);
  }
  const byClass = {};
  for (const r of valRows) {
    if (!dt.has(r.gpId)) continue;
    (byClass[r.cls] ??= []).push({ gpId: r.gpId, norad: r.norad, targets: [{ age: 0, ms: r.errors[0].targetMs, file: r.errors[0].file }], dt: dt.get(r.gpId) });
  }
  const scored = await rescoreAll({ window: 'validation', byClass, setsById: valSets, log });
  const kept = valRows.filter((r) => clipV.kept.has(r.gpId) && dt.has(r.gpId));
  const results = cands.map((c) => {
    const pairs = kept.filter((r) => scored[c.id]?.[r.gpId]?.[0]);
    return { ...c, n: pairs.length, rmsC0Km: rms3(pairs.map((r) => r.errors[0].e)), rmsKm: rms3(pairs.map((r) => scored[c.id][r.gpId][0])) };
  });
  return { results, scored, dt, kept };
}
const best = (results) => {
  const top = Math.min(...results.map((r) => r.rmsKm));
  const tied = results.filter((r) => r.rmsKm <= top * (1 + config.q1.tieBand));
  return tied.sort((a, b) => tieRank(a) - tieRank(b))[0];
};

const selection = { run: run.id, decided: null, rule: 'PLAN.md 5.5: lowest clipped 3D RMS at epoch on the validation window, tier O held-out samples pooled over folds; a candidate within 1 % ties, ties to the simpler (config.q1.tieOrder)', groups: {} };
const models = {};
for (const group of ['LEO', 'MEO/GEO']) {
  const trainRows = train.rows.filter((r) => usable(r, group) && clipT.kept.has(r.gpId));
  const scales = scalesOf(trainRows.map((r) => r.G));
  let cands = candidates(group);
  let { results, scored, kept } = await scoreCandidates(group, cands, scales);
  let chosen;
  if (group === 'LEO') {
    const c1 = best(results.filter((r) => r.family === 'C1')), c2 = best(results.filter((r) => r.family === 'C2'));
    const c3 = candidates(group, { C1: c1, C2: c2 }).filter((c) => c.family === 'C3');
    const more = await scoreCandidates(group, c3, scales);
    results = [...results, ...more.results];
    for (const [k, v] of Object.entries(more.scored)) scored[k] = v;
    chosen = best(results);
  } else {
    chosen = best(results);
  }
  log(`${group}: M* = ${chosen.id} (validation clipped RMS ${chosen.rmsKm.toFixed(4)} km against C0 ${chosen.rmsC0Km.toFixed(4)} km)`);

  // M* per tier and fold, fitted on the train window (applied unchanged to the test window).
  const spec = cands.find((c) => c.id === chosen.id) ?? candidates(group, { C1: { K: chosen.K, lambda: chosen.lambda }, C2: { L: chosen.L, dn: chosen.dn } }).find((c) => c.id === chosen.id);
  const tiers = {};
  const groupObjects = [...meta.values()].filter((o) => o.group === group);
  for (const tier of Object.keys(groupObjects[0].tiers)) {
    const folds = [...new Set(groupObjects.map((o) => o.tiers[tier]).filter((f) => f !== null && f !== undefined))];
    for (const f of folds) {
      if (tier === 'M' && f !== 'test') continue;
      const out = (n) => (tier === 'T' ? false : tier === 'M' ? meta.get(n)?.tiers.M !== 'train' : meta.get(n)?.tiers[tier] === f);
      const fleetT = group === 'LEO' ? fleetOf(train.rows, clipT.kept, (n) => !out(n)) : null;
      const tr = trainRows.filter((r) => !out(r.norad));
      if (!tr.length) continue;
      const m = fitCandidate(spec, withFleet(tr, fleetT, spec), scales);
      tiers[`${tier}:${f}`] = { tier, fold: f, n: m.n, objects: m.objects, standardizer: m.standardizer, fit: m.fit, heldOut: groupObjects.filter((o) => (tier === 'T' ? true : out(o.norad))).map((o) => o.norad) };
    }
  }
  // Every family's best, tier O folds only (PLAN.md 5.5: each family's best is reported on test).
  const familyBest = {};
  for (const fam of [...new Set(results.map((r) => r.family))]) {
    const b = best(results.filter((r) => r.family === fam));
    const fspec = cands.find((c) => c.id === b.id) ?? candidates(group, { C1: { K: b.K, lambda: b.lambda }, C2: { L: b.L, dn: b.dn } }).find((c) => c.id === b.id);
    const ftiers = {};
    for (const f of [...new Set(groupObjects.map((o) => o.tiers.O))]) {
      const out = (n) => meta.get(n)?.tiers.O === f;
      const fleetT = group === 'LEO' ? fleetOf(train.rows, clipT.kept, (n) => !out(n)) : null;
      const m = fitCandidate(fspec, withFleet(trainRows.filter((r) => !out(r.norad)), fleetT, fspec), scales);
      ftiers[`O:${f}`] = { tier: 'O', fold: f, n: m.n, objects: m.objects, standardizer: m.standardizer, fit: m.fit };
    }
    familyBest[fam] = { spec: fspec, tiers: ftiers };
  }
  models[group] = { spec, scales, tiers, familyBest };

  // M4 (PLAN.md 5.6) and A-corr's moments: M*'s held-out validation errors inside C0's clip, per regime class.
  const byCls = {};
  for (const r of kept) {
    const e = scored[chosen.id]?.[r.gpId]?.[0];
    if (!e) continue;
    const acc = (byCls[r.cls] ??= { n: 0, objects: new Set(), m2: Array(6).fill(0), c0: Array(6).fill(0) });
    acc.n += 1; acc.objects.add(r.norad);
    for (let k = 0; k < 6; ++k) { acc.m2[k] += e[k] ** 2; acc.c0[k] += r.errors[0].e[k] ** 2; }
  }
  const covariance = Object.fromEntries(Object.entries(byCls).map(([cls, a]) => [cls, {
    n: a.n, objects: a.objects.size, unitsNote: 'km^2 (R, T, N), (km/s)^2 (rates)',
    corrected: a.m2.map((v) => v / a.n), published: a.c0.map((v) => v / a.n),
  }]));
  selection.groups[group] = {
    chosen: chosen.id, family: chosen.family,
    candidates: results.map(({ id, family, K, lambda, L, dn, n, rmsC0Km, rmsKm }) => ({ id, family, K, lambda, L, dn, n, rmsC0Km, rmsKm, reduction: 1 - rmsKm / rmsC0Km })),
    familyBest: Object.fromEntries([...new Set(results.map((r) => r.family))].map((fam) => [fam, best(results.filter((r) => r.family === fam)).id])),
    covariance,
  };
}

selection.decided = new Date().toISOString();
fs.mkdirSync(path.join(resultsDir, 'selection'), { recursive: true });
const modelsFile = path.join(resultsDir, 'selection', 'q1-models.json');
fs.writeFileSync(modelsFile, `${JSON.stringify(models)}\n`);
selection.modelsSha256 = sha256(fs.readFileSync(modelsFile));
fs.writeFileSync(path.join(resultsDir, 'selection', 'q1.json'), `${JSON.stringify(selection, null, 1)}\n`);
run.write('q1.json', selection);
const m = run.finish({ chosen: Object.fromEntries(Object.entries(selection.groups).map(([g, s]) => [g, s.chosen])) });
fs.mkdirSync(path.join(resultsDir, 'manifests'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'manifests', `${m.run}.json`), `${JSON.stringify(m, null, 1)}\n`);
log('done');
