// Part 1a's reading of the operator capture (PLAN.md part 1a; A3 point 4, A5 point 5), one authoritative copy for every phase: a capture
// cycle's time, the captured files of one satellite through the truth gate, the track rule (each epoch from the newest file that starts
// at or before it, within its first segment hours) and the track's SHA-256. Reading and selection only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, root, sha256 } from '../common.mjs';

const { gate } = await import(path.join(root, 'harness/truth-gate.mjs'));
const S = config.part1.starlink;
const SEG = S.segmentHours * 3600e3;
const iso = (t) => new Date(t).toISOString();

export const cycleMs = (id) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'));

/** Every captured file of one satellite in `within` (cycle ids), one entry per file (by SHA-256): { start, sha, cycle, states: Map(ms -> [x, y, z,
 *  vx, vy, vz] km, km/s), gated: the states the truth gate dropped }; the gate's product is the capture's (operator-capture/<cycle>/<SHA-256, 16 hex>).
 *  `opened(file, entry)` is told of every path read (entry null when it holds no file), before the entry is kept; it may throw. */
export function filesOf(norad, within, opened = () => {}) {
  const byFile = new Map();
  for (const c of within) {
    const f = path.join(S.captureRoot, c, `${norad}.json.gz`);
    if (!fs.existsSync(f)) continue;
    let d;
    try { d = JSON.parse(zlib.gunzipSync(fs.readFileSync(f))); } catch { opened(f, null); continue; }
    if (!d.source?.sha256 || !(d.truth ?? []).length || byFile.has(d.source.sha256)) { opened(f, null); continue; } // a cycle that stored no states of the file does not hold it
    const { kept, dropped } = gate(d.truth, { product: `operator-capture/${c}/${d.source.sha256.slice(0, 16)}`, norad, epochOf: (s) => s.ms, positionOf: (s) => s.stateM.slice(0, 3).map((x) => x / 1000) });
    const entry = { start: Date.parse(d.source.startUtc), sha: d.source.sha256, cycle: c, gated: dropped.length, states: new Map(kept.map((s) => [s.ms, s.stateM.map((x) => x / 1000)])) };
    opened(f, entry);
    byFile.set(d.source.sha256, entry);
  }
  return [...byFile.values()].sort((a, b) => a.start - b.start); // ties keep the capture order: the later capture is the newer file
}

/** The states in [from, to] ((from, to] when openLow) of `files`, each epoch from the newest file that starts at or before it (A5 point 5): a
 *  file's state at t counts within its first segment hours and only when no newer file of the set starts in (its start, t]. `dropped` counts
 *  the states that rule removes and no newer file holds at the same epoch (the states the reader at 2c2c4d4 kept). */
export function track(files, from, to, openLow) {
  const out = new Map();
  let dropped = 0;
  files.forEach((f, i) => {
    const newer = files.slice(i + 1), next = newer[0]?.start ?? Infinity;
    for (const [t, s] of f.states) {
      if ((openLow ? t <= from : t < from) || t > to || t < f.start || t - f.start > SEG) continue;
      if (t >= next) { if (!newer.some((g) => t >= g.start && t - g.start <= SEG && g.states.has(t))) dropped += 1; continue; }
      out.set(t, { epoch: iso(t), r: s.slice(0, 3), v: s.slice(3, 6), file: f.sha.slice(0, 12) });
    }
  });
  return { lines: [...out.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l), dropped };
}
export const trackSha = (lines) => sha256(Buffer.from(JSON.stringify(lines.map((l) => [l.epoch, l.r, l.v]))));
