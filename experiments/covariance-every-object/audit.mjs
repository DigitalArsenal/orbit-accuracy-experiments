// Provenance audit (acceptance d) over the dev index and dev pairs under AR. Writes results/covariance-every-object/provenance-audit.json (counts only).
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs'; import { TRUTH, C2_HELD_NORADS, C2_CUTOFF, ISS_HOLD, SWARM_HOLD, PREDICATES, pathHeld } from './lib/hold.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), dev = path.join(OUT, 'dev-pairs'), idx = path.join(OUT, 'dev-index');
const a = { catalogRows: 0, freshRows: 0, c2CalibrationRowsFromCutoff: 0, c2HeldObjectRows: 0, issRowsFromHold: 0, swarmGraceRowsFromHold: 0, outsideSpanRows: 0, nsgfOrHeldPaths: 0, pairRows: 0, dropped: Object.fromEntries(PREDICATES.map((p) => [p, 0])) };
const truth = new Map(TRUTH.objects.map((o) => [o.norad, o]));
for (const f of fs.readdirSync(dev).filter((x) => x.endsWith('.jsonl'))) {
  const n = Number(f.replace('.jsonl', '')), o = truth.get(n); if (!o) { a.catalogRows += fs.readFileSync(path.join(dev, f), 'utf8').split('\n').filter(Boolean).length; continue; }
  const from = Date.parse(`${o.from}T00:00:00Z`), to = Date.parse(`${o.to}T00:00:00Z`) + 86400e3;
  for (const l of fs.readFileSync(path.join(dev, f), 'utf8').split('\n')) {
    if (!l) continue; const t = JSON.parse(l)[0]; a.pairRows++;
    if (C2_HELD_NORADS.has(n)) a.c2HeldObjectRows++;
    if (t >= Date.parse('2026-11-10T00:00:00Z')) a.freshRows++;
    if (o.c2cal && t >= C2_CUTOFF) a.c2CalibrationRowsFromCutoff++;
    if (n === 25544 && t >= ISS_HOLD) a.issRowsFromHold++;
    if (/^(Swarm|GRACE)/.test(o.name) && t >= SWARM_HOLD) a.swarmGraceRowsFromHold++;
    if (t < from || t >= to) a.outsideSpanRows++;
  }
}
for (const f of fs.readdirSync(idx).filter((x) => x.startsWith('audit-'))) {
  const j = JSON.parse(fs.readFileSync(path.join(idx, f)));
  for (const [p, c] of Object.entries(j.dropped)) a.dropped[p] += c;
  a.nsgfOrHeldPaths += Object.keys(j.files).filter(pathHeld).length;
}
const inputs = {}; for (const f of fs.readdirSync(idx).filter((x) => x.startsWith('audit-'))) Object.assign(inputs, JSON.parse(fs.readFileSync(path.join(idx, f))).files);
const filesSha = crypto.createHash('sha256').update(JSON.stringify(Object.entries(inputs).sort())).digest('hex');
const res = path.join(repo, 'results/covariance-every-object');
fs.writeFileSync(path.join(res, 'provenance-audit.json'), JSON.stringify({ ...a, inputFiles: Object.keys(inputs).length, inputFilesSha256: filesSha, devPairsManifestSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(dev, 'MANIFEST.json'))).digest('hex'), truthObjectsSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(repo, 'experiments/covariance-every-object/truth-objects.json'))).digest('hex') }, null, 1) + '\n');
console.log(a);
