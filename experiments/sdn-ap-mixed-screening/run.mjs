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
// laser: the first cutoff with scores
const laserOld = rowsOf('laser.').filter((r) => r.arms && !r.arms.error).sort((a, b) => a.norad - b.norad || Date.parse(a.cutoff) - Date.parse(b.cutoff))[0];
if (laserOld) {
  const all = rowsOf('laser.').sort((a, b) => a.norad - b.norad || Date.parse(a.cutoff) - Date.parse(b.cutoff));
  step('part2-laser.mjs', ['--shard', `${all.findIndex((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff)}/${all.length}`, '--limit', '1']);
  compare(`laser ${laserOld.target} ${laserOld.cutoff}`, rowsOf('laser.', scratch).find((r) => r.norad === laserOld.norad && r.cutoff === laserOld.cutoff) ?? {}, laserOld);
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
  step('part1-starlink.mjs', ['--phase', 'score', '--through', starOld.through, ...shard]);
  compare(`starlink ${starOld.norad} at ${starOld.through}`, rowsOf(`starlink-score.${starOld.through}.`, scratch).find((r) => r.norad === starOld.norad) ?? {}, starOld);
} else console.error('B2 check: part 1a has no score pass in the store yet, so the table has no part 1a row to replay');
const { build, sameAsCommitted } = await import('./table.mjs');
if (!sameAsCommitted(build())) { console.error('B2 check: the table regenerated from the stored rows differs from the committed table.json'); bad += 1; }
fs.rmSync(scratch, { recursive: true, force: true });
console.error(bad ? `B2 check: FAIL (${bad})` : 'B2 check: PASS');
process.exit(bad ? 1 : 0);
