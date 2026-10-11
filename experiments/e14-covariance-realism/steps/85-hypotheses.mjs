#!/usr/bin/env node
// E14 step 85: the verdicts of H1-H8 (PLAN.md section 9) from the realism files of the test windows and the choice in
// results/e14/selection.json. H8 runs the known-answer test. Writes results/e14/hypotheses.json.
//
//   node experiments/e14-covariance-realism/steps/85-hypotheses.mjs [--modules <modules checkout>]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot } from '../../../harness/modules.mjs';
import { config, writeJson } from '../common.mjs';
import { parseArgs } from 'node:util';
import { assertWindowReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { modules: { type: 'string' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const read = (rel) => (fs.existsSync(path.join(repoRoot, rel)) ? JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8')) : null);
const selection = read('results/e14/selection.json');
const partly = config.realism.partlyShare;
const cellsOf = (t) => Object.entries(t ?? {}).flatMap(([regime, byH]) => Object.entries(byH).map(([h, c]) => ({ regime, horizon: h, ...c })));
const testable = (t) => cellsOf(t).filter((c) => c.decision !== 'INSUFFICIENT');
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const allRealistic = (t) => {
  const c = testable(t), r = c.filter((x) => x.decision === 'REALISTIC').length;
  return { testable: c.length, realistic: r, share: c.length ? r / c.length : null,
    verdict: !c.length ? 'INSUFFICIENT' : r === c.length ? 'SUPPORTED' : r / c.length >= partly ? 'PARTLY' : 'NOT SUPPORTED' };
};
const versus = (chosen, base) => {
  const lnm = (t) => median(testable(t).map((c) => Math.abs(Math.log(c.meanD2Over3.estimate))));
  const a = { realistic: testable(chosen).filter((c) => c.decision === 'REALISTIC').length, medianAbsLnMeanD2Over3: lnm(chosen) };
  const b = { realistic: testable(base).filter((c) => c.decision === 'REALISTIC').length, medianAbsLnMeanD2Over3: lnm(base) };
  const ok = a.medianAbsLnMeanD2Over3 !== null && b.medianAbsLnMeanD2Over3 !== null;
  return { chosen: a, base: b, verdict: !ok ? 'INSUFFICIENT' : a.realistic > b.realistic && a.medianAbsLnMeanD2Over3 < b.medianAbsLnMeanD2Over3 ? 'SUPPORTED' : 'NOT SUPPORTED' };
};
const out = { experiment: config.experiment, selection: selection && { S1: selection.sources.S1?.byOperator ?? null, S2: selection.sources.S2?.candidate, S3: selection.sources.S3?.candidate, S4: selection.sources.S4?.shrinkage }, hypotheses: {} };
const H = out.hypotheses;

assertWindowReadable('test');
const s3 = read('results/e14/test/s3-realism.json'), s2 = read('results/e14/test/s2-realism.json'), s4 = read('results/e14/test/s4-density.json');
if (s3) H.H1 = { source: 'S3', candidate: selection.sources.S3.candidate, ...allRealistic(s3.candidates[selection.sources.S3.candidate].primary) };
if (s2) H.H2 = { source: 'S2', candidate: selection.sources.S2.candidate, ...allRealistic(s2.candidates[selection.sources.S2.candidate].primary) };
H.H4 = {};
if (s3) H.H4.S3 = versus(s3.candidates[selection.sources.S3.candidate].primary, s3.candidates['S3-T'].primary);
if (s2) H.H4.S2 = versus(s2.candidates[selection.sources.S2.candidate].primary, s2.candidates['S2-P0'].primary);
if (s2?.h5) {
  const cand = `S2-QCD:${selection.sources.S4.shrinkage}`;
  H.H5 = { candidate: cand, ...s2.h5.shrinkage[cand], subset: { n: s2.h5.n, objects: s2.h5.objects, byReason: s2.h5.byReason }, verdict: s2.h5.shrinkage[cand]?.decision ?? 'INSUFFICIENT' };
}
if (s4) {
  const leads = [1, 2, 3].map((k) => s4.leads[k]);
  H.H6 = { leads: leads.map((l, i) => ({ lead: i + 1, n: l.n, satellites: l.satellites, coverage95: l.coverage95, supported: l.supported })),
    verdict: leads.some((l) => l.supported === null) ? 'INSUFFICIENT' : leads.every((l) => l.supported) ? 'SUPPORTED' : 'NOT SUPPORTED' };
}
// S1 (H3, H4, H7) once its test window opens (2026-10-24).
let s1test = null;
try { assertWindowReadable('s1:test'); s1test = read('results/e14/s1-test/s1-realism.json'); } catch (e) { H.H3 = { verdict: 'PENDING', reason: e.message }; }
if (s1test) {
  H.H3 = {};
  for (const [operator, c] of Object.entries(selection.sources.S1.byOperator)) {
    H.H3[operator] = { candidate: c.candidate, ...allRealistic(s1test.candidates[c.candidate]?.[operator]?.table) };
    H.H4[`S1:${operator}`] = versus(s1test.candidates[c.candidate]?.[operator]?.table, s1test.candidates['S1-0']?.[operator]?.table);
  }
}
const h7 = (r) => ['0.25', '0.5', '1'].map((h) => {
  const c = cellsOf(r?.candidates?.['S1-0']?.starlink?.table).filter((x) => x.horizon === h);
  const z = c.filter((x) => x.z).map((x) => ({ n: x.n, zT2: x.z[1].rms ** 2 }));
  const n = z.reduce((a, x) => a + x.n, 0);
  return { horizon: h, n, meanZT2: n ? z.reduce((a, x) => a + x.n * x.zT2, 0) / n : null };
});
const dev = read('results/e14/s1-devSelect/s1-realism.json');
H.H7 = { dev: dev ? h7(dev) : null, test: s1test ? h7(s1test) : null };
H.H7.verdict = !H.H7.dev || !H.H7.test ? 'PENDING' : [...H.H7.dev, ...H.H7.test].every((x) => x.meanZT2 !== null && x.meanZT2 < 0.8) ? 'SUPPORTED' : 'NOT SUPPORTED';
// H8: the known-answer test.
try {
  const log = execFileSync(process.execPath, ['--test', '--test-reporter=tap', path.join(repoRoot, 'test/e14-known-answer.test.mjs')], { encoding: 'utf8', env: { ...process.env, SDN_MODULES_ROOT: modules } });
  H.H8 = { verdict: /^# fail 0$/m.test(log) && /^# skipped 0$/m.test(log) ? 'SUPPORTED' : /^# fail 0$/m.test(log) ? 'INSUFFICIENT (skipped)' : 'NOT SUPPORTED',
    summary: log.split('\n').filter((l) => /^\s*# (?!Subtest|duration_ms|suites|cancelled|todo)/.test(l)).map((l) => l.trim()).slice(0, 30) };
} catch (e) {
  H.H8 = { verdict: 'NOT SUPPORTED', summary: String(e.stdout ?? e.message).split('\n').filter((l) => /^# (tests|pass|fail|skipped)|not ok/.test(l)) };
}
writeJson(path.join(repoRoot, 'results/e14/hypotheses.json'), out);
console.log(JSON.stringify(out, null, 1));
