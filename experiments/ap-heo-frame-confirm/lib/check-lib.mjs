// The E2E of a confirmation task: the registration precedes every row, the pins and holds held, the stored table regenerates, one window per kind replays exactly through the modules,
// and every statement is printed with its interval. The statements' verdicts are results; a failed integrity check is the only failure.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { cutoffsOf, dayStr } from './cutoffs.mjs';
import { aggregate, render, readRows } from './table-lib.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const root = path.resolve(new URL('../../..', import.meta.url).pathname);

/** options: { dir ('experiments/<task>'), results ('results/<task>'), registration (commit), replay: [group, ...] (the first window of the group, in key order, whose every arm succeeded), references: [{ group, rows: [{ cutoff, arm, day, meters }], toleranceM }] } */
export async function check({ dir, results, registration, replay = [], references = [] }) {
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
  const gitBytes = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28 });
  const failures = [], note = (ok, why) => { if (!ok) failures.push(why); };
  const cfgFile = path.join(root, dir, 'config.json'), cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
  const store = process.env.CONFIRM_STORE_OVERRIDE ?? cfg.store;
  note(cfg.frozen === true, 'config.json is not frozen');

  // 1. The registration as committed, amendments only at the end of PLAN.md.
  const regTime = Date.parse(git('show', '-s', '--format=%cI', registration));
  note(gitBytes('show', `${registration}:${dir}/config.json`).equals(fs.readFileSync(cfgFile)), 'config.json differs from the registration');
  const plan = gitBytes('show', `${registration}:${dir}/PLAN.md`), now = fs.readFileSync(path.join(root, dir, 'PLAN.md'));
  note(now.length >= plan.length && now.subarray(0, plan.length).equals(plan), 'PLAN.md differs from the registration; an amendment goes at its end');

  // 2. Manifests: written after the registration, by committed sources, on the registered pins.
  const manifests = fs.readdirSync(store).filter((f) => /^manifest-\d+-\d+\.json$/.test(f)).map((f) => ({ f, ...JSON.parse(fs.readFileSync(path.join(store, f), 'utf8')) }));
  note(manifests.length > 0, 'no manifests');
  const configHash = sha256(fs.readFileSync(cfgFile));
  for (const m of manifests) {
    note(!m.smoke && m.task === cfg.task && m.config === configHash, `${m.f}: not a scored run of this registration`);
    note(Date.parse(m.started) >= regTime, `${m.f}: started before the registration`);
    note(spawnSync('git', ['-C', root, 'merge-base', '--is-ancestor', registration, m.commit]).status === 0, `${m.f}: its commit does not descend from the registration`);
    for (const [name, b] of Object.entries(cfg.builds)) note(m.pins[name] === b.sha256, `${m.f}: pin ${name} differs`);
    for (const rel of cfg.sources) note(m.sources[rel] === sha256(gitBytes('show', `${m.commit}:${rel}`)), `${m.f}: ${rel} was not committed unchanged at ${m.commit.slice(0, 9)}`);
  }
  // A source amended during the run (PLAN.md, Amendments) leaves older manifests with the older hash; the newest manifest must carry the files as they are now, and the replays below run the files as they are now.
  const newest = manifests.reduce((a, b) => (Date.parse(b.started) > Date.parse(a.started) ? b : a), manifests[0]);
  for (const rel of cfg.sources) note(newest?.sources[rel] === sha256(fs.readFileSync(path.join(root, rel))), `${rel} changed since the newest manifest ${newest?.f}`);
  const generations = [...new Set(manifests.map((m) => m.commit))];
  for (const [name, b] of Object.entries(cfg.builds)) note(sha256(fs.readFileSync(b.file)) === b.sha256, `build ${name} differs from its pin`);

  // 3. Rows: registered groups and cutoffs, no held object or date, no duplicate, nothing older than the registration, every planned key present.
  const files = fs.readdirSync(store).filter((f) => /^rows-\d+\.jsonl$/.test(f));
  for (const f of files) note(fs.statSync(path.join(store, f)).birthtimeMs >= regTime, `${f}: created before the registration`);
  const rows = readRows(store), keys = new Set(rows.map((r) => r.key));
  note(keys.size === rows.length, 'duplicate rows');
  const barred = new Set(cfg.holds.norads), from = Date.parse(`${cfg.holds.noTruthFrom}T00:00:00Z`);
  for (const r of rows) {
    const g = cfg.groups[r.group];
    note(!!g, `${r.key}: group not registered`);
    if (!g) continue;
    const t = Date.parse(r.cutoff);
    note(cutoffsOf(g.cutoffs).includes(t), `${r.key}: cutoff not registered`);
    note(!barred.has(r.norad), `${r.key}: held object`);
    note(g.exemptFromTimeHold || t + 7 * 86400000 < from, `${r.key}: scores truth on or after ${cfg.holds.noTruthFrom}`);
    for (const a of Object.keys(r.arms)) note(g.arms.some((x) => a.startsWith(x) && /^\d+$/.test(a.slice(x.length))), `${r.key}: unregistered arm ${a}`);
  }
  const planned = new Set(fs.readdirSync(store).filter((f) => /^plan-\d+\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(path.join(store, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key)));
  const missing = [...planned].filter((k) => !keys.has(k));
  note(missing.length === 0, `${missing.length} planned windows have no row (${missing.slice(0, 3).join('; ')})`);
  for (const [id, g] of Object.entries(cfg.groups)) for (const t of cutoffsOf(g.cutoffs)) note(rows.some((r) => r.group === id && Date.parse(r.cutoff) === t), `${id}: no row at registered cutoff ${dayStr(t)}`);

  // 4. The stored table regenerates.
  const metrics = aggregate(cfg, rows), readme = render(cfg, metrics);
  const savedMetrics = path.join(root, results, 'metrics.json'), savedReadme = path.join(root, results, 'README.md');
  if (!process.env.CONFIRM_STORE_OVERRIDE) {
    note(fs.existsSync(savedMetrics) && JSON.stringify(metrics) === JSON.stringify(JSON.parse(fs.readFileSync(savedMetrics, 'utf8'))), 'results metrics.json differs from the table regenerated from the rows');
    note(fs.existsSync(savedReadme) && fs.readFileSync(savedReadme, 'utf8') === readme, 'results README.md differs from the table regenerated from the rows');
  }

  // 5. Replays through the modules: every number of the stored row, exactly.
  let replayedScalars = 0, replayDifferences = 0;
  const replayed = [];
  for (const group of replay) {
    const g = cfg.groups[group], row = rows.find((r) => r.group === group && !r.error && g.arcs.every((h) => g.arms.every((a) => r.arms[`${a}${h}`]?.ok)));
    note(!!row, `replay: no complete row in ${group}`);
    if (!row) continue;
    replayed.push(row.key);
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'confirm-replay-'));
    const run = spawnSync(process.execPath, ['--max-old-space-size=3072', path.join(root, dir, 'run.mjs'), '--out', out, '--smoke', 'true', '--groups', group, '--keys', row.key], { env: process.env, encoding: 'utf8', timeout: 1800000 });
    note(run.status === 0, `replay ${row.key}: ${run.stderr?.slice(-200)}`);
    const fresh = run.status === 0 ? readRows(out).find((r) => r.key === row.key) : null;
    note(!!fresh, `replay ${row.key}: no row`);
    if (fresh) for (const [arm, a] of Object.entries(row.arms)) for (const [day, v] of Object.entries(a.days ?? {})) for (const [field, value] of Object.entries(v)) {
      replayedScalars += 1;
      const got = fresh.arms[arm]?.days?.[day]?.[field];
      if (got !== value) { replayDifferences += 1; failures.push(`replay ${row.key} ${arm} day ${day} ${field}: ${got} against ${value}`); }
    }
    fs.rmSync(out, { recursive: true, force: true });
  }

  // 6. References: stored rows against an external measurement (the module's own table), within a tolerance.
  const referenceChecks = [];
  for (const ref of references) for (const x of ref.rows) {
    const row = rows.find((r) => r.group === ref.group && r.cutoff.slice(0, 10) === x.cutoff);
    const got = row?.arms?.[x.arm]?.days?.[x.day]?.e * 1000;
    referenceChecks.push({ group: ref.group, cutoff: x.cutoff, arm: x.arm, day: x.day, storedM: got, referenceM: x.meters });
    note(Number.isFinite(got) && Math.abs(got - x.meters) <= ref.toleranceM, `reference ${ref.group} ${x.cutoff} ${x.arm}: ${got} m against ${x.meters} m`);
  }

  console.log(readme);
  const result = { verdict: failures.length ? 'FAIL' : 'PASS', registration, registrationTime: new Date(regTime).toISOString(), testedCommit: git('rev-parse', 'HEAD'), manifests: manifests.length, runnerCommits: generations, rows: rows.length, plannedWindows: planned.size, replayedWindows: replayed, replayedScalars, replayDifferences, referenceChecks, statements: metrics.statements.map((s) => ({ id: s.id, reportOnly: !!s.reportOnly, pass: s.pass })), failures };
  console.log(JSON.stringify(result, null, 1));
  if (process.env.CONFIRM_STORE_OVERRIDE) { console.error('CONFIRM_STORE_OVERRIDE is set: this is not an E2E result'); process.exitCode = 2; } else if (failures.length) process.exitCode = 1;
}
