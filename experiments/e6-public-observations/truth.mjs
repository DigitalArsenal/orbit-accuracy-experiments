// ISS truth (PLAN.md §3): NASA's ISS OEM (EME2000, UTC, 4-minute steps) as
// captured by the SDN provider node and the HAC archive. Each capture holds
// about two days before its generation (the trajectory already flown) and a
// prediction after it; only the flown part is truth: lines from the file's
// start to its capture time, the later capture preferred where two overlap.
// The frames module turns each line into GCRF. Reading and re-framing only.
import fs from 'node:fs';
import path from 'node:path';
import { ProviderNode } from '../../harness/provider-node.mjs';
import { toGcrf } from '../../harness/frames.mjs';
import { sha256 } from '../../harness/modules.mjs';
import { readOem } from '../e4-operator-ephemeris-parity/operators.mjs';
import { guard } from './common.mjs';

// Every capture: {captured (ISO), url, sha256, text}.
export function issCaptures({ nodes, archive }) {
  const out = [];
  const node = new ProviderNode(nodes, 'iss');
  for (const d of node.descriptors()) out.push({ captured: d.captured, url: d.url, sha256: d.sha256, text: node.file(d).toString('utf8') });
  for (const day of fs.existsSync(archive) ? fs.readdirSync(archive) : []) {
    const file = path.join(archive, day, 'ISS.OEM_J2K_EPH.txt');
    if (!fs.existsSync(file)) continue;
    const prov = JSON.parse(fs.readFileSync(`${file}.provenance.json`, 'utf8'));
    const bytes = fs.readFileSync(file);
    if (sha256(bytes) !== prov.sha256) throw new Error(`${file} differs from its provenance`);
    if (!out.some((c) => c.sha256 === prov.sha256)) out.push({ captured: prov.retrieved_utc, url: prov.url, sha256: prov.sha256, text: bytes.toString('utf8') });
  }
  return out.sort((a, b) => a.captured.localeCompare(b.captured));
}

// The flown spans [{from, to (ms), captured}] and the truth lines by epoch
// (ms) -> {capture, state EME2000 [m, m/s]}.
export function truthLines(captures) {
  const lines = new Map(), spans = [];
  for (const c of captures) {
    const oem = readOem(c.text);
    if (!/^(EME2000|J2000)$/i.test(oem.frame) || oem.timeScale !== 'UTC') throw new Error(`ISS OEM ${c.captured}: ${oem.frame}/${oem.timeScale}`);
    const cut = Date.parse(c.captured);
    const from = Date.parse(oem.epochs[0]);
    spans.push({ from, to: cut, captured: c.captured, sha256: c.sha256 });
    oem.epochs.forEach((e, i) => { const t = Date.parse(e); if (t <= cut) lines.set(t, { capture: c.captured, state: oem.states[i] }); });
  }
  return { lines, spans };
}

export class IssTruth {
  constructor(frames, captures) {
    this.frames = frames;
    const { lines, spans } = truthLines(captures);
    this.lines = lines;
    this.spans = spans;
    this.cache = new Map();
  }
  has(ms) { return this.lines.has(ms); }
  // True when truth epochs span [from, to] with no gap over maxGapMs.
  covers(from, to, maxGapMs) {
    const e = this.epochs(from - maxGapMs, to + maxGapMs);
    if (!e.length || e[0] > from || e.at(-1) < to) return false;
    return e.every((t, i) => !i || t - e[i - 1] <= maxGapMs);
  }
  // Truth epochs (ms) within [from, to].
  epochs(from, to) { return [...this.lines.keys()].filter((t) => t >= from && t <= to).sort((a, b) => a - b); }
  // GCRF state [m, m/s] at a grid epoch (reading a test-window epoch needs the freeze).
  async gcrf(ms) {
    guard(ms, 'truth');
    if (!this.cache.has(ms)) {
      const line = this.lines.get(ms);
      if (!line) throw new Error(`no ISS truth at ${new Date(ms).toISOString()}`);
      this.cache.set(ms, await toGcrf(this.frames, 'MEAN_EQUATOR_EQUINOX_J2000', new Date(ms).toISOString(), line.state));
    }
    return this.cache.get(ms);
  }
}
