// LEO-SP truth (PLAN.md section 3, amendment of 2026-10-11): the receiver's own GNSS-based orbit in the commercial radio-
// occultation L1B files EUMETSAT distributes (collection EO:EUM:DAT:0374; Spire, and PlanetiQ where present). Each file is
// one occultation; data/receiver/orbit/centre_of_mass holds about 11 states, 30 s apart, in TOD (metres, UTC days and
// seconds since 2000-01-01), with orbit_predicted and manoeuvre flags; predicted states are excluded. The NORAD number is
// the satellite_id_norad attribute of data/receiver/satellite.
//
// - Access: an OAuth client-credentials token (the consumer key and secret read from their file at run time, sent only to
//   api.eumetsat.int, never printed or written). Only the occultation files ("entries") whose interval meets the target's
//   window are downloaded, at most SPIRE.maxBytesPerDay a target day, each into a fresh directory of its own, read with
//   ncdump (no code from the file runs) and deleted after the states are taken. Third-party licence: residuals only.
// - Frames: TOD (the files name no IAU convention; the IERS 2003 true-of-date axes are used: the conventions differ by
//   centimetres at LEO) to GCRF by foundation/frames transform_frame_position (WASM) with IERS EOP rows; the states then go
//   to gp-error-model as GCRF, without velocity (the module takes the RTN axes from SGP4's velocity there).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as fb from 'flatbuffers';
import { FRM, FRMT, FRMFrameTransformRequestT, FRMStateVectorT, FRMVector3T, RFMCoordinateSystemT, RFMOriginT, frmOperationCode, frmResultStatus, frmStateRepresentation, rfmAxisType, rfmOriginKind } from 'spacedatastandards.org/lib/js/FRM/main.js';
import * as O from 'spacedatastandards.org/lib/js/OEM/main.js';
import { packOem } from '../../../supgp-omm/lib/records.mjs';
import { PATHS, SPIRE, USER_AGENT } from '../../settings.mjs';
import { config } from '../windows.mjs';
import { isoZ, itemOf, sha256 } from './common.mjs';

const API = 'https://api.eumetsat.int';
const NCDUMP = '/opt/homebrew/bin/ncdump';
const J2000_MS = Date.UTC(2000, 0, 1);
const LEDGER = path.join(PATHS.store, 'spire-ledger.jsonl');

function credentials() {
  const text = fs.readFileSync(path.join(PATHS.secrets, 'eumetsat.env'), 'utf8');
  const get = (k) => { for (const l of text.split('\n')) { const m = l.match(new RegExp(`^\\s*(?:export\\s+)?${k}\\s*=\\s*(.*)\\s*$`)); if (m) return m[1].replace(/^(['"])(.*)\1$/, '$2'); } throw new Error(`eumetsat.env has no ${k}`); };
  return `${get('EUMETSAT_CONSUMER_KEY')}:${get('EUMETSAT_CONSUMER_SECRET')}`;
}

let token = null;
async function bearer() {
  if (token && token.expiresMs > Date.now() + 60e3) return token.value;
  const r = await fetch(`${API}/token`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(credentials()).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT }, body: 'grant_type=client_credentials', signal: AbortSignal.timeout(60000) });
  if (r.status !== 200) throw new Error(`EUMETSAT token: HTTP ${r.status}`);
  const j = await r.json();
  token = { value: j.access_token, expiresMs: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}
async function api(url, { binary = false } = {}) {
  for (let attempt = 1; ; ++attempt) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${await bearer()}`, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(300000) });
    if (r.status === 403 || r.status === 429) throw new Error(`EUMETSAT: HTTP ${r.status}; stopping`);
    if (r.ok) return binary ? Buffer.from(await r.arrayBuffer()) : r.json();
    await r.arrayBuffer().catch(() => null);
    if (attempt >= 3 || r.status < 500) throw new Error(`EUMETSAT ${url.split('?')[0]}: HTTP ${r.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
  }
}

// <MISSION>_1B_<FM>_<YYYYMMDDhhmmss>Z_<end>Z_..._<GNSS>_NN.nc: the receiver, the occultation's start and end.
const stamp = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12), +s.slice(12, 14));
function entryOf(href) {
  const name = decodeURIComponent(href.split('name=')[1] ?? '');
  const t = [...name.matchAll(/_(\d{14})Z/g)].map((m) => stamp(m[1]));
  const fm = /_1B_([A-Z0-9]+)_\d{14}Z/.exec(name)?.[1] ?? name.split('_')[2];
  return name.endsWith('.nc') && t.length >= 2 ? { name, href, fm, startMs: t[0], endMs: t[1] } : null;
}

// CDL text of one group from ncdump -> {variable: [numbers]}. Numbers are read as written (17 significant digits).
function cdlData(text) {
  const out = {};
  const data = text.split(/\n\s*data:\s*\n/)[1] ?? '';
  for (const m of data.matchAll(/(\w+)\s*=\s*([^;]*);/g)) out[m[1]] = m[2].split(',').map((x) => x.trim()).filter(Boolean).map(Number);
  return out;
}
function readOccultation(file) {
  const header = execFileSync(NCDUMP, ['-h', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const attr = (k) => new RegExp(`:${k} = "([^"]*)"`).exec(header)?.[1] ?? null;
  const norad = Number(attr('satellite_id_norad'));
  const cdl = execFileSync(NCDUMP, ['-g', '/data/receiver/orbit/centre_of_mass', '-p', '9,17', file], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (!/:coordinate_system = "TOD"/.test(cdl)) throw new Error('receiver orbit is not in TOD');
  const d = cdlData(cdl);
  const states = [];
  for (let i = 0; i < (d.utc_abstime?.length ?? 0); ++i) {
    const ms = J2000_MS + d.utc_absdate[i] * 86400000 + d.utc_abstime[i] * 1000;
    const r = d.position.slice(3 * i, 3 * i + 3);
    if (!Number.isFinite(ms) || r.some((x) => !Number.isFinite(x))) continue;
    states.push({ ms, r, predicted: d.orbit_predicted?.[i] === 1, manoeuvre: d.manoeuvre?.[i] === 1 });
  }
  return { norad, satellite: attr('satellite'), fm: attr('satellite_id_eum'), states };
}

// TOD position (m) at UTC ms -> GCRF position (m), by foundation/frames.
const earth = () => new RFMOriginT(rfmOriginKind.CELESTIAL_BODY, 399);
async function todToGcrf(frames, eopFrame, ms, r) {
  const epoch = new Date(ms).toISOString();
  const request = new FRMFrameTransformRequestT();
  Object.assign(request, {
    OPERATION: frmOperationCode.STATE_TRANSFORM,
    SOURCE_COORDINATE_SYSTEM: new RFMCoordinateSystemT('TOD', rfmAxisType.TRUE_OF_DATE_EQUATOR_IERS2003, earth(), 399, epoch, 'UTC'),
    TARGET_COORDINATE_SYSTEM: new RFMCoordinateSystemT('GCRF', rfmAxisType.ICRF, earth(), 399, epoch, 'UTC'),
    EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC',
    SOURCE_STATE: new FRMStateVectorT(frmStateRepresentation.CARTESIAN, [...r, 0, 0, 0], new FRMVector3T(...r), new FRMVector3T(0, 0, 0), 'TOD', epoch, 'UTC', 3.986004418e14),
    TARGET_REPRESENTATION: frmStateRepresentation.CARTESIAN,
  });
  const b = new fb.Builder(2048);
  FRM.finishFRMBuffer(b, new FRMT(request, null).pack(b));
  const out = await frames.invoke('transform_frame_position', [{ portId: 'request', typeRef: { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' }, payload: b.asUint8Array() }, eopFrame]);
  const result = FRM.getRootAsFRM(new fb.ByteBuffer(new Uint8Array(out.outputs[0].payload))).FRAME_TRANSFORM_RESULT();
  if (result.STATUS() !== frmResultStatus.OK) throw new Error(`foundation/frames: ${result.ERROR_MESSAGE()}`);
  const p = result.TARGET_STATE().POSITION();
  return [p.X(), p.Y(), p.Z()];
}

// GCRF states (km, UTC) of one object as a size-prefixed $OEM, without velocity.
function gcrfOem(norad, name, states) {
  const block = new O.ephemerisDataBlockT();
  block.OBJECT = new O.CATT();
  block.OBJECT.NORAD_CAT_ID = norad;
  block.OBJECT.OBJECT_NAME = name;
  block.REFERENCE_FRAME = new O.RFMT(O.RFMUnion.CelestialFrameWrapper, new O.CelestialFrameWrapperT(O.CelestialFrame.GCRF), 0, 'GCRF');
  block.TIME_SYSTEM = O.timingStandard.UTC;
  block.CENTER_NAME = 'EARTH';
  block.EPHEMERIS_DATA_LINES = states.map((s) => Object.assign(new O.ephemerisDataLineT(), { EPOCH: new Date(s.ms).toISOString().replace('Z', ''), X: s.g[0] / 1000, Y: s.g[1] / 1000, Z: s.g[2] / 1000, X_DOT: 0, Y_DOT: 0, Z_DOT: 0 }));
  block.START_TIME = block.EPHEMERIS_DATA_LINES[0].EPOCH;
  block.STOP_TIME = block.EPHEMERIS_DATA_LINES.at(-1).EPOCH;
  const oem = new O.OEMT();
  oem.ORIGINATOR = 'E15 from EUMETSAT RO L1B receiver orbit';
  oem.EPHEMERIS_DATA_BLOCK = [block];
  return packOem(oem);
}

function bytesSpent(day) {
  if (!fs.existsSync(LEDGER)) return 0;
  return fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.targetDay === day).reduce((t, x) => t + x.bytes, 0);
}

export const spire = {
  id: 'spire', regime: 'LEO-SP', live: false,
  async acquire({ readers, log, targetMs, wanted }) {
    const tolMs = config.targetToleranceSeconds * 1000;
    const day = isoZ(targetMs).slice(0, 10);
    const coverage = { truth: 'spire', regime: 'LEO-SP', targetUtc: isoZ(targetMs), products: [], entries: 0, downloaded: 0, bytes: 0, predictedExcluded: 0, items: 0, missing: 0 };
    const q = `${API}/data/search-products/1.0.0/os?pi=${encodeURIComponent(SPIRE.collection)}&format=json&dtstart=${isoZ(targetMs - 2 * 3600e3).slice(0, 19)}Z&dtend=${isoZ(targetMs + tolMs).slice(0, 19)}Z&c=50`;
    const found = await api(q);
    const products = (found.features ?? []).map((f) => ({ id: f.id, startMs: Date.parse(f.properties.date.split('/')[0]), endMs: Date.parse(f.properties.date.split('/')[1]), entries: (f.properties.links['sip-entries'] ?? []).map((e) => entryOf(e.href)).filter(Boolean) }));
    coverage.products = products.map((p) => ({ id: p.id, entries: p.entries.length }));
    // Ready when every mission has a product reaching past the window's end.
    const missions = new Set(products.map((p) => p.id.split('_')[0]));
    const ready = missions.size > 0 && [...missions].every((m) => products.some((p) => p.id.startsWith(m) && p.endMs >= targetMs + tolMs));
    if (!ready) return { items: [], coverage, ready: false };
    // Per receiver, the occultations whose interval meets [t - 3 min, t + 15 min], earliest first.
    const byFm = new Map();
    for (const p of products) for (const e of p.entries) {
      if (e.endMs < targetMs - 180e3 || e.startMs > targetMs + tolMs) continue;
      ++coverage.entries;
      if (!byFm.has(e.fm)) byFm.set(e.fm, []);
      byFm.get(e.fm).push(e);
    }
    const frames = await readers.module('foundation/frames');
    const eop = await readers.eop();
    const mjd = Math.floor(targetMs / 86400000) + 40587;
    const rows = eop.rows.filter((x) => x.mjd >= mjd - 2 && x.mjd <= mjd + 2);
    const eopFrame = { portId: 'earth_orientation', typeRef: { schemaName: 'EOP.fbs', fileIdentifier: '$EOP', rootTypeName: 'EOP' }, payload: Buffer.concat(rows.map((x) => x.bytes)) };
    const items = [];
    let spent = bytesSpent(day);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'e15-spire-'));
    try {
      for (const [fm, list] of byFm) {
        list.sort((a, b) => a.startMs - b.startMs);
        for (const e of list) {
          if (spent >= SPIRE.maxBytesPerDay) { log(`spire ${day}: the ${SPIRE.maxBytesPerDay / 1e6} MB a day budget is spent`); break; }
          const dir = fs.mkdtempSync(path.join(work, 'entry-'));
          const file = path.join(dir, 'occultation.nc');
          let occ;
          try {
            const bytes = await api(e.href, { binary: true });
            spent += bytes.length; coverage.bytes += bytes.length; ++coverage.downloaded;
            fs.appendFileSync(LEDGER, `${JSON.stringify({ at: new Date().toISOString(), targetDay: day, entry: e.name, bytes: bytes.length, sha256: sha256(bytes) })}\n`);
            fs.writeFileSync(file, bytes);
            occ = readOccultation(file);
          } catch (err) { log(`spire ${e.name}: ${String(err.message).slice(0, 160)}`); continue; } finally { fs.rmSync(dir, { recursive: true, force: true }); }
          if (wanted && !wanted.has(occ.norad)) break;
          const usable = occ.states.filter((s) => !s.predicted);
          coverage.predictedExcluded += occ.states.length - usable.length;
          if (!usable.some((s) => s.ms >= targetMs && s.ms <= targetMs + tolMs)) continue;
          for (const s of usable) s.g = await todToGcrf(frames, eopFrame, s.ms, s.r);
          const oem = gcrfOem(occ.norad, occ.satellite, usable);
          items.push(itemOf({ norad: occ.norad, regime: 'LEO-SP', oem, name: occ.satellite, targetMs, truth: { source: 'spire', version: e.name, startUtc: isoZ(usable[0].ms), publishedUtc: null, receiver: fm, manoeuvreFlags: usable.filter((s) => s.manoeuvre).length, sourceFrame: 'TOD (IERS 2003 axes), to GCRF by foundation/frames' } }));
          break;
        }
      }
    } finally { fs.rmSync(work, { recursive: true, force: true }); }
    coverage.items = items.filter((x) => !x.missing).length;
    coverage.missing = items.filter((x) => x.missing).length;
    coverage.receivers = byFm.size;
    log(`spire ${coverage.targetUtc}: ${coverage.items} receivers with truth of ${byFm.size} with occultations near the target; ${coverage.downloaded} files, ${(coverage.bytes / 1e6).toFixed(1)} MB`);
    return { items, coverage, ready: true };
  },
};
