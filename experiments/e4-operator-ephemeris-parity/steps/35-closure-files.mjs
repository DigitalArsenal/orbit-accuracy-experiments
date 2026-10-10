#!/usr/bin/env node
// E4 step 35 (amendment A6): the ephemeris fitter (harness/ephemeris-fit.mjs)
// on every object of every operator file. For each maneuver-free segment it
// records the exact statistics at every point and the half-split closure.
// The OCMs and their statistics are kept local in E11's layout
// (runs/cache/e4-a6-derived/<provider>/<norad>/<file>/ocm-<segment>.fbs and
// stats.json; step 36 adds the OMMs and the gates). The rows go to
// runs/cache/e4-a6-files/<provider>/shard-<i>.jsonl (resumable), and
// --summarize writes results/e4/a6/closure-files.json (committed: statistics
// only, no operator state).
//
// States enter as the file gives them: SpaceX MEME and CCSDS OEM on
// EME2000 with the file's own epoch text (BACC's 21:59:59.999999 included);
// Earth-fixed files (Intelsat, SES, CPF) and SP3 through step 10's
// conversion to GCRF (files/orbit-products). Operator events: the ISS
// TRAJECTORY EVENT SUMMARY, every event but a visiting vehicle's launch.
//
//   node experiments/e4-operator-ephemeris-parity/steps/35-closure-files.mjs --modules <checkout> --provider iss [--shard 0/2] [--limit 3]
//   node experiments/e4-operator-ephemeris-parity/steps/35-closure-files.mjs --summarize
// --inputs, --derived and --rows point a run at other operator files (an
// archive directory staged with an inputs.json) and keep its records apart.
import fs from 'node:fs';
import path from 'node:path';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { ephemerisFitEnv, fitEphemeris, VERSION } from '../../../harness/ephemeris-fit.mjs';
import { assertFrozen, cli, config, configPath } from '../common.mjs';
import { derivedDir, operatorInputs } from '../a6.mjs';

const { values, modules, inputs, archive } = cli({ shard: { type: 'string', default: '0/1' }, limit: { type: 'string' }, summarize: { type: 'boolean' }, derived: { type: 'string' }, rows: { type: 'string' } });
const rowsDir = path.resolve(values.rows ?? path.join(repoRoot, 'runs', 'cache', 'e4-a6-files'));
const derivedRootDir = values.derived ? path.resolve(values.derived) : undefined;
const GATE_M = config.a6.gate.maxClosureM;

if (values.summarize) {
  const out = { experiment: config.experiment, amendment: 'A6', step: '35-closure-files', generated: new Date().toISOString(), fitter: VERSION,
    note: 'Per operator file, object and maneuver-free segment: the exact residuals of the fitted orbit at every point and the half-split closure (m). Statistics only.', providers: {} };
  const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  for (const provider of fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).sort() : []) {
    const rows = fs.readdirSync(path.join(rowsDir, provider)).filter((f) => f.endsWith('.jsonl'))
      .flatMap((f) => fs.readFileSync(path.join(rowsDir, provider, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
    rows.sort((a, b) => a.file.localeCompare(b.file) || a.norad - b.norad);
    const segs = rows.flatMap((r) => (r.segments ?? []).map((s) => ({ ...s, file: r.file, norad: r.norad })));
    const closed = segs.filter((s) => s.closure && !s.closure.skipped);
    const cl = closed.map((s) => s.closure.max3d), fit = segs.map((s) => s.stats.rms3d);
    out.providers[provider] = {
      files: new Set(rows.map((r) => r.file)).size, objectFiles: rows.length, errors: rows.filter((r) => r.error).length, segments: segs.length,
      splits: { operatorEvents: rows.reduce((a, r) => a + (r.splits ?? []).filter((s) => s.reason === 'operator event').length, 0), residualJumps: rows.reduce((a, r) => a + (r.splits ?? []).filter((s) => s.reason === 'residual jump').length, 0) },
      fitRms3dM: { median: q(fit, 0.5), p90: q(fit, 0.9), max: q(fit, 1) },
      closureMax3dM: { segments: closed.length, median: q(cl, 0.5), p90: q(cl, 0.9), max: q(cl, 1), withinGate: cl.filter((x) => x <= GATE_M).length },
      rows,
    };
  }
  const dir = path.join(repoRoot, 'results', 'e4', 'a6');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'closure-files.json'), `${JSON.stringify(out, null, 1)}\n`);
  for (const [p, v] of Object.entries(out.providers)) console.log(p, JSON.stringify({ ...v, rows: undefined }));
  process.exit(0);
}

assertFrozen();
const provider = values.provider;
if (!provider || !config.providers[provider]) throw new Error('--provider: one of config.providers');
const spec = config.providers[provider];
const [shard, shards] = values.shard.split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `35-closure-files-${provider}-${shard}of${shards}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const A4 = config.a4.inputs;
const env = await ephemerisFitEnv({ modulesDir: modules, eopFinals: config.inputs.eopFinals, gfzKp: A4.gfzKp, swpcRsga: A4.swpcRsga,
  kernelPath: path.join(repoRoot, A4.kernel.path), kernelSha256: A4.kernel.sha256 });
for (const m of env.provenance.modules) run.addModule(m);
const ops = operatorInputs({ provider, inputs, archive, modules, run });

const dir = path.join(rowsDir, provider);
fs.mkdirSync(dir, { recursive: true });
const outFile = path.join(dir, `shard-${shard}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).file) : []);
// Capture order; Starlink's paired files (role "ephemeris") before the second files.
let count = 0;
for (const [i, f] of ops.files.entries()) {
  if (i % shards !== shard || done.has(f.file)) continue;
  if (values.limit && count >= Number(values.limit)) break;
  ++count;
  const started = performance.now();
  let objects;
  try { objects = await ops.objectsOf(f); } catch (error) {
    fs.appendFileSync(outFile, `${JSON.stringify({ provider, file: f.file, sha256: f.sha256, norad: null, error: `read: ${String(error.message).slice(0, 300)}` })}\n`);
    continue;
  }
  const rows = [];
  for (const o of objects) {
    const t0 = performance.now();
    let row;
    try {
      const out = await fitEphemeris(env, { object: o.object, source: { provider, url: f.url ?? '', sha256: f.sha256, issued: o.issued }, frame: o.frame, timeScale: o.timeScale, states: o.states, events: o.events });
      const dir = derivedDir(provider, o.object.norad, f.file, derivedRootDir);
      fs.mkdirSync(dir, { recursive: true });
      const segments = out.segments.map((s) => {
        const name = `ocm-${s.index}.fbs`;
        fs.writeFileSync(path.join(dir, name), s.ocm);
        const c = s.closure;
        return { index: s.index, reason: s.reason, regime: s.regime, perigeeAltitudeKm: s.perigeeAltitudeM / 1000,
          stats: { n: s.stats.n, span: s.stats.span, spanSeconds: s.stats.spanSeconds, rms3d: s.stats.rms3d, rmsPerCoordinate: s.stats.rmsPerCoordinate, rmsR: s.stats.rmsR, rmsT: s.stats.rmsT, rmsN: s.stats.rmsN, max3d: s.stats.max3d, maxR: s.stats.maxR, maxT: s.stats.maxT, maxN: s.stats.maxN },
          fit: { iterations: s.fit.iterations, converged: s.fit.converged, hpopCalls: s.fit.hpopCalls, fitPoints: s.fit.fitPoints, reducedChiSquare: s.fit.reducedChiSquare, parameters: s.fit.parameters },
          closure: c && !c.skipped ? { splitEpoch: c.splitEpoch, n: c.n, span: c.span, rms3d: c.rms3d, rmsPerCoordinate: c.rmsPerCoordinate, rmsR: c.rmsR, rmsT: c.rmsT, rmsN: c.rmsN, max3d: c.max3d, maxR: c.maxR, maxT: c.maxT, maxN: c.maxN,
            firstHalf: { n: c.firstHalf.n, rms3d: c.firstHalf.rms3d, max3d: c.firstHalf.max3d }, fit: { iterations: c.fit.iterations, converged: c.fit.converged, parameters: c.fit.parameters } } : c,
          ocm: { file: path.relative(repoRoot, path.join(dir, name)), sha256: sha256(Buffer.from(s.ocm)) } };
      });
      row = { provider, file: f.file, sha256: f.sha256, captured: f.captured, norad: o.object.norad, issued: o.issued, points: o.states.length, events: o.events,
        segments, splits: out.splits, skipped: out.skipped, seconds: (performance.now() - t0) / 1000, rssMB: process.memoryUsage().rss / 1e6 };
      fs.writeFileSync(path.join(dir, 'stats.json'), `${JSON.stringify({ source: { provider, file: f.file, url: f.url ?? null, captured: f.captured, sha256: f.sha256, bytes: f.bytes ?? null },
        object: o.object, issued: o.issued, frame: o.frame, timeScale: o.timeScale, points: o.states.length, span: [o.states[0].epoch, o.states.at(-1).epoch], events: o.events,
        hpop: { fitter: VERSION, run: run.id, provenance: env.provenance, segments, splits: out.splits, skipped: out.skipped, seconds: row.seconds } }, null, 1)}\n`);
    } catch (error) {
      row = { provider, file: f.file, sha256: f.sha256, norad: o.object.norad, points: o.states.length, error: String(error.message).slice(0, 300), seconds: (performance.now() - t0) / 1000 };
    }
    rows.push(row);
    const worst = Math.max(...(row.segments ?? []).map((s) => s.closure?.max3d ?? 0));
    log(`${f.file} ${o.object.norad}: ${row.error ? `ERROR ${row.error}` : `${row.segments.length} segment(s), fit RMS ${row.segments.map((s) => s.stats.rms3d.toExponential(2)).join('/')} m, closure max ${worst.toExponential(2)} m`} (${row.seconds.toFixed(0)} s)`);
  }
  for (const row of rows) fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  if (!rows.length) fs.appendFileSync(outFile, `${JSON.stringify({ provider, file: f.file, sha256: f.sha256, norad: null, note: 'no object to fit', seconds: (performance.now() - started) / 1000 })}\n`);
  run.checkpoint();
}
run.finish({ provider, shard, shards, file: path.relative(repoRoot, outFile) });
await env.destroy();
await ops.destroy();
