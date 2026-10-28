// C2 pre-check P5 (PLAN.md 3.8): FFM build parity. On 5 ISS v3 fits (iss-fit rows, the first 5 converged by file name): the fitted
// product carried 72 h past E (at every hour) by propagator/ffm 2.0.0 (B2's c860a072 build, A12's links) and by 2.0.1 (modules
// f54b5107e): the states must be identical; and both builds run with A5's covariance x 4 plus PROCESS_NOISE (q = 1e-9 m^2/s^3 on R,
// T and N, 600 s) must return every covariance (none refused). Records and comparisons only.
//   node experiments/ffm-covariance-calibration/precheck-p5.mjs
import fs from 'node:fs';
import path from 'node:path';
import { frozen, Opened, writeReceipt, store, HOUR, iso, root, sha256 } from './common.mjs';
import { b2 } from './lib/precise.mjs';

frozen();
const opened = new Opened();
const B2C = JSON.parse(opened.read(b2('config.json'), 'B2 config'));
const F = B2C.part1.starlink.ffm;
const { executionFrame, decodeSamples } = await import(path.join(root, 'harness/ffm-execution.mjs'));
const { loadModule } = await import(path.join(root, 'harness/modules.mjs'));
const { openV3 } = await import(b2('lib/a12.mjs'));
const v3 = await openV3(); // 2.0.0 and its environment
const NEW = '/Users/tj/software/worktrees/space-data-network-modules--experiments-b2-ffm-iss-starlink-20261026-a12';
const ffm201 = await loadModule(NEW, 'propagator/ffm');
const rowsDir = path.join(store, 'rows');
const rows = fs.readdirSync(rowsDir).filter((f) => f.startsWith('iss-fit.')).flatMap((f) => fs.readFileSync(opened.add(path.join(rowsDir, f), 'iss-fit rows'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  .filter((r) => r.fit?.ok).sort((a, b) => (a.file < b.file ? -1 : 1)).slice(0, 5);
const out = [];
for (const r of rows) {
  const E = Date.parse(r.E);
  const samples = Array.from({ length: 73 }, (_, h) => iso(E + h * HOUR));
  const ctx = v3.ctxFor(Date.parse(r.fit.epoch), E + 72 * HOUR);
  const req = (extra) => executionFrame({ epoch: r.fit.epoch, state: r.fit.state, samples, forces: F.forces, parameters: r.fit.parameters, fixed: {}, stm: false, covariance: null, noise: null, integrator: F.integrator, ...extra });
  const run = async (m, extra) => { try { return { ok: true, s: decodeSamples(await m.invoke('invoke', [req(extra), ...ctx.inputs])) }; } catch (e) { return { ok: false, error: String(e.message).slice(0, 200) }; } };
  const a = await run(v3.ctx?.ffm ?? ctx.ffm, {}), b = await run(ffm201, {});
  const identical = a.ok && b.ok && a.s.every((x, i) => x.state.every((v, k) => v === b.s[i].state[k]));
  const maxDiff = a.ok && b.ok ? Math.max(...a.s.flatMap((x, i) => x.state.slice(0, 3).map((v, k) => Math.abs(v - b.s[i].state[k])))) : null;
  const cov = r.fit.covariance.map((x) => x * 4 * Math.max(1, r.fit.reducedChiSquare));
  const noisy = { covariance: cov, noise: { q: [1e-9, 1e-9, 1e-9], intervalSeconds: 600 } };
  const an = await run(ctx.ffm, noisy), bn = await run(ffm201, noisy);
  const refused = (x) => (!x.ok ? 'run refused' : x.s.filter((s) => !s.covariance || s.covariance.some((v) => !Number.isFinite(v))).length);
  out.push({ file: r.file, E: r.E, statesIdentical: identical, maxPositionDifferenceM: maxDiff, errors: [a, b].filter((x) => !x.ok).map((x) => x.error),
    noisyCovariancesMissing: { v200: refused(an), v201: refused(bn) }, noisyCovarianceIdentical: an.ok && bn.ok && an.s.every((x, i) => x.covariance.every((v, k) => v === bn.s[i].covariance[k])) });
}
const pass = out.length === 5 && out.every((o) => o.statesIdentical && o.noisyCovariancesMissing.v200 === 0 && o.noisyCovariancesMissing.v201 === 0);
console.log(writeReceipt('precheck-P5', {
  plan: '3.8 P5', builds: { v200: { commit: B2C.a12.ffm.modulesCommit, wasmSha256: B2C.a12.ffm.wasmSha256 }, v201: { commit: 'f54b5107efc06ff1090e3c48681e28c35b732ff2', wasmSha256: ffm201.provenance.wasmSha256 } },
  settings: { samples: 'E to E + 72 h hourly', integrator: F.integrator, forces: F.forces, noise: 'q = 1e-9 m^2/s^3 R, T, N, 600 s; A5 covariance x 4' }, windows: out, outcome: pass ? 'pass' : 'FAIL',
}, opened));
await v3.close();
await ffm201.destroy?.();
process.exit(0);
