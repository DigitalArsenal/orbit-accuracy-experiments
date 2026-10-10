// Synthetic segments from the reference engines (PLAN.md section 7, the
// beyond-HPOP set): config.synthetic.reference.cases names an engine
// (orekit | gmat), its force configuration, and either the HPOP hypothesis
// that is the same physics (`hpop`, a positive control) or none (a model HPOP
// lacks). The engine's GCRF states are written as EME2000/UTC to the case's
// digits. Synthetic only; routing and rounding.
import path from 'node:path';
import { repoRoot } from '../../../harness/provenance.mjs';
import { DEFAULT, validate } from '../hypothesis.mjs';
import { isoOf, DAY_MS } from '../environment.mjs';

const engines = {
  orekit: async () => (await import('./orekit-truth.mjs')).orekitTruth,
  gmat: async () => (await import('./gmat-truth.mjs')).gmatTruth,
};

export async function referenceSegment(env, c, config, run) {
  const epochMs = Date.parse(c.epoch);
  const n = Math.round((c.spanDays * DAY_MS) / (c.stepSeconds * 1000));
  const samples = Array.from({ length: n }, (_, k) => isoOf(epochMs + (k + 1) * c.stepSeconds * 1000));
  const truthOf = await engines[c.engine]();
  const workDir = path.join(run.dir, `engine-${c.id}`);
  const out = await truthOf([{ id: c.id, epoch: c.epoch, state: c.state, samples, forces: c.forces, integrator: c.integrator }], { workDir });
  run.write(`engine-${c.id}-provenance.json`, out.provenance);
  const states = out.cases[0].samples;
  const gcrf = [{ epoch: c.epoch, position: c.state.slice(0, 3), velocity: c.state.slice(3) }, ...states.map((s) => ({ epoch: s.epoch.endsWith('Z') ? s.epoch : `${s.epoch}Z`, position: s.state.slice(0, 3), velocity: s.state.slice(3) }))];
  const written = await env.fromGcrf(gcrf, 'EME2000', 'UTC', 'FINALS');
  const q = c.quantumM ?? 1e-6, round = (x, u) => Math.round(x / u) * u;
  const segment = {
    id: `ref-${c.id}`, regime: c.regime, label: { frame: 'EME2000', timeScale: 'UTC' }, cutoffMs: epochMs,
    points: written.map((p) => ({ epoch: p.epoch, position: p.position.map((x) => round(x, q)), velocity: p.velocity.map((x) => round(x, q / 1000)) })),
  };
  const truth = c.hpop ? validate({ ...DEFAULT, ...c.hpop }) : { inHpop: false, engine: c.engine, description: c.description, forces: c.forces };
  return { segment, truth };
}
