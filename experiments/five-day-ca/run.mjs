// Five-day CA forecast (FIVE-DAY.md): the re-measure on one $OCM and its E2E. Every state, covariance and Pc is a module's.
//   node experiments/five-day-ca/run.mjs fits         AP, XP and S fitted and flown on the archived inputs at the pinned build, with their
//                                                     endpoints, fitted $OCM and signed errors, in 60 hash partitions per label over 12 workers
//   node experiments/five-day-ca/run.mjs ussf         the Space Force XP (U) likewise, in its own rows (no covariance product is U's)
//   node experiments/five-day-ca/run.mjs covariance   the carried-covariance products of every window (covariance-products.mjs), likewise
//   node experiments/five-day-ca/run.mjs --check      the E2E: pinned windows re-fitted and re-flown exactly; every published number rebuilt
//                                                     from the stored products equals the committed results
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { config, registration, dir, modules, store, build, hash, FORECAST_PHASES } from './guard.mjs';
import { readRows } from './statistics.mjs';
registration();
const LABELS = ['regimes', 'truth2', 'truth'], PARTITIONS = 60, WORKERS = 12;
/** Each label's runner and its registered window selection (the original five-day.mjs jobs). */
const FIT_JOBS = {
  regimes: ['regimes.mjs', ['--groups', 'LS,DO,GD,IG,GE,HE,HX']],
  truth2: ['truth.mjs', ['--xm', '--from', '2026-01-01', '--to', '2026-05-31'], { XP2F_CONTROL: '1' }],
  truth: ['truth.mjs', ['--from', '2025-04-01', '--to', '2025-12-21']],
};
const partition = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % PARTITIONS;
/** Run jobs [{label, script, args, env, out}] over WORKERS processes; each job is one partition. */
async function pool(jobs) {
  let next = 0;
  const statuses = await Promise.allSettled(Array.from({ length: WORKERS }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      fs.mkdirSync(job.out, { recursive: true });
      const fd = fs.openSync(`${job.out}/worker-${job.shard}.log`, 'a');
      const child = spawn(process.execPath, ['--max-old-space-size=3072', `experiments/five-day-ca/${job.script}`, ...job.args, '--shard', `${job.shard}/${PARTITIONS}`], { env: { ...process.env, SDN_MODULES_ROOT: modules(), ...job.env }, stdio: ['ignore', fd, fd] });
      fs.closeSync(fd);
      fs.appendFileSync(`${store}/processes.jsonl`, `${JSON.stringify({ pid: child.pid, script: job.script, label: job.label, shard: job.shard, partitions: PARTITIONS, started: new Date().toISOString() })}\n`);
      const [code] = await once(child, 'exit');
      console.log(JSON.stringify({ script: job.script, label: job.label, shard: job.shard, code }));
      if (code !== 0) throw new Error(`${job.script} ${job.label} ${job.shard}/${PARTITIONS} exited ${code}`);
    }
  }));
  const failed = statuses.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
}
/** The E2E: real archive, pinned build, registration provenance, a six-day module replay, and every published number rebuilt from the stored rows
 *  and products equal to the committed results. */
async function check() {
  const assert = (await import('node:assert/strict')).default;
  const readline = await import('node:readline');
  const { spawnSync, execFileSync } = await import('node:child_process');
  const { rand } = await import('../operator-theory/lib/compare.mjs');
  const { readOcm } = await import('../operator-theory/lib/ap.mjs');
  const { describe, contrast, week } = await import('./lib/statistics.mjs');
  const { aggregate, report } = await import('./table.mjs');
  const { openPc } = await import('./lib/ca-reach.mjs');
  const { openPairStatistics } = await import('./lib/covariance-modules.mjs');
  const now = aggregate(), failures = [];
  const ok = (condition, reason) => { if (!condition) failures.push(reason); };
  assert.deepEqual(now, JSON.parse(fs.readFileSync('results/five-day-ca/metrics.json')), 'aggregate regeneration');
  assert.equal(report(now), fs.readFileSync('results/five-day-ca/README.md', 'utf8'), 'report regeneration');
  // Old leads: every scored scalar of days 1, 2, 3 and 7 against its build's stored row, exact; U within 1 m (FIVE-DAY.md, resume note 5).
  ok(now.reproduction.compared === 4 * now.armDayCoverage.filter((c) => [1, 2, 3, 7].includes(c.day)).reduce((n, c) => n + c.scored, 0), 'old-lead scalar coverage');
  ok(now.reproduction.missingReference === 0, 'old-lead reference missing');
  for (const [arm, s] of Object.entries(now.reproduction.byArm)) ok(arm === 'U' ? s.maxAbsKm <= 0.001 : s.different === 0, `old leads differ: ${arm}`);
  ok(now.coverage.length === 33 && now.armDayCoverage.length === 540, 'registered forecast cell coverage');
  ok(now.armDayCoverage.every((c) => c.expected === c.scored + c.excluded && c.missing === 0), 'arm/arc/day coverage incomplete');
  // The stored fitted $OCM: one per flown AP and XP arm, its typed FIT_STATISTICS equal to the row's fit RMS.
  let products = 0, productsMissing = 0, productDifferences = 0;
  for (const label of LABELS) {
    const d = dir('fits', label), stored = new Map();
    for (const f of fs.readdirSync(d).filter((f) => /^ocm-products-\d+\.jsonl$/.test(f))) for (const line of fs.readFileSync(`${d}/${f}`, 'utf8').split('\n').filter(Boolean)) { const p = JSON.parse(line); stored.set(`${p.key}|${p.arm}`, p); }
    for (const r of readRows(d)) for (const [arm, a] of Object.entries(r.arms)) {
      if (!/^(AP|XP)\d/.test(arm) || !a.ok) continue;
      const p = stored.get(`${r.key}|${arm}`);
      if (!p) { productsMissing += 1; continue; }
      products += 1;
      productDifferences += readOcm(Buffer.from(p.ocm, 'base64')).fitRmsKm !== a.rms;
    }
  }
  ok(products > 0 && productsMissing === 0, 'fitted $OCM products missing');
  ok(productDifferences === 0, 'fitted $OCM FIT_STATISTICS differ from the rows');
  // Six-day module replay of one complete window, every arm: AP, XP, S and F exact, U within 1 m.
  const selected = readRows(dir('fits', 'regimes')).find((r) => ['AP72', 'XP72', 'S72'].every((a) => [1, 2, 3, 4, 5, 7].every((d) => Number.isFinite(r.arms[a]?.days?.[d]?.e))));
  assert(selected, 'no complete six-day replay window');
  for (const phase of ['ussf', 'ffm']) { const r = readRows(dir(phase, 'regimes')).find((x) => x.key === selected.key); assert(r, `no ${phase} replay window`); Object.assign(selected.arms, r.arms); }
  const out = `${store}/check/${Date.now()}`;
  const replayRun = spawnSync(process.execPath, ['experiments/five-day-ca/regimes.mjs', '--out', out, '--groups', selected.group, '--key', selected.key, '--arms', 'AP,XP,S,U,F'], { env: { ...process.env, SDN_MODULES_ROOT: modules() }, encoding: 'utf8', timeout: 900000 });
  assert.equal(replayRun.status, 0, replayRun.stderr);
  const replay = JSON.parse(fs.readFileSync(`${out}/rows-0.jsonl`, 'utf8').trim());
  let scalars = 0, replayDifferences = 0, replayMaxAbsKm = 0, replayRejected = 0; const replayByArm = {};
  for (const [arm, a] of Object.entries(selected.arms)) for (const [day, values] of Object.entries(a.days ?? {})) for (const [field, value] of Object.entries(values)) {
    const actual = replay.arms[arm]?.days?.[day]?.[field], delta = Number.isFinite(actual) ? Math.abs(actual - value) : Infinity, code = arm.replace(/\d+/g, '');
    const c = (replayByArm[code] ??= { scalars: 0, differences: 0, maxAbsKm: 0, toleranceKm: code === 'U' ? 0.001 : 0 });
    c.scalars += 1; c.maxAbsKm = Math.max(c.maxAbsKm, delta);
    if (delta !== 0) { replayDifferences += 1; c.differences += 1; replayMaxAbsKm = Math.max(replayMaxAbsKm, delta); }
    if (delta > c.toleranceKm) replayRejected += 1;
    scalars += 1;
  }
  ok(replayRejected === 0, 'six-day module replay exceeds its arm tolerance');
  ok(['AP', 'XP', 'S', 'U', 'F'].every((code) => replayByArm[code]?.scalars > 0), 'six-day module replay lacks an arm');
  // Independent expanded-draw reference on real archive windows for the weighted bootstrap.
  const real = readRows(dir('fits', 'regimes')).filter((r) => r.group === 'LS' && Number.isFinite(r.arms.AP72?.days?.[5]?.e) && Number.isFinite(r.arms.XP72?.days?.[5]?.e)).map((r) => ({ cutoff: r.cutoff, e: r.arms.AP72.days[5].e, r: r.arms.AP72.days[5].r, t: r.arms.AP72.days[5].t, n: r.arms.AP72.days[5].n, x: r.arms.AP72.days[5].e, y: r.arms.XP72.days[5].e }));
  const percentile = (values, q) => { const a = values.sort((a, b) => a - b), at = (a.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at); return lo === hi || a[lo] === a[hi] ? a[lo] : a[lo] + (a[hi] - a[lo]) * (at - lo); };
  const expanded = (fn, label) => { const units = [...Map.groupBy(real, (r) => week(r.cutoff)).values()], rng = rand(parseInt(crypto.createHash('sha256').update(`20261103|${label}`).digest('hex').slice(0, 8), 16)), v = []; for (let k = 0; k < 10000; k++) { const draw = []; for (let i = 0; i < units.length; i++) draw.push(...units[Math.floor(rng() * units.length)]); v.push(fn(draw)); } return [percentile([...v], 0.025), percentile([...v], 0.975)]; };
  const fastDescription = describe(real, 'E2E median'), fastContrast = contrast(real, 'E2E contrast');
  const references = [expanded((r) => percentile(r.map((x) => x.e), 0.5), 'E2E median'), expanded((r) => percentile(r.map((x) => Math.log(x.x / x.y)), 0.5), 'E2E contrastmedian'), expanded((r) => Math.log(percentile(r.map((x) => x.x), 0.95) / percentile(r.map((x) => x.y), 0.95)), 'E2E contrastp95')];
  assert.deepEqual([fastDescription.ci95, fastContrast.ci95, fastContrast.p95CI95], references, 'bootstrap differs from expanded cluster draws');
  // Provenance: the re-measure's rows come from the runners at HEAD, started after the amendment that registers them (its author date, which a
  // rebase keeps); the registered F rows from the registration's runners.
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const amendedMs = Math.min(...git('log', '--format=%aI', '-S', 'Amendment 2026-11-04: one $OCM', '--', 'experiments/five-day-ca/FIVE-DAY.md').split('\n').filter(Boolean).map(Date.parse));
  const registrationMs = Date.parse(git('show', '-s', '--format=%cI', 'eb143664cad7ab97133184d4d0b217592f81b5a8'));
  const RUNNERS = ['FIVE-DAY.md', 'truth.mjs', 'regimes.mjs', 'guard.mjs'].map((f) => `experiments/five-day-ca/${f}`);
  let manifests = 0;
  for (const phase of FORECAST_PHASES) for (const label of LABELS) {
    const d = dir(phase, label); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((f) => /^manifest-\d+-\d+\.json$/.test(f))) {
      const m = JSON.parse(fs.readFileSync(`${d}/${f}`));
      if (phase === 'ffm') { assert(Date.parse(m.started) >= registrationMs, 'resumed manifest predates amended registration'); assert.equal(m.sources['experiments/five-day-ca/FIVE-DAY.md'], hash(execFileSync('git', ['show', `${m.commit}:experiments/five-day-ca/FIVE-DAY.md`]))); }
      else { assert(Date.parse(m.started) >= amendedMs, 're-measure manifest predates its amendment'); for (const rel of RUNNERS) assert.equal(m.sources[rel], hash(fs.readFileSync(rel)), `${rel} differs from the runner of ${d}/${f}`); }
      manifests += 1;
    }
  }
  assert(manifests > 0, 'no registration manifests');
  const pc = await openPc(); let oracleError = 0;
  try { for (const [v, h] of [[10000, 10], [2500, 100]]) oracleError = Math.max(oracleError, Math.abs(await pc.pc([v, 0, v], h) + Math.expm1(-h * h / (2 * v)))); assert(oracleError <= 1e-12); } finally { await pc.close(); }
  for (const file of ['statistics.json', 'ca-reach.json', 'covariance.json', 'encounters.json']) ok(fs.existsSync(`results/five-day-ca/${file}`), `${file} unmeasured`);
  let syntheticCells = 0, syntheticEncounters = 0, syntheticPcFailures = 0, syntheticPairedCells = 0;
  if (fs.existsSync('results/five-day-ca/encounters.json')) { const e = JSON.parse(fs.readFileSync('results/five-day-ca/encounters.json')); syntheticCells = e.cells.length; syntheticEncounters = e.cells.reduce((n, c) => n + c.n, 0); syntheticPcFailures = e.cells.reduce((n, c) => n + c.pcFailed, 0); ok(e.complete === true, 'synthetic arms and paired scores incomplete'); syntheticPairedCells = e.paired?.length ?? 0; ok(syntheticCells === 1080 && syntheticPairedCells === 2160, 'registered synthetic cell coverage'); assert.equal(e.workerCount, 12, 'encounter worker count'); assert.equal(e.rawParts.length, 12, 'encounter partition count'); assert.equal(new Set(e.cells.map((c) => [c.group, c.arc, c.pair, c.arm, c.day].join('|'))).size, 1080, 'unique synthetic cells'); assert.equal(new Set(e.paired.map((c) => [c.group, c.arc, c.pair, c.contrast, c.day].join('|'))).size, 2160, 'unique paired cells'); ok(e.cells.reduce((n, c) => n + c.draws, 0) === 3600000, 'registered synthetic draw coverage'); for (const p of e.paired ?? []) { assert.equal(p.n + p.unpaired, p.draws); assert.equal(p.brier.n, p.n); assert.equal(p.log.n + p.undefinedLog, p.n); assert.equal(p.brier.bootstrapDraws, 10000); if (p.n > 0) assert.equal(p.brier.bootstrapDefined, 10000); } for (const [file, pin] of Object.entries(e.inputs)) assert.equal(hash(fs.readFileSync(file)), pin, 'synthetic input snapshot'); for (const c of e.cells) { ok(!Object.entries(c.errors ?? {}).some(([reason, n]) => n > 0 && /not run|Cannot read properties|is not a function|is not defined/.test(reason)), 'synthetic product transport incomplete'); assert.equal(c.draws, c.n + c.noPrimary + c.noSecondary + c.pcFailed); assert(c.hits <= c.n && c.missed <= c.hits && c.falseAlerts <= c.n - c.hits); } }
  let carriedEndpointComparison = null, adaptedArmDays = 0, availableHistoryArmDays = 0, commonAxesReplayScalars = 0, commonAxesReplayMaxAbs = 0;
  const adapted = `${store}/adapted-covariance.jsonl`;
  if (fs.existsSync('results/five-day-ca/covariance.json')) { const c = JSON.parse(fs.readFileSync('results/five-day-ca/covariance.json')); carriedEndpointComparison = c.endpointComparison; for (const [arm, v] of Object.entries(carriedEndpointComparison ?? {})) { assert.equal(v.missing, 0, 'carried endpoint reference coverage'); assert(Number.isFinite(v.maxAbsM)); if (arm === 'S') assert.equal(v.maxAbsM, 0, 'S signed endpoint identity'); } ok(c.coverage?.every((x) => x.fitArmDays.missing === 0 && x.gpArmDays.missing === 0), 'covariance coverage incomplete'); for (const [file, pin] of Object.entries(c.inputs)) assert.equal(hash(fs.readFileSync(file)), pin, 'covariance source snapshot'); assert.equal(hash(fs.readFileSync(adapted)), c.outputSha256); for (const row of fs.readFileSync(adapted, 'utf8').split('\n').filter(Boolean).map(JSON.parse)) for (const a of Object.values(row.arms)) for (const v of Object.values(a.days ?? {})) { if (!v.adaptation) continue; adaptedArmDays++; if (v.adaptation.history) { availableHistoryArmDays++; assert(v.adaptation.historyLatestAvailableAt <= Date.parse(row.cutoff)); assert(v.adaptation.historyLatestCutoff <= Date.parse(row.cutoff) - 3 * 86400000); } assert(v.adaptation.g > 0 && Number.isFinite(v.adaptation.g)); } }
  if (fs.existsSync('results/five-day-ca/covariance.json')) { const rows = fs.readFileSync(adapted, 'utf8').split('\n').filter(Boolean).map(JSON.parse), seen = new Set(), module = await openPairStatistics(); try { for (const row of rows) for (const [arm, a] of Object.entries(row.arms)) for (const v of Object.values(a.days ?? {})) { if (v.errorM && v.covarianceM2) assert.equal(v.axes, 'truth RTN'); const code = arm.replace(/\d+/g, ''); if (!['AP', 'XP', 'F'].includes(code) || seen.has(code) || !v.calibrationCovarianceM2) continue; const [actual] = await module.stats([{ predicted: { ...v.predictedState, covariance: v.calibrationCovarianceM2, covarianceAxes: 'RTN' }, truth: v.truthState }], 'truth'); for (const [x, y] of [...actual.errorRtn, ...actual.predictedRtn].map((x, i) => [x, [...v.errorM, ...v.covarianceM2][i]])) { commonAxesReplayScalars++; commonAxesReplayMaxAbs = Math.max(commonAxesReplayMaxAbs, Math.abs(x - y)); assert.equal(x, y, 'common truth RTN replay'); } seen.add(code); } } finally { await module.close(); } ok(seen.size === 3, 'common-frame covariance replay incomplete'); }
  let syntheticReplayScalars = 0, syntheticReplayMaxAbs = 0;
  const encounters = fs.existsSync('results/five-day-ca/encounters.json') ? JSON.parse(fs.readFileSync('results/five-day-ca/encounters.json')) : {};
  if (encounters.rawFile) { assert.equal(hash(fs.readFileSync(encounters.rawFile)), encounters.rawSha256, 'synthetic archive hash'); const seen = new Set(), lines = readline.createInterface({ input: fs.createReadStream(encounters.rawFile), crlfDelay: Infinity }), module = await openPc(); try { for await (const line of lines) { const draw = JSON.parse(line); for (const [arm, s] of Object.entries(draw.scores)) { if (seen.has(arm)) continue; const probability = await module.pc(s.covarianceM2, 20, s.predictedMissM); syntheticReplayScalars++; syntheticReplayMaxAbs = Math.max(syntheticReplayMaxAbs, Math.abs(probability - s.pc)); assert.equal(probability, s.pc, 'synthetic Pc replay'); assert.equal(s.brier, (probability - Number(draw.hit)) ** 2); const loss = draw.hit ? -Math.log(probability) : -Math.log1p(-probability); assert.equal(s.log, Number.isFinite(loss) ? loss + 0 : 'Infinity'); seen.add(arm); } if (seen.size === 5) break; } } finally { lines.close(); await module.close(); } ok(seen.size === 5, 'five-arm synthetic Pc replay incomplete'); }
  let statisticalCells = 0, pairedCells = 0, reachCells = 0, reachExclusions = 0;
  if (fs.existsSync('results/five-day-ca/statistics.json')) { const s = JSON.parse(fs.readFileSync('results/five-day-ca/statistics.json')); assert.equal(s.snapshotStable, true, 'statistics snapshot must be stable'); assert.deepEqual(s.inputs, now.inputs, 'statistics input snapshot'); statisticalCells = s.cells.length; pairedCells = s.paired.length; ok(statisticalCells === 540 && pairedCells === 108, 'registered statistical cell coverage'); for (const c of s.cells) { const m = now.armDayCoverage.find((x) => x.group === c.group && x.arm + String(x.arc) === c.arm && x.day === c.day); assert(m); assert.equal(c.n, m.scored, 'statistical denominator'); if (['LS', 'DO'].includes(c.group) && [4, 5].includes(c.day)) assert.equal(c.disclosure, 'read before the statements were registered'); } }
  if (fs.existsSync('results/five-day-ca/ca-reach.json')) { const c = JSON.parse(fs.readFileSync('results/five-day-ca/ca-reach.json')); assert.equal(c.snapshotStable, true, 'CA snapshot must be stable'); assert.equal(c.regimeMappingSha256, hash(fs.readFileSync(`${config.store}/gp-regimes.json`)), 'CA altitude mapping snapshot'); assert.deepEqual(c.inputs, now.inputs, 'CA input snapshot'); reachCells = c.cells.length; ok(reachCells === 6480, 'registered CA cell coverage'); reachExclusions = c.cells.reduce((n, c) => n + c.excluded, 0); ok(reachExclusions === 0, 'CA reach exclusions unresolved'); assert.equal(c.alfanoAtZero, 1, 'Alfano maximum at zero miss'); for (const x of c.cells) { if (x.day === 5 && x.pair !== 'fit x fit') assert.deepEqual(x.gpAgeDays, [5, 7], 'GP five-day age bin'); assert.equal(x.n + x.excluded, x.attempted); if (['LS', 'DO'].includes(x.group) && [4, 5].includes(x.day)) assert.equal(x.disclosure, 'read before the statements were registered'); } }
  const result = { verdict: failures.length ? 'FAIL' : 'PASS', testedCommit: git('rev-parse', 'HEAD'), build, replayedScalars: scalars, replayDifferences, replayMaxAbsKm, replayRejected, replayByArm, products, productDifferences, oldLeadScalars: now.reproduction.compared, oldLeadDifferences: now.reproduction.different, oldLeadByArm: now.reproduction.byArm, completeGroupPhases: now.coverage.filter((c) => c.expected > 0 && c.completed === c.expected).length, totalGroupPhases: now.coverage.length, armDayCells: now.armDayCoverage.length, missingArmDays: now.armDayCoverage.reduce((n, c) => n + c.missing, 0), scoredArmDays: now.armDayCoverage.reduce((n, c) => n + c.scored, 0), excludedArmDays: now.armDayCoverage.reduce((n, c) => n + c.excluded, 0), registrationManifests: manifests, syntheticCells, syntheticEncounters, syntheticPcFailures, syntheticPairedCells, syntheticReplayScalars, syntheticReplayMaxAbs, carriedEndpointComparison, adaptedArmDays, availableHistoryArmDays, commonAxesReplayScalars, commonAxesReplayMaxAbs, statisticalCells, pairedCells, reachCells, reachExclusions, disclosedPriorReads: true, pcOracleAbsoluteError: oracleError, bootstrapReferenceScalars: 6, bootstrapReferenceMaxAbs: 0, failures };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
}
const phase = process.argv[2];
if (phase === 'fits' || phase === 'ussf') {
  fs.mkdirSync(store, { recursive: true });
  const jobs = [];
  for (const shard of Array.from({ length: PARTITIONS }, (_, k) => k)) for (const label of LABELS) {
    const [script, args, env = {}] = FIT_JOBS[label], out = dir(phase, label);
    jobs.push({ label, shard, script, env, out, args: ['--out', out, ...(phase === 'fits' ? ['--arms', 'AP,XP,S', '--products', 'true'] : ['--arms', 'U']), ...args] });
  }
  await pool(jobs);
} else if (phase === 'covariance') {
  const jobs = [];
  for (const label of LABELS) {
    const done = new Set(readRows(dir('covariance', label)).map((r) => r.key));
    const pending = new Set(readRows(dir('fits', label)).filter((r) => !done.has(r.key)).map((r) => partition(r.key)));
    for (const shard of [...pending].sort((a, b) => a - b)) jobs.push({ label, shard, script: 'covariance-products.mjs', env: {}, out: dir('covariance', label), args: ['--label', label] });
  }
  await pool(jobs);
} else if (process.argv.includes('--check')) {
  await check();
} else {
  throw new Error('run.mjs fits | ussf | covariance | --check');
}
