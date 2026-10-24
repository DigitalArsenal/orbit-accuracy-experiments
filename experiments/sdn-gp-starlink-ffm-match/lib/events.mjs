// Amendment A10 (DESIGN 5.5): the case lists of M22 (impulses) and M23 (finite burns), the satellites they run on, and the FFM-1 truths of both. FFM-1 integrates; this file builds typed
// requests (lib/ffm-events.mjs) and keeps the samples. A truth file holds, for every case of a satellite, the 864 states at t_b + k 300 s (k = 1 to 864; km and km/s in GCRF; NaN where a
// state lies inside a finite burn and is not scored).
import fs from 'node:fs';
import path from 'node:path';
import { config, store, read, sha256 } from '../common.mjs';
import { propagateEvents } from './ffm-events.mjs';
import { iso } from './windows.mjs';

export const EVENTS = path.join(store, 'events');
export const STEP_S = 300, SAMPLES = 864, RESTART_INDEX = 1439, FIT_HOURS = 24;
export const AXES = ['U', 'V', 'W'];
const UNIT = { U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] };
export const IMPULSE_MS = [0.001, 0.01, 0.1, 1, 10];
export const BURN_MIN = [1, 5, 15, 30, 60], BURN_DV_MS = [0.1, 1];
export const CASES = {
  m22: [{ id: 'ctl', kind: 'control' }, ...AXES.flatMap((axis) => IMPULSE_MS.map((dvMS) => ({ id: `imp-${axis}-${dvMS}`, kind: 'impulse', axis, dvMS })))],
  m23: AXES.flatMap((axis) => BURN_MIN.flatMap((durationMin) => BURN_DV_MS.map((dvMS) => ({ id: `burn-${axis}-${durationMin}m-${dvMS}`, kind: 'burn', axis, durationMin, dvMS })))),
};
export const unit = (axis) => UNIT[axis];
/** Every `step`-th registered truth in ascending NORAD order starting with the first (M22: 5, M23: 10). */
export const STRIDE = { m22: 5, m23: 10 };
export function satellites(kind) {
  const dir = path.join(store, 'truth');
  const metas = fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).map((n) => read(path.join(dir, n))).sort((a, c) => a.norad - c.norad);
  return metas.filter((_, i) => i % STRIDE[kind] === 0);
}
export const readTruthFlat = (meta) => new Float64Array(new Uint8Array(fs.readFileSync(path.join(store, 'truth', `${meta.norad}.f64`))).buffer);
export const t0Of = (meta) => Date.parse(meta.truth.epochUtc);
export const tbOf = (meta) => t0Of(meta) + FIT_HOURS * 3600000;
export const sampleMs = (meta) => Array.from({ length: SAMPLES }, (_, i) => tbOf(meta) + (i + 1) * STEP_S * 1000);
export const truthPaths = (kind, norad) => ({ bin: path.join(EVENTS, kind, `${norad}.f64`), json: path.join(EVENTS, kind, `${norad}.json`) });

const toKm = (samples) => samples.flatMap((s) => s.state.map((x) => x / 1000));

/** The 864 states of one case (km, km/s; NaN where not scored) and what FFM-1 reported. */
async function oneCase(modules, context, meta, flat, c) {
  const t0 = t0Of(meta), tb = tbOf(meta), epoch = iso(t0 + RESTART_INDEX * 60000);
  const state = Array.from(flat.slice(RESTART_INDEX * 6, RESTART_INDEX * 6 + 6), (x) => x * 1000);
  const base = { epoch, state, cdAm: meta.fit.bEffM2Kg, crAm: meta.fit.crAm, integrator: config.truth.integrator };
  const epochs = sampleMs(meta);
  const dvUnit = c.axis ? unit(c.axis) : null;
  let out;
  if (c.kind === 'control') out = await propagateEvents(modules, context, { ...base, epochs });
  else if (c.kind === 'impulse') out = await propagateEvents(modules, context, { ...base, epochs, impulses: [{ ms: tb, dv: dvUnit.map((x) => x * c.dvMS), basis: 'RTN' }] });
  else {
    const D = c.durationMin * 60, te = tb + D * 1000;
    const accel = dvUnit.map((x) => (x * c.dvMS) / D);
    // FFM-1 reports 'Finite-burn tolerance cannot be met at minStep' for some burn arcs at the registered tolerance: the burn stage then retries at 1e-12, 1e-11 and 1e-10 (the tolerance used is recorded)
    let stage1 = null, burnTolerance = config.truth.integrator.tolerance;
    for (const tolerance of [config.truth.integrator.tolerance, 1e-12, 1e-11, 1e-10]) {
      burnTolerance = tolerance;
      stage1 = await propagateEvents(modules, context, { ...base, integrator: { ...base.integrator, tolerance }, epochs: [te], finiteBurns: [{ startS: (tb - Date.parse(epoch)) / 1000, stopS: (te - Date.parse(epoch)) / 1000, accel, basis: 'RTN' }] });
      if (stage1.ok || !/tolerance cannot be met/.test(stage1.error ?? '')) break;
    }
    if (!stage1.ok) return { ok: false, error: stage1.error };
    const after = epochs.filter((t) => t > te);
    const stage2 = after.length ? await propagateEvents(modules, context, { ...base, epoch: iso(te), state: stage1.samples[0].state, epochs: after }) : { ok: true, samples: [] };
    if (!stage2.ok) return { ok: false, error: stage2.error };
    const byMs = new Map([[te, stage1.samples[0]], ...stage2.samples.map((s) => [s.ms, s])]);
    out = { ok: true, samples: epochs.map((t) => byMs.get(t) ?? { ms: t, state: Array(6).fill(Number.NaN) }), wasmSha256: stage1.wasmSha256, burnTolerance };
  }
  if (!out.ok) return { ok: false, error: out.error };
  return { ok: true, states: toKm(out.samples), wasmSha256: out.wasmSha256, burnTolerance: out.burnTolerance };
}

/** The truth file of one satellite for `kind` (cached): returns its index. */
export async function satelliteTruth(modules, context, meta, kind) {
  const p = truthPaths(kind, meta.norad);
  if (fs.existsSync(p.json)) return read(p.json);
  const flat = readTruthFlat(meta);
  const cases = CASES[kind], all = new Float64Array(cases.length * SAMPLES * 6);
  const index = { norad: meta.norad, kind, t0Utc: meta.truth.epochUtc, tbUtc: iso(tbOf(meta)), restartIndex: RESTART_INDEX, cdAm: meta.fit.bEffM2Kg, crAm: meta.fit.crAm, cases: [], createdUtc: new Date().toISOString() };
  for (const [ci, c] of cases.entries()) {
    const r = await oneCase(modules, context, meta, flat, c);
    if (!r.ok) { index.cases.push({ ...c, error: r.error }); all.fill(Number.NaN, ci * SAMPLES * 6, (ci + 1) * SAMPLES * 6); continue; }
    all.set(r.states, ci * SAMPLES * 6);
    index.wasmSha256 = r.wasmSha256;
    let entry = { ...c, ...(r.burnTolerance !== undefined ? { burnTolerance: r.burnTolerance } : {}) };
    if (c.kind === 'control') { // the control must reproduce the registered truth (restart from sample 1439)
      let worst = 0;
      for (let k = 1; k <= SAMPLES; k += 1) { const j = (RESTART_INDEX + 1 + 5 * k) * 6, i = (k - 1) * 6; worst = Math.max(worst, Math.hypot(r.states[i] - flat[j], r.states[i + 1] - flat[j + 1], r.states[i + 2] - flat[j + 2])); }
      entry = { ...entry, maxDifferenceM: worst * 1000 };
    }
    index.cases.push(entry);
  }
  fs.mkdirSync(path.dirname(p.bin), { recursive: true });
  fs.writeFileSync(`${p.bin}.part`, Buffer.from(all.buffer)); fs.renameSync(`${p.bin}.part`, p.bin);
  index.sha256 = sha256(fs.readFileSync(p.bin));
  fs.writeFileSync(`${p.json}.part`, `${JSON.stringify(index, null, 1)}\n`); fs.renameSync(`${p.json}.part`, p.json);
  return index;
}

/** The states of case `ci` from a loaded truth file: [{ r, v }] in km, km/s (NaN where not scored). */
export const caseStates = (all, ci) => Array.from({ length: SAMPLES }, (_, k) => { const o = (ci * SAMPLES + k) * 6; return { r: [all[o], all[o + 1], all[o + 2]], v: [all[o + 3], all[o + 4], all[o + 5]] }; });
export const loadTruth = (kind, norad) => new Float64Array(new Uint8Array(fs.readFileSync(truthPaths(kind, norad).bin)).buffer);
