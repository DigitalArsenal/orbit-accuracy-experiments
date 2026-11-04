// XP-ARM-0-2-1.md: the Space Force XP on sgp4-xp 0.2.1 beside 0.1.1 on the same registered next-file pairs (ap/xp-arm-0-2-1 against ap/b0411), and on AP5's and
// AP6's windows (ap/b051 against ap/b0411), with the 2x2's prediction for GE and IG. Statistics only.
//   node experiments/operator-theory/xp-arm-0-2-1.mjs --out results/operator-theory/xp-arm-0-2-1
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { binOf, pct, asc } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';
import { BUILD_NOTE, COLUMN_BUILDS, BUILD_RECORDS } from './lib/build.mjs';
import { HELD_ROW, HELD_NORADS, pairKey } from './lib/pairs.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const A = '/opt/data/sdn-archive/operator-theory/ap', OLD = path.join(A, 'b0411'), NEW = path.join(A, 'xp-arm-0-2-1'), B051 = path.join(A, 'b051');
const REGISTRATION = 'cd2ef8c94826d12318d2e6f3b4c7b92583b37814', TWO_BY_TWO = 'results/operator-theory/geo-sgp4-one-mode/results.json', NEAR_KM = 0.02;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const r4 = (x) => (x === null || x === undefined ? null : Number(x.toFixed(4)));
const med = (v) => r4(pct([...v].sort(asc), 0.5));
const files = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f)) : []);
const read = new Map(), skipped = new Map();
/** A store's rows; a held row is skipped unparsed and counted. */
const rowsOf = (list) => list.flatMap((f) => {
  const bytes = fs.readFileSync(f), lines = bytes.toString('utf8').split('\n').filter(Boolean), kept = lines.filter((l) => !HELD_ROW.test(l));
  read.set(f, sha(bytes)); skipped.set(f, lines.length - kept.length);
  return kept.map((l) => JSON.parse(l));
});
const LASER = /^rows-\d+\.jsonl$/, PROVIDER_ROWS = /^rows(-iss)?-\d+\.jsonl$/;

// The next-file pairs: each registered pair (the 0.1.1 rows' keys) flown by both builds.
const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const PROVIDERS = { iss: ['NASA ISS', 'Low orbit, crewed'], css: ['China Space Station', 'Low orbit, crewed'], planet: ['Planet (Flock)', 'Low orbit, imaging fleet'], gps: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], glonass: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], intelsat: ['Intelsat', 'Geostationary, station-kept'], ses: ['SES', 'Geostationary, station-kept'] };
const SETS = [
  { name: 'laser', store: 'ussf-laser', re: LASER, fits: [48, 72], group: (r) => [r.source.endsWith('-leo') ? 'Low orbit' : NAV.test(r.object) ? 'Navigation' : 'Geodetic', r.source.split('-')[1]] },
  { name: 'providers', store: 'ussf-providers', re: PROVIDER_ROWS, fits: [24, 48], group: (r) => [PROVIDERS[r.source][1], PROVIDERS[r.source][0]] },
];
const next = [];
for (const s of SETS) {
  const old = new Map(rowsOf(files(path.join(OLD, s.store), s.re)).map((r) => [pairKey(r), r])), flown = rowsOf(files(path.join(NEW, s.store), s.re)), now = new Map(flown.map((r) => [pairKey(r), r]));
  const held = files(path.join(NEW, s.store), s.re).reduce((n, f) => n + skipped.get(f), 0) + [...now.values()].filter((r) => HELD_NORADS.has(Number(r.norad))).length;
  const set = { set: s.name, store: path.join(NEW, s.store), registered: old.size, run: [...now.keys()].filter((k) => old.has(k)).length, notRegistered: [...now.keys()].filter((k) => !old.has(k)).length, flownTwice: flown.length - now.size, held, failed: {}, cells: [] };
  for (const fit of s.fits) {
    const arm = `U-XP@${fit}`;
    set.failed[arm] = { '0.1.1': [...old.values()].filter((r) => !Number.isFinite(r.arms[arm]?.km)).length, '0.2.1': [...now.values()].filter((r) => !Number.isFinite(r.arms[arm]?.km)).length };
  }
  const buckets = new Map();
  for (const [k, n] of now) {
    const o = old.get(k), lead = binOf(n.leadHours);
    if (!o || lead === null) continue;
    const [regime, provider] = s.group(n);
    for (const g of [`${regime}|All`, `${regime}|${provider}`]) (buckets.get(`${g}|${lead}`) ?? buckets.set(`${g}|${lead}`, []).get(`${g}|${lead}`)).push([o, n]);
  }
  for (const [k, list] of buckets) {
    const [regime, provider, lead] = k.split('|');
    for (const fit of s.fits) {
      const arm = `U-XP@${fit}`, both = list.filter(([o, n]) => Number.isFinite(o.arms[arm]?.km) && Number.isFinite(n.arms[arm]?.km));
      if (!both.length) continue;
      set.cells.push({ regime, provider, fit, lead: Number(lead), pairs: both.length, medianKm: { '0.1.1': med(both.map(([o]) => o.arms[arm].km)), '0.2.1': med(both.map(([, n]) => n.arms[arm].km)) }, p95Km: { '0.1.1': r4(pct(both.map(([o]) => o.arms[arm].km).sort(asc), 0.95)), '0.2.1': r4(pct(both.map(([, n]) => n.arms[arm].km).sort(asc), 0.95)) } });
    }
  }
  set.cells.sort((a, b) => a.regime.localeCompare(b.regime) || (a.provider === b.provider ? 0 : a.provider === 'All' ? -1 : b.provider === 'All' ? 1 : a.provider.localeCompare(b.provider)) || a.fit - b.fit || a.lead - b.lead);
  next.push(set);
}

// AP5's and AP6's windows: the 0.2.1 flights of ap/b051 beside 0.1.1's, by group, arc and day, on windows both flew.
const truth = [];
for (const store of ['ussf-truth', 'ussf-truth2', 'ussf-regimes', 'ussf-regimes-hx', 'ussf-regimes-wa']) {
  const old = new Map(rowsOf(files(path.join(OLD, store), LASER)).map((r) => [r.key, r])), groups = new Map();
  for (const r of rowsOf(files(path.join(B051, store), LASER))) for (const arm of Object.keys(r.arms ?? {})) {
    const k = `${store === 'ussf-truth' ? 'T' : r.group}|${arm}`;
    (groups.get(k) ?? groups.set(k, []).get(k)).push([old.get(r.key)?.arms?.[arm], r.arms[arm]]);
  }
  for (const [k, list] of groups) {
    const [group, arm] = k.split('|'), days = {};
    for (const d of ['1', '2', '3', '7']) {
      const both = list.filter(([o, n]) => Number.isFinite(o?.days?.[d]?.e) && Number.isFinite(n?.days?.[d]?.e));
      if (both.length) days[d] = { windows: both.length, '0.1.1': med(both.map(([o]) => o.days[d].e)), '0.2.1': med(both.map(([, n]) => n.days[d].e)) };
    }
    truth.push({ group, label: group === 'T' ? 'Strong drag, 2025' : group === 'P' ? 'Strong drag, 2026' : group === 'S1' ? 'Near 700 km' : group === 'GN' ? 'Medium Earth orbit' : GROUPS[group].label, arm, days });
  }
}

// The 2x2's prediction: on GE and IG, the Space Force XP's day-1 median on 0.2.1, on the 2x2's paired windows, beside the Space Force sets flown on the whiteroom propagator (SW).
const twoByTwo = JSON.parse(fs.readFileSync(path.join(REPO, TWO_BY_TWO), 'utf8')), uSix = new Map(rowsOf(files(path.join(B051, 'ussf-regimes'), LASER)).map((r) => [r.key, r]));
const prediction = twoByTwo.armB.map((c) => {
  const l = c.leads['1'], v = l.keys.map((k) => uSix.get(k)?.arms?.U72?.days?.['1']?.e).filter(Number.isFinite);
  const u = med(v), sw = r4(l.cells.SW.median), ww = r4(l.cells.WW.median);
  return { group: c.group, windows: l.keys.length, flown: v.length, spaceForce021: u, spaceForce011: r4(l.cells.SS.median), spaceForceSetsOnWhiteroom: sw, whiteroom: ww, lessSW: r4(u - sw), lessWW: r4(u - ww), withinKm: NEAR_KM, within: Math.abs(u - sw) <= NEAR_KM };
});

// When the rows were made: the registration commit before the first row file of the store.
const rowFiles = SETS.flatMap((s) => files(path.join(NEW, s.store), s.re));
const runs = { registration: REGISTRATION, registered: new Date(execFileSync('git', ['-C', REPO, 'show', '-s', '--format=%cI', REGISTRATION]).toString().trim()).toISOString(), firstRowFile: new Date(Math.min(...rowFiles.map((f) => fs.statSync(f).birthtimeMs))).toISOString(), rowFiles: rowFiles.length, log: fs.readFileSync(path.join(NEW, 'runs.log'), 'utf8').split('\n').filter(Boolean) };

const doc = { registered: 'experiments/operator-theory/XP-ARM-0-2-1.md', reading: 'report only', build: BUILD_NOTE, builds: { '0.1.1': COLUMN_BUILDS.held.XPU.map((b) => b.key), '0.2.1': COLUMN_BUILDS.next.XPU.map((b) => b.key), records: BUILD_RECORDS }, runs, next, truth, prediction, storedHashes: Object.fromEntries([...read].sort()) };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'results.json'), `${JSON.stringify(doc, null, 1)}\n`);

const fig = (x) => (x === null ? '' : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3));
const pair = (c) => `${fig(c['0.1.1'])} / ${fig(c['0.2.1'])}`;
const md = ['# The Space Force XP on sgp4-xp 0.2.1', '', `Report only, registered in \`experiments/operator-theory/XP-ARM-0-2-1.md\` at ${REGISTRATION.slice(0, 7)} (${runs.registered}), before the first row (${runs.firstRowFile}). Build: ${BUILD_NOTE}; sgp4-xp 0.1.1 is ${COLUMN_BUILDS.held.XPU[0].commit.slice(0, 8)} (${COLUMN_BUILDS.held.XPU[0].sha256.slice(0, 12)}). Every figure is a median in km, 0.1.1 / 0.2.1, over the pairs or windows both builds flew.`, ''];
md.push('## Next-file pairs', '');
for (const s of next) {
  md.push(`${s.set === 'laser' ? 'ILRS prediction files' : 'Providers'}: ${s.registered} pairs registered, ${s.run} flown on 0.2.1, ${s.notRegistered} not registered, ${s.held} held. Without a figure, ${Object.entries(s.failed).map(([arm, f]) => `${arm} ${f['0.1.1']} on 0.1.1 and ${f['0.2.1']} on 0.2.1`).join(', ')}.`, '');
  const leads = s.set === 'laser' ? [24, 72, 168] : [12, 24, 48, 72];
  md.push(`| Regime | Provider | Fit | ${leads.map((l) => `${l} h`).join(' | ')} |`, `|---|---|---:|${leads.map(() => '---:').join('|')}|`);
  const keys = [...new Set(s.cells.map((c) => `${c.regime}|${c.provider}|${c.fit}`))];
  for (const k of keys) {
    const [regime, provider, fit] = k.split('|');
    const at = (l) => s.cells.find((c) => c.regime === regime && c.provider === provider && c.fit === Number(fit) && c.lead === l);
    md.push(`| ${regime} | ${provider} | ${fit} h | ${leads.map((l) => (at(l) ? `${pair(at(l).medianKm)} (${at(l).pairs})` : '')).join(' | ')} |`);
  }
  md.push('');
}
md.push('A next-file lead runs from the start of the older file to the start of the newer; the reference is the provider\'s later file, not truth. Every Starlink group is held: its pairs are not flown, and the SpaceX cells of `results/ap-truth/compare/cells.json` keep their 0.1.1 figures and say so.', '');
md.push('## Against precise orbits', '', 'AP5\'s and AP6\'s windows as flown into `ap/b051`, against `ap/b0411`. Day after the end of the fit.', '', '| Group | Arm | Day 1 | Day 2 | Day 3 | Day 7 | Windows |', '|---|---|---:|---:|---:|---:|---:|');
for (const t of truth) md.push(`| ${t.label} | ${t.arm} | ${['1', '2', '3', '7'].map((d) => (t.days[d] ? pair(t.days[d]) : '')).join(' | ')} | ${t.days['1']?.windows ?? ''} |`);
md.push('', '## The 2x2\'s prediction', '');
for (const p of prediction) md.push(`- ${p.group}, day 1, on the 2x2's ${p.windows} paired windows: the Space Force XP ${fig(p.spaceForce021)} km on 0.2.1 (${fig(p.spaceForce011)} on 0.1.1); its sets on the whiteroom propagator ${fig(p.spaceForceSetsOnWhiteroom)}; the whiteroom XP ${fig(p.whiteroom)}. Within ${p.withinKm} km of the sets on the whiteroom propagator: ${p.within ? 'yes' : 'no'} (${p.lessSW >= 0 ? '+' : ''}${p.lessSW} km).`);
md.push('', 'Rows: `/opt/data/sdn-archive/operator-theory/ap/xp-arm-0-2-1`. Figures and every cell as data: `results.json`.');
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
