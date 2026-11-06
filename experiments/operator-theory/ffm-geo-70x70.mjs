// FFM-GEO-70X70.md: the 45 GE windows of the GEO force-settings audit flown again with propagator/ffm 2.2.1 at a 70x70 field, every other
// setting the stored ffm220 rows' (all-regimes.mjs ffmHigh), scored against the stored AP 0.5.1 rows by the audit's statistic over five
// bootstrap seeds. Report only: no module change, no change to cells.json, no burn verdict. Module calls only for every state; statistics
// on stored rows.
//   node experiments/operator-theory/ffm-geo-70x70.mjs --fly --shard k/n   flies shard k of n (n at most 4) into the store (adds only what is missing)
//   node experiments/operator-theory/ffm-geo-70x70.mjs                     writes results/ap-truth/ffm-geo-70x70/{table.json,README.md}
//   node experiments/operator-theory/ffm-geo-70x70.mjs --check             recomputes both, holds them to the bytes on disk and the sources to
//                                                                           their hashes, checks the registration predates the first row; PASS or FAIL
// SDN_MODULES_ROOT: a modules checkout with XM's registered installs (default: the -bench2 clone); SDN_MODULES_GIT: one holding 93cb5a058 for
// the 2.2.1 bytes (default: the -covm clone); SDN_MODULES_SRC: where the module sources are re-hashed (default: SDN_MODULES_GIT).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { median, pct, asc, rand } from './lib/compare.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(REPO, 'results/ap-truth/ffm-geo-70x70');
const AP = '/opt/data/sdn-archive/operator-theory/ap';
const STORE = path.join(AP, 'ffm221-70x70/regimes');
const REGISTRATION = 'experiments/operator-theory/FFM-GEO-70X70.md';
const TASK = 'modules-ffm-geo-gravity-field-and-degree-at-geo-20261106';
// Installs and XM's pins from the -bench2 clone (SDS 1.276.0 installed, as XM's modulesRoot() demands); FFM 2.2.1's bytes by git show from the clone
// holding 93cb5a058 (SDN_MODULES_GIT); the module sources re-hashed at that commit from SDN_MODULES_SRC.
process.env.SDN_MODULES_ROOT ??= '/Users/tj/software/private/coordinator-d9/space-data-network-modules-bench2';
process.env.SDN_MODULES_GIT ??= '/Users/tj/software/private/coordinator-d9/space-data-network-modules-covm';
const MODULES = process.env.SDN_MODULES_SRC ?? process.env.SDN_MODULES_GIT;
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const CHECK = !!args.check, FLY = !!args.fly;
const DRAWS = 10000, SEEDS = 5, FIT = 72, LEADS = [[48, '2'], [72, '3'], [168, '7']];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();

// The builds. FFM 2.2.1 at modules 93cb5a058 (lib/ap.mjs pinnedFile: git show, SHA-256 checked); AP 0.5.1's rows as stored; the 20x20 rows 2.2.0's.
const MODULES_COMMIT = '93cb5a0584fa728864e4426cc9ceb368936589f9';
const FFM_221 = { module: 'propagator/ffm', version: '2.2.1', modulesCommit: MODULES_COMMIT, wasmSha256: 'a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4' };
const FFM_220_WASM = 'd635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153';
const AP_051_WASM = 'd29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb';
const DEGREE = 70;

// The 45 windows, by id (FFM-GEO-168H.md; ap/b0411/regimes group GE with no error).
const SATS = ['C006 BDS-2G', 'C011 BDS-2G', 'C016 BDS-2G', 'C018 BDS-2G', 'C020 BDS-2G', 'C217 BDS-3G', 'C229 BDS-3G', 'C231 BDS-3G', 'J003 QZS-2G'];
const CUTOFFS = ['2025-10-04', '2025-10-06', '2025-10-08', '2025-10-10', '2025-10-12'];
const WINDOWS = SATS.flatMap((s) => CUTOFFS.map((d) => `GE|${s}|${d}`));

// Every source the table cites, by SHA-256 at the registered state (experiments d17d6841 and modules 93cb5a058).
const SRC = {
  experiments: {
    'experiments/operator-theory/FFM-GEO-168H.md': 'e393727da7c2b4091cf91f82a1fc7a829fe8fcb0b25febdb70cc166b6d595d2f',
    'experiments/operator-theory/all-regimes.mjs': 'b09c0d16ddf3831b5d007e355ab29924ce1c9798bd8d2b668bf5c58bd0c286d6',
    'experiments/operator-theory/lib/frame.mjs': '9d2084b86cb4def6adb8b7fe15f8f45880d92a5142408915303b98c81271b9ce',
    'experiments/operator-theory/lib/fit.mjs': 'e8393b0264378b3fa2e0901798503ad0eee5e7e50369c55c5774c539bb5db329',
    'experiments/operator-theory/lib/host.mjs': '47373ddbb3503f19c4dd12355388105cbb772794e068874c2444cd96ccc6220d',
    'experiments/operator-theory/lib/ap.mjs': '08ecf5f294c3b42c7ebb618f45f408a8ec3ad981dd4172bdfe0f13bd33165d7b',
    'experiments/operator-theory/ffm-geo-168h.mjs': 'e372029f2089081e644aea12c140608ef1303e65744b19966c0effa00d802da7',
    'experiments/ffm-atmosphere-xm3/config.json': '3eea04347d3e270c62f9a2bea9841b35396898c8778258698f839298570e5c85',
    'results/ap-truth/ffm-geo-168h/table.json': '70d525f38b91f2d00455f9341c135e10ba95b07b2f70e363f5638feddb74c575',
  },
  modules: {
    'propagator/ffm/dist/isomorphic/module.wasm': FFM_221.wasmSha256,
    'propagator/ffm/src/cpp/src/prw_dynamics.cpp': 'fd334bbdb05bc37bd1e4969e9e2d3013af0ef2ddee88d6e6dc67a02965925195',
    'propagator/ffm/lib/force_models.cpp': 'e5972241d304d5b16219e5e2fb9912cf89fa45a116fc28c5c63c5d63f00a66b5',
    'propagator/ffm/lib/shadow.h': 'de9b093d3ea66671bb3790de261d3b7bb98c17d2b4f8ebc3c3bd218c48577d30',
  },
};

// ---------------------------------------------------------------------------------------------------------------------------------- flights
async function fly() {
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  if (!(SHARDS >= 1 && SHARDS <= 4 && SHARD >= 0 && SHARD < SHARDS)) throw new Error('--shard k/n with n at most 4');
  // Registration before any row: this file's registering commit must exist and the working copy must equal HEAD.
  const regCommit = git('log', '-1', '--format=%H %cI', '--', REGISTRATION);
  if (!regCommit) throw new Error(`${REGISTRATION} is not committed`);
  try { execFileSync('git', ['-C', REPO, 'diff', '--quiet', 'HEAD', '--', REGISTRATION]); } catch { throw new Error(`${REGISTRATION} differs from HEAD`); }
  const { config, DAY, HOUR, iso, ms, rms, XM } = await import('./lib/xp2.mjs');
  const { openFfmHost } = await import('./lib/host.mjs');
  const { MGEX_CUTOFFS, windowKey } = await import('./lib/regimes.mjs');
  const T = await import(path.join(REPO, config.xm.dir, 'lib/truth.mjs'));
  const SRCS = await import(pathToFileURL(path.join(REPO, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const { openModules } = await import(path.join(REPO, config.xm.dir, 'lib/modules.mjs'));
  const m = await openModules(), F = await openFfmHost({ ffm: FFM_221 });
  if (F.provenance.ffm.wasmSha256 !== FFM_221.wasmSha256 || F.provenance.ffm.version !== FFM_221.version) throw new Error(`FFM opened is ${F.provenance.ffm.version} ${F.provenance.ffm.wasmSha256}`);
  const LEAD_DAYS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
  // all-regimes.mjs ffmHigh(), the degree and order at 70.
  const settings = () => ({
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: DEGREE, order: DEGREE, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
  });
  function apriori(parameterSigmas) { const diag = [...Array(3).fill(1e10), ...Array(3).fill(100), ...parameterSigmas.map((s) => s * s)]; const n = diag.length; return Array.from({ length: n * n }, (_, j) => (Math.floor(j / n) === j % n ? diag[j % n] : 0)); }
  const inShard = (key) => parseInt(sha256(key).slice(0, 8), 16) % SHARDS === SHARD;
  fs.mkdirSync(STORE, { recursive: true });
  fs.appendFileSync(path.join(STORE, 'run.log'), `start ${new Date().toISOString()} shard ${SHARD}/${SHARDS} registration ${regCommit} ffm ${F.provenance.ffm.version} ${F.provenance.ffm.wasmSha256} estimation ${F.provenance.estimation.version} ${F.provenance.estimation.wasmSha256}\n`);
  const outFile = path.join(STORE, `rows-${SHARD}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const want = new Set(WINDOWS);
  let flown = 0;
  for (const o of SRCS.mgex({ klass: 'geo' })) {
    const lines = o.lines, times = lines.map((l) => ms(l.epoch));
    const stepMs = times.length > 1 ? times[1] - times[0] : GRID;
    const gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs);
    const minBin = Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
    const between = (a, b) => { const out = []; for (let i = 0; i < times.length; i += 1) if (times[i] >= a && times[i] <= b) out.push(lines[i]); return out; };
    for (const D0 of MGEX_CUTOFFS) {
      const key = windowKey('GE', o.name, D0);
      if (!want.has(key) || !inShard(key) || done.has(key)) continue;
      const row = { key, group: 'GE', norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
      try {
        const after = between(D0 + 1, D0 + 7 * DAY);
        const first = after.length ? ms(after[0].epoch) : 0;
        const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
        const bins = Object.fromEntries(LEAD_DAYS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
        const entered = LEAD_DAYS.filter((k) => bins[k].length >= minBin);
        if (!entered.length) throw new Error('no lead bin');
        const scored = entered.flatMap((k) => bins[k]);
        const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
        const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
        const raw = between(D0 - FIT * HOUR, D0);
        const coverage = raw.length > 1 ? raw.length / ((FIT * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
        const thin = coverage >= MIN_COV ? T.thinned(raw).chosen : null;
        if (Math.hypot(...scored[0].r) < 8400) throw new Error('not the high arm');
        const a = { ok: false };
        try {
          if (!thin) throw new Error('coverage');
          const s = settings();
          const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], s, null, D0);
          if (!f.state) throw new Error(f.error ?? f.termination);
          const st = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, s, null);
          Object.assign(a, { fitOk: !!f.ok, termination: f.termination, days: score(await m.rtn(st, truth)) });
          a.ok = true;
        } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
        row.arms[`F${FIT}`] = a;
      } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
      fs.appendFileSync(outFile, `${JSON.stringify({ ...row, ffm: F.provenance.ffm, degree: DEGREE, flownAt: new Date().toISOString() })}\n`);
      flown += 1;
      console.error(`${key}: ${row.arms.F72?.ok ? `day 7 ${row.arms.F72.days?.[7]?.e?.toFixed(4) ?? '-'} km` : row.arms.F72?.error ?? row.error}`);
    }
  }
  console.error(`shard ${SHARD}/${SHARDS}: ${flown} flown, ${done.size} already there`);
  await F.close();
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------------------------------- the table
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f))) : [];
const byKey = (dir) => new Map(rowsIn(dir).map((r) => [r.key, r]));
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
const scored = (v) => Number.isFinite(v) && v > 0;
const seedOf = (tag) => parseInt(sha256(tag).slice(0, 8), 16);
const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };
const r3 = (x) => Number(x.toFixed(3)), r6 = (x) => Number(x.toFixed(6));
const ratio = (w) => r3(Math.exp(median(w.map((x) => x.ln))));
/** One bootstrap interval of the ratio over clusters drawn with replacement. */
const interval = (tag, w, clusterOf) => {
  const by = new Map();
  for (const x of w) { const c = clusterOf(x); (by.get(c) ?? by.set(c, []).get(c)).push(x.ln); }
  const clusters = [...by.values()], random = rand(seedOf(tag)), meds = [];
  for (let t = 0; t < DRAWS; t += 1) { const draw = []; for (let i = 0; i < clusters.length; i += 1) draw.push(...clusters[Math.floor(random() * clusters.length)]); meds.push(median(draw)); }
  meds.sort(asc);
  return { lower: r6(Math.exp(pct(meds, 0.025))), upper: r6(Math.exp(pct(meds, 0.975))), clusters: clusters.length };
};
/** The five seeds of one bound: every interval, the spread of the lower bounds, and whether every seed agrees on the bound's side of 1. */
const seeds = (tagBase, w, clusterOf) => {
  const runs = Array.from({ length: SEEDS }, (_, i) => ({ seed: `seed${i + 1}`, ...interval(`${tagBase}|seed${i + 1}`, w, clusterOf) }));
  const lows = runs.map((r) => r.lower), highs = runs.map((r) => r.upper);
  const above = lows.filter((l) => l > 1).length;
  return { interval: [r3(runs[0].lower), r3(runs[0].upper)], seeds: runs, clusters: runs[0].clusters,
    spread: { lowerMin: Math.min(...lows), lowerMax: Math.max(...lows), lowerRange: r6(Math.max(...lows) - Math.min(...lows)), upperMin: Math.min(...highs), upperMax: Math.max(...highs) },
    lowerAbove1: above, side: above === SEEDS ? 'above 1 in all seeds' : above === 0 ? 'at or below 1 in all seeds' : `above 1 in ${above} of ${SEEDS} seeds` };
};
/** A paired cell: numerator and denominator figures by key at a day. */
function cell(tag, members, num, den, day, lead) {
  const w = members.map((key) => ({ key, name: key.split('|')[1], cutoff: key.split('|')[2], a: num(key, day), b: den(key, day) }))
    .filter((x) => scored(x.a) && scored(x.b)).map((x) => ({ ...x, ln: Math.log(x.a / x.b) }));
  if (!w.length) return { fit: FIT, lead, day: Number(day), windows: 0 };
  return { fit: FIT, lead, day: Number(day), windows: w.length, satellites: new Set(w.map((x) => x.name)).size, numeratorWorse: w.filter((x) => x.ln > 0).length, ratio: ratio(w),
    windowCluster: seeds(`FFM-GEO-70X70|${tag}|${FIT}|${lead}`, w, (x) => x.key),
    objectWeek: seeds(`FFM-GEO-70X70|${tag}|${FIT}|${lead}|object-week`, w, (x) => `${x.name}|${isoWeek(x.cutoff)}`),
    perSatellite: Object.fromEntries(SATS.filter((n) => w.some((x) => x.name === n)).map((n) => { const s = w.filter((x) => x.name === n); return [n, { windows: s.length, ratio: ratio(s) }]; })),
    medianKm: { numerator: r3(median(w.map((x) => x.a))), denominator: r3(median(w.map((x) => x.b))) }, keys: w.map((x) => x.key) };
}

function build() {
  const ap = byKey(path.join(AP, 'b051/regimes')), f20 = byKey(path.join(AP, 'ffm220/regimes')), f70 = byKey(STORE);
  const rows70 = WINDOWS.map((k) => f70.get(k)).filter(Boolean);
  const flown = rows70.filter((r) => r.arms?.F72?.ok).length;
  const builds70 = [...new Set(rows70.map((r) => `${r.ffm?.version}@${r.ffm?.wasmSha256}@${r.degree}`))];
  const badBuild = builds70.filter((b) => b !== `${FFM_221.version}@${FFM_221.wasmSha256}@${DEGREE}`);
  const foreign = rowsIn(STORE).filter((r) => !WINDOWS.includes(r.key)).map((r) => r.key);
  for (const k of WINDOWS) { const r = f20.get(k); if (r && r.ffm?.wasmSha256 !== FFM_220_WASM) throw new Error(`${k}: the 20x20 row is not 2.2.0`); }
  const F70 = (k, d) => e(f70.get(k), `F${FIT}`, d), F20 = (k, d) => e(f20.get(k), `F${FIT}`, d), AP72 = (k, d) => e(ap.get(k), `AP${FIT}`, d);
  const cells = LEADS.map(([lead, day]) => cell('GFZ', WINDOWS, F70, AP72, day, lead));
  const cells20 = LEADS.map(([lead, day]) => cell('GFZ-20x20', WINDOWS, F20, AP72, day, lead));
  const effect = LEADS.map(([lead, day]) => cell('degree-effect', WINDOWS, F70, F20, day, lead));
  const failures = rows70.filter((r) => !r.arms?.F72?.ok).map((r) => ({ key: r.key, error: r.arms?.F72?.error ?? r.error }));
  const firstRow = rows70.map((r) => r.flownAt).filter(Boolean).sort()[0] ?? null;
  const registration = git('log', '-1', '--format=%H %cI', '--', REGISTRATION);
  const [regCommit, regDate] = registration.split(' ');
  // The reading rule, as registered, on 72/168.
  const c = cells[2], d = effect[2];
  let verdict;
  if (!c.windows || !d.windows) verdict = { reading: 'no rows', statement: 'no 70x70 row at 72/168 yet' };
  else {
    const wc = c.windowCluster, de = d.windowCluster;
    const allAbove = wc.lowerAbove1 === SEEDS, noneAbove = wc.lowerAbove1 === 0;
    const effectBelow = d.ratio < 1 && de.spread.upperMax < 1, effectHolds1 = !(de.spread.upperMax < 1) && !(de.spread.lowerMin > 1);
    const facts = `72/168: FFM 70x70 / AP ${c.ratio} on ${c.windows} windows (FFM worse on ${c.numeratorWorse}); window-cluster lower bound ${wc.side} (${wc.spread.lowerMin} to ${wc.spread.lowerMax}, range ${wc.spread.lowerRange}); degree effect 70x70 / 20x20 ${d.ratio}, interval [${de.interval.join(', ')}] (upper over seeds ${de.spread.upperMin} to ${de.spread.upperMax})`;
    if (allAbove) verdict = { reading: 'still worse', statement: 'FFM at 70x70 is still worse than AP at 72/168 by the registered rule: gravity is ruled out; the eclipse model, the ephemeris and the frames stay report-only candidates; no record named', facts, record: null };
    else if (noneAbove && effectBelow) verdict = { reading: 'no longer worse', statement: 'FFM at 70x70 is no longer worse than AP at 72/168 and the field measurably lowers its own error: the 20x20 choice at GEO leaves out terms that matter there; an FFM configuration record follows', facts,
      record: { id: 'modules-ffm-geo-degree-configuration-20261106', shouldSet: `CHEAPER.md's and the harness high arm's GEO degree: the field at GEO flown at ${DEGREE}x${DEGREE} (or the smallest degree the follow-up ladder shows equal to it), every other setting unchanged; report-only until that ladder is flown` } };
    else verdict = { reading: 'within the Monte Carlo spread', statement: `the reading at 72/168 is within the bootstrap's own spread or the forecast did not move: ${noneAbove ? 'the bound passed below 1 in every seed' : `the seeds disagree (${wc.side})`}${effectHolds1 ? '; the degree effect interval holds 1' : effectBelow ? '; the degree effect is below 1' : '; the degree effect is above 1'}. The record resolves nothing about the gravity row: gravity is neither ruled out nor confirmed, no record named, and the next step is more windows, not more draws`, facts, record: null };
  }
  return {
    registered: REGISTRATION, registration: { commit: regCommit, committed: regDate, firstRowFlownAt: firstRow, registrationBeforeFirstRow: !!(firstRow && regDate && Date.parse(regDate) < Date.parse(firstRow)) },
    reading: 'report only; no module change; cells.json untouched; no GEO burn verdict',
    task: TASK,
    builds: {
      ffm70: { ...FFM_221, degree: DEGREE, order: DEGREE, store: 'ap/ffm221-70x70/regimes', arm: 'F72', fittedBy: 'analysis/estimation 0.7.0 (XM3 pin)', rowsPresent: rows70.length, rowsFlown: flown, failures, buildsSeen: builds70, foreignKeys: foreign },
      ffm20: { module: 'propagator/ffm', version: '2.2.0', wasmSha256: FFM_220_WASM, degree: 20, order: 20, store: 'ap/ffm220/regimes', arm: 'F72' },
      ap: { module: 'propagator/sdn-ap', version: '0.5.1', wasmSha256: AP_051_WASM, store: 'ap/b051/regimes', arm: 'AP72', identity: 'AP 0.6.3 equals 0.5.1 byte for byte at e 0.3 and below (COMPARE.md 2026-11-06, 53 of 56 examples equal, the 3 that move above e 0.3); every GE window is near-circular' },
      identity221: 'FFM 2.2.1 is 2.2.0 rebuilt on spacedatastandards.org 1.279.0: between modules f1517ef68e and 93cb5a058 only propagator/ffm/src/cpp/generated/sds/*_generated.h, package.json and plugin-manifest.json change',
      settings: 'all-regimes.mjs ffmHigh() with degree and order 70: SPHERICAL_HARMONICS (embedded EGM2008) 70x70 through PCFForceModel MAXIMUM_DEGREE/MAXIMUM_ORDER of the $PRW execution request (lib/frame.mjs executionFrame), Sun and Moon point masses from DE440s, SRP_AREA_OVER_MASS fitted (seed 0.02, a priori 0.2), conical shadow, no drag, no tides, no Earth radiation, relativity NONE, RK78 1e-8 / 1e-3 to 300 s, IERS finals rows; no space weather (drag off)',
      badBuild,
    },
    statistic: `exp(median over windows of ln(numerator / denominator)); e the 3D RMS RTN position error (km) of the lead day's bin counted from the end of the 72 h fit. windowCluster: 95 % bootstrap with the window as the cluster, ${DRAWS} draws, ${SEEDS} seeds (SHA-256 of FFM-GEO-70X70|<population>|72|<lead>|seed<i>), the first seed's interval printed, every seed's bounds and their spread beside it. objectWeek: the same over satellite x ISO-week clusters, report only.`,
    windows: WINDOWS,
    gfz: { label: 'FFM 2.2.1 at 70x70 against AP 0.5.1 as stored', cells },
    gfz20: { label: 'the audit cells, FFM 2.2.0 at 20x20 against AP 0.5.1, read again under the five seeds (information)', cells: cells20 },
    degreeEffect: { label: 'FFM 70x70 against FFM 20x20 on the same windows (information): what the field does to FFM\'s own GEO error', cells: effect },
    verdict,
  };
}

function readme(t) {
  const L = [];
  const spread = (s) => `[${s.interval.join(', ')}]; lower over ${SEEDS} seeds ${s.spread.lowerMin} to ${s.spread.lowerMax} (range ${s.spread.lowerRange}), ${s.side}`;
  const table = (cells, numLabel, denLabel) => {
    L.push(`| Fit / lead (h) | Windows | Satellites | ${numLabel} worse | ${numLabel} / ${denLabel} | 95 % window-cluster, ${SEEDS} seeds | 95 % object-week (report only) | Median ${numLabel} km | Median ${denLabel} km |`, '| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |');
    for (const c of cells) L.push(c.windows ? `| ${c.fit}/${c.lead} | ${c.windows} | ${c.satellites} | ${c.numeratorWorse} | ${c.ratio} | ${spread(c.windowCluster)} | [${c.objectWeek.interval.join(', ')}] over ${c.objectWeek.clusters}; lower ${c.objectWeek.spread.lowerMin} to ${c.objectWeek.spread.lowerMax} | ${c.medianKm.numerator} | ${c.medianKm.denominator} |` : `| ${c.fit}/${c.lead} | 0 | - | - | - | - | - | - | - |`);
  };
  L.push('# GEO gravity degree: the 45 GE windows flown again with FFM at 70x70, report only', '');
  L.push(`Registered in \`${t.registered}\` (commit ${t.registration.commit.slice(0, 8)}, ${t.registration.committed}; first row flown ${t.registration.firstRowFlownAt}; registration before the first row: ${t.registration.registrationBeforeFirstRow}). ${t.reading}. Written by \`experiments/operator-theory/ffm-geo-70x70.mjs\`; \`--check\` reproduces this file and \`table.json\` from the stores.`, '');
  L.push('## Verdict', '', `**${t.verdict.reading}: ${t.verdict.statement}.**`, '');
  if (t.verdict.facts) L.push(`${t.verdict.facts}.`, '');
  if (t.verdict.record) L.push(`Record named: \`${t.verdict.record.id}\`. What it should set: ${t.verdict.record.shouldSet}.`, '');
  L.push('## FFM 2.2.1 at 70x70 against AP 0.5.1', '', `${t.windows.length} windows registered; ${t.builds.ffm70.rowsPresent} rows in \`${t.builds.ffm70.store}\`, ${t.builds.ffm70.rowsFlown} flown${t.builds.ffm70.failures.length ? ` (${t.builds.ffm70.failures.map((f) => `${f.key}: ${f.error}`).join('; ')})` : ''}. FFM ${t.builds.ffm70.version} (wasm ${t.builds.ffm70.wasmSha256}, modules ${t.builds.ffm70.modulesCommit}) at ${t.builds.ffm70.degree}x${t.builds.ffm70.order}, fitted by ${t.builds.ffm70.fittedBy}; AP ${t.builds.ap.version} (\`${t.builds.ap.store}\`, ${t.builds.ap.arm}). ${t.statistic}`, '');
  table(t.gfz.cells, 'FFM 70x70', 'AP');
  L.push('', 'Per satellite (windows, FFM 70x70 / AP):', '', `| Satellite | ${t.gfz.cells.map((c) => `${c.fit}/${c.lead}`).join(' | ')} |`, `| --- | ${t.gfz.cells.map(() => '---').join(' | ')} |`);
  for (const n of SATS) L.push(`| ${n} | ${t.gfz.cells.map((c) => c.perSatellite?.[n] ? `${c.perSatellite[n].windows}, ${c.perSatellite[n].ratio}` : '-').join(' | ')} |`);
  L.push('', '## The degree effect: FFM 70x70 against FFM 20x20 (information)', '', `${t.degreeEffect.label}; the 20x20 rows are \`${t.builds.ffm20.store}\` (FFM ${t.builds.ffm20.version}, wasm ${t.builds.ffm20.wasmSha256}).`, '');
  table(t.degreeEffect.cells, 'FFM 70x70', 'FFM 20x20');
  L.push('', '## The audit cells under the five seeds (information)', '', `${t.gfz20.label}.`, '');
  table(t.gfz20.cells, 'FFM 20x20', 'AP');
  L.push('', '## Settings', '', `${t.builds.settings}. ${t.builds.identity221}. ${t.builds.ap.identity}.`, '');
  return `${L.join('\n')}\n`;
}

function verifyHashes() {
  const bad = [], missing = [];
  for (const [rel, want] of Object.entries(SRC.experiments)) { const f = path.join(REPO, rel); if (!fs.existsSync(f)) { missing.push(rel); continue; } if (sha256(fs.readFileSync(f)) !== want) bad.push(rel); }
  let modulesChecked = 0;
  if (fs.existsSync(MODULES)) for (const [rel, want] of Object.entries(SRC.modules)) { const f = path.join(MODULES, rel); if (!fs.existsSync(f)) { missing.push(`modules:${rel}`); continue; } modulesChecked += 1; if (sha256(fs.readFileSync(f)) !== want) bad.push(`modules:${rel}`); }
  return { bad, missing, modulesChecked, modulesRoot: fs.existsSync(MODULES) ? MODULES : null };
}

if (FLY) { await fly(); } else {
  const table = build();
  const tableBytes = `${JSON.stringify(table, null, 1)}\n`, readmeBytes = readme(table);
  const hashes = verifyHashes();
  const line = (label, c) => c.windows ? `${label}  ${c.fit}/${String(c.lead).padStart(3)}  n ${String(c.windows).padStart(2)}  ratio ${c.ratio}  window-cluster [${c.windowCluster.interval.join(', ')}]  lower over ${SEEDS} seeds ${c.windowCluster.spread.lowerMin}..${c.windowCluster.spread.lowerMax} (range ${c.windowCluster.spread.lowerRange}; ${c.windowCluster.side})  object-week [${c.objectWeek.interval.join(', ')}]` : `${label}  ${c.fit}/${c.lead}  no rows`;
  for (const c of table.gfz.cells) console.log(line('70x70/AP ', c));
  for (const c of table.degreeEffect.cells) console.log(line('70x70/20 ', c));
  for (const c of table.gfz20.cells) console.log(line('20x20/AP ', c));
  console.log(`rows: ${table.builds.ffm70.rowsFlown} of ${WINDOWS.length} flown (${table.builds.ffm70.rowsPresent} present); registration ${table.registration.commit?.slice(0, 8)} ${table.registration.committed} before first row ${table.registration.firstRowFlownAt}: ${table.registration.registrationBeforeFirstRow}`);
  console.log(`verdict: ${table.verdict.reading}: ${table.verdict.statement}`);
  console.log(`sources: ${Object.keys(SRC.experiments).length} experiments files re-hashed, ${hashes.modulesChecked} of ${Object.keys(SRC.modules).length} module files re-hashed${hashes.modulesRoot ? ` at ${hashes.modulesRoot}` : ' (no modules root)'}${hashes.missing.length ? `; not found: ${hashes.missing.join(', ')}` : ''}${hashes.bad.length ? `; MISMATCH: ${hashes.bad.join(', ')}` : ''}`);
  const problems = [];
  if (hashes.bad.length) problems.push('a cited source differs from its registered hash');
  if (table.builds.badBuild.length) problems.push(`rows not on FFM ${FFM_221.version} ${FFM_221.wasmSha256} at ${DEGREE}x${DEGREE}: ${table.builds.badBuild.join(', ')}`);
  if (table.builds.ffm70.foreignKeys.length) problems.push(`rows outside the 45 registered windows: ${table.builds.ffm70.foreignKeys.join(', ')}`);
  if (CHECK) {
    if (!table.registration.registrationBeforeFirstRow) problems.push('the registration does not predate the first row');
    if (table.builds.ffm70.rowsPresent !== WINDOWS.length) problems.push(`${table.builds.ffm70.rowsPresent} of ${WINDOWS.length} windows have a row`);
    const same = (name, bytes) => fs.existsSync(path.join(OUT, name)) && fs.readFileSync(path.join(OUT, name), 'utf8') === bytes;
    if (!same('table.json', tableBytes) || !same('README.md', readmeBytes)) problems.push('table.json or README.md differs from what the stores give');
    console.log(problems.length ? `FAIL: ${problems.join('; ')}` : `PASS: table.json and README.md reproduce from the stores; every row on FFM ${FFM_221.version} at ${DEGREE}x${DEGREE}; registration before the first row; every reachable source holds its hash; the five-seed spread and the verdict stand`);
    process.exit(problems.length ? 1 : 0);
  }
  if (problems.length) { console.log(`FAIL: ${problems.join('; ')}`); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'table.json'), tableBytes);
  fs.writeFileSync(path.join(OUT, 'README.md'), readmeBytes);
  console.log(`wrote ${OUT}/table.json and README.md`);
}
