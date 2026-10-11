// LEO-SL truth: SpaceX's public Starlink ephemerides (MEME, EME2000, UTC, 60 s states over 3 days, a new version of each
// satellite about every 7 h). PLAN.md section 3: the state from a version published at or before t whose start is within
// 1 h of t (a fresh orbit determination; the blended forecast after the start is not truth). "Published" is the file's
// HTTP Last-Modified (amendment A4).
//
// SpaceX's MANIFEST.txt lists only the newest version of each satellite and is rewritten at the end of each generation
// sweep; superseded versions stay downloadable by name for at least a day. The runner keeps every manifest it sees as a
// plain name list (no ephemeris) in the registry, so a version is found by name once it has been listed. A file name
// fixes its start (SupGP pass, sources/starlink.mjs). Only the first states up to the target's window are fetched (Range
// GET); the bytes are read by the WASM of data-source/spacex-starlink-source and kept in memory.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, MANIFEST_URL, isMemeName, noradOfName, startOfName } from '../../../supgp-omm/sources/starlink.mjs';
import { loadMemeReader } from '../../../supgp-omm/lib/readers/meme.mjs';
import { MEME } from '../../../supgp-omm/config.mjs';
import { PATHS } from '../../settings.mjs';
import { config } from '../windows.mjs';
import { eachLimit, isoZ, itemOf, sha256 } from './common.mjs';

export const id = 'starlink';
export const regime = 'LEO-SL';
export const live = true;
const registryDir = path.join(PATHS.store, 'registry');

// Poll the manifest (conditional on the newest one kept) and keep it as a name list. Returns the poll's outcome.
export async function pollManifest(http, log = () => {}) {
  fs.mkdirSync(registryDir, { recursive: true });
  const sidecars = fs.readdirSync(registryDir).filter((n) => /^starlink-names-\d{8}T\d{6}Z\.json$/.test(n)).sort();
  const last = sidecars.length ? JSON.parse(fs.readFileSync(path.join(registryDir, sidecars.at(-1)), 'utf8')) : null;
  const res = await http.get(MANIFEST_URL, { headers: last?.etag ? { 'If-None-Match': last.etag } : {} });
  if (res.status === 304) return { unchanged: true, lastModified: last.lastModified };
  if (res.status !== 200 || !res.body) throw new Error(`starlink manifest: HTTP ${res.status} ${res.error ?? ''}`);
  const stamp = res.requestUtc.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const file = path.join(registryDir, `starlink-names-${stamp}.txt`);
  fs.writeFileSync(file, res.body);
  fs.writeFileSync(file.replace(/\.txt$/, '.json'), JSON.stringify({ url: MANIFEST_URL, requestUtc: res.requestUtc, responseUtc: res.responseUtc, etag: res.headers.etag, lastModified: res.headers.lastModified, bytes: res.body.length, sha256: sha256(res.body) }, null, 1));
  log(`starlink manifest ${path.basename(file)} (Last-Modified ${res.headers.lastModified})`);
  return { unchanged: false, lastModified: res.headers.lastModified, file };
}

// Every version name the registry has seen: norad -> [{name, startMs}].
export function registry() {
  const byNorad = new Map();
  const files = fs.existsSync(registryDir) ? fs.readdirSync(registryDir).filter((n) => /^starlink-names-.*\.txt$/.test(n)).sort() : [];
  for (const f of files) {
    for (const name of fs.readFileSync(path.join(registryDir, f), 'utf8').split(/\s+/).filter(isMemeName)) {
      const norad = noradOfName(name);
      if (!byNorad.has(norad)) byNorad.set(norad, new Map());
      if (!byNorad.get(norad).has(name)) byNorad.get(norad).set(name, { name, startMs: startOfName(name) });
    }
  }
  return { byNorad, files };
}

// The first bytes of a version that hold its states up to the end of the target's window.
function rangeTo(startMs, endMs, extra = 1) {
  const states = Math.ceil((endMs - startMs) / (MEME.stepSeconds * 1000)) + 1 + MEME.spareStates;
  return [0, Math.ceil((MEME.headerBytes + states * MEME.bytesPerState) * extra) - 1];
}

// Truth for target time targetMs: items for every satellite with an eligible version, and the coverage counts.
export async function acquire({ http, readers, log, targetMs, wanted }) {
  const rule = config.regimes[regime].rule;
  const tolMs = config.targetToleranceSeconds * 1000;
  const reg = registry();
  const meme = readers.meme ??= await loadMemeReader(PATHS.readerModules);
  const items = [];
  const coverage = { truth: id, regime, targetUtc: isoZ(targetMs), registryFiles: reg.files.length, listed: reg.byNorad.size, wanted: 0, candidates: 0, fetched: 0, publishedAfterTarget: 0, noVersionInHour: 0, readFailures: 0, httpFailures: 0, items: 0, missing: 0 };
  const jobs = [];
  for (const [norad, versions] of reg.byNorad) {
    if (wanted && !wanted.has(norad)) continue;
    ++coverage.wanted;
    const cands = [...versions.values()].filter((v) => v.startMs <= targetMs && v.startMs >= targetMs - rule.maxStartAgeSeconds * 1000).sort((a, b) => b.startMs - a.startMs);
    if (!cands.length) { ++coverage.noVersionInHour; continue; }
    jobs.push({ norad, cands });
  }
  await eachLimit(jobs, 8, async ({ norad, cands }) => {
    for (const v of cands) {
      ++coverage.candidates;
      const res = await http.get(BASE + v.name, { range: rangeTo(v.startMs, targetMs + tolMs) });
      if (res.status !== 200 && res.status !== 206) { ++coverage.httpFailures; continue; }
      ++coverage.fetched;
      const publishedMs = res.headers.lastModified ? Date.parse(res.headers.lastModified) : NaN;
      if (rule.publishedAtOrBefore && !(publishedMs <= targetMs)) { ++coverage.publishedAfterTarget; continue; }
      let oem;
      try { oem = await meme.read(v.name, res.body); } catch (e) { oem = null; }
      if (!oem) { ++coverage.readFailures; continue; }
      const item = itemOf({ norad, regime, oem, name: v.name.split('_')[2], targetMs, truth: { source: id, version: v.name, startUtc: isoZ(v.startMs), publishedUtc: isoZ(publishedMs), bytes: res.body.length, sha256: sha256(res.body) } });
      items.push(item);
      return;
    }
  });
  coverage.items = items.filter((x) => !x.missing).length;
  coverage.missing = items.filter((x) => x.missing).length;
  log(`starlink ${coverage.targetUtc}: ${coverage.items} satellites with truth, ${coverage.noVersionInHour} without a version in the hour, ${coverage.publishedAfterTarget} published after the target, ${coverage.httpFailures} HTTP failures`);
  return { items, coverage };
}
