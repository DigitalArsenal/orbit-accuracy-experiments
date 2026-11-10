// stack #386, the diagnosis's representation floors again on the corrected path: AP (the published $PCF) fitted to the cached FFMq trajectory
// over the fit arc plus 7 days (the carrier of DIAGNOSIS-2026-11-10.md, its states thinned to 300 s and the whole span fitted), flown at the
// same states, and its distance from them as RMS over the arc and over days 1, 3 and 7, flown both ways: TEME turned to GCRF by
// foundation/frames (the path the diagnosis measured through) and sdn-ap's own GCRF output. The diagnosis's carrier followed the published
// reduced FFM; this one follows FFMq. Exploratory; every state is a module's.
//   node experiments/headline-loop/frames/carrier-floor.mjs <window key> ...     output: carrier-floor.txt beside this file
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const E = await import('../lib/env.mjs'); E.usePackages();
const W = await import('../lib/windows.mjs');
const A = await import('../lib/arms.mjs');
const { QUALIFIED } = await import('../lib/settings.mjs');
const arms = await A.openArms({ apWasm: path.join(E.MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm') });
const listed = W.windowsOf(['GN', 'IG', 'GD', 'GE']);
const winOf = new Map([...listed.windows, ...listed.spring].map((x) => [x.key, x]));
const rmsOf = (a, b, from, to) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 1) { const t = W.ms(b[i].epoch); if (t <= from || t > to) continue; s += (a[i].r[0] - b[i].r[0]) ** 2 + (a[i].r[1] - b[i].r[1]) ** 2 + (a[i].r[2] - b[i].r[2]) ** 2; n += 1; } return n ? Math.sqrt(s / n) * 1000 : null; };
const lines = [], all = { TEME: [], GCRF: [] };
for (const key of process.argv.slice(2)) {
  const w = winOf.get(key), D0 = w.cutoffMs, arc = Math.max(...w.arcs), q = QUALIFIED[w.group], G = W.GROUPS[w.group];
  const name = `${key.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${arc}`, dir = path.join(A.STORE_ROOT, 'ffm-cache', A.ffmCacheKey(q, 60).key);
  if (!fs.existsSync(path.join(dir, `${name}.json`))) { lines.push(`${key}: no cached FFMq trajectory`); continue; }
  const doc = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
  const traj = arms.trajectoryOf(dir, doc).filter((_, i) => i % 5 === 0);
  const object = { name: w.name, id: '', norad: w.norad ?? 0 };
  const parts = [];
  for (const frame of ['TEME', 'GCRF']) {
    const x = await arms.apFitFly({ object, lines: traj, D0: W.ms(traj.at(-1).epoch), pcf: G.vacuum ? A.PCF.AP_VACUUM : A.PCF.AP, spw: G.vacuum ? null : W.weatherAt(D0).spw, epochs: traj.map((l) => l.epoch), frame });
    const r = [rmsOf(x.states, traj, -Infinity, D0), rmsOf(x.states, traj, D0, D0 + W.DAY), rmsOf(x.states, traj, D0 + 2 * W.DAY, D0 + 3 * W.DAY), rmsOf(x.states, traj, D0 + 6 * W.DAY, D0 + 7 * W.DAY)];
    all[frame].push(r);
    parts.push(`${frame === 'TEME' ? 'TEME + frames' : 'sdn-ap GCRF'} ${r.map((v) => (v === null ? '-' : v.toFixed(1))).join(' / ')}`);
  }
  lines.push(`${key} ${arc} h (FFMq ${q}), carrier minus FFMq m, arc / day 1 / day 3 / day 7: ${parts.join('; ')}`);
}
const med = (v) => { const s = v.filter((x) => x !== null).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
for (const frame of ['TEME', 'GCRF']) if (all[frame].length) lines.push(`median over ${all[frame].length} windows, ${frame === 'TEME' ? 'TEME + frames' : 'sdn-ap GCRF'}: ${[0, 1, 2, 3].map((k) => med(all[frame].map((r) => r[k]))?.toFixed(1) ?? '-').join(' / ')} m`);
const file = path.join(HERE, `carrier-floor-${process.env.CARRIER_LABEL ?? 'run'}.txt`);
fs.writeFileSync(file, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(0);
