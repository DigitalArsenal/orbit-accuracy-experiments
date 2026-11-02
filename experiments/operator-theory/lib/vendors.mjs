// The vendors beyond the forward test's four (VENDORS.md): GPS, GLONASS and Galileo from ESA's ultra-rapid SP3; the ILRS prediction centers from EDC's CPF files; Intelsat and
// SES from their IESS-412 files. Each returns arms.mjs's file list: { name, norad, object, label, read() -> { lines [{epoch, r km, v km/s}] GCRF, frame: 'GCRF', meta } }. Bytes stay in
// memory. Parsing, frames and time scales are the modules' (files/orbit-products, data-source/cpf-source, analysis/reference-states); this file only finds files and routes bytes.
//   asOfMs: only files a reader could have had by then; every source names its rule in VENDORS.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import * as flatbuffers from 'flatbuffers';
import { NCD } from 'spacedatastandards.org/lib/js/NCD/main.js';
import { EOP } from 'spacedatastandards.org/lib/js/EOP/main.js';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { encodeHttpResponse } from 'space-data-module-sdk/runtime-contracts';
import { gnssIdentities } from '../../e4-operator-ephemeris-parity/sp3.mjs';
import { asLines, sp3Descriptor } from '../../supgp-omm/lib/readers/ecef.mjs';
import { readI11, withoutTelexAnnotations } from '../../supgp-omm/lib/readers/i11.mjs';
import { unpackOem } from '../../supgp-omm/lib/records.mjs';
import { loadReader } from '../../supgp-omm/lib/modules.mjs';
import { PoliteHttp } from '../../supgp-omm/lib/http.mjs';
import { PATHS } from '../../supgp-omm/config.mjs';
import * as intelsat from '../../supgp-omm/sources/intelsat.mjs';
import { oemLines } from '../../xp-atmosphere-merit/lib/sds.mjs';
import { isoMs } from './host.mjs';

const HOUR = 3600000, DAY = 86400000;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const readerRoot = () => process.env.SDN_MODULES_ROOT || PATHS.readerModules;
const eopFile = () => {
  const latest = JSON.parse(fs.readFileSync(path.join(PATHS.eop, 'iers-eop/latest.json'), 'utf8'));
  return path.join(PATHS.eop, latest.files['finals.all.iau2000.txt'].path);
};
const linesOf = (bytes) => oemLines(bytes).map((l) => ({ epoch: isoMs(Date.parse(/[zZ]$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)), r: l.r, v: l.v }));
const shardOf = (args) => (args.shard ?? '0/1').split('/').map(Number);
const inShard = (id, [k, n]) => parseInt(sha(`vendors:${id}`).slice(0, 8), 16) % n === k;
const newest = (dir, group) => {
  const names = fs.readdirSync(path.join(dir, group)).filter((n) => /^\d{8}T\d{6}Z\.json$/.test(n)).sort();
  return JSON.parse(fs.readFileSync(path.join(dir, group, names.at(-1)), 'utf8'));
};
const SUPGP = '/opt/data/sdn-archive/celestrak/supgp-host02';
const rowsOf = (group) => newest(SUPGP, group).map((r) => ({ name: r.OBJECT_NAME, norad: r.NORAD_CAT_ID, epoch: r.EPOCH }));
// ---- The modules on their current typed contracts. Identities are a node config, so reference_states takes one instance per file.
const TYPE = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
async function harness(rel, config) {
  const dir = path.join(readerRoot(), rel);
  return createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm')), manifest: JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8')), surface: 'direct', ...(config ? { hostOptions: { config } } : {}) });
}
const mustOk = (what, r) => { if (r.statusCode !== 0) throw new Error(`${what}: ${r.errorCode ?? r.statusCode}: ${r.errorMessage}`); return r; };
let eopAll = null;
async function earthOrientation(firstMs, lastMs) {
  if (!eopAll) {
    const parser = await harness('data-source/eop-parser');
    // One $FIL on "body": CONTENT is slot 9 (SDS FIL has no generated JS yet; the module's own test writes it the same way).
    const text = fs.readFileSync(eopFile());
    const fil = new flatbuffers.Builder(text.length + 64);
    const content = fil.createByteVector(text);
    fil.startObject(13);
    fil.addFieldOffset(9, content, 0);
    fil.finish(fil.endObject(), '$FIL');
    const r = mustOk('parse_finals2000a', await parser.invoke({ methodId: 'parse_finals2000a', inputs: [{ portId: 'body', typeRef: { schemaName: 'FIL.fbs', fileIdentifier: '$FIL', rootTypeName: 'FIL', wireFormat: 'flatbuffer' }, payload: fil.asUint8Array().slice() }] }));
    await parser.destroy();
    const stream = Buffer.from(r.outputs.find((o) => o.portId === 'records').payload);
    eopAll = [];
    for (let at = 0; at < stream.length;) {
      const n = stream.readUInt32LE(at);
      const bytes = stream.subarray(at, at + 4 + n);
      eopAll.push({ mjd: EOP.getRootAsEOP(new flatbuffers.ByteBuffer(new Uint8Array(bytes.subarray(4)))).MJD(), bytes });
      at += 4 + n;
    }
  }
  const lo = Math.floor(firstMs / DAY) + 40587 - 1, hi = Math.ceil(lastMs / DAY) + 40587 + 1;
  const rows = eopAll.filter((x) => x.mjd >= lo && x.mjd <= hi);
  if (!rows.length || rows[0].mjd > lo + 1 || rows.at(-1).mjd < hi - 1) throw new Error(`no IERS rows bracket ${isoMs(firstMs)} to ${isoMs(lastMs)}`);
  return { portId: 'earth_orientation', payload: Buffer.concat(rows.map((x) => x.bytes)), typeRef: TYPE('EOP') };
}
async function referenceStates(ephemeris, descriptor, identities, firstMs, lastMs) {
  const eop = await earthOrientation(firstMs, lastMs);
  const reference = await harness('analysis/reference-states', identities);
  const r = mustOk('reference_states', await reference.invoke({ methodId: 'reference_states', inputs: [{ portId: 'ephemeris', payload: ephemeris, typeRef: TYPE('OEM') }, { portId: 'descriptor', payload: descriptor, typeRef: TYPE('NCD') }, eop] }));
  await reference.destroy();
  return r.outputs.filter((o) => o.portId === 'reference').map((o) => Buffer.from(o.payload));
}
/** An Earth-fixed $OEM to GCRF, in the SP3 shape reference_states reads. */
async function earthFixedToGcrf(oemBytes, key, norad, name, agency) {
  const lines = asLines(oemBytes, key, 0);
  const count = unpackOem(lines.bytes).EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.length;
  const identities = { product: agency, source: 'operator ephemeris, Earth-fixed', statedSigmaM: 1, statedSigmaBasis: 'placeholder: the covariance is not used here', satellites: { [key]: { norad, objectId: '', name } } };
  const [out] = await referenceStates(lines.bytes, sp3Descriptor({ key, stepSeconds: lines.stepSeconds, count, agency, frameLabel: 'ITRF' }), identities, lines.firstMs, lines.lastMs);
  if (!out) throw new Error('reference_states returned no state');
  return out;
}
let orbitProducts = null;
const products = async () => {
  if (!orbitProducts) { const h = await loadReader('files/orbit-products', readerRoot()); orbitProducts = h; }
  return orbitProducts;
};
function sp3Frame(bytes) {  // [u32 n][$NCD][container], as read_container takes it
  const b = new flatbuffers.Builder(1024);
  const hash = b.createString(crypto.createHash('sha256').update(bytes).digest('hex'));
  NCD.startNCD(b);
  NCD.addSourceByteLength(b, BigInt(bytes.length));
  NCD.addSourceSha256(b, hash);
  NCD.finishSizePrefixedNCDBuffer(b, NCD.endNCD(b));
  return Buffer.concat([Buffer.from(b.asUint8Array()), bytes]);
}

// ---- GNSS: ESA's ultra-rapid orbits. One file holds every satellite: 48 h, the first 24 h solved from observations, the second 24 h ESA's prediction.
const ESA = 'http://navigation-office.esa.int/products/gnss-products';
const SINEX = 'https://files.igs.org/pub/station/general/igs_satellite_metadata.snx';
const GPS_EPOCH = Date.UTC(1980, 0, 6);
const SYSTEM = { gps: 'G', glonass: 'R' };
const ULT = /ESA0OPSULT_(\d{4})(\d{3})(\d{2})(\d{2})_02D_05M_ORB\.SP3\.gz/g;
async function gnssFiles(source, args, asOfMs, exclude) {
  const http = new PoliteHttp({ perHost: 2 });
  const week = Math.floor((asOfMs - GPS_EPOCH) / (7 * DAY));
  const found = new Map();
  for (const w of [week, week - 1]) {
    const page = await http.get(`${ESA}/${w}/`);
    if (page.status !== 200) continue;
    for (const m of page.body.toString('latin1').matchAll(ULT)) found.set(m[0], { url: `${ESA}/${w}/${m[0]}`, startMs: Date.UTC(+m[1], 0, 1) + (+m[2] - 1) * DAY + +m[3] * HOUR + +m[4] * 60000 });
  }
  // A file is published about 24 h after its start: only one started at least 26 h before asOf is one a reader could have had.
  const file = [...found.values()].filter((f) => f.startMs <= asOfMs - 26 * HOUR).sort((a, b) => b.startMs - a.startMs)[0];
  if (!file) throw new Error('ESA lists no ultra-rapid file old enough');
  const sinex = await http.get(SINEX);
  if (sinex.status !== 200) throw new Error(`IGS metadata: HTTP ${sinex.status}`);
  const everyone = gnssIdentities(sinex.body.toString('latin1'), file.startMs + 24 * HOUR);
  const satellites = Object.fromEntries(Object.entries(everyone).filter(([prn, s]) => prn.startsWith(SYSTEM[source]) && !exclude.has(s.norad) && inShard(`${source}|${s.norad}`, shardOf(args))));
  let converted = null;
  const all = async () => {
    if (!converted) converted = (async () => {
      const res = await http.get(file.url);
      if (res.status !== 200) throw new Error(`${file.url}: HTTP ${res.status}`);
      const reader = await harness('files/orbit-products');
      const read = mustOk('read_container', await reader.invoke({ methodId: 'read_container', inputs: [{ portId: 'container', payload: sp3Frame(gunzipSync(res.body)), typeRef: TYPE('NCD') }] }));
      await reader.destroy();
      const port = (id) => Buffer.from(read.outputs.find((o) => o.portId === id).payload);
      const descriptor = NCD.getSizePrefixedRootAsNCD(new flatbuffers.ByteBuffer(new Uint8Array(port('descriptor'))));
      const start = Date.parse(`${descriptor.START_TIME().slice(0, 19)}Z`), stop = Date.parse(`${descriptor.STOP_TIME().slice(0, 19)}Z`);
      const list = await referenceStates(port('ephemeris'), port('descriptor'), { product: 'ESA0OPSULT', source: file.url, statedSigmaM: 0.1, statedSigmaBasis: 'placeholder: the covariance is not used here', satellites }, start, stop);
      const out = list.map((bytes) => ({ bytes, norad: unpackOem(bytes).EPHEMERIS_DATA_BLOCK[0].OBJECT.NORAD_CAT_ID }));
      return out;
    })();
    return converted;
  };
  return Object.entries(satellites).map(([prn, s]) => ({ name: file.url.split('/').at(-1), norad: s.norad, object: `${prn} ${s.name}`, label: source, async read() {
    const mine = (await all()).find((c) => c.norad === s.norad);
    if (!mine) throw new Error(`${prn} is not in the file`);
    return { lines: linesOf(mine.bytes), frame: 'GCRF', meta: { created: isoMs(file.startMs + 24 * HOUR), product: 'ESA0OPSULT' } };
  } }));
}

// ---- ILRS CPF: one file per target, center and issue, on EDC's anonymous archive. The issue date in the name must be before asOf.
const EDC = 'https://edc.dgfi.tum.de/pub/slr/cpf_predicts_v2';
const LUNAR = /^(apollo|luna|lro|nglr)/;
const GNSS = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
// A sample of the navigation targets, by SHA-256 order; every other target is taken (VENDORS.md).
const GNSS_SAMPLE = { beidou: 8, compass: 3, galileo: 8, glonass: 4, gps: 2, irnss: 4, qzs: 3 };
async function cpfListing(http, year, cacheDir) {
  const cache = path.join(cacheDir, `cpf-listing-${new Date().toISOString().slice(0, 13)}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
  const page = await http.get(`${EDC}/${year}/`);
  if (page.status !== 200) throw new Error(`EDC: HTTP ${page.status}`);
  const targets = [...page.body.toString('utf8').matchAll(/href='[^']*\/([^'/]+)\/?'/g)].map((m) => m[1]).filter((t) => !t.includes('.') && t !== year && t !== 'cpf_predicts_v2');
  const out = {};
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (targets.length) {
      const t = targets.shift();
      const res = await http.get(`${EDC}/${year}/${t}/`);
      if (res.status === 200) out[t] = [...res.body.toString('utf8').matchAll(/href='[^']*\/([^'/]+)'/g)].map((m) => m[1]).filter((n) => n.startsWith(`${t}_cpf_`));
    }
  }));
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(`${cache}.${process.pid}`, JSON.stringify(out));
  fs.renameSync(`${cache}.${process.pid}`, cache);
  return out;
}
async function cpfFiles(source, args, asOfMs, excludeTargets) {
  const centre = source.split('-')[1];
  const http = new PoliteHttp({ perHost: 2 });
  const asOf = new Date(asOfMs), year = asOf.getUTCFullYear();
  // --cpf-listing: a stored listing, so a back-test over many workers asks EDC for no listing at all.
  const listing = args['cpf-listing'] ? JSON.parse(fs.readFileSync(args['cpf-listing'], 'utf8')) : await cpfListing(http, year, args['cache-dir'] ?? path.join(args.out, '..'));
  const yymmdd = `${String(year).slice(2)}${String(asOf.getUTCMonth() + 1).padStart(2, '0')}${String(asOf.getUTCDate()).padStart(2, '0')}`;
  const sampled = new Set();
  for (const [family, n] of Object.entries(GNSS_SAMPLE)) Object.keys(listing).filter((t) => t.startsWith(family)).sort((a, b) => sha(`operator-theory-vendors:${a}`).localeCompare(sha(`operator-theory-vendors:${b}`))).slice(0, n).forEach((t) => sampled.add(t));
  const chosen = [];
  for (const [target, names] of Object.entries(listing)) {
    if (LUNAR.test(target) || excludeTargets.has(target) || (GNSS.test(target) && !sampled.has(target)) || !inShard(`${source}|${target}`, shardOf(args))) continue;
    const mine = names.filter((n) => n.endsWith(`.${centre}`) && n.split('_')[2] < yymmdd).sort();
    if (mine.length) chosen.push({ target, file: mine.at(-1) });
  }
  return chosen.map(({ target, file }) => ({ name: file, norad: 0, object: target, async read() {
    const url = `${EDC}/${year}/${target}/${file}`;
    const res = await http.get(url);
    if (res.status !== 200) throw new Error(`${file}: HTTP ${res.status}`);
    const module = await harness('data-source/cpf-source', { listingUrl: `${EDC}/${year}/${target}/`, target });
    const r = mustOk('cpf emit', await module.invoke({ methodId: 'emit', inputs: [{ portId: 'response', typeRef: { schemaName: 'HttpResponse.fbs', fileIdentifier: 'HRSP', rootTypeName: 'HttpResponse', wireFormat: 'flatbuffer' }, payload: encodeHttpResponse({ url, status: 200, error: '', headers: {}, body: new Uint8Array(res.body), retrievedMs: asOfMs }) }] }));
    await module.destroy();
    const frame = r.outputs.find((o) => o.portId === 'oem');
    if (!frame) throw new Error('the module read no position from the file');
    const oem = Buffer.from(frame.payload);
    const block = unpackOem(oem).EPHEMERIS_DATA_BLOCK[0];
    this.norad = block.OBJECT.NORAD_CAT_ID;
    if (excludeTargets.norads?.has(this.norad)) throw new Error(`NORAD ${this.norad} is held out (VENDORS.md)`);
    const earthFixed = block.REFERENCE_FRAME?.REFERENCE_FRAME_type === 4;
    const bytes = earthFixed ? await earthFixedToGcrf(oem, target.toUpperCase().slice(0, 12), this.norad, target, centre.toUpperCase()) : oem;
    return { lines: linesOf(bytes), frame: earthFixed ? 'GCRF' : 'EME2000', meta: { created: file.split('_')[2], centre } };
  } }));
}

// ---- Intelsat and SES: IESS-412 eleven-parameter files, Earth-fixed, evaluated by files/orbit-products at 300 s.
async function intelsatFiles(args) {
  const http = new PoliteHttp({ perHost: 2 });
  const rows = rowsOf('intelsat').filter((r) => !/\[PM\]$/.test(r.name) && inShard(`intelsat|${r.norad}`, shardOf(args)));
  const ctx = await intelsat.prepare({ http, log: () => {}, snapshot: { rows } });
  const kind = args.kind ?? 'w';
  return rows.map((row) => ({ row, file: [...ctx.files.values()].filter((f) => f.code === intelsat.codeOf(row.name) && f.kind === kind).sort((a, b) => b.startMs - a.startMs)[0] })).filter((x) => x.file).map(({ row, file }) => ({
    name: file.id, norad: row.norad, object: row.name, label: 'intelsat', async read() {
      const body = await readI11(await products(), withoutTelexAnnotations(file.body));
      return { lines: linesOf(await earthFixedToGcrf(body, 'INTELSAT', row.norad, row.name, 'Intelsat')), frame: 'GCRF', meta: { created: isoMs(file.startMs), kind: file.kind } };
    } }));
}
const SES_INDEX = 'https://www.ses.com/network-and-technology/technical-data-and-tools/satellite-orbital-data';
const sesKey = (name) => name.replace(/\(.*?\)/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
async function sesFiles(args) {
  const http = new PoliteHttp({ perHost: 2 });
  const byKey = new Map(rowsOf('ses').map((r) => [sesKey(r.name), r]));
  // A file for a satellite outside CelesTrak's SES group takes its number from the newest local SATCAT snapshot, by name; a name with no live match stays unread.
  const satcatDir = '/opt/data/sdn-archive/spacetrack/satcat/2026';
  const satcat = JSON.parse(gunzipSync(fs.readFileSync(path.join(satcatDir, fs.readdirSync(satcatDir).filter((n) => n.endsWith('.json.gz')).sort().at(-1)))).toString('utf8'));
  for (const s of satcat) if (!s.DECAY && s.OBJECT_TYPE !== 'DEBRIS' && !byKey.has(sesKey(s.OBJECT_NAME ?? s.SATNAME ?? ''))) byKey.set(sesKey(s.OBJECT_NAME ?? s.SATNAME ?? ''), { name: s.OBJECT_NAME ?? s.SATNAME, norad: Number(s.NORAD_CAT_ID) });
  const page = await http.get(SES_INDEX);
  if (page.status !== 200) throw new Error(`SES index: HTTP ${page.status}`);
  const urls = [...new Set([...page.body.toString('utf8').matchAll(/https:\/\/[^"' ]*ses-satellite-orbital-data-public[^"' ]*\/ephemeris\/[^"' ]+\.I11/g)].map((m) => m[0]))].filter((u) => inShard(`ses|${u}`, shardOf(args)));
  return urls.map((url) => ({ name: url.split('/').at(-1), norad: 0, object: url.split('/').at(-1).replace(/_THRU\.I11$/i, ''), label: 'ses', async read() {
    const res = await http.get(url);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const body = await readI11(await products(), res.body);
    const block = unpackOem(body).EPHEMERIS_DATA_BLOCK[0];
    const row = byKey.get(sesKey(block.OBJECT.OBJECT_NAME)) ?? byKey.get(sesKey(this.object));
    if (!row) throw new Error(`no NORAD number for ${block.OBJECT.OBJECT_NAME}`);
    this.norad = row.norad; this.object = row.name;
    return { lines: linesOf(await earthFixedToGcrf(body, 'SES', row.norad, row.name, 'SES')), frame: 'GCRF', meta: { created: block.START_TIME } };
  } }));
}

/** Held out of this test (VENDORS.md): C2's held-out objects and the satellites barred until E13b scores. */
// C2 holds out its Galileo sample too (results/ffm-covariance-calibration/precheck-P9.json).
export const EXCLUDE_NORADS = new Set([31698, 66315, 22824, 8820, 39451, 39452, 39453, 43476, 43477, 43567, 37847, 41862, 41174, 43055, 41175]);
export const EXCLUDE_TARGETS = new Set(['terrasarx', 'sentinel1d', 'stella', 'lageos1', 'swarma', 'swarmb', 'swarmc', 'gracefo1', 'gracefo2']);

export async function vendorFiles(source, args, extraNorads = []) {
  const asOfMs = args['as-of'] ? Date.parse(args['as-of']) : Date.now();
  const exclude = new Set([...EXCLUDE_NORADS, ...extraNorads]);
  const targets = Object.assign(new Set(EXCLUDE_TARGETS), { norads: exclude });
  const files = source in SYSTEM ? await gnssFiles(source, args, asOfMs, exclude) : source.startsWith('cpf-') ? await cpfFiles(source, args, asOfMs, targets)
    : source === 'intelsat' ? await intelsatFiles(args) : source === 'ses' ? await sesFiles(args) : null;
  if (!files) throw new Error(`unknown source ${source}`);
  return args.limit ? files.slice(0, Number(args.limit)) : files;
}
