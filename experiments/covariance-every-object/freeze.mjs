// Writes results/covariance-every-object/frozen-constants.json. Items that need Part 1 read PENDING with the reason; the file is a freeze only when none do.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..'), res = path.join(repo, 'results/covariance-every-object');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex'), rd = (p) => fs.readFileSync(p);
const code = {}; for (const f of fs.readdirSync(here, { recursive: true }).filter((x) => /\.(mjs|md|json)$/.test(x)).sort()) code[f] = sha(rd(path.join(here, f)));
const part1 = path.join(repo, 'results/gp-covariance-strata/frozen-constants.json'), p1 = fs.existsSync(part1);
const P1SRC = process.argv[2], part1Raw = P1SRC ? rd(P1SRC) : null;
const adm = JSON.parse(rd(path.join(res, 'admission.json'))), devS2 = JSON.parse(rd(path.join(res, 'dev-s2.json')));
const admittedBins = Object.entries(adm.cells).flatMap(([c, v]) => v.filter((x) => x.admittedBySD).map((x) => `${c}|${x.axis}`));
const P = (reason) => ({ status: 'PENDING', reason });
const n0 = JSON.parse(rd(path.join(res, 'n0-rows.json')));
const out = {
  status: p1 ? 'READY-TO-FREEZE-CHECK' : 'DRAFT: items marked PENDING await Part 1',
  owner: { o5: 'yes', answeredBy: 'owner, 2026-11-03', recordedBy: 'coordinator message 2026-11-04: the collectors backfill the truth feeds (first backfill 2026-11-04 03:40-03:46 UTC, daily reseal; seal manifests /opt/data/sdn-archive/reference-states/seal/latest.json)', o1_o4: 'Part 1 defaults unless the task record says otherwise', note: 'Part 1\'s frozen-constants.json still carries o5 false at 4bd8021; the pin is re-taken at its ready-to-freeze' },
  freezeDeadlineUtc: '2026-11-09T23:59:00Z',
  codeSha256: sha(JSON.stringify(Object.entries(code))), codeFilesSha256: code,
  inputs: { provenanceAuditSha256: sha(rd(path.join(res, 'provenance-audit.json'))), truthObjectsSha256: code['truth-objects.json'], vendorsBlob: 'e9dd6db5b4df53fd9df0132faf59c12cae07947d', sgp4Pins: 'lib/sgp4.mjs PINS (space-data-network-modules origin/main 3ae1eb289)' },
  part1FrozenConstantsSha256: part1Raw ? { sha256: sha(part1Raw), source: `origin wip/experiments-gp-covariance-strata-20261103/claude-gpstrata-d9 ${process.argv[3] ?? '4bd8021'}`, devRowsManifestSha256: JSON.parse(part1Raw).devRows.manifestSha256, devRowsFiles: JSON.parse(part1Raw).devRows.files, provisional: true, note: 'Re-pinned after Part 1 adds its s3.ruling field; the pin in the committed freeze is the one in Part 1\'s final results/gp-covariance-strata/frozen-constants.json' } : p1 ? sha(rd(part1)) : P('Part 1 results/gp-covariance-strata/frozen-constants.json not yet committed'),
  denominatorsSha256: sha(rd(path.join(res, 'denominators.json'))), devValuesUnderAR: { devPairsManifestSha256: sha(rd(path.join(OUT, 'dev-pairs/MANIFEST.json'))), clusterMomentsSha256: sha(rd(path.join(OUT, 'dev-cluster-moments.json'))) },
  devResultsComputedOn: 'Part 1 dev rows at 4bd8021 (113 objects); re-run on the rewritten archive (aa4f90e) before the freeze',
  n0: { ...n0, status: n0.status, note: 'No n0 meets both rules on the provisional run, so Part 2 is report-only if that holds at the freeze' },
  admittedBins: { rule: 'SD of ln(pair/truth moment) over >= 3 clusters <= 0.35 (admission.json), then the S2.1 null condition', admittedBySD: admittedBins, count: admittedBins.length, of: Object.keys(adm.cells).length * 3, s21NullFalsePositive: devS2.s21Null, afterNullCondition: devS2.s21Null <= 0.05 ? admittedBins : [] },
  s2_1: { null: devS2.s21Null, power: devS2.s21Power, flaggedClusters: devS2.flaggedClusters, params: devS2.params },
  devS2: { s21: devS2.s21, s22: devS2.s22, s23: devS2.s23, note: 'on Part 1 dev rows, for the freeze record; the states below are PENDING until each stratum\'s open date' },
  states: { S2_1: 'PENDING', S2_2: 'PENDING', S2_3: 'PENDING' },
  listsAndRegimes: 'Part 1 placements (amendment 14); objects with pairs outside their Part 1 regime are listed in the README',
};
fs.writeFileSync(path.join(res, 'frozen-constants.json'), JSON.stringify(out, null, 1) + '\n');
console.log(out.status);
