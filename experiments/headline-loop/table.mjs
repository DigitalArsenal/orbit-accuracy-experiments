// The site's one table for a released sdn-ap version (owner, 2026-11-10: "True is ALWAYS measured honestly against a properly configured
// numerical propagator"; the pass line "within 100 meters 5 days out"; "beat [XP] at a large enough margin to make our propagator the one
// to use for conjunction assessment"). AP of the given modules commit, and SGP4-XP of the same module (THEORY SGP4XP, the same fit call), are
// fitted and flown on every window of the first pass, and of a regime's second pass (the windows touching March to May 2026) once its
// numerical rows are all in the store, in the module's own GCRF output, and scored against truth in meters. The numerical propagator's
// errors on the same windows are read from the store: it was flown once (FFM, fitted by analysis/estimation) and does not change with AP's
// version. Writes one JSON (schema sdn-ap-scoreboard/2) and nothing else. The theory alone: no record that carries a forecast.
//
//   node experiments/headline-loop/table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 14] [--groups GD,IG]
//     [--previous <the previous release table>: the method line names the rows that gained windows since it]
//     [--burn-flags <dir of the burn lane's flags-*.json>: each flagged row's pass line split by burns (burnSplit), and under Near 700 km the
//      altimetry row's line at the same altitudes (sameAltitudes); stack issue 462]
//     [--burns <dir of the burn detector's lists (stack issue 462), <group>/<name>.burns.json>: from MANEUVER72_SINCE, AP's 72 h fit of a maneuvering
//      object takes the arc after its last burn known at the cutoff (lib/arms.mjs MANEUVER72; stack issue 489); each such row says so]
//   node experiments/headline-loop/table.mjs --check
//
// The build is read by git show at the commit (propagator/sdn-ap/dist/isomorphic/module.wasm and its package.json), never from a working tree.
// AP's and our XP's rows go to <store>/table/<wasm sha12>/rows.jsonl (theory AP or SGP4XP), the Space Force XP's and SGP4's to
// <store>/outside/<their builds>/rows.jsonl, flown once for every AP build; a row already there is not flown again. The harness's working tree must be clean
// (the file names the harness commit). The numerical arm of a regime and fit length is its fullest stored setting, fixed by name and never
// chosen on the outcome: Fbest where it is stored, else the full setting, else the configured, else the reduced (PREFER).
// It is null ("being measured") until the store holds every window of that row, and null where no stored arm is properly
// configured for the truth (NOT_CONFIGURED).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { REPO, usePackages, envRecord } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE', 'HX'];
// the order windows are handed out: the slowest first (long eccentric arcs), so the last ones to finish are short
const HEAVY = ['HE', 'HX', 'DO', 'S1', 'P', 'T', 'WA', 'LS', 'GN_GAL', 'GN', 'GE', 'IG', 'GD'];
const LEADS = [[24, 1], [72, 3], [120, 5], [168, 7]];
// AP and SGP4XP are the released module's; USSFXP (the Space Force's XP, propagator/sgp4-xp) and SGP4 (analysis/gp-error-model's fit,
// propagator/sgp4's flight) are outside builds, pinned (lib/arms.mjs OUTSIDE). --theories limits the ones flown in a run.
const THEORIES = ['AP', 'SGP4XP', 'USSFXP', 'SGP4'];
// the owner's pass line (2026-11-10): AP within 100 m of the numerical propagator 5 days out
const PASS_LEAD_DAY = 5, PASS_M = 100;
const passes = (p) => p.a - p.f < PASS_M;
// --burn-flags: under each Near 700 km row, the altimetry row's pass line on its satellites at the same altitudes (stack issue 462); a
// satellite's altitude is its mean geocentric distance less the equatorial radius over the truth's 3 h before its first scored cutoff
const SAME_ALTITUDES = { row: 'S1', from: 'DO', fromKm: 600, toKm: 850, label: 'the same altitudes on satellites that seldom burn' };
const EQUATOR_KM = 6378.137;
const EITHER_WAY_TEXT = ' within100mEitherWay counts, at the 120 hour lead on the same windows as within100mOfFfm, the windows where AP\'s error and the numerical propagator\'s are within 100 m of each other either way (a window where AP is more than 100 m closer to the truth than the numerical propagator does not count), and within100mEitherWayBurnSplit splits that count by the burn flags into the four parts of burnSplit.';
const STATISTIC = [
  'For each window (one satellite, one cutoff) and lead, the root mean square of the 3D position error against the truth over the 24 hours that end at the lead, on the truth\'s 300 s grid (a day counts when the truth covers 90 % of it); the median and the 95th percentile (linear interpolation) are taken over the lead\'s windows, those where AP and the numerical propagator were both scored.',
  'xp is SGP4-XP, our clean-room build in the same module as AP (THEORY SGP4XP), fitted to the same arc by the same fit call and flown in the module\'s own GCRF output. xpUssf is the Space Force\'s SGP4-XP (propagator/sgp4-xp 0.2.1, its library the unmodified Sgp4Prop 9.1.1.0 XP build), fitted to the same arc by that module\'s own fitter, which searches two-line-element digits with every evaluation running the library, and flown by its propagate in its own GCRF output. sgp4 is SGP4 fitted to the same arc by analysis/gp-error-model (its own SGP4 in improved mode, B* fitted) and flown by propagator/sgp4 (AFSPC mode), its TEME output turned to GCRF by foundation/frames, the path its fit uses. Each is null until it has a row on every window of the row; a window where its fit or flight failed counts as flown. Its median and 95th percentile are taken over the lead\'s windows where it was scored (windows); failed counts the lead\'s windows where its fit or flight failed, so a figure with failed above 0 is over the scored windows alone (a file without windows and failed does not state them, and its readers must not take failed as 0). apBeatsXp and apBeatsXpUssf count the lead\'s windows where that XP was scored (windows), the ones where AP\'s error is below that XP\'s (apBetter), and give the median over them of AP\'s error divided by that XP\'s (medianApOverXp); a window where that XP failed is left out of the pair count, never counted as AP closer.',
  'From sdn-ap 0.6.15 the two medium Earth orbit rows of navigation satellites (GN and Galileo), and from sdn-ap 0.6.19 the geostationary and inclined geosynchronous rows, fit AP with $PCF FORCES.ECOM2 on fits of 72 h or more, which also solves the ECOM2 Y0 radiation term (SDN-AP SPEC 16.13); every other row (the commercial geostationary rows among them: their fits take the vacuum $PCF), and every row of an older build, fits AP with the same $PCF as before. From sdn-ap 0.6.20 every row\'s AP fit also states the solid Earth tide ($PCF FORCES.SOLID_TIDES IERS 2010), which that build flies only where it is stated. apForces states each row\'s forces and fitted terms.',
  'within100mOfFfm counts, at the 120 hour lead, the windows where AP\'s error is less than 100 m above the numerical propagator\'s (AP better than it counts as met); share is met over windows. apFfmRank is Spearman\'s rank correlation (average ranks for ties) of AP\'s and the numerical propagator\'s errors over the lead\'s windows (null without a numerical propagator or under 10 windows); near 1, the two order the windows alike, as when both are limited by the same density forecast.',
].join(' ');
// linear interpolation between order statistics (R type 7)
const quantile = (sorted, p) => { if (!sorted.length) return null; const x = p * (sorted.length - 1), i = Math.floor(x), f = x - i; return i + 1 < sorted.length ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i]; };
// commercial geostationary: the truth holds station-keeping burns and every stored arm fits through them (fit RMS 88 m at 24 h, 1.5 km at 72 h
// against a truth good to 2 m), so none is a properly configured propagator for it
const NOT_CONFIGURED = new Set(['WA']);
const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'];
const FFM_SELECTION = 'Each row\'s numerical propagator is its fullest stored FFM setting, named in the row\'s configuration sentence and not chosen on the outcome: on the laser geodetic spheres the full setting with ocean tides and Earth radiation pressure, else the full setting (degree and order 70, solid tides, relativity, RK78 at 1e-10), else the setting the row has. The other stored settings (the configured and the reduced) are kept and are not scored against.';
// The measured spread of the numerical figure itself (stack issue 396): two flights of the same FFM fit that differ only in the integrator's
// step sequence (the scored epochs against a 60 s trajectory), from the carried-record rows of 2026-11-10 (store 1104598edeeb-apc), by row
// and setting; appended to that row's configuration sentence. Measured on the full setting; elsewhere it is at most 2 mm, or under 5 % of FFM's own error.
const SPREAD = { 'LS|24|L70S': ' Two flights of this same fit that differ only in the integrator\'s step sequence part by up to 0.9 m at 24 h, 2.8 m at 72 h and 8.4 m at 168 h (40, 33 and 38 windows; stack issue 396).' };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });

if (args.check) await check();
else if (args.worker) await worker();
else await main();

/** A forked worker: opens the module once, then flies each window it is sent (the theories and fit arcs asked), answering with its rows. */
async function worker() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const groups = args.groups.split(',');
  const all = W.windowsOf(groups);
  const winOf = new Map([...all.windows, ...all.second].map((w) => [w.key, w]));
  const want = args.theories.split(',');
  const arms = await A.openArms({ apWasm: args.wasm, ussf: want.includes('USSFXP'), sgp4: want.includes('SGP4') });
  const build = { version: args['ap-version'], sha256: args.sha256 }, env = envRecord();
  const fly = async (w, need) => {
    const D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs), t0 = performance.now();
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      if (!sc.entered.length) throw new Error('no lead bin');
      ctx = { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0), object: { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 } };
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    const truthS = (performance.now() - t0) / 1000, rows = [];
    for (const [theory, arc] of need) {
      const row = { key: w.key, group: w.group, name: w.name, arcH: arc, theory, ...(A.OUTSIDE[theory] ? { builds: A.OUTSIDE[theory].builds } : { ap: build }), env, truthS };
      if (ctx.error) row.error = ctx.error;
      else {
        // stack issue 489: AP's 72 h fit of a maneuvering object takes the arc after its last burn known at the cutoff (arms.mjs MANEUVER72)
        let from = D0 - arc * W.HOUR, hours = arc;
        const lastBeforeCutoff = ctx.truth.lines.filter((l) => W.ms(l.epoch) <= D0).at(-1);
        // (a truth with no state before the cutoff has no arc either: the coverage error below)
        if (theory === 'AP' && arc === 72 && A.maneuver72(build.version) && args.burns && lastBeforeCutoff) {
          const last = lastBeforeCutoff, MU = 398600.4418, rr = Math.hypot(...last.r), vv = Math.hypot(...last.v);
          const aKm = 1 / (2 / rr - (vv * vv) / MU), h = [last.r[1] * last.v[2] - last.r[2] * last.v[1], last.r[2] * last.v[0] - last.r[0] * last.v[2], last.r[0] * last.v[1] - last.r[1] * last.v[0]];
          const perigeeKm = aKm * (1 - Math.sqrt(Math.max(0, 1 - (h[0] ** 2 + h[1] ** 2 + h[2] ** 2) / (MU * aKm)))) - 6378.137;
          const m = A.maneuverArc(A.knownBurns(args.burns, w.group, w.name, D0), D0, perigeeKm);
          row.fitProcess = m.maneuvering ? 'maneuvering: the arc after its last burn' : 'the full arc';
          if (m.maneuvering) { from = m.startMs; hours = (D0 - from) / W.HOUR; row.fitArcHours = Math.round(hours * 10) / 10; }
        }
        let thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= from && t <= D0; }), hours);
        // the arc after the burn short of coverage: the full arc, so no window leaves the row
        if (!thin && hours !== arc) {
          thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
          row.fitProcess = 'maneuvering, the arc after its last burn short of coverage: the full arc'; delete row.fitArcHours;
        }
        if (!thin) row.error = 'coverage';
        else {
          try {
            const choice = A.apPcfFor(w.group, build.version, G.vacuum, arc);
            const pcf = theory === 'SGP4XP' ? A.PCF.XP : choice.pcf, spw = theory === 'SGP4XP' ? undefined : ctx.wx?.spw;
            if (theory === 'AP') row.pcf = choice.label;
            const base = { thin, D0, sc: ctx.sc, object: ctx.object };
            const x = theory === 'USSFXP' ? await arms.ussf(base) : theory === 'SGP4' ? await arms.sgp4(base) : await arms.ap({ ...base, pcf, spw });
            Object.assign(row, { days: x.days, fitRmsKm: x.rms, fit: x.fit, s: x.s });
          } catch (e) { row.apError = String(e?.message ?? e).slice(0, 200); }
        }
      }
      rows.push(row);
    }
    return rows;
  };
  process.on('message', async (m) => {
    if (m.stop) { await arms.close(); process.exit(0); }
    const w = winOf.get(m.key);
    process.send({ key: m.key, rows: w ? await fly(w, m.need) : [{ key: m.key, error: 'not a listed window' }] });
  });
  process.send({ ready: true });
}

async function main() {
  const t0 = Date.now();
  const root = args['modules-root'], want = args['modules-commit'], out = args.out, jobs = Number(args.jobs ?? 14);
  if (!root || !want || !out) throw new Error('usage: table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 14] [--groups GD,IG]');
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments').toString().trim();
  if (dirty) throw new Error(`refused: the harness's working tree differs from its commit (the file names the commit):\n${dirty}`);
  const harnessCommit = git(REPO, 'rev-parse', 'HEAD').toString().trim();
  const commit = git(root, 'rev-parse', '--verify', `${want}^{commit}`).toString().trim();
  const wasm = git(root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`);
  const version = JSON.parse(git(root, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  const wasmSha = sha256(wasm);
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { SETTINGS } = await import('./lib/settings.mjs');
  const { FFM_220 } = await import(path.join(REPO, 'experiments/operator-theory/lib/build.mjs'));
  const dir = path.join(A.STORE_ROOT, 'table', wasmSha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
  const groups = args.groups ? args.groups.split(',') : ALL;
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);
  // the numerical propagator's rows (refly.mjs, both passes)
  const baseDir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  // a row that flew wins over a row that recorded an error for the same window and arc (a window flown again after its truth was found)
  const base = new Map();
  for (const r of fs.readdirSync(baseDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(baseDir, f)))) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  // the windows: the first pass, and a regime's second pass (the windows touching 2026-03..05) once its numerical rows are all in the store
  const all = W.windowsOf(groups);
  const secondIn = new Set(groups.filter((g) => { const sec = all.second.filter((w) => w.group === g); return sec.length && sec.every((w) => w.arcs.every((a) => base.has(`${w.key}|${a}`))); }));
  const only = args['keys-file'] ? new Set(fs.readFileSync(args['keys-file'], 'utf8').split('\n').filter(Boolean)) : null;
  const listed = [...all.windows, ...all.second.filter((w) => secondIn.has(w.group))].filter((w) => !only || only.has(w.key));
  const notYet = all.second.filter((w) => !secondIn.has(w.group));
  const day = (t) => new Date(t).toISOString().slice(0, 10), count = (n) => n.toLocaleString('en-US');
  const cutoffs = listed.map((w) => w.cutoffMs);
  const secondText = [...secondIn].filter((g) => !only || listed.some((w) => w.group === g && all.second.includes(w))).map((g) => `${W.GROUPS[g].label} (${count(all.second.filter((w) => w.group === g).length)} windows)`);
  const windowsText = `The table holds ${count(listed.length)} windows (one satellite and one cutoff each), cutoffs from ${day(Math.min(...cutoffs))} to ${day(Math.max(...cutoffs))}`
    + (notYet.length && secondText.length ? `; the second pass (the windows whose fit arc or 7-day forecast touches March to May 2026) is in for ${secondText.join(', ')}, and its ${count(notYet.length)} windows of the other rows are not flown yet`
      : notYet.length ? `; the ${count(notYet.length)} windows whose fit arc or 7-day forecast touches March to May 2026 (the second pass) are not flown yet` : all.second.length ? ', the windows touching March to May 2026 (the second pass) among them' : '')
    + (all.after.length ? `; ${count(all.after.length)} windows reaching past 2026-11-10 are not read` : '') + '.';
  const rowsFile = path.join(dir, 'rows.jsonl');
  // a row without a theory is AP's (the version-1 rows)
  // AP's and our XP's rows under the AP build's folder; the Space Force XP's and SGP4's under their own builds' (lib/arms.mjs OUTSIDE), flown
  // once and read by every later run
  const fileOf = (t) => (A.OUTSIDE[t] ? path.join(A.STORE_ROOT, 'outside', A.OUTSIDE[t].key, 'rows.jsonl') : rowsFile);
  for (const t of Object.keys(A.OUTSIDE)) fs.mkdirSync(path.dirname(fileOf(t)), { recursive: true });
  const flownRows = new Map([
    ...readRows(rowsFile).filter((r) => r.ap?.sha256 === wasmSha && !A.OUTSIDE[r.theory ?? 'AP']),
    ...Object.keys(A.OUTSIDE).flatMap((t) => readRows(fileOf(t)).filter((r) => r.theory === t)),
  ].map((r) => [`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r]));
  const rowOf = (theory, w, arc) => flownRows.get(`${theory}|${w.key}|${arc}`);
  // --retry-errors: a window whose row recorded an error (no truth, coverage, a failed fit or flight) is flown again; the later row is read in
  // its place
  const flying = args.theories ? args.theories.split(',') : THEORIES, retry = !!args['retry-errors'];
  const needOf = (w) => flying.flatMap((t) => w.arcs.filter((a) => !rowOf(t, w, a) || (retry && (rowOf(t, w, a).error || rowOf(t, w, a).apError))).map((a) => [t, a]));
  const todo = listed.filter((w) => needOf(w).length)
    .sort((a, b) => HEAVY.indexOf(a.group) - HEAVY.indexOf(b.group) || Math.max(...b.arcs) - Math.max(...a.arcs) || a.key.localeCompare(b.key));
  console.error(`table: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${listed.length} windows (${all.windows.length} first pass, ${listed.length - all.windows.length} second), ${todo.length} to fly on ${Math.min(jobs, todo.length)} jobs`);

  // fly: each worker takes the next window as it finishes one
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, '--ap-version', version, '--sha256', wasmSha, '--groups', groups.join(','), '--theories', flying.join(','), ...(args.burns ? ['--burns', args.burns] : [])], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => { if (next < todo.length) { const w = todo[next++]; child.send({ key: w.key, need: needOf(w) }); } else child.send({ stop: true }); };
    child.on('message', (m) => {
      if (m.rows) {
        for (const r of m.rows) { fs.appendFileSync(fileOf(r.theory ?? 'AP'), `${JSON.stringify(r)}\n`); flownRows.set(`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r); }
        flown += 1;
        if (flown % 50 === 0 || flown === todo.length) console.error(`  ${flown}/${todo.length} windows, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));

  const meters = (row, arm, day) => { const e = arm ? row?.arms?.[arm]?.ok && row.arms[arm].days?.[day]?.e : row?.days?.[day]?.e; return Number.isFinite(e) ? e * 1000 : null; };
  const stats = (v) => { const s = v.slice().sort((a, b) => a - b); return { medianM: round(quantile(s, 0.5)), p95M: round(quantile(s, 0.95)) }; };
  const median = (v) => quantile(v.slice().sort((a, b) => a - b), 0.5);
  const truthName = (g, ws) => [...new Set(ws.map((w) => W.providerOf(g, w.name)))].join('; ');
  // the fullest stored setting by name (owner's rule, a properly configured numerical propagator; 2026-11-11): never chosen on the outcome,
  // so a row's arm does not change from one table to the next with the errors
  const chooseArm = (g, bs) => {
    if (NOT_CONFIGURED.has(g)) return null;
    return PREFER.find((a) => bs.some((b) => b.arms?.[a]?.ok)) ?? null;
  };
  const rows = [], ecom2Rows = [], tideRows = [], tally = {}, passOf = [];
  let windowArcs = 0;
  // --burn-flags <dir>: the burn lane's flags (its flags-*.json, kept outside this repository; stack issue 462)
  const flags = readBurnFlags(args['burn-flags']);
  for (const g of ALL.filter((x) => groups.includes(x))) {
    for (const arc of [...new Set(listed.filter((w) => w.group === g).flatMap((w) => w.arcs))].sort((a, b) => a - b)) {
      const ws = listed.filter((w) => w.group === g && w.arcs.includes(arc));
      const bs = ws.map((w) => base.get(`${w.key}|${arc}`));
      const complete = bs.every(Boolean);
      const label = complete ? chooseArm(g, bs) : null;
      let ffm = null;
      if (label) {
        const used = bs.filter((b) => b.arms[label]?.ok);
        const builds = [...new Set(used.map((b) => JSON.stringify(b.env?.ffm?.ffm ?? null)))];
        const settings = [...new Set(used.map((b) => b.arms[label].arm))];
        if (builds.length !== 1 || settings.length !== 1) throw new Error(`${g} ${arc} h: the stored ${label} rows mix FFM builds or settings (${builds.join(', ')}; ${settings.join(', ')})`);
        const b = JSON.parse(builds[0]);
        if (b?.sha256 !== FFM_220.wasmSha256) throw new Error(`${g} ${arc} h: FFM ${b?.version} ${b?.sha256} is not a build this file knows the commit of`);
        ffm = { version: b.version, wasmSha256: b.sha256, modulesCommit: FFM_220.modulesCommit, configuration: describe(SETTINGS[settings[0]]) + (SPREAD[`${g}|${arc}|${settings[0]}`] ?? '') };
      }
      // per lead: the windows where AP and (where it is measured) the numerical propagator were scored; XP on those of them where it was too
      // an outside theory's column stands only once that theory has a row (flown or failed) on every window of the row
      const flownAll = (t) => ws.every((w) => rowOf(t, w, arc));
      const failedOn = (t, w) => !!rowOf(t, w, arc)?.apError;
      const pairsAt = (day) => ws.map((w, i) => ({ w, a: meters(rowOf('AP', w, arc), null, day), f: label ? meters(bs[i], label, day) : null, x: meters(rowOf('SGP4XP', w, arc), null, day), u: meters(rowOf('USSFXP', w, arc), null, day), s: meters(rowOf('SGP4', w, arc), null, day), xF: failedOn('SGP4XP', w), uF: failedOn('USSFXP', w), sF: failedOn('SGP4', w) })).filter((p) => p.a != null && (!label || p.f != null));
      const leads = LEADS.map(([hours, day]) => {
        const pairs = pairsAt(day), withXp = pairs.filter((p) => p.x != null), withU = pairs.filter((p) => p.u != null), withS = pairs.filter((p) => p.s != null);
        // a theory's figure over its scored windows, with the count of those and of the lead's windows where its fit or flight failed
        const column = (scored, values, failed) => (scored.length || failed ? { ...stats(values), windows: scored.length, failed } : null);
        return {
          hours, windows: pairs.length,
          ap: pairs.length ? stats(pairs.map((p) => p.a)) : null,
          ffm: label ? (pairs.length ? stats(pairs.map((p) => p.f)) : null) : null,
          xp: column(withXp, withXp.map((p) => p.x), pairs.filter((p) => p.xF).length),
          xpUssf: flownAll('USSFXP') ? column(withU, withU.map((p) => p.u), pairs.filter((p) => p.uF).length) : null,
          sgp4: flownAll('SGP4') ? column(withS, withS.map((p) => p.s), pairs.filter((p) => p.sF).length) : null,
          apBeatsXp: withXp.length ? { windows: withXp.length, apBetter: withXp.filter((p) => p.a < p.x).length, medianApOverXp: round3(median(withXp.map((p) => p.a / p.x))) } : null,
          apBeatsXpUssf: flownAll('USSFXP') && withU.length ? { windows: withU.length, apBetter: withU.filter((p) => p.a < p.u).length, medianApOverXp: round3(median(withU.map((p) => p.a / p.u))) } : null,
          apFfmRank: label && pairs.length >= 10 ? { windows: pairs.length, rho: round3(spearman(pairs.map((p) => p.a), pairs.map((p) => p.f))) } : null,
        };
      });
      const pass = label ? pairsAt(PASS_LEAD_DAY) : [];
      const met = pass.filter(passes).length;
      const within100mOfFfm = label && pass.length ? { windows: pass.length, met, share: round3(met / pass.length) } : null;
      const burnSplit = within100mOfFfm ? splitByBurns(flags, pass, arc) : null;
      const scored = ws.filter((w, i) => LEADS.some(([, day]) => meters(rowOf('AP', w, arc), null, day) != null && (!label || meters(bs[i], label, day) != null)));
      const pcfLabel = A.apPcfFor(g, version, !!W.GROUPS[g].vacuum, arc).label;
      const stated = [...new Set(ws.map((w) => rowOf('AP', w, arc)?.pcf).filter(Boolean))];
      if (stated.some((x) => x !== pcfLabel)) throw new Error(`${g} ${arc} h: stored AP rows name $PCF ${stated.join(', ')}, the rule gives ${pcfLabel}`);
      // stack issue 489: a 72 h row flown with the burn lists (--burns) from MANEUVER72_SINCE states its fit process, with the windows each way
      const maneuvering = scored.filter((w) => rowOf('AP', w, arc)?.fitProcess === 'maneuvering: the arc after its last burn').length;
      const fitProcess = arc === 72 && A.maneuver72(version) && scored.some((w) => rowOf('AP', w, arc)?.fitProcess)
        ? `An object with its perigee at ${A.MANEUVER72.perigeeMinKm} km or above whose precise orbit holds a burn known at the cutoff, ending within ${A.MANEUVER72.historyDays} days before it, is fitted on the arc after its last such burn (${A.MANEUVER72.minHours} to ${A.MANEUVER72.capHours} h; the module fits it under its short-arc rule); every other window on the full 72 h. Windows: ${maneuvering} on the arc after a burn, ${scored.length - maneuvering} on the full arc.`
        : null;
      rows.push({ regime: W.GROUPS[g].label, truth: truthName(g, ws), fitData: `the truth's states over the ${arc} h before the cutoff, one every 300 s (GCRF)`, fitHours: arc, satellites: new Set(scored.map((w) => w.name)).size, windows: scored.length, apForces: A.AP_FORCES_TEXT[pcfLabel], ...(fitProcess ? { fitProcess } : {}), ffm, within100mOfFfm, leads, ...(burnSplit ? { burnSplit } : {}) });
      passOf.push({ g, arc, row: rows.at(-1), pass: within100mOfFfm ? pass : [] });
      if (/^AP_ECOM2/.test(pcfLabel)) ecom2Rows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
      if (/_TIDES$/.test(pcfLabel)) tideRows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
      for (const w of ws) for (const t of THEORIES) { const r = rowOf(t, w, arc), c = (tally[t] ??= { scored: 0, failed: 0, windowError: 0, none: 0 }); if (!r) c.none += 1; else if (r.error) c.windowError += 1; else if (r.apError) c.failed += 1; else c.scored += 1; }
      windowArcs += ws.length;
      const failed = (t) => ws.filter((w) => rowOf(t, w, arc)?.apError).length;
      console.error(`  ${g} ${arc} h: ${scored.length} of ${ws.length} windows scored${THEORIES.map((t) => (failed(t) ? `, ${t} failed on ${failed(t)}` : '')).join('')}; numerical arm ${label ? `${label} (${ffm.configuration.split(';')[0]})` : complete ? 'none properly configured' : 'being measured'}`);
    }
  }
  // --burn-flags: under each Near 700 km row, the altimetry row's pass line at the same fit length on those of its satellites at the same
  // altitudes, with its own split; the windows are the altimetry row's own, none taken from or added to either row
  const altitudeOf = new Map();
  if (flags) for (const m of passOf.filter((x) => x.g === SAME_ALTITUDES.row && x.pass.length)) {
    const from = passOf.find((x) => x.g === SAME_ALTITUDES.from && x.arc === m.arc && x.pass.length);
    if (!from) continue;
    for (const p of from.pass.slice().sort((x, y) => x.w.cutoffMs - y.w.cutoffMs)) {
      if (altitudeOf.has(p.w.name)) continue;
      const r = (await W.truthOf(p.w, p.w.cutoffMs - 3 * W.HOUR, p.w.cutoffMs, null)).lines.map((l) => Math.hypot(...l.r));
      altitudeOf.set(p.w.name, r.length ? r.reduce((s, x) => s + x, 0) / r.length - EQUATOR_KM : null);
    }
    const inBand = (n) => altitudeOf.get(n) >= SAME_ALTITUDES.fromKm && altitudeOf.get(n) <= SAME_ALTITUDES.toKm;
    const sub = from.pass.filter((p) => inBand(p.w.name)), met = sub.filter(passes).length, split = splitByBurns(flags, sub, m.arc);
    m.row.sameAltitudes = { label: SAME_ALTITUDES.label, regime: W.GROUPS[SAME_ALTITUDES.from].label, fitHours: m.arc, altitudeKm: { from: SAME_ALTITUDES.fromKm, to: SAME_ALTITUDES.toKm },
      satellites: [...new Set(from.pass.map((p) => p.w.name))].filter(inBand).sort().map((name) => ({ name, altitudeKm: Math.round(altitudeOf.get(name)) })),
      within100mOfFfm: sub.length ? { windows: sub.length, met, share: round3(met / sub.length) } : null, ...(split ? { burnSplit: split } : {}) };
  }
  // the pass line two-sided (owner, 2026-11-11: "It does not make sense that we can be more accurate than FFM"): a window counts where AP's
  // error and the numerical propagator's are within 100 m of each other either way, on the pass line's own windows; split by the burn flags
  // as burnSplit is. Written after every other field of the row.
  const eitherWay = (p) => Math.abs(p.a - p.f) <= PASS_M;
  for (const m of passOf.filter((x) => x.pass.length)) {
    const met = m.pass.filter(eitherWay).length;
    m.row.within100mEitherWay = { windows: m.pass.length, met, share: round3(met / m.pass.length) };
    if (m.row.burnSplit) m.row.within100mEitherWayBurnSplit = partsByBurns(flags, m.pass, m.arc, eitherWay);
  }
  for (const r of rows.filter((x) => x.burnSplit || x.sameAltitudes)) console.error(`  ${r.regime} ${r.fitHours} h: ${r.burnSplit?.label ?? 'no burn flags'}${r.sameAltitudes ? ` ${r.sameAltitudes.label}: ${r.sameAltitudes.within100mOfFfm?.met} of ${r.sameAltitudes.within100mOfFfm?.windows}; ${r.sameAltitudes.burnSplit?.label ?? 'no burn flags'}` : ''}`);
  const burnText = !flags ? '' : ` burnSplit, on the rows with burn flags (stack issue 462), splits the windows of the pass line (within100mOfFfm) by the burns that a detector reading the truth alone finds: velocity steps that the full numerical setting, flown from the truth's own states, does not explain, localized by halving (planted steps found down to 0.5 mm/s at 700 km; on the altimetry satellites, every burn of the IDS maneuver lists that falls where the truth covers it, and none that is not listed). burnInFitArc holds the windows with a burn in the fit arc; burnCutoffToDay5Only those with none there and one between the cutoff and day 5; noBurn those with neither; unflagged those the detector did not run on. The four are a partition: their windows and met add up to the pass line's. partlyCovered counts the windows where a span counted without a burn has hours without truth, which the detector cannot see; label states the counts in words. Neither fit solves a delta-v (the numerical fit has no such term), so a burn after the cutoff is missed by both and one in the fit arc is taken up by each fit's other terms.${rows.some((r) => r.sameAltitudes) ? ` sameAltitudes, under the ${W.GROUPS[SAME_ALTITUDES.row].label} rows, is the ${W.GROUPS[SAME_ALTITUDES.from].label} row's pass line at the same fit length on its satellites at ${SAME_ALTITUDES.fromKm} to ${SAME_ALTITUDES.toKm} km (mean geocentric distance less the equatorial radius over the truth's 3 h before each satellite's first scored cutoff), with its own burnSplit.` : ''} The flags cover ${count(flags.size)} window-arcs and are kept outside this repository (the first 12 hex digits of the sha256 of their files in name order, as for the builds: ${flags.sha256.slice(0, 12)}).`;
  // the method line's last sentences: each column's build, and what each scored over the table's window-arcs (a failure or a window
  // without truth is counted, never dropped); the rows whose AP fits state FORCES.ECOM2
  const short = (s) => String(s).slice(0, 12);
  const builds = { AP: `sdn-ap ${version} (modules ${short(commit)}, wasm ${short(wasmSha)})`,
    USSFXP: A.OUTSIDE.USSFXP.builds.map((b) => `${b.module} ${b.version} (modules ${short(b.modulesCommit)}, wasm ${short(b.wasmSha256)})`).join(', '),
    SGP4: A.OUTSIDE.SGP4.builds.map((b) => `${b.module} (modules ${short(b.modulesCommit)}, wasm ${short(b.wasmSha256)})`).join(', ') };
  const tallyOf = (t) => { const c = tally[t] ?? { scored: 0, failed: 0, windowError: 0, none: 0 }; return `scored ${c.scored.toLocaleString('en-US')} of ${windowArcs.toLocaleString('en-US')}, its fit or flight failed on ${c.failed}, no truth or coverage on ${c.windowError}${c.none ? `, not flown on ${c.none}` : ''}`; };
  const columns = `Columns by build: ap and xp come from ${builds.AP}, xpUssf from ${builds.USSFXP}, sgp4 from ${builds.SGP4}. Over the table's ${windowArcs.toLocaleString('en-US')} window-arcs (one window and one fit arc each), ap ${tallyOf('AP')}; xp ${tallyOf('SGP4XP')}; xpUssf ${tallyOf('USSFXP')}; sgp4 ${tallyOf('SGP4')}; each is counted in its column, none dropped. `
    + (ecom2Rows.length ? `The rows whose AP fits state $PCF FORCES.ECOM2 in this table: ${ecom2Rows.join(', ')}.` : 'No row\'s AP fits state $PCF FORCES.ECOM2 in this table.')
    + (tideRows.length === rows.length && rows.length ? ' Every row\'s AP fits state $PCF FORCES.SOLID_TIDES IERS 2010 in this table.' : tideRows.length ? ` The rows whose AP fits state $PCF FORCES.SOLID_TIDES IERS 2010 in this table: ${tideRows.join(', ')}.` : '');
  // --previous <the previous release table>: the rows that gained windows since it (a second pass coming in), so a moved row is not read
  // as the build's doing
  const previous = args.previous ? JSON.parse(fs.readFileSync(args.previous, 'utf8')) : null;
  const gained = previous ? rows.map((r) => ({ r, p: previous.rows.find((x) => x.regime === r.regime && x.fitHours === r.fitHours) })).filter(({ r, p }) => p && r.windows > p.windows) : [];
  const gainedText = !previous ? '' : gained.length
    ? ` Against the previous release table (sdn-ap ${previous.module.version}), these rows gained windows in this release, so their figures move with the windows added and not only with the build: ${gained.map(({ r, p }) => `${r.regime} (${r.fitHours} h fit), ${count(p.windows)} to ${count(r.windows)} scored windows`).join('; ')}.`
    : ` Against the previous release table (sdn-ap ${previous.module.version}), no row gained windows.`;
  // and the rows scored against a different numerical setting than in the previous table (its configuration sentence's field clause, or
  // the sentence where the field is the same), so a count that moved with the arm is not read as the build's doing either
  const field = (c) => String(c ?? '').split(';')[0].replace(/^Earth gravity to /, '');
  const armChanged = previous ? rows.map((r) => ({ r, p: previous.rows.find((x) => x.regime === r.regime && x.fitHours === r.fitHours) })).filter(({ r, p }) => p && (p.ffm?.configuration ?? null) !== (r.ffm?.configuration ?? null)) : [];
  const armText = armChanged.length
    ? ` These rows are scored against a different numerical setting than in that table: ${armChanged.map(({ r, p }) => `${r.regime} (${r.fitHours} h fit), ${field(p.ffm?.configuration) === field(r.ffm?.configuration) ? 'its configuration sentence changed' : `${field(p.ffm?.configuration) || 'none'} to ${field(r.ffm?.configuration) || 'none'}`}`).join('; ')}.`
    : '';
  const doc = {
    schema: 'sdn-ap-scoreboard/2',
    measured: new Date().toISOString().slice(0, 10),
    statistic: `${STATISTIC} ${columns}${gainedText}${armText}${burnText}${rows.some((r) => r.within100mEitherWay) ? EITHER_WAY_TEXT : ''}`,
    ffmSelection: FFM_SELECTION,
    windows: windowsText,
    module: { version, modulesCommit: commit, wasmSha256: wasmSha },
    harness: { repo: 'orbit-accuracy-experiments', commit: harnessCommit, command: ['node', 'experiments/headline-loop/table.mjs', ...repositoryArgs(process.argv.slice(2))].join(' ') },
    frame: 'GCRF, the module\'s own output',
    rows,
  };
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  console.error(`table: wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(0);
}

/** --check, end to end: table.mjs itself, as its own process, on the laser geodetic regime into a temporary store whose numerical rows are the
 *  real store's. The file holds exactly the agreed fields; every number equals the one recomputed here from the rows it read; with one
 *  window's numerical row taken away the row's numerical columns are null ("being measured"); a second run flies nothing. About a minute. */
async function check() {
  const E = await import('./lib/e2e.mjs');
  const { MODULES_ROOT } = await import('./lib/env.mjs');
  const A = await import('./lib/arms.mjs');
  const { check: ok, done } = E.checker('TABLE');
  const dir = E.tmp('table'), real = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  // the modules build the check flies: HEADLINE_LOOP_CHECK_MODULES_ROOT and _COMMIT, or this repository's modules checkout at HEAD
  const modulesRoot = process.env.HEADLINE_LOOP_CHECK_MODULES_ROOT ?? MODULES_ROOT;
  const commit = git(modulesRoot, 'rev-parse', '--verify', `${process.env.HEADLINE_LOOP_CHECK_MODULES_COMMIT ?? 'HEAD'}^{commit}`).toString().trim();
  const wasmSha = sha256(git(modulesRoot, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`));
  const version = JSON.parse(git(modulesRoot, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  const runIn = (store, out, more = [], groups = 'GD') => E.run('table.mjs', ['--modules-commit', commit, '--modules-root', modulesRoot, '--out', out, '--groups', groups, '--jobs', '8', ...more], { HEADLINE_LOOP_STORE: store });
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean);
  const gd = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => r.group === 'GD' && !r.period);
  // 1. the real numerical rows
  const s1 = path.join(dir, 's1'), out1 = path.join(dir, 'a.json');
  fs.mkdirSync(s1, { recursive: true });
  fs.symlinkSync(real, path.join(s1, A.NUMERICAL_STORE));
  const r1 = runIn(s1, out1);
  ok(r1.code === 0 && fs.existsSync(out1), `the table did not run: ${r1.err.slice(-300)}`);
  const doc = fs.existsSync(out1) ? E.readJson(out1) : {};
  ok(JSON.stringify(Object.keys(doc)) === JSON.stringify(['schema', 'measured', 'statistic', 'ffmSelection', 'windows', 'module', 'harness', 'frame', 'rows']) && doc.windows === 'The table holds 55 windows (one satellite and one cutoff each), cutoffs from 2025-10-11 to 2025-12-20.' && doc.schema === 'sdn-ap-scoreboard/2' && doc.frame === 'GCRF, the module\'s own output', `top-level fields: ${Object.keys(doc)}`);
  ok(doc.module?.modulesCommit === commit && doc.module?.wasmSha256 === wasmSha && /^[0-9a-f]{40}$/.test(doc.harness?.commit ?? ''), `module and harness: ${JSON.stringify(doc.module)} ${doc.harness?.commit}`);
  ok(doc.harness?.command === `node experiments/headline-loop/table.mjs --modules-commit ${commit} --groups GD --jobs 8` && !doc.harness.command.includes(dir), `the command, repository-relative: ${doc.harness?.command}`);
  const row = doc.rows?.[0];
  ok(doc.rows?.length === 1 && JSON.stringify(Object.keys(row ?? {})) === JSON.stringify(['regime', 'truth', 'fitData', 'fitHours', 'satellites', 'windows', 'apForces', 'ffm', 'within100mOfFfm', 'leads', 'within100mEitherWay']) && row.regime === 'Laser geodetic' && row.truth === 'ILRS' && row.fitHours === 72 && row.satellites === 5, `the row: ${JSON.stringify(row)?.slice(0, 300)}`);
  const gdLabel = A.apPcfFor('GD', version, false, 72).label;
  ok(row?.apForces === A.AP_FORCES_TEXT[gdLabel], `the laser geodetic row's forces: ${row?.apForces}`);
  ok(row?.ffm?.version === '2.2.0' && /^[0-9a-f]{64}$/.test(row.ffm.wasmSha256) && /ocean tides/.test(row.ffm.configuration) && !/Fbest|FFM/.test(row.ffm.configuration), `the numerical arm: ${JSON.stringify(row?.ffm)}`);
  // AP's and our XP's rows under the AP build, the Space Force XP's and SGP4's under their own builds, none in the other's place
  const sha12 = wasmSha.slice(0, 12), moduleRows = lines(path.join(s1, 'table', sha12, 'rows.jsonl'));
  const outsideFile = (store, t) => path.join(store, 'outside', A.OUTSIDE[t].key, 'rows.jsonl');
  const outsideRows = Object.keys(A.OUTSIDE).flatMap((t) => (fs.existsSync(outsideFile(s1, t)) ? lines(outsideFile(s1, t)) : []));
  ok(moduleRows.every((r) => ['AP', 'SGP4XP'].includes(r.theory) && r.ap?.sha256 === wasmSha) && outsideRows.every((r) => A.OUTSIDE[r.theory] && JSON.stringify(r.builds) === JSON.stringify(A.OUTSIDE[r.theory].builds)), 'rows in the wrong store or without their builds');
  const flown = [...moduleRows, ...outsideRows];
  ok(moduleRows.filter((r) => r.theory === 'AP' && (r.days || r.apError)).every((r) => r.pcf === gdLabel), `the laser geodetic AP rows name $PCF ${gdLabel}`);
  const apRows = new Map(flown.filter((r) => (r.theory ?? 'AP') === 'AP').map((r) => [r.key, r])), xpRows = new Map(flown.filter((r) => r.theory === 'SGP4XP').map((r) => [r.key, r]));
  const uRows = new Map(flown.filter((r) => r.theory === 'USSFXP').map((r) => [r.key, r])), sRows = new Map(flown.filter((r) => r.theory === 'SGP4').map((r) => [r.key, r]));
  ok([apRows, xpRows, uRows, sRows].every((m) => m.size === 55) && /propagator\/sgp4-xp/.test(doc.statistic) && /analysis\/gp-error-model/.test(doc.statistic), `rows flown: AP ${apRows.size}, XP ${xpRows.size}, Space Force XP ${uRows.size}, SGP4 ${sRows.size} (55 windows); the fitters named`);
  const med = (v) => round(quantile(v.slice().sort((a, b) => a - b), 0.5)), p95 = (v) => round(quantile(v.slice().sort((a, b) => a - b), 0.95));
  const pairsAt = (day) => gd.map((b) => ({ a: apRows.get(b.key)?.days?.[day]?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.[day]?.e : undefined, x: xpRows.get(b.key)?.days?.[day]?.e, u: uRows.get(b.key)?.days?.[day]?.e, s: sRows.get(b.key)?.days?.[day]?.e })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f));
  ok(JSON.stringify(row?.leads?.map((l) => l.hours)) === '[24,72,120,168]', `leads ${JSON.stringify(row?.leads?.map((l) => l.hours))}`);
  for (const [hours, day] of LEADS) {
    const pairs = pairsAt(day), wx = pairs.filter((p) => Number.isFinite(p.x)), wu = pairs.filter((p) => Number.isFinite(p.u)), ws = pairs.filter((p) => Number.isFinite(p.s));
    const l = row?.leads?.find((x) => x.hours === hours);
    const ranks = (v) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length + 1) / 2);
    const ra = ranks(pairs.map((p) => p.a * 1000)), rf = ranks(pairs.map((p) => p.f * 1000)), mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const cov = (u, v) => u.reduce((s, x, i) => s + (x - mean(u)) * (v[i] - mean(v)), 0), rho = cov(ra, rf) / Math.sqrt(cov(ra, ra) * cov(rf, rf));
    ok(l?.apFfmRank?.windows === pairs.length && l.apFfmRank.rho === round3(rho), `rank correlation at ${hours} h: ${JSON.stringify(l?.apFfmRank)} against ${round3(rho)} recomputed on ${pairs.length} windows`);
    ok(l && l.windows === pairs.length && l.ap.medianM === med(pairs.map((p) => p.a * 1000)) && l.ap.p95M === p95(pairs.map((p) => p.a * 1000)) && l.ffm.medianM === med(pairs.map((p) => p.f * 1000)) && l.ffm.p95M === p95(pairs.map((p) => p.f * 1000)), `lead ${hours} h: ${JSON.stringify(l)} against ${pairs.length} windows recomputed`);
    ok(l && wx.length && l.xp.windows === wx.length && l.xp.failed === 0 && l.xp.medianM === med(wx.map((p) => p.x * 1000)) && l.xp.p95M === p95(wx.map((p) => p.x * 1000)) 
      && l.apBeatsXp.windows === wx.length && l.apBeatsXp.apBetter === wx.filter((p) => p.a < p.x).length && l.apBeatsXp.medianApOverXp === round3(quantile(wx.map((p) => (p.a * 1000) / (p.x * 1000)).sort((a, b) => a - b), 0.5)), `XP at ${hours} h: ${JSON.stringify(l?.xp)} ${JSON.stringify(l?.apBeatsXp)} against ${wx.length} windows recomputed`);
    ok(l && wu.length && ws.length && l.xpUssf.windows === wu.length && l.xpUssf.failed === 0 && l.sgp4.windows === ws.length && l.sgp4.failed === 0 && l.xpUssf.medianM === med(wu.map((p) => p.u * 1000)) && l.xpUssf.p95M === p95(wu.map((p) => p.u * 1000)) && l.sgp4.medianM === med(ws.map((p) => p.s * 1000)) && l.sgp4.p95M === p95(ws.map((p) => p.s * 1000))
      && l.apBeatsXpUssf.windows === wu.length && l.apBeatsXpUssf.apBetter === wu.filter((p) => p.a < p.u).length && l.apBeatsXpUssf.medianApOverXp === round3(quantile(wu.map((p) => (p.a * 1000) / (p.u * 1000)).sort((a, b) => a - b), 0.5)), `Space Force XP and SGP4 at ${hours} h: ${JSON.stringify(l?.xpUssf)} ${JSON.stringify(l?.sgp4)} ${JSON.stringify(l?.apBeatsXpUssf)} against ${wu.length} and ${ws.length} windows recomputed`);
  }
  const pass = pairsAt('5'), met = pass.filter((p) => p.a * 1000 - p.f * 1000 < 100).length;
  ok(row?.within100mOfFfm?.windows === pass.length && row.within100mOfFfm.met === met && row.within100mOfFfm.share === round3(met / pass.length), `pass line: ${JSON.stringify(row?.within100mOfFfm)} against ${met} of ${pass.length} recomputed`);
  // the pass line two-sided: within 100 m of each other either way, on the same windows
  const either = pass.filter((p) => Math.abs(p.a * 1000 - p.f * 1000) <= 100).length;
  ok(row?.within100mEitherWay?.windows === pass.length && row.within100mEitherWay.met === either && row.within100mEitherWay.share === round3(either / pass.length) && either <= met && /within100mEitherWay counts/.test(doc.statistic ?? ''), `the two-sided pass line: ${JSON.stringify(row?.within100mEitherWay)} against ${either} of ${pass.length} recomputed`);
  // 2. one window's numerical row and one Space Force XP row taken away, the Space Force XP not flown: FFM, the pass line and the Space Force
  // XP are "being measured"; the other rows are reused, nothing flown
  const s2 = path.join(dir, 's2'), out2 = path.join(dir, 'b.json');
  fs.mkdirSync(path.join(s2, A.NUMERICAL_STORE), { recursive: true });
  fs.writeFileSync(path.join(s2, A.NUMERICAL_STORE, 'rows-truth-0of1.jsonl'), gd.slice(1).map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.mkdirSync(path.join(s2, 'table', sha12), { recursive: true });
  // and one window's XP and SGP4 rows turned into failures: counted as flown (the columns stand), out of the figures and the pair count
  const dropU = gd[0].key, failK = gd.find((g) => g.key !== dropU && ['1', '3', '5', '7'].every((d) => apRows.get(g.key)?.days?.[d]))?.key;
  const failed = (r) => (r.key === failK && ['SGP4XP', 'SGP4'].includes(r.theory) ? (({ days, ...rest }) => ({ ...rest, apError: 'made-up failure (the check)' }))(r) : r);
  fs.writeFileSync(path.join(s2, 'table', sha12, 'rows.jsonl'), moduleRows.map((r) => JSON.stringify(failed(r))).join('\n') + '\n');
  for (const t of Object.keys(A.OUTSIDE)) { fs.mkdirSync(path.dirname(outsideFile(s2, t)), { recursive: true }); fs.writeFileSync(outsideFile(s2, t), outsideRows.filter((r) => r.theory === t && !(t === 'USSFXP' && r.key === dropU)).map((r) => JSON.stringify(failed(r))).join('\n') + '\n'); }
  const r2 = runIn(s2, out2, ['--theories', 'AP,SGP4XP,SGP4']);
  const b = fs.existsSync(out2) ? E.readJson(out2).rows?.[0] : null;
  ok(r2.code === 0 && /, 0 to fly/.test(r2.err), `the second run flew again: ${r2.err.slice(-200)}`);
  const nAp = (h) => b?.leads?.find((l) => l.hours === h)?.windows;
  ok(b && b.leads.every((l) => l.xp.failed === 1 && l.xp.windows === nAp(l.hours) - 1 && l.apBeatsXp.windows === nAp(l.hours) - 1 && l.sgp4.failed === 1 && l.sgp4.windows === nAp(l.hours) - 1), `failed counts: ${JSON.stringify(b?.leads?.map((l) => [l.hours, l.windows, l.xp?.windows, l.xp?.failed, l.apBeatsXp?.windows, l.sgp4?.windows, l.sgp4?.failed]))}`);
  ok(b && b.ffm === null && b.within100mOfFfm === null && b.leads.every((l) => l.ffm === null && l.apFfmRank === null && l.ap && l.xp && l.sgp4 && l.xpUssf === null && l.apBeatsXpUssf === null) && b.leads[0].ap.medianM === row?.leads?.[0]?.ap?.medianM, `being measured: ${JSON.stringify(b)?.slice(0, 300)}`);
  // 3. the ECOM2 case: one medium Earth orbit window with both fit arcs; from 0.6.15 its 72 h fit names AP_ECOM2 and its 24 h fit AP
  if (A.atLeast(version, A.ECOM2_SINCE)) {
    const gnRows = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => r.group === 'GN' && !r.error && r.arms?.FFMq?.ok);
    const key = [...new Set(gnRows.map((r) => r.key))].sort().find((k) => [24, 72].every((a) => gnRows.some((r) => r.key === k && r.arcH === a)));
    const s3 = path.join(dir, 's3'), out3 = path.join(dir, 'c.json'), keys = path.join(dir, 'keys.txt');
    fs.mkdirSync(s3, { recursive: true }); fs.symlinkSync(real, path.join(s3, A.NUMERICAL_STORE)); fs.writeFileSync(keys, `${key}\n`);
    const r3 = runIn(s3, out3, ['--keys-file', keys, '--theories', 'AP,SGP4XP'], 'GN');
    const c = fs.existsSync(out3) ? E.readJson(out3) : { rows: [] }, stored = fs.existsSync(path.join(s3, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s3, 'table', sha12, 'rows.jsonl')).filter((r) => r.theory === 'AP') : [];
    const at = (h) => c.rows.find((x) => x.fitHours === h), pcfAt = (h) => stored.find((x) => x.arcH === h)?.pcf;
    ok(r3.code === 0 && pcfAt(72) === A.apPcfFor('GN', version, false, 72).label && pcfAt(24) === A.apPcfFor('GN', version, false, 24).label && /^AP_ECOM2/.test(pcfAt(72)) && /^AP(_TIDES)?$/.test(pcfAt(24)) && at(72)?.apForces === A.AP_FORCES_TEXT[pcfAt(72)] && at(24)?.apForces === A.AP_FORCES_TEXT[pcfAt(24)], `the ECOM2 case on ${key}: ${r3.err.slice(-200)} 72 h ${pcfAt(72)}, 24 h ${pcfAt(24)}`);
  } else console.log(`TABLE CHECK: the ECOM2 case did not run: the build flown is sdn-ap ${version}, which has no FORCES.ECOM2 term (AP solves it from ${A.ECOM2_SINCE})`);
  // 4. the same on one geostationary 72 h window, from the build that solves Y0 there (ECOM2_GEO_SINCE)
  if (A.atLeast(version, A.ECOM2_GEO_SINCE)) {
    const geRows = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => r.group === 'GE' && !r.error && r.arms?.FFMq?.ok);
    const key = geRows.map((r) => r.key).sort()[0];
    const s4 = path.join(dir, 's4'), out4 = path.join(dir, 'd.json'), keys = path.join(dir, 'keys-ge.txt');
    fs.mkdirSync(s4, { recursive: true }); fs.symlinkSync(real, path.join(s4, A.NUMERICAL_STORE)); fs.writeFileSync(keys, `${key}\n`);
    const r4 = runIn(s4, out4, ['--keys-file', keys, '--theories', 'AP,SGP4XP'], 'GE');
    const d = fs.existsSync(out4) ? E.readJson(out4) : { rows: [] }, stored = fs.existsSync(path.join(s4, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s4, 'table', sha12, 'rows.jsonl')).filter((r) => r.theory === 'AP') : [];
    const geLabel = A.apPcfFor('GE', version, false, 72).label;
    ok(r4.code === 0 && /^AP_ECOM2/.test(geLabel) && stored.find((x) => x.arcH === 72)?.pcf === geLabel && d.rows.find((x) => x.fitHours === 72)?.apForces === A.AP_FORCES_TEXT[geLabel], `the geostationary ECOM2 case on ${key}: ${r4.err.slice(-200)} ${stored.find((x) => x.arcH === 72)?.pcf}`);
  } else console.log(`TABLE CHECK: the geostationary ECOM2 case did not run: the build flown is sdn-ap ${version}, before ${A.ECOM2_GEO_SINCE}, which solves Y0 on the geostationary and inclined geosynchronous rows`);
  // 5. made-up burn flags on the laser geodetic windows (--burn-flags), five kinds in turn: the row is the row of the first run and burnSplit,
  // whose four parts add up to the pass line and each equal the one recomputed here; the command does not name the flags; nothing is flown
  const KINDS = ['fit', 'before5', 'neither', 'gap', 'unflagged'], fdir = path.join(dir, 'flags'), out5 = path.join(dir, 'e.json');
  const gdKeys = [...new Set(gd.map((r) => r.key))].sort(), kindOf = (key) => KINDS[gdKeys.indexOf(key) % KINDS.length];
  const madeUp = (key, arcH, k) => ({ key, arcH, detector: k !== 'unflagged', fit: { burn: k === 'fit', uncoveredH: 0 }, before5: { burn: ['fit', 'before5'].includes(k), uncoveredH: k === 'gap' ? 6 : 0 } });
  fs.mkdirSync(fdir, { recursive: true });
  fs.writeFileSync(path.join(fdir, 'flags-GD.json'), JSON.stringify({ windows: gdKeys.map((key) => madeUp(key, 72, kindOf(key))) }));
  const r5 = runIn(s1, out5, ['--burn-flags', fdir]);
  const e = fs.existsSync(out5) ? E.readJson(out5) : {}, er = e.rows?.[0];
  ok(r5.code === 0 && /, 0 to fly/.test(r5.err) && e.harness?.command === doc.harness?.command && !JSON.stringify(e).includes(fdir), `the run with flags: ${r5.err.slice(-200)} ${e.harness?.command}`);
  const plain = Object.keys(row ?? {}).filter((k) => k !== 'within100mEitherWay');
  ok(er && JSON.stringify(Object.keys(er)) === JSON.stringify([...plain, 'burnSplit', 'within100mEitherWay', 'within100mEitherWayBurnSplit']) && Object.keys(row ?? {}).every((k) => JSON.stringify(er[k]) === JSON.stringify(row[k])), 'with flags the row is the same row and burnSplit and the two-sided split, no window moved');
  // the two-sided split: the same four parts, within 100 m either way, adding up to within100mEitherWay
  const ew = (...ks) => { const ps = gd.map((b) => ({ key: b.key, a: apRows.get(b.key)?.days?.['5']?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.['5']?.e : undefined })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f) && ks.includes(kindOf(p.key))); return { windows: ps.length, met: ps.filter((p) => Math.abs(p.a * 1000 - p.f * 1000) <= 100).length }; };
  const wantEw = { burnInFitArc: ew('fit'), burnCutoffToDay5Only: ew('before5'), noBurn: ew('neither', 'gap'), unflagged: ew('unflagged') }, gotEw = er?.within100mEitherWayBurnSplit ?? {};
  ok(JSON.stringify(gotEw) === JSON.stringify(wantEw) && Object.values(gotEw).reduce((s, x) => s + x.met, 0) === row?.within100mEitherWay?.met && Object.values(gotEw).reduce((s, x) => s + x.windows, 0) === row?.within100mEitherWay?.windows, `the two-sided split: ${JSON.stringify(gotEw)} against ${JSON.stringify(wantEw)} recomputed`);
  const pass5 = gd.map((b) => ({ key: b.key, a: apRows.get(b.key)?.days?.['5']?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.['5']?.e : undefined })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f));
  const part = (...ks) => { const ps = pass5.filter((p) => ks.includes(kindOf(p.key))); return { windows: ps.length, met: ps.filter((p) => p.a * 1000 - p.f * 1000 < 100).length }; };
  const want5 = { burnInFitArc: part('fit'), burnCutoffToDay5Only: part('before5'), noBurn: part('neither', 'gap'), unflagged: part('unflagged'), partlyCovered: part('gap').windows };
  const bs5 = er?.burnSplit ?? {}, sum = (f) => ['burnInFitArc', 'burnCutoffToDay5Only', 'noBurn', 'unflagged'].reduce((s, k) => s + (bs5[k]?.[f] ?? NaN), 0);
  ok(JSON.stringify(Object.fromEntries(Object.keys(want5).map((k) => [k, bs5[k]]))) === JSON.stringify(want5) && sum('windows') === row?.within100mOfFfm?.windows && sum('met') === row?.within100mOfFfm?.met && KINDS.every((k) => part(k).windows > 0), `the split: ${JSON.stringify(bs5)} against ${JSON.stringify(want5)} recomputed, the pass line ${JSON.stringify(row?.within100mOfFfm)}`);
  ok(new RegExp(`^Of the ${pass5.length} windows on the pass line, .* fit arc on ${want5.burnInFitArc.windows} \\(.* on ${want5.burnInFitArc.met} of them\\).* alone on ${want5.burnCutoffToDay5Only.windows} \\(on ${want5.burnCutoffToDay5Only.met}\\) and in neither on ${want5.noBurn.windows} \\(on ${want5.noBurn.met}\\); the burn detector did not run on ${want5.unflagged.windows} \\(on ${want5.unflagged.met}\\); on ${want5.partlyCovered} of them .*\\.$`).test(bs5.label ?? '') && /burnSplit/.test(e.statistic) && !/sameAltitudes/.test(e.statistic), `the split's sentence: ${bs5.label}`);
  // the flag files named by the first 12 hex digits of their sha256 (no 64-digit word in the method line)
  const flagSha = sha256(fs.readFileSync(path.join(fdir, 'flags-GD.json')));
  ok(e.statistic?.includes(`: ${flagSha.slice(0, 12)})`) && !e.statistic.includes(flagSha) && !/[0-9a-f]{13,}/.test(e.statistic), `the flags' digest in the method line: ${e.statistic?.slice(-200)}`);
  // 6. the same altitudes: one Near 700 km window and two altimetry windows, one of a satellite at 600 to 850 km (CryoSat-2, about 720 km)
  // and one above (Jason-3, about 1,340 km), flown by AP alone: each Near 700 km row carries the altimetry row's pass line on the first
  // alone, equal to the one recomputed here from the rows flown and the altimetry row's arm, with its own split
  const real6 = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => ['S1', 'DO'].includes(r.group) && !r.error && !r.period);
  const both = (k) => [24, 72].every((a) => real6.some((r) => r.key === k && r.arcH === a && PREFER.some((x) => r.arms?.[x]?.ok && Number.isFinite(r.arms[x].days?.['5']?.e))));
  const pick = (pred) => [...new Set(real6.filter(pred).map((r) => r.key))].sort().find(both);
  const k6 = { S1: pick((r) => r.group === 'S1'), in: pick((r) => r.name === 'CRYOSAT 2'), out: pick((r) => r.name === 'JASON 3') };
  const s6 = path.join(dir, 's6'), out6 = path.join(dir, 'f.json'), keys6 = path.join(dir, 'keys-6.txt'), fdir6 = path.join(dir, 'flags-6');
  fs.mkdirSync(s6, { recursive: true }); fs.symlinkSync(real, path.join(s6, A.NUMERICAL_STORE)); fs.mkdirSync(fdir6, { recursive: true });
  fs.writeFileSync(keys6, `${Object.values(k6).join('\n')}\n`);
  fs.writeFileSync(path.join(fdir6, 'flags-S1.json'), JSON.stringify({ windows: [24, 72].map((a) => madeUp(k6.S1, a, 'fit')) }));
  fs.writeFileSync(path.join(fdir6, 'flags-DO.json'), JSON.stringify({ windows: [24, 72].flatMap((a) => [madeUp(k6.in, a, 'before5'), madeUp(k6.out, a, 'neither')]) }));
  const r6 = runIn(s6, out6, ['--keys-file', keys6, '--theories', 'AP', '--burn-flags', fdir6], 'S1,DO');
  const f6 = fs.existsSync(out6) ? E.readJson(out6) : { rows: [] }, ap6 = new Map((fs.existsSync(path.join(s6, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s6, 'table', sha12, 'rows.jsonl')) : []).filter((r) => r.theory === 'AP').map((r) => [`${r.key}|${r.arcH}`, r]));
  for (const a of [24, 72]) {
    const near = f6.rows.find((r) => r.regime === 'Near 700 km' && r.fitHours === a), alt = f6.rows.find((r) => r.regime === 'Low orbit, altimetry' && r.fitHours === a);
    const arm = PREFER.find((x) => [k6.in, k6.out].some((k) => real6.find((r) => r.key === k && r.arcH === a)?.arms?.[x]?.ok));
    const nIn = real6.find((r) => r.key === k6.in && r.arcH === a), apIn = ap6.get(`${k6.in}|${a}`)?.days?.['5']?.e, fIn = nIn?.arms?.[arm]?.ok ? nIn.arms[arm].days?.['5']?.e : undefined;
    const metIn = Number(apIn * 1000 - fIn * 1000 < 100), s = near?.sameAltitudes;
    ok(r6.code === 0 && Number.isFinite(apIn) && Number.isFinite(fIn) && near?.burnSplit?.burnInFitArc?.windows === 1 && alt?.burnSplit && !alt.sameAltitudes
      && s?.label === SAME_ALTITUDES.label && s.regime === 'Low orbit, altimetry' && s.fitHours === a && JSON.stringify(s.satellites.map((x) => x.name)) === '["CRYOSAT 2"]' && s.satellites[0].altitudeKm > 650 && s.satellites[0].altitudeKm < 800
      && s.within100mOfFfm?.windows === 1 && s.within100mOfFfm.met === metIn && JSON.stringify(s.burnSplit && [s.burnSplit.burnCutoffToDay5Only, s.burnSplit.noBurn.windows, s.burnSplit.burnInFitArc.windows, s.burnSplit.unflagged.windows]) === JSON.stringify([{ windows: 1, met: metIn }, 0, 0, 0]) && /sameAltitudes/.test(f6.statistic),
    `the same altitudes at ${a} h on ${Object.values(k6).join(', ')}: ${r6.err.slice(-300)} ${JSON.stringify(s)}`);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  done('table.mjs writes exactly the agreed fields (version 2) for the laser geodetic regime at 24, 72, 120 and 168 h: AP, FFM, our SGP4-XP, the Space Force XP and SGP4 medians and 95th percentiles, AP against both XPs as counts, the rank correlation of AP\'s and FFM\'s errors, and the 100 m pass line at 120 h, one-sided and either way, each equal to the one recomputed from the rows it read; the fitters named; the command line repository-relative; the numerical arm named in plain words on FFM 2.2.0; AP\'s forces per row ($PCF AP on the laser geodetic row; from 0.6.15, AP_ECOM2 on a medium Earth orbit 72 h fit and AP on its 24 h fit; from 0.6.19, AP_ECOM2 on a geostationary 72 h fit); with one numerical row and one Space Force XP row missing those columns are being measured (null) and nothing is flown again; a window where our XP and SGP4 failed is counted as flown, in failed, out of their figures and out of AP\'s pair count; with made-up burn flags the row is the same row with burnSplit and the two-sided split, whose four parts each add up to their pass line and equal the ones recomputed, the flags not named in the file; under each Near 700 km row the altimetry row\'s pass line on its satellite at 600 to 850 km alone, recomputed, with its own split');
}

function round(x) { return x == null ? null : Math.round(x * 100) / 100; }
// the command line the file names, in repository-relative form: without the arguments that are local paths (the modules clone, the output file)
function repositoryArgs(argv) { const out = []; for (let i = 0; i < argv.length; i += 1) { if (['--modules-root', '--out', '--previous', '--burn-flags', '--burns'].includes(argv[i])) { i += 1; continue; } out.push(argv[i]); } return out; }
/** --burn-flags <dir>: every flags-*.json there ({ windows: [{ key, arcH, detector, fit: { burn, uncoveredH }, before5: { burn, uncoveredH } }] }),
 *  the window-arcs the detector ran on (an entry with both spans and without detector false), by "<key>|<arcH>", and the sha256 of the files in name order; null without the option. Two files
 *  that give one window-arc different verdicts are refused; of two that agree, the one with fewer hours without truth is kept. */
function readBurnFlags(dir) {
  if (!dir) return null;
  const files = fs.readdirSync(dir).filter((f) => /^flags-.*\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`--burn-flags ${dir}: no flags-*.json`);
  const out = new Map(), hash = crypto.createHash('sha256');
  const verdict = (x) => `${!!x.fit?.burn}|${!!x.before5?.burn}`, unseen = (x) => (x.fit?.uncoveredH ?? 0) + (x.before5?.uncoveredH ?? 0);
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    hash.update(bytes);
    for (const x of JSON.parse(bytes.toString('utf8')).windows ?? []) {
      if (x.detector === false || !x.fit || !x.before5) continue;
      const k = `${x.key}|${x.arcH}`, had = out.get(k);
      if (had && verdict(had) !== verdict(x)) throw new Error(`--burn-flags: the files disagree on ${k} (${f})`);
      if (!had || unseen(x) < unseen(had)) out.set(k, x);
    }
  }
  out.sha256 = hash.digest('hex');
  return out;
}
/** A row's pass line split by the burns flagged on its windows: a partition of its windows and met counts, and a sentence of the counts;
 *  null without flags or where no window of the row is flagged (the row prints nothing new). */
/** The four parts of a pass line's windows by the burn flags, each { windows, met } under the given test. */
function partsByBurns(flags, pass, arc, test) {
  const parts = { burnInFitArc: [], burnCutoffToDay5Only: [], noBurn: [], unflagged: [] };
  for (const p of pass) { const x = flags.get(`${p.w.key}|${arc}`); parts[!x ? 'unflagged' : x.fit?.burn ? 'burnInFitArc' : x.before5?.burn ? 'burnCutoffToDay5Only' : 'noBurn'].push(p); }
  return Object.fromEntries(Object.entries(parts).map(([k, ps]) => [k, { windows: ps.length, met: ps.filter(test).length }]));
}
function splitByBurns(flags, pass, arc) {
  if (!flags || !pass.length) return null;
  let partlyCovered = 0;
  for (const p of pass) {
    const x = flags.get(`${p.w.key}|${arc}`);
    if (x && !x.fit?.burn && (x.fit?.uncoveredH > 0 || (!x.before5?.burn && x.before5?.uncoveredH > 0))) partlyCovered += 1;
  }
  const out = partsByBurns(flags, pass, arc, passes);
  if (out.unflagged.windows === pass.length) return null;
  const { burnInFitArc: a, burnCutoffToDay5Only: b, noBurn: c, unflagged: u } = out;
  out.partlyCovered = partlyCovered;
  out.label = `Of the ${pass.length} windows on the pass line, a burn is found in the truth in the fit arc on ${a.windows} (AP within 100 m of the numerical propagator at day 5 on ${a.met} of them), between the cutoff and day 5 alone on ${b.windows} (on ${b.met}) and in neither on ${c.windows} (on ${c.met})`
    + (u.windows ? `; the burn detector did not run on ${u.windows} (on ${u.met})` : '')
    + (partlyCovered ? `; on ${partlyCovered} of them a span counted without a burn has hours without truth, which the detector cannot see` : '') + '.';
  return out;
}
function round3(x) { return x == null ? null : Math.round(x * 1000) / 1000; }
/** Spearman's rank correlation: Pearson's correlation of the ranks, tied values given their average rank. */
function spearman(x, y) {
  const rank = (v) => {
    const order = v.map((value, i) => [value, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length);
    for (let i = 0; i < order.length;) { let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1; for (let k = i; k <= j; k += 1) r[order[k][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
  };
  const rx = rank(x), ry = rank(y), n = x.length, mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** A setting in one plain sentence: gravity, drag and its weather, radiation pressure, third bodies, tides, relativity, what is fitted, the integrator. */
function describe(s) {
  const f = s.forces, kinds = s.parameters.map((p) => p.kind), ecom = kinds.filter((k) => k.startsWith('ECOM2_')).map((k) => k.slice(6).replace('_COS', ' cos').replace('_SIN', ' sin'));
  const radiation = ecom.length ? `solar radiation pressure by the ECOM2 model (${ecom.join(', ')})` : f.srp ? `solar radiation pressure on a sphere${kinds.includes('SRP_AREA_OVER_MASS') ? '' : ` (area to mass held at ${s.fixed.agom} m2/kg)`}` : 'no radiation pressure';
  const fitted = ['the initial state', ...(kinds.includes('DRAG_AREA_OVER_MASS') ? ['the drag area to mass'] : []), ...(kinds.includes('SRP_AREA_OVER_MASS') ? ['the radiation area to mass'] : []), ...(ecom.length ? ['the five ECOM2 terms'] : [])];
  const and = (v) => (v.length > 1 ? `${v.slice(0, -1).join(', ')} and ${v.at(-1)}` : v[0]);
  const tides = [...(f.solidTides ? ['solid Earth tides'] : []), ...(f.oceanTides ? ['ocean tides (FES2004 to degree 30)'] : [])];
  return [
    `Earth gravity to degree and order ${f.degree}`,
    f.drag ? 'atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff (GFZ observed F10.7 and Ap, then the NOAA SWPC forecast issued before it)' : 'no atmospheric drag',
    radiation,
    ...(f.earthRadiation ? ['Earth radiation pressure (Knocke)'] : []),
    f.thirdBodies?.length ? 'the Sun and Moon' : 'no third bodies',
    tides.length ? and(tides) : 'no tides',
    f.relativity ? 'general relativity (IERS 2010)' : 'no relativity',
    `integrated by RK78 at a tolerance of ${s.integrator.tolerance} with steps up to ${s.integrator.maxStep} s; fitted by batch least squares (analysis/estimation) for ${and(fitted)}.`,
  ].join('; ').replace(/^./, (c) => c.toUpperCase());
}
