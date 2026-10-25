// Two-line sets (type 0 and type 4) as the fields of an $OMM. Host-side text parsing only, after the layout of the sets.
import { iso } from './windows.mjs';

const exponent = (f) => (f[0] === '-' ? -1 : 1) * (Number(f.slice(1, 6)) * 1e-5) * 10 ** ((f[6] === '-' ? -1 : 1) * Number(f[7]));
export function setOf(l1, l2) { // a two-line set (type 4) as the fields of an $OMM; host-side text parsing only
  const year = Number(l1.slice(18, 20)), day = Number(l1.slice(20, 32));
  const epochMs = Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (day - 1) * 86400000;
  const seconds = (day - Math.floor(day)) * 86400;
  const base = new Date(Date.UTC(year < 57 ? 2000 + year : 1900 + year, 0, 1) + (Math.floor(day) - 1) * 86400000).toISOString().slice(0, 10);
  const whole = Math.floor(seconds), micro = String(Math.round((seconds - whole) * 1e6)).padStart(6, '0');
  const hh = String(Math.floor(whole / 3600)).padStart(2, '0'), mm = String(Math.floor((whole % 3600) / 60)).padStart(2, '0'), ss = String(whole % 60).padStart(2, '0');
  return { type: Number(l1[62]), epochMs, epoch: `${base}T${hh}:${mm}:${ss}.${micro}`, norad: Number(l1.slice(2, 7)), inclination: Number(l2.slice(8, 16)), raan: Number(l2.slice(17, 25)),
    eccentricity: Number(`0.${l2.slice(26, 33)}`), argPerigee: Number(l2.slice(34, 42)), meanAnomaly: Number(l2.slice(43, 51)), meanMotion: Number(l2.slice(52, 63)), bstar: exponent(l1.slice(53, 61)), agom: exponent(l1.slice(44, 52)) };
}

/** Map of NORAD ID to [line1, line2] for the sets of a two-line text (three-line names are ignored). */
export function readSets(text) {
  const lines = text.split('\n');
  const sets = new Map();
  for (let i = 0; i + 1 < lines.length; i += 1) if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) sets.set(Number(lines[i].slice(2, 7)), [lines[i], lines[i + 1]]);
  return sets;
}
