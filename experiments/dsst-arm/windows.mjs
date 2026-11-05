#!/usr/bin/env node
// The DSST arm's window set (DSST.md, Windows): the keys of the windows behind results/ap-truth/compare/cells.json, read from the
// stores' key fields only (key, group, source, norad, name or object, cutoff or the pair's file starts): never an arm's numbers.
// Held windows never enter: every Starlink source, the six held Galileo satellites, Swarm and GRACE-FO cutoffs after 2026-10-31,
// and in the vendor pairs VENDORS.md's excluded objects. windows.json beside this file registers the set by count and by the
// SHA-256 of the sorted keys; run.mjs recomputes the set and refuses a digest that differs.
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

export const STORES = [
  { store: 'ap/b051/truth', reference: 'truth', input: 'precise-orbit', registration: 'AP5.md Part T' },
  { store: 'ap/b051/truth2', reference: 'truth', input: 'precise-orbit', registration: 'AP5.md Part N' },
  { store: 'ap/b051/regimes', reference: 'truth', input: 'precise-orbit', registration: 'AP6.md' },
  { store: 'ap/b051/regimes-hx', reference: 'truth', input: 'precise-orbit', registration: 'AP6.md, HX' },
  { store: 'ap/b051/regimes-wa', reference: 'truth', input: 'precise-orbit', registration: 'GEO-TRUTH.md' },
  { store: 'ap/b0411/laser/forward', reference: 'next', input: 'operator-file', registration: 'COMPARE.md', vendor: true },
  { store: 'ap/b0411/providers', reference: 'next', input: 'operator-file', registration: 'providers-run.mjs', vendor: true },
  { store: 'ap/ap-observations-2/rows', reference: 'truth', input: 'laser-normal-points', registration: 'ap-observations-2/PLAN.md', files: /^w\d+\.jsonl$/ },
];

const lines = (dir, re) => fs.readdirSync(dir).filter((f) => re.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean));
const pick = (r) => {
  if (r.olderStart) return { key: `${r.source}|${r.norad ?? r.object}|${r.olderStart}|${r.newerStart}`, norad: Number(r.norad), object: r.object, group: r.source, at: Date.parse(r.olderStart) };
  if (r.key) return { key: r.key, norad: Number(r.norad), object: r.name, group: r.group ?? r.key.split('|')[0], at: Date.parse(r.cutoff) };
  return { key: `NP|${r.norad}|${r.cutoff.slice(0, 10)}`, norad: Number(r.norad), object: r.target, group: 'NP', at: Date.parse(r.cutoff) };
};
/** Why a window is held, or null. */
export const held = (w, vendor) => (GALILEO_HELD.has(w.norad) ? 'galileo-held'
  : SWARM_GRACEFO.has(w.norad) && w.at >= SWARM_GRACEFO_HOLD_FROM ? 'swarm-gracefo-after-2026-10-31'
    : vendor && (VENDOR_EXCLUDED_NORADS.has(w.norad) || VENDOR_EXCLUDED_TARGETS.has(String(w.object ?? '').toLowerCase())) ? 'vendor-excluded' : null);

/** Every store's windows (keys, by group) and the digest of the sorted keys over all stores. */
export function collect() {
  const stores = [];
  for (const s of STORES) {
    const dir = path.join(ROOT, s.store);
    const keys = new Map(), dropped = { starlink: 0 };
    for (const line of lines(dir, s.files ?? /^rows(-iss)?-\d+\.jsonl$/)) {
      if (STARLINK.test(line)) { dropped.starlink += 1; continue; }
      const w = pick(JSON.parse(line));
      const why = held(w, s.vendor);
      if (why) { dropped[why] = (dropped[why] ?? 0) + 1; continue; }
      keys.set(w.key, w.group);
    }
    const groups = {};
    for (const g of keys.values()) groups[g] = (groups[g] ?? 0) + 1;
    stores.push({ store: s.store, reference: s.reference, input: s.input, registration: s.registration, windows: keys.size, groups, dropped, keys: [...keys.keys()].sort() });
  }
  const all = stores.flatMap((s) => s.keys);
  return { stores, keys: new Set(all), digest: crypto.createHash('sha256').update(all.join('\n')).digest('hex') };
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
    about: 'DSST.md, Windows: the window set by store, group and count, and the SHA-256 of the sorted keys over every store (windows.mjs --list prints them). Keys only; no arm figure is read. Held windows are dropped and counted.',
    cellsFrom: 'results/ap-truth/compare/cells.json',
    holds: { starlink: 'every Starlink source', galileo: [...GALILEO_HELD], swarmGraceFoAfter: '2026-10-31', vendorExcludedNorads: [...VENDOR_EXCLUDED_NORADS], vendorExcludedTargets: [...VENDOR_EXCLUDED_TARGETS] },
    windows: set.keys.size,
    digest: set.digest,
    stores: set.stores.map(({ keys, ...s }) => s),
    cells: cellGrid(),
  };
  fs.writeFileSync(REGISTERED, `${JSON.stringify(out, null, 1)}\n`);
  for (const s of set.stores) console.log(`${s.store}: ${s.windows} windows${Object.entries(s.dropped).filter(([, n]) => n).map(([k, n]) => `, ${n} ${k}`).join('')}`);
  console.log(`${set.keys.size} windows; digest ${set.digest}`);
}
