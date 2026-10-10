#!/usr/bin/env node
// E4 step 25 (amendment A5): EPH-fit, full-force HPOP fitted to the paired
// operator file (analysis/estimation fit_batch, answered by propagator/hpop),
// and its scoring with EPH-direct (the file itself), S (SGP4 from E4's set at
// T_c) and the references of results/e4/a5/pairs.json (truth, a later
// operator file or a later Planet state). Rows (derived from element sets
// for S and the B* a priori: never committed) go to runs/<id>/rows.jsonl.gz;
// each fitted product goes to runs/<id>/products.jsonl for E9.
//
//   node experiments/e4-operator-ephemeris-parity/steps/25-eph-fit.mjs --provider spacex-starlink --split validation --windows near,day,span [--shard 0/2] [--resume ID]
//   node .../25-eph-fit.mjs --provider spacex-starlink --split test --windows chosen
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { ReferenceIndex } from '../../../harness/reference.mjs';
import { DAY_MS, assertFrozen, cli, config, configPath } from '../common.mjs';
import { epochMs, nominalAgom, productContext, readSets, setAt } from '../products.mjs';
import { sp3Context } from '../sp3.mjs';
import { OperatorFiles, iso, truthAt, windowSamples } from '../a5.mjs';
import { decodeSamples, executionFrame, fitArc, withParameters } from '../full-force.mjs';
import { conditioned } from '../../e2-catalog-covariance/product.mjs';
import { lowerToFull } from '../../e2-catalog-covariance/moments.mjs';

assertFrozen();
const { values, modules, archive, inputs, truth: truthDir } = cli({ split: { type: 'string' }, windows: { type: 'string' }, shard: { type: 'string' }, resume: { type: 'string' }, limit: { type: 'string' } });
const A = config.a5, A4 = config.a4;
const provider = values.provider;
const spec = config.providers[provider];
if (!A.pairs.providers.includes(provider)) throw new Error(`--provider: one of ${A.pairs.providers.join(', ')}`);
const split = values.split ?? 'validation';
const pairsFile = path.join(repoRoot, 'results', 'e4', 'a5', 'pairs.json');
const pairsAll = JSON.parse(fs.readFileSync(pairsFile, 'utf8'));
let windows = (values.windows ?? A.windows.order.join(',')).split(',');
if (windows[0] === 'chosen') {
  const chosen = JSON.parse(fs.readFileSync(path.join(repoRoot, 'results', 'e4', 'a5', 'windows.json'), 'utf8'));
  windows = [chosen.providers[provider].window];
}
if (provider === 'planet') windows = ['state'];
const [shard, shards] = (values.shard ?? '0/1').split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `25-eph-fit-${provider}-${split}${shards > 1 ? `-s${shard}of${shards}` : ''}`, configPath, modulesDir: modules, args: values, resume: values.resume });
run.addInputs('a5Pairs', { [path.relative(repoRoot, pairsFile)]: sha256(fs.readFileSync(pairsFile)) });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const ctx = await productContext(modules, run);
let sp3 = null;
const sp3Ctx = async () => (sp3 ??= await sp3Context(modules, run, config.inputs.eopFinals));
const sinex = fs.readFileSync(config.inputs.satelliteMetadata);
const readInput = (f) => {
  const bytes = fs.readFileSync(path.join(inputs, provider, f.file));
  if (sha256(bytes) !== f.sha256) throw new Error(`${f.file}: bytes differ from inputs.json`);
  run.addInputs('operator', { [`${provider}/${f.file}`]: f.sha256 });
  return bytes;
};

// Catalog names for Intelsat and SES, as steps 10 and 20 resolve them.
function namesFor(files) {
  if (!['intelsat-ecf', 'ses-i11'].includes(spec.format)) return null;
  const days = files.map((f) => f.captured.slice(0, 10)).sort();
  const named = readSets(archive, iso(Date.parse(`${days[0]}T00:00:00Z`) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), days.at(-1), null, null);
  const latest = new Map([...named].map(([n, l]) => [n, l.sort((a, b) => a.creationDate.localeCompare(b.creationDate)).at(-1).objectName]));
  const payload = (name) => !/\bDEB\b|R\/B/.test(name);
  if (spec.format === 'ses-i11') {
    const key = (name) => name.replace(/\s*\(.*$/, '').toUpperCase().replace(/[\s-]+/g, '');
    return { resolve: (name) => { const hits = [...latest].filter(([, n]) => key(n) === key(name) && payload(n)).map(([n]) => n); return hits.length === 1 ? hits[0] : null; } };
  }
  const rule = spec.names;
  const target = (token) => {
    if (rule.aliases[token]) return rule.aliases[token];
    const m = /^([a-z]+\d*[a-z]*?)-?([0-9a-z]+)?$/.exec(token);
    if (rule.prefixes[token]) return rule.prefixes[token];
    const [prefix, rest] = token.includes('-') ? token.split('-') : [token, ''];
    return rule.prefixes[prefix] ? `${rule.prefixes[prefix]} ${rest.toUpperCase()}`.trim() : (m ? token.toUpperCase() : token);
  };
  return { resolve: (token) => { const want = target(token); const hits = [...latest].filter(([, n]) => n.replace(/\s*\(.*$/, '').trim().toUpperCase() === want && payload(n)).map(([n]) => n); return hits.length === 1 ? hits[0] : null; } };
}

const record = JSON.parse(fs.readFileSync(path.join(inputs, provider, 'inputs.json'), 'utf8'));
const ops = new OperatorFiles({ provider, inputs, readInput, ctx, sp3Ctx, sinex, gpNames: namesFor(record.files) });
const fileOf = new Map(record.files.map((f) => [f.file, f]));
const truthIndex = spec.truth && fs.existsSync(path.join(truthDir, 'reference')) ? new ReferenceIndex(path.join(truthDir, 'reference'), spec.truth) : null;
const pairs = pairsAll.providers[provider].pairs.filter((p) => p.split === split).filter((_, i) => i % shards === shard);
const list = values.limit ? pairs.slice(0, Number(values.limit)) : pairs;

// Element sets around the cutoffs (S and the B* a priori).
const tcs = list.map((p) => Date.parse(p.tc));
const sets = list.length ? readSets(archive, iso(Math.min(...tcs) - config.elementSets.lookbackDays * DAY_MS).slice(0, 10), iso(Math.max(...tcs)).slice(0, 10), new Set(list.map((p) => p.norad)), run) : new Map();

const rowsFile = path.join(run.dir, 'rows.jsonl'), productsFile = path.join(run.dir, 'products.jsonl');
const done = new Set(fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.file}|${r.norad}|${r.window}`; }) : []);
if (!fs.existsSync(rowsFile)) fs.writeFileSync(rowsFile, '');
const regimeRow = A.forceRow[provider];
const forces = A4.forces[regimeRow];
const sampling = A.samplingSeconds[regimeRow];
log(`${provider} ${split}: ${list.length} pairs, windows ${windows.join(',')}${done.size ? `, ${done.size} rows done before` : ''}`);

// A reference state at an exact epoch: truth, a later operator file, or a later Planet state.
async function referenceState(norad, ref) {
  const ms = Date.parse(ref.epoch);
  if (ref.source.startsWith('truth')) return truthAt(truthIndex, norad, ms)?.state ?? null;
  const t = (await ops.load(fileOf.get(ref.file))).get(norad);
  const k = t ? t.epochs.indexOf(ms) : -1;
  return k >= 0 ? t.state(k) : null;
}

// The fitted (or, for Planet, stated) product: {epoch, state, covariance, n, parameters, fixed, fit, refit}.
async function product(pair, trajectory, window, set) {
  const tc = Date.parse(pair.tc);
  const b = set ? Math.max(0, set.elements.BSTAR) * A4.bstar.toCdAreaOverMass : null;
  const nominal = nominalAgom(provider, pair.norad);
  // In LEO the drag coefficient's a priori is B* of E4's set at T_c.
  if (regimeRow === 'LEO' && b === null) return { failed: 'no element set at the cutoff (no B* a priori)' };
  if (provider === 'planet') {
    const state = await trajectory.state(0);
    const [sp, sv] = A.windows.planetStateSigma;
    const covariance = Array(36).fill(0);
    [sp, sp, sp, sv, sv, sv].forEach((x, i) => { covariance[i * 6 + i] = x * x; });
    return { epoch: iso(trajectory.epochs[0]), state, covariance, n: 6, parameters: [], fixed: { b, agom: nominal.agom }, observations: 1, span: [iso(trajectory.epochs[0]), iso(trajectory.epochs[0])] };
  }
  const obs = windowSamples(trajectory, tc, A.windows.default[window], sampling);
  if (obs.length < 2) return { failed: `too few states in the window (${obs.length})` };
  const observations = [];
  for (const o of obs) {
    const s = await trajectory.state(o.k);
    if (provider === 'spacex-starlink') observations.push({ epoch: iso(o.ms).replace('Z', ''), state: s, covariance: lowerToFull(trajectory.covariances[o.k]).map((v) => v * 1e6) });
    else { const sg = A.observations.sigmaM[provider] ** 2; observations.push({ epoch: iso(o.ms).replace('Z', ''), state: s.slice(0, 3), covariance: [sg, 0, 0, 0, sg, 0, 0, 0, sg] }); }
  }
  const refIndex = obs.findIndex((o) => o.ms >= tc);
  const r = refIndex >= 0 ? refIndex : obs.length - 1;
  const reference = { epoch: iso(obs[r].ms).replace('Z', ''), state: await trajectory.state(obs[r].k) };
  const fixed = { b: regimeRow === 'LEO' ? b : 0, agom: nominal.agom, ...(regimeRow !== 'MEO' ? { inTrack: 0 } : { ecom2: {} }) };
  const kinds = A.parameters[regimeRow].map((p) => ({ ...p }));
  const inputs = ctx.inputsFor(tc, obs[0].ms, obs.at(-1).ms, forces);
  const attempt = async (list) => {
    const parameters = list.map((p) => ({ kind: p.kind, value: p.apriori === 'bstar' ? b : p.apriori === 'nominal' ? nominal.agom : p.apriori }));
    const n = 6 + parameters.length;
    const apriori = Array(n * n).fill(0);
    A.aprioriStateSigma.forEach((x, i) => { apriori[i * n + i] = x * x; });
    list.forEach((p, i) => { const sg = p.sigma ?? p.relativeSigma * parameters[i].value; apriori[(6 + i) * n + 6 + i] = sg * sg; });
    const res = await fitArc({ estimation: ctx.modules['analysis/estimation'], hpop: ctx.modules['propagator/hpop'], codec: ctx.codec }, inputs, reference, observations,
      { parameters, apriori, forces, fixed, integrator: A4.integrator, fit: A.fit, covarianceAxes: provider === 'spacex-starlink' ? 'RTN' : 'REQUEST' });
    return { res, parameters, n };
  };
  let refit = null, out;
  try {
    out = await attempt(kinds);
  } catch (error) {
    if (!/invalid-forces/.test(error.message)) throw error;
    // A negative Cd*A/m or Cr*A/m proposed: refit once with it fixed at its a priori.
    const drop = kinds.find((p) => p.kind === 'DRAG_AREA_OVER_MASS' || p.kind === 'SRP_AREA_OVER_MASS');
    if (!drop) throw error;
    refit = `${drop.kind} fixed at its a priori`;
    out = await attempt(kinds.filter((p) => p !== drop));
  }
  const { res, parameters, n } = out;
  const fit = { status: res.status, rounds: res.rounds, hpopCalls: res.hpopCalls, iterations: res.fit?.iterations, converged: res.fit?.converged, reducedChiSquare: res.fit?.reducedChiSquare,
    degreesOfFreedom: res.fit?.degreesOfFreedom, measurements: res.fit?.measurementCount, parameters: res.fit?.estimate?.slice(6) };
  if (!res.fit?.converged) return { failed: `fit not converged (status ${res.status})`, fit, refit };
  const scale = Math.max(1, res.fit.reducedChiSquare);
  return { epoch: reference.epoch, state: res.fit.estimate.slice(0, 6), covariance: conditioned(res.fit.covariance.map((v) => v * scale)), n,
    parameters, values: res.fit.estimate.slice(6), fixed: withParameters(fixed, parameters, res.fit.estimate.slice(6)), fit, refit, covarianceScale: scale,
    observations: observations.length, span: [iso(obs[0].ms), iso(obs.at(-1).ms)] };
}

let count = 0;
for (const pair of list) {
  const f = fileOf.get(pair.file);
  const trajectory = (await ops.load(f)).get(pair.norad);
  const tc = Date.parse(pair.tc);
  const set = setAt(sets.get(pair.norad), tc);
  // Targets: E4's within-span horizons (EPH-direct there), their references, and the beyond-span references.
  const targets = [];
  for (const w of pair.within) {
    const ms = Date.parse(w.epoch);
    const k = trajectory.epochs.indexOf(ms);
    targets.push({ kind: 'within', h: w.h, ms, direct: k >= 0 ? await trajectory.state(k) : null });
    if (w.reference) {
      const st = await referenceState(pair.norad, w.reference);
      if (st) targets.push({ kind: 'within-ref', h: w.h, ms: Date.parse(w.reference.epoch), ref: st, source: w.reference.source,
        direct: Date.parse(w.reference.epoch) === ms && k >= 0 ? await trajectory.state(k) : null });
    }
  }
  for (const bt of pair.beyond) {
    if (!bt.reference) continue;
    const st = await referenceState(pair.norad, bt.reference);
    if (st) targets.push({ kind: 'beyond', h: bt.h, ms: Date.parse(bt.reference.epoch), ref: st, source: bt.reference.source });
  }
  // S against EPH-direct and against the references, once per pair.
  const sDirect = new Map(), sRef = new Map();
  if (set) {
    const direct = targets.filter((t) => t.kind === 'within' && t.direct);
    if (direct.length) (await ctx.sgp4Errors(set, pair.norad, direct.map((t) => ({ epoch: iso(t.ms), state: t.direct })))).forEach((e, i) => { if (e) sDirect.set(direct[i].ms, e.e); });
    const refs = targets.filter((t) => t.ref);
    const uniq = [...new Map(refs.map((t) => [t.ms, t])).values()].sort((a, b) => a.ms - b.ms);
    if (uniq.length) (await ctx.sgp4Errors(set, pair.norad, uniq.map((t) => ({ epoch: iso(t.ms), state: t.ref })))).forEach((e, i) => { if (e) sRef.set(uniq[i].ms, e.e); });
  }
  for (const window of windows) {
    if (done.has(`${pair.file}|${pair.norad}|${window}`)) continue;
    const row = { provider, norad: pair.norad, file: pair.file, tc: pair.tc, split, window, row: regimeRow, set: set ? { epoch: set.epoch, created: set.creationDate } : null, targets: [] };
    let p = null;
    try {
      p = await product(pair, trajectory, window, set);
    } catch (error) {
      p = { failed: String(error.message).slice(0, 300) };
    }
    if (p.failed) { row.failed = p.failed; row.fit = p.fit ?? null; row.refit = p.refit ?? null; }
    else {
      Object.assign(row, { fit: p.fit ?? null, refit: p.refit ?? null, observations: p.observations, span: p.span, epoch: p.epoch, parameters: (p.parameters ?? []).map((q, i) => ({ kind: q.kind, value: p.values?.[i] })) });
      // EPH-fit at every target epoch, with its covariance.
      const epochs = [...new Set(targets.map((t) => t.ms))].sort((a, b) => a - b);
      const at = new Map();
      const later = epochs.filter((ms) => ms !== Date.parse(`${p.epoch.replace(/Z?$/, '')}Z`));
      if (later.length) {
        try {
          const samples = decodeSamples(await ctx.modules['propagator/hpop'].invoke('invoke', [
            executionFrame({ epoch: p.epoch.replace(/Z$/, ''), state: p.state, samples: later.map((ms) => iso(ms).replace('Z', '')), forces,
              coefficients: p.fixed, parameters: p.parameters ?? [], covariance: p.covariance, integrator: A4.integrator }),
            ...ctx.inputsFor(tc, Math.min(Date.parse(`${p.epoch.replace(/Z?$/, '')}Z`), ...later), Math.max(...later), forces),
          ]));
          later.forEach((ms, i) => at.set(ms, samples[i]));
        } catch (error) {
          row.propagationError = String(error.message).slice(0, 300);
        }
      }
      const self = Date.parse(`${p.epoch.replace(/Z?$/, '')}Z`);
      if (epochs.includes(self)) at.set(self, { state: p.state, covariance: p.covariance, n: p.n });
      for (const t of targets) {
        const s = at.get(t.ms);
        const out = { kind: t.kind, h: t.h, epoch: iso(t.ms), source: t.source ?? 'EPH-direct' };
        if (s && t.direct) out.fitDirect = (await ctx.rtnDifference(iso(t.ms), s.state, t.direct, t.direct)).e;
        if (s && t.ref) { const d = await ctx.rtnDifference(iso(t.ms), s.state, t.ref, t.ref, s.covariance, s.n ?? p.n); out.fitRef = d.e; out.fitRefC3 = d.c3; }
        if (t.direct && t.ref) out.directRef = (await ctx.rtnDifference(iso(t.ms), t.direct, t.ref, t.ref)).e;
        if (t.kind === 'within' && sDirect.has(t.ms)) out.sDirect = sDirect.get(t.ms);
        if (t.ref && sRef.has(t.ms)) out.sRef = sRef.get(t.ms);
        row.targets.push(out);
      }
      // The product for E9 (local; derives from the element set's B* in LEO).
      fs.appendFileSync(productsFile, `${JSON.stringify({ provider, norad: pair.norad, variant: 'EPH-fit', window, cutoff: pair.tc, file: pair.file, epoch: p.epoch, frame: 'GCRF', timeScale: 'UTC',
        state: p.state, covariance: p.covariance, dimension: p.n, parameters: row.parameters, fixed: p.fixed, covarianceScale: p.covarianceScale ?? null,
        forces: { row: regimeRow, ...forces }, integrator: A4.integrator, observations: p.observations, span: p.span, refit: p.refit ?? null })}\n`);
    }
    fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`);
    ++count;
  }
  if (count % 10 === 0) { run.checkpoint(); log(`${count} rows`); }
}
if (truthIndex) run.addInputs('truth', truthIndex.read);
const rows = fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
fs.writeFileSync(`${rowsFile}.gz`, zlib.gzipSync(fs.readFileSync(rowsFile)));
fs.rmSync(rowsFile);
const summary = { rows: rows.length, failed: rows.filter((r) => r.failed).length, refit: rows.filter((r) => r.refit).length,
  reasons: rows.filter((r) => r.failed).reduce((a, r) => { const k = r.failed.replace(/\d+(\.\d+)?/g, 'n'); a[k] = (a[k] ?? 0) + 1; return a; }, {}) };
run.write('counts.json', summary);
run.finish({ provider, split, windows, shard: `${shard}/${shards}`, counts: summary });
log(`${provider} ${split}: ${JSON.stringify(summary)}`);
await ctx.destroy();
if (sp3) await sp3.destroy();
