// B2's E2E (PLAN.md, Outputs): `node experiments/sdn-ap-mixed-screening/run.mjs --check` reruns the first scored window of every part (the ISS
// file, the laser cutoff, the Starlink satellite) through its own step into a scratch store, compares every bin with the stored row, and
// regenerates the table to compare with the committed table.json. Without the local records it says so and fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { store, frozen, readJsonl, dir, config, registeredMs } from './common.mjs';

frozen();
const rowsOf = (prefix, s = store) => { const d = path.join(s, 'rows'); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).flatMap((f) => readJsonl(path.join(d, f))) : []; };
if (!rowsOf('iss.').length) { console.error('B2 check: no local rows under the store; the check cannot pass without them'); process.exit(1); }
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'b2-check-'));
const step = (script, extra, env = {}) => execFileSync(process.execPath, [path.join(dir, script), ...extra], { env: { ...process.env, B2_STORE: scratch, ...env }, stdio: ['ignore', 'ignore', 'inherit'] });
const close = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
let bad = 0;
const compare = (label, now, old) => {
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
step('part1-iss.mjs', ['--shard', `${headers.findIndex((h) => h.date === issOld.file)}/${headers.length}`, '--limit', '1']);
compare(`iss ${issOld.file}`, rowsOf('iss.', scratch).find((r) => r.file === issOld.file) ?? {}, issOld);
// laser: the first cutoff with scores
const laserOld = rowsOf('laser.').filter((r) => r.arms && !r.arms.error).sort((a, b) => a.norad - b.norad || Date.parse(a.cutoff) - Date.parse(b.cutoff))[0];
if (laserOld) {
  const all = rowsOf('laser.').sort((a, b) => a.norad - b.norad || Date.parse(a.cutoff) - Date.parse(b.cutoff));
  step('part2-laser.mjs', ['--shard', `${all.findIndex((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff)}/${all.length}`, '--limit', '1']);
  compare(`laser ${laserOld.target} ${laserOld.cutoff}`, rowsOf('laser.', scratch).find((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff) ?? {}, laserOld);
}
// Starlink: the first satellite with scores (its SDN-AP and SGP4-XP fit, its FFM fit (A3), then its score, the forecast sample linked in)
const starOld = rowsOf('starlink-score.').filter((r) => r.arms).sort((a, b) => a.norad - b.norad)[0];
if (starOld) {
  fs.mkdirSync(path.join(scratch, 'rows'), { recursive: true });
  if (fs.existsSync(path.join(store, 'forecast'))) fs.symlinkSync(path.join(store, 'forecast'), path.join(scratch, 'forecast'));
  const S = config.part1.starlink;
  const cycleMs = (id) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'));
  const fcCycle = fs.readdirSync(S.captureRoot).filter((d) => /^\d{4}-\d\d-\d\dT/.test(d)).sort().find((c) => cycleMs(c) > registeredMs()); // as part1-starlink.mjs chooses it
  const all = fs.readdirSync(path.join(S.captureRoot, fcCycle)).filter((f) => /^\d+\.json\.gz$/.test(f)).map((f) => Number(f.split('.')[0])).sort((a, b) => a - b);
  const shard = ['--shard', `${all.indexOf(starOld.norad)}/${all.length}`, '--limit', '1'];
  step('part1-starlink.mjs', ['--phase', 'fit', ...shard]);
  step('part1-starlink.mjs', ['--phase', 'ffm', ...shard]);
  step('part1-starlink.mjs', ['--phase', 'score', ...shard]);
  compare(`starlink ${starOld.norad}`, rowsOf('starlink-score.', scratch).find((r) => r.norad === starOld.norad) ?? {}, starOld);
}
const { build, sameAsCommitted } = await import('./table.mjs');
if (!sameAsCommitted(build())) { console.error('B2 check: the table regenerated from the stored rows differs from the committed table.json'); bad += 1; }
fs.rmSync(scratch, { recursive: true, force: true });
console.error(bad ? `B2 check: FAIL (${bad})` : 'B2 check: PASS');
process.exit(bad ? 1 : 0);
