// B1 runner: every window of config.rows through the baseline arms (PLAN.md, Arms), one JSON line per window under <store>/rows/<regime>.s<k>.jsonl
// (statistics only). Re-running skips windows already present.
//   node experiments/sdn-ap-baselines/run.mjs [--shard k/n] [--regime a,b] [--limit n]
//   node experiments/sdn-ap-baselines/run.mjs --check     (the E2E: the first window of every row rescored through every arm against its stored row,
//                                                        and the table regenerated from the stored rows against the committed table.json)
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, frozen, readJsonl, g1Dir } from './common.mjs';
import { collectWindows, countCheck } from './lib/windows.mjs';

frozen();
const windows = collectWindows();
const differ = countCheck(windows);
if (differ.length) throw new Error(`registered window counts differ: ${JSON.stringify(differ)}`);

const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
const { openContainers } = await import(path.join(g1Dir, 'lib/containers.mjs'));
const { openTime } = await import(path.join(g1Dir, 'lib/timeconv.mjs'));
const { truthLoader } = await import('./lib/truth.mjs');
const A = await import('./lib/arms.mjs');

const modules = modulesRoot();
const head = (await import('node:child_process')).execFileSync('git', ['-C', modules, 'rev-parse', 'HEAD']).toString().trim();
if (head !== config.modules.commit) throw new Error(`modules checkout ${modules} is at ${head}, not the registered ${config.modules.commit}`);
const a = await A.openArms(modules);
const containers = await openContainers(modules), time = await openTime(modules);
const truth = truthLoader({ modules, containers, time });

/** One window through every arm. */
export async function scoreWindow(w) {
  const base = { regime: w.regime, row: w.row, source: w.source, id: w.id, norad: w.norad, startUtc: w.startUtc, fitSeconds: w.fitSeconds, key: w.key };
  const t = await truth.get(w);
  if (w.center === 'SUN') return { ...base, sgp4: A.notApplicable('Earth-centered theory'), sgp4xp: A.notApplicable('Earth-centered theory'), ffm: A.notApplicable(config.ffm.notRun.SUN) };
  if (w.center === 'MOON') return { ...base, sgp4: A.notApplicable('Earth-centered theory'), sgp4xp: A.notApplicable('Earth-centered theory'), ffm: await A.armFfmMoon(a, w, t.loaded) };
  const win = A.earthWindow(t.object, w);
  const row = { ...base, states: win.lines.length, stepSeconds: win.stepSeconds };
  row.sgp4 = await A.armSgp4(a, t.object, win);
  row.sgp4xp = await A.armSgp4xp(a, t.object, win);
  row.ffm = await A.armFfmEarth(a, t.object, win);
  if (w.source === 'starlink-ffm') { // the identity check of PLAN.md (not an arm): FFM with the truth's own B_eff and Cr*A/m
    const id = await A.armFfmEarth(a, t.object, win, { cdAm: t.meta.fit.bEffM2Kg, crAm: t.meta.fit.crAm, basis: 'truth parameters' });
    row.ffmIdentity = id;
  }
  return row;
}

const rowsDir = path.join(store, 'rows');
const stored = () => new Map(fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readJsonl(path.join(rowsDir, f))).map((r) => [r.key, r]) : []);

if (args.check) {
  const have = stored();
  if (!have.size) { console.error('B1 check: no local rows under the store; the check cannot pass without them'); process.exit(1); }
  const firsts = config.rows.map((r) => windows.find((w) => w.regime === r.regime));
  const close = (x, y) => (x == null && y == null) || (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y)));
  let bad = 0;
  for (const w of firsts) {
    const old = have.get(w.key);
    if (!old) { console.error(`B1 check: ${w.regime} ${w.key}: not in the store`); bad += 1; continue; }
    const now = await scoreWindow(w);
    for (const arm of ['sgp4', 'sgp4xp', 'ffm']) {
      for (const k of config.scoring.leadDays) {
        const x = now[arm]?.days?.[k]?.rmsKm, y = old[arm]?.days?.[k]?.rmsKm;
        if (!close(x, y) || Boolean(now[arm]?.ok) !== Boolean(old[arm]?.ok)) { console.error(`B1 check: ${w.regime} ${arm} day ${k}: ${x} against stored ${y}`); bad += 1; }
      }
    }
    console.error(`B1 check: ${w.regime} replayed`);
  }
  const { build, sameAsCommitted } = await import('./table.mjs');
  if (!sameAsCommitted(build())) { console.error('B1 check: the table regenerated from the stored rows differs from the committed table.json'); bad += 1; }
  await a.close(); await containers.destroy(); await time.destroy();
  console.error(bad ? `B1 check: FAIL (${bad})` : 'B1 check: PASS');
  process.exit(bad ? 1 : 0);
}

const [k, n] = args.shard ? args.shard.split('/').map(Number) : [0, 1];
const regimes = args.regime ? new Set(args.regime.split(',')) : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const done = stored();
fs.mkdirSync(rowsDir, { recursive: true });
let i = -1, count = 0;
for (const w of windows) {
  i += 1;
  if (i % n !== k || (regimes && !regimes.has(w.regime)) || done.has(w.key)) continue;
  if (count >= limit) break;
  const t0 = Date.now();
  let row;
  try { row = await scoreWindow(w); } catch (error) { row = { regime: w.regime, row: w.row, source: w.source, id: w.id, norad: w.norad, startUtc: w.startUtc, fitSeconds: w.fitSeconds, key: w.key, error: String(error?.stack ?? error).slice(0, 400) }; }
  row.wallSeconds = (Date.now() - t0) / 1000;
  fs.appendFileSync(path.join(rowsDir, `${w.regime}.s${k}.jsonl`), `${JSON.stringify(row)}\n`);
  count += 1;
  if (count % 10 === 0) console.error(`B1 shard ${k}/${n}: ${count} windows`);
}
console.error(`B1 shard ${k}/${n}: ${count} new windows`);
await a.close(); await containers.destroy(); await time.destroy();
process.exit(0);
