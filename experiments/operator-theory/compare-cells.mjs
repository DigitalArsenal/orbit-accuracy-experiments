// COMPARE.md: every figure of the comparison site's explorer, by reference, regime, provider, satellite, fit and lead. Statistics only.
//   node experiments/operator-theory/compare-cells.mjs --out results/ap-truth/compare/cells.json [--examples <dir>,<dir>]
//   node experiments/operator-theory/compare-cells.mjs --check     exit 1 unless cells.json and hx-0-6-3.json reproduce from the stored rows byte for byte, the
//                                                                 provenance block names the proofs, and sdn-ap 0.6.4 stands on every AP and whiteroom XP cell
//                                                                 on precise orbits: measured on the THEMIS and Chandra rows, by identity on every other
// Each row names its fits' input and each column's builds by SHA-256 (lib/build.mjs COLUMN_BUILDS). AP on precise orbits names sdn-ap 0.6.4 (AP064, on the identity IDENTITY_064 from 0.6.3): the Highly
// elliptical THEMIS and Chandra rows (HX) are flown on 0.6.3 (ap/b063/regimes-hx, all-regimes.mjs --ap-build), the grid 0.6.3 changes above an eccentricity of 0.3;
// every other precise-orbit AP cell was flown on 0.5.1 (ap/b051), whose flights 0.6.3 equals byte for byte at e 0.3 and below (IDENTITY: 53 of 53 example sets,
// 6 of 6 fits, 8 of 8 fixtures at experiments 9de1a40ff; 56 of 56 examples 0.5.1 to 0.6.2 at aa2a0a7b). The Space Force XP is sgp4-xp 0.2.1 (ap/b051; the
// next-file pairs ap/xp-arm-0-2-1, XP-ARM-0-2-1.md). Whiteroom XP on precise orbits was flown on sdn-ap 0.4.11, re-measured on 0.5.1 byte for byte on every
// stored window of its stores (PROOF), and 0.6.3 equals 0.5.1 on whiteroom XP in 56 of 56 examples (IDENTITY): and 0.6.4 equals 0.6.3 there (IDENTITY_064): its cells name 0.6.4, all the proofs in the
// provenance block. Next-file AP and whiteroom XP ran on 0.4.11 alone and are left out until their rerun. Every Starlink group is held: no Starlink row or example is parsed, and the SpaceX
// rows are carried from HELD_FROM's cells.json, less their cells on builds no longer current (AP and whiteroom XP 0.4.11, the Space Force XP 0.1.1).
// Each FFM cell names the integrator its fits and flights ran: the one algorithm every FFM request of this harness carries (lib/frame.mjs, the request
// builder lib/fit.mjs and lib/host.mjs go through), read from that source at generation and never retyped; the site labels each FFM cell with its
// build and integrator ("FFM 2.2.0, RK78"). Every FFM figure is propagator/ffm 2.2.0's (lib/build.mjs FFM_220): read from the stores cycle-ffm220.sh wrote under
// ap/ffm220 (the same windows, files and pairs at each arm's settings), never from an earlier build's store; the held SpaceX cells, flown on 2.0.4, are dropped.
// --check also holds every FFM cell to that integrator and to that build, and counts them.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { binOf, pct, asc } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';
import { BUILD, AP_ARM, COLUMN_BUILDS, BUILD_RECORDS, FFM_220 } from './lib/build.mjs';
import { HELD_ROW } from './lib/pairs.mjs';
import { windowState } from './lib/steps.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = path.join(ROOT, 'ap'), NEW = path.join(AP, BUILD), B051 = path.join(AP, 'b051'), B063 = path.join(AP, 'b063'), XPARM = path.join(AP, 'xp-arm-0-2-1'), FFM = path.join(AP, 'ffm220');
// The AP build every precise-orbit AP and whiteroom XP cell names (sdn-ap-site-accuracy-tables-0-6-3-20261106): propagator/sdn-ap 0.6.3, the site's shipped build.
const AP063 = { module: 'propagator/sdn-ap', version: '0.6.3', commit: '93cb5a0584fa728864e4426cc9ceb368936589f9', sha256: 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e' };
AP063.key = `${AP063.module}@${AP063.sha256.slice(0, 12)}`;
// The build the site ships (sdn-ap-site-module-0-6-4-20261106): propagator/sdn-ap 0.6.4, named by its canonical module hash (sds.* sections stripped, what the signature covers), the signed bundle's whole-file hash beside it.
const AP064 = { module: 'propagator/sdn-ap', version: '0.6.4', commit: 'cfd750eb8de2f5d7c339173ee674bc7a481da8c2', sha256: 'fd1ef4682edc68836d27fdb1f606a45b22bb3605354c55312287f87771a804b5', bundleSha256: 'e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d' };
AP064.key = `${AP064.module}@${AP064.sha256.slice(0, 12)}`;
const RECORDS = { ...BUILD_RECORDS, [AP063.key]: { module: AP063.module, version: AP063.version, commit: AP063.commit, sha256: AP063.sha256 }, [AP064.key]: { module: AP064.module, version: AP064.version, commit: AP064.commit, sha256: AP064.sha256, bundleSha256: AP064.bundleSha256 } };
// The identity that carries 0.6.3 to 0.6.4: the switch record's table (tesseral-switch-by-class): 0.6.4 moves non-resonant sets at e 0.05 to 0.3 alone; seeded sets outside that band equal 106 of 106 and published examples 56 of 56, none in the band; compare-examples.mjs --reflight on 0.6.4 finds the same on every published example (COMPARE.md).
const IDENTITY_064 = { commit: '2d6974aae965267c0da60aae981ed93904c3c590', table: 'results/ap-truth/tesseral-switch-by-class/table.json', readme: 'results/ap-truth/tesseral-switch-by-class/README.md', band: { nonResonantFrom: 0.05, resonantFrom: 0.3 } };
// The identity that carries the 0.5.1 flights to 0.6.3 at e 0.3 and below: the 0.6.3 version step (version-step.json: the dist aa3ed22a against the candidate it was
// cut from, 56 of 56 example sets, 6 of 6 fits, 8 of 8 fixtures identical; fit.e2e 53 of 53 example sets at e 0.3 and below identical to 0.6.2) and the candidate's
// acceptance list (final-build.json: 53 of 53 at e 0.3 and below identical to 0.6.2, the 3 above it changed by design), with 0.6.2 equal to 0.5.1 on all 56 published
// examples (COMPARE.md, amendment of 2026-11-05; whiteroom XP equal through 0.6.3 in all 56, amendment of 2026-11-06).
const IDENTITY = {
  commit: '9de1a40ff5d8eacfc19eef095cb5453a59a84539',
  step: 'results/ap-truth/themis-ripple-fix/version-step.json',
  final: 'results/ap-truth/themis-ripple-fix/final-build.json',
  examples: { from051to062: 'aa2a0a7bab3f4550bcfa6b028bff36283ac7f46c', from062to063: '58dcdd66da2a118510c78f52ec3e92928e22e3ce' },
  eMax: 0.3,
};
const HELD_FROM = '71b27aa50112ec0533359572597eb408491cdb2f';
// The integrator every FFM fit and flight ran: lib/frame.mjs builds each request's integrator settings with one ALGORITHM, read here from its source.
const FRAME = fs.readFileSync(path.join(REPO, 'experiments/operator-theory/lib/frame.mjs'), 'utf8');
const ALGORITHMS = [...new Set([...FRAME.matchAll(/ALGORITHM:\s*P\.\w+\.(\w+)\b/g)].map((m) => m[1]))];
if (ALGORITHMS.length !== 1) throw new Error(`lib/frame.mjs names ${ALGORITHMS.length ? ALGORITHMS.join(', ') : 'no'} integrator algorithm; every FFM request carries one`);
const INTEGRATOR = ALGORITHMS[0];
// The proof that whiteroom XP on precise orbits is sdn-ap 0.5.1's: the re-measure on modules ea824356 found every stored XP window of these stores equal to
// 0.4.11's byte for byte (remeasure-0-5-1.json pairs: different 0). The SDN-AP session's ruling of 2026-11-05 relabels those cells and no others.
const PROOF = {
  commit: '71b27aa50112ec0533359572597eb408491cdb2f',
  table: 'experiments/operator-theory/results/remeasure-0-5-1.md',
  data: 'experiments/operator-theory/results/remeasure-0-5-1.json',
  stores: ['truth', 'truth2', 'regimes', 'regimes-hx', 'regimes-wa', 'compare-truth', 'compare-truth2'],
};
const AP_OF = (version) => Object.entries(RECORDS).find(([, b]) => b.module === 'propagator/sdn-ap' && b.version === version)?.[0] ?? (() => { throw new Error(`no sdn-ap ${version} build record`); })();
// Whiteroom XP: measured on 0.4.11, equal on 0.5.1 (PROOF) and on 0.6.3 (IDENTITY). AP: measured on 0.5.1, equal on 0.6.3 (IDENTITY) except the HX rows, measured on 0.6.3; 0.6.4 equal to 0.6.3 outside its band (IDENTITY_064), and no cell is in the band.
const XP_MEASURED = AP_OF('0.4.11'), XP_REMEASURED = AP_OF('0.5.1'), AP_MEASURED = AP_OF('0.5.1'), XP_EQUAL = AP064.key, AP_NAMED = AP064.key, HX_FLOWN = AP063.key;
const HX_LABEL = GROUPS.HX.label;
// The columns on builds no longer current: next-file AP and whiteroom XP (0.4.11), the held cells' Space Force XP (0.1.1) and FFM (2.0.4).
const DROPPED = { next: ['XP', 'AP'], held: ['XP', 'XPU', 'AP', 'FFM20', 'FFM40', 'FFMfull'] };
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
  const builds = COLUMN_BUILDS[set], build = {}, integrator = {};
  const arms = Object.fromEntries(Object.entries(row.arms).filter(([column]) => !(DROPPED[set] ?? []).includes(column)));
  for (const column of Object.keys(arms)) {
    if (!builds[column]) throw new Error(`no build for ${column} in ${set}`);
    build[column] = builds[column].map((b) => b.key);
    if (column.startsWith('FFM')) integrator[column] = INTEGRATOR;
    if (set === 'truth' && column === 'XP') { if (build.XP.join() !== XP_MEASURED) throw new Error('whiteroom XP on precise orbits is not the measured build'); build.XP = [XP_EQUAL]; }
    if (set === 'truth' && column === 'AP') { if (build.AP.join() !== AP_MEASURED) throw new Error('AP on precise orbits is not the measured build'); build.AP = [AP_NAMED]; }
  }
  const { arms: _all, ...head } = row;
  return { ...head, input: INPUT[row.reference], build, integrator, arms };
};
/** Each truth XP value's store (the windows the re-measure covered), as read: store name to the window keys. */
const xpFrom = new Map();
const fed = (store, key) => (xpFrom.get(store) ?? xpFrom.set(store, new Set()).get(store)).add(key);

const rows = rowsIn(path.join(NEW, 'laser', 'forward'));
const stores = [new Map(rows.map((r) => [key(r), r])), ...[path.join(NEW, 'laser-xp', 'forward'), path.join(ROOT, 'cheaper', 'forward'), path.join(NEW, 'laser-sgp4'), path.join(NEW, 'laser-sgp4-high'), path.join(NEW, 'laser-sgp4-72'), path.join(XPARM, 'ussf-laser')].map((d) => new Map(rowsIn(d).map((r) => [key(r), r])))];
const ffmLaser = new Map(rowsIn(path.join(FFM, 'cheaper', 'forward')).map((r) => [key(r), r]));
/** An arm's km: FFM's from ffm220 alone, every other arm from the first store that holds it. */
const km = (r, arm) => { if (arm.startsWith('F-')) { const v = ffmLaser.get(key(r))?.arms[arm]?.km; return Number.isFinite(v) ? v : undefined; } for (const s of stores) { const v = s.get(key(r))?.arms[arm]?.km; if (Number.isFinite(v)) return v; } return undefined; };

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
// AP's windows: ap/b051 everywhere but the HX regime, whose rows are ap/b063/regimes-hx (sdn-ap 0.6.3, all-regimes.mjs --arms AP --groups HX --ap-build); the 0.5.1 HX rows stay for hx-0-6-3.json.
const a1 = windowsIn(path.join(B051, 'truth')), a2 = windowsIn(path.join(B051, 'truth2')), hxOld = windowsIn(path.join(B051, 'regimes-hx')), hxNew = windowsIn(path.join(B063, 'regimes-hx')), aSix = windowsIn(path.join(B051, 'regimes'), path.join(B063, 'regimes-hx'));
const ap1 = rowsIn(path.join(NEW, 'truth')), ap2 = rowsIn(path.join(NEW, 'truth2')), cmp1 = rowsIn(path.join(NEW, 'compare-truth')), cmp2 = rowsIn(path.join(NEW, 'compare-truth2'));
const f1 = windowsIn(path.join(FFM, 'compare-truth')), f2 = windowsIn(path.join(FFM, 'compare-truth2'));
const PROVIDER = (name) => (/^Swarm/.test(name) ? 'ESA' : /^GRACE/.test(name) ? 'Data E' : /^Sentinel/.test(name) ? 'Copernicus' : 'ESA navigation');
const PUBLIC_NAME = (name) => (/^GRACE-FO/.test(name) ? `Research satellite ${name.at(-1)}` : name);
const CUTS = [
  { regime: 'Strong drag, 2025', store: 'compare-truth', ap: ap1, apNew: a1, cmp: cmp1, keep: (r) => !r.error, arcs: [24], ffm: 'FFM40', ussf: u1, ffmRows: f1 },
  { regime: 'Strong drag, 2026', store: 'compare-truth2', ap: ap2, apNew: a2, cmp: cmp2, keep: (r) => r.group === 'P' && !r.error, arcs: [24, 72], ffm: 'FFM40', ussf: u2, ffmRows: f2 },
  { regime: 'Near 700 km', store: 'compare-truth2', ap: ap2, apNew: a2, cmp: cmp2, keep: (r) => r.group === 'S1' && !r.error, arcs: [24, 72], ffm: 'FFM40', ussf: u2, ffmRows: f2 },
  { regime: 'Medium Earth orbit', store: 'compare-truth2', ap: ap2, apNew: a2, cmp: cmp2, keep: (r) => r.group === 'GN' && !r.error, arcs: [24, 72], ffm: 'FFM20', ussf: u2, ffmRows: f2 },
];
// --only 2025: the finished windows alone, while the others still run; a partial part is never published.
for (const cut of CUTS.filter((x) => !argOf('--only') || x.regime.includes(argOf('--only')))) {
  const inCut = cut.ap.filter(cut.keep), byKey = new Map(cut.cmp.map((r) => [r.key, r]));
  const levels = [['regime', 'All', 'All', inCut]];
  for (const provider of new Set(inCut.map((r) => PROVIDER(r.name)))) levels.push(['provider', provider, 'All', inCut.filter((r) => PROVIDER(r.name) === provider)]);
  for (const name of new Set(inCut.map((r) => r.name))) levels.push(['satellite', PROVIDER(name), PUBLIC_NAME(name), inCut.filter((r) => r.name === name)]);
  for (const [level, provider, satellite, list] of levels) for (const fit of cut.arcs) for (const day of ['1', '2', '3', '7']) {
    const arms = {};
    for (const [column, read] of [['SGP4', (r) => e(byKey.get(r.key), `S${fit}`, day)], ['XP', (r) => { const v = e(byKey.get(r.key), `XP${fit}`, day); if (Number.isFinite(v)) fed(cut.store, r.key); return v; }], ['XPU', (r) => e(cut.ussf.get(r.key), `U${fit}`, day)], ['AP', (r) => e(cut.apNew.get(r.key), `AP${fit}`, day)], [cut.ffm, (r) => e(cut.ffmRows.get(r.key), `F${fit}`, day)]]) {
      const v = list.map(read).filter(Number.isFinite).sort(asc);
      if (v.length) arms[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length];
    }
    out.push(named({ reference: 'truth', level, regime: cut.regime, provider, satellite, fit, lead: Number(day) * 24, n: list.length, ...burns(list, fit, Number(day) * 24), arms }, 'truth'));
  }
}

// AP6.md's regimes, the same way.
if (fs.existsSync(path.join(NEW, 'regimes')) && !argOf('--only')) {
  const live = rowsIn(path.join(NEW, 'regimes')).filter((r) => !r.error), fSix = windowsIn(path.join(FFM, 'regimes'));
  for (const [group, g] of Object.entries(GROUPS)) {
    const inGroup = live.filter((r) => r.group === group);
    const arcs = [...new Set(inGroup.flatMap((r) => Object.keys(r.arms).map((a) => Number(a.replace(/^\D+/, '')))))].sort((a, b) => a - b);
    const ffm = group === 'LS' || group === 'DO' ? 'FFM40' : 'FFM20';
    const levels = [['regime', 'All', 'All', inGroup], ['provider', g.provider, 'All', inGroup], ...[...new Set(inGroup.map((r) => r.name))].map((name) => ['satellite', g.provider, name, inGroup.filter((r) => r.name === name)])];
    for (const [level, provider, satellite, list] of levels) for (const fit of arcs) for (const day of ['1', '2', '3', '7']) {
      const arms = {};
      for (const [column, code] of [['SGP4', 'S'], ['XP', 'XP'], ['XPU', 'U'], ['AP', 'AP'], [ffm, 'F']]) {
        const v = list.map((r) => { const x = e(code === 'U' ? uSix.get(r.key) : code === 'AP' ? aSix.get(r.key) : code === 'F' ? fSix.get(r.key) : r, `${code}${fit}`, day); if (code === 'XP' && Number.isFinite(x)) fed(group === 'HX' ? 'regimes-hx' : 'regimes', r.key); return x; }).filter(Number.isFinite).sort(asc);
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
  // FFM: the ISS's from ffm220's own run, every other provider's from ffm220's refits of the forward test's and the vendor test's stored files, scored as score.mjs pairs them.
  const ffmProviders = new Map([...rowsIn(path.join(FFM, 'operator', 'forward')), ...rowsIn(path.join(FFM, 'vendors', 'forward')), ...rowsIn(path.join(FFM, 'providers'), /^rows-iss-\d+\.jsonl$/)].map((r) => [pairKey(r), r]));
  const kmOf = (r, arm) => (arm.startsWith('F-') ? ffmProviders.get(pairKey(r))?.arms[arm]?.km : r.arms[arm]?.km ?? stored.get(pairKey(r))?.arms[arm]?.km ?? uProviders.get(pairKey(r))?.arms[arm]?.km);
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
const EXAMPLES = argOf('--examples') ?? (process.argv.includes('--check') ? '/opt/data/sdn-archive/operator-theory/ap/b0411/compare-examples-full,/opt/data/sdn-archive/operator-theory/ap/b051/compare-examples-burn-free,/opt/data/sdn-archive/operator-theory/ap/b051/compare-examples-regen,/opt/data/sdn-archive/operator-theory/ap/ffm220/compare-examples' : null);
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
  fields: 'input: what the fits read, operator-file (an operator\'s or a center\'s own prediction file) or precise-orbit (a precise orbit product). build: column to the keys of builds, each module build by SHA-256. integrator: for each FFM column in the row, the integrator algorithm its fits and flights ran, read at generation from the one request builder every FFM call of this harness goes through (experiments/operator-theory/lib/frame.mjs); the tolerances and steps are each writer\'s settings (arms.mjs, truth-compare.mjs, all-regimes.mjs, providers-run.mjs, score.mjs). arms: column to [median km, 95th percentile km, forecasts]. burnsInFit, burnsInForecast: of the n windows, those with a step of the truth\'s mean semimajor axis of 8 m or more in the fit arc, and in the forecast span to the lead (results/operator-theory/maneuver-flags); a window the detector could not cover counts in neither; null where no detector ran. lead: for reference next, hours from the start of the older file to the start of the newer, so a lead at or below the fit is not a forecast; for reference truth, hours past the end of the fit.',
  // the builds the rows name, and the builds whiteroom XP and AP were measured on (the provenance's measuredOn)
  builds: Object.fromEntries(Object.entries(RECORDS).filter(([k]) => k === XP_MEASURED || k === XP_REMEASURED || k === AP_MEASURED || k === HX_FLOWN || out.some((r) => Object.values(r.build ?? {}).some((keys) => keys.includes(k))))),
  provenance: {
    XP: {
      reference: 'truth',
      build: XP_EQUAL,
      measuredOn: XP_MEASURED,
      remeasuredOn: XP_REMEASURED,
      statement: 'Whiteroom XP on precise orbits was flown on sdn-ap 0.4.11; re-measured on sdn-ap 0.5.1 (modules ea824356), every stored window of these stores is equal byte for byte; sdn-ap 0.6.3 flies whiteroom XP equal to 0.5.1 byte for byte on all 56 published examples (through 0.6.2), so its cells name 0.6.3.',
      proof: { commit: PROOF.commit, table: PROOF.table, data: PROOF.data },
      identity: { commit: IDENTITY.commit, data: IDENTITY.step, examples: IDENTITY.examples },
      identity064: IDENTITY_064,
      stores: PROOF.stores,
    },
    AP: {
      reference: 'truth',
      build: AP_NAMED,
      measuredOn: AP_MEASURED,
      statement: `AP on precise orbits was flown on sdn-ap 0.5.1 (modules ea824356). sdn-ap 0.6.3 (modules 93cb5a05) changes the theory above an eccentricity of ${IDENTITY.eMax} alone: at ${IDENTITY.eMax} and below its flights equal 0.6.2's byte for byte (53 of 53 example sets, 6 of 6 fits, 8 of 8 fixtures), and 0.6.2 equals 0.5.1 on all 56 published examples, so those cells name 0.6.3; the ${HX_LABEL} rows were flown again on 0.6.3 (ap/b063/regimes-hx), their change against 0.5.1 in hx-0-6-3.json. sdn-ap 0.6.4 (modules cfd750eb, canonical module fd1ef468, signed bundle e98b6355) moves non-resonant sets at an eccentricity from 0.05 to 0.3 alone: outside that band its flights equal 0.6.3's byte for byte (106 of 106 seeded sets; 56 of 56 published examples, none in the band; ${IDENTITY_064.commit.slice(0, 8)}, and the reflight of the examples in COMPARE.md), so every cell names 0.6.4 and the build it was flown on stays named here.`,
      identity: { commit: IDENTITY.commit, data: IDENTITY.step, final: IDENTITY.final, examples: IDENTITY.examples, eMax: IDENTITY.eMax },
      identity064: IDENTITY_064,
      remeasured: { regime: HX_LABEL, build: HX_FLOWN, store: 'ap/b063/regimes-hx', tool: 'experiments/operator-theory/all-regimes.mjs --arms AP --groups HX --ap-build', windows: hxNew.size, change: 'results/ap-truth/compare/hx-0-6-3.json' },
    },
  },
  dropped: 'Next-file AP and whiteroom XP (sdn-ap 0.4.11, no re-measure) and the held SpaceX cells on sgp4-xp 0.1.1 and ffm 2.0.4, until their rerun on the current builds.',
  leftOut: providerLeftOut,
  rows: out,
};
// hx-0-6-3.json: the HX rows on 0.5.1 and on 0.6.3, window by window and fit by fit (3D error in km at days 1, 2, 3 and 7 past the fit's end, the fit's RMS),
// and each regime-level cell's median and 95th percentile on both; the record and COMPARE.md state these, the site states the 0.6.3 figures alone.
const hxLive = fs.existsSync(path.join(NEW, 'regimes')) ? rowsIn(path.join(NEW, 'regimes')).filter((r) => r.group === 'HX' && !r.error).sort((a, b) => a.key.localeCompare(b.key)) : [];
const HX_DAYS = ['1', '2', '3', '7'];
const hxWindows = hxLive.flatMap((r) => Object.keys(hxNew.get(r.key)?.arms ?? {}).filter((a) => /^AP\d+$/.test(a)).sort().map((arm) => {
  const o = hxOld.get(r.key)?.arms?.[arm], n = hxNew.get(r.key)?.arms?.[arm];
  const days = (x) => Object.fromEntries(HX_DAYS.map((d) => [d, x?.ok ? x.days[d].e : null]));
  return { key: r.key, satellite: r.name, cutoff: r.cutoff, fit: Number(arm.slice(2)), old: { ok: !!o?.ok, fitRmsKm: o?.ok ? o.rms : null, days: days(o) }, new: { ok: !!n?.ok, fitRmsKm: n?.ok ? n.rms : null, days: days(n) } };
}));
const hxCells = [...new Set(hxWindows.map((w) => w.fit))].sort((a, b) => a - b).flatMap((fit) => HX_DAYS.map((d) => {
  const at = hxWindows.filter((w) => w.fit === fit), o = at.map((w) => w.old.days[d]).filter(Number.isFinite).sort(asc), n = at.map((w) => w.new.days[d]).filter(Number.isFinite).sort(asc);
  return { regime: HX_LABEL, fit, lead: Number(d) * 24, n: at.length, median: [round(pct(o, 0.5)), round(pct(n, 0.5))], p95: [round(pct(o, 0.95)), round(pct(n, 0.95))], forecasts: [o.length, n.length] };
}));
const hxDoc = {
  what: `${HX_LABEL}: AP flown again on sdn-ap 0.6.3 on the same windows, truth, settings and measures as the 0.5.1 rows (all-regimes.mjs --arms AP --groups HX --ap-build); each figure the 3D forward error in km at the day past the fit's end, old then new; cells: each regime-level cell of cells.json on both builds.`,
  builds: { old: { key: AP_MEASURED, ...RECORDS[AP_MEASURED] }, new: { key: HX_FLOWN, ...RECORDS[HX_FLOWN] } },
  stores: { old: 'ap/b051/regimes-hx', new: 'ap/b063/regimes-hx' },
  days: HX_DAYS.map(Number),
  windows: hxWindows,
  cells: hxCells,
};
const HX_FILE = 'results/ap-truth/compare/hx-0-6-3.json';
if (process.argv.includes('--check')) check(); else { fs.writeFileSync(argOf('--out'), `${JSON.stringify(doc)}\n`); if (!argOf('--only')) fs.writeFileSync(path.join(path.dirname(argOf('--out')), path.basename(HX_FILE)), `${JSON.stringify(hxDoc, null, 1)}\n`); }
/** cells.json and hx-0-6-3.json reproduce; the provenance block names the proofs; the relabels stand only where their proofs reach; the HX rows are 0.6.3's flights. */
function check() {
  const faults = [];
  const committed = fs.readFileSync(path.join(REPO, 'results/ap-truth/compare/cells.json'), 'utf8');
  if (committed !== `${JSON.stringify(doc)}\n`) faults.push('results/ap-truth/compare/cells.json does not reproduce from the stored rows');
  if (fs.readFileSync(path.join(REPO, HX_FILE), 'utf8') !== `${JSON.stringify(hxDoc, null, 1)}\n`) faults.push(`${HX_FILE} does not reproduce from the stored rows`);
  // AP on precise orbits: the HX rows from the 0.6.3 store, every window flown (19 windows, 26 fits), none in error; every other AP cell relabeled on the identity at 9de1a40ff.
  if (hxWindows.length !== 26 || hxLive.length !== 19 || hxWindows.some((w) => !w.new.ok || !w.old.ok)) faults.push(`the HX store holds ${hxWindows.length} fits of ${hxLive.length} windows on 0.6.3, not 26 of 19 all flown`);
  const show = (file) => JSON.parse(execFileSync('git', ['-C', REPO, 'show', `${IDENTITY.commit}:${file}`], { maxBuffer: 1 << 26 }).toString('utf8'));
  const step = show(IDENTITY.step), final = show(IDENTITY.final);
  const fitE2e = step.e2es?.['fit.e2e.mjs (SDNAP_EXAMPLES)'] ?? '';
  if (step.dist?.wasmSha256 !== AP063.sha256 || step.examples?.sets !== 56 || step.examples?.identical !== 56 || step.fits?.count !== step.fits?.identical || !/53 of 53 example sets at e 0\.3 and below identical/.test(fitE2e)) faults.push('the identity (version-step.json at 9de1a40ff) does not carry 0.6.3 equal to its candidate on 56 of 56 examples and 53 of 53 sets at e 0.3 and below');
  if (final.exampleSets?.['eAtMost0.3'] !== 53 || final.exampleSets?.['identicalTo0.6.2'] !== 53) faults.push('the identity (final-build.json at 9de1a40ff) does not carry 53 of 53 sets at e 0.3 and below identical to 0.6.2');
  // 0.6.3 to 0.6.4: the switch record's table holds the identity on the 0.6.4 module, and every published example flies on 0.6.4 outside the band.
  const switched = JSON.parse(execFileSync('git', ['-C', REPO, 'show', `${IDENTITY_064.commit}:${IDENTITY_064.table}`], { maxBuffer: 1 << 26 }).toString('utf8'));
  if (switched.pins?.next?.canonicalSha256 !== AP064.sha256 || switched.p3?.outsideEqual !== true || switched.p3?.outsideCount !== 106 || switched.examples?.length !== 56 || switched.examples.some((x) => !x.equal || x.inBand)) faults.push('the identity (tesseral-switch-by-class table.json) does not carry 0.6.3 to 0.6.4');
  const apRows = doc.rows.filter((r) => r.arms.AP && r.reference === 'truth');
  if (apRows.some((r) => r.build.AP.join() !== AP_NAMED) || doc.rows.some((r) => r.reference !== 'truth' && r.build?.AP?.includes(AP_NAMED))) faults.push('an AP cell on precise orbits does not name sdn-ap 0.6.4, or one off them does');
  if (doc.provenance?.AP?.build !== AP_NAMED || doc.provenance?.AP?.measuredOn !== AP_MEASURED || doc.provenance?.AP?.identity?.commit !== IDENTITY.commit || doc.provenance?.AP?.remeasured?.regime !== HX_LABEL) faults.push('the AP provenance block is missing or does not name the identity and the re-measured regime');
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
  if (!p || p.build !== XP_EQUAL || p.measuredOn !== XP_MEASURED || p.remeasuredOn !== XP_REMEASURED || p.proof.commit !== PROOF.commit || p.identity?.commit !== IDENTITY.commit || p.stores.join() !== PROOF.stores.join()) faults.push('the provenance block is missing or does not name the proof and the identity');
  const relabeled = doc.rows.filter((r) => r.build?.XP?.includes(XP_EQUAL));
  if (relabeled.some((r) => r.reference !== 'truth')) faults.push('a row off precise orbits names whiteroom XP on 0.6.4');
  if (doc.rows.some((r) => Object.values(r.build ?? {}).some((k) => k.some((x) => [XP_MEASURED, XP_REMEASURED, AP_MEASURED].includes(x) || doc.builds[x]?.version === '0.1.1')))) faults.push('a cell names sdn-ap 0.4.11, sdn-ap 0.5.1 or sgp4-xp 0.1.1');
  if (doc.rows.some((r) => r.reference === 'next' && (r.arms.XP || r.arms.AP))) faults.push('a next-file row carries AP or whiteroom XP');
  const ffmCells = doc.rows.flatMap((r) => Object.keys(r.arms).filter((c) => c.startsWith('FFM')).map((c) => r.integrator?.[c]));
  if (ffmCells.some((x) => x !== INTEGRATOR) || doc.rows.some((r) => Object.keys(r.integrator ?? {}).some((c) => !r.arms[c]))) faults.push(`an FFM cell does not name the integrator lib/frame.mjs carries (${INTEGRATOR})`);
  const ffmBuilds = doc.rows.flatMap((r) => Object.keys(r.arms).filter((c) => c.startsWith('FFM')).map((c) => (r.build[c] ?? []).filter((k) => doc.builds[k]?.module === 'propagator/ffm').map((k) => doc.builds[k])));
  if (ffmBuilds.some((b) => b.length !== 1 || b[0].version !== FFM_220.version || b[0].sha256 !== FFM_220.wasmSha256)) faults.push(`an FFM cell does not name propagator/ffm ${FFM_220.version} (${FFM_220.wasmSha256.slice(0, 12)})`);
  console.log(faults.length ? `COMPARE CELLS: FAIL\n${faults.slice(0, 10).join('\n')}` : `COMPARE CELLS: PASS (${doc.rows.length} rows reproduce; AP on sdn-ap 0.6.4 (${AP064.sha256.slice(0, 12)}) in ${apRows.length} precise-orbit rows: ${apRows.filter((r) => r.regime === HX_LABEL).length} ${HX_LABEL} rows flown on 0.6.3 (${hxLive.length} windows, ${hxWindows.length} fits; hx-0-6-3.json reproduces), the rest on the identity at ${IDENTITY.commit.slice(0, 9)}; all carried to 0.6.4 by the identity at ${IDENTITY_064.commit.slice(0, 9)}; whiteroom XP on 0.6.4 in ${relabeled.length} precise-orbit rows, fed by ${[...xpFrom].map(([k, v]) => `${k} ${v.size}`).join(', ')}, each a store the proof covers with no differing window; no cell on sdn-ap 0.4.11, sdn-ap 0.5.1 or sgp4-xp 0.1.1; ${ffmCells.length} FFM cells name their integrator, ${INTEGRATOR}, and propagator/ffm ${FFM_220.version} (${FFM_220.wasmSha256.slice(0, 12)}))`);
  process.exit(faults.length ? 1 : 0);
}
const counts = {};
for (const r of out) counts[`${r.reference}/${r.level}`] = (counts[`${r.reference}/${r.level}`] ?? 0) + 1;
console.log(counts, 'rows', out.length, 'bytes', fs.statSync(argOf('--out')).size);
