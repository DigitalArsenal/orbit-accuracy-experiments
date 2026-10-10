// CelesTrak SupGP, read from our collector's archive only:
//   <root>/<group>/<UTC stamp>.json        the OMM sets (JSON)
//   <root>/<group>/<UTC stamp>.rms.txt     CelesTrak's per-group fit RMS ("NORAD/NAME: RMS = x km")
//   <root>/<group>/provenance.jsonl        the collector's request log (request time, sha256, URL)
// Nothing here opens a network connection.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PATHS } from '../config.mjs';
import { ELEMENT_FIELDS as ELEMENTS } from './records.mjs';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function snapshotStamps(group, root = PATHS.supgp) {
  const dir = path.join(root, group);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^\d{8}T\d{6}Z\.json$/.test(n)).map((n) => n.slice(0, 16)).sort();
}

const stampToIso = (stamp) => `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;

// "100001/STARLINK-38128: RMS = 0.187 km" -> {norad, label, rmsKm}
export function parseRmsFile(text) {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const m = /^(\d+)\/(.*): RMS = ([\d.]+) km\s*$/.exec(l);
    if (!m) throw new Error(`unreadable rms.txt line: ${l}`);
    return { norad: Number(m[1]), label: m[2], rmsKm: Number(m[3]) };
  });
}

// The collector logs when each file was requested; the version of a snapshot is its sha256.
function requestLog(dir, stamp) {
  const file = path.join(dir, 'provenance.jsonl');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.saved_as?.endsWith(`${stamp}.json`)) out.json = r;
    if (r.saved_as?.endsWith(`${stamp}.rms.txt`)) out.rms = r;
  }
  return out;
}

// -> {group, stamp, fetchedUtc, sha256, rows: [{group, index, norad, name, objectId, epoch, elements, publishedRmsKm, elementSetNo, dataSource}], rmsFile: {sha256, rows, agreement}}
export function readSnapshot(group, { root = PATHS.supgp, stamp = null } = {}) {
  const stamps = snapshotStamps(group, root);
  const use = stamp ?? stamps.at(-1);
  if (!use || !stamps.includes(use)) throw new Error(`no SupGP snapshot ${stamp ?? '(latest)'} for ${group} under ${root}`);
  const dir = path.join(root, group);
  const jsonBytes = fs.readFileSync(path.join(dir, `${use}.json`));
  const rmsBytes = fs.readFileSync(path.join(dir, `${use}.rms.txt`));
  const sets = JSON.parse(jsonBytes.toString('utf8'));
  const rms = parseRmsFile(rmsBytes.toString('utf8'));
  const log = requestLog(dir, use);
  const rows = sets.map((s, index) => ({
    group, index, norad: s.NORAD_CAT_ID, name: s.OBJECT_NAME, objectId: s.OBJECT_ID, epoch: s.EPOCH,
    elements: Object.fromEntries(ELEMENTS.map((k) => [k, Number(s[k])])),
    publishedRmsKm: Number(s.RMS), elementSetNo: s.ELEMENT_SET_NO, dataSource: s.DATA_SOURCE,
  }));
  // The JSON's own RMS field and the rms.txt file are the same publication; they must agree row by row.
  let disagreements = 0;
  for (const [i, r] of rms.entries()) {
    const row = rows[i];
    if (!row || row.norad !== r.norad || row.name !== r.label || Math.abs(row.publishedRmsKm - r.rmsKm) > 5e-4) ++disagreements;
  }
  const agreement = { jsonRows: rows.length, rmsRows: rms.length, disagreements };
  if (rows.length !== rms.length || disagreements) throw new Error(`${group} ${use}: JSON and rms.txt disagree ${JSON.stringify(agreement)}`);
  return {
    group, stamp: use, fetchedUtc: log.json?.response_utc ?? log.json?.request_utc ?? stampToIso(use),
    requestUtc: log.json?.request_utc ?? null, sha256: sha256(jsonBytes), url: log.json?.url ?? null,
    rmsFile: { sha256: sha256(rmsBytes), url: log.rms?.url ?? null, ...agreement }, rows,
  };
}
