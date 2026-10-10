// Intelsat: CelesTrak's "Intelsat-11P" sets are fitted to Intelsat's IESS-412 eleven-parameter files, which
// my.intelsat.com/ephemeris/public lists per satellite in three kinds: weekly (w, the set with the latest
// EPOCH), the previous weekly (x) and the post-maneuver file (m, the "[PM]" set). A file's name carries its
// epoch, which is the SupGP EPOCH. The window is 24 h: [EPOCH, EPOCH + 24 h].
// (The ECF position files the stack's intelsat-source reads span 2026-10-09 to 10-18 and cannot serve these
// sets: their epochs and fit windows lie before the file starts.)
// Readers (WASM): files/orbit-products normalize_ses_i11, then analysis/reference-states (ITRS to GCRS, IERS EOP).
import { sha256 } from '../lib/http.mjs';
import { setEpochMs } from '../lib/time.mjs';
import { readI11, withoutTelexAnnotations } from '../lib/readers/i11.mjs';
import { ecefToGcrf } from '../lib/readers/ecef.mjs';

export const id = 'intelsat';
export const hours = 24;
export const hosts = ['my.intelsat.com'];
export const LISTING = 'https://my.intelsat.com/ephemeris/public';
export const FILES = 'https://my.intelsat.com/Resource/Ephemeris/';
export const noCandidateCode = 'no-file';

// The file code of a SupGP name: the alias in parentheses ("INTELSAT 21 (IS-21)" -> is-21), else by the naming of the plain names.
export function codeOf(name) {
  const alias = /\(([A-Z0-9-]+)\)/.exec(name);
  if (alias) return alias[1].toLowerCase();
  const n = name.replace(/ \[PM\]$/, '');
  let m;
  if ((m = /^INTELSAT (\d+)-(\d+)$/.exec(n))) return `is-${m[1]}${m[2]}`;
  if ((m = /^INTELSAT (\d+E?)$/.exec(n))) return `is-${m[1].toLowerCase()}`;
  if ((m = /^HORIZONS-(\w+)$/.exec(n))) return `h-${m[1].toLowerCase()}`;
  return null;
}
const epochOfName = (file) => { const p = file.split('_'); return Date.UTC(+p[5].slice(0, 4), +p[5].slice(4, 6) - 1, +p[5].slice(6, 8), +p[6].slice(0, 2), +p[6].slice(2, 4), +p[6].slice(4, 6)); };

export async function prepare({ http, log, snapshot }) {
  const page = await http.get(LISTING);
  if (page.status !== 200 || !page.body) throw new Error(`Intelsat listing: HTTP ${page.status} ${page.error ?? ''}`);
  const values = [...page.body.toString('latin1').matchAll(/<option[^>]*\bvalue\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  const wanted = new Set(snapshot.rows.map((r) => codeOf(r.name)).filter(Boolean));
  const files = new Map();
  for (const v of values) {
    const p = v.split('_');
    if (!['w', 'x', 'm'].includes(p[2]) || !wanted.has(p[4])) continue;
    const url = `${FILES}${v}.txt`;
    const res = await http.get(url);
    if (res.status !== 200 || !res.body) continue;
    files.set(v, { id: v, url, code: p[4], kind: p[2], startMs: epochOfName(v), body: res.body,
      provenance: { url, requestUtc: res.requestUtc, responseUtc: res.responseUtc, httpStatus: 200, etag: res.headers.etag, lastModified: res.headers.lastModified, contentRange: null, rangeRequested: null, bytes: res.body.length, totalBytes: res.body.length, sha256: sha256(res.body), attempts: res.attempts } });
  }
  log(`intelsat: ${files.size} eleven-parameter files for ${wanted.size} satellites (listing ${page.headers.lastModified ?? 'undated'})`);
  return { files, listing: { url: LISTING, responseUtc: page.responseUtc } };
}

export const noCandidateReason = () => 'no eleven-parameter file for the satellite is listed at my.intelsat.com';
export function candidates(ctx, row) {
  const code = codeOf(row.name);
  const epochMs = setEpochMs(row);
  return [...ctx.files.values()].filter((f) => f.code === code)
    .sort((a, b) => Math.abs(a.startMs - epochMs) - Math.abs(b.startMs - epochMs))
    .map((f) => ({ id: f.id, url: f.url, startMs: f.startMs, kind: f.kind }));
}
export const held = (ctx, cand) => ctx.files.get(cand.id);

export async function read({ readers, bytes, row }) {
  const ecef = await readI11(readers.orbitProducts, withoutTelexAnnotations(bytes));
  const g = await ecefToGcrf({ referenceStates: readers.ecef.referenceStates, rows: readers.ecef.rows, oemBytes: ecef, key: 'INTELSAT', norad: row.norad, name: row.name, agency: 'Intelsat' });
  return { oem: g.oem, objectName: row.name };
}
