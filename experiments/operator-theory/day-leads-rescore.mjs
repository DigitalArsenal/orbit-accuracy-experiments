// DAY-LEADS-RESCORE.md: ap/b051's window sets flown again by their own producers with every lead day 1 to 7 scored, the table of median forward error per
// group, arm and day, and the control (days 1, 2, 3 and 7 equal the stored rows). Module calls only, through the producers.
//   node experiments/operator-theory/day-leads-rescore.mjs --run              every shard of every set (resumable), then --table
//   node experiments/operator-theory/day-leads-rescore.mjs --worker <set> --shard k
//   node experiments/operator-theory/day-leads-rescore.mjs --table [--out <dir>]
//   node experiments/operator-theory/day-leads-rescore.mjs --check            the end to end
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PIN } from './lib/build.mjs';

const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ARCHIVE = '/opt/data/sdn-archive/operator-theory', STORED = path.join(ARCHIVE, 'ap/b051'), OUT = path.join(ARCHIVE, 'day-leads');
const RESULTS = path.join(repo, 'results/ap-truth/day-leads'), PLAN = 'experiments/operator-theory/DAY-LEADS-RESCORE.md';
const SHARDS = 12, WORKERS = 4, LOAD_BELOW = 42, LEADS = [1, 2, 3, 4, 5, 6, 7], CONTROL_DAYS = ['1', '2', '3', '7'];
// Each set as ap/b051 ran it (the 2026-11-04 re-measure): producer, environment, arguments.
const SETS = {
  truth: { script: 'ap-truth.mjs', env: {}, args: ['--arms', 'registered', '--from', '2025-04-01', '--to', '2025-12-21'] },
  truth2: { script: 'ap-truth.mjs', env: { XP2F_CONTROL: '1' }, args: ['--xm', '--from', '2026-01-01', '--to', '2026-05-31'] },
  regimes: { script: 'all-regimes.mjs', env: {}, args: ['--arms', 'AP,XP'] },
  'compare-truth': { script: 'truth-compare.mjs', env: {}, args: ['--arms', 'XP', '--from', '2025-04-01', '--to', '2025-12-21'] },
  'compare-truth2': { script: 'truth-compare.mjs', env: { XP2F_CONTROL: '1' }, args: ['--xm', '--arms', 'XP', '--from', '2026-01-01', '--to', '2026-05-31'] },
};
const PRODUCERS = ['ap-truth.mjs', 'truth-compare.mjs', 'all-regimes.mjs', 'lib/ap.mjs', 'lib/xp2.mjs', 'lib/build.mjs', 'lib/regimes.mjs', 'lib/xm3.mjs'];
const GROUPS = {
  T: 'Low orbit, strong drag, 2025', P: 'Low orbit, strong drag, 2026', S1: 'Low orbit, near 700 km, 2026', GN: 'Medium Earth orbit, 2026',
  LS: 'Low orbit, laser spheres', DO: 'Low orbit, altimetry', GD: 'Laser geodetic', IG: 'Inclined geosynchronous', GE: 'Geostationary', HE: 'Highly elliptical',
};
const FRONT = [['T', ['AP24', 'APRa12', 'XP24']], ['S1', ['AP72', 'AP24', 'XP72', 'XP24']], ['GN', ['AP72', 'XP72']]];
const ARM_NOTE = { AP: 'AP', APRa12: 'AP, 17 h fit, drag held at the stored 12 h FFM fit\'s', XP: 'whiteroom XP (sdn-ap, FORCES and FIT unset)' };
const BUILD = { module: 'propagator/sdn-ap', version: PIN.versions['propagator/sdn-ap'], modulesCommit: PIN.modulesCommit, wasmSha256: PIN.wasmSha256['propagator/sdn-ap'] };
const GALILEO_HELD = [43567, 37847, 41862, 41174, 43055, 41175], SWARM_GRACE = [39451, 39452, 39453, 43476, 43477];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const rowsIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const med = (v) => { const s = [...v].sort((a, b) => a - b); if (!s.length) return null; const x = (s.length - 1) / 2; return (s[Math.floor(x)] + s[Math.ceil(x)]) / 2; };
const km = (x) => (x === null ? null : Number(x.toFixed(6)));
const fmt = (x) => (x === null ? '' : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toPrecision(3));
const groupOf = (set, r) => (set === 'truth' || set === 'compare-truth' ? 'T' : r.group);
const producerHashes = () => Object.fromEntries(PRODUCERS.map((p) => [p, sha256(fs.readFileSync(path.join(here, p)))]));

// ---- worker: one shard of one set, the producer unchanged, every lead day scored.
async function worker(set, k) {
  const s = SETS[set];
  Object.assign(process.env, s.env);
  const { XM } = await import('./lib/xp2.mjs');
  XM.config.scoring.leadDays = LEADS;
  process.argv = [process.argv[0], path.join(here, s.script), ...s.args, '--shard', `${k}/${SHARDS}`, '--out', path.join(OUT, set)];
  await import(pathToFileURL(path.join(here, s.script)).href);
}

// ---- run: every shard, niced; a shard starts while fewer than WORKERS run and the 1-minute load is under LOAD_BELOW, or when none runs (the coordinator's cap).
async function run() {
  fs.mkdirSync(path.join(OUT, 'logs'), { recursive: true });
  const manifestFile = path.join(OUT, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD']).toString().trim();
    fs.writeFileSync(manifestFile, `${JSON.stringify({ startedUtc: new Date().toISOString(), commit: head, runner: sha256(fs.readFileSync(new URL(import.meta.url))), producers: producerHashes(), build: BUILD, modulesRoot: process.env.SDN_MODULES_ROOT ?? null, leadDays: LEADS, sets: SETS }, null, 1)}\n`);
  }
  const jobs = [];
  for (let k = 0; k < SHARDS; k += 1) for (const set of ['truth2', 'compare-truth2', 'truth', 'compare-truth', 'regimes']) jobs.push({ set, k });
  const doneFile = (j) => path.join(OUT, 'logs', `${j.set}-${j.k}.done`);
  const pending = jobs.filter((j) => !fs.existsSync(doneFile(j)));
  const running = new Set(), failed = [];
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  while (pending.length || running.size) {
    if (pending.length && running.size < WORKERS && (os.loadavg()[0] < LOAD_BELOW || running.size === 0)) {
      const j = pending.shift(), log = fs.openSync(path.join(OUT, 'logs', `${j.set}-${j.k}.log`), 'a');
      const child = spawn('nice', ['-n', '10', process.execPath, '--max-old-space-size=3072', path.join(here, 'day-leads-rescore.mjs'), '--worker', j.set, '--shard', String(j.k)], { cwd: repo, stdio: ['ignore', log, log], env: process.env });
      running.add(child);
      console.error(`${new Date().toISOString()} start ${j.set} ${j.k} pid ${child.pid} load ${os.loadavg()[0].toFixed(1)}`);
      child.on('exit', (code) => { running.delete(child); fs.closeSync(log); if (code === 0) fs.writeFileSync(doneFile(j), `${new Date().toISOString()}\n`); else failed.push(`${j.set} ${j.k} exit ${code}`); console.error(`${new Date().toISOString()} exit ${j.set} ${j.k} ${code}`); });
      await nap(3000);
    } else await nap(15000);
  }
  fs.writeFileSync(path.join(OUT, 'run.json'), `${JSON.stringify({ finishedUtc: new Date().toISOString(), failed }, null, 1)}\n`);
  if (failed.length) { console.error(`failed: ${failed.join('; ')}`); process.exit(1); }
  table(RESULTS);
}

// ---- control: days 1, 2, 3 and 7 against the stored rows of ap/b051.
const ROW_FIELDS = ['group', 'norad', 'name', 'cutoff', 'error'], ARM_FIELDS = ['ok', 'error', 'bterm', 'agom', 'rms', 'bHeld'];
function control(set, rows) {
  const stored = new Map(rowsIn(path.join(STORED, set)).map((r) => [r.key, r])), fresh = new Map(rows.map((r) => [r.key, r]));
  const out = { stored: stored.size, flown: fresh.size, missing: 0, extra: 0, armsCompared: 0, scalarsCompared: 0, differing: 0, newlyScored: [], differences: [] };
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const diff = (key, field, a, b) => { out.differing += 1; if (out.differences.length < 20) out.differences.push({ key, field, stored: a ?? null, flown: b ?? null }); };
  for (const key of stored.keys()) if (!fresh.has(key)) { out.missing += 1; diff(key, 'row', 'present', null); }
  for (const [key, b] of fresh) {
    const a = stored.get(key);
    if (!a) { out.extra += 1; diff(key, 'row', null, 'present'); continue; }
    const newly = a.error === 'no lead bin' && !b.error;
    for (const f of ROW_FIELDS) { if (newly && f === 'error') continue; out.scalarsCompared += 1; if (!same(a[f], b[f])) diff(key, f, a[f], b[f]); }
    if (newly) {
      out.newlyScored.push(key);
      for (const [arm, y] of Object.entries(b.arms ?? {})) for (const d of CONTROL_DAYS) { out.scalarsCompared += 1; if (y.days?.[d]) diff(key, `${arm}.days.${d}`, null, y.days[d]); }
      continue;
    }
    for (const arm of new Set([...Object.keys(a.arms ?? {}), ...Object.keys(b.arms ?? {})])) {
      const x = a.arms?.[arm], y = b.arms?.[arm];
      out.armsCompared += 1;
      if (!x || !y) { out.scalarsCompared += 1; diff(key, arm, x ? 'present' : null, y ? 'present' : null); continue; }
      for (const f of ARM_FIELDS) { out.scalarsCompared += 1; if (!same(x[f], y[f])) diff(key, `${arm}.${f}`, x[f], y[f]); }
      for (const d of CONTROL_DAYS) {
        out.scalarsCompared += 1;
        if (!!x.days?.[d] !== !!y.days?.[d]) { diff(key, `${arm}.days.${d}`, x.days?.[d], y.days?.[d]); continue; }
        if (x.days?.[d]) for (const c of ['e', 'r', 't', 'n']) { out.scalarsCompared += 1; if (!same(x.days[d][c], y.days[d][c])) diff(key, `${arm}.days.${d}.${c}`, x.days[d][c], y.days[d][c]); }
      }
    }
  }
  return out;
}

// ---- table: per group and arm, the median error each day 1 to 7 and its count; the control; README.
function table(dir) {
  const groups = new Map(), controls = {}, windows = {};
  for (const set of Object.keys(SETS)) {
    const rows = rowsIn(path.join(OUT, set));
    windows[set] = rows.length;
    controls[set] = control(set, rows);
    for (const r of rows) for (const [arm, a] of Object.entries(r.arms ?? {})) {
      const g = groupOf(set, r), id = `${g}|${arm}`;
      const L = groups.get(id) ?? groups.set(id, { group: g, arm, set, windows: 0, ok: 0, days: Object.fromEntries(LEADS.map((d) => [d, []])) }).get(id);
      L.windows += 1;
      if (!a.ok) continue;
      L.ok += 1;
      for (const d of LEADS) if (a.days?.[d]) L.days[d].push(a.days[d].e);
    }
  }
  const order = Object.keys(GROUPS), armOrder = (a) => [/^AP\d/.test(a) ? 0 : /^APR/.test(a) ? 1 : 2, Number(a.match(/\d+$/)?.[0] ?? 0)];
  const entries = [...groups.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || armOrder(a.arm)[0] - armOrder(b.arm)[0] || armOrder(a.arm)[1] - armOrder(b.arm)[1])
    .map((L) => ({ group: L.group, label: GROUPS[L.group], arm: L.arm, note: ARM_NOTE[L.arm] ?? ARM_NOTE[L.arm.replace(/\d+$/, '')], set: L.set, build: BUILD, windows: L.windows, ok: L.ok,
      days: Object.fromEntries(LEADS.map((d) => [d, { medianKm: km(med(L.days[d])), n: L.days[d].length }])) }));
  const doc = { title: 'Median forward error, lead days 1 to 7', registration: PLAN, store: OUT, stored: STORED, build: BUILD, leadDays: LEADS, windows, control: controls, entries };
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
  const at = (g, arm) => entries.find((e) => e.group === g && e.arm === arm);
  const ctl = Object.entries(controls).map(([s, c]) => `${s} ${c.differing} of ${c.scalarsCompared}`).join(', ');
  const total = Object.values(controls).reduce((n, c) => n + c.differing, 0), newly = Object.values(controls).flatMap((c) => c.newlyScored);
  const lines = ['# Median forward error, lead days 1 to 7', '',
    `\`experiments/operator-theory/DAY-LEADS-RESCORE.md\`. Every arm: \`${BUILD.module}\` ${BUILD.version}, wasm ${BUILD.wasmSha256.slice(0, 12)} (modules ${BUILD.modulesCommit.slice(0, 8)}). Each fit reads the arc ending at the cutoff and nothing after; lead day k is (k - 1, k] days after the cutoff; the error is the RSS of the radial, in-track and cross-track RMS over the day, in km, against precise orbits. Median over the windows where the day is scored (n).`, '',
    `Control, days 1, 2, 3 and 7 against the stored rows (\`ap/b051\`): ${total} differing scalars (${ctl}).${newly.length ? ` Scored now for days 4 to 6 only (no day 1, 2, 3 or 7 bin): ${newly.length} windows.` : ''}`, '',
    '## Day 5, the front page', '', '| Regime | Arm | Day 5 median km | n |', '|---|---|---:|---:|'];
  for (const [g, arms] of FRONT) for (const arm of arms) { const e = at(g, arm); if (e) lines.push(`| ${GROUPS[g]} | ${arm} | ${fmt(e.days[5].medianKm)} | ${e.days[5].n} |`); }
  for (const g of order) {
    const rows = entries.filter((e) => e.group === g);
    if (!rows.length) continue;
    lines.push('', `## ${GROUPS[g]}`, '', '| Arm | Windows | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Day 6 | Day 7 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
    for (const e of rows) lines.push(`| ${e.arm} | ${e.windows} | ${LEADS.map((d) => `${fmt(e.days[d].medianKm)} (${e.days[d].n})`).join(' | ')} |`);
  }
  lines.push('', 'AP24, AP72, AP336: AP fitted to the last 24, 72 or 336 h. APRa12: AP fitted to the last 17 h with its drag held at the stored 12 h FFM fit\'s. XP: whiteroom XP, the same module with FORCES and FIT unset.');
  fs.writeFileSync(path.join(dir, 'README.md'), `${lines.join('\n')}\n`);
  return doc;
}

// ---- check: the end to end.
function check() {
  let failures = 0;
  const ok = (pass, line) => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${line}`); if (!pass) failures += 1; };
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const plan = execFileSync('git', ['-C', repo, 'log', '--format=%H %aI', '--', PLAN]).toString().trim().split('\n').at(-1).split(' ');
  ok(Date.parse(plan[1]) < Date.parse(manifest.startedUtc), `the registration (${plan[0].slice(0, 10)} at ${plan[1]}) precedes the run (${manifest.startedUtc})`);
  const now = producerHashes();
  ok(Object.entries(manifest.producers).every(([p, h]) => now[p] === h) && manifest.build.wasmSha256 === BUILD.wasmSha256, `the rows were flown by the committed producers (${PRODUCERS.length} files by SHA-256) on ${BUILD.module} ${BUILD.version} (${BUILD.wasmSha256.slice(0, 12)})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'day-leads-'));
  const doc = table(tmp);
  for (const f of ['table.json', 'README.md']) ok(fs.existsSync(path.join(RESULTS, f)) && fs.readFileSync(path.join(tmp, f)).equals(fs.readFileSync(path.join(RESULTS, f))), `results/ap-truth/day-leads/${f} reproduces from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const c = Object.entries(doc.control), differing = c.reduce((n, [, x]) => n + x.differing, 0), compared = c.reduce((n, [, x]) => n + x.scalarsCompared, 0);
  ok(differing === 0 && c.every(([, x]) => x.missing === 0 && x.extra === 0), `control: ${differing} of ${compared} scalars differ on days 1, 2, 3 and 7 (${c.map(([s, x]) => `${s} ${x.differing}/${x.scalarsCompared}, ${x.flown} of ${x.stored} windows`).join('; ')})`);
  ok(doc.entries.length > 0 && doc.entries.every((e) => e.build.wasmSha256 === BUILD.wasmSha256), `every arm names its build: ${doc.entries.length} group-arms on ${BUILD.wasmSha256.slice(0, 12)}`);
  const no5 = doc.entries.filter((e) => !(e.days[5].n > 0 && Number.isFinite(e.days[5].medianKm)));
  ok(no5.length === 0, `a day-5 median for every group and arm: ${doc.entries.length - no5.length} of ${doc.entries.length}${no5.length ? ` (none: ${no5.map((e) => `${e.group} ${e.arm}`).join(', ')})` : ''}`);
  const rows = Object.keys(SETS).flatMap((s) => rowsIn(path.join(OUT, s)));
  const bad = rows.filter((r) => GALILEO_HELD.includes(Number(r.norad)) || /starlink/i.test(r.name ?? '') || (SWARM_GRACE.includes(Number(r.norad)) && Date.parse(r.cutoff) + 7 * 86400000 > Date.parse('2026-10-31T00:00:00Z')));
  ok(bad.length === 0, `holds: ${rows.length} rows, none of a held Galileo satellite or a Starlink group, no Swarm or GRACE-FO truth after 2026-10-31`);
  const d5 = FRONT.flatMap(([g, arms]) => arms.map((a) => doc.entries.find((e) => e.group === g && e.arm === a)).filter(Boolean).map((e) => `${e.group} ${e.arm} ${fmt(e.days[5].medianKm)} km (${e.days[5].n})`));
  console.log(`DAY-LEADS-RESCORE: ${failures ? 'FAIL' : 'PASS'}: ${rows.length} windows, control ${differing} of ${compared} scalars differ on days 1, 2, 3, 7; day 5: ${d5.join('; ')}`);
  process.exit(failures ? 1 : 0);
}

if (process.argv.includes('--worker')) await worker(argOf('--worker'), Number(argOf('--shard')));
else if (process.argv.includes('--run')) await run();
else if (process.argv.includes('--table')) { table(argOf('--out') ?? RESULTS); console.log(fs.readFileSync(path.join(argOf('--out') ?? RESULTS, 'README.md'), 'utf8')); }
else if (process.argv.includes('--check')) check();
else { console.error('--run | --worker <set> --shard k | --table [--out dir] | --check'); process.exit(2); }
