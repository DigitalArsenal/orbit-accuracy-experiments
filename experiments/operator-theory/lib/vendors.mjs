// The vendors beyond the forward test's four (VENDORS.md): GPS, GLONASS and Galileo from ESA's ultra-rapid SP3; the ILRS prediction centers from EDC's CPF files; Intelsat and
// SES from their IESS-412 files. Each returns arms.mjs's file list: { name, norad, object, label, read() -> { lines [{epoch, r km, v km/s}] GCRF, frame: 'GCRF', meta } }. Bytes stay in
// memory. Parsing, frames and time scales are the modules' (files/orbit-products, data-source/cpf-source, analysis/reference-states); this file only finds files and routes bytes.
//   asOfMs: only files a reader could have had by then; every source names its rule in VENDORS.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { gnssIdentities, sp3Context } from '../../e4-operator-ephemeris-parity/sp3.mjs';
import { compileModule, runStreamModule } from '../../supgp-omm/lib/readers/hostmodule.mjs';
import { ecefToGcrf, eopRows } from '../../supgp-omm/lib/readers/ecef.mjs';
import { readI11, withoutTelexAnnotations } from '../../supgp-omm/lib/readers/i11.mjs';
import { unpackOem } from '../../supgp-omm/lib/records.mjs';
import { loadReader } from '../../supgp-omm/lib/modules.mjs';
import { PoliteHttp } from '../../supgp-omm/lib/http.mjs';
import { PATHS } from '../../supgp-omm/config.mjs';
import * as intelsat from '../../supgp-omm/sources/intelsat.mjs';
import * as ses from '../../supgp-omm/sources/ses.mjs';
import { oemLines } from '../../xp-atmosphere-merit/lib/sds.mjs';
import { isoMs } from './host.mjs';

const HOUR = 3600000, DAY = 86400000;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const readerRoot = () => process.env.SDN_MODULES_ROOT || PATHS.readerModules;
const eopFile = () => {
  const latest = JSON.parse(fs.readFileSync(path.join(PATHS.eop, 'iers-eop/latest.json'), 'utf8'));
  return path.join(PATHS.eop, 'iers-eop', latest.dir ?? latest.path ?? '', latest.file ?? 'finals2000A.all');
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
async function ecefReaders() {
  const [referenceStates, parser] = await Promise.all([loadReader('analysis/reference-states', readerRoot()), loadReader('data-source/eop-parser', readerRoot())]);
  const rows = await eopRows(parser, fs.readFileSync(eopFile()));
  await parser.destroy();
  return { referenceStates, rows };
}

// ---- GNSS: ESA's ultra-rapid orbits. One file holds every satellite: 48 h, the first 24 h solved from observations, the second 24 h ESA's prediction.
const ESA = 'http://navigation-office.esa.int/products/gnss-products';
const SINEX = 'https://files.igs.org/pub/station/general/igs_satellite_metadata.snx';
const GPS_EPOCH = Date.UTC(1980, 0, 6);
const SYSTEM = { gps: 'G', glonass: 'R', galileo: 'E' };
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
      const sp3 = await sp3Context(readerRoot(), { addModule() {}, addInputs() {} }, eopFile());
      const out = await sp3.convert(gunzipSync(res.body), { product: 'ESA0OPSULT', source: file.url, statedSigmaM: 0.1, statedSigmaBasis: 'placeholder: the covariance is not used here', satellites });
      await sp3.destroy();
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
const CPF_MODULE = 'data-source/cpf-source/dist/isomorphic/module.wasm';
const LUNAR = /^(apollo|luna|lro|nglr)/;
const GNSS = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
// A sample of the navigation targets, by SHA-256 order; every other target is taken (VENDORS.md).
const GNSS_SAMPLE = { beidou: 8, compass: 3, galileo: 4, glonass: 4, gps: 2, irnss: 4, qzs: 3 };
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
  const listing = await cpfListing(http, year, args['cache-dir'] ?? path.join(args.out, '..'));
  const yymmdd = `${String(year).slice(2)}${String(asOf.getUTCMonth() + 1).padStart(2, '0')}${String(asOf.getUTCDate()).padStart(2, '0')}`;
  const sampled = new Set();
  for (const [family, n] of Object.entries(GNSS_SAMPLE)) Object.keys(listing).filter((t) => t.startsWith(family)).sort((a, b) => sha(`operator-theory-vendors:${a}`).localeCompare(sha(`operator-theory-vendors:${b}`))).slice(0, n).forEach((t) => sampled.add(t));
  const chosen = [];
  for (const [target, names] of Object.entries(listing)) {
    if (LUNAR.test(target) || excludeTargets.has(target) || (GNSS.test(target) && !sampled.has(target)) || !inShard(`${source}|${target}`, shardOf(args))) continue;
    const mine = names.filter((n) => n.endsWith(`.${centre}`) && n.split('_')[2] < yymmdd).sort();
    if (mine.length) chosen.push({ target, file: mine.at(-1) });
  }
  const cpf = await compileModule(readerRoot(), CPF_MODULE);
  let ecef = null;
  return chosen.map(({ target, file }) => ({ name: file, norad: 0, object: target, async read() {
    const res = await http.get(`${EDC}/${year}/${target}/${file}`);
    if (res.status !== 200) throw new Error(`${file}: HTTP ${res.status}`);
    const [oem] = await runStreamModule(cpf.compiled, { listingUrl: 'memory://cpf/', target }, ({ url }) => {
      if (url === 'memory://cpf/') return { status: 200, body: `<a href="${file}">${file}</a>` };
      if (url === `memory://cpf/${file}`) return { status: 200, body: res.body };
      return { status: 404, body: '' };
    });
    if (!oem) throw new Error('the module read no position from the file');
    const block = unpackOem(oem).EPHEMERIS_DATA_BLOCK[0];
    this.norad = block.OBJECT.NORAD_CAT_ID;
    if (excludeTargets.norads?.has(this.norad)) throw new Error(`NORAD ${this.norad} is held out (VENDORS.md)`);
    const earthFixed = block.REFERENCE_FRAME?.REFERENCE_FRAME_type === 4;
    let bytes = oem;
    if (earthFixed) {
      ecef ??= await ecefReaders();
      bytes = (await ecefToGcrf({ referenceStates: ecef.referenceStates, rows: ecef.rows, oemBytes: oem, key: target.toUpperCase().slice(0, 12), norad: this.norad, name: target, agency: centre.toUpperCase() })).oem;
    }
    const lines = linesOf(bytes);
    return { lines, frame: earthFixed ? 'GCRF' : 'EME2000', meta: { created: file.split('_')[2], centre } };
  } }));
}

// ---- Intelsat and SES: IESS-412 eleven-parameter files, Earth-fixed, evaluated by files/orbit-products at 300 s.
async function intelsatFiles(args) {
  const http = new PoliteHttp({ perHost: 2 });
  const rows = rowsOf('intelsat').filter((r) => !/\[PM\]$/.test(r.name) && inShard(`intelsat|${r.norad}`, shardOf(args)));
  const ctx = await intelsat.prepare({ http, log: () => {}, snapshot: { rows } });
  const orbitProducts = await loadReader('files/orbit-products', readerRoot());
  let ecef = null;
  const kind = args.kind ?? 'w';
  return rows.map((row) => ({ row, file: [...ctx.files.values()].filter((f) => f.code === intelsat.codeOf(row.name) && f.kind === kind).sort((a, b) => b.startMs - a.startMs)[0] })).filter((x) => x.file).map(({ row, file }) => ({
    name: file.id, norad: row.norad, object: row.name, label: 'intelsat', async read() {
      ecef ??= await ecefReaders();
      const body = await readI11(orbitProducts, withoutTelexAnnotations(file.body));
      const g = await ecefToGcrf({ referenceStates: ecef.referenceStates, rows: ecef.rows, oemBytes: body, key: 'INTELSAT', norad: row.norad, name: row.name, agency: 'Intelsat' });
      return { lines: linesOf(g.oem), frame: 'GCRF', meta: { created: isoMs(file.startMs), kind: file.kind } };
    } }));
}
async function sesFiles(args) {
  const http = new PoliteHttp({ perHost: 2 });
  const rows = rowsOf('ses').filter((r) => inShard(`ses|${r.norad}`, shardOf(args)));
  const ctx = await ses.prepare({ http, log: () => {}, loadReader: (rel) => loadReader(rel, readerRoot()) });
  const orbitProducts = await loadReader('files/orbit-products', readerRoot());
  let ecef = null;
  return rows.map((row) => ({ row, file: ses.candidates(ctx, row).map((c) => ses.held(ctx, c)).filter(Boolean).sort((a, b) => b.startMs - a.startMs)[0] })).filter((x) => x.file).map(({ row, file }) => ({
    name: file.id, norad: row.norad, object: row.name, label: 'ses', async read() {
      ecef ??= await ecefReaders();
      const body = await readI11(orbitProducts, file.body);
      const g = await ecefToGcrf({ referenceStates: ecef.referenceStates, rows: ecef.rows, oemBytes: body, key: 'SES', norad: row.norad, name: row.name, agency: 'SES' });
      return { lines: linesOf(g.oem), frame: 'GCRF', meta: { created: isoMs(file.startMs) } };
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
  if (source in SYSTEM) return gnssFiles(source, args, asOfMs, exclude);
  if (source.startsWith('cpf-')) return cpfFiles(source, args, asOfMs, targets);
  if (source === 'intelsat') return intelsatFiles(args);
  if (source === 'ses') return sesFiles(args);
  throw new Error(`unknown source ${source}`);
}
