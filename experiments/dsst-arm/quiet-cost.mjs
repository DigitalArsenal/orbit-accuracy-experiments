#!/usr/bin/env node
// The report-only quiet-machine cost check (SDN-AP, 2026-11-06; RUNLOG.md, note 2026-11-06 (quiet cost check)): on Apple Silicon a single
// thread under load can be scheduled onto efficiency cores, inflating its CPU seconds. After the cost phase, with every accuracy JVM held
// paused (the governor's hold list) and the other lanes held, five cost windows run again, one at a time, on the same fixed 12 GiB heap
// and the same runner, each started only when the 1-minute load is at or under 22.83 (recorded). The windows, chosen by a rule fixed before
// any quiet figure: the five regimes with the most scored cost rows (ties by name), and in each the median window of the loaded rows by
// CPU per object-day (fit CPU per object-day of the arc plus flight CPU per object-day flown; the lower middle when even, ties by key).
// Quiet rows go to quiet-cost/ beside the cost store, never into a table directly; the per-regime ratio, quiet over loaded, is printed and
// written to quiet-cost/summary.json. Within 10 % the loaded rows stand; otherwise the published cost scales by the ratio and says so
// (a regime without a quiet window by the median of the five). A window whose load is still above 22.83 after a 30-minute wait runs
// nothing: the status is "not quiet, undecided", the hold is released and the exit is 2, so the caller retries at a lower-load moment;
// a measurement above the ceiling never serves as the quiet reference. The hold's length, warm-ups included, is printed and recorded.
//   node experiments/dsst-arm/quiet-cost.mjs [--dry]   --dry prints the five windows and holds nothing
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const STORE = '/opt/data/sdn-archive/operator-theory/dsst-arm', QUIET = path.join(STORE, 'quiet-cost');
const LANE = '/Users/tj/software/terrain-work/body-look/claude-dsst-d9', HOLD = `${LANE}/run2/hold.pids`;
const LOAD_MAX = 22.83, REGIMES = 5, AGREE = 0.10, LOAD_WAIT_MS = 30 * 60000;
const DRY = process.argv.includes('--dry');
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const metric = (r) => r.cost.fitCpuS / (r.fit / 24) + r.cost.flightCpuS / r.cost.objectDays;

// the loaded rows and the five windows
const loaded = fs.readdirSync(STORE).filter((f) => /^rows-.*-cost\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(STORE, f), 'utf8').split('\n').filter(Boolean).map((l) => ({ ...JSON.parse(l), file: f })))
  .filter((r) => !r.failed && !r.unscored && r.cost?.heapBound === '12g' && Number.isFinite(metric(r)));
const byRegime = new Map();
for (const r of loaded) (byRegime.get(r.regime) ?? byRegime.set(r.regime, []).get(r.regime)).push(r);
const regimes = [...byRegime].sort(([a, x], [b, y]) => y.length - x.length || a.localeCompare(b)).slice(0, REGIMES);
const picks = regimes.map(([regime, list]) => { const s = [...list].sort((a, b) => metric(a) - metric(b) || a.key.localeCompare(b.key)); return { regime, n: list.length, row: s[Math.floor((s.length - 1) / 2)] }; });
if (!picks.length) console.log('no rows: no scored cost row on the 12 GiB heap yet');
for (const p of picks) console.log(`${p.regime}: ${p.row.key} fit ${p.row.fit} h (${p.row.store}), loaded ${metric(p.row).toFixed(3)} CPU s per object-day, median of ${p.n}`);
if (DRY) process.exit(0);
if (picks.length < REGIMES) throw new Error(`only ${picks.length} regimes hold scored cost rows`);

// hold every accuracy JVM (the governor's rule: a java child of this lane's fit runners)
const ps = (field, pid) => { try { return execFileSync('ps', ['-o', `${field}=`, '-p', String(pid)]).toString().trim(); } catch { return ''; } };
const accuracyJvms = () => fs.readdirSync(`${LANE}/run`).filter((d) => !d.endsWith('-cost') && fs.existsSync(`${LANE}/run/${d}/pids.txt`))
  .flatMap((d) => fs.readFileSync(`${LANE}/run/${d}/pids.txt`, 'utf8').split(/\s+/).filter(Boolean))
  .filter((p) => ps('comm', p).endsWith('bin/java') && /orbit-accuracy-experiments-dsst\/experiments\/dsst-arm\/.*-fits\.mjs/.test(ps('command', ps('ppid', p))));
const before = fs.existsSync(HOLD) ? fs.readFileSync(HOLD, 'utf8') : '';
const held = accuracyJvms();
fs.writeFileSync(HOLD, `${held.join('\n')}\n`);
const deadline = Date.now() + 120000;
while (!held.every((p) => ps('state', p).startsWith('T') || !ps('state', p))) { if (Date.now() > deadline) throw new Error(`accuracy JVMs not all paused: ${held.join(' ')}`); execFileSync('sleep', ['2']); }
const heldAt = Date.now();
console.log(`held ${held.length} accuracy JVMs: ${held.join(' ')}`);

// one window at a time, through a copy of its runner that writes to quiet-cost/ and runs that window alone; a window whose load is still
// above the ceiling after the wait runs nothing: the check stops "not quiet, undecided" and the caller retries at a lower-load moment
const results = [];
let notQuiet = null;
try {
  fs.mkdirSync(QUIET, { recursive: true });
  for (const p of picks) {
    const pair = p.row.store.startsWith('ap/b0411/'), iss = pair && p.row.key.startsWith('iss|');
    const source = path.join(here, pair ? 'pair-fits.mjs' : 'truth-fits.mjs'), copy = path.join(here, `.quiet-${path.basename(source)}`);
    let text = fs.readFileSync(source, 'utf8');
    const patch = (from, to) => { if (text.split(from).length !== 2) throw new Error(`${path.basename(source)}: patch point not found once: ${from.slice(0, 60)}`); text = text.replace(from, to); };
    if (pair) {
      patch("const OUT = path.join(ROOT, 'dsst-arm');", `const OUT = '${QUIET}';`);
      patch('/claude-dsst-d9/run/${TAG}', '/claude-dsst-d9/run-quiet/${TAG}');
      patch('  jobs.splice(LIMIT);', '  jobs.splice(0, jobs.length, ...jobs.filter((j) => `${j.key}@${j.fit}` === process.env.DSST_QUIET_JOB));');
    } else {
      patch("const OUT = '/opt/data/sdn-archive/operator-theory/dsst-arm';", `const OUT = '${QUIET}';`);
      patch('/claude-dsst-d9/run/${', '/claude-dsst-d9/run-quiet/${');
      patch('.slice(0, LIMIT);', '.filter((j) => `${j.w.key}@${j.hours}` === process.env.DSST_QUIET_JOB);');
    }
    const waitFrom = Date.now();
    while (os.loadavg()[0] > LOAD_MAX && Date.now() - waitFrom < LOAD_WAIT_MS) execFileSync('sleep', ['10']);
    const load = os.loadavg()[0];
    if (load > LOAD_MAX) { notQuiet = { regime: p.regime, key: p.row.key, fit: p.row.fit, load: Number(load.toFixed(2)) }; console.log(`${p.regime}: 1-minute load ${load.toFixed(2)} above 22.83 after 30 min: nothing run`); break; }
    fs.writeFileSync(copy, text);
    console.log(`${p.regime}: ${p.row.key} fit ${p.row.fit} h, 1-minute load ${load.toFixed(2)}`);
    const env = { ...process.env, DSST_QUIET_JOB: `${p.row.key}@${p.row.fit}`, XP2F_CONTROL: iss || p.row.store === 'ap/b051/truth2' ? '1' : '0', SDN_MODULES_ROOT: process.env.SDN_MODULES_ROOT ?? '/Users/tj/software/private/coordinator-d9/space-data-network-modules-r2' };
    const run = spawnSync(process.execPath, [copy, '--store', p.row.store, '--cost', ...(iss ? ['--iss'] : [])], { cwd: path.resolve(here, '../..'), env, stdio: 'inherit' });
    const quietFile = path.join(QUIET, p.row.file); // the runner names its rows file as the loaded run did
    const quiet = fs.existsSync(quietFile) ? fs.readFileSync(quietFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.key === p.row.key && r.fit === p.row.fit && !r.failed) : null;
    results.push({ regime: p.regime, key: p.row.key, fit: p.row.fit, store: p.row.store, exit: run.status, loadBefore: Number(load.toFixed(2)), loadGateMet: load <= LOAD_MAX,
      runnerSha256: sha256(fs.readFileSync(source)), copySha256: sha256(text),
      loaded: { cpuPerObjectDay: metric(p.row), fitCpuS: p.row.cost.fitCpuS, flightCpuS: p.row.cost.flightCpuS, load1: p.row.cost.load1 },
      quiet: quiet ? { cpuPerObjectDay: metric(quiet), fitCpuS: quiet.cost.fitCpuS, flightCpuS: quiet.cost.flightCpuS, load1: quiet.cost.load1, writtenAt: quiet.writtenAt } : null });
    fs.rmSync(copy, { force: true });
  }
} finally {
  fs.writeFileSync(HOLD, before);
  console.log(`hold list restored (${before.trim() ? before.trim().split(/\s+/).length : 0} PIDs); accuracy JVMs held ${((Date.now() - heldAt) / 60000).toFixed(1)} min, warm-ups included`);
}
const pauseMinutes = Number(((Date.now() - heldAt) / 60000).toFixed(1));
if (notQuiet) {
  fs.writeFileSync(path.join(QUIET, 'summary.json'), `${JSON.stringify({ status: 'not quiet, undecided', window: notQuiet, completed: results.length, pauseMinutes, loadMax: LOAD_MAX }, null, 1)}\n`);
  console.log('not quiet, undecided: no measurement above the ceiling serves as the quiet reference; retry at a lower-load moment');
  process.exit(2);
}

const rows = results.map((r) => ({ ...r, ratio: r.quiet ? Number((r.quiet.cpuPerObjectDay / r.loaded.cpuPerObjectDay).toFixed(4)) : null }));
for (const r of rows) r.agrees = r.ratio !== null && Math.abs(r.ratio - 1) <= AGREE;
const summary = { status: 'decided', pauseMinutes, rule: 'five regimes with the most scored cost rows (ties by name); in each the median loaded window by fit CPU per object-day of the arc plus flight CPU per object-day flown (lower middle, ties by key); quiet run one window at a time on the fixed 12 GiB heap at a 1-minute load at or under 22.83, accuracy JVMs held; agreement within 10 %', loadMax: LOAD_MAX, rows,
  verdict: rows.every((r) => r.agrees) ? 'the loaded rows stand' : 'the published cost scales by the quiet-over-loaded ratio per regime' };
fs.writeFileSync(path.join(QUIET, 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
console.log('| Regime | Window | Load before | Loaded CPU s / object-day | Quiet | Quiet / loaded |');
console.log('|---|---|---:|---:|---:|---:|');
for (const r of rows) console.log(`| ${r.regime} | ${r.key} @ ${r.fit} h | ${r.loadBefore} | ${r.loaded.cpuPerObjectDay.toFixed(3)} | ${r.quiet ? r.quiet.cpuPerObjectDay.toFixed(3) : 'none'} | ${r.ratio ?? ''} |`);
console.log(summary.verdict);
