// Starlink: SpaceX's public MEME ephemerides (api.starlink.com/public-files/ephemerides/).
//
// - MANIFEST.txt lists one file, the newest version, per NORAD number, and is rewritten at the end
//   of each of SpaceX's constellation-wide generation sweeps. Superseded versions stay
//   downloadable by name for at least a day.
// - A file name is MEME_<norad>_<name>_<DOY><HHMM of the start>_Operational_<GPS seconds of the stop>_UNCLASSIFIED.txt,
//   the start is on a UTC minute plus 42 s, the stop is start + 3 days.
// - A file holds 3 days of 60 s states (EME2000, UTC), about 472 bytes a state, and the server
//   honours byte ranges. The window CelesTrak fits is [EPOCH, EPOCH + 12 h] (E11), so only the file's
//   first (EPOCH + 12 h - start) of states are fetched.
// - The reader is the WASM of data-source/spacex-starlink-source (lib/readers/meme.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { MEME } from '../config.mjs';

export const id = 'starlink';
export const hours = 12;
export const hosts = ['api.starlink.com'];
export const BASE = 'https://api.starlink.com/public-files/ephemerides/';
export const MANIFEST_URL = `${BASE}MANIFEST.txt`;
export const MAX_CANDIDATES = 4;
// A version that starts after the EPOCH still serves when at least this much of the window is in it.
export const MIN_WINDOW_HOURS = 6;

const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
// The start of the file named by the GPS seconds of its stop (GPS time is UTC + 18 s): stop - 3 days.
export const startOfName = (name) => GPS_EPOCH_MS + (Number(name.split('_')[5]) - 18) * 1000 - MEME.spanHours * 3600e3;
export const noradOfName = (name) => Number(name.split('_')[1]);
export const isMemeName = (name) => /^MEME_\d+_[^_]+_\d+_[A-Za-z-]+_\d+_[A-Z]+\.txt$/.test(name);

// Names the earlier manifests listed, kept as plain name lists (no ephemeris) in the registry directory.
export function readRegistry(dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^starlink-names-.*\.txt$/.test(n)).sort() : [];
  const byNorad = new Map();
  const sources = [];
  for (const f of files) {
    const names = fs.readFileSync(path.join(dir, f), 'utf8').split(/\s+/).filter(isMemeName);
    sources.push({ file: f, names: names.length });
    for (const name of names) {
      const norad = noradOfName(name);
      if (!byNorad.has(norad)) byNorad.set(norad, new Map());
      if (!byNorad.get(norad).has(name)) byNorad.get(norad).set(name, { name, startMs: startOfName(name), listedIn: [] });
      byNorad.get(norad).get(name).listedIn.push(f);
    }
  }
  return { byNorad, sources };
}

// Fetch the current manifest (names only), keep it in the registry unless it is the one already kept
// (a conditional GET on the newest kept ETag), and return the registry.
export async function prepare({ http, log, registryDir }) {
  fs.mkdirSync(registryDir, { recursive: true });
  const sidecars = fs.readdirSync(registryDir).filter((n) => /^starlink-names-\d{8}T\d{6}Z\.json$/.test(n)).sort();
  const last = sidecars.length ? JSON.parse(fs.readFileSync(path.join(registryDir, sidecars.at(-1)), 'utf8')) : null;
  const res = await http.get(MANIFEST_URL, { headers: last?.etag ? { 'If-None-Match': last.etag } : {} });
  let manifest = { etag: last?.etag ?? null, lastModified: last?.lastModified ?? null, file: sidecars.at(-1)?.replace(/\.json$/, '.txt') ?? null, unchanged: res.status === 304 };
  if (res.status === 200 && res.body) {
    const stamp = res.requestUtc.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const file = path.join(registryDir, `starlink-names-${stamp}.txt`);
    fs.writeFileSync(file, res.body);
    fs.writeFileSync(file.replace(/\.txt$/, '.json'), JSON.stringify({ url: MANIFEST_URL, requestUtc: res.requestUtc, responseUtc: res.responseUtc, etag: res.headers.etag, lastModified: res.headers.lastModified, bytes: res.body.length }, null, 1));
    manifest = { etag: res.headers.etag, lastModified: res.headers.lastModified, file: path.basename(file), unchanged: false };
  } else if (res.status !== 304) {
    throw new Error(`starlink manifest: HTTP ${res.status} ${res.error ?? ''}`);
  }
  const registry = readRegistry(registryDir);
  log(`starlink registry: ${registry.sources.map((x) => `${x.file} ${x.names}`).join('; ')}; current manifest ${manifest.file} (Last-Modified ${manifest.lastModified})${manifest.unchanged ? ' unchanged' : ''}`);
  return { registry, manifest };
}

// Versions to try for a set, nearest the EPOCH first: those that start no later than MIN_WINDOW_HOURS
// before the window's end and whose three days still reach it.
export function candidates(ctx, row) {
  const known = ctx.registry.byNorad.get(row.norad);
  if (!known) return [];
  const epochMs = Math.round(Date.parse(`${row.epoch}Z`) / 1000) * 1000;
  const endMs = epochMs + hours * 3600e3;
  return [...known.values()]
    .filter((v) => v.startMs <= endMs - MIN_WINDOW_HOURS * 3600e3 && v.startMs + MEME.spanHours * 3600e3 >= endMs)
    .sort((a, b) => Math.abs(a.startMs - epochMs) - Math.abs(b.startMs - epochMs))
    .slice(0, MAX_CANDIDATES)
    .map((v) => ({ id: v.name, name: v.name, url: BASE + v.name, startMs: v.startMs, stopMs: v.startMs + MEME.spanHours * 3600e3, listedIn: v.listedIn }));
}

// First bytes of the file that hold every state up to EPOCH + 12 h (plus a margin); `extra` widens it on a retry.
export function rangeFor(cand, row, extra = 1) {
  const endMs = Math.round(Date.parse(`${row.epoch}Z`) / 1000) * 1000 + hours * 3600e3;
  const states = Math.min(Math.ceil((endMs - cand.startMs) / (MEME.stepSeconds * 1000)) + 1, MEME.spanHours * 3600 / MEME.stepSeconds + 1) + MEME.spareStates;
  return [0, Math.ceil((MEME.headerBytes + states * MEME.bytesPerState) * extra) - 1];
}

// In a worker: bytes -> the module's $OEM, labelled for the fitter.
export async function read({ readers, cand, row, bytes }) {
  const oem = await readers.meme.read(cand.name, bytes);
  if (!oem) throw new Error('the module parsed no state from the file');
  return { oem, objectName: row.name };
}
