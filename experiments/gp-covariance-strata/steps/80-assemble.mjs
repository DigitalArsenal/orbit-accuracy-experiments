#!/usr/bin/env node
// Step 80: frozen-constants.json from the candidate, stratum, S3/S5 and audit outputs; and the stratum-level results files.
//   node steps/80-assemble.mjs <scratch dir with cand.json strata.json s3s5.json dev-rows-manifest.json> <rows dir>... [--o4] [--o5]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { regimeTables } from '../lib/tab.mjs';
import { REGIMES, BINS } from '../lib/bins.mjs';
import { outcomeOf, openDate, PRODUCTS, WINDOW, FRESH_EXCLUDED_NORADS, OTHER_LATENCIES } from '../lib/outcomes.mjs';
import { C2_HELD_OBJECTS } from '../lib/holds.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const args = process.argv.slice(2);
const owner = { o1: 'b', o2: 'coverage-calibrated', o3: args.includes('--o3'), o4: args.includes('--o4'), o5: args.includes('--o5'), recordedBy: args.includes('--o5') ? 'O5 yes (owner, 2026-11-03; PLAN.md section 11); O3 yes, O1 (b), O2 coverage-calibrated, O4 no, S3 default (owner delegation, 2026-11-04; PLAN.md section 12)' : 'defaults of PLAN.md section 6 unless the task record carries an answer' };
const [scratch, ...dirs] = args.filter((a) => !a.startsWith('--'));
const J = (f) => JSON.parse(fs.readFileSync(path.join(scratch, f), 'utf8'));
const cand = J('cand.json'), strata = J('strata.json').strata, s3s5 = J('s3s5.json'), manifest = J('dev-rows-manifest.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const hashTree = (dir, ext) => { const h = createHash('sha256'); for (const f of fs.readdirSync(dir).filter((n) => ext.test(n)).sort()) h.update(f).update(fs.readFileSync(path.join(dir, f))); return h.digest('hex'); };
const pins = JSON.parse(fs.readFileSync(path.join(root, 'results/gp-covariance-strata/pins.json'), 'utf8'));
const tabs = await regimeTables(dirs);

// placements and lists
const placements = {}; const lists = {};
const ageRange = BINS.map(() => [Infinity, -Infinity]);
for (const regime of REGIMES) {
  const tab = tabs[regime]; const counts = new Map();
  for (let i = 0; i < tab.n; i++) { counts.set(tab.norad[i], (counts.get(tab.norad[i]) ?? 0) + 1); const r = ageRange[tab.b[i]]; r[0] = Math.min(r[0], tab.age[i]); r[1] = Math.max(r[1], tab.age[i]); }
  lists[regime] = [...counts].filter(([, n]) => n >= 100).map(([k]) => k).sort((a, b) => a - b);
  for (const k of counts.keys()) (placements[k] ??= { regimes: [], cluster: tab.clusterNames[tab.cluster[tab.norad.indexOf(k)]] }).regimes.push(regime);   // every object with a row, whatever its count
}
// O3 default: Sentinel-1C and COSMIC-2 are not in a fresh list
for (const r of Object.keys(lists)) lists[r] = lists[r].filter((n) => !FRESH_EXCLUDED_NORADS.includes(n));
// S5 models for the committed audit
const out = { version: 1, plan: { file: 'experiments/gp-covariance-strata/PLAN.md', sha256: sha(fs.readFileSync(path.join(here, '../PLAN.md'))) }, owner,
  regimeDefinition: 'E14 regimes by the module rule: a set\'s regime is read from its mean altitude (SGP4 un-Kozai\'d mean motion, WGS-72 radius) and eccentricity: LEO-L altitude [0,500) km, LEO-M [500,800), LEO-H [800,2000), MEO [2000,30000), GEO [30000,40000), all with eccentricity [0,0.25); HEO eccentricity >= 0.25 at any altitude. Age bins (days): [0,0.25) [0.25,0.75) [0.75,1.5) [1.5,2.5) [2.5,4) [4,6) [6,8]; the stratum lookup takes the bin containing the age (the last bin closed at 8 d), the interpolation lookup is linear in age between bin midpoints and held beyond the first and last usable midpoint.',
  seed: J('strata.json').seed, trials: J('strata.json').trials,
  code: { libSha256: hashTree(path.join(here, '../lib'), /\.mjs$/), stepsSha256: hashTree(path.join(here, '../steps'), /\.mjs$/), runSha256: fs.existsSync(path.join(here, '../run.mjs')) ? sha(fs.readFileSync(path.join(here, '../run.mjs'))) : null },
  pins, vendorsBlob: pins.vendorsMd.gitBlob, s4: JSON.parse(fs.readFileSync(path.join(root, 'results/gp-covariance-strata/dev-rows-summary.json'), 'utf8')).s4,
  placements, noradLists: lists, c2HeldObjects: Object.keys(C2_HELD_OBJECTS).map(Number),
  seal: { file: 'reference-states/seal/2026-11-04T034634Z.json', sha256: 'e92767243264aa478602f60b8dfce8ef84638f6663fbbafaaac6e5fad7014bb0', sealedUtc: '2026-11-04T03:46:34Z', read: 'names, dates and SHA-256 only until a stratum\'s open date' },
  latencies: { used: PRODUCTS, other: OTHER_LATENCIES, measuredIn: 'v-checks.json V3' },
  pTruth: 0, sampleAgeRangeDays: ageRange,
  candidates: Object.fromEntries(Object.entries(cand).map(([r, c]) => [r, { clusters: c.clusters, rows: c.rows, folds: c.folds, passRate: c.passRate, pick: c.pick, why: c.why, c: c.c, r0: c.r0 ?? null, r2: c.r2 ?? null, note: c.note ?? null }])),
  pStrat: Object.fromEntries(Object.entries(cand).map(([r, c]) => [r, c.cells ?? null])),
  s3: { ...s3s5.s3, statement: 'the honest limit as stated is withdrawn: at the smallest covariance the truth does not reject, a zero-miss pair at 5 days in drag LEO can exceed Pc 1e-4', ruling: null }, s5: {}, strata: {}, devRows: { dir: 'AR/gp-covariance-strata/dev-rows', files: Object.keys(manifest.files).length, manifestSha256: sha(fs.readFileSync(path.join(scratch, 'dev-rows-manifest.json'))), format: manifest.format } };
for (const regime of REGIMES) for (let b = 0; b < BINS.length; b++) {
  const key = `${regime}|${b}`, s = strata[key] ?? { regime, bin: b };
  const o = outcomeOf(regime, s.dev ? s : null, owner), oAlt = outcomeOf(regime, s.dev ? s : null, { ...owner, o5: true });
  const op = outcomeOf(regime, s.dev ? s : null, owner, 'S1p'), opAlt = outcomeOf(regime, s.dev ? s : null, { ...owner, o5: true }, 'S1p');
  out.strata[key] = { regime, bin: b, binDays: BINS[b], outcome: o.outcome, reasons: o.reasons, outcomeIfO5: oAlt.outcome, reasonsIfO5: oAlt.reasons, s1p: s.s1p ? { ...s.s1p, outcome: op.outcome, reasons: op.reasons, outcomeIfO5: opAlt.outcome, reasonsIfO5: opAlt.reasons, state: op.outcome === 'TESTABLE' ? 'PENDING' : op.outcome } : null, open: openDate(regime, b), products: PRODUCTS[regime], devRows: s.devRows ?? 0,
    clusters: s.clusters ?? 0, objects: s.objects ?? 0, dev: s.dev ?? null, s0: s.s0 ?? null, blockDays: s.blockDays ?? null, timeBlocks: s.timeBlocks ?? null, nFresh: s.nFresh ?? null, nEff: s.nEff ?? null, icc: s.icc ?? null,
    oc: s.oc ?? null, ocPass: s.ocPass ?? null, cMin: s.cMin ?? null, cScan: s.cScan ?? null, clusterNames: s.clusterNames ?? null,
    state: o.outcome === 'TESTABLE' ? 'PENDING' : o.outcome, noradList: o.outcome === 'NO LAWFUL TRUTH' ? [] : lists[regime] };
  const f = s3s5.s5[key];
  out.s5[key] = f ?? null;
}
// replaced-model blocks for the committed S5 audit
fs.writeFileSync(path.join(root, 'results/gp-covariance-strata/frozen-constants.json'), `${JSON.stringify(out, null, 1)}\n`);
const count = (f) => Object.values(out.strata).filter(f).length;
out.testableCounts = { S1: { default: count((x) => x.outcome === 'TESTABLE'), ifO5: count((x) => x.outcomeIfO5 === 'TESTABLE') }, S1p: { default: count((x) => x.s1p?.outcome === 'TESTABLE'), ifO5: count((x) => x.s1p?.outcomeIfO5 === 'TESTABLE') } };
fs.writeFileSync(path.join(root, 'results/gp-covariance-strata/frozen-constants.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out.testableCounts));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out.strata).map(([k, v]) => [k, v.outcome])), null, 0).slice(0, 600));
