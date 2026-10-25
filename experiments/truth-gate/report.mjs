// experiments/truth-gate/REPORT.md from flags.json (scan.mjs) and affected.json (affected.mjs). Formatting only.
//   node experiments/truth-gate/report.mjs
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));

export function render(ledger, affected) {
  const R = ledger.rules;
  const n = (x) => (typeof x === 'number' ? x.toLocaleString('en-US') : '');
  const size = (s) => [s.products != null && `${n(s.products)} products`, s.groups != null && `${n(s.groups)} weekly groups`, s.objects != null && `${n(s.objects)} objects`,
    s.files != null && `${n(s.files)} files`, s.packs != null && `${n(s.packs)} packs`, s.records != null && `${n(s.records)} records`].filter(Boolean).join(', ');
  const dirs = (s) => (s.directories ?? [s.directory]).map((d) => `\`${d}\``).join(', ');
  const L = [];
  L.push('# Truth ingest gate', '');
  L.push('Every truth reader of the experiments passes the states it reads through one gate, `harness/truth-gate.mjs`, before anything is scored against them. '
    + 'The gate drops a state that its ledger (`flags.json`, written by `scan.mjs`) lists for the product and object, and any state that fails the sanity rule. '
    + 'A dropped state is not replaced by an analysis center\'s orbit: a center\'s solution differs from the combination\'s at the meter level, and one missing state is a gap every scorer already handles.', '');
  L.push('## Rules', '');
  L.push(`- **Center rule** (where analysis centers publish the same product): a combination state more than ${R.centerWrongKm} km from the centers' median while the centers agree within ${R.centerAgreeKm * 1000} m.`);
  L.push(`- **Sanity rule**: a position coordinate exactly zero, a position that is not finite, or a position inside the central body.`);
  L.push(`- **Jump rule**: a state whose consistency with both neighbors (the trapezoid residual |r1 − r0 − (v0 + v1) dt / 2|, or the second difference of equally spaced positions) exceeds max(${R.screenFloorKm} km, ${R.screenFactor} × the series' median), gaps over ${R.maximumGapSeconds} s excepted; dropped when the full force model (propagator/ffm) carried from the previous good state misses it by more than ${R.jumpKm} km, reported when there is no confirmation.`, '');
  L.push('## Readers', '');
  L.push('- `harness/reference.mjs` (`ReferenceIndex.frames`, `referenceFramesStartingIn`): E1, E2, E2b, E4, E10, E14; a frame is re-encoded without its dropped states, and returned unchanged when none drops.');
  L.push('- `experiments/e3-combined-catalog/truth.mjs` (`Products.load`): E3, E5, E6, E7, E8, E13, E16, V1c, V1c2 to V1c5, and G1\'s refits.');
  L.push('- `experiments/e14-covariance-realism/common.mjs` (`Truth.frames`), `experiments/e6-public-observations/steps/40-slr-fit.mjs`, `experiments/v1-ffm-physical-truth/seeds.mjs`.');
  L.push('- G1 (`experiments/sdn-gp-starlink-ffm-match/lib/`): `sources.mjs` (reference states, the NASA ISS file, SpaceX MEME files), `iss-oem.mjs` (the NASA ISS archive), `packs.mjs`, `spk-sources.mjs`; through them B1, B2 and the SDN-AP GP-history experiment.');
  L.push('- `experiments/supgp-omm/worker.mjs`: the operator ephemerides it reads as they are fetched (nothing of them is stored, so the scan has no copy to read).');
  L.push('- E2b and E14 also keep their own radius screens; `experiments/etalon2-anomaly` and `scan.mjs` read the files as written.', '');
  L.push('## Sets scanned', '');
  L.push('| Set | Directory | Size | States |', '| --- | --- | --- | ---: |');
  for (const s of ledger.sets) L.push(`| ${s.set} | ${dirs(s)} | ${size(s)} | ${n(s.states)} |`);
  L.push('');
  L.push('## Flagged states', '');
  L.push(`${affected.states.length} states, ${ledger.flags.length} ledger entries: every state is found by the center rule and by the jump rule, and the 2026-10-10 week is held in two truth copies. All are single 00:00 states of the ILRS combined weekly orbits at which the combination wrote a coordinate as 0 (experiments/etalon2-anomaly).`, '');
  L.push('| Product | NORAD | Epoch | Rules | Miss, km | Action |', '| --- | ---: | --- | --- | ---: | --- |');
  for (const s of affected.states) L.push(`| ${s.product} | ${s.norad} | ${s.epoch.replace('.000Z', 'Z')} | ${s.rules.join(', ')} | ${s.missKm.toFixed(3)} | drop |`);
  const reports = ledger.flags.filter((f) => f.action === 'report');
  L.push('', reports.length ? `${reports.length} states were screened without a confirmation and are reported, not dropped.` : 'No state was screened without a confirmation.', '');
  L.push('## Results the drops reach', '');
  L.push(`The smallest miss of a dropped state is ${affected.smallestMissKm.toFixed(3)} km.`, '');
  L.push('| Experiment | Truth | Dropped states in its windows | Evidence | Verdict |', '| --- | --- | ---: | --- | --- |');
  for (const r of affected.experiments) {
    const extra = r.largestAllowedErrorKm != null ? `; largest single error allowed: ${r.largestAllowedErrorKm} km (${r.cell})` : r.largestErrorKm ? `; largest error: ${Object.entries(r.largestErrorKm).map(([w, v]) => `${v} km (${w})`).join(', ')}` : '';
    L.push(`| ${r.experiment} | ${r.truth} | ${r.drops.length} | ${r.check}${extra} | ${r.verdict} |`);
  }
  L.push('');
  L.push('V1c4\'s and V1c5\'s published READMEs are rendered from their metrics and checked by their own end-to-end checks, so their labels are kept here and in `experiments/etalon2-anomaly/FINDINGS.md`.', '');
  L.push('## Reproduce', '');
  L.push('```');
  L.push('SDN_MODULES_ROOT=<modules checkout> node experiments/truth-gate/scan.mjs --only <part>   # centers, reference, iss, packs, spk, capture');
  L.push('node experiments/truth-gate/scan.mjs --merge');
  L.push('node experiments/truth-gate/affected.mjs');
  L.push('node experiments/truth-gate/report.mjs');
  L.push('node experiments/truth-gate/check.mjs   # end-to-end check');
  L.push('```', '');
  return `${L.join('\n')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  fs.writeFileSync(path.join(here, 'REPORT.md'), render(read('flags.json'), read('affected.json')));
  console.error('experiments/truth-gate/REPORT.md');
}
