// S2 (HPOP products, PLAN.md section 4): the CA screen's HPOP product - analysis/epoch-state's GCRF state at an
// element set's epoch, propagated by propagator/hpop 1.2.0's execution path with the full force model on the drivers
// released at the set's creation - and the environment frames it reads. Encoding, decoding and selection of
// published rows only; every number is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '../../harness/modules.mjs';
import { kernelFrame } from '../../harness/prw.mjs';
import { c04Records, eopFrame } from '../../harness/eop.mjs';
import { releasedEopRecords, readRsga, releasedSpwRows } from '../../harness/cutoff-environment.mjs';
import { readGfzKp, spaceWeatherFrame, executionFrame, decodeSamples } from '../../harness/full-force.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { config, DAY_MS, moduleOf } from './common.mjs';

export const KERNEL = { path: '/opt/data/sdn-archive/hac/naif-kernels/spk/planets/de440s.bsp', sha256: 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2' };
export const EOP_C04 = '/opt/data/sdn-archive/reference-states/products/eopc04.1962-now';
// The catalog HPOP run's assumptions (propagator/hpop 1.3.0 catalog.mjs): Cd*A/m from B* (2 B* / rho0, rho0 =
// 2.461e-5 XKMPER kg/m^2/ER), 0.01 m^2/kg where B* <= 0; Cr*A/m 0.02 m^2/kg for every object.
export const BSTAR_TO_B = 12.741621;
export const B_NONPOSITIVE = 0.01;
export const AGOM = 0.02;

export async function s2Context(modules, run) {
  const kernelBytes = fs.readFileSync(KERNEL.path);
  if (sha256(kernelBytes) !== KERNEL.sha256) throw new Error('DE440s kernel bytes differ from the pinned SHA-256');
  run.addInputs('kernel', { 'de440s.bsp': KERNEL.sha256 });
  const m = {};
  for (const name of ['analysis/epoch-state', 'analysis/gp-error-model', 'propagator/hpop', 'data-source/eop-parser']) m[name.split('/')[1]] = await moduleOf(modules, name, run);
  const eop = await c04Records(m['eop-parser'], EOP_C04);
  run.addInputs('eop', { [path.basename(EOP_C04)]: eop.sha256 });
  const gfz = readGfzKp(config.inputs.gfzKp);
  run.addInputs('gfz', { [path.basename(config.inputs.gfzKp)]: gfz.sha256 });
  const W = path.join(config.inputs.rsga, 'warehouse');
  const rsga = readRsga([...fs.readdirSync(W).filter((n) => /^\d{4}_RSGA\.tar\.gz$/.test(n)).map((n) => path.join(W, n)), path.join(W, '2026', 'RSGA')], path.join(repoRoot, 'runs', 'cache', 'e14-rsga'));
  run.addInputs('rsga', rsga.files);
  const kernel = kernelFrame(kernelBytes);
  const mjd = (ms) => Math.floor(ms / DAY_MS) + 40587;
  return {
    ...m, gfz, rsga,
    // Environment frames for a propagation over [fromMs, toMs] as released at cutoffMs (the set's creation).
    // Daily space weather only with drag (propagator/hpop refuses it otherwise).
    inputsFor(fromMs, toMs, cutoffMs, { drag = true } = {}) {
      const from = mjd(fromMs) - 2, to = mjd(toMs) + 2;
      const eopRecords = releasedEopRecords(eop.records, cutoffMs, 1, from, to);
      if (!drag) return { frames: [kernel, eopFrame(eopRecords, from, to)], issue: null };
      const spw = releasedSpwRows(gfz, rsga, cutoffMs, fromMs - 3 * DAY_MS, toMs + 2 * DAY_MS);
      return { frames: [kernel, eopFrame(eopRecords, from, to), spaceWeatherFrame(spw.rows)], issue: spw.issue };
    },
  };
}

// Cd*A/m of an element set by the catalog rule.
export const bOf = (set) => (set.elements.BSTAR > 0 ? set.elements.BSTAR * BSTAR_TO_B : B_NONPOSITIVE);

// One execution request (full force, config.s2) and its decoded samples.
export async function propagate(ctx, { epoch, state, samples, b, cutoffMs, parameters = [], covariance = null, noise = null, stm = false, forces = config.s2.forces }) {
  const f = forces;
  const fromMs = Date.parse(`${epoch}Z`), toMs = Date.parse(`${samples.at(-1)}Z`);
  const { frames } = ctx.inputsFor(Math.min(fromMs, ...samples.map((s) => Date.parse(`${s}Z`))), toMs, cutoffMs, { drag: !!f.drag });
  const request = executionFrame({ epoch, state, samples, forces: f, integrator: config.s2.integrator, coefficients: { b, agom: AGOM },
    parameters, covariance, noise, stm });
  return decodeSamples(await ctx.hpop.invoke('invoke', [request, ...frames]));
}

// Row-major n x n -> the 6x6 state block; and its position block in hpop_coverage's order (xx, xy, xz, yy, yz, zz).
export const stateBlock = (values, n) => Array.from({ length: 36 }, (_, k) => values[n * Math.floor(k / 6) + (k % 6)]);
export const positionBlock = (m6) => [m6[0], m6[1], m6[2], m6[7], m6[8], m6[14]];
// The STM's state block and the sensitivity column of parameter j (rows 0..5) from a row-major (6 + p)^2 STM.
export const stmBlock = (stm, n) => stateBlock(stm, n);
export const sensitivity = (stm, n, j) => Array.from({ length: 6 }, (_, r) => stm[n * r + 6 + j]);
