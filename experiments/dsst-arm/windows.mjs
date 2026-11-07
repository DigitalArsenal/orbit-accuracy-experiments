#!/usr/bin/env node
// The DSST arm's window set (DSST.md, Windows, as amended 2026-11-05): the keys of the windows behind results/ap-truth/compare/cells.json,
// read from the stores' key fields only (key, group, source, norad, name or object, cutoff or the pair's file starts): never an arm's
// numbers. Held windows never enter: every Starlink source, the six held Galileo satellites, Swarm and GRACE-FO cutoffs after
// 2026-10-31, and in the vendor pairs VENDORS.md's excluded objects. The laser-prediction pairs are drawn (DRAW below). windows.json
// beside this file registers the set by count and by the SHA-256 of the sorted keys; run.mjs recomputes the set and refuses a digest
// that differs.
//   node experiments/dsst-arm/windows.mjs          writes windows.json
//   node experiments/dsst-arm/windows.mjs --list   prints every key, one a line
//   node experiments/dsst-arm/windows.mjs --check  exits 1 when the stores no longer give windows.json's digest
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
export const ROOT = '/opt/data/sdn-archive/operator-theory';
export const GALILEO_HELD = new Set([43567, 37847, 41862, 41174, 43055, 41175]);
export const SWARM_GRACEFO = new Set([39451, 39452, 39453, 43476, 43477]);
export const SWARM_GRACEFO_HOLD_FROM = Date.parse('2026-11-01T00:00:00Z');
// experiments/operator-theory/lib/vendors.mjs EXCLUDE_NORADS and EXCLUDE_TARGETS, the vendor pairs' own exclusions.
export const VENDOR_EXCLUDED_NORADS = new Set([31698, 66315, 22824, 8820, 39451, 39452, 39453, 43476, 43477, ...GALILEO_HELD]);
export const VENDOR_EXCLUDED_TARGETS = new Set(['terrasarx', 'sentinel1d', 'stella', 'lageos1', 'swarma', 'swarmb', 'swarmc', 'gracefo1', 'gracefo2']);
export const STARLINK = /"source":"starlink"/;
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// The draw of the laser-prediction pairs (amendment 2026-11-05, ruling 3): per source, the k pairs with the lowest SHA-256 of
// `dsst-arm:<key>`, k = max(25, round(2000 * share)), share the source's count over every source's.
export const DRAW = { target: 2000, floor: 25, salt: 'dsst-arm:' };
// The cost subsample (ruling 3): per (input, regime) the 10 windows with the lowest SHA-256 of `dsst-arm-cost:<key>`.
export const COST_SAMPLE = { perCell: 10, salt: 'dsst-arm-cost:' };

export const STORES = [
  { store: 'ap/b051/truth', reference: 'truth', input: 'precise-orbit', registration: 'AP5.md Part T' },
  { store: 'ap/b051/truth2', reference: 'truth', input: 'precise-orbit', registration: 'AP5.md Part N' },
  { store: 'ap/b051/regimes', reference: 'truth', input: 'precise-orbit', registration: 'AP6.md' },
  { store: 'ap/b051/regimes-hx', reference: 'truth', input: 'precise-orbit', registration: 'AP6.md, HX' },
  { store: 'ap/b051/regimes-wa', reference: 'truth', input: 'precise-orbit', registration: 'GEO-TRUTH.md' },
  { store: 'ap/b0411/laser/forward', reference: 'next', input: 'operator-file', registration: 'COMPARE.md', vendor: true, draw: true },
  { store: 'ap/b0411/providers', reference: 'next', input: 'operator-file', registration: 'providers-run.mjs', vendor: true },
];

// compare-cells.mjs's regimes: truth groups by label, pairs by source.
const GROUP_LABEL = { LS: 'Low orbit, laser spheres', DO: 'Low orbit, altimetry', GD: 'Laser geodetic', IG: 'Inclined geosynchronous', GE: 'Geostationary', HE: 'Highly elliptical', HX: 'Highly elliptical, THEMIS and Chandra', WA: 'Geostationary, station-kept', S1: 'Near 700 km', GN: 'Medium Earth orbit' };
const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
const PROVIDERS = { iss: 'Low orbit, crewed', css: 'Low orbit, crewed', planet: 'Low orbit, imaging fleet', gps: 'Navigation, ultra-rapid', glonass: 'Navigation, ultra-rapid', intelsat: 'Geostationary, station-kept', ses: 'Geostationary, station-kept' };
export function regimeOf(w) {
  if (w.group === 'P') return w.at >= Date.parse('2026-01-01T00:00:00Z') ? 'Strong drag, 2026' : 'Strong drag, 2025';
  if (GROUP_LABEL[w.group]) return GROUP_LABEL[w.group];
  if (PROVIDERS[w.group]) return PROVIDERS[w.group];
  if (w.group.startsWith('cpf-')) return w.group.endsWith('-leo') ? 'Low orbit' : NAV.test(w.object ?? '') ? 'Navigation' : 'Geodetic';
  return null;
}

const lines = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean));
const pick = (r) => {
  if (r.olderStart) return { key: `${r.source}|${r.norad ?? r.object}|${r.olderStart}|${r.newerStart}`, norad: Number(r.norad), object: r.object, group: r.source, at: Date.parse(r.olderStart) };
  return { key: r.key, norad: Number(r.norad), object: r.name, group: r.group ?? r.key.split('|')[0], at: Date.parse(r.cutoff) };
};
/** Why a window is held, or null. */
export const held = (w, vendor) => (GALILEO_HELD.has(w.norad) ? 'galileo-held'
  : SWARM_GRACEFO.has(w.norad) && w.at >= SWARM_GRACEFO_HOLD_FROM ? 'swarm-gracefo-after-2026-10-31'
    : vendor && (VENDOR_EXCLUDED_NORADS.has(w.norad) || VENDOR_EXCLUDED_TARGETS.has(String(w.object ?? '').toLowerCase())) ? 'vendor-excluded' : null);

/** The draw: per source, the lowest-hash k keys. Returns the drawn windows and the counts. */
function draw(windows) {
  const bySource = new Map();
  for (const w of windows) (bySource.get(w.group) ?? bySource.set(w.group, []).get(w.group)).push(w);
  const total = windows.length, drawn = [], counts = {};
  for (const [source, list] of [...bySource].sort(([a], [b]) => a.localeCompare(b))) {
    const k = Math.min(list.length, Math.max(DRAW.floor, Math.round((DRAW.target * list.length) / total)));
    const taken = list.map((w) => ({ w, h: sha256(`${DRAW.salt}${w.key}`) })).sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0)).slice(0, k).map((x) => x.w);
    counts[source] = { of: list.length, drawn: taken.length };
    drawn.push(...taken);
  }
  return { drawn, counts };
}

/** Every store's windows (keys, by group and regime) and the digest of the sorted keys over all stores. */
export function collect() {
  const stores = [], all = [];
  for (const s of STORES) {
    const dir = path.join(ROOT, s.store);
    const seen = new Map(), dropped = { starlink: 0 };
    for (const line of lines(dir, /^rows(-iss)?-\d+\.jsonl$/)) {
      if (STARLINK.test(line)) { dropped.starlink += 1; continue; }
      const w = pick(JSON.parse(line));
      const why = held(w, s.vendor);
      if (why) { dropped[why] = (dropped[why] ?? 0) + 1; continue; }
      if (!seen.has(w.key)) seen.set(w.key, { ...w, reference: s.reference, input: s.input, store: s.store, regime: regimeOf(w) });
    }
    let windows = [...seen.values()], drawCounts;
    if (s.draw) ({ drawn: windows, counts: drawCounts } = draw(windows));
    const groups = {};
    for (const w of windows) groups[w.group] = (groups[w.group] ?? 0) + 1;
    const keys = windows.map((w) => w.key).sort();
    stores.push({ store: s.store, reference: s.reference, input: s.input, registration: s.registration, windows: keys.length, before: seen.size, groups, ...(drawCounts ? { draw: drawCounts } : {}), dropped, keys });
    all.push(...windows);
  }
  const sorted = stores.flatMap((s) => s.keys);
  const byKey = new Map(all.map((w) => [w.key, w]));
  // the cost subsample
  const cells = new Map();
  for (const w of all) { const k = `${w.input}|${w.regime}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(w); }
  const costSample = {};
  for (const [k, list] of [...cells].sort(([a], [b]) => a.localeCompare(b))) costSample[k] = list.map((w) => ({ key: w.key, h: sha256(`${COST_SAMPLE.salt}${w.key}`) })).sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0)).slice(0, COST_SAMPLE.perCell).map((x) => x.key);
  return { stores, keys: new Set(sorted), byKey, digest: sha256(sorted.join('\n')), costSample };
}

/** The fits and leads of every (reference, regime) cell of the published cells: the DSST column takes the same ones. */
export function cellGrid() {
  const cells = JSON.parse(fs.readFileSync(path.join(repo, 'results/ap-truth/compare/cells.json'), 'utf8'));
  const grid = {};
  for (const r of cells.rows) {
    const k = `${r.reference}|${r.regime}`;
    grid[k] ??= { reference: r.reference, regime: r.regime, input: r.input, fits: new Set(), leads: new Set() };
    grid[k].fits.add(r.fit); grid[k].leads.add(r.lead);
  }
  return Object.fromEntries(Object.entries(grid).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, { ...v, fits: [...v.fits].sort((a, b) => a - b), leads: [...v.leads].sort((a, b) => a - b) }]));
}

export const REGISTERED = path.join(here, 'windows.json');

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const set = collect();
  if (process.argv.includes('--list')) { for (const k of set.keys) console.log(k); process.exit(0); }
  if (process.argv.includes('--check')) {
    const registered = JSON.parse(fs.readFileSync(REGISTERED, 'utf8'));
    const ok = registered.digest === set.digest && registered.windows === set.keys.size;
    console.log(`${ok ? 'OK' : 'FAIL'}: ${set.keys.size} windows, digest ${set.digest.slice(0, 12)} (registered ${registered.windows}, ${registered.digest.slice(0, 12)})`);
    process.exit(ok ? 0 : 1);
  }
  const out = {
    about: 'DSST.md, Windows, as amended 2026-11-05: the window set by store, group and count, the laser-prediction draw per source, the cost subsample per (input, regime), and the SHA-256 of the sorted keys over every store (windows.mjs --list prints them). Keys only; no arm figure is read. Held windows are dropped and counted.',
    cellsFrom: 'results/ap-truth/compare/cells.json',
    holds: { starlink: 'every Starlink source', galileo: [...GALILEO_HELD], swarmGraceFoAfter: '2026-10-31', vendorExcludedNorads: [...VENDOR_EXCLUDED_NORADS], vendorExcludedTargets: [...VENDOR_EXCLUDED_TARGETS] },
    draw: { ...DRAW, rule: 'per source, the k pairs with the lowest SHA-256 of salt + key, k = max(floor, round(target * count / total)), hex compared as text' },
    costSample: { ...COST_SAMPLE, rule: 'per (input, regime), the perCell windows with the lowest SHA-256 of salt + key', windows: set.costSample },
    windows: set.keys.size,
    digest: set.digest,
    stores: set.stores.map(({ keys, ...s }) => s),
    cells: cellGrid(),
  };
  fs.writeFileSync(REGISTERED, `${JSON.stringify(out, null, 1)}\n`);
  for (const s of set.stores) console.log(`${s.store}: ${s.windows} windows${s.before !== s.windows ? ` of ${s.before}` : ''}${Object.entries(s.dropped).filter(([, n]) => n).map(([k, n]) => `, ${n} ${k}`).join('')}`);
  if (set.stores.find((s) => s.draw)) console.log('draw:', JSON.stringify(set.stores.find((s) => s.draw).draw));
  console.log(`${set.keys.size} windows; digest ${set.digest}; cost sample ${Object.values(set.costSample).reduce((n, l) => n + l.length, 0)} windows in ${Object.keys(set.costSample).length} cells`);
}
