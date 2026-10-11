// GNSS truth (PLAN.md section 3 and amendment A4): GPS and GLONASS from ESA's rapid SP3 (ESA0OPSRAP, the final ESA0OPSFIN
// when ESA has no rapid file for the day), Galileo and BeiDou from GFZ's MGEX rapid product (GFZ0MGXRAP, NASA CDDIS, an
// Earthdata bearer token read from its file at run time and sent only to cddis.nasa.gov). Each file is read in memory by
// files/orbit-products and taken from ITRF to GCRF by analysis/reference-states with IERS EOP (E4's sp3Context); the
// satellites are identified by the IGS satellite-metadata SINEX on the target's day. These products are public and
// re-fetchable, so a target day is scored once its products are published.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { gnssIdentities, sp3Context } from '../../../e4-operator-ephemeris-parity/sp3.mjs';
import { PATHS } from '../../settings.mjs';
import { eopFile, isoZ, itemOf, sha256 } from './common.mjs';

export const regime = 'GNSS';
const SINEX_URL = 'https://files.igs.org/pub/station/general/igs_satellite_metadata.snx';
const ESA = 'http://navigation-office.esa.int/products/gnss-products';
const CDDIS = 'https://cddis.nasa.gov/archive/gnss/products';
const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
const SYSTEMS = { ESA: ['G', 'R'], GFZ: ['E', 'C'] };

const pad = (n, w) => String(n).padStart(w, '0');
// The daily file that holds `ms` (GPS time is UTC + 18 s).
function dayName(ms, prefix) {
  const day = Math.floor((ms + 18000) / 86400e3) * 86400e3;
  const d = new Date(day);
  const doy = Math.floor((day - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400e3) + 1;
  const week = Math.floor((day - GPS_EPOCH_MS) / (7 * 86400e3));
  return { week, name: `${prefix}_${d.getUTCFullYear()}${pad(doy, 3)}0000_01D_05M_ORB.SP3.gz` };
}

function earthdataToken() {
  const text = fs.readFileSync(path.join(PATHS.secrets, 'earthdata.env'), 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?EARTHDATA_TOKEN\s*=\s*(.*)\s*$/);
    if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2');
  }
  throw new Error('earthdata.env has no EARTHDATA_TOKEN');
}

// CDDIS: the token only while the URL stays on cddis.nasa.gov; redirects followed by hand.
async function cddisGet(url) {
  const token = earthdataToken();
  let target = new URL(url);
  for (let hop = 0; hop < 5; ++hop) {
    const onHost = target.protocol === 'https:' && target.hostname === 'cddis.nasa.gov';
    const r = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': 'sdn-e15-aoe-lineage/1.0', ...(onHost ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(120000) });
    if ([301, 302, 303, 307, 308].includes(r.status)) { const next = r.headers.get('location'); await r.arrayBuffer().catch(() => null); if (!next) return { status: r.status }; target = new URL(next, target); continue; }
    const body = r.ok ? Buffer.from(await r.arrayBuffer()) : (await r.arrayBuffer().catch(() => null), null);
    return { status: r.status, body, lastModified: r.headers.get('last-modified') };
  }
  return { status: 0 };
}

async function acquire(agency, { http, readers, run, log, targetMs, wanted }) {
  const id = `gnss-${agency.toLowerCase()}`;
  const coverage = { truth: id, regime, targetUtc: isoZ(targetMs), products: [], items: 0, missing: 0 };
  const sinex = await http.get(SINEX_URL);
  if (sinex.status !== 200 || !sinex.body) throw new Error(`IGS satellite metadata: HTTP ${sinex.status}`);
  const sats = gnssIdentities(sinex.body.toString('latin1'), targetMs);
  readers.sp3 ??= await sp3Context(PATHS.readerModules, run ?? { addModule() {}, addInputs() {} }, eopFile());
  const items = [];
  const products = [];
  // ESA rapid, else final, for GPS and GLONASS.
  for (const prefix of agency === 'ESA' ? ['ESA0OPSRAP', 'ESA0OPSFIN'] : []) {
    const { week, name } = dayName(targetMs, prefix);
    const res = await http.get(`${ESA}/${week}/${name}`);
    if (res.status === 200 && res.body) { products.push({ agency: 'ESA', name, url: `${ESA}/${week}/${name}`, body: res.body, lastModified: res.headers.lastModified }); break; }
    coverage.products.push({ name, status: res.status });
  }
  // GFZ MGEX rapid for Galileo and BeiDou.
  if (agency === 'GFZ') {
    const { week, name } = dayName(targetMs, 'GFZ0MGXRAP');
    const res = await cddisGet(`${CDDIS}/${week}/${name}`).catch((e) => ({ status: 0, error: e.message }));
    if (res.status === 200 && res.body) products.push({ agency: 'GFZ', name, url: `${CDDIS}/${week}/${name}`, body: res.body, lastModified: res.lastModified });
    else coverage.products.push({ name, status: res.status });
  }
  for (const p of products) {
    const satellites = Object.fromEntries(Object.entries(sats).filter(([prn]) => SYSTEMS[p.agency].includes(prn[0]) && (!wanted || wanted.has(sats[prn].norad))));
    coverage.products.push({ name: p.name, status: 200, lastModified: p.lastModified, sha256: sha256(p.body), satellites: Object.keys(satellites).length });
    if (!Object.keys(satellites).length) continue;
    let converted;
    try {
      converted = await readers.sp3.convert(gunzipSync(p.body), { product: p.name, source: p.url, statedSigmaM: 0.05, statedSigmaBasis: 'placeholder: E15 does not use the covariance', satellites });
    } catch (e) { log(`gnss ${p.name}: ${String(e.message).slice(0, 200)}`); continue; }
    for (const c of converted) {
      const prn = Object.keys(satellites).find((k) => satellites[k].norad === c.norad);
      items.push(itemOf({ norad: c.norad, regime, oem: c.bytes, name: prn, targetMs, truth: { source: id, version: p.name, url: p.url, startUtc: null, publishedUtc: p.lastModified ? isoZ(Date.parse(p.lastModified)) : null, prn, sha256: sha256(p.body) } }));
    }
  }
  coverage.items = items.filter((x) => !x.missing).length;
  coverage.missing = items.filter((x) => x.missing).length;
  log(`gnss ${coverage.targetUtc}: ${coverage.items} satellites with truth from ${products.map((p) => p.name).join(', ') || 'no product yet'}`);
  return { items, coverage, ready: products.length === 1 };
}

// Two sources, as their products are published on different days: ESA's rapid file about a day after the target's day,
// GFZ's MGEX rapid file a day or two after.
export const gnssEsa = { id: 'gnss-esa', regime, live: false, acquire: (ctx) => acquire('ESA', ctx) };
export const gnssGfz = { id: 'gnss-gfz', regime, live: false, acquire: (ctx) => acquire('GFZ', ctx) };
