// COMPARE.md, two versions of XP, report only: the Space Force's SGP4-XP beside our whiteroom XP on the same windows and pairs, joined by window and pair. Statistics only.
//   node experiments/operator-theory/compare-xp.mjs --out results/ap-truth/compare
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { binOf, pct, asc, round } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';
import { BUILD } from './lib/build.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
const ROOT = '/opt/data/sdn-archive/operator-theory', AP = path.join(ROOT, 'ap'), NEW = path.join(AP, BUILD);
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows(-iss)?-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const byKey = (dir) => new Map(rowsIn(dir).map((r) => [r.key, r]));
const pairKey = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
const byPair = (dir) => new Map(rowsIn(dir).map((r) => [pairKey(r), r]));
const median = (v) => pct([...v].sort(asc), 0.5);
const figures = (v) => { const s = v.filter(Number.isFinite).sort(asc); return s.length ? { n: s.length, median: pct(s, 0.5), p95: pct(s, 0.95) } : { n: 0 }; };
const DAYS = ['1', '2', '3', '7'];
const e = (r, arm, k) => r?.arms?.[arm]?.days?.[k]?.e;

const out = { registered: 'experiments/operator-theory/COMPARE.md', whiteroom: 'propagator/sdn-ap with FORCES and FIT unset', spaceForce: 'propagator/sgp4-xp, US Space Force Sgp4Prop 9.1.1.0 XP build, SHA-256 9f061110f12ac85a76ad80dc76cdb8a33ddad64e54d8dab3b6778602e16cbeb7', cells: [], leads: {}, providers: {}, failures: {} };

// Against truth: AP5's and AP6's windows. A contrast is by window, the median of ln(Space Force / whiteroom).
const ap5 = [
  ['T', 'Strong drag, 2025', rowsIn(path.join(NEW, 'compare-truth')).filter((r) => !r.error), byKey(path.join(NEW, 'ussf-truth')), [24]],
  ['P', 'Strong drag, 2026', rowsIn(path.join(NEW, 'compare-truth2')).filter((r) => !r.error && r.group === 'P'), byKey(path.join(NEW, 'ussf-truth2')), [24, 72]],
  ['S1', 'Near 700 km', rowsIn(path.join(NEW, 'compare-truth2')).filter((r) => !r.error && r.group === 'S1'), byKey(path.join(NEW, 'ussf-truth2')), [24, 72]],
  ['GN', 'Medium Earth orbit', rowsIn(path.join(NEW, 'compare-truth2')).filter((r) => !r.error && r.group === 'GN'), byKey(path.join(NEW, 'ussf-truth2')), [24, 72]],
];
const six = rowsIn(path.join(NEW, 'regimes')).filter((r) => !r.error), uSix = byKey(path.join(NEW, 'ussf-regimes'));
const groups = [...ap5, ...Object.entries(GROUPS).map(([g, v]) => [g, v.label, six.filter((r) => r.group === g), uSix, [...new Set(six.filter((r) => r.group === g).flatMap((r) => Object.keys(r.arms).map((a) => Number(a.replace(/^\D+/, '')))))].sort((a, b) => a - b)])];
for (const [group, label, rows, u, arcs] of groups) {
  for (const fit of arcs) {
    const arms = { XP: {}, XPU: {} }, ratio = {};
    for (const day of DAYS) {
      const xp = rows.map((r) => e(r, `XP${fit}`, day)), su = rows.map((r) => e(u.get(r.key), `U${fit}`, day));
      arms.XP[day] = figures(xp);
      arms.XPU[day] = figures(su);
      const d = rows.map((_, i) => Math.log(su[i] / xp[i])).filter(Number.isFinite);
      ratio[day] = d.length ? { n: d.length, medianRatio: Math.exp(median(d)) } : { n: 0 };
    }
    const failed = rows.filter((r) => u.get(r.key)?.arms?.[`U${fit}`]?.ok === false || !u.get(r.key)).length;
    out.cells.push({ group, label, fitHours: fit, satellite: 'all', windows: rows.length, failed, arms, ratio });
  }
}

// Against the next file: the laser centers' low-orbit pairs of compare-table.mjs, 48 h fit.
const laser = rowsIn(path.join(NEW, 'laser', 'forward')).filter((r) => r.source.endsWith('-leo'));
const xpLaser = byPair(path.join(NEW, 'laser-xp', 'forward')), uLaser = byPair(path.join(NEW, 'ussf-laser'));
for (const lead of [24, 72, 120, 168]) {
  const cell = laser.filter((r) => binOf(r.leadHours) === lead);
  const x = cell.map((r) => r.arms['A-XP@48']?.km ?? xpLaser.get(pairKey(r))?.arms['A-XP@48']?.km), su = cell.map((r) => uLaser.get(pairKey(r))?.arms['U-XP@48']?.km);
  const d = cell.map((_, i) => Math.log(su[i] / x[i])).filter(Number.isFinite);
  out.leads[lead] = { XP: figures(x), XPU: figures(su), medianRatio: d.length ? Math.exp(median(d)) : null };
}
out.failures.laser = [...uLaser.values()].filter((r) => r.arms['U-XP@48']?.error).length;
out.failures.providers = [...byPair(path.join(NEW, 'ussf-providers')).values()].filter((r) => Object.values(r.arms).some((a) => a.error)).length;

// The two head to head on the same files, one process, one call at a time, the order rotating by file.
const costRows = jsonl(path.join(NEW, 'compare-costs', 'xp-rows.jsonl')).filter((r) => !r.warmUp && r.arms.XP?.fitSeconds && r.arms.XPU?.fitSeconds);
const cost = (arm, field) => pct(costRows.map((r) => r.arms[arm][field]).sort(asc), 0.5);
out.costs = { files: costRows.length, XP: { fitSeconds: cost('XP', 'fitSeconds'), flightSeconds: cost('XP', 'flightSeconds') }, XPU: { fitSeconds: cost('XPU', 'fitSeconds'), flightSeconds: cost('XPU', 'flightSeconds') } };

// The build this ran, checked against its commit.
const MODULES = process.env.SDN_MODULES_ROOT, REL = 'propagator/sgp4-xp', COMMIT = '1b905d16f68fc56e7da66c6392315970f9e7e6d0', WASM = 'f61b15c4fd658817e3e43c7818da18c4d08d453ad28e9d704b0cd11b616b7deb';
const bytes = execFileSync('git', ['-C', MODULES, 'show', `${COMMIT}:${REL}/dist/isomorphic/module.wasm`], { maxBuffer: 256 * 1024 * 1024 });
if (crypto.createHash('sha256').update(bytes).digest('hex') !== WASM) throw new Error('propagator/sgp4-xp is not the build registered here');
const manifest = JSON.parse(execFileSync('git', ['-C', MODULES, 'show', `${COMMIT}:${REL}/plugin-manifest.json`], { maxBuffer: 16 * 1024 * 1024 }).toString('utf8'));
out.builds = [{ role: 'Fit and flight', module: REL, version: manifest.version, commit: COMMIT, sha256: WASM, source: `https://github.com/DigitalArsenal/space-data-network-modules/tree/${COMMIT}/${REL}` }];

fs.writeFileSync(path.join(OUT, 'xp-versions.json'), `${JSON.stringify(out, null, 1)}\n`);
const md = ['# Two versions of XP', '', 'Report only, `COMPARE.md`. Median 3D error, km, against precise orbits, with the median by window of Space Force over whiteroom. Each is fitted to the same arc of the same states.', '', '| Orbit | Fit, h | Windows | Failed | Day | Whiteroom | Space Force | Ratio |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const c of out.cells) for (const day of DAYS) md.push(`| ${c.label} | ${c.fitHours} | ${c.windows} | ${c.failed} | ${day} | ${round(c.arms.XP[day].median, 3) ?? '-'} | ${round(c.arms.XPU[day].median, 3) ?? '-'} | ${round(c.ratio[day].medianRatio, 3) ?? '-'} |`);
md.push('', `Seconds per file on ${out.costs.files} low-orbit files: whiteroom fit ${round(out.costs.XP.fitSeconds, 3)}, flight ${round(out.costs.XP.flightSeconds, 3)}; Space Force fit ${round(out.costs.XPU.fitSeconds, 3)}, flight ${round(out.costs.XPU.flightSeconds, 3)}.`);
md.push('', 'Against the laser centers\' next files, low orbit, 48 h fit:', '', '| Lead from the older file\'s start, h | Whiteroom | Space Force | Ratio |', '| --- | --- | --- | --- |');
for (const [lead, l] of Object.entries(out.leads)) md.push(`| ${lead} | ${round(l.XP.median, 3)} | ${round(l.XPU.median, 3)} | ${round(l.medianRatio, 3)} |`);
fs.writeFileSync(path.join(OUT, 'xp-versions.md'), `${md.join('\n')}\n`);
console.log(md.slice(4).join('\n'));
