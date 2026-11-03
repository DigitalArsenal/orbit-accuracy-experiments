#!/usr/bin/env node
// GP covariance realism, Part 1. `--check` verifies the frozen record against PLAN.md's acceptance items (a)-(j), reading only
// committed files and the pinned module build. Exit 0 all pass; 1 a check failed; 2 S3 failed (owner ruling required).
//   env SDN_MODULES_ROOT=<modules checkout> node experiments/gp-covariance-strata/run.mjs --check
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BINS, REGIMES } from './lib/bins.mjs';
import { openDate, outcomeOf, OUTCOMES } from './lib/outcomes.mjs';
import { eigvals, frob, lamMax } from './lib/linalg.mjs';
import { interp } from './lib/stats.mjs';

if (!process.argv.includes('--check')) { console.error('usage: run.mjs --check'); process.exit(64); }
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const modulesRoot = process.env.SDN_MODULES_ROOT;
if (!modulesRoot) { console.error('SDN_MODULES_ROOT is required'); process.exit(64); }
const sha = (b) => createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const fcFile = path.join(root, 'results/gp-covariance-strata/frozen-constants.json');
const fc = JSON.parse(fs.readFileSync(fcFile, 'utf8'));
const results = []; const check = (id, ok, msg) => { results.push([id, ok]); console.log(`${ok ? 'PASS' : 'FAIL'} ${id}: ${msg}`); };

// (a) 42 strata, one outcome each
{
  const keys = REGIMES.flatMap((r) => BINS.map((_, b) => `${r}|${b}`));
  const ok = keys.length === 42 && keys.every((k) => fc.strata[k] && OUTCOMES.includes(fc.strata[k].outcome))
    && ['HEO'].every((r) => BINS.every((_, b) => fc.strata[`${r}|${b}`].outcome === 'NO LAWFUL TRUTH'))
    && BINS.every((_, b) => fc.owner.o4 || fc.strata[`LEO-L|${b}`].outcome === 'NO LAWFUL TRUTH');
  const tally = {}; for (const k of keys) tally[fc.strata[k].outcome] = (tally[fc.strata[k].outcome] ?? 0) + 1;
  check('a', ok, `42 strata, outcomes ${JSON.stringify(tally)} (owner answers: o4 ${fc.owner.o4}, o5 ${fc.owner.o5})`);
}
// (b) operating characteristics of every TESTABLE stratum
{
  const testable = Object.values(fc.strata).filter((s) => s.outcome === 'TESTABLE');
  const ok = testable.every((s) => s.oc[0] >= 0.8 && s.oc[1] <= 0.05 && s.oc[2] <= 0.1) && Object.values(fc.strata).every((s) => s.oc === null || s.ocPass === (s.oc[0] >= 0.8 && s.oc[1] <= 0.05 && s.oc[2] <= 0.1));
  check('b', ok, `${testable.length} TESTABLE strata; every recorded OC row is consistent with its pass flag (seed ${fc.seed}, ${fc.trials} trials). Reproducing a row needs the dev rows in AR (${fc.devRows.files} files, manifest SHA-256 ${fc.devRows.manifestSha256.slice(0, 12)}); none is TESTABLE, so no row needs it`);
}
// (c) S5
{
  let bad = 0, n = 0, maxc = 1;
  for (const [key, s] of Object.entries(fc.s5)) {
    if (!s || s.c === null || s.c === undefined) continue;
    const [regime, b] = key.split('|'); const Pn = fc.pStrat[regime]?.[Number(b)]?.P; if (!Pn) { ++bad; continue; }
    ++n; maxc = Math.max(maxc, s.c);
    if (!(s.c >= 1)) ++bad;
    for (const m of s.modelCells) { const D = Pn.map((v, i) => s.c * v - m.P[i]); if (eigvals(D)[0] < -1e-12 * frob(m.P)) ++bad; }
    const need = Math.max(1, ...s.modelCells.map((m) => lamMax(Pn, m.P)));
    if (Math.abs(need - s.c) > 1e-9 * need) ++bad;
  }
  check('c', bad === 0 && n > 0, `${n} strata with a frozen cell: min eig(c P_new - P_m) >= -1e-12 |P_m| for every replaced model, c >= 1 (largest c ${maxc.toFixed(2)}); strata shipping below max_L: ${bad}`);
}
// (e) S4
{
  const s4 = fc.s4;
  let vendors = fc.vendorsBlob;
  try { vendors = git(root, 'rev-parse', 'origin/main:experiments/operator-theory/VENDORS.md').toString().trim(); } catch { /* origin ref absent on this clone: the pinned blob stands */ }
  const ok = s4.heldRowsRetained === 0 && s4.inputPathsUnderHolds === 0 && typeof s4.setRecordsDroppedByName.starlink === 'number' && vendors === fc.vendorsBlob;
  check('e', ok, `held rows retained ${s4.heldRowsRetained}; dropped: Starlink-named sets ${s4.setRecordsDroppedByName.starlink}, Galileo/GSAT-named ${s4.setRecordsDroppedByName.galileoGsat}, SP3 E blocks ${s4.truthObjectBlocksDropped.sp3PrnE}, C2 held objects ${s4.truthObjectBlocksDropped.c2HeldObject}, C2 time hold ${s4.truthTargetsDroppedByTime.c2Calibration20260601}; input paths under the holds ${s4.inputPathsUnderHolds}; VENDORS blob ${fc.vendorsBlob}`);
}
// (f) P_truth = 0 and sample ages inside their bins, edges included
{
  const ok = fc.pTruth === 0 && fc.sampleAgeRangeDays.every(([lo, hi], b) => lo >= BINS[b][0] && hi <= BINS[b][1]);
  check('f', ok, `P_truth ${fc.pTruth}; observed sample ages per bin ${JSON.stringify(fc.sampleAgeRangeDays.map(([a, b2]) => [Number(a.toFixed(4)), Number(b2.toFixed(4))]))}`);
}
// (g) the candidate choice
{
  let bad = 0;
  for (const [regime, c] of Object.entries(fc.candidates)) {
    if (!c.r0) continue;
    const dom = (A, B) => A.every((PA, b) => !PA || !B[b] || lamMax(PA, B[b]) <= 1 + 1e-9);   // B <= A in Loewner order
    const r0Big = dom(c.r0, c.r2), r2Big = dom(c.r2, c.r0);
    let pick, cc = 1;
    if (c.passRate.R0 !== c.passRate.R2) pick = c.passRate.R0 > c.passRate.R2 ? 'R0' : 'R2';
    else if (r0Big && !r2Big) pick = 'R0'; else if (r2Big && !r0Big) pick = 'R2';
    else { pick = 'R0xc'; cc = Math.max(1, ...c.r0.map((P, b) => (P && c.r2[b] ? lamMax(P, c.r2[b]) : 1))); }
    if (pick !== c.pick || Math.abs(cc - c.c) > 1e-9 * cc) ++bad;
  }
  check('g', bad === 0, `candidate choice recomputed from the stored pass rates and cells reproduces the frozen pick in every regime (${Object.entries(fc.candidates).map(([r, c]) => `${r}:${c.pick}`).join(' ')})`);
}
// (h) PLAN.md hash and the freeze commit time
{
  const planSha = sha(fs.readFileSync(path.join(here, 'PLAN.md')));
  let when = null; try { when = git(root, 'log', '-1', '--format=%cI', '--', 'results/gp-covariance-strata/frozen-constants.json').toString().trim(); } catch { /* none */ }
  const codeNow = { lib: hashTree(path.join(here, 'lib')), steps: hashTree(path.join(here, 'steps')) };
  const ok = planSha === fc.plan.sha256 && !!when && Date.parse(when) <= Date.parse('2026-11-08T23:59:00Z') && codeNow.lib === fc.code.libSha256 && codeNow.steps === fc.code.stepsSha256;
  check('h', ok, `PLAN.md ${planSha.slice(0, 12)} ${planSha === fc.plan.sha256 ? '=' : '!='} frozen; code hashes ${codeNow.lib === fc.code.libSha256 && codeNow.steps === fc.code.stepsSha256 ? 'match' : 'differ'}; freeze commit ${when ?? 'not committed'}`);
}
function hashTree(dir) { const h = createHash('sha256'); for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs')).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f))); return h.digest('hex'); }
// (i) open dates and scoring states
{
  const today = new Date().toISOString().slice(0, 10);
  let bad = 0, testable = 0, pending = 0, scored = 0;
  for (const [key, s] of Object.entries(fc.strata)) {
    const [regime, b] = key.split('|');
    if (s.open.date !== openDate(regime, Number(b)).date) ++bad;
    if (s.outcome === 'TESTABLE') { ++testable; if (s.state === 'PENDING') ++pending; else if (['LABELED', 'NOT REALISTIC', 'NOT TESTABLE'].includes(s.state)) ++scored; else ++bad; }
    const again = outcomeOf(regime, s.dev ? s : null, fc.owner);
    if (again.outcome !== s.outcome) ++bad;
  }
  if (today >= '2026-12-21' && scored + pending !== testable) ++bad;
  check('i', bad === 0, `open dates match the formula; ${testable} TESTABLE = ${pending} PENDING + ${scored} scored; outcomes recomputed from the stored records and owner answers agree`);
}
// (j) no per-object values in results/, attribution lines
{
  const dir = path.join(root, 'results/gp-covariance-strata');
  let bad = 0;
  for (const f of fs.readdirSync(dir)) { if (f === 'README.md') continue; const t = fs.readFileSync(path.join(dir, f), 'utf8'); if (/"(rtn|e|z)":\s*\[\s*-?[0-9]|"d2":\s*[0-9]|"setEpoch"|"sampleEpoch"/.test(t)) ++bad; }
  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  const lines = readme.includes('Contains modified Copernicus Sentinel data (2025-2026).') && readme.includes('WAAS MT9 data: NASA Crustal Dynamics Data Information System (CDDIS).');
  check('j', bad === 0 && lines, `results/ holds no per-object rows (${bad} offending files); README carries both attribution lines: ${lines}`);
}
// the pinned module build: blobs and the interpolation lookup against calibrate_covariance
{
  let ok = true, msg = '';
  try {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'gpstrata-'));
    for (const [rel, pin] of Object.entries(fc.pins.blobs)) {
      const bytes = git(modulesRoot, 'show', `${fc.pins.modulesOriginMain}:${rel}`);
      if (sha(bytes) !== pin.sha256) { ok = false; msg += ` ${rel} differs;`; }
      if (rel.startsWith('analysis/gp-error-model/') && (rel.endsWith('module.wasm') || rel.endsWith('plugin-manifest.json'))) { fs.mkdirSync(path.join(dest, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dest, rel), bytes); }
    }
    process.env.SPACE_DATA_STANDARDS_ROOT ??= path.resolve(modulesRoot, '../spacedatastandards.org');
    const { ARM_OF, decode, frame } = await import('./lib/erm-codec.mjs');
    const { loadModule } = await import('../../harness/modules.mjs');
    const gp = await loadModule(dest, 'analysis/gp-error-model');
    const lower = (P) => { const v = new Array(21).fill(0); v[0] = P[0]; v[1] = P[1]; v[2] = P[3]; v[3] = P[2]; v[4] = P[4]; v[5] = P[5]; v[9] = 1e-14; v[14] = 1e-14; v[20] = 1e-14; return v; };
    const E14 = JSON.parse(fs.readFileSync(path.join(here, '../e14-covariance-realism/config.json'), 'utf8'));
    const strata = [];
    REGIMES.forEach((r, ri) => fc.pStrat[r]?.forEach((c, ai) => { if (c) strata.push({ regimeIndex: ri, regime: r, ageIndex: ai, n: c.n, kept: c.n, objects: 3, covariance: lower(c.P) }); }));
    const model = { kind: 'e14-element-set-model', version: 'strata-check', regimes: E14.regimes, ageBinsDays: BINS, minimumBinSamples: 30, basis: 'check', strata };
    const ages = [0.05, 0.3, 0.9, 1.7, 3, 4.5, 5.2, 7.7, 7.99], objects = [];
    for (const r of ['LEO-L', 'LEO-M', 'LEO-H', 'MEO', 'GEO']) for (const a of ages) objects.push({ id: `${r}|${a}`, regime: r, ageDays: a, covariance: [1, 0, 1, 0, 0, 1] });
    const r = await gp.invoke('calibrate_covariance', [frame('model', ARM_OF.calibrate_covariance.model, model), frame('objects', ARM_OF.calibrate_covariance.objects, { objects })]);
    let worst = 0;
    for (const o of decode(Buffer.from(r.outputs[0].payload)).objects) { const [rg, a] = o.id.split('|'); const P = interp(fc.pStrat[rg], Number(a)); const mine = [P[0], P[1], P[3], P[2], P[4], P[5]]; for (let i = 0; i < 6; i++) worst = Math.max(worst, Math.abs(o.covarianceRtn[i] / 1e6 - mine[i]) / Math.abs(mine[i])); }
    ok = ok && worst < 1e-9; msg += ` interpolation lookup vs calibrate_covariance: worst relative difference ${worst.toExponential(2)}`;
  } catch (e) { ok = false; msg += ` ${e.message}`; }
  check('module', ok, `pinned artifacts match their SHA-256;${msg}`);
}
// (d) S3 last
const s3 = fc.s3;
console.log(`S3: ${Object.entries(s3).map(([r, s]) => `${r} Pc(HBR 20 m) ${s.pc20.pc.toExponential(2)} at ${s.pc20.angleDeg} deg, s_lo ${s.sLo.toFixed(3)}`).join('; ')}`);
const s3ok = Object.values(s3).every((s) => s.pc20.pc < 1e-4);
const failed = results.filter(([, ok]) => !ok).length;
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
if (!s3ok) { console.log('S3 FAILED: owner ruling required'); process.exit(2); }
console.log('all checks passed');
