// S1-STEP-FREE.md's table: the maneuver flag of each window (lib/steps.mjs on its truth, through XM's reader), and FFM against AP by day on the flagged, step-free and
// unchecked windows; the registered cell (step-free, day 7) beside its thresholds. Report only (amendment 1). Statistics and module elements only.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/s1-step-free-table.mjs --rows <store> --out results/operator-theory/s1-step-free
import fs from 'node:fs';
import path from 'node:path';
import { config, root, XM } from './lib/xp2.mjs';
import { S1_STEP_FREE as WINDOWS } from './lib/regimes.mjs';
import { BUILD_NOTE, FFM_220 } from './lib/build.mjs';
import { rand, pct } from './lib/compare.mjs';
import { DAY, HOUR, LOW, openElements, revolutions, lowSteps, windowSteps, windowState } from './lib/steps.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ROWS = argOf('--rows'), OUT = argOf('--out');
if (!ROWS || !OUT) throw new Error('--rows and --out');
export const THRESHOLDS = { share: 0.5, medianRatio: 1, minimumWindows: 30, day: '7', fitHours: 24, draws: 2000, seed: 20261104 };
const rows = new Map(fs.readdirSync(ROWS).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(ROWS, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).map((r) => [r.key, r]));
const keys = WINDOWS.norads.flatMap((n) => WINDOWS.cutoffs.map((t) => `S1|${n}|${XM.dateOf(t)}`));
const missing = keys.filter((k) => !rows.has(k)), extra = [...rows.keys()].filter((k) => !keys.includes(k));
if (missing.length || extra.length) throw new Error(`the store is not the registered 170 windows: ${missing.length} missing, ${extra.length} extra`);
const foreign = [...rows.values()].filter((r) => r.ffm?.wasmSha256 !== FFM_220.wasmSha256);
if (foreign.length) throw new Error(`${foreign.length} rows were not flown on propagator/ffm ${FFM_220.version}`);

// The flag: every object's steps over its windows' spans and the detector's margin, its truth read day by day as AP5's runners read it.
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const el = await openElements();
const flags = new Map(), objects = [];
for (const norad of WINDOWS.norads) {
  const o = XM.config.groups.S1.objects.find((x) => x.norad === norad);
  const from = WINDOWS.cutoffs[0] - WINDOWS.fitHours * HOUR - 4 * DAY, to = WINDOWS.cutoffs.at(-1) + 8 * DAY, lines = [];
  for (let t = from; t < to; t += DAY) lines.push(...T.series(o, t, t + DAY - 1).lines);
  const d = lowSteps(await revolutions(lines, el));
  objects.push({ norad, name: o.name, steps: d.steps.map((s) => ({ t: new Date(s.t).toISOString().slice(0, 16), sizeM: Math.round(s.sizeM * 10) / 10 })), truth: [new Date(from).toISOString().slice(0, 10), new Date(to).toISOString().slice(0, 10)] });
  for (const t of WINDOWS.cutoffs) flags.set(`S1|${norad}|${XM.dateOf(t)}`, windowSteps(d, t, { fitHours: WINDOWS.fitHours, leadHours: 168 }));
}
await el.close();

const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
const fig = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
const median = (v) => pct([...v].sort((a, b) => a - b), 0.5);
/** The share of windows FFM loses and the median FFM/AP, each with a 95 % interval: satellites and cutoff days drawn independently, a window weighted by the product of its draws. */
function figures(pairs, withInterval) {
  if (!pairs.length) return { n: 0 };
  const out = { n: pairs.length, ffmMedianKm: fig(median(pairs.map((p) => p.f))), apMedianKm: fig(median(pairs.map((p) => p.a))), ffmWorseShare: Number((pairs.filter((p) => p.f > p.a).length / pairs.length).toFixed(3)), medianRatio: Number(median(pairs.map((p) => p.f / p.a)).toFixed(3)) };
  if (!withInterval) return out;
  const random = rand(THRESHOLDS.seed), sats = [...new Set(pairs.map((p) => p.sat))], days = [...new Set(pairs.map((p) => p.day))], shares = [], ratios = [];
  for (let k = 0; k < THRESHOLDS.draws; k += 1) {
    const ws = new Map(), wd = new Map();
    for (let i = 0; i < sats.length; i += 1) { const s = sats[Math.floor(random() * sats.length)]; ws.set(s, (ws.get(s) ?? 0) + 1); }
    for (let i = 0; i < days.length; i += 1) { const d = days[Math.floor(random() * days.length)]; wd.set(d, (wd.get(d) ?? 0) + 1); }
    const w = pairs.map((p) => (ws.get(p.sat) ?? 0) * (wd.get(p.day) ?? 0)), total = w.reduce((a, b) => a + b, 0);
    if (!total) continue;
    shares.push(pairs.reduce((s, p, i) => s + (p.f > p.a ? w[i] : 0), 0) / total);
    const order = pairs.map((p, i) => [p.f / p.a, w[i]]).filter(([, x]) => x > 0).sort((a, b) => a[0] - b[0]);
    let run = 0; for (const [ratio, x] of order) { run += x; if (run >= total / 2) { ratios.push(ratio); break; } }
  }
  const interval = (v) => { const s = v.sort((a, b) => a - b); return [Number(pct(s, 0.025).toFixed(3)), Number(pct(s, 0.975).toFixed(3))]; };
  return { ...out, ffmWorseShareInterval: interval(shares), medianRatioInterval: interval(ratios) };
}
const cells = [];
for (const day of ['1', '2', '3', '7']) {
  const lead = Number(day) * 24, split = { flagged: [], stepFree: [], unchecked: [] };
  for (const key of keys) {
    const r = rows.get(key), f = e(r, 'F24', day), a = e(r, 'AP24', day);
    if (!Number.isFinite(f) || !Number.isFinite(a)) continue;
    const s = windowState(flags.get(key), WINDOWS.fitHours, lead);
    split[s.flagged ? 'flagged' : s.stepFree ? 'stepFree' : 'unchecked'].push({ f, a, sat: r.norad, day: key.split('|')[2] });
  }
  cells.push({ day: Number(day), ...Object.fromEntries(Object.entries(split).map(([k, v]) => [k, figures(v, k === 'stepFree' && day === THRESHOLDS.day)])) });
}
const reg = cells.find((c) => String(c.day) === THRESHOLDS.day).stepFree;
const reading = reg.n < THRESHOLDS.minimumWindows ? 'inconclusive' : reg.ffmWorseShare < THRESHOLDS.share && reg.medianRatio < THRESHOLDS.medianRatio ? 'pass' : 'fail';
const scored = [...rows.values()].filter((r) => r.arms?.F24?.ok && r.arms?.AP24?.ok).length;
const failures = Object.fromEntries(['F24', 'AP24'].map((arm) => [arm, [...rows.values()].filter((r) => !r.arms?.[arm]?.ok).length]));
const doc = {
  registered: 'experiments/operator-theory/S1-STEP-FREE.md', reading: 'report only (amendment 1: the windows are spent)', thresholds: THRESHOLDS, detector: LOW,
  builds: { ap: BUILD_NOTE, ffm: FFM_220, estimation: 'analysis/estimation 0.7.0 (7a555ca5b3ed), XM3\'s' },
  windows: { registered: keys.length, bothArmsScored: scored, failed: failures, rowsFailedWhole: [...rows.values()].filter((r) => r.error).length },
  registeredCell: { ...reg, againstThresholds: reading },
  cells, objects, flags: Object.fromEntries([...flags].map(([k, v]) => [k, v])),
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
const p = (x) => `${Math.round(x * 1000) / 10} %`;
const md = ['# FFM against AP on step-free Sentinel-1 windows, 2025', '',
  `Report only, \`experiments/operator-theory/S1-STEP-FREE.md\`. Its windows are spent (amendment 1): no verdict rests on this table.`, '',
  `Builds: FFM \`propagator/ffm\` ${FFM_220.version} (dist ${FFM_220.wasmSha256.slice(0, 12)}, modules ${FFM_220.modulesCommit?.slice(0, 10)}) fitted by \`analysis/estimation\` 0.7.0 (7a555ca5b3ed) at CHEAPER.md's settings; AP and the frames on ${BUILD_NOTE}.`, '',
  `Windows: Sentinel-1A and 1C, cutoff every day from ${WINDOWS.from} to ${WINDOWS.to}, ${keys.length} in all; both arms scored on ${scored}; FFM failed on ${failures.F24}, AP on ${failures.AP24}.`, '',
  `The registered cell, step-free at day 7 from a 24 h fit: ${reg.n} windows, FFM worse in ${reg.n ? p(reg.ffmWorseShare) : '-'} [${reg.ffmWorseShareInterval?.map(p).join(', ') ?? '-'}], median FFM/AP ${reg.medianRatio ?? '-'} [${reg.medianRatioInterval?.join(', ') ?? '-'}].`, '',
  `Against the thresholds (share under 50 %, median under 1, at least 30 windows) it ${reading === 'inconclusive' ? 'is inconclusive' : `would ${reading}`}. As registered after amendment 1 it is report only, so it neither passes nor fails.`, '',
  '| Day | Flagged n | FFM / AP median km, flagged | FFM worse, flagged | Median FFM/AP, flagged | Step-free n | FFM / AP median km, step-free | FFM worse, step-free | Median FFM/AP, step-free | Unchecked n |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const c of cells) md.push(`| ${c.day} | ${c.flagged.n} | ${c.flagged.ffmMedianKm ?? '-'} / ${c.flagged.apMedianKm ?? '-'} | ${c.flagged.n ? p(c.flagged.ffmWorseShare) : '-'} | ${c.flagged.medianRatio ?? '-'} | ${c.stepFree.n} | ${c.stepFree.ffmMedianKm ?? '-'} / ${c.stepFree.apMedianKm ?? '-'} | ${c.stepFree.n ? p(c.stepFree.ffmWorseShare) : '-'} | ${c.stepFree.medianRatio ?? '-'} | ${c.unchecked.n} |`);
md.push('', `The flag: \`lib/steps.mjs\` as registered (revolution time means of \`foundation/orbits\`' osculating semimajor axis; a step of ${LOW.minM} m or more against the drift), a window flagged when a step falls in [cutoff - 24 h, cutoff + the lead], step-free when none does and the detector covered both, unchecked otherwise. \`table.json\` holds every window's steps and every figure.`);
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
process.exit(0);
