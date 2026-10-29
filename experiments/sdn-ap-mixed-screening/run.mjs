// B2's E2E (PLAN.md, Outputs): `node experiments/sdn-ap-mixed-screening/run.mjs --check` reruns the first scored window of every part (the ISS
// file with its FFM arm, A5; the laser cutoff; the Starlink satellite of the latest score pass, its SGP4-XP and FFM fits and its score at the
// same capture cycle, A5) through its own step into a scratch store, compares every bin with the stored row, and regenerates the table to
// compare with the committed table.json. Without the local records it says so and fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { store, frozen, readJsonl, dir } from './common.mjs';

frozen();
const rowsOf = (prefix, s = store) => { const d = path.join(s, 'rows'); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).flatMap((f) => readJsonl(path.join(d, f))) : []; };
if (!rowsOf('iss.').length) { console.error('B2 check: no local rows under the store; the check cannot pass without them'); process.exit(1); }
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-check-'));
const step = (script, extra, env = {}) => execFileSync(process.execPath, [path.join(dir, script), ...extra], { env: { ...process.env, B2_STORE: scratch, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
const close = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
// lead records (A5, A6): every number of every lead of every arm, against the stored record
const sameLeads = (label, now, old) => {
  const flat = (o, prefix = '') => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, `${prefix}.${k}`)) : [[prefix, o]]);
  const a = new Map(flat(now)), b = flat(old);
  const bad1 = b.filter(([k, v]) => (typeof v === 'number' ? !close(a.get(k), v) : a.get(k) !== v));
  if (!b.length || bad1.length || a.size !== b.length) { console.error(`B2 check: ${label}: ${bad1.length} of ${b.length} fields differ${bad1.length ? ` (${bad1[0][0]})` : ''}`); bad += 1; } else console.error(`B2 check: ${label} replayed (${b.length} fields)`);
};
let bad = 0;
const compare = (label, now, old) => {
  if (!Object.values(old.arms ?? {}).some((o) => o?.ok)) { console.error(`B2 check: ${label}: the stored row has no scored arm`); bad += 1; return; }
  for (const [arm, o] of Object.entries(old.arms ?? {})) {
    if (typeof o !== 'object' || !o?.ok) continue;
    for (const [b, v] of Object.entries(o.bins ?? {})) if (!close(now.arms?.[arm]?.bins?.[b]?.rmsKm, v.rmsKm)) { console.error(`B2 check: ${label} ${arm} bin ${b}: ${now.arms?.[arm]?.bins?.[b]?.rmsKm} against stored ${v.rmsKm}`); bad += 1; }
  }
  console.error(`B2 check: ${label} replayed`);
};
// ISS: the first file with scores
const { archiveHeaders } = await import(path.join(dir, '../sdn-gp-starlink-ffm-match/lib/iss-windows.mjs'));
const headers = archiveHeaders();
const issOld = rowsOf('iss.').filter((r) => r.arms).sort((a, b) => (a.file < b.file ? -1 : 1))[0];
const issShard = ['--shard', `${headers.findIndex((h) => h.date === issOld.file)}/${headers.length}`, '--limit', '1'];
step('part1-iss.mjs', ['--phase', 'arms', ...issShard]);
compare(`iss ${issOld.file}`, rowsOf('iss.', scratch).find((r) => r.file === issOld.file) ?? {}, issOld);
// ISS's FFM arm (A5): the same window through the ffm phase
const issFfmOld = rowsOf('iss-ffm.').find((r) => r.file === issOld.file);
if (!issFfmOld) { console.error(`B2 check: iss ${issOld.file}: no stored FFM row`); bad += 1; } else {
  step('part1-iss.mjs', ['--phase', 'ffm', ...issShard]);
  const now = rowsOf('iss-ffm.', scratch).find((r) => r.file === issOld.file) ?? {};
  compare(`iss ${issOld.file} FFM`, { arms: { ffm: now.ffm } }, { arms: { ffm: issFfmOld.ffm } });
}
// ISS's lead records (A5) of the same window, and the GP record (A6) of the first window that has one
const issLeadsOld = rowsOf('iss-leads.').find((r) => r.file === issOld.file);
if (issLeadsOld) {
  step('part1-iss.mjs', ['--phase', 'leads', ...issShard]);
  sameLeads(`iss ${issOld.file} lead records`, rowsOf('iss-leads.', scratch).find((r) => r.file === issOld.file), issLeadsOld);
  // A13: the same window's iss-ffm3 fit and its lead records with A5's and the calibrated covariances
  const issL3Old = rowsOf('iss-leads3.').find((r) => r.file === issOld.file);
  if (issL3Old) {
    step('part1-iss.mjs', ['--phase', 'ffm3', ...issShard]);
    step('part1-iss.mjs', ['--phase', 'leads3', ...issShard]);
    sameLeads(`iss ${issOld.file} A13 lead records`, rowsOf('iss-leads3.', scratch).find((r) => r.file === issOld.file), issL3Old);
  }
  const gpOld = rowsOf('iss-gp.').filter((r) => r.gp?.leads && Object.keys(r.gp.leads).length).sort((a, b) => (a.file < b.file ? -1 : 1))[0];
  if (gpOld) {
    step('part1-iss.mjs', ['--phase', 'gp', '--shard', `${headers.findIndex((h) => h.date === gpOld.file)}/${headers.length}`, '--limit', '1']);
    sameLeads(`iss ${gpOld.file} GP record`, rowsOf('iss-gp.', scratch).find((r) => r.file === gpOld.file), gpOld);
  }
}
// laser: the first cutoff with scores
const laserOld = rowsOf('laser.').filter((r) => r.arms && !r.arms.error).sort((a, b) => a.norad - b.norad || Date.parse(a.cutoff) - Date.parse(b.cutoff))[0];
if (laserOld) {
  const all = rowsOf('laser.').sort((a, b) => a.norad - b.norad || Date.parse(a.cutoff) - Date.parse(b.cutoff));
  step('part2-laser.mjs', ['--shard', `${all.findIndex((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff)}/${all.length}`, '--limit', '1']);
  compare(`laser ${laserOld.target} ${laserOld.cutoff}`, rowsOf('laser.', scratch).find((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff) ?? {}, laserOld);
  const laserShard = ['--shard', `${all.findIndex((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff)}/${all.length}`, '--limit', '1'];
  for (const [phase, prefix] of [['leads', 'laser-leads.'], ['gp', 'laser-gp.'], ['leads3', 'laser-leads3.']]) {
    const old = rowsOf(prefix).find((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff);
    if (!old) continue;
    step('part2-laser.mjs', ['--phase', phase, ...laserShard]);
    sameLeads(`laser ${laserOld.target} ${laserOld.cutoff} ${phase}`, rowsOf(prefix, scratch).find((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff), old);
  }
}
// Starlink: the first satellite with scores in the latest score pass (its SGP4-XP fit and FFM fit, then its score at the same capture cycle,
// the forecast sample linked in)
const passes = [...new Set(fs.readdirSync(path.join(store, 'rows')).map((f) => /^starlink-score\.(.+)\.s\d+\.jsonl$/.exec(f)?.[1]).filter(Boolean))].sort();
const starOld = passes.length ? rowsOf(`starlink-score.${passes.at(-1)}.`).filter((r) => r.arms).sort((a, b) => a.norad - b.norad)[0] : null;
if (starOld) {
  fs.mkdirSync(path.join(scratch, 'rows'), { recursive: true });
  if (fs.existsSync(path.join(store, 'forecast'))) fs.symlinkSync(path.join(store, 'forecast'), path.join(scratch, 'forecast'));
  fs.copyFileSync(path.join(store, 'forecast-sample.json'), path.join(scratch, 'forecast-sample.json'));
  const { forecastCycle } = await import('./part1-starlink.mjs'); // as the step chooses it
  const { config } = await import('./common.mjs');
  const all = fs.readdirSync(path.join(config.part1.starlink.captureRoot, forecastCycle)).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => Number(f.split('.')[0])).sort((a, b) => a - b);
  const shard = ['--shard', `${all.indexOf(starOld.norad)}/${all.length}`, '--limit', '1'];
  step('part1-starlink.mjs', ['--phase', 'fit', ...shard]);
  step('part1-starlink.mjs', ['--phase', 'ffm', ...shard]);
  // A12's arms: the same satellite's ffm3 and XP-LN fits through the fit-only reader (the scratch store holds its one A3 row), against the stored fit rows
  for (const [phase, key] of [['ffm3', 'ffm3'], ['xpln', 'xpln']]) {
    const old = rowsOf(`starlink-${phase}.`).find((r) => r.norad === starOld.norad);
    if (!old) { console.error(`B2 check: starlink ${starOld.norad}: no stored ${phase} row`); bad += 1; continue; }
    step('part1-starlink.mjs', ['--phase', phase, '--shard', '0/1', '--limit', '1']);
    const now = rowsOf(`starlink-${phase}.`, scratch).find((r) => r.norad === starOld.norad);
    const same = key === 'xpln' ? now?.xpln?.omm === old.xpln.omm : now?.ffm3?.termination === old.ffm3.termination && [...(now?.ffm3?.state ?? []), ...(now?.ffm3?.parameters ?? []).map((q) => q.value)].every((v, i) => close(v, [...old.ffm3.state, ...old.ffm3.parameters.map((q) => q.value)][i]));
    if (!same) { console.error(`B2 check: starlink ${starOld.norad} ${phase} fit differs from the stored row`); bad += 1; } else console.error(`B2 check: starlink ${starOld.norad} ${phase} fit replayed`);
  }
  step('part1-starlink.mjs', ['--phase', 'score', '--through', starOld.through, ...shard]);
  // the same satellite's lead records (A5, with ffm3 and A13's calibrated covariances)
  const leadOld = rowsOf('starlink-leads.').find((r) => r.norad === starOld.norad);
  if (leadOld) {
    step('part1-starlink.mjs', ['--phase', 'leads', '--through', leadOld.through, ...shard]);
    sameLeads(`starlink ${starOld.norad} lead records`, rowsOf('starlink-leads.', scratch).find((r) => r.norad === starOld.norad), leadOld);
  }
  compare(`starlink ${starOld.norad} at ${starOld.through}`, rowsOf(`starlink-score.${starOld.through}.`, scratch).find((r) => r.norad === starOld.norad) ?? {}, starOld);
} else console.error('B2 check: part 1a has no score pass in the store yet, so the table has no part 1a row to replay');
// parts 3 and 4 (A5 to A7): each group's summary must rest on the current lead and GP rows, and its first encounters must replay
// A12: Starlink also with ffm3 in the FFM slot (ca.starlink.ffm3.json; the same draws as the group's)
const { A13RUNS } = await import('./part4-ca.mjs');
const caGroups = [...[['iss', 'ffm'], ['laser', 'ffm']].map(([g, f]) => ({ g, f, label: g })), ...Object.entries(A13RUNS).map(([label, run]) => ({ g: run.group, f: run.ffm, label, run }))]
  .filter(({ label }) => fs.existsSync(path.join(store, 'rows', `ca.${label}.json`)));
if (caGroups.length) {
  const { windowsOf } = await import('./part4-ca.mjs');
  const CA = await import('./lib/ca.mjs');
  const { loadModule } = await import(path.join(dir, '../../harness/modules.mjs'));
  const { modulesRoot } = await import(path.join(dir, '../sdn-gp-starlink-ffm-match/lib/modules.mjs'));
  const caModule = await loadModule(modulesRoot(), 'analysis/conjunction-assessment');
  const pc = CA.pcClient(caModule);
  for (const { g, f, label, run } of caGroups) {
    const summary = JSON.parse(fs.readFileSync(path.join(store, 'rows', `ca.${label}.json`), 'utf8'));
    const { windows, inputs } = windowsOf(g, f, run ?? null);
    if (inputs !== summary.inputs) { console.error(`B2 check: part 4 ${g}: the lead rows changed since its summary`); bad += 1; continue; }
    for (const cls of Object.keys(summary.classes)) {
      const stored = new Map(readJsonl(path.join(store, 'rows', `ca-encounters.${label}.${cls}.jsonl`)).map((r) => [r.k, r]));
      const { rows } = await CA.encounters(g, cls, windows, pc, { limit: 25, extraArms: Object.keys(run?.extras ?? {}) });
      for (const r of rows) for (const [arm, a] of Object.entries(r.arms)) {
        const o = stored.get(r.k)?.arms?.[arm];
        if (!o || !close(a.predictedMissM, o.predictedMissM) || (a.pc != null || o.pc != null) && !(a.pc === o.pc || close(a.pc, o.pc))) { console.error(`B2 check: part 4 ${label} ${cls} encounter ${r.k} ${arm}: ${JSON.stringify(a)} against stored ${JSON.stringify(o)}`); bad += 1; }
      }
      console.error(`B2 check: part 4 ${label} ${cls}: ${rows.length} encounters replayed`);
    }
  }
}
// part 5 (A8, A9): the first assessed encounter, re-assessed from the stored states and covariances (A3 as registered, and A12's ffm3)
for (const ffm of ['ffm', 'ffm3']) {
  const p5 = path.join(store, 'rows', ffm === 'ffm' ? 'ca.part5.json' : `ca.part5.${ffm}.json`);
  if (!fs.existsSync(p5)) continue;
  const { through } = JSON.parse(fs.readFileSync(p5, 'utf8'));
  const pdir = path.join(store, ffm === 'ffm' ? 'part5' : `part5-${ffm}`, through);
  const first = fs.readdirSync(pdir).filter((f) => /^assessed\.s\d+\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(pdir, f))).sort((a, b) => a.id - b.id)[0];
  const file = path.join(scratch, `part5-replay.${ffm}.jsonl`);
  execFileSync(process.execPath, [path.join(dir, 'part5-starlink.mjs'), '--through', through, '--ffm', ffm, '--phase', 'assess', '--only', String(first.id), '--out', file], { stdio: ['ignore', 'ignore', 'inherit'] });
  sameLeads(`part 5 (${ffm}) encounter ${first.id}`, readJsonl(file)[0], first);
}
const { build, sameAsCommitted } = await import('./table.mjs');
if (!sameAsCommitted(build())) { console.error('B2 check: the table regenerated from the stored rows differs from the committed table.json'); bad += 1; }
fs.rmSync(scratch, { recursive: true, force: true });
console.error(bad ? `B2 check: FAIL (${bad})` : 'B2 check: PASS');
process.exit(bad ? 1 : 0);
