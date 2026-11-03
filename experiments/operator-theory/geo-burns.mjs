// GEO-TRUTH.md, maneuvers: for each satellite and sidereal day of its truth, the mean semimajor axis and mean orbit normal; a burn is a day, or the first day after a gap, that breaks
// the straight line through the two days with data before it by more than 10 times the median break over all the satellites of the set. Statistics on stored truth only.
//   node experiments/operator-theory/geo-burns.mjs --set waas|beidou --out <json>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from '../xp2-fit-design/common.mjs';
import { SBAS, series } from './lib/sbas.mjs';
import { WA_CUTOFFS } from './lib/regimes.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const MU = 398600.4418, SID = 86164.0905, DAY = 86400000;
const sats = [];
if (argOf('--set') === 'waas') {
  for (const [prn, s] of Object.entries(SBAS)) sats.push({ name: s.name, lines: await series(Number(prn), WA_CUTOFFS[0] - 3 * DAY, WA_CUTOFFS.at(-1) + 8 * DAY) });
} else {
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  for (const o of SRC.mgex({ klass: 'geo' })) sats.push({ name: o.name, lines: o.lines });
}
const all = [];
for (const o of sats) {
  const L = o.lines.map((l) => ({ t: Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`), r: l.r, v: l.v })).filter((l) => l.v && Number.isFinite(l.v[0]));
  const days = [];
  for (let start = L[0].t; start + SID * 1000 <= L.at(-1).t; start += SID * 1000) {
    const s = L.filter((l) => l.t >= start && l.t < start + SID * 1000);
    const expected = (SID * 1000) / Math.max(1, (L[1].t - L[0].t));
    if (s.length < 0.85 * expected) { days.push({ start }); continue; }
    let a = 0; const h = [0, 0, 0];
    for (const { r, v } of s) {
      const rr = Math.hypot(...r), vv = Math.hypot(...v); a += 1 / (2 / rr - (vv * vv) / MU);
      const c = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], m = Math.hypot(...c);
      for (let k = 0; k < 3; k += 1) h[k] += c[k] / m;
    }
    const m = Math.hypot(...h);
    days.push({ start, a: (a / s.length) * 1000, h: h.map((x) => x / m) });
  }
  o.breaks = [];
  for (let i = 0; i < days.length; i += 1) {
    const d = days[i];
    if (!d.a) continue;
    const before = days.slice(0, i).filter((x) => x.a).slice(-2);
    if (before.length < 2) continue;
    const [p, q] = before, f = (d.start - q.start) / (q.start - p.start);
    const ra = d.a - (q.a + f * (q.a - p.a));
    const pred = [0, 1, 2].map((k) => q.h[k] + f * (q.h[k] - p.h[k])), m = Math.hypot(...pred);
    const rh = (Math.acos(Math.min(1, pred.reduce((s, x, k) => s + (x / m) * d.h[k], 0))) * 180 / Math.PI) * 1000;
    o.breaks.push({ day: new Date(d.start).toISOString(), afterGap: days[i - 1] && !days[i - 1].a, ra, rh });
  }
  all.push(...o.breaks);
}
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const ma = med(all.map((x) => Math.abs(x.ra))), mh = med(all.map((x) => x.rh));
const out = { set: argOf('--set'), medianBreakM: ma, medianBreakMdeg: mh, satellites: sats.map((o) => ({ name: o.name, burns: o.breaks.filter((x) => Math.abs(x.ra) > 10 * ma || x.rh > 10 * mh).map((x) => ({ day: x.day, afterGap: x.afterGap, semimajorAxisM: Math.round(x.ra), planeMdeg: Math.round(x.rh * 10) / 10 })) })) };
fs.writeFileSync(argOf('--out'), `${JSON.stringify(out, null, 1)}\n`);
console.log('median break', ma.toFixed(1), 'm,', mh.toFixed(2), 'mdeg');
for (const s of out.satellites) console.log(s.name, s.burns.length, s.burns.map((b) => `${b.day.slice(5, 10)}${b.afterGap ? '*' : ''} ${b.semimajorAxisM} m ${b.planeMdeg} mdeg`).join(' | '));
process.exit(0);
