// Planet Labs' daily orbit-determination states, read from the SDN archive's copy of
// ephemerides.planet-labs.com/planet_YYYYMMDD.states (CC BY-NC 4.0; used for results, never
// committed or published). One state per operational satellite per file; the same state can
// appear in two files, so a satellite's series is the set of distinct epochs.
//
//   col 1 HWID; col 2 epoch, seconds past J2000 on TT; cols 3-8 position (m) and velocity (m/s), J2000;
//   col 9 Planet's drag ballistic coefficient (kg/m2, Planet's own density model); col 10 SRP coefficient (not fit)
import fs from 'node:fs';
import path from 'node:path';

export const PLANET_DIR = '/opt/data/sdn-archive/hac/planet-ephemerides/history';
const J2000_TT_MS = Date.UTC(2000, 0, 1, 12, 0, 0);

// {hwid -> [{epochTt (ISO text on TT), ttMs, state [m, m/s] J2000, ballisticKgPerM2}]} sorted by epoch, distinct epochs.
export function readPlanetSeries({ dir = PLANET_DIR, extraDirs = [], fromDay = null, toDay = null } = {}) {
  const series = new Map();
  // `extraDirs` (E13's live collector, PLAN.md Amendment S3 item 4) add files of the same names; the series is the set of distinct epochs, so a day's final file
  // simply adds what the archive's earlier copy of that day lacked.
  const files = [dir, ...extraDirs].filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((n) => /^planet_\d{8}\.states$/.test(n)).map((n) => ({ d, n })));
  files.sort((x, y) => x.n.localeCompare(y.n) || x.d.localeCompare(y.d));
  for (const { d, n: name } of files) {
    const day = name.slice(7, 15);
    if ((fromDay && day < fromDay.replaceAll('-', '')) || (toDay && day > toDay.replaceAll('-', ''))) continue;
    for (const line of fs.readFileSync(path.join(d, name), 'utf8').split(/\r?\n/)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 9 || !/^[0-9a-f]{4}$/i.test(f[0])) continue;
      const hwid = f[0].toLowerCase();
      const ttMs = J2000_TT_MS + Math.round(Number(f[1]) * 1e3);
      const list = series.get(hwid) ?? new Map();
      list.set(ttMs, { epochTt: new Date(ttMs).toISOString(), ttMs, state: f.slice(2, 8).map(Number), ballisticKgPerM2: Number(f[8]) });
      series.set(hwid, list);
    }
  }
  return new Map([...series].map(([hwid, m]) => [hwid, [...m.values()].sort((a, b) => a.ttMs - b.ttMs)]));
}

// Consecutive pairs of one satellite's states whose spacing is in [minHours, maxHours]: [{a, b, hours}].
export function arcsOf(states, { minHours = 12, maxHours = 36 } = {}) {
  const out = [];
  for (let i = 1; i < states.length; ++i) {
    const hours = (states[i].ttMs - states[i - 1].ttMs) / 3600e3;
    if (hours >= minHours && hours <= maxHours) out.push({ a: states[i - 1], b: states[i], hours });
  }
  return out;
}
