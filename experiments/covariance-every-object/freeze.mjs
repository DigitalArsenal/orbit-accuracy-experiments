// Writes results/covariance-every-object/frozen-constants.json. Items that need Part 1 read PENDING with the reason; the file is a freeze only when none do.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..'), res = path.join(repo, 'results/covariance-every-object');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex'), rd = (p) => fs.readFileSync(p);
const code = {}; for (const f of fs.readdirSync(here, { recursive: true }).filter((x) => /\.(mjs|md|json)$/.test(x)).sort()) code[f] = sha(rd(path.join(here, f)));
const part1 = path.join(repo, 'results/gp-covariance-strata/frozen-constants.json'), p1 = fs.existsSync(part1);
const P = (reason) => ({ status: 'PENDING', reason });
const n0 = JSON.parse(rd(path.join(res, 'n0-rows.json')));
const out = {
  status: p1 ? 'READY-TO-FREEZE-CHECK' : 'DRAFT: items marked PENDING await Part 1',
  freezeDeadlineUtc: '2026-11-09T23:59:00Z',
  codeSha256: sha(JSON.stringify(Object.entries(code))), codeFilesSha256: code,
  inputs: { provenanceAuditSha256: sha(rd(path.join(res, 'provenance-audit.json'))), truthObjectsSha256: code['truth-objects.json'], vendorsBlob: 'e9dd6db5b4df53fd9df0132faf59c12cae07947d', sgp4Pins: 'lib/sgp4.mjs PINS (space-data-network-modules origin/main 3ae1eb289)' },
  part1FrozenConstantsSha256: p1 ? sha(rd(part1)) : P('Part 1 results/gp-covariance-strata/frozen-constants.json not yet committed'),
  denominatorsSha256: sha(rd(path.join(res, 'denominators.json'))), devValuesUnderAR: { devPairsManifestSha256: sha(rd(path.join(OUT, 'dev-pairs/MANIFEST.json'))), clusterMomentsSha256: sha(rd(path.join(OUT, 'dev-cluster-moments.json'))) },
  n0: { ...n0, status: n0.status, note: 'No n0 meets both rules on the provisional run, so Part 2 is report-only if that holds at the freeze' },
  admittedBins: P('needs Part 1 dev truth moments by cluster'),
  s2_1: { null: P('needs Part 1 coverage rows'), power: P('needs Part 1 coverage rows') },
  states: { S2_1: 'PENDING', S2_2: 'PENDING', S2_3: 'PENDING' },
  gnssListsFromPart1: P('GNSS NORAD lists and regime edges recomputed against Part 1 when it freezes; any object changing stratum is flagged'),
};
fs.writeFileSync(path.join(res, 'frozen-constants.json'), JSON.stringify(out, null, 1) + '\n');
console.log(out.status);
