// Element sets of E16's objects for one window (PLAN.md 3.1), read once from the Space-Track archive by the harness
// and cached in runs/cache (element sets never leave this machine). The window lock is checked first.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readElementSets, epochMs } from '../../harness/gp-archive.mjs';
import { assertWindowReadable, config, runsCache, sha256, utcMs } from './common.mjs';

// The widest epoch span of a window over the regime classes (train: GNSS MEO's longer span).
export function widestSpan(name) {
  if (name === 'train') return [config.windows.trainGnssMeo[0], config.windows.train[1]];
  return config.windows[name];
}

// {sets: [{norad, objectId, gpId, epoch, creationDate, elements, epochMs, createdMs}], files: {file: sha256}, duplicates}
export function windowSets(name, norads, { log = () => {} } = {}) {
  assertWindowReadable(name);
  const [from, to] = widestSpan(name);
  const keep = new Set(norads);
  const key = sha256(Buffer.from(JSON.stringify({ from, to, norads: [...keep].sort((a, b) => a - b), e: config.elementSets }))).slice(0, 16);
  const file = path.join(runsCache, `sets-${name}-${key}.json.gz`);
  let read;
  if (fs.existsSync(file)) {
    read = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  } else {
    log(`reading element sets ${from}..${to} for ${keep.size} objects (creation files to ${config.elementSets.creationLagDays} days later)`);
    read = readElementSets(config.inputs.gpHistory, from, to, {
      keep: (n) => keep.has(n), theory: config.elementSets.meanElementTheory, ephemerisType: config.elementSets.ephemerisType,
      duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds, lagDays: config.elementSets.creationLagDays,
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify(read)));
    fs.renameSync(tmp, file);   // atomic: parallel shards may build the same cache
  }
  for (const s of read.sets) { s.epochMs = epochMs(s.epoch); s.createdMs = utcMs(s.creationDate); }
  return { ...read, cacheFile: file };
}

export function byObject(sets) {
  const out = new Map();
  for (const s of sets) { if (!out.has(s.norad)) out.set(s.norad, []); out.get(s.norad).push(s); }
  for (const list of out.values()) list.sort((a, b) => a.epochMs - b.epochMs);
  return out;
}
