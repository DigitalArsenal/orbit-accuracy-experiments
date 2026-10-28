// Amendment A12's fit-only reader (coordinator ruling 8): the operator track of a part 1a satellite rebuilt from the capture without any
// truth. It never calls windowOf; it reads only capture cycles strictly before the forecast cycle; it never keeps a file that starts at or
// after F (opening one aborts the run, since such a file would be truth); every state passes harness/truth-gate.mjs (lib/capture.mjs); the
// rebuilt track's SHA-256 must equal the one A3's fit row stored (A5 point 4), else the run aborts. Every opened path is logged.
// F and E come from A3's stored fit row, so the forecast cycle itself is never opened.
import fs from 'node:fs';
import path from 'node:path';
import { config, readJsonl } from '../common.mjs';
import { cycleMs, filesOf, track, trackSha } from './capture.mjs';

const S = config.part1.starlink;
const H = 3600e3;

/** The pre-F reader. forecastCycle: the registered forecast cycle id; log(path): told of every opened path. */
export function prefitReader(forecastCycle, log) {
  const finished = new Set(readJsonl(path.join(path.dirname(S.captureRoot), 'cycles.jsonl')).map((c) => c.id));
  const limit = cycleMs(forecastCycle);
  const before = fs.readdirSync(S.captureRoot).filter((d) => /^\d{4}-\d\d-\d\dT/.test(d) && finished.has(d) && cycleMs(d) < limit).sort();
  const violation = (what) => { throw new Error(`A12 fit-only reader: ${what}; the run is aborted`); };
  /** The captured files of one satellite older than F, from `cycles` (each strictly before the forecast cycle). */
  const olderFiles = (norad, Fstart, cycles = before) => {
    for (const c of cycles) if (cycleMs(c) >= limit) violation(`cycle ${c} is not before the forecast cycle ${forecastCycle}`);
    return filesOf(norad, cycles, (file, entry) => {
      log(file);
      if (entry && entry.start >= Fstart) violation(`${file} starts at or after F (${new Date(entry.start).toISOString()})`);
    });
  };
  return {
    cycles: before,
    /** A3's operator track of a fit row (row.F, row.E, row.track.sha): { lines, sha } or a violation. */
    trackOf(row) {
      const Fstart = Date.parse(row.F.startUtc), E = Date.parse(row.E);
      if (E !== Fstart) violation(`NORAD ${row.norad}: E is not F's first epoch`);
      const fit = track(olderFiles(row.norad, Fstart), E - S.trackHours * H, E, false);
      if (fit.lines.some((l) => Date.parse(l.epoch) > E)) violation(`NORAD ${row.norad}: a track state after E`);
      const sha = trackSha(fit.lines);
      if (sha !== row.track.sha) violation(`NORAD ${row.norad}: track SHA-256 ${sha.slice(0, 12)} is not A3's ${row.track.sha.slice(0, 12)}`);
      return { lines: fit.lines, sha };
    },
    olderFiles,
  };
}
