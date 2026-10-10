// Groups for which no operator state ephemeris can be had here. Each is a source with no candidates: every set
// is recorded unpaired with the reason, and a probe fetches what can be fetched so the reason rests on the
// operator's own file, not on a belief. Nothing is fitted.
import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../config.mjs';
import { sha256 } from '../lib/http.mjs';

const PAGE = path.join(PATHS.supgp, '_index/supplemental-index.html');
// What CelesTrak's own page says each group is derived from ("Derived from latest X ephemeris data on Space Track ...").
function celestrakStatement(keyword) {
  if (!fs.existsSync(PAGE)) return null;
  const text = fs.readFileSync(PAGE, 'utf8').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return [...text.matchAll(/Derived from [^.]*?(?:Space Track|Space-Track|almanac|Almanac|permission from [A-Za-z/ ]+)\.?/g)].map((m) => m[0]).find((s) => new RegExp(keyword, 'i').test(s)) ?? null;
}
const note = (r, url) => `${url} HTTP ${r.status}, ${r.body?.length ?? 0} bytes, sha256 ${r.body ? sha256(r.body).slice(0, 16) : '-'}`;
const lines = (r) => (r.body ? r.body.toString('utf8').split(/\r?\n/).filter(Boolean) : []);

export const spaceTrackOnly = (id, keyword) => ({
  id, unavailable: true, hours: null,
  code: 'no-access',
  async probe() {
    const said = celestrakStatement(keyword);
    return `no operator ephemeris reachable: ${said ? `CelesTrak: "${said}"` : 'the operator publishes its ephemeris only through Space-Track (credentialed)'}`;
  },
});

export const oneweb = {
  id: 'oneweb', unavailable: true, hours: null, code: 'no-state-ephemeris',
  async probe({ http }) {
    const r = await http.get('https://ephemeris.oneweb.net/ltef/ltef.csv');
    if (r.status !== 200) return `OneWeb LTEF unreachable (HTTP ${r.status})`;
    const rows = lines(r).map((l) => l.split(','));
    const said = celestrakStatement('OneWeb');
    return `OneWeb's public LTEF (ltef.csv, ${r.body.length} bytes, sha256 ${sha256(r.body).slice(0, 16)}) holds ${rows.length} rows of ${rows[0]?.length} columns, one row per satellite: a single mean-element record each, no time series of states, and files/orbit-products and data-source/oneweb-source decode no state from it (DECODE_STATUS unresolved-ltef-encoding). ${said ? `CelesTrak: "${said}"` : 'CelesTrak derives its OneWeb sets from the operator ephemeris on Space-Track.'}`;
  },
};

export const telesat = {
  id: 'telesat', unavailable: true, hours: null, code: 'no-state-ephemeris',
  async probe({ http }) {
    const fleet = await http.get('https://app.telesat.com/data/FleetLong.csv');
    if (fleet.status !== 200) return `Telesat FleetLong.csv unreachable (HTTP ${fleet.status})`;
    const sats = lines(fleet).slice(1).map((l) => l.split(',')[0].trim()).filter(Boolean);
    const one = await http.get(`https://app.telesat.com/data/${sats[0]}.C.csv`);
    const rows = lines(one);
    return `Telesat publishes centre-of-box predictions only: FleetLong.csv lists ${sats.length} satellites and ${sats[0]}.C.csv has ${rows.length} lines ("${(rows[1] ?? '').slice(0, 60)}"), the station-keeping box centre, not a state vector. ${note(fleet, 'https://app.telesat.com/data/FleetLong.csv')}`;
  },
};

export const eumetsat = {
  id: 'eumetsat', unavailable: true, hours: null, code: 'no-state-ephemeris',
  async probe({ http }) {
    const r = await http.get('https://service.eumetsat.int/tle/javascript/data_content_m01.js');
    if (r.status !== 200) return `EUMETSAT TLE data unreachable (HTTP ${r.status})`;
    const t = r.body.toString('utf8').split(/\r?\n/);
    const tle = t.filter((l) => /^1 \d{5}/.test(l.replace(/^[^"']*["']/, ''))).length;
    return `EUMETSAT publishes TLE element sets itself (data_content_m01.js, ${r.body.length} bytes, ${tle} TLE line-1 records) and no state ephemeris; a CelesTrak set compared with the operator's own element set is not a comparison on an ephemeris, so none is scored.`;
  },
};

export const gps = {
  id: 'gps', unavailable: true, hours: null, code: 'no-ephemeris-at-epoch',
  async probe({ http, snapshot }) {
    const week = Math.floor((Date.now() - Date.UTC(1980, 0, 6)) / (7 * 86400e3));
    const listing = await http.get(`http://navigation-office.esa.int/products/gnss-products/${week}/`);
    const ult = [...(listing.body?.toString() ?? '').matchAll(/ESA0OPSULT_(\d{4})(\d{3})(\d{4})_02D/g)].map((m) => ({ y: +m[1], d: +m[2], hm: m[3] })).sort((a, b) => a.d - b.d || a.hm.localeCompare(b.hm)).at(-1);
    const endMs = ult ? Date.UTC(ult.y, 0, 1) + (ult.d - 1) * 86400e3 + (+ult.hm.slice(0, 2)) * 3600e3 + 2 * 86400e3 : null;
    const epochs = [...new Set(snapshot.rows.map((r) => r.epoch.slice(0, 16)))];
    return `CelesTrak fits the GPS almanac (SEM, IS-GPS-200) propagated for the coming day, and every set's EPOCH (${epochs.join(', ')}Z) is the almanac's time of applicability; the stack has an almanac mapper (data-source/gps-source) but no propagator, and the newest precise orbit reachable (ESA ultra-rapid ${ult ? `of 2026 day ${ult.d} ${ult.hm}Z` : 'none found'}) ends ${endMs ? new Date(endMs).toISOString() : 'n/a'}, before the EPOCH; BKG's IGS archive refuses connections from here. A precise orbit is not the ephemeris CelesTrak fitted, so the gate could not pass if it were.`;
  },
};
