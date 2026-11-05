// The registered window set (BENCHMARK.md): keys only, drawn from the explorer's own stores under /opt/data/sdn-archive/operator-theory/ap/b051,
// read-only. Per group, the windows whose stored AP arm (AP72, else AP24) ran, ranked by SHA-256 of `sdn-ap-cost-benchmark-20261105:<key>`; the first
// PER_GROUP of each. Nothing here reads an input state or a score.
//   node experiments/sdn-ap-cost-benchmark/windows.mjs            prints the keys, one per line, as BENCHMARK.md lists them
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const STORE = '/opt/data/sdn-archive/operator-theory';
const B051 = path.join(STORE, 'ap', 'b051');
export const PER_GROUP = 4;
/** group: its store, its regime label (cells.json), its reader (run.mjs) and the hold rule it is read under. */
export const GROUPS = {
  LS: { store: 'regimes', regime: 'Low orbit, laser spheres', reader: 'static' },
  DO: { store: 'regimes', regime: 'Low orbit, altimetry', reader: 'static' },
  GD: { store: 'regimes', regime: 'Laser geodetic', reader: 'static' },
  GE: { store: 'regimes', regime: 'Geostationary', reader: 'mgex' },
  IG: { store: 'regimes', regime: 'Inclined geosynchronous', reader: 'mgex' },
  P: { store: 'truth2', regime: 'Strong drag, 2026', reader: 'truth' },
  S1: { store: 'truth2', regime: 'Near 700 km', reader: 'truth' },
  GN: { store: 'truth2', regime: 'Medium Earth orbit', reader: 'truth' },
};
// Holds (COMMON.md): Swarm and GRACE-FO truth after 2026-10-31, the six held Galileo satellites, every Starlink group, C2's rows, every operator capture.
export const HELD_NORADS = new Set([43567, 37847, 41862, 41174, 43055, 41175]);
const HOLD_AFTER = Date.parse('2026-10-31T00:00:00Z');
const rank = (key) => crypto.createHash('sha256').update(`sdn-ap-cost-benchmark-20261105:${key}`).digest('hex');
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

/** The registered windows: [{ key, group, regime, norad, name, cutoff }], in group order then by rank. */
export function windows() {
  const out = [];
  for (const [group, g] of Object.entries(GROUPS)) {
    const rows = rowsIn(path.join(B051, g.store)).filter((r) => (r.group ?? r.key.split('|')[0]) === group)
      .filter((r) => (r.arms.AP72 ?? r.arms.AP24)?.ok === true)
      .filter((r) => !HELD_NORADS.has(Number(r.norad)) && Date.parse(r.cutoff) < HOLD_AFTER)
      .sort((a, b) => rank(a.key).localeCompare(rank(b.key)));
    for (const r of rows.slice(0, PER_GROUP)) out.push({ key: r.key, group, regime: g.regime, norad: r.norad, name: r.name, cutoff: r.cutoff });
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  for (const w of windows()) console.log(`${w.key}\t${w.regime}\tNORAD ${w.norad}`);
}
