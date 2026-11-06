// PER-REV-FLAG.md, amendment of 2026-11-06: the two separating tests on the stored rows. (1) Join test: the passive spheres' flagged changes (1 m or more over
// [cutoff - 24 h, cutoff + 168 h]) against the truth product's file joins and the cutoff boundaries, the count of coinciding changes against 10,000 redraws of
// the same number of revolution starts per window. (2) Model-truth control: the flagged share on the model truth against the real truth, same windows. WAAS
// beside them, report only. Statistics on stored rows only.
//   node experiments/operator-theory/per-rev-flag-separate-table.mjs --out results/operator-theory/per-rev-flag/separate
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { median, rand } from './lib/compare.mjs';
import { HOUR, PER_REV, revDifferences, revFlag, periodOf } from './lib/steps.mjs';
import { STORE as FLIGHTS } from './per-rev-flag.mjs';
import { STORE, LOW_SET } from './per-rev-flag-separate.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const read = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const round = (x, k = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(k)));
const DRAWS = 10000, LEAD = 168, FIT = 24;
const SETS = [
  { set: 'low', label: 'Low passive spheres (LARETS, WESTPAC, Starlette)', groups: ['LS'], names: (n) => LOW_SET.includes(n), verdict: true },
  { set: 'high-spheres', label: 'Laser spheres near 1,450 km (Ajisai, LARES)', groups: ['LS'], names: (n) => !LOW_SET.includes(n) },
  { set: 'geodetic', label: 'Laser geodetic (LAGEOS-2, Etalon-1, Etalon-2, LARES-2)', groups: ['GD'], names: () => true },
  { set: 'waas', label: 'WAAS broadcast (report only, no burn verdict)', groups: ['WA'], names: () => true, noControl: true },
];

const out = [];
for (const S of SETS) {
  const windows = [];
  for (const g of S.groups) {
    const real = new Map(read(path.join(FLIGHTS, g)).filter((r) => r.ok).map((r) => [r.key, r]));
    for (const s of read(path.join(STORE, g))) {
      const r = real.get(s.key);
      if (!r || !S.names(r.name)) continue;
      const D0 = Date.parse(r.cutoff), P = periodOf(r.truth);
      const f = revFlag(revDifferences(r.flight, r.truth), P, D0 - FIT * HOUR, D0 + LEAD * HOUR);
      const m = s.ok && s.modelTruth ? revFlag(revDifferences(s.modelFlight, s.modelTruth), periodOf(s.modelTruth), D0 - FIT * HOUR, D0 + LEAD * HOUR) : null;
      windows.push({ key: s.key, name: r.name, D0, P, joins: s.joins, boundaries: [D0 - FIT * HOUR, D0], units: f.changes.filter((c) => Math.abs(c.sizeM) >= PER_REV.jumpM).map((c) => c.t), candidates: f.changes.map((c) => c.t), flagged: f.flagged, model: m });
    }
  }
  const near = (t, P, set) => set.some((e) => e >= t - P && e <= t + P);
  const joinTest = (which) => {
    const units = windows.reduce((s, w) => s + w.units.length, 0), observed = windows.reduce((s, w) => s + w.units.filter((t) => near(t, w.P, w[which])).length, 0);
    const random = rand(parseInt(crypto.createHash('sha256').update(`PERREV-JOIN|${S.set}`).digest('hex').slice(0, 8), 16));
    let atOrAbove = 0; const counts = [];
    for (let d = 0; d < DRAWS; d += 1) {
      let c = 0;
      for (const w of windows) {
        const pool = [...w.candidates];
        for (let k = 0; k < w.units.length && pool.length; k += 1) { const i = Math.floor(random() * pool.length); if (near(pool[i], w.P, w[which])) c += 1; pool[i] = pool[pool.length - 1]; pool.pop(); }
      }
      counts.push(c); if (c >= observed) atOrAbove += 1;
    }
    const share = units ? observed / units : null, p = (1 + atOrAbove) / (DRAWS + 1);
    return { units, coinciding: observed, share: round(share), nullMedianCount: median(counts), p: round(p, 4),
      reading: !units ? 'no flagged change' : share >= 0.5 && p <= 0.01 ? 'explains the flags' : p > 0.05 ? 'does not explain the flags' : 'inconclusive' };
  };
  const row = { set: S.set, label: S.label, windows: windows.length, satellites: [...new Set(windows.map((w) => w.name))].sort(), flaggedReal: windows.filter((w) => w.flagged).length,
    joinTest: { joins: joinTest('joins'), boundaries: joinTest('boundaries') } };
  if (!S.noControl) {
    const both = windows.filter((w) => w.model);
    const realShare = both.length ? both.filter((w) => w.flagged).length / both.length : null, modelShare = both.length ? both.filter((w) => w.model.flagged).length / both.length : null;
    row.control = { windows: both.length, realFlagged: both.filter((w) => w.flagged).length, modelFlagged: both.filter((w) => w.model.flagged).length, realShare: round(realShare), modelShare: round(modelShare),
      modelLargestMedianM: both.length ? round(median(both.map((w) => Math.abs(w.model.largest?.sizeM ?? 0))), 3) : null,
      reading: !both.length ? 'no window' : modelShare <= 0.1 && modelShare <= realShare / 3 ? 'the truth product is the cause' : modelShare >= realShare / 2 ? 'a drag-rate change' : 'mixed' };
  }
  out.push(row);
}
const doc = { registered: 'PER-REV-FLAG.md, amendment of 2026-11-06', span: { fitHours: FIT, leadHours: LEAD }, draws: DRAWS, sets: out };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
const J = (j) => `${j.coinciding} of ${j.units} (${j.share ?? '-'}), null median ${j.nullMedianCount}, p ${j.p}: ${j.reading}`;
const md = ['# Why the passive spheres flag: two separating tests', '', 'Registered in `experiments/operator-theory/PER-REV-FLAG.md` (amendment of 2026-11-06) before any row. Span 24/168. Join test: flagged changes within one period of a truth-product file join, or of the cutoff or fit-arc start, against 10,000 redraws of revolution starts per window. Control: the flagged share when the truth is FFM24\'s product flown on the definitive weather (no joins, drag kept).', '',
  '| Set | Windows | Flagged on the real truth | Join test: file joins | Join test: cutoff boundaries | Control: flagged real / model (of windows) | Control reading |', '| --- | --- | --- | --- | --- | --- | --- |',
  ...out.map((r) => `| ${r.label} | ${r.windows} | ${r.flaggedReal} | ${J(r.joinTest.joins)} | ${J(r.joinTest.boundaries)} | ${r.control ? `${r.control.realFlagged} / ${r.control.modelFlagged} (of ${r.control.windows}); model's largest change, median ${r.control.modelLargestMedianM} m` : '-'} | ${r.control?.reading ?? 'report only'} |`), ''];
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
