// B2 A13 part 9: the calibrated covariance's A5 rates, calls, confusion matrices and verdict (A13 part 1 point 4) from the stored encounter
// rows. lib/ca.mjs summarize unchanged, with FFM-cal in A5's FFM slot and SGP4-XP-cal in its SGP4-XP slot; an encounter where either has no
// Pc is left out (A7 per pair); the registered seeds, the slots named ffm and sgp4xp. Inputs: part 4's rows/ca-encounters.<run>.<class>.jsonl
// of the A13 runs and part 5's ffm3 assessed rows, formed as part 5's summary forms them. Output: <store>/rows/ca.a13-a5.json with the
// SHA-256 of every input (read by table.mjs). No Pc is computed and no stored row is rewritten. Counting and resampling only.
//   node experiments/sdn-ap-mixed-screening/a13-a5.mjs           every cell (part 5's unmaneuvered cell alone takes over 7 min)
//   node experiments/sdn-ap-mixed-screening/a13-a5.mjs --check   the inputs' hashes and part 5's maneuvered cell against the file (run.mjs --check)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { store, args, frozen, write, sha256, root } from './common.mjs';
import { summarize } from './lib/ca.mjs';

frozen();
const rowsDir = path.join(store, 'rows'), FILE = path.join(rowsDir, 'ca.a13-a5.json');
const SLOTS = { ffm: 'ffmCal', sgp4xp: 'sgp4xpCal' };
const PART4 = ['iss.a13', 'laser.a13', 'starlink.ffm3']; // A3's runs carry no FFM-cal; laser's L-P and R2 are never in a verdict
const parse = (bytes) => bytes.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
/** An encounter row with the calibrated pair in A5's two slots. */
const calibrated = (r) => ({ ...r, arms: Object.fromEntries(Object.entries(SLOTS).map(([slot, arm]) => [slot, r.arms[arm]])) });

/** Part 4: one A13 run's cells from its stored encounter rows, which are the rows its summary counted (encounters formed). */
function part4(run, compute) {
  const sumFile = path.join(rowsDir, `ca.${run}.json`), stored = JSON.parse(fs.readFileSync(sumFile, 'utf8'));
  const out = { inputs: { [path.basename(sumFile)]: sha256(fs.readFileSync(sumFile)) }, classes: {} };
  for (const [cls, s] of Object.entries(stored.classes)) {
    const f = path.join(rowsDir, `ca-encounters.${run}.${cls}.jsonl`), bytes = fs.readFileSync(f), rows = parse(bytes);
    if (rows.length !== s.counts.formed) throw new Error(`${run} ${cls}: ${rows.length} stored encounter rows against ${s.counts.formed} formed in its summary`);
    out.inputs[path.basename(f)] = sha256(bytes);
    if (compute) out.classes[cls] = summarize(s.group, cls, rows.map(calibrated), s.counts);
  }
  return out;
}

/** Part 5: the ffm3 run's assessed rows formed as part5-starlink.mjs's summary forms them (the encounters with the truth's closest approach,
 *  by class); the forming must reproduce the stored summary's counts. `only`: one class. */
function part5(only = null) {
  const sumFile = path.join(rowsDir, 'ca.part5.ffm3.json'), stored = JSON.parse(fs.readFileSync(sumFile, 'utf8'));
  const dir = path.join(store, 'part5-ffm3', stored.through);
  const files = fs.readdirSync(dir).filter((f) => /^assessed\.s\d+\.jsonl$/.test(f));
  const hash = crypto.createHash('sha256'), rows = [];
  for (const f of files) { const bytes = fs.readFileSync(path.join(dir, f)); hash.update(bytes); for (const r of parse(bytes)) rows.push(r); }
  const ok = rows.filter((r) => !r.setAside && !r.truth?.error);
  const asEncounter = (r) => ({ k: r.id, L: 'all', primary: `${r.a}|${r.b}`, primaryObject: String(r.a), trueMissM: r.truth.missM, arms: Object.fromEntries(Object.entries(r.arms).map(([arm, x]) => [arm, x.pcError ? { predictedMissM: x.predictedMissM ?? null, pc: null } : { predictedMissM: x.predictedMissM, pc: x.pc }])) });
  const out = { through: stored.through, inputs: { [path.basename(sumFile)]: sha256(fs.readFileSync(sumFile)), assessed: hash.digest('hex'), assessedFiles: files.length }, classes: {} };
  for (const [cls, f] of [['unmaneuvered', (r) => !r.maneuvered], ['maneuvered', (r) => r.maneuvered]]) {
    if (only && cls !== only) continue;
    const s = stored.classes[cls], list = ok.filter(f).map(asEncounter);
    const leftOut = list.filter((r) => ['ffm', 'sgp4xp'].some((arm) => r.arms[arm]?.pc == null)).length; // A5's pair, as its summary left out
    if (list.length !== s.counts.formed || leftOut !== s.counts.leftOut) throw new Error(`part 5 ${cls}: formed ${list.length} with ${leftOut} left out, against the stored summary's ${s.counts.formed} and ${s.counts.leftOut}`);
    out.classes[cls] = summarize(s.group, cls, list.map(calibrated), { attempted: list.length, noPrimary: 0, noSecondary: 0 }, { leads: ['all'] });
  }
  return out;
}

if (args.check) {
  const file = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const now = { ...Object.fromEntries(PART4.map((run) => [run, part4(run, false)])), 'part5.ffm3': part5('maneuvered') };
  const stale = Object.entries(now).filter(([run, x]) => JSON.stringify(x.inputs) !== JSON.stringify(file.runs[run]?.inputs)).map(([run]) => run);
  const same = JSON.stringify(now['part5.ffm3'].classes.maneuvered) === JSON.stringify(file.runs['part5.ffm3'].classes.maneuvered);
  if (stale.length) console.error(`B2 check: A13 part 9: the inputs of ${stale.join(', ')} changed since rows/ca.a13-a5.json`);
  console.error(same ? `B2 check: A13 part 9 part 5 maneuvered cell replayed (${now['part5.ffm3'].classes.maneuvered.encounters} encounters)` : 'B2 check: A13 part 9 part 5 maneuvered cell differs from rows/ca.a13-a5.json');
  process.exit(same && !stale.length ? 0 : 1);
}

const runs = {};
for (const run of PART4) { const t0 = Date.now(); runs[run] = part4(run, true); console.error(`A13 part 9 ${run}: ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
{ const t0 = Date.now(); runs['part5.ffm3'] = part5(); console.error(`A13 part 9 part5.ffm3: ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
write(FILE, { rule: 'A13 part 9 (part 1 point 4): A5\'s figures for the calibrated covariance; summarize unchanged, FFM-cal in A5\'s FFM slot and SGP4-XP-cal in its SGP4-XP slot, an encounter where either has no Pc left out (A7 per pair), the registered seeds', slots: SLOTS,
  code: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(), runs });
console.error(`A13 part 9: ${FILE}`);
