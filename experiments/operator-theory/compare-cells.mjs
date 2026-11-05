// COMPARE.md: every figure of the comparison site's explorer, by reference, regime, provider, satellite, fit and lead. Statistics only.
//   node experiments/operator-theory/compare-cells.mjs --out results/ap-truth/compare/cells.json [--examples <dir>,<dir>]
//   node experiments/operator-theory/compare-cells.mjs --check     exit 1 unless cells.json reproduces from the stored rows byte for byte, carries the XP provenance
//                                                                 block, and names sdn-ap 0.5.1 on whiteroom XP cells only where the proof's stores feed them
// Each row names its fits' input and each column's builds by SHA-256 (lib/build.mjs COLUMN_BUILDS). AP on precise orbits is sdn-ap 0.5.1 (ap/b051). The Space
// Force XP is sgp4-xp 0.2.1 (ap/b051; the next-file pairs ap/xp-arm-0-2-1, XP-ARM-0-2-1.md). Whiteroom XP on precise orbits was flown on sdn-ap 0.4.11 and
// re-measured on 0.5.1 byte for byte on every stored window of its stores (PROOF): its cells name 0.5.1, the proof in the provenance block. Next-file AP and
// whiteroom XP ran on 0.4.11 alone and are left out until their 0.5.x rerun. Every Starlink group is held: no Starlink row or example is parsed, and the SpaceX
// rows are carried from HELD_FROM's cells.json, less their cells on builds no longer current (AP and whiteroom XP 0.4.11, the Space Force XP 0.1.1).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { binOf, pct, asc } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';
import { BUILD, AP_ARM, COLUMN_BUILDS, BUILD_RECORDS } from './lib/build.mjs';
import { HELD_ROW } from './lib/pairs.mjs';
import { windowState } from './lib/steps.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = path.join(ROOT, 'ap'), NEW = path.join(AP, BUILD), B051 = path.join(AP, 'b051'), XPARM = path.join(AP, 'xp-arm-0-2-1');
const HELD_FROM = '71b27aa50112ec0533359572597eb408491cdb2f';
// The proof that whiteroom XP on precise orbits is sdn-ap 0.5.1's: the re-measure on modules ea824356 found every stored XP window of these stores equal to
// 0.4.11's byte for byte (remeasure-0-5-1.json pairs: different 0). The SDN-AP session's ruling of 2026-11-05 relabels those cells and no others.
const PROOF = {
  commit: '71b27aa50112ec0533359572597eb408491cdb2f',
  table: 'experiments/operator-theory/results/remeasure-0-5-1.md',
  data: 'experiments/operator-theory/results/remeasure-0-5-1.json',
  stores: ['truth', 'truth2', 'regimes', 'regimes-hx', 'regimes-wa', 'compare-truth', 'compare-truth2'],
};
const AP_OF = (version) => Object.entries(BUILD_RECORDS).find(([, b]) => b.module === 'propagator/sdn-ap' && b.version === version)?.[0] ?? (() => { throw new Error(`no sdn-ap ${version} build record`); })();
const XP_MEASURED = AP_OF('0.4.11'), XP_EQUAL = AP_OF('0.5.1');
// The columns on builds no longer current: next-file AP and whiteroom XP (0.4.11), the held cells' Space Force XP (0.1.1).
const DROPPED = { next: ['XP', 'AP'], held: ['XP', 'XPU', 'AP'] };
// The maneuver flag (maneuver-flags.mjs): each cell's windows with a step of the truth's mean semimajor axis in the fit arc and in the forecast span to the lead.
// null where no detector ran: every next-file row, and the precise-orbit regimes other than Sentinel-1 and the altimetry satellites.
const FLAGGED = new Map(JSON.parse(fs.readFileSync(path.join(REPO, 'results/operator-theory/maneuver-flags/flags.json'), 'utf8')).windows.map((w) => [w.key, w]));
const NOT_TESTED = { burnsInFit: null, burnsInForecast: null };
const burns = (list, fit, lead) => {
  const flags = list.map((r) => FLAGGED.get(r.key));
  if (flags.some((w) => !w)) return NOT_TESTED;
  const at = flags.map((w) => windowState(w, fit, lead));
  return { burnsInFit: at.filter((x) => x.inFit).length, burnsInForecast: at.filter((x) => x.inForecast).length };
};
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l));
const rowsIn = (dir, re = /^rows-\d+\.jsonl$/) => fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const key = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const regimeOf = (r) => (r.source.endsWith('-leo') ? 'Low orbit' : NAV.test(r.object) ? 'Navigation' : 'Geodetic');
const providerOf = (r) => r.source.split('-')[1];
const round = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
/** The input class of a row's fits, and its builds: for each column in it, the keys of BUILD_RECORDS. */
const INPUT = { next: 'operator-file', truth: 'precise-orbit' };
const named = (row, set) => {
  const builds = COLUMN_BUILDS[set], build = {};
  const arms = Object.fromEntries(Object.entries(row.arms).filter(([column]) => !(DROPPED[set] ?? []).includes(column)));
  for (const column of Object.keys(arms)) {
    if (!builds[column]) throw new Error(`no build for ${column} in ${set}`);
    build[column] = builds[column].map((b) => b.key);
    if (set === 'truth' && column === 'XP') { if (build.XP.join() !== XP_MEASURED) throw new Error('whiteroom XP on precise orbits is not the measured build'); build.XP = [XP_EQUAL]; }
  }
  const { arms: _all, ...head } = row;
  return { ...head, input: INPUT[row.reference], build, arms };
};
/** Each truth XP value's store (the windows the re-measure covered), as read: store name to the window keys. */
const xpFrom = new Map();
const fed = (store, key) => (xpFrom.get(store) ?? xpFrom.set(store, new Set()).get(store)).add(key);

const rows = rowsIn(path.join(NEW, 'laser', 'forward'));
const stores = [new Map(rows.map((r) => [key(r), r])), ...[path.join(NEW, 'laser-xp', 'forward'), path.join(ROOT, 'cheaper', 'forward'), path.join(NEW, 'laser-sgp4'), path.join(NEW, 'laser-sgp4-high'), path.join(NEW, 'laser-sgp4-72'), path.join(XPARM, 'ussf-laser')].map((d) => new Map(rowsIn(d).map((r) => [key(r), r])))];
const km = (r, arm) => { for (const s of stores) { const v = s.get(key(r))?.arms[arm]?.km; if (Number.isFinite(v)) return v; } return undefined; };

/** The stored arm behind each column, by fit; a column with no arm for that fit or regime stays empty. */
const armsOf = (regime, fit) => (regime === 'Low orbit'
  ? { SGP4: `S@${fit}`, XP: `A-XP@${fit}`, XPU: `U-XP@${fit}`, AP: `${AP_ARM}@${fit}`, FFM20: fit === 48 ? 'F-M20@48' : null, FFM40: fit === 48 ? 'F-M40@48' : null, FFMfull: fit === 48 ? 'F-full@48' : null, Center: 'operator' }
  : { SGP4: `S@${fit}`, XP: `A-XP@${fit}`, XPU: `U-XP@${fit}`, AP: `${AP_ARM}@${fit}`, FFM20: fit === 48 ? 'F-H20@48' : null, FFM40: null, FFMfull: fit === 48 ? 'F-Hfull@48' : null, Center: 'operator' });

const cellOf = (list, regime, fit) => {
  const out = {};
  for (const [column, arm] of Object.entries(armsOf(regime, fit))) {
    if (!arm) continue;
    const v = list.map((r) => km(r, arm)).filter(Number.isFinite).sort(asc);
    if (v.length) out[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length];
  }
  return out;
};

const out = [];
const LEADS = [24, 48, 72, 96, 120, 144, 168];
const byBin = new Map();
for (const r of rows) {
  const lead = binOf(r.leadHours);
  if (!LEADS.includes(lead)) continue;
  const bucket = (k) => { const list = byBin.get(k) ?? []; list.push(r); byBin.set(k, list); };
  const regime = regimeOf(r), provider = providerOf(r);
  bucket(`regime|${regime}|All|All|${lead}`);
  bucket(`provider|${regime}|${provider}|All|${lead}`);
  bucket(`satellite|${regime}|${provider}|${r.object}|${lead}`);
}
for (const [k, list] of byBin) {
  const [level, regime, provider, satellite, lead] = k.split('|');
  for (const fit of [48, 72]) out.push(named({ reference: 'next', level, regime, provider, satellite, fit, lead: Number(lead), n: list.length, ...NOT_TESTED, arms: cellOf(list, regime, fit) }, 'next'));
}

// Against precise orbits: AP5.md's windows, by group, provider and satellite. Membership, SGP4, XP and FFM from the AP build's stores; AP and the Space Force XP by window from ap/b051.
const e = (r, arm, k) => r?.arms?.[arm]?.days?.[k]?.e;
const windowsIn = (...dirs) => new Map(dirs.flatMap((d) => rowsIn(d)).map((r) => [r.key, r]));
const u1 = windowsIn(path.join(B051, 'ussf-truth')), u2 = windowsIn(path.join(B051, 'ussf-truth2')), uSix = windowsIn(path.join(B051, 'ussf-regimes'), path.join(B051, 'ussf-regimes-hx'));
const a1 = windowsIn(path.join(B051, 'truth')), a2 = windowsIn(path.join(B051, 'truth2')), aSix = windowsIn(path.join(B051, 'regimes'), path.join(B051, 'regimes-hx'));
const ap1 = rowsIn(path.join(NEW, 'truth')), ap2 = rowsIn(path.join(NEW, 'truth2')), cmp1 = rowsIn(path.join(NEW, 'compare-truth')), cmp2 = rowsIn(path.join(NEW, 'compare-truth2'));
const PROVIDER = (name) => (/^Swarm/.test(name) ? 'ESA' : /^GRACE/.test(name) ? 'Data E' : /^Sentinel/.test(name) ? 'Copernicus' : 'ESA navigation');
const PUBLIC_NAME = (name) => (/^GRACE-FO/.test(name) ? `Research satellite ${name.at(-1)}` : name);
const CUTS = [
  { regime: 'Strong drag, 2025', store: 'compare-truth', ap: ap1, apNew: a1, cmp: cmp1, keep: (r) => !r.error, arcs: [24], ffm: 'FFM40', ussf: u1 },
  { regime: 'Strong drag, 2026', store: 'compare-truth2', ap: ap2, apNew: a2, cmp: cmp2, keep: (r) => r.group === 'P' && !r.error, arcs: [24, 72], ffm: 'FFM40', ussf: u2 },
  { regime: 'Near 700 km', store: 'compare-truth2', ap: ap2, apNew: a2, cmp: cmp2, keep: (r) => r.group === 'S1' && !r.error, arcs: [24, 72], ffm: 'FFM40', ussf: u2 },
  { regime: 'Medium Earth orbit', store: 'compare-truth2', ap: ap2, apNew: a2, cmp: cmp2, keep: (r) => r.group === 'GN' && !r.error, arcs: [24, 72], ffm: 'FFM20', ussf: u2 },
];
// --only 2025: the finished windows alone, while the others still run; a partial part is never published.
for (const cut of CUTS.filter((x) => !argOf('--only') || x.regime.includes(argOf('--only')))) {
  const inCut = cut.ap.filter(cut.keep), byKey = new Map(cut.cmp.map((r) => [r.key, r]));
  const levels = [['regime', 'All', 'All', inCut]];
  for (const provider of new Set(inCut.map((r) => PROVIDER(r.name)))) levels.push(['provider', provider, 'All', inCut.filter((r) => PROVIDER(r.name) === provider)]);
  for (const name of new Set(inCut.map((r) => r.name))) levels.push(['satellite', PROVIDER(name), PUBLIC_NAME(name), inCut.filter((r) => r.name === name)]);
  for (const [level, provider, satellite, list] of levels) for (const fit of cut.arcs) for (const day of ['1', '2', '3', '7']) {
    const arms = {};
    for (const [column, read] of [['SGP4', (r) => e(byKey.get(r.key), `S${fit}`, day)], ['XP', (r) => { const v = e(byKey.get(r.key), `XP${fit}`, day); if (Number.isFinite(v)) fed(cut.store, r.key); return v; }], ['XPU', (r) => e(cut.ussf.get(r.key), `U${fit}`, day)], ['AP', (r) => e(cut.apNew.get(r.key), `AP${fit}`, day)], [cut.ffm, (r) => e(byKey.get(r.key), `F${fit}`, day)]]) {
      const v = list.map(read).filter(Number.isFinite).sort(asc);
      if (v.length) arms[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length];
    }
    out.push(named({ reference: 'truth', level, regime: cut.regime, provider, satellite, fit, lead: Number(day) * 24, n: list.length, ...burns(list, fit, Number(day) * 24), arms }, 'truth'));
  }
}

// AP6.md's regimes, the same way.
if (fs.existsSync(path.join(NEW, 'regimes')) && !argOf('--only')) {
  const live = rowsIn(path.join(NEW, 'regimes')).filter((r) => !r.error);
  for (const [group, g] of Object.entries(GROUPS)) {
    const inGroup = live.filter((r) => r.group === group);
    const arcs = [...new Set(inGroup.flatMap((r) => Object.keys(r.arms).map((a) => Number(a.replace(/^\D+/, '')))))].sort((a, b) => a - b);
    const ffm = group === 'LS' || group === 'DO' ? 'FFM40' : 'FFM20';
    const levels = [['regime', 'All', 'All', inGroup], ['provider', g.provider, 'All', inGroup], ...[...new Set(inGroup.map((r) => r.name))].map((name) => ['satellite', g.provider, name, inGroup.filter((r) => r.name === name)])];
    for (const [level, provider, satellite, list] of levels) for (const fit of arcs) for (const day of ['1', '2', '3', '7']) {
      const arms = {};
      for (const [column, code] of [['SGP4', 'S'], ['XP', 'XP'], ['XPU', 'U'], ['AP', 'AP'], [ffm, 'F']]) {
        const v = list.map((r) => { const x = e(code === 'U' ? uSix.get(r.key) : code === 'AP' ? aSix.get(r.key) : r, `${code}${fit}`, day); if (code === 'XP' && Number.isFinite(x)) fed(group === 'HX' ? 'regimes-hx' : 'regimes', r.key); return x; }).filter(Number.isFinite).sort(asc);
        if (v.length) arms[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length];
      }
      out.push(named({ reference: 'truth', level, regime: g.label, provider, satellite, fit, lead: Number(day) * 24, n: list.length, ...burns(list, fit, Number(day) * 24), arms }, 'truth'));
    }
  }
}

// Every other provider that publishes states: SpaceX, NASA's ISS, the China Space Station, Planet, ESA's ultra-rapid orbits, Intelsat, SES. The reference is the provider's next file.
const PROVIDERS = { starlink: ['SpaceX', 'Low orbit, maneuvering'], iss: ['NASA ISS', 'Low orbit, crewed'], css: ['China Space Station', 'Low orbit, crewed'], planet: ['Planet (Flock)', 'Low orbit, imaging fleet'], gps: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], glonass: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], intelsat: ['Intelsat', 'Geostationary, station-kept'], ses: ['SES', 'Geostationary, station-kept'] };
const providerLeftOut = {};
if (fs.existsSync(path.join(NEW, 'providers')) && !argOf('--only')) {
  const pairKey = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
  const stored = new Map([...rowsIn(path.join(ROOT, 'forward')), ...rowsIn(path.join(ROOT, 'vendors', 'forward'))].map((r) => [pairKey(r), r]));
  const PROVIDER_ROWS = /^rows(-iss)?-\d+\.jsonl$/;
  const uProviders = new Map(rowsIn(path.join(XPARM, 'ussf-providers'), PROVIDER_ROWS).map((r) => [pairKey(r), r]));
  const all = rowsIn(path.join(NEW, 'providers'), PROVIDER_ROWS).filter((r) => !r.error && PROVIDERS[r.source]);
  // A Planet object with no catalog number: its successive files disagree by thousands of km for every arm, Planet's own forecast included, so it says nothing about a propagator.
  const live = all.filter((r) => r.source !== 'planet' || r.norad);
  providerLeftOut.planetPairsWithoutCatalogNumber = all.length - live.length;
  const kmOf = (r, arm) => r.arms[arm]?.km ?? stored.get(pairKey(r))?.arms[arm]?.km ?? uProviders.get(pairKey(r))?.arms[arm]?.km;
  const cell = (list, fit) => {
    const arms = {};
    for (const [column, names] of [['SGP4', [`S@${fit}`]], ['XP', [`A-XP@${fit}`]], ['XPU', [`U-XP@${fit}`]], ['AP', [`${AP_ARM}@${fit}`]], ['FFM40', [`F-M40@${fit}`]], ['FFMfull', [`F-NRLMSISE00@${fit}`, `F-NO-DRAG@${fit}`]], ['Center', ['operator']]]) {
      const v = list.map((r) => names.map((n) => kmOf(r, n)).find(Number.isFinite)).filter(Number.isFinite).sort(asc);
      if (v.length) arms[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length];
    }
    return arms;
  };
  const buckets = new Map();
  for (const r of live) {
    const lead = binOf(r.leadHours);
    if (lead === null) continue;
    const [provider, regime] = PROVIDERS[r.source];
    for (const k of [`regime|${regime}|All|All|${lead}`, `provider|${regime}|${provider}|All|${lead}`, `satellite|${regime}|${provider}|${r.object}|${lead}`]) (buckets.get(k) ?? buckets.set(k, []).get(k)).push(r);
  }
  for (const [k, list] of buckets) {
    const [level, regime, provider, satellite, lead] = k.split('|');
    for (const fit of [24, 48]) { const arms = cell(list, fit); if (Object.keys(arms).length) out.push(named({ reference: 'next', level, regime, provider, satellite, fit, lead: Number(lead), n: list.length, ...NOT_TESTED, arms }, 'next')); }
  }
}
// The held SpaceX rows, as HELD_FROM published them.
const HELD_REGIME = PROVIDERS.starlink[1];
const held = JSON.parse(execFileSync('git', ['-C', REPO, 'show', `${HELD_FROM}:results/ap-truth/compare/cells.json`], { maxBuffer: 1 << 26 }).toString('utf8')).rows.filter((r) => r.regime === HELD_REGIME);
if (!argOf('--only')) for (const r of held) { const { example, ...row } = r; out.push({ ...named({ ...row, ...NOT_TESTED }, 'held'), ...(example ? { example } : {}) }); }

// Each row's worked example: its own satellite's if there is one, else its provider's, else its regime's. Never a showcase example: those are chosen to show AP's lead, not to be typical.
// --examples a,b: the full examples' folders, a later folder's example replacing an earlier one's of the same id, as compare-examples-publish.mjs reads them; a dropped one links nothing.
// --check reads the examples the committed cells.json was written with.
const EXAMPLES = argOf('--examples') ?? (process.argv.includes('--check') ? '/opt/data/sdn-archive/operator-theory/ap/b0411/compare-examples-full,/opt/data/sdn-archive/operator-theory/ap/b051/compare-examples-burn-free' : null);
if (EXAMPLES) {
  const files = new Map();
  for (const dir of EXAMPLES.split(',')) for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'index.json' && !/starlink/i.test(n))) files.set(f, path.join(dir, f));
  const examples = [...files.values()].sort().map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))).filter((d) => !d.showcase && !d.dropped).map((d) => ({ id: d.id, reference: d.reference, regime: d.regime, provider: d.provider, satellite: d.satellite }));
  for (const r of out) {
    if (r.regime === HELD_REGIME) continue;
    const same = examples.filter((x) => x.reference === r.reference && x.regime === r.regime);
    const found = same.find((x) => x.satellite === r.satellite && (r.provider === 'All' || x.provider === r.provider)) ?? same.find((x) => r.provider !== 'All' && x.provider === r.provider) ?? (r.provider === 'All' ? same[0] : null);
    if (found) r.example = found.id;
  }
}
const order = { regime: 0, provider: 1, satellite: 2 };
out.sort((a, b) => a.reference.localeCompare(b.reference) || order[a.level] - order[b.level] || a.regime.localeCompare(b.regime) || a.provider.localeCompare(b.provider) || a.satellite.localeCompare(b.satellite) || a.fit - b.fit || a.lead - b.lead);
const doc = {
  registered: 'experiments/operator-theory/COMPARE.md, AP5.md, XP-ARM-0-2-1.md',
  columns: { SGP4: 'SGP4', XP: 'XP, whiteroom', XPU: 'XP, Space Force', AP: 'AP', FFM20: 'FFM 20×20', FFM40: 'FFM 40×40', FFMfull: 'FFM full', Center: "The center's own" },
  fields: 'input: what the fits read, operator-file (an operator\'s or a center\'s own prediction file) or precise-orbit (a precise orbit product). build: column to the keys of builds, each module build by SHA-256. arms: column to [median km, 95th percentile km, forecasts]. burnsInFit, burnsInForecast: of the n windows, those with a step of the truth\'s mean semimajor axis of 8 m or more in the fit arc, and in the forecast span to the lead (results/operator-theory/maneuver-flags); a window the detector could not cover counts in neither; null where no detector ran. lead: for reference next, hours from the start of the older file to the start of the newer, so a lead at or below the fit is not a forecast; for reference truth, hours past the end of the fit.',
  // the builds the rows name, and the build whiteroom XP was measured on (the provenance's measuredOn)
  builds: Object.fromEntries(Object.entries(BUILD_RECORDS).filter(([k]) => k === XP_MEASURED || out.some((r) => Object.values(r.build ?? {}).some((keys) => keys.includes(k))))),
  provenance: {
    XP: {
      reference: 'truth',
      build: XP_EQUAL,
      measuredOn: XP_MEASURED,
      statement: 'Whiteroom XP on precise orbits was flown on sdn-ap 0.4.11; re-measured on sdn-ap 0.5.1 (modules ea824356), every stored window of these stores is equal byte for byte, so its cells name 0.5.1.',
      proof: { commit: PROOF.commit, table: PROOF.table, data: PROOF.data },
      stores: PROOF.stores,
    },
  },
  dropped: 'Next-file AP and whiteroom XP (sdn-ap 0.4.11, no re-measure) and the held SpaceX cells on sgp4-xp 0.1.1, until their rerun on the current builds.',
  leftOut: providerLeftOut,
  rows: out,
};
if (process.argv.includes('--check')) check(); else fs.writeFileSync(argOf('--out'), `${JSON.stringify(doc)}\n`);
/** cells.json reproduces; the provenance block is present; the relabel stands only on the proof's stores, each with no differing window. */
function check() {
  const faults = [];
  const committed = fs.readFileSync(path.join(REPO, 'results/ap-truth/compare/cells.json'), 'utf8');
  if (committed !== `${JSON.stringify(doc)}\n`) faults.push('results/ap-truth/compare/cells.json does not reproduce from the stored rows');
  const proof = JSON.parse(execFileSync('git', ['-C', REPO, 'show', `${PROOF.commit}:${PROOF.data}`], { maxBuffer: 1 << 26 }).toString('utf8'));
  const xpPairs = (store) => proof.pairs.filter((p) => p.store === store && p.against.startsWith('b0411/')).flatMap((p) => Object.entries(p.arms).filter(([arm]) => /^XP\d+$/.test(arm)));
  for (const [store, keys] of xpFrom) {
    if (!PROOF.stores.includes(store)) faults.push(`whiteroom XP read from ${store}, a store the proof does not cover`);
    const arms = xpPairs(store);
    if (!arms.length || arms.some(([, c]) => c.different !== 0 || c.notStored !== 0)) faults.push(`the proof has no clean whiteroom XP re-measure of ${store}`);
    if (keys.size > Math.max(...arms.map(([, c]) => c.equal))) faults.push(`${store}: ${keys.size} windows feed whiteroom XP, more than the proof's equal windows`);
  }
  // HX's windows are read from the regimes store: each equals the regimes-hx store the proof covers.
  const hx = new Map(rowsIn(path.join(NEW, 'regimes-hx')).map((r) => [r.key, r]));
  for (const r of rowsIn(path.join(NEW, 'regimes')).filter((x) => x.group === 'HX' && !x.error)) for (const arm of Object.keys(r.arms).filter((a) => /^XP\d+$/.test(a))) if (JSON.stringify(r.arms[arm]) !== JSON.stringify(hx.get(r.key)?.arms?.[arm])) faults.push(`HX ${r.key} ${arm} differs from regimes-hx`);
  const p = doc.provenance?.XP;
  if (!p || p.build !== XP_EQUAL || p.measuredOn !== XP_MEASURED || p.proof.commit !== PROOF.commit || p.stores.join() !== PROOF.stores.join()) faults.push('the provenance block is missing or does not name the proof');
  const relabeled = doc.rows.filter((r) => r.build?.XP?.includes(XP_EQUAL));
  if (relabeled.some((r) => r.reference !== 'truth')) faults.push('a row off precise orbits names whiteroom XP on 0.5.1');
  if (doc.rows.some((r) => r.build?.XP?.includes(XP_MEASURED) || r.build?.AP?.includes(XP_MEASURED) || Object.values(r.build ?? {}).some((k) => k.some((x) => doc.builds[x]?.version === '0.1.1')))) faults.push('a cell names sdn-ap 0.4.11 or sgp4-xp 0.1.1');
  if (doc.rows.some((r) => r.reference === 'next' && (r.arms.XP || r.arms.AP))) faults.push('a next-file row carries AP or whiteroom XP');
  console.log(faults.length ? `COMPARE CELLS: FAIL\n${faults.slice(0, 10).join('\n')}` : `COMPARE CELLS: PASS (${doc.rows.length} rows reproduce; whiteroom XP on 0.5.1 in ${relabeled.length} precise-orbit rows, fed by ${[...xpFrom].map(([k, v]) => `${k} ${v.size}`).join(', ')}, each a store the proof covers with no differing window; no cell on sdn-ap 0.4.11 or sgp4-xp 0.1.1)`);
  process.exit(faults.length ? 1 : 0);
}
const counts = {};
for (const r of out) counts[`${r.reference}/${r.level}`] = (counts[`${r.reference}/${r.level}`] ?? 0) + 1;
console.log(counts, 'rows', out.length, 'bytes', fs.statSync(argOf('--out')).size);
