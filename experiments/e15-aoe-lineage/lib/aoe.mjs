// AOE element sets (SpaceMapper's own library, channel KY), read from our daily snapshots:
//   <root>/<YYYY>/<YYYY-MM-DD>/orbits-KY/records.jsonl   one record per element set (TLE lines and rounded elements)
//   <root>/<YYYY>/<YYYY-MM-DD>/orbits-KY/run.json        pages with their retrieval times, completeness, unrenderable boxes
// The snapshots stay on this machine (no licence is stated); only counts and statistics leave it.
//
// The element set is AOE's two-line element set. Its fixed columns are decoded here into the OMM fields SGP4 takes,
// without computing anything: a TLE writes eccentricity and B* with an implied decimal point and the epoch as a year and a
// day of year. Every decoded set is checked against the same record's other fields (the ISO epoch, the NORAD number, and
// the elements AOE also gives rounded to 3-6 decimals); a record that disagrees is not used and is counted.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PATHS } from '../settings.mjs';
import { config } from './windows.mjs';

const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const isoNoZone = (ms) => new Date(ms).toISOString().replace('Z', '');

export function snapshotDir(day, root = PATHS.aoe) {
  return path.join(root, day.slice(0, 4), day, 'orbits-KY');
}

// Days with a finished KY snapshot (run.json written and records.jsonl present), in order.
export function snapshotDays(root = PATHS.aoe) {
  const out = [];
  for (const year of fs.existsSync(root) ? fs.readdirSync(root).filter((n) => /^\d{4}$/.test(n)) : []) {
    for (const day of fs.readdirSync(path.join(root, year)).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n))) {
      const dir = snapshotDir(day, root);
      if (fs.existsSync(path.join(dir, 'run.json')) && fs.existsSync(path.join(dir, 'records.jsonl'))) out.push(day);
    }
  }
  return out.sort();
}

// The TLE checksum: the sum of the digits of columns 1-68, with each minus sign counting one, modulo 10.
export function checksumOk(line) {
  let sum = 0;
  for (const c of line.slice(0, 68)) { if (c >= '0' && c <= '9') sum += c.charCodeAt(0) - 48; else if (c === '-') sum += 1; }
  return String(sum % 10) === line[68];
}

// "SMMMMMSE" with an implied leading decimal point: " 10000-7" -> 1e-8. The decimal text is handed to Number whole.
const impliedExponent = (s) => {
  const sign = s[0] === '-' ? '-' : '';
  const mantissa = s.slice(1, 6).trim();
  const exponent = s.slice(6, 8).trim();
  if (!/^\d+$/.test(mantissa) || !/^[+-]?\d$/.test(exponent)) return NaN;
  return Number(`${sign}0.${mantissa}e${exponent}`);
};

// TLE lines -> {norad, epochMs, elements}. Column positions are those of the two-line element set format.
export function decodeTle(line1, line2) {
  if (line1?.[0] !== '1' || line2?.[0] !== '2' || line1.length < 69 || line2.length < 69) return { error: 'not two element lines of 69 columns' };
  const n1 = line1.slice(2, 7).trim(), n2 = line2.slice(2, 7).trim();
  if (n1 !== n2) return { error: `catalog numbers differ (${n1}, ${n2})` };
  const yy = Number(line1.slice(18, 20));
  const doy = line1.slice(20, 32).trim();
  if (!/^\d{3}\.\d+$/.test(doy) || !Number.isInteger(yy)) return { error: 'unreadable epoch' };
  const [whole, fraction] = doy.split('.');
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  // Day of year to UTC milliseconds: whole days, then the fraction of a day, rounded to the microsecond the OMM keeps.
  const epochMs = Date.UTC(year, 0, 1) + (Number(whole) - 1) * 86400000 + Math.round(Number(`0.${fraction}`) * 86400000000) / 1000;
  const elements = {
    MEAN_MOTION: Number(line2.slice(52, 63)),
    ECCENTRICITY: Number(`0.${line2.slice(26, 33).trim()}`),
    INCLINATION: Number(line2.slice(8, 16)),
    RA_OF_ASC_NODE: Number(line2.slice(17, 25)),
    ARG_OF_PERICENTER: Number(line2.slice(34, 42)),
    MEAN_ANOMALY: Number(line2.slice(43, 51)),
    BSTAR: impliedExponent(line1.slice(53, 61)),
  };
  for (const [k, v] of Object.entries(elements)) if (!Number.isFinite(v)) return { error: `unreadable ${k}` };
  return { norad: n1, epochMs, elements, checksums: checksumOk(line1) && checksumOk(line2), ephemerisType: line1[62] };
}

// The record's own rounded elements must agree with the decoded TLE (AOE prints them to 3-6 decimals).
const TOLERANCE = { inclination: 1e-3, raan: 1e-3, perigeeArgument: 1e-3, meanAnomaly: 1e-3, eccentricity: 1e-6, meanMotion: 2e-6 };
const FIELD = { inclination: 'INCLINATION', raan: 'RA_OF_ASC_NODE', perigeeArgument: 'ARG_OF_PERICENTER', meanAnomaly: 'MEAN_ANOMALY', eccentricity: 'ECCENTRICITY', meanMotion: 'MEAN_MOTION' };

function checkRecord(r, d) {
  const epochMs = Date.parse(r.epoch);
  if (!Number.isFinite(epochMs) || Math.abs(epochMs - d.epochMs) > 1) return `TLE epoch ${isoNoZone(d.epochMs)} is not the record's ${r.epoch}`;
  if (Number(d.norad) !== Number(r.noradId)) return `TLE catalog number ${d.norad} is not the record's ${r.noradId}`;
  for (const [k, tol] of Object.entries(TOLERANCE)) {
    if (r[k] === undefined || r[k] === null) continue;
    let diff = Math.abs(Number(r[k]) - d.elements[FIELD[k]]);
    if (['raan', 'perigeeArgument', 'meanAnomaly'].includes(k)) diff = Math.min(diff, 360 - diff);
    if (!(diff <= tol)) return `${k} ${r[k]} disagrees with the TLE's ${d.elements[FIELD[k]]}`;
  }
  if (r.bstar !== undefined && r.bstar !== null && Math.abs(Number(r.bstar) - d.elements.BSTAR) > Math.max(1e-12, 1e-3 * Math.abs(d.elements.BSTAR))) return `bstar ${r.bstar} disagrees with the TLE's ${d.elements.BSTAR}`;
  return null;
}

// What the snapshot says about its own retrieval: run.json's pages (retrieved_utc), falling back to the stored pages'
// modification times for pages fetched by an earlier, interrupted invocation.
function retrieval(dir, run) {
  const pages = fs.readdirSync(dir).filter((n) => /page-\d{4}\.html\.gz$|fill-\d+\.html\.gz$/.test(n));
  const logged = new Map((run.pages ?? []).map((p) => [p.file, Date.parse(p.retrieved_utc)]));
  const times = pages.map((p) => logged.get(p) ?? fs.statSync(path.join(dir, p)).mtimeMs).sort((a, b) => a - b);
  return { pages: pages.length, firstMs: times[0] ?? null, lastMs: times.at(-1) ?? null, times };
}

// One day's snapshot: {day, run, retrieval, sets: [...], counts}. A set: {source: 'AOE', norad, id, epoch, epochMs,
// ctimeMs, snapshot, elements, objectType}.
export function readSnapshot(day, root = PATHS.aoe) {
  const dir = snapshotDir(day, root);
  const runBytes = fs.readFileSync(path.join(dir, 'run.json'));
  const run = JSON.parse(runBytes);
  const recordsBytes = fs.readFileSync(path.join(dir, 'records.jsonl'));
  const counts = { records: 0, aoeOnly: 0, rejected: 0, checksumMismatches: 0, notSgp4: 0, duplicates: 0, byObjectType: {} };
  const rejected = [];
  const byNorad = new Map();
  for (const line of recordsBytes.toString('utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    ++counts.records;
    counts.byObjectType[r.objectType ?? 'UNKNOWN'] = (counts.byObjectType[r.objectType ?? 'UNKNOWN'] ?? 0) + 1;
    if (!(Number(r.catId) < config.sources.AOE.noradIdsBelow) || !(Number(r.noradId) > 0)) { ++counts.aoeOnly; continue; }
    const d = decodeTle(r.line1, r.line2);
    const why = d.error ?? checkRecord(r, d);
    if (why) { ++counts.rejected; if (rejected.length < 50) rejected.push({ id: r.id, catId: r.catId, why }); continue; }
    if (!d.checksums) ++counts.checksumMismatches;
    if (d.ephemerisType !== '0' && d.ephemerisType !== ' ') ++counts.notSgp4;
    const set = {
      source: 'AOE', norad: Number(r.noradId), id: String(r.id), epoch: isoNoZone(d.epochMs), epochMs: d.epochMs,
      ctimeMs: Date.parse(r.ctime), snapshot: day, elements: d.elements, objectType: r.objectType ?? null,
    };
    // One record per object and epoch in a snapshot; a repeat keeps the earlier write.
    const key = `${set.norad}|${set.epochMs}`;
    if (byNorad.has(key)) { ++counts.duplicates; if (byNorad.get(key).ctimeMs <= set.ctimeMs) continue; }
    byNorad.set(key, set);
  }
  const ret = retrieval(dir, run);
  return {
    day, dir,
    run: { complete: run.complete === true, error: run.error ?? null, siteTotal: run.site_total ?? null, records: run.records ?? null, unrenderable: run.unrenderable ?? [], startedUtc: run.started_utc ?? null, finishedUtc: run.finished_utc ?? null },
    retrieval: { pages: ret.pages, firstUtc: ret.firstMs ? new Date(ret.firstMs).toISOString() : null, lastUtc: ret.lastMs ? new Date(ret.lastMs).toISOString() : null, times: ret.times },
    sha256: { run: sha256(runBytes), records: sha256(recordsBytes) },
    sets: [...byNorad.values()], counts, rejected,
  };
}

// Every AOE set of the snapshots on [fromDay, toDay], per object, in epoch order. A set is usable at T when its ctime and
// epoch are at or before T and our snapshot holds it (PLAN.md amendment A1).
export class AoeCatalog {
  constructor(fromDay, toDay, root = PATHS.aoe) {
    this.snapshots = snapshotDays(root).filter((d) => d >= fromDay && d <= toDay).map((d) => readSnapshot(d, root));
    this.byNorad = new Map();
    for (const s of this.snapshots) {
      for (const set of s.sets) {
        if (!this.byNorad.has(set.norad)) this.byNorad.set(set.norad, []);
        this.byNorad.get(set.norad).push(set);
      }
    }
    for (const [n, list] of this.byNorad) {
      list.sort((a, b) => a.epochMs - b.epochMs || a.ctimeMs - b.ctimeMs);
      // The same object and epoch in two snapshots is one set, usable from its first write.
      this.byNorad.set(n, list.filter((s, i) => i === 0 || s.epochMs !== list[i - 1].epochMs));
    }
  }

  norads() { return [...this.byNorad.keys()]; }

  latest(norad, T) {
    const list = this.byNorad.get(norad);
    if (!list) return null;
    for (let i = list.length - 1; i >= 0; --i) if (list[i].epochMs <= T && list[i].ctimeMs <= T) return list[i];
    return null;
  }

  // Whether our snapshot had retrieved the set by T (descriptive: the retrieval-time rule A1 replaced). The snapshot's
  // last page time bounds it; a snapshot that finished by T had every record.
  retrievedBy(set, T) {
    const s = this.snapshots.find((x) => x.day === set.snapshot);
    return s && s.retrieval.lastUtc ? Date.parse(s.retrieval.lastUtc) <= T : false;
  }

  describe() {
    return this.snapshots.map((s) => ({ day: s.day, run: s.run, retrieval: { pages: s.retrieval.pages, firstUtc: s.retrieval.firstUtc, lastUtc: s.retrieval.lastUtc }, sha256: s.sha256, counts: s.counts, rejected: s.rejected.slice(0, 10) }));
  }
}
