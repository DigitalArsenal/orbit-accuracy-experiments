// The re-flight checked against what it must reproduce: the reduced FFM arm against the stored published FFM rows, AP against the stored AP rows
// (the build named), and the configured and extra FFM arms against the round-0 referee's rows (rerun/ref-ffm.mjs) where they exist. Prints, per
// group and arm, the windows matched and the largest relative difference of the 3D day error at any lead.
//   node experiments/headline-loop/verify.mjs --rows <store>/<ap sha12> [--referee <round-0 folder>] [--json out.json]
//   node experiments/headline-loop/verify.mjs --check     made-up rows: the matching and the difference measure
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const ARCHIVE = '/opt/data/sdn-archive/operator-theory/ap';
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir, re = /^rows(-\d+)?\.jsonl$/) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => jsonl(path.join(dir, f))) : []);

/** The stored published rows by group: AP (the build the cells name) and FFM (ffm220), keyed by window. */
export function storedRows() {
  const by = (dirs) => new Map(dirs.flatMap((d) => rowsIn(path.join(ARCHIVE, d))).map((r) => [r.key, r]));
  const ap = { truth: by(['b051/truth']), truth2: by(['b051/truth2']), regimes: by(['b051/regimes', 'b063/regimes-hx']), fresh: by(['b065/truth-fresh']) };
  const ffm = { truth: by(['ffm220/compare-truth']), truth2: by(['ffm220/compare-truth2']), regimes: by(['ffm220/regimes']), wa: by(['b0411/regimes-wa']) };
  const apOf = (g) => (g === 'T' ? ap.truth : ['P', 'S1', 'GN'].includes(g) ? ap.truth2 : ['WA', 'GN_GAL'].includes(g) ? ap.fresh : ap.regimes);
  const ffmOf = (g) => (g === 'T' ? ffm.truth : ['P', 'S1', 'GN'].includes(g) ? ffm.truth2 : g === 'WA' ? ffm.wa : g === 'GN_GAL' ? new Map() : ffm.regimes);
  return { apOf, ffmOf, fresh: ap.fresh };
}
/** The referee's FFM rows (round 0): key|arm|arc to days { lead: km }. */
export function refereeRows(folder) {
  const out = new Map();
  if (!folder || !fs.existsSync(folder)) return out;
  for (const f of fs.readdirSync(folder).filter((n) => /^ref-ffm-.*\.jsonl$/.test(n))) for (const r of jsonl(path.join(folder, f))) if (r.ok) out.set(`${r.key}|${r.arm}|${r.arc}`, r.days);
  return out;
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9);
/** Largest relative difference over the common leads of two { lead: km } maps, and how many leads were compared. */
export function diff(mine, theirs) {
  let worst = 0, n = 0;
  for (const [k, v] of Object.entries(mine ?? {})) {
    const t = theirs?.[k];
    const a = typeof v === 'number' ? v : v?.e, b = typeof t === 'number' ? t : t?.e;
    if (Number.isFinite(a) && Number.isFinite(b)) { worst = Math.max(worst, rel(a, b)); n += 1; }
  }
  return { worst, n };
}
// the referee flew L40S, E5, Ffull (configured), L70S on a sample of S1 and DO (now the qualified arm there), Fbest, and the reduced F20 and L40
export const REFEREE_ARM = { FFMc: (row) => row.arms.FFMc?.arm, FFMq: (row) => (row.arms.FFMq?.sameAs ? null : row.arms.FFMq?.arm), FFMbest: () => 'Fbest', FFMr: (row) => (row.arms.FFMr?.arm === 'L40' ? 'L40' : 'F20') };

if (args.check) {
  const faults = [];
  const d1 = diff({ 1: { e: 0.010 }, 2: { e: 0.020 } }, { 1: 0.010, 2: 0.021 });
  if (Math.abs(d1.worst - 1 / 21) > 1e-12 || d1.n !== 2) faults.push(`diff ${JSON.stringify(d1)}`);
  if (diff({ 1: { e: 0.01 } }, { 2: 0.01 }).n !== 0) faults.push('diff compared leads that are not in both');
  console.log(faults.length ? `VERIFY CHECK: FAIL\n${faults.join('\n')}` : 'VERIFY CHECK: PASS (relative difference over common leads)');
  process.exit(faults.length ? 1 : 0);
}

const dir = args.rows;
if (!dir) throw new Error('--rows <store>/<ap sha12>');
const mine = fs.readdirSync(dir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f))).filter((r) => !r.error);
const S = storedRows(), REF = refereeRows(args.referee);
const tally = new Map();
const add = (g, what, d) => { if (!d.n) return; const k = `${g}|${what}`; const t = tally.get(k) ?? { windows: 0, worst: 0, over1e6: 0, over1pct: 0 }; t.windows += 1; t.worst = Math.max(t.worst, d.worst); if (d.worst > 1e-6) t.over1e6 += 1; if (d.worst > 0.01) t.over1pct += 1; tally.set(k, t); };
for (const r of mine) {
  const g = r.group, arc = r.arcH;
  add(g, 'FFMr vs stored FFM', diff(r.arms.FFMr?.days, S.ffmOf(g).get(r.key)?.arms?.[`F${arc}`]?.days));
  add(g, `AP vs stored AP (${['WA', 'GN_GAL'].includes(g) ? '0.6.5 suite' : g === 'HX' ? '0.6.3' : '0.5.1'})`, diff(r.arms.AP?.days, S.apOf(g).get(r.key)?.arms?.[`AP${arc}`]?.days));
  if (['HX', 'HE'].includes(g)) add(g, 'AP vs stored AP (0.6.5 suite)', diff(r.arms.AP?.days, S.fresh.get(r.key)?.arms?.[`AP${arc}`]?.days));
  for (const [label, armOf] of Object.entries(REFEREE_ARM)) {
    if (!r.arms[label]?.days || !armOf(r)) continue;
    const ref = REF.get(`${r.key}|${armOf(r)}|${arc}`);
    if (ref) add(g, `${label} (${armOf(r)}) vs referee`, diff(r.arms[label].days, ref));
  }
}
const out = [...tally.entries()].map(([k, t]) => { const [group, what] = k.split('|'); return { group, what, ...t, worst: Number(t.worst.toPrecision(3)) }; }).sort((a, b) => a.group.localeCompare(b.group) || a.what.localeCompare(b.what));
for (const t of out) console.log(`${t.group.padEnd(7)} ${t.what.padEnd(44)} windows ${String(t.windows).padStart(4)}  largest relative difference ${t.worst.toExponential(2)}  over 1e-6: ${t.over1e6}  over 1 %: ${t.over1pct}`);
if (args.json) fs.writeFileSync(args.json, JSON.stringify({ rows: dir, referee: args.referee ?? null, checks: out }, null, 1));
