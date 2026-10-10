// In-memory fetchers for E12's operator ephemerides (SpaceX Starlink MEME,
// NASA ISS OEM, Planet per-satellite OEM, China Manned Space OEM, ILRS CPF,
// Intelsat ECF, IGS SP3). Every fetch* returns parsed segments in one shape
// (see `segment`); the bytes are held in memory only and are never written to
// disk, cached or logged. The line readers are E4's (operators.mjs); this file
// adds the polite request queue, the SP3 reader, the multi-segment OEM split
// and the listings. Values and labels are exactly as the file states them;
// no frame or time-scale conversion happens here.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { readMeme, readOem, readCpf, readIntelsat, readPlanetStates, unzipMembers } from '../e4-operator-ephemeris-parity/operators.mjs';

// ── Polite HTTP: one serial queue, >= 5 s between requests to a host ──
const USER_AGENT = 'orbit-accuracy-experiments-e12/0.1 (research)';
const MIN_GAP_MS = 5000;
const lastDone = new Map(); // host -> ms when its last request finished
const blockedHosts = new Map(); // host -> HTTP status that blocked it (this process)
let queueTail = Promise.resolve();

export class ProviderBlocked extends Error {
  constructor(host, status) { super(`${host} answered ${status}; no further requests to it in this process`); this.name = 'ProviderBlocked'; this.host = host; this.status = status; }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function attempt(url, host) {
  const wait = (lastDone.get(host) ?? 0) + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  try {
    const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(180000) });
    const bytes = Buffer.from(await res.arrayBuffer());
    return { res, bytes };
  } finally {
    lastDone.set(host, Date.now());
  }
}

async function request(url, { retries, retryDelayMs }) {
  const host = new URL(url).host;
  for (let n = 0; ; ++n) {
    if (blockedHosts.has(host)) throw new ProviderBlocked(host, blockedHosts.get(host));
    let out = null, failure = null;
    try { out = await attempt(url, host); } catch (error) { failure = error; }
    if (out && (out.res.status === 403 || out.res.status === 429)) { blockedHosts.set(host, out.res.status); throw new ProviderBlocked(host, out.res.status); }
    if (out && out.res.status < 500) {
      if (!out.res.ok) throw new Error(`GET ${url}: HTTP ${out.res.status}`);
      return {
        bytes: out.bytes, url, retrievedUtc: new Date().toISOString(), httpStatus: out.res.status, sha256: sha256(out.bytes),
        lastModified: out.res.headers.get('last-modified') ? new Date(out.res.headers.get('last-modified')).toISOString() : null,
      };
    }
    if (n >= retries) throw failure ?? new Error(`GET ${url}: HTTP ${out.res.status}`);
    await sleep(retryDelayMs); // 5xx or network error: one retry after 60 s by default
  }
}

// get(url) -> {bytes, url, retrievedUtc, httpStatus, sha256, lastModified}. All calls
// share one queue, so requests are serial across providers. `retries` and
// `retryDelayMs` may be raised for a host whose connections fail before any request is made.
export function get(url, { retries = 1, retryDelayMs = 60000 } = {}) {
  const job = queueTail.then(() => request(url, { retries, retryDelayMs }));
  queueTail = job.catch(() => {});
  return job;
}

const getText = async (url, options) => { const r = await get(url, options); return { r, text: r.bytes.toString('utf8') }; };
const provenance = (r) => ({ url: r.url, retrievedUtc: r.retrievedUtc, sha256: r.sha256, bytes: r.bytes.length, httpStatus: r.httpStatus, lastModified: r.lastModified });

// ── Shared pieces ──
// ISO text on the file's own scale from calendar fields; the seconds keep the
// digits the file gives (at least three decimals).
const pad = (v, w = 2) => String(v).padStart(w, '0');
function epochText(y, mo, d, h, mi, secText) {
  const [whole, frac = ''] = String(secText).split('.');
  return `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(whole)}.${frac.replace(/0+$/, '').padEnd(3, '0')}Z`;
}
const decimalsOf = (token) => (/\.(\d+)/.exec(token)?.[1] ?? '').length;
// Printed precision of a position column: the largest decimal count over a sample, and that increment in metres.
const digitsOf = (tokens, unitM) => { const decimals = Math.max(0, ...tokens.map(decimalsOf)); return { positionM: Number((unitM * 10 ** -decimals).toPrecision(3)), decimals }; };
const medianStep = (points) => {
  const d = [];
  for (let i = 1; i < Math.min(points.length, 101); ++i) d.push((Date.parse(points[i].epoch) - Date.parse(points[i - 1].epoch)) / 1000);
  d.sort((a, b) => a - b);
  return d.length ? d[d.length >> 1] : null;
};

// The common return shape.
function segment({ provider, objectId, name = null, norad = null, created = null, frame, timeScale, points, meta = {}, source }) {
  return { provider, objectId, name, norad, created, label: { frame, timeScale }, points, meta: { ...meta, stepSeconds: meta.stepSeconds ?? medianStep(points) }, source };
}

// ── SpaceX Starlink MEME ──
const STARLINK = 'https://api.starlink.com/public-files/ephemerides/';
export async function listStarlink() {
  const { text } = await getText(`${STARLINK}MANIFEST.txt`);
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^MEME_/.test(l));
}
export async function fetchStarlink(name) {
  const { r, text } = await getText(`${STARLINK}${name}`);
  const f = readMeme(text); // covariances are not carried
  const m = /^MEME_(\d+)_(.+?)_\d+_[A-Za-z]+_\d+_/.exec(name);
  const lines = text.split(/\r?\n/);
  const tokens = [...text.matchAll(/^\d{13}\.\d+\s+(\S+)\s+(\S+)\s+(\S+)/gm)].slice(0, 50).flatMap((m) => m.slice(1, 4));
  const step = /step_size:(\d+(?:\.\d+)?)/.exec(text)?.[1];
  return [segment({
    provider: 'spacex-starlink', objectId: m?.[1] ?? name, name: m?.[2] ?? null, norad: m ? Number(m[1]) : null, created: f.created,
    frame: f.frame, timeScale: f.timeScale,
    points: f.epochs.map((epoch, i) => ({ epoch, position: f.states[i].slice(0, 3), velocity: f.states[i].slice(3, 6) })),
    meta: { stepSeconds: step ? Number(step) : undefined, comments: lines.slice(1, 4), digits: digitsOf(tokens, 1000) },
    source: provenance(r),
  })];
}

// ── CCSDS OEM (KVN): one segment per META block; epochs kept as printed ──
// readOem takes states and header fields; the rows are scanned again here only for the printed epoch text and digits.
function scanRows(piece) {
  const rows = [];
  let data = false;
  for (const raw of piece.split(/\r?\n/)) {
    const l = raw.trim();
    if (l.startsWith('META_STOP')) { data = true; continue; }
    if (l.startsWith('META_START') || l.startsWith('COVARIANCE_START')) { data = false; continue; }
    if (!data || !l || l.startsWith('COMMENT')) continue;
    const f = l.split(/\s+/);
    if (f.length >= 7 && /^\d{4}-\d\d-\d\dT/.test(f[0])) rows.push({ epoch: /Z$/.test(f[0]) ? f[0] : `${f[0]}Z`, position: f.slice(1, 4) });
  }
  return rows;
}
const metaValue = (text, key) => new RegExp(`^\\s*${key}\\s*=\\s*(\\S.*?)\\s*$`, 'm').exec(text)?.[1] ?? null;

export function oemSegments(text, { provider, norad = null, source, extra = () => ({}) }) {
  // readOem appends its own 'Z' to CREATION_DATE, so a date that already ends in Z (Planet) is passed without it.
  const [header, ...pieces] = text.replace(/^(\s*CREATION_DATE\s*=\s*\S+?)Z[ \t]*$/m, '$1').split(/^(?=[ \t]*META_START)/m);
  return pieces.map((piece) => {
    const o = readOem(header + piece);
    const rows = scanRows(piece);
    if (rows.length !== o.epochs.length) throw new Error(`OEM ${o.name}: ${rows.length} scanned rows, ${o.epochs.length} parsed`);
    const method = metaValue(piece, 'INTERPOLATION'), degree = metaValue(piece, 'INTERPOLATION_DEGREE');
    const comments = (header + piece).split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('COMMENT')).map((l) => l.replace(/^COMMENT ?/, ''));
    return segment({
      provider, objectId: metaValue(piece, 'OBJECT_ID') ?? o.name, name: o.name, norad, created: o.created, frame: o.frame, timeScale: o.timeScale,
      points: rows.map((row, i) => ({ epoch: row.epoch, position: o.states[i].slice(0, 3), velocity: o.states[i].slice(3, 6) })),
      meta: {
        interpolation: method ? { method, degree: degree ? Number(degree) : null } : undefined, comments,
        digits: digitsOf(rows.slice(0, 50).flatMap((row) => row.position), 1000),
        ...extra({ piece, header, comments }),
      },
      source,
    });
  });
}

// ── NASA ISS OEM ──
const ISS_URL = 'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt';
// "NAME   DDD:HH:MM:SS.sss  [orbit]  dv  ha  hp" rows of the TRAJECTORY EVENT SUMMARY table (day of the file's year).
function issEvents(comments, startIso) {
  const year = Number(startIso.slice(0, 4)), start = Date.parse(startIso);
  const events = [];
  for (const c of comments) {
    const m = /^\s*(\S.*?)\s+(\d{3}):(\d\d):(\d\d):(\d\d(?:\.\d+)?)((?:\s+-?\d+(?:\.\d+)?){3,4})\s*$/.exec(c);
    if (!m) continue;
    const nums = m[6].trim().split(/\s+/).map(Number);
    let ms = Date.UTC(year, 0, 1) + (Number(m[2]) - 1) * 86400000 + Number(m[3]) * 3600000 + Number(m[4]) * 60000 + Math.round(Number(m[5]) * 1000);
    if (ms < start - 30 * 86400000) ms = Date.UTC(year + 1, 0, 1) + (ms - Date.UTC(year, 0, 1)); // table crosses new year
    events.push({ name: m[1], tig: new Date(ms).toISOString(), dvMs: nums.length === 4 ? nums[1] : nums[0] });
  }
  return events;
}
export async function fetchIss(url = ISS_URL) {
  const { r, text } = await getText(url);
  return oemSegments(text, {
    provider: 'nasa-iss', norad: 25544, source: provenance(r),
    extra: ({ piece, comments }) => ({ events: issEvents(comments, metaValue(piece, 'START_TIME')) }),
  });
}

// ── Planet per-satellite OEM ──
const PLANET = 'https://ephemerides.planet-labs.com/';
// planet.states first column gives the hardware IDs; 18SPCS_matches_v1.txt the catalog numbers
// (columns are separated by two or more spaces: hw_id, planet_name, 18spcs_name, catid, rms_km, matches, ...).
export async function listPlanet() {
  const { text: states } = await getText(`${PLANET}planet.states`);
  const { text: matches } = await getText(`${PLANET}18SPCS_matches_v1.txt`);
  const noradOf = new Map();
  for (const l of matches.split(/\r?\n/)) {
    if (!l.trim() || l.startsWith('#')) continue;
    const c = l.trim().split(/\s{2,}/);
    const id = /^[0-9a-f]{4}$/i.test(c[0]) ? c[0].toLowerCase() : null;
    const norad = [c[3], ...(c[5] ?? '').split('/')].find((v) => /^\d{1,6}$/.test(v ?? ''));
    if (id) noradOf.set(id, norad ? Number(norad) : null);
  }
  // stateEpochTT: the satellite's row in planet.states (ISO text on TT), showing which files are current.
  return readPlanetStates(states).map((s) => ({ hwid: s.hwid, norad: noradOf.get(s.hwid) ?? null, stateEpochTT: s.epochTT }));
}
export async function fetchPlanet(hwid, norad = null) {
  const { r, text } = await getText(`${PLANET}${hwid}_oem.txt`);
  return oemSegments(text, {
    provider: 'planet', norad, source: provenance(r),
    extra: ({ comments }) => ({ timeLastObservation: comments.map((c) => /TIME_LAST_OBSERVATION\s*=\s*(\S+)/.exec(c)?.[1]).find(Boolean) ?? null }),
  });
}

// ── China Manned Space (Tiangong): zip of OEM .dat members (km, KVN) ──
const CMSE_INDEX = 'https://www.cmse.gov.cn/gfgg/zgkjzgdcs/';
const CMSE_RETRY = { retries: 5, retryDelayMs: 10000 }; // this host often drops connections before any request is made
// Zip links on the index page, newest first (month directory, then the W-number in the file name).
export async function listTiangong() {
  const { text } = await getText(CMSE_INDEX, CMSE_RETRY);
  const links = [...text.matchAll(/(?:href|src)\s*=\s*["']([^"']*?(\d{6})\/(W\d+)\.zip)["']/g)]
    .map((m) => ({ url: new URL(m[1], CMSE_INDEX).href, name: `${m[3]}.zip`, month: m[2] }));
  const unique = [...new Map(links.map((l) => [l.url, l])).values()];
  return unique.sort((a, b) => (b.month + b.name).localeCompare(a.month + a.name));
}
export async function fetchTiangong(url) {
  url ??= (await listTiangong())[0]?.url;
  if (!url) throw new Error('Tiangong: no zip link on the index page');
  const r = await get(url, CMSE_RETRY);
  const source = provenance(r);
  return unzipMembers(r.bytes).filter((m) => /\.(dat|oem|txt)$/i.test(m.name)).flatMap((m) =>
    oemSegments(m.bytes.toString('utf8'), { provider: 'cmse-tiangong', source: { ...source, member: m.name }, extra: () => ({ member: m.name }) }));
}

// ── ILRS CPF v2 (EDC anonymous archive) ──
const EDC = 'https://edc.dgfi.tum.de/pub/slr/cpf_predicts_v2';
// Directory listing rows: <target>_cpf_<yymmdd>_<nnnvv>.<centre>; yymmdd is the file date, nnn the day of year, vv the version.
export async function listCpf(target, year = new Date().getUTCFullYear()) {
  const { text } = await getText(`${EDC}/${year}/${target}/`);
  const rows = [...text.matchAll(/href='[^']+'[^>]*>([^<]+)<\/a><\/td>\s*<td[^>]*>(\d+)<\/td>[\s\S]*?<td[^>]*>(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)<\/td>/g)];
  return rows.flatMap((m) => {
    const f = /^(.+)_cpf_(\d\d)(\d\d)(\d\d)_(\d{3})(\d\d)\.(\w+)$/.exec(m[1]);
    if (!f) return [];
    return [{ name: m[1], centre: f[7], issued: `20${f[2]}-${f[3]}-${f[4]}`, version: Number(f[6]), size: Number(m[2]), modified: `${m[3].replace(' ', 'T')}Z` }];
  });
}
export async function fetchCpf(target, name, year = new Date().getUTCFullYear()) {
  const { r, text } = await getText(`${EDC}/${year}/${target}/${name}`);
  const f = readCpf(text);
  const lines = text.split(/\r?\n/);
  const h2 = lines.find((l) => /^H2 /i.test(l)).trim().split(/\s+/);
  const h1 = lines.find((l) => /^H1 /i.test(l)).trim().split(/\s+/);
  const recs = lines.map((l) => l.trim().split(/\s+/)).filter((c) => c[0] === '10' && c[1] === '0');
  const points = f.rows.map((row) => ({ epoch: new Date(row.ms).toISOString(), position: row.position, velocity: null }));
  return [segment({
    provider: 'ilrs-cpf', objectId: f.target, name: f.target, norad: f.norad || null, created: f.created,
    frame: f.frame === 0 ? 'ITRF' : `CPF-frame-${f.frame}`, timeScale: 'UTC', points,
    meta: {
      stepSeconds: Number(h2[16]), centre: h1[3], cpfFrameCode: f.frame, leapSecondFlags: recs.filter((c) => Number(c[4]) !== 0).length,
      comments: lines.filter((l) => /^H[3-9] /.test(l)).map((l) => l.trim()),
      digits: digitsOf(recs.slice(0, 50).flatMap((c) => c.slice(5, 8)), 1),
    },
    source: provenance(r),
  })];
}

// ── Intelsat ECF ──
const INTELSAT_LIST = 'https://my.intelsat.com/ephemeris/public';
const INTELSAT_FILES = 'https://my.intelsat.com/Resource/Ephemeris/';
// The page is server-rendered; each file is an <option value="<name>"> of the file selectors (".txt" is appended on download).
// Names read i_<region>_<kind>_<slot>_<sat>_<yyyymmdd>_<hhmmss>; `kind` filters on the third field (e.g. 'e' for ECF ephemerides).
export async function listIntelsat(kind = null) {
  const { text } = await getText(INTELSAT_LIST);
  const names = [...text.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
  return kind ? names.filter((n) => n.split('_')[2] === kind) : names;
}
export async function fetchIntelsat(name) {
  const { r, text } = await getText(`${INTELSAT_FILES}${name.replace(/\.txt$/, '')}.txt`);
  const f = readIntelsat(text);
  const tokens = text.split(/\r?\n/).flatMap((l) => /^\d{4}\/\d\d\/\d\d\s+\S+\s+(\S+)\s+(\S+)\s+(\S+)/.exec(l.trim())?.slice(1, 4) ?? []).slice(0, 150);
  const parts = name.replace(/\.txt$/, '').split('_');
  return [segment({
    provider: 'intelsat', objectId: parts[4] ?? name, name: f.title, created: null, // the file states no production time
    frame: /^(\w+) Ephemeris/.exec(f.title)?.[1] ?? 'ECF', timeScale: 'UTC',
    points: f.rows.map((row) => ({ epoch: new Date(row.ms).toISOString(), position: row.position, velocity: null })),
    meta: { comments: [f.title], digits: digitsOf(tokens, 1), fileName: name },
    source: provenance(r),
  })];
}

// ── IGS precise orbits (SP3) ──
// Product URL for a date: kind 'fin' | 'rap' | 'ult' (ultra-rapid, 6-hour issue, 2-day file); week = floor((date - 1980-01-06) / 7 d).
// Defaults to the IGS combined products at BKG; the same layout is served by ESA's navigation office
// (ESA_PRODUCTS: ESA's own analysis-centre orbits, used when the IGS host is unreachable).
export const ESA_PRODUCTS = { base: 'http://navigation-office.esa.int/products/gnss-products', prefix: 'ESA0OPS', sampling: '05M' };
export function igsProductUrl(kind, dateIso, { base = 'https://igs.bkg.bund.de/root_ftp/IGS/products', prefix = 'IGS0OPS', sampling = '15M' } = {}) {
  const ms = Date.parse(dateIso), week = Math.floor((ms - Date.UTC(1980, 0, 6)) / (7 * 86400000));
  const d = new Date(ms), doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  const k = String(kind).slice(0, 3).toUpperCase();
  if (!['FIN', 'RAP', 'ULT'].includes(k)) throw new Error(`igsProductUrl: unknown kind ${kind}`);
  const stamp = `${d.getUTCFullYear()}${pad(doy, 3)}${k === 'ULT' ? pad(Math.floor(d.getUTCHours() / 6) * 6) : '00'}00`;
  return `${base}/${week}/${prefix}${k}_${stamp}_${k === 'ULT' ? '02D' : '01D'}_${sampling}_ORB.SP3.gz`;
}

// SP3-c/d text -> one segment per satellite. Km -> m, dm/s -> m/s; 0.000000 and 999999.999999 placeholders are skipped.
export function readSp3(text, source, provider = 'igs') {
  const lines = text.split(/\r?\n/);
  const h1 = lines[0], h2 = lines[1].trim().split(/\s+/);
  const cLine = /^%c\s+(\S)\s+cc\s+(\S+)/.exec(lines.find((l) => l.startsWith('%c')));
  const header = { frame: h1.slice(46, 51).trim(), agency: h1.slice(56, 60).trim(), stepSeconds: Number(h2[3]), withVelocity: h1[2] === 'V' };
  const sats = new Map();
  let epoch = null, lastPoint = null;
  for (const l of lines) {
    if (l.startsWith('*')) {
      const f = l.slice(1).trim().split(/\s+/);
      epoch = epochText(f[0], f[1], f[2], f[3], f[4], f[5]);
    } else if (l[0] === 'P' && epoch) {
      const id = l.slice(1, 4), x = l.slice(4, 18), y = l.slice(18, 32), z = l.slice(32, 46);
      const p = [x, y, z].map(Number);
      lastPoint = null;
      if (p.every((v) => v === 0) || p.some((v) => Math.abs(v) >= 999999)) continue;
      if (!sats.has(id)) sats.set(id, { points: [], tokens: [] });
      const s = sats.get(id);
      lastPoint = { id, point: { epoch, position: p.map((v) => v * 1000), velocity: null } };
      s.points.push(lastPoint.point);
      if (s.tokens.length < 150) s.tokens.push(x.trim(), y.trim(), z.trim());
    } else if (l[0] === 'V' && lastPoint && l.slice(1, 4) === lastPoint.id) {
      lastPoint.point.velocity = [l.slice(4, 18), l.slice(18, 32), l.slice(32, 46)].map((v) => Number(v) * 0.1);
    }
  }
  const comments = lines.filter((l) => l.startsWith('/*')).map((l) => l.slice(2).trim()).filter((l) => l && !/^C+$/.test(l));
  return [...sats].map(([id, s]) => segment({
    provider, objectId: id, created: null, // SP3 carries no production time
    frame: header.frame, timeScale: cLine?.[2] ?? 'GPS', points: s.points,
    meta: { stepSeconds: header.stepSeconds, centre: header.agency, constellationCode: cLine?.[1], comments, digits: digitsOf(s.tokens, 1000) },
    source,
  }));
}
export async function fetchSp3(url, provider = 'igs') {
  const r = await get(url);
  const raw = r.bytes[0] === 0x1f && r.bytes[1] === 0x8b ? gunzipSync(r.bytes) : r.bytes;
  return readSp3(raw.toString('utf8'), provenance(r), provider);
}
