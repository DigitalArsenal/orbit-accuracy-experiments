#!/usr/bin/env node
// E4 step 36 (amendment A6): the rest of each operator file's derived
// records, and the raw file's removal. Owner, 2026-10-10: "we should NOT be
// storing the ephemeris raw, ONLY the HPOP OCM and OMM derived once we curve
// fit". For each object of each file that step 35 fitted:
//  - OMMs: analysis/gp-error-model fit_elements (E11's method) on E11's grid,
//    B* fitted: 6, 12, 24 and 48 h from the issue time and to the file's end.
//    Each OMM carries its exact RMS over every point of its window and its
//    half-split closure.
//  - Frame gate: the Space-Track element set of the issue time (EPOCH and
//    CREATION_DATE at or before it), scored by element_residuals on the same
//    points over the first hours after the issue. Its 3D RMS over the mean
//    radius must stay below config.a6.reduce.frameGate.maxAngleRad: a frame
//    or time-scale error gives 30-40 km. The set is a check only; nothing
//    from it is kept beyond the gate's numbers in the local stats.
//  - Removal gates: every HPOP segment converged, at least one OMM converged,
//    and the frame gate passed for every object of the file.
// The OMMs go to omm.fbs and the results into stats.json, beside step 35's
// OCMs (runs/cache/e4-a6-derived/<provider>/<norad>/<file>/). With
// --delete, a file that passes every gate is removed from
// runs/cache/e4-inputs, and runs/cache/e4-a6-reduced.jsonl logs it with its
// SHA-256 and size. A failing file is kept and listed.
//
//   node experiments/e4-operator-ephemeris-parity/steps/36-reduce.mjs --modules <checkout> --omm-modules <checkout with gp-error-model 0.2.0> --provider iss [--delete]
import fs from 'node:fs';
import path from 'node:path';
import * as flatbuffers from 'flatbuffers';
import * as OEM from 'spacedatastandards.org/lib/js/OEM/main.js';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { json, loadModule } from '../../../harness/modules.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { assertFrozen, cli, config, configPath, DAY_MS, HOUR_MS } from '../common.mjs';
import { derivedDir, operatorInputs } from '../a6.mjs';
import { readSets, setAt } from '../products.mjs';

const { values, modules, inputs, archive } = cli({ 'omm-modules': { type: 'string' }, delete: { type: 'boolean' } });
const R = config.a6.reduce;
assertFrozen();
const provider = values.provider;
if (!provider || !config.providers[provider]) throw new Error('--provider: one of config.providers');
if (!values['omm-modules']) throw new Error('--omm-modules: a modules checkout with analysis/gp-error-model ' + R.omm.version);
const run = startRun({ experiment: config.experiment, step: `36-reduce-${provider}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const gp = await loadModule(values['omm-modules'], R.omm.module);
if (gp.provenance.version !== R.omm.version || gp.provenance.wasmSha256 !== R.omm.wasmSha256) throw new Error(`${R.omm.module}: ${gp.provenance.version} ${gp.provenance.wasmSha256} is not the pinned build`);
run.addModule(gp.provenance);
const ops = operatorInputs({ provider, inputs, archive, modules, run });
const isoMs = (t) => { const m = /^(.*T\d\d:\d\d:\d\d)(?:\.(\d+))?Z?$/.exec(t); return Date.parse(`${m[1]}Z`) + (m[2] ? Number(`0.${m[2]}`) * 1000 : 0); };
const iso6 = (ms) => { let s = Math.floor(ms / 1000), us = Math.round((ms - s * 1000) * 1000); if (us >= 1e6) { s += 1; us -= 1e6; } return `${new Date(s * 1000).toISOString().slice(0, 19)}.${String(us).padStart(6, '0')}Z`; };

// The provider's fitted objects (step 35 rows): norads and issue times, to
// read the element-set archive once.
const rowsDir = path.join(repoRoot, 'runs', 'cache', 'e4-a6-files', provider);
const rows = fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => fs.readFileSync(path.join(rowsDir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))) : [];
const fitted = rows.filter((r) => r.norad && !r.error);
const norads = new Set(fitted.map((r) => r.norad));
const issuedMs = fitted.map((r) => isoMs(r.issued));
const sets = norads.size ? readSets(archive, new Date(Math.min(...issuedMs) - config.elementSets.lookbackDays * DAY_MS).toISOString().slice(0, 10),
  new Date(Math.max(...issuedMs)).toISOString().slice(0, 10), norads, run) : new Map();

// The object's states as an in-memory $OEM in the file's frame (km, km/s).
function ephemeris(o) {
  const b = new OEM.ephemerisDataBlockT();
  b.CENTER_NAME = 'EARTH';
  b.TIME_SYSTEM = OEM.timingStandard.UTC;
  b.OBJECT = Object.assign(new OEM.CATT(), { NORAD_CAT_ID: o.object.norad, OBJECT_NAME: o.object.name || null });
  b.REFERENCE_FRAME = Object.assign(new OEM.RFMT(), { NAME: o.frame });
  b.EPHEMERIS_DATA_LINES = o.states.map((s) => {
    const l = new OEM.ephemerisDataLineT();
    l.EPOCH = s.epoch;
    [l.X, l.Y, l.Z] = s.position.map((x) => x / 1000);
    [l.X_DOT, l.Y_DOT, l.Z_DOT] = (s.velocity ?? [0, 0, 0]).map((x) => x / 1000);
    return l;
  });
  const fb = new flatbuffers.Builder(1 << 22);
  OEM.OEM.finishSizePrefixedOEMBuffer(fb, Object.assign(new OEM.OEMT(), { EPHEMERIS_DATA_BLOCK: [b] }).pack(fb));
  return { portId: 'ephemeris', payload: Buffer.from(fb.asUint8Array()), typeRef: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' } };
}

const logFile = path.join(repoRoot, 'runs', 'cache', 'e4-a6-reduced.jsonl');
const summary = { removed: [], kept: [], notDerived: [] };
for (const f of ops.files) {
  const raw = path.join(inputs, provider, f.file);
  if (!fs.existsSync(raw)) continue;  // removed earlier
  let objects;
  try { objects = await ops.objectsOf(f); } catch (error) { summary.kept.push({ file: f.file, reason: `read: ${error.message}` }); continue; }
  if (!objects.length) { summary.kept.push({ file: f.file, reason: 'no object to fit (single states)' }); continue; }
  const verdicts = [];
  for (const o of objects) {
    const dir = derivedDir(provider, o.object.norad, f.file);
    const statsFile = path.join(dir, 'stats.json');
    if (!fs.existsSync(statsFile)) { verdicts.push({ norad: o.object.norad, pass: false, reason: 'no step 35 OCM' }); continue; }
    const stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
    const t0 = performance.now();
    const eph = ephemeris(o);
    const epochsMs = o.states.map((s) => isoMs(s.epoch));
    const issued = isoMs(o.issued);
    const k0 = Math.max(0, epochsMs.findIndex((ms) => ms >= issued));
    const anchor = epochsMs[k0], last = epochsMs.at(-1);
    const grid = R.omm.grid.map((h) => ({ id: h ? `span${h}-bstar` : 'spanEnd-bstar', hours: h,
      options: { norad: o.object.norad, from: iso6(anchor), to: iso6(h ? Math.min(anchor + h * HOUR_MS, last) : last), epoch: 'first', fitBstar: true } }))
      .filter((g, i, all) => all.findIndex((x) => x.options.to === g.options.to) === i);
    let omm = null;
    try {
      const out = await gp.invoke('fit_elements', [eph, json('options', { tolerance: R.omm.tolerance, maxIterations: R.omm.maxIterations, closure: true, fits: grid.map((g) => g.options) })]);
      const report = JSON.parse(Buffer.from(out.outputs.find((x) => x.portId === 'report').payload).toString());
      const elements = out.outputs.find((x) => x.portId === 'elements')?.payload;
      if (elements?.length) fs.writeFileSync(path.join(dir, 'omm.fbs'), Buffer.from(elements));
      omm = { module: gp.provenance, fits: grid.map((g, i) => { const r = report.fits[i] ?? {}; return { id: g.id, options: g.options, converged: !!r.converged, iterations: r.iterations, stop: r.stop, criterion: r.criterion,
        epoch: r.epoch, elements: r.elements, rms: r.rms, closure: r.closure, error: r.error ?? null }; }) };
    } catch (error) {
      omm = { module: gp.provenance, error: String(error.message).slice(0, 300) };
    }
    // Frame gate.
    let gate = { reason: 'no element set at the issue time' };
    const st = setAt(sets.get(o.object.norad), issued);
    if (st) {
      const to = Math.min(anchor + R.frameGate.hours * HOUR_MS, last);
      const res = await gp.invokeJson('element_residuals', [ommFrame([st]), eph, json('options', { requests: [{ norad: o.object.norad, set: st.epoch, label: 'reference', windows: [{ from: iso6(anchor), to: iso6(to), label: 'gate' }] }] })], 'residuals');
      const w = res.results?.find((x) => x.label === 'reference')?.windows?.[0];
      const inside = o.states.filter((s, k) => epochsMs[k] >= anchor && epochsMs[k] <= to);
      const radius = inside.reduce((a, s) => a + Math.hypot(...s.position), 0) / Math.max(1, inside.length);
      const angle = w ? w.rms3dKm * 1000 / radius : NaN;
      gate = { set: { epoch: st.epoch, creationDate: st.creationDate, gpId: st.gpId }, window: [iso6(anchor), iso6(to)], n: w?.n ?? 0, rms3dKm: w?.rms3dKm ?? null, angleRad: angle,
        maxAngleRad: R.frameGate.maxAngleRad, pass: Number.isFinite(angle) && angle < R.frameGate.maxAngleRad };
    }
    const segments = stats.hpop?.segments ?? [];
    const checks = { hpopConverged: segments.length > 0 && segments.every((s) => s.fit?.converged), ommConverged: !!omm.fits?.some((x) => x.converged), frame: !!gate.pass };
    const pass = Object.values(checks).every(Boolean);
    stats.omm = omm;
    stats.reduction = { gate, checks, pass, run: run.id, seconds: (performance.now() - t0) / 1000 };
    fs.writeFileSync(statsFile, `${JSON.stringify(stats, null, 1)}\n`);
    verdicts.push({ norad: o.object.norad, pass, checks, angleRad: gate.angleRad ?? null, reason: pass ? null : Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(', ') + (gate.reason ? ` (${gate.reason})` : '') });
  }
  const pass = verdicts.length && verdicts.every((v) => v.pass);
  if (pass && values.delete) {
    const bytes = fs.statSync(raw).size;
    fs.unlinkSync(raw);
    fs.appendFileSync(logFile, `${JSON.stringify({ provider, file: f.file, sha256: f.sha256, bytes, removed: new Date().toISOString(), run: run.id,
      derived: verdicts.map((v) => path.relative(repoRoot, derivedDir(provider, v.norad, f.file))) })}\n`);
    summary.removed.push(f.file);
  } else if (pass) summary.kept.push({ file: f.file, reason: 'passes; kept without --delete' });
  else if (verdicts.some((v) => v.reason === 'no step 35 OCM')) summary.notDerived.push(f.file);
  else summary.kept.push({ file: f.file, reason: verdicts.filter((v) => !v.pass).map((v) => `${v.norad}: ${v.reason}`).join('; ') });
  log(`${f.file}: ${pass ? (values.delete ? 'REMOVED' : 'passes') : 'KEPT'} ${verdicts.map((v) => `${v.norad} ${v.pass ? 'ok' : v.reason}${Number.isFinite(v.angleRad) ? ` (${v.angleRad.toExponential(2)} rad)` : ''}`).join('; ')}`);
  run.checkpoint();
}
run.write('reduction.json', summary);
run.finish({ provider, removed: summary.removed.length, kept: summary.kept.length, notDerived: summary.notDerived.length });
log(JSON.stringify({ removed: summary.removed.length, kept: summary.kept, notDerived: summary.notDerived.length }));
await gp.destroy();
await ops.destroy();
