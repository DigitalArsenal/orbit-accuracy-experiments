// The modules and environment of one chain, opened once: { ctxFor(fromMs, toMs), pairs, provenance, close }. fitV3's context is C2's (B2 lib/a12.mjs openV3) with C3's pinned build and
// environment; propagator/ffm and analysis/estimation as the experiments' SDK harness hosts them, the $EST schema and FFM's fit domains from the modules checkout, equal to the pin.
// Records and settings only.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, build, sha256 } from '../common.mjs';
import { materialize, hostFile, MODULES, openPairs } from './modules.mjs';
import { openEnvironment } from './environment.mjs';

export const DOMAINS_SHA256 = '7d7bc1d4ccc9d8247962478af229a29948251d12fab9094f7d97ff8f39f478f6';
export const SCHEMA_SHA256 = '38c771916ffe63b1c404bc4d1826d7a85ddf50979d16a5f986f06b002b273aba';

export async function openChain(chain = 'pin', { opened } = {}) {
  const dir = materialize(chain);
  const { loadModule } = await import(path.join(root, 'harness/modules.mjs'));
  const { estimationCodecV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
  const estimation = await loadModule(dir, 'analysis/estimation'), ffm = await loadModule(dir, 'propagator/ffm');
  for (const [rel, m] of [['analysis/estimation', estimation], ['propagator/ffm', ffm]]) if (m.provenance.wasmSha256 !== build[chain].modules[rel].wasmSha256) throw new Error(`${rel} is not ${chain}'s`);
  const domainsFile = hostFile('propagator/ffm/catalog-configuration.mjs'), schemaFile = hostFile('analysis/estimation/schemas/Estimation.fbs');
  if (sha256(fs.readFileSync(domainsFile)) !== DOMAINS_SHA256) throw new Error('FFM fit domains differ from A12 and the pin');
  if (sha256(fs.readFileSync(schemaFile)) !== SCHEMA_SHA256) throw new Error('the $EST schema differs from the pin');
  const { FIT_PARAMETER_DOMAINS: domains } = await import(pathToFileURL(domainsFile));
  const codec = await estimationCodecV3(MODULES, path.join(root, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const env = openEnvironment(opened);
  const pairs = await openPairs(chain);
  return {
    chain, env, pairs,
    provenance: { chain, estimation: estimation.provenance, ffm: ffm.provenance, gem: pairs.provenance, environment: env.provenance },
    ctxFor: (fromMs, toMs) => ({ estimation, ffm, codec, domains, inputs: env.inputsFor(fromMs, toMs) }),
    async close() { for (const m of [estimation, ffm]) await m.destroy?.(); },
  };
}

/** C2's fit settings (run.mjs settingsOf): the seeds, the a priori (AGOM at 100 % of the seed in R3, 30 % in R2), A12's fit controls and forces. */
export function settingsFor(cls, seed, withB, B2C) {
  const F = B2C.part1.starlink.ffm;
  const frac = cls === 'R3' ? 1 : B2C.a12.fit.apriori.parameterFraction;
  const ps = [...(withB ? [{ kind: 'DRAG_AREA_OVER_MASS', value: seed.bSeed ?? seed.areaOverMassM2kg * 2.2 }] : []), { kind: 'SRP_AREA_OVER_MASS', value: seed.agomSeed }];
  const diag = [...Array(3).fill(F.apriori.positionSigmaM ** 2), ...Array(3).fill(F.apriori.velocitySigmaMS ** 2), ...ps.map((q) => (frac * q.value) ** 2)];
  const m = diag.length;
  return { sigmaM: 10, parameters: ps, fixed: withB ? {} : { b: 0 }, apriori: Array.from({ length: m * m }, (_, j) => (Math.floor(j / m) === j % m ? diag[j % m] : 0)), maximumIterations: B2C.a12.fit.maximumIterations, correctionTolerance: B2C.a12.fit.correctionTolerance, sigmaEditThreshold: B2C.a12.fit.sigmaEditThreshold, forces: F.forces, integrator: F.integrator };
}
