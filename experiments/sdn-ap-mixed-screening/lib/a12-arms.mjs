// Amendment A12's new part 1a arms: ffm3 (fit_batch version 3 with the selected profile, config.a12.selected) and XP-LN (lib/xpln.mjs).
// The fit phases read the capture only through the fit-only reader (lib/prefit.mjs) and never call windowOf; the arms' predictions are
// for the score and leads phases. Rows: rows/starlink-ffm3.s<k>.jsonl, rows/starlink-xpln.s<k>.jsonl; the opened paths of each shard
// under <store>/a12-receipts/<arm>.opened.s<k>.txt.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, store, root, readJsonl, paced } from '../common.mjs';
import { prefitReader } from './prefit.mjs';
import { profileSettings, openV3, fitInput } from './a12.mjs';

const A = config.a12;
const H = 3600e3;
const xplnModules = () => path.resolve(fs.realpathSync(path.join(A.modulesLinks, 'analysis/estimation')), '../..'); // the checkout of the estimation commit (f54b5107e), which is XP-LN's commit too
const a3Rows = () => fs.readdirSync(path.join(store, 'rows')).filter((f) => /^starlink-ffm\.s\d+\.jsonl$/.test(f)).sort().flatMap((f) => readJsonl(path.join(store, 'rows', f)));

/** The selected profile's settings for one satellite and, for P2(c), its rule: { base, release (P3), ceiling }. */
export function selectedProfile(maximumIterations) {
  const name = A.selected?.profile;
  if (!name) throw new Error('A12 part 2 (config.a12.selected) is not committed');
  const c = A.candidates[name];
  return { name, base: c.base ?? name, release: c.releaseT ?? null, ceiling: c.ceiling ?? null, maximumIterations };
}

/** The ffm3 fit of one track (lines): P2(c) fits P0 and, when its B exceeds c, P3 instead. */
export async function fitFfm3(v3, fitV3, norad, lines, E, prof) {
  const { points, reference } = fitInput(lines);
  const ctx = v3.ctxFor(Date.parse(lines[0].epoch), E + 72 * H);
  const run = async (profile) => { const s = profileSettings(norad, profile, { maximumIterations: prof.maximumIterations }); return { s, f: await fitV3(ctx, points, reference, s) }; };
  let { s, f } = await run(prof.base);
  let released = false, baseB = null;
  if (prof.release) {
    baseB = f.ok ? f.parameters.find((p) => p.kind === 'DRAG_AREA_OVER_MASS').value : null;
    if (f.ok && baseB > prof.ceiling) { ({ s, f } = await run(prof.release)); released = true; }
  }
  return { ...f, profile: prof.name, settingsProfile: s.profile, fixed: s.fixed, released, ...(prof.release ? { baseB } : {}) };
}

/** ffm3's rows (A12 point 11): the 40-evaluation fits, each replaced by its contingency refit at 60 evaluations where one exists
 *  (rows/starlink-ffm3-60.*: the tracks the first fit phase did not bring to CONVERGED, rerun once). `rowsOf(prefix)` -> [rows]. */
export function ffm3Merged(rowsOf) {
  const rerun = new Map(rowsOf('starlink-ffm3-60.').map((r) => [r.norad, { ...r, contingency: true }]));
  return rowsOf('starlink-ffm3.').map((r) => rerun.get(r.norad) ?? r);
}

/** Phase ffm3 or xpln over every part 1a track (A3's fit rows), shard k of n; `only` restricts it to those satellites (the contingency). */
export async function fitPhase(phase, { k, n, limit, maximumIterations, only = null }) {
  const outDir = path.join(store, 'rows'), recDir = path.join(store, 'a12-receipts');
  fs.mkdirSync(recDir, { recursive: true });
  const suffix = maximumIterations === A.fit.contingencyMaximumIterations ? '-60' : '';
  const out = path.join(outDir, `starlink-${phase}${suffix}.s${k}.jsonl`), log = path.join(recDir, `${phase}${suffix}.opened.s${k}.txt`);
  const done = new Set(readJsonl(out).map((r) => r.norad));
  const rows = a3Rows().sort((a, b) => a.norad - b.norad);
  const R = prefitReader(A.forecastCycle, (p) => fs.appendFileSync(log, `${p}\n`));
  const experiments = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  let fitter, provenance, prof = null;
  if (phase === 'ffm3') {
    const { fitV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
    const v3 = await openV3();
    prof = selectedProfile(maximumIterations);
    provenance = { estimationCommit: A.estimation.modulesCommit, estimationWasm: v3.provenance.estimation.wasmSha256, ffmCommit: A.ffm.modulesCommit, ffmWasm: v3.provenance.ffm.wasmSha256, domains: A.domains.sha256, experiments, profile: prof.name, maximumIterations };
    fitter = { fit: (row, lines) => fitFfm3(v3, fitV3, row.norad, lines, Date.parse(row.E), prof), close: () => v3.close() };
  } else {
    const { openXpln } = await import('./xpln.mjs');
    const x = await openXpln(xplnModules());
    provenance = { modulesCommit: x.provenance.modulesCommit, sdnapWasm: x.provenance.wasmSha256, sdsVersion: x.provenance.sdsVersion, pcfSha256: x.provenance.pcfSha256, experiments };
    fitter = { fit: (row, lines) => x.fit({ frame: 'GCRF', name: `STARLINK ${row.norad}`, norad: row.norad, originator: 'SpaceX via operator-capture' }, lines, Date.parse(row.E)), close: () => x.close() };
  }
  let count = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (i % n !== k || done.has(row.norad) || (only && !only.has(row.norad))) continue;
    if (limit && count >= limit) break;
    if (count % 20 === 0) await paced(Number(process.env.B2_LOAD_MAX ?? 26));
    const t = R.trackOf(row); // aborts unless the track hashes to A3's
    const t0 = Date.now();
    const f = await fitter.fit(row, t.lines);
    const rec = { norad: row.norad, F: row.F, E: row.E, track: { sha: t.sha, states: t.lines.length }, trackFrom: `the capture cycles before ${A.forecastCycle} (A12 fit-only reader)`, provenance, [phase]: { ...f, seconds: (Date.now() - t0) / 1000 } };
    fs.appendFileSync(out, `${JSON.stringify(rec)}\n`);
    count += 1;
    if (count % 50 === 0) console.error(`starlink ${phase}${suffix} shard ${k}/${n}: ${count}`);
  }
  console.error(`starlink ${phase}${suffix} shard ${k}/${n}: ${count} satellites`);
  await fitter.close();
}

/** The predictors of the new arms for the score and leads phases: { ffm3(product, epochsMs, E, covariance), xpln(omm, epochsMs), close }. */
export async function openArms() {
  const { propagateV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
  const v3 = await openV3();
  const { openXpln } = await import('./xpln.mjs');
  const x = await openXpln(xplnModules());
  const F = config.part1.starlink.ffm;
  return {
    provenance: { v3: v3.provenance, xpln: x.provenance },
    /** The ffm3 product carried to epochs (ms): [{ r, v } km, km/s GCRF], with `covariance` (n x n, m, m/s) each state's covariance too. */
    async ffm3(product, epochsMs, E, covariance = null) {
      const ctx = v3.ctxFor(Date.parse(product.epoch), E + 72 * H);
      const states = await propagateV3(ctx, product, epochsMs.map((t) => new Date(t).toISOString()), { forces: F.forces, integrator: F.integrator, fixed: product.fixed ?? {} }, covariance);
      return states.map((s) => ({ r: s.state.slice(0, 3).map((q) => q / 1000), v: s.state.slice(3, 6).map((q) => q / 1000), ...(covariance ? { covariance: s.covariance, n: s.n } : {}) }));
    },
    xpln: (omm, epochsMs) => x.states(omm, epochsMs, 'GCRF'),
    async close() { await v3.close(); await x.close(); },
  };
}
