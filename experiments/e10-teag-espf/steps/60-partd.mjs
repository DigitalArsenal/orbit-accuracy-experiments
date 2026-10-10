// Part D (PLAN.md section 3, amendment 1): possibility and necessity of
// collision against Foster's Pc on synthetic short-term encounters, and the
// same error draws through analysis/gp-error-model screening_cases. Drawing
// encounters, framing requests and counting alerts only; Pc, possibility,
// necessity and the screening rules are the modules'.
//   node steps/60-partd.mjs [--encounters N]
import fs from 'node:fs';
import * as flatbuffers from 'flatbuffers';
import { CQR, CQRT, CQRProbabilityRequestT, CQRPlaneGeometryT, cqrProbabilityAlgorithm } from 'spacedatastandards.org/lib/js/CQR/main.js';
import { config, configPath, assertReadable, loadModules, modulesDir, rng, cholesky } from '../common.mjs';
import { arg } from '../jobs.mjs';
import { startRun } from '../../../harness/provenance.mjs';

assertReadable('test');
const d = config.partD, N = Number(arg('encounters', d.encounters));
const run = startRun({ experiment: 'e10-teag-espf', step: '60-partd', configPath, modulesDir: modulesDir(), args: { encounters: N } });
const { loaded } = await loadModules(run, ['analysis/conjunction-assessment', 'analysis/gp-error-model']);
const ca = loaded['analysis/conjunction-assessment'], gp = loaded['analysis/gp-error-model'];
const g = rng(d.seed), R = d.hardBodyRadiusM;
const logUniform = ([a, b]) => Math.exp(Math.log(a) + g.next() * (Math.log(b) - Math.log(a)));
const unit = () => { const z = [g.normal(), g.normal(), g.normal()]; const n = Math.hypot(...z); return z.map((v) => v / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };

// Foster's Pc on the encounter plane (compute_pc, CQR).
async function fosterPc(miss, c2) {
  const b = new flatbuffers.Builder(256);
  const record = new CQRT();
  record.PROBABILITY_REQUEST = new CQRProbabilityRequestT(new CQRPlaneGeometryT(miss[0], miss[1], c2[0], c2[1], c2[3], R), cqrProbabilityAlgorithm.FOSTER);
  CQR.finishCQRBuffer(b, record.pack(b));
  const response = await ca.invoke('compute_pc', [{ portId: 'request', typeRef: { schemaName: 'CQR.fbs', fileIdentifier: '$CQR', rootTypeName: 'CQR', wireFormat: 'flatbuffer' }, payload: b.asUint8Array() }]);
  if (response.statusCode !== 0) throw new Error(`compute_pc: ${response.errorMessage}`);
  return CQR.getRootAsCQR(new flatbuffers.ByteBuffer(new Uint8Array(response.outputs[0].payload))).unpack().PROBABILITY_RESULT.PROBABILITY;
}
// Possibility and necessity of collision (possibility_of_collision, mode 1).
async function possibility(state, shape) {
  const tiny = Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? 1e-12 : 0));
  const doubles = [...state, ...shape, 0, 0, 0, 0, 0, 0, ...tiny];
  const bytes = new ArrayBuffer(4 + 16 + 16 + 8 * doubles.length);
  const v = new DataView(bytes);
  new Uint8Array(bytes, 0, 4).set([0x43, 0x50, 0x51, 0x31]);
  let at = 4;
  const f64 = (x) => { v.setFloat64(at, x, true); at += 8; };
  const u32 = (x) => { v.setUint32(at, x, true); at += 4; };
  f64(R); f64(600); u32(1); u32(1); u32(1); u32(0);
  doubles.forEach(f64);
  const response = await ca.invoke('possibility_of_collision', [{ portId: 'request', typeRef: { wireFormat: 'flatbuffer', mediaType: 'application/vnd.sdn.ca-possibility-request' }, payload: new Uint8Array(bytes) }]);
  if (response.statusCode !== 0) throw new Error(`possibility_of_collision: ${response.errorMessage}`);
  const out = new DataView(new Uint8Array(response.outputs[0].payload).slice().buffer);
  return { possibility: out.getFloat64(4, true), necessity: out.getFloat64(12, true) };
}

const encounters = [], pairs = [];
let pcSeconds = 0, possibilitySeconds = 0;
for (let k = 0; k < N; ++k) {
  const sigma = [logUniform(d.sigmaRangesM.R), logUniform(d.sigmaRangesM.T), logUniform(d.sigmaRangesM.N)];
  const u = unit();
  const xi = norm(cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), zeta = cross(u, xi);
  // The encounter-plane covariance B' C B, B = [xi zeta], C = diag(sigma^2).
  const c2 = [xi, zeta].flatMap((a) => [xi, zeta].map((b) => a.reduce((s, x, i) => s + x * b[i] * sigma[i] ** 2, 0)));
  const collision = g.next() < d.collisionFraction;
  const r = collision ? R * Math.sqrt(g.next()) : Math.sqrt(d.annulusM[0] ** 2 + g.next() * (d.annulusM[1] ** 2 - d.annulusM[0] ** 2));
  const theta = 2 * Math.PI * g.next();
  const understated = g.next() < d.understatedFraction;
  const scale = understated ? Math.sqrt(d.understatedVarianceScale) : 1;
  const l = cholesky(c2, 2);
  const z = [g.normal(), g.normal()];
  const miss = [r * Math.cos(theta) + scale * l[0] * z[0], r * Math.sin(theta) + scale * (l[2] * z[0] + l[3] * z[1])];
  const position = [0, 1, 2].map((i) => miss[0] * xi[i] + miss[1] * zeta[i]);
  const shape = Array.from({ length: 36 }, (_, i) => { const a = Math.floor(i / 6), b = i % 6; return a < 3 && b < 3 ? (a === b ? sigma[a] ** 2 : 0) : a === b ? 1e-12 : 0; });
  let t = process.hrtime.bigint();
  const pc = await fosterPc(miss, c2);
  pcSeconds += Number(process.hrtime.bigint() - t) / 1e9;
  t = process.hrtime.bigint();
  const p = await possibility([...position, ...u.map((x) => x * d.relativeSpeedMps)], shape);
  possibilitySeconds += Number(process.hrtime.bigint() - t) / 1e9;
  encounters.push({ collision, understated, pc, possibility: p.possibility, necessity: p.necessity });
  // screening_cases: each object half the combined covariance and its own draw.
  const half = sigma.map((s) => s * s / 2e6);
  const e = () => sigma.map((s) => (scale * s * g.normal()) / Math.SQRT2 / 1000);
  pairs.push({ e1: e(), e2: e(), c1: [half[0], 0, half[1], 0, 0, half[2]], c2: [half[0], 0, half[1], 0, 0, half[2]] });
}
// Alerts by rule and threshold: missed collisions and false alerts.
const rules = [
  ...d.pcThresholds.map((x) => ({ name: `Pc ≥ ${x}`, alert: (e) => e.pc >= x })),
  ...d.possibilityThresholds.map((x) => ({ name: `Π ≥ ${x}`, alert: (e) => e.possibility >= x })),
  { name: 'N > 0', alert: (e) => e.necessity > 0 },
];
const count = (list, f) => list.filter(f).length;
const table = rules.map((rule) => {
  const row = { rule: rule.name };
  for (const [name, list] of [['all', encounters], ['declared', encounters.filter((e) => !e.understated)], ['understated', encounters.filter((e) => e.understated)]]) {
    const collisions = list.filter((e) => e.collision), misses = list.filter((e) => !e.collision);
    row[name] = { collisions: collisions.length, missed: count(collisions, (e) => !rule.alert(e)), nonCollisions: misses.length, falseAlerts: count(misses, rule.alert) };
  }
  return row;
});
const screening = await gp.invoke('screening_cases', [
  { portId: 'cases', typeRef: { wireFormat: 'flatbuffer', mediaType: 'application/json' }, payload: new TextEncoder().encode(JSON.stringify({ pairs })) },
  { portId: 'options', typeRef: { wireFormat: 'flatbuffer', mediaType: 'application/json' }, payload: new TextEncoder().encode(JSON.stringify({ hardBodyRadiusM: R, pcThreshold: 1e-4 })) },
]);
const screeningReport = screening.statusCode === 0 ? JSON.parse(new TextDecoder().decode(screening.outputs.find((o) => o.portId === 'report').payload)) : { error: screening.errorMessage };
const pctOf = (a, b) => (b ? `${a}/${b} (${((100 * a) / b).toFixed(1)} %)` : '—');
const reportLines = [
  `${N} encounters (seed ${d.seed}); hard-body radius ${R} m; ${count(encounters, (e) => e.collision)} true collisions; ${count(encounters, (e) => e.understated)} with the error drawn from 9 × the declared covariance. Time per evaluation: Foster Pc ${(1e6 * pcSeconds / N).toFixed(0)} µs, possibility ${(1e6 * possibilitySeconds / N).toFixed(0)} µs.`, '',
  '| Rule | Missed collisions (all) | False alerts (all) | Missed (declared) | False alerts (declared) | Missed (understated) | False alerts (understated) |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...table.map((r) => `| ${r.rule} | ${pctOf(r.all.missed, r.all.collisions)} | ${pctOf(r.all.falseAlerts, r.all.nonCollisions)} | ${pctOf(r.declared.missed, r.declared.collisions)} | ${pctOf(r.declared.falseAlerts, r.declared.nonCollisions)} | ${pctOf(r.understated.missed, r.understated.collisions)} | ${pctOf(r.understated.falseAlerts, r.understated.nonCollisions)} |`),
  '', 'The same error draws (each object half the combined covariance) through `analysis/gp-error-model` `screening_cases` (its own geometries and miss distances; its report in `metrics.json`).',
];
const summary = { encounters: N, table, timing: { pcMicroseconds: (1e6 * pcSeconds) / N, possibilityMicroseconds: (1e6 * possibilitySeconds) / N }, screeningCases: screeningReport, reportLines };
run.write('summary.json', summary);
run.finish({ encounters: N });
console.log(reportLines.join('\n'));
