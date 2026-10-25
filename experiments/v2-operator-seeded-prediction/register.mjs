// Registration metadata only: published catalog fields, no propagation or truth.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
const dir = path.dirname(new URL(import.meta.url).pathname);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
if (fs.existsSync(path.join(dir, 'config.json'))) throw new Error('registration exists; never overwrite a frozen design');
const source = '/opt/data/sdn-archive/spacetrack/gp/2026/2026-10-22.json.gz';
const bytes = fs.readFileSync(source);
const response = await fetch('https://api.starlink.com/public-files/ephemerides/MANIFEST.txt', { headers: { 'User-Agent': 'sdn-v2-operator-seeded/1.0' }, signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`manifest HTTP ${response.status}`);
const manifest = Buffer.from(await response.arrayBuffer());
const listed = new Set([...manifest.toString().matchAll(/MEME_(\d+)_/g)].map(m => +m[1]));
const latest = new Map();
for (const row of JSON.parse(zlib.gunzipSync(bytes))) {
  const id = +row.NORAD_CAT_ID;
  if (!listed.has(id) || !row.OBJECT_NAME.startsWith('STARLINK') || !Number.isFinite(+row.PERIAPSIS) || !Number.isFinite(+row.INCLINATION)) continue;
  if (!latest.has(id) || row.EPOCH > latest.get(id).EPOCH) latest.set(id, row);
}
const salt = 'v2-operator-seeded-20261023';
const groups = new Map();
for (const [id, row] of latest) {
  const inc = +row.INCLINATION, key = `${Math.floor(+row.PERIAPSIS / 50) * 50}/${inc < 48 ? 43 : inc < 60 ? 53 : inc < 85 ? 70 : 97}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(id);
}
// Square-root allocation gives small shells representation; highest-average
// allocation is capped by population and deterministic, totaling exactly 500.
const strata = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, ids]) => ({ key, ids: ids.sort((a,b) => sha(`${salt}:${a}`).localeCompare(sha(`${salt}:${b}`))), n: 0, weight: Math.sqrt(ids.length) }));
for (let taken = 0; taken < 500; taken++) {
  const s = strata.filter(s => s.n < s.ids.length).sort((a,b) => b.weight / (b.n + 1) - a.weight / (a.n + 1) || a.key.localeCompare(b.key))[0];
  if (!s) throw new Error('fewer than 500 eligible objects');
  s.n++;
}
const start = Date.parse('2026-10-24T08:00:00Z'), end = Date.parse('2026-11-07T08:00:00Z');
const issuesUtc = []; for (let t = start; t < end; t += 8 * 3600000) issuesUtc.push(new Date(t).toISOString());
const horizonsHours = [6, 24, 48, 72, 120, 168];
const config = { experiment: 'v2-operator-seeded-prediction', frozen: true, registeredUtc: new Date().toISOString(),
  store: '/opt/data/sdn-archive/v2-operator-seeded', salt, sampleSize: 500,
  population: { source, sha256: sha(bytes), manifestSha256: sha(manifest), eligible: latest.size, rule: 'listed Starlinks; published PERIAPSIS 50 km bin x INCLINATION group 43/53/70/97; square-root quota priority; salted SHA-256 order' },
  strata: strata.filter(s => s.n).map(s => ({ shell: s.key, population: s.ids.length, norads: s.ids.slice(0,s.n) })),
  issuesUtc, horizonsHours, fitHours: 48, fitEndExclusive: true, fitCadenceSeconds: 600, truthHeadHours: 3, targetToleranceSeconds: 900,
  window: { issueStartUtc: new Date(start).toISOString(), issueEndExclusiveUtc: new Date(end).toISOString(), minimumIssueDays: 14, minimumCaptureDays: 21, earliestScoreUtc: '2026-11-14T08:00:00Z' },
  arms: ['1-ballistic','2-ballistic-dca','3-constant-thrust','4-kappa-drag-dca','5-kappa-drag-starlink-dca','6-operator','sgp4-fit','sgp4-gp'],
  dca: { primary: 'host-02 live $DCL, available from about 2026-10-24T02:44Z, local recorded export only', fallback: 'E13 recorded Dove series with publication cutoff', file: '/opt/data/sdn-archive/v2-operator-seeded/dca/index.jsonl', futurePolicy: 'latest published at or before issue; FFM holds last node; no later solutions or future observations', conditionalArm: 5 },
  compute: { workers: 1, cadenceHours: 8, minRequestGapMs: 3200, maxLoad1m: 21, minimumFreeGiB: 25, maximumCycleHours: 7.5 },
  statistics: { resamples: 2000, seed: 20261023, confidence: .95, minimumObjects: 30, minimumPairedSamples: 100, quantiles: [.5,.95], cluster: 'object' },
  trimming: { fraction: .1, candidates: ['gravity-above-20','ocean-tides','solid-tides','relativity','earth-radiation'], rule: 'maximum paired position difference < 0.1 * median full truth error; joint combination rechecked; paired covariance mean d2/3 ratio CI within [0.95,1.05]' },
  srpLock: { before56000: .11, from56000: .19 }, fit: { maxIterations: 25, correctionTolerance: .001, sigmaM: 1, initialCdAreaOverMass: .03 },
  forceModel: { degree: 70, order: 70, thirdBodies: [10,301,2,4,5], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: 'IERS_2010', oceanTides: {model:'FES2004',degree:30,order:30}, earthRadiation: {model:'KNOCKE',resolutionDeg:15} },
  fullAblationModel: { degree: 70, order: 70, thirdBodies: [10,301,2,4,5], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: 'IERS_2010', oceanTides: {model:'FES2004',degree:30,order:30}, earthRadiation: {model:'KNOCKE',resolutionDeg:15} },
  integrator: { tolerance: 1e-13, maxStep: 120 },
};
fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify(config,null,2)+'\n');
const epochsUtc = [...new Set(issuesUtc.flatMap(t => horizonsHours.map(h => new Date(Date.parse(t)+h*3600000).toISOString())))].sort();
const registration = { version: 1, subsets: [{ id: config.experiment, config: '../v2-operator-seeded-prediction/config.json', configSha256: sha(fs.readFileSync(path.join(dir,'config.json'))), norads: strata.flatMap(s => s.ids.slice(0,s.n)).sort((a,b)=>a-b), issuesUtc, horizonsHours, epochsUtc, truthHeadHours: 3, epochToleranceSeconds: 900, truthRule: 'newer file created after the forecast issue; first 3 hours only; first state at/after target within tolerance; preserve source creation/start/retrieval and hash' }] };
const capture = path.join(dir,'../operator-capture'); fs.mkdirSync(capture,{recursive:true});
const file = path.join(capture,'SUBSETS.md');
if (fs.existsSync(file)) throw new Error('SUBSETS exists; merge this registration explicitly');
fs.writeFileSync(file, '# Operator capture subset registrations\n\nFrozen V2 registration. Collector interface: read the JSON fenced block; capture the union of `norads` at `epochsUtc` (or the first source state within `epochToleranceSeconds`). Preserve only eligible first-hours truth and provenance. Missing coverage remains missing. V2 owns this registration; E13b owns collector implementation.\n\n```json\n'+JSON.stringify(registration,null,2)+'\n```\n');
console.log(JSON.stringify({objects:500,eligible:latest.size,strata:config.strata.length,issues:issuesUtc.length,epochs:epochsUtc.length,configSha256:registration.subsets[0].configSha256}));
