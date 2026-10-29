// The E' export (coordinator ruling 2026-10-29) for the covariance calibration's Starlink transfer check, so that it never opens the
// capture itself: for the selection sample's satellites whose E' window met A12's registered E' rule (point 7; V2 excluded by the
// sample), through the fit-only reader (lib/prefit.mjs: cycles before the forecast cycle only, no file at or after F, the truth gate,
// A3's track.sha, every opened path logged):
//   - ffm3's P0 fit on the E' fit track [E - 48 h, E - 24 h] (fit_batch version 3, A12's pins): state, B and AGOM, termination, the
//     formal covariance, and the product carried by propagator/ffm to each truth epoch with A5's covariance (formal times
//     max(1, reduced chi-square), no process noise);
//   - the truth states over (E', E] (files starting after E' and before F, cycles 2026-10-24T21Z, 10-25T05Z and 10-25T13Z, first 8 h).
// Nothing of part 1a (no state after E) is read into the export. Files under <store>/a12-eprime-export/; the receipt (opened paths,
// manifest SHA-256, count, pins) under results/sdn-ap-mixed-screening/.
//   node experiments/sdn-ap-mixed-screening/export-a12.mjs --phase export [--shard k/n]
//   node experiments/sdn-ap-mixed-screening/export-a12.mjs --phase manifest
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, store, results, args, frozen, readJsonl, root, write, sha256, paced } from './common.mjs';
import { prefitReader } from './lib/prefit.mjs';
import { cycleMs } from './lib/capture.mjs';
import { eprimeWindow } from './lib/a12-windows.mjs';
import { profileSettings, openV3, fitInput } from './lib/a12.mjs';

frozen();
const A = config.a12, H = 3600e3;
const out = path.join(store, 'a12-eprime-export');
const iso = (t) => new Date(t).toISOString();
const selection = () => fs.readdirSync(path.join(store, 'a12-selection')).filter((f) => /^fits\.s\d+\.jsonl$/.test(f)).sort().flatMap((f) => readJsonl(path.join(store, 'a12-selection', f)));
const members = () => selection().filter((r) => r.windows.eprime && !r.windows.eprime.skipped).sort((a, b) => a.norad - b.norad);
const phase = args.phase ?? 'export';

if (phase === 'export') {
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  fs.mkdirSync(path.join(out, 'satellites'), { recursive: true });
  const log = path.join(out, `opened.s${k}.txt`);
  const a3 = new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => /^starlink-ffm\.s\d+\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.norad, r]));
  const R = prefitReader(A.forecastCycle, (p) => fs.appendFileSync(log, `${p}\n`));
  const { fitV3, propagateV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
  const v3 = await openV3();
  const F = config.part1.starlink.ffm;
  const list = members();
  for (let i = 0; i < list.length; i += 1) {
    const sel = list[i], file = path.join(out, 'satellites', `${sel.norad}.json`);
    if (i % n !== k || fs.existsSync(file)) continue;
    if (i % 10 === k) await paced(Number(process.env.B2_LOAD_MAX ?? 26));
    const row = a3.get(sel.norad);
    R.trackOf(row); // the reader's guard: the track must hash to A3's (its states are not exported)
    const w = eprimeWindow(row, R);
    const s = sel.windows.eprime;
    if (w.skipped || w.fit.length !== s.fitStates || w.held.length !== s.heldStates || iso(w.E) !== s.fitEnd) throw new Error(`E' window of ${sel.norad} differs from the selection's`);
    if (w.held.some((l) => Date.parse(l.epoch) > Date.parse(row.E))) throw new Error(`E' truth of ${sel.norad} reaches past E`);
    const settings = profileSettings(sel.norad, 'P0');
    const { points, reference } = fitInput(w.fit);
    const ctx = v3.ctxFor(Date.parse(w.fit[0].epoch), w.E + 72 * H);
    const f = await fitV3(ctx, points, reference, settings);
    const rec = { norad: sel.norad, Eprime: iso(w.E), E: row.E, fitFrom: w.fit[0].epoch, fitStates: w.fit.length, profile: 'P0' };
    if (!f.termination) rec.fit = { ok: false, error: f.error };
    else {
      const p0 = s.candidates?.P0;
      if (p0?.termination !== f.termination || p0.parameters.some((q, j) => q.value !== f.parameters[j].value)) throw new Error(`P0 refit of ${sel.norad} differs from the selection's`);
      const scale = Math.max(1, f.reducedChiSquare ?? 1);
      rec.fit = { ok: f.ok, termination: f.termination, epoch: f.epoch, stateM: f.state, parameters: f.parameters, boundStatus: f.boundStatus, reducedChiSquare: f.reducedChiSquare, weightedRms: f.weightedRms, measurements: f.measurements, rejected: f.rejected, covarianceFormal: f.covariance, covarianceScale: scale, n: 6 + f.parameters.length };
      // propagator/ffm 2.0.0 may refuse the covariance (for example a parameter held at its bound): the refusal is recorded, and the
      // product is then carried without it, so the states are still exported
      let carried;
      try { carried = await propagateV3(ctx, f, w.held.map((l) => l.epoch), { forces: F.forces, integrator: F.integrator, fixed: {} }, f.covariance.map((x) => x * scale)); } catch (error) {
        rec.carriedCovarianceError = String(error.message).slice(0, 200);
        carried = await propagateV3(ctx, f, w.held.map((l) => l.epoch), { forces: F.forces, integrator: F.integrator, fixed: {} }, null);
      }
      rec.carried = carried.map((c, j) => ({ epoch: w.held[j].epoch, stateM: c.state, covariance: c.covariance ?? null, n: c.n }));
    }
    rec.truth = w.held.map((l) => ({ epoch: l.epoch, rKm: l.r, vKmS: l.v, file: l.file }));
    write(file, rec);
  }
  await v3.close();
  process.exit(0);
}

if (phase === 'xp') {
  // The SGP4-XP fairness export (coordinator ruling 2026-10-29): B2's registered SGP4-XP arm (propagator/sdn-ap `fit` THEORY SGP4XP, build
  // config.modules.sdnapWasmSha256) on the same E' fit track, and at every exported truth epoch its TEME state and the module's carried
  // covariance (sdnap_covariance_at). Files under satellites-xp/, beside the FFM files.
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  fs.mkdirSync(path.join(out, 'satellites-xp'), { recursive: true });
  const log = path.join(out, `opened-xp.s${k}.txt`);
  const a3 = new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => /^starlink-ffm\.s\d+\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.norad, r]));
  const R = prefitReader(A.forecastCycle, (p) => fs.appendFileSync(log, `${p}\n`));
  const { openFits, fitSdnap, sgp4xpCovarianceAt } = await import('./lib/fits.mjs');
  const { modulesRoot } = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/modules.mjs'));
  const a = await openFits(modulesRoot());
  const list = members();
  for (let i = 0; i < list.length; i += 1) {
    const sel = list[i], file = path.join(out, 'satellites-xp', `${sel.norad}.json`);
    if (i % n !== k || fs.existsSync(file)) continue;
    if (i % 10 === k) await paced(Number(process.env.B2_LOAD_MAX ?? 26));
    const row = a3.get(sel.norad);
    R.trackOf(row);
    const w = eprimeWindow(row, R);
    const s = sel.windows.eprime;
    if (w.skipped || w.fit.length !== s.fitStates || w.held.length !== s.heldStates || iso(w.E) !== s.fitEnd) throw new Error(`E' window of ${sel.norad} differs from the selection's`);
    if (w.held.some((l) => Date.parse(l.epoch) > Date.parse(row.E))) throw new Error(`E' truth of ${sel.norad} reaches past E`);
    const f = await fitSdnap(a, { frame: 'GCRF', name: `STARLINK ${sel.norad}`, norad: sel.norad, originator: 'SpaceX via operator-capture' }, w.fit, w.E, 'SGP4XP');
    const rec = { norad: sel.norad, Eprime: iso(w.E), E: row.E, fitFrom: w.fit[0].epoch, fitStates: w.fit.length, arm: 'SGP4-XP (B2 registered, build ' + config.modules.sdnapWasmSha256.slice(0, 12) + ')', fit: f.ok ? { ok: true, termination: 'fitted', ommBase64: f.omm, epoch: f.epoch, theory: f.theory, moduleFitRmsKm: f.moduleFitRmsKm } : { ok: false, termination: 'refused', error: f.error } };
    if (f.ok) {
      try {
        const c = await sgp4xpCovarianceAt(a, f.omm, w.held.map((l) => Date.parse(l.epoch)));
        rec.teme = c.map((x, j) => ({ epoch: w.held[j].epoch, rKm: x.r, vKmS: x.v, covarianceKm: x.covariance }));
      } catch (error) { rec.covarianceError = String(error.message).slice(0, 200); }
    }
    write(file, rec);
  }
  await a.close();
  process.exit(0);
}

if (phase === 'manifest') {
  const list = members();
  const files = fs.readdirSync(path.join(out, 'satellites')).filter((f) => f.endsWith('.json')).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  if (files.length !== list.length) throw new Error(`${files.length} files for ${list.length} satellites`);
  const entries = files.map((f) => { const b = fs.readFileSync(path.join(out, 'satellites', f)); const r = JSON.parse(b); return { file: `satellites/${f}`, sha256: sha256(b), norad: r.norad, ok: r.fit.ok, termination: r.fit.termination ?? null, truthStates: r.truth.length, carriedCovarianceError: r.carriedCovarianceError ?? null }; });
  const xpDir = path.join(out, 'satellites-xp');
  const xpFiles = fs.existsSync(xpDir) ? fs.readdirSync(xpDir).filter((f) => f.endsWith('.json')).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)) : [];
  if (xpFiles.length && xpFiles.length !== list.length) throw new Error(`${xpFiles.length} SGP4-XP files for ${list.length} satellites`);
  const xpEntries = xpFiles.map((f) => { const b = fs.readFileSync(path.join(xpDir, f)); const r = JSON.parse(b); return { file: `satellites-xp/${f}`, sha256: sha256(b), norad: r.norad, ok: r.fit.ok, termination: r.fit.termination, temeStates: r.teme?.length ?? 0, covarianceError: r.covarianceError ?? null }; });
  const manifest = { export: 'B2 A12 E\' export for the FFM covariance calibration (C2) Starlink transfer check', satellites: entries.length, files: entries, ...(xpEntries.length ? { sgp4xp: { arm: `B2's registered SGP4-XP (build ${config.modules.sdnapWasmSha256})`, files: xpEntries } } : {}) };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(out, 'manifest.json'), manifestBytes);
  const opened = fs.readdirSync(out).filter((f) => /^opened(-xp)?\.s\d+\.txt$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(out, f), 'utf8').split('\n').filter(Boolean));
  const late = opened.filter((p) => !(cycleMs(path.basename(path.dirname(p))) < cycleMs(A.forecastCycle)));
  if (late.length) throw new Error(`${late.length} opened paths are not before the forecast cycle`);
  const openedText = `${opened.join('\n')}\n`;
  fs.writeFileSync(path.join(results, 'a12-eprime-export-opened.txt'), openedText);
  const experiments = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  write(path.join(results, 'a12-eprime-export.json'), {
    export: manifest.export, directory: out, satellites: entries.length, terminations: entries.reduce((m, e) => ({ ...m, [e.termination ?? 'fit-failed']: (m[e.termination ?? 'fit-failed'] ?? 0) + 1 }), {}),
    truthStates: entries.reduce((t, e) => t + e.truthStates, 0), ...(xpEntries.length ? { sgp4xp: { files: xpEntries.length, fitted: xpEntries.filter((e) => e.ok).length, temeStates: xpEntries.reduce((t, e) => t + e.temeStates, 0), covarianceRefused: xpEntries.filter((e) => e.covarianceError).map((e) => ({ norad: e.norad, error: e.covarianceError })), build: config.modules.sdnapWasmSha256, modulesCommit: config.modules.commit } } : {}), carriedCovarianceRefused: entries.filter((e) => e.carriedCovarianceError).map((e) => ({ norad: e.norad, error: e.carriedCovarianceError })), manifestSha256: sha256(manifestBytes),
    opened: { paths: opened.length, distinct: new Set(opened).size, sha256: sha256(Buffer.from(openedText)), list: 'results/sdn-ap-mixed-screening/a12-eprime-export-opened.txt', allBeforeForecastCycle: true },
    pins: { estimation: A.estimation, ffm: A.ffm, domains: A.domains, modulesLinks: A.modulesLinks, profile: 'P0 (A12 part 2)', covariance: 'formal times max(1, reduced chi-square), carried by propagator/ffm, no process noise (A5)', experiments },
    rule: 'A12 point 7 (E\'), the selection sample (V2 excluded); no state after E is read into the export',
  });
  console.log(JSON.stringify({ satellites: entries.length, manifestSha256: sha256(manifestBytes) }));
  process.exit(0);
}
throw new Error(`unknown phase ${phase}`);
