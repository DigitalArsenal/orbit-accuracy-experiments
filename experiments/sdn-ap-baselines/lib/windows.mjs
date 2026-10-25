// The windows of the paper's 12.3 rows (PLAN.md, Windows): every window G1 attempted for each row's regime, as G1's store records them,
// with the SDN-AP row of the pinned build (config.g1.sdnapBuild) for the same window. Reading and keying only.
import fs from 'node:fs';
import path from 'node:path';
import { config, readJsonl } from '../common.mjs';

const G1 = config.g1.store;
const SDNAP_DIR = path.join(G1, 'rows/sdngp', config.g1.sdnapBuild);
export const rowKey = (r) => `${r.source}|${r.id}|${r.startUtc}|${r.fitSeconds}`; // G1's key (lib/sdngp-rows.mjs)
const LARES2 = /LARES-?2/i;
// G1's source -> regime map for the Earth-centered rows (its tables.mjs collect()), restricted to the regimes of config.rows
const EARTH = {
  iss: () => 'leo-iss',
  gnss: () => 'meo-gnss',
  'slr-high': () => 'meo-slr',
  'mgex-geo': () => 'geo-gnss',
  'mgex-igso': () => 'igso-gnss',
  'slr-low': (w) => (LARES2.test(w.id) ? 'meo-slr' : 'leo-slr'),
  'slr-low-current': (w) => (LARES2.test(w.id) ? 'meo-slr-current' : 'leo-slr-current'),
  'slr-high-current': () => 'meo-slr-current',
  'heo-themis': (w) => (w.fitSeconds === 86400 ? 'heo-gp' : null),
  'heo-chandra': (w) => (w.fitSeconds === 86400 ? 'heo-gp' : null),
  'heo-tess': (w) => (w.fitSeconds === 86400 ? 'heo-tess' : null),
  'gnss-rapid': () => 'meo-gnss-rapid',
  'mgex-igso-rapid': () => 'igso-gnss-rapid',
  'mgex-geo-rapid': () => 'geo-gnss-rapid',
};
// the truth packs (G1's PACK_REGIME), restricted likewise
const PACKS = {
  'lro-lunar': (r) => (r.fitHours === 24 ? 'moon-lro-fit24' : null),
  'danuri-lunar': (r) => (r.fitHours === 24 ? 'moon-danuri-fit24' : null),
  'capstone-nrho': () => 'cislunar-capstone',
  'psyche-cruise': () => 'helio-psyche',
  'lucy-cruise-rec': () => 'helio-lucy-rec',
  'juno-cruise': () => 'helio-juno-cruise',
};

function sdnapRows() {
  const rows = [];
  for (const f of fs.readdirSync(SDNAP_DIR).filter((x) => x.endsWith('.jsonl'))) rows.push(...readJsonl(path.join(SDNAP_DIR, f)));
  return rows;
}

/** [{ row, regime, center, source, id, norad, startUtc, fitSeconds, key, sdnap }] in a fixed order (config.rows, then source, id, start). */
export function collectWindows() {
  const wanted = new Map(config.rows.map((r) => [r.regime, r]));
  const sd = sdnapRows();
  const byKey = new Map(sd.filter((r) => r.sdngp && r.source && r.startUtc).map((r) => [rowKey(r), r.sdngp]));
  const out = [];
  const push = (regime, w, sdnap) => {
    const r = wanted.get(regime);
    if (!r) return;
    out.push({ row: r.row, regime, center: r.center, source: w.source, id: w.id, norad: w.norad ?? 0, startUtc: w.startUtc, fitSeconds: w.fitSeconds, fitHours: w.fitHours ?? w.fitSeconds / 3600, key: rowKey(w), sdnap: sdnap ?? null });
  };
  const starlink = path.join(G1, 'rows/starlink');
  for (const f of fs.readdirSync(starlink).filter((n) => /^\d+\.json$/.test(n)).sort()) {
    const r = JSON.parse(fs.readFileSync(path.join(starlink, f)));
    if (r.ffm) push('leo-starlink-ffm', r.ffm, byKey.get(rowKey(r.ffm)));
  }
  for (const [source, map] of Object.entries(EARTH)) {
    for (const w of readJsonl(path.join(G1, 'rows', `${source}.jsonl`))) push(map(w), w, byKey.get(rowKey(w)));
  }
  for (const r of sd.filter((x) => x.sdngp && PACKS[x.source])) push(PACKS[r.source](r), r, r.sdngp);
  const order = new Map(config.rows.map((r, i) => [r.regime, i]));
  out.sort((a, b) => order.get(a.regime) - order.get(b.regime) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}

/** The registered window count of every row against the collected windows: [] when they agree, else the differences. */
export function countCheck(windows) {
  return config.rows.map((r) => ({ regime: r.regime, registered: r.windows, found: windows.filter((w) => w.regime === r.regime).length })).filter((x) => x.registered !== x.found);
}
