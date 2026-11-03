// COMPARE.md: every figure of the comparison site's explorer, by reference, regime, provider, satellite, fit and lead. Statistics only.
//   node experiments/operator-theory/compare-cells.mjs --out results/ap-truth/compare/cells.json [--examples <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { binOf, pct, asc } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = path.join(ROOT, 'ap'), NEW = path.join(AP, 'b040');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const key = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const regimeOf = (r) => (r.source.endsWith('-leo') ? 'Low orbit' : NAV.test(r.object) ? 'Navigation' : 'Geodetic');
const providerOf = (r) => r.source.split('-')[1];
const round = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));

const rows = rowsIn(path.join(NEW, 'laser', 'forward'));
const stores = [new Map(rows.map((r) => [key(r), r])), ...[path.join(AP, 'laser', 'forward'), path.join(ROOT, 'cheaper', 'forward'), path.join(NEW, 'laser-sgp4'), path.join(NEW, 'laser-sgp4-high'), path.join(NEW, 'laser-sgp4-72'), path.join(NEW, 'ussf-laser')].map((d) => new Map(rowsIn(d).map((r) => [key(r), r])))];
const km = (r, arm) => { for (const s of stores) { const v = s.get(key(r))?.arms[arm]?.km; if (Number.isFinite(v)) return v; } return undefined; };

/** The stored arm behind each column, by fit; a column with no arm for that fit or regime stays empty. */
const armsOf = (regime, fit) => (regime === 'Low orbit'
  ? { SGP4: `S@${fit}`, XP: `A-XP@${fit}`, XPU: `U-XP@${fit}`, AP: `A-APn@${fit}`, FFM20: fit === 48 ? 'F-M20@48' : null, FFM40: fit === 48 ? 'F-M40@48' : null, FFMfull: fit === 48 ? 'F-full@48' : null, Center: 'operator' }
  : { SGP4: `S@${fit}`, XP: `A-XP@${fit}`, XPU: `U-XP@${fit}`, AP: `A-APn@${fit}`, FFM20: fit === 48 ? 'F-H20@48' : null, FFM40: null, FFMfull: fit === 48 ? 'F-Hfull@48' : null, Center: 'operator' });

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
  for (const fit of [48, 72]) out.push({ reference: 'next', level, regime, provider, satellite, fit, lead: Number(lead), n: list.length, arms: cellOf(list, regime, fit) });
}

// Against precise orbits: AP5.md's windows, by group, provider and satellite.
const e = (r, arm, k) => r?.arms?.[arm]?.days?.[k]?.e;
const windowsIn = (dir) => new Map(rowsIn(dir).map((r) => [r.key, r]));
const u1 = windowsIn(path.join(NEW, 'ussf-truth')), u2 = windowsIn(path.join(NEW, 'ussf-truth2')), uSix = windowsIn(path.join(NEW, 'ussf-regimes'));
const ap1 = rowsIn(path.join(NEW, 'truth')), ap2 = rowsIn(path.join(NEW, 'truth2')), cmp1 = rowsIn(path.join(NEW, 'compare-truth')), cmp2 = rowsIn(path.join(NEW, 'compare-truth2'));
const PROVIDER = (name) => (/^Swarm/.test(name) ? 'ESA' : /^GRACE/.test(name) ? 'Data E' : /^Sentinel/.test(name) ? 'Copernicus' : 'ESA navigation');
const PUBLIC_NAME = (name) => (/^GRACE-FO/.test(name) ? `Research satellite ${name.at(-1)}` : name);
const CUTS = [
  { regime: 'Strong drag, 2025', ap: ap1, cmp: cmp1, keep: (r) => !r.error, arcs: [24], ffm: 'FFM40', ussf: u1 },
  { regime: 'Strong drag, 2026', ap: ap2, cmp: cmp2, keep: (r) => r.group === 'P' && !r.error, arcs: [24, 72], ffm: 'FFM40', ussf: u2 },
  { regime: 'Near 700 km', ap: ap2, cmp: cmp2, keep: (r) => r.group === 'S1' && !r.error, arcs: [24, 72], ffm: 'FFM40', ussf: u2 },
  { regime: 'Medium Earth orbit', ap: ap2, cmp: cmp2, keep: (r) => r.group === 'GN' && !r.error, arcs: [24, 72], ffm: 'FFM20', ussf: u2 },
];
// --only 2025: the finished windows alone, while the others still run; a partial part is never published.
for (const cut of CUTS.filter((x) => !argOf('--only') || x.regime.includes(argOf('--only')))) {
  const inCut = cut.ap.filter(cut.keep), byKey = new Map(cut.cmp.map((r) => [r.key, r]));
  const levels = [['regime', 'All', 'All', inCut]];
  for (const provider of new Set(inCut.map((r) => PROVIDER(r.name)))) levels.push(['provider', provider, 'All', inCut.filter((r) => PROVIDER(r.name) === provider)]);
  for (const name of new Set(inCut.map((r) => r.name))) levels.push(['satellite', PROVIDER(name), PUBLIC_NAME(name), inCut.filter((r) => r.name === name)]);
  for (const [level, provider, satellite, list] of levels) for (const fit of cut.arcs) for (const day of ['1', '2', '3', '7']) {
    const arms = {};
    for (const [column, read] of [['SGP4', (r) => e(byKey.get(r.key), `S${fit}`, day)], ['XP', (r) => e(byKey.get(r.key), `XP${fit}`, day)], ['XPU', (r) => e(cut.ussf.get(r.key), `U${fit}`, day)], ['AP', (r) => e(r, `AP${fit}`, day)], [cut.ffm, (r) => e(byKey.get(r.key), `F${fit}`, day)]]) {
      const v = list.map(read).filter(Number.isFinite).sort(asc);
      if (v.length) arms[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length];
    }
    out.push({ reference: 'truth', level, regime: cut.regime, provider, satellite, fit, lead: Number(day) * 24, n: list.length, arms });
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
        const v = list.map((r) => e(code === 'U' ? uSix.get(r.key) : r, `${code}${fit}`, day)).filter(Number.isFinite).sort(asc);
        if (v.length) arms[column] = [round(pct(v, 0.5)), round(pct(v, 0.95)), v.length];
      }
      out.push({ reference: 'truth', level, regime: g.label, provider, satellite, fit, lead: Number(day) * 24, n: list.length, arms });
    }
  }
}

// Every other provider that publishes states: SpaceX, NASA's ISS, the China Space Station, Planet, ESA's ultra-rapid orbits, Intelsat, SES. The reference is the provider's next file.
const PROVIDERS = { starlink: ['SpaceX', 'Low orbit, maneuvering'], iss: ['NASA ISS', 'Low orbit, crewed'], css: ['China Space Station', 'Low orbit, crewed'], planet: ['Planet (Flock)', 'Low orbit, imaging fleet'], gps: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], glonass: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], intelsat: ['Intelsat', 'Geostationary, station-kept'], ses: ['SES', 'Geostationary, station-kept'] };
const providerLeftOut = {};
if (fs.existsSync(path.join(NEW, 'providers')) && !argOf('--only')) {
  const pairKey = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
  const stored = new Map([...rowsIn(path.join(ROOT, 'forward')), ...rowsIn(path.join(ROOT, 'vendors', 'forward'))].map((r) => [pairKey(r), r]));
  const uProviders = new Map(fs.readdirSync(path.join(NEW, 'ussf-providers')).filter((f) => /^rows(-iss)?-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(NEW, 'ussf-providers', f))).map((r) => [pairKey(r), r]));
  const all = fs.readdirSync(path.join(NEW, 'providers')).filter((f) => /^rows(-iss)?-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(NEW, 'providers', f))).filter((r) => !r.error && PROVIDERS[r.source]);
  // A Planet object with no catalog number: its successive files disagree by thousands of km for every arm, Planet's own forecast included, so it says nothing about a propagator.
  const live = all.filter((r) => r.source !== 'planet' || r.norad);
  providerLeftOut.planetPairsWithoutCatalogNumber = all.length - live.length;
  const kmOf = (r, arm) => r.arms[arm]?.km ?? stored.get(pairKey(r))?.arms[arm]?.km ?? uProviders.get(pairKey(r))?.arms[arm]?.km;
  const cell = (list, fit) => {
    const arms = {};
    for (const [column, names] of [['SGP4', [`S@${fit}`]], ['XP', [`A-XP@${fit}`]], ['XPU', [`U-XP@${fit}`]], ['AP', [`A-APn@${fit}`]], ['FFM40', [`F-M40@${fit}`]], ['FFMfull', [`F-NRLMSISE00@${fit}`, `F-NO-DRAG@${fit}`]], ['Center', ['operator']]]) {
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
    for (const fit of [24, 48]) { const arms = cell(list, fit); if (Object.keys(arms).length) out.push({ reference: 'next', level, regime, provider, satellite, fit, lead: Number(lead), n: list.length, arms }); }
  }
}

// Each row's worked example: its own satellite's if there is one, else its provider's, else its regime's. Never a showcase example: those are chosen to show AP's lead, not to be typical.
if (argOf('--examples')) {
  const dir = argOf('--examples');
  const examples = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))).filter((d) => !d.showcase).map((d) => ({ id: d.id, reference: d.reference, regime: d.regime, provider: d.provider, satellite: d.satellite }));
  for (const r of out) {
    const same = examples.filter((x) => x.reference === r.reference && x.regime === r.regime);
    const found = same.find((x) => x.satellite === r.satellite && (r.provider === 'All' || x.provider === r.provider)) ?? same.find((x) => r.provider !== 'All' && x.provider === r.provider) ?? (r.provider === 'All' ? same[0] : null);
    if (found) r.example = found.id;
  }
}
const order = { regime: 0, provider: 1, satellite: 2 };
out.sort((a, b) => a.reference.localeCompare(b.reference) || order[a.level] - order[b.level] || a.regime.localeCompare(b.regime) || a.provider.localeCompare(b.provider) || a.satellite.localeCompare(b.satellite) || a.fit - b.fit || a.lead - b.lead);
const doc = {
  registered: 'experiments/operator-theory/COMPARE.md, AP5.md',
  columns: { SGP4: 'SGP4', XP: 'XP, whiteroom', XPU: 'XP, Space Force', AP: 'AP 0.4.0', FFM20: 'FFM 20×20', FFM40: 'FFM 40×40', FFMfull: 'FFM full', Center: "The center's own" },
  fields: 'arms: column to [median km, 95th percentile km, forecasts]. lead: for reference next, hours from the start of the older file to the start of the newer, so a lead at or below the fit is not a forecast; for reference truth, hours past the end of the fit.',
  leftOut: providerLeftOut,
  rows: out,
};
fs.writeFileSync(argOf('--out'), `${JSON.stringify(doc)}\n`);
const counts = {};
for (const r of out) counts[`${r.reference}/${r.level}`] = (counts[`${r.reference}/${r.level}`] ?? 0) + 1;
console.log(counts, 'rows', out.length, 'bytes', fs.statSync(argOf('--out')).size);
