// XP2F runner (PLAN.md): one window, every arm, module calls only; JavaScript moves FlatBuffers, reads truth by XM's code and does statistics. Rows go to <store>/rows/<span>.w<k>.jsonl.
//   node experiments/xp2-fit-design/run.mjs --control            the spent-window control (PLAN.md, Reproduction): XM's windows only; a miss stops the run
//   node experiments/xp2-fit-design/run.mjs --launch --span primary [--workers 8]   detached workers under nice, a PID file, no pattern kills
//   node experiments/xp2-fit-design/run.mjs --worker K --span S  one worker: claims windows by mkdir, stops claiming below the disk floor
//   node experiments/xp2-fit-design/run.mjs --status             counts of windows, failures and times; no score is printed
//   node experiments/xp2-fit-design/run.mjs --check              the E2E: the pinned windows re-run and compared exactly, the table rebuilt byte for byte
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { config, store, root, dir, control, args, DAY, HOUR, iso, ms, dateOf, isoWeek, rms, XM, frozen, sourcesCommitted, windows, objectOf, spanOfDate, appendJsonl, readJsonl, write, build } from './common.mjs';

frozen();
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
const X2_FORCES = XM.config.arms.X2.forces, FIT = { dragPrior: XM.config.fit.dragPrior, srpPrior: XM.config.fit.srpPrior };
const rowsDir = path.join(store, 'rows'), claimsDir = path.join(store, 'claims');
const short = (e) => String(e?.message ?? e).slice(0, 240);
const GiB = 2 ** 30;
const diskFree = () => { const s = fs.statfsSync(store); return s.bavail * s.bsize; };

// ---- the term: a statistic at output (PLAN.md, Reproduction) ------------------------------------------------------------
const TERM = config.term, T0 = Date.parse(TERM.T0);
function termOf(set, o) {
  const node0 = set.elements.RA_OF_ASC_NODE * Math.PI / 180, dset = (ms(set.epoch) - T0) / DAY, od = TERM.Od[o.name];
  return (t) => { const d = (t - T0) / DAY, ph = 2 * (node0 + od * (d - dset) - TERM.W_E * d); return TERM.a * Math.cos(ph) + TERM.b * Math.sin(ph); };
}

// ---- one window ---------------------------------------------------------------------------------------------------------
async function modules() {
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const { publicSetAt } = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const { openFfm, driverRows } = await import(path.join(root, config.xm3.dir, 'lib/ffm.mjs'));
  const { openSgp4Fit } = await import('./lib/sgp4fit.mjs');
  const m = await openModules(), F = await openFfm(), G = await openSgp4Fit();
  return { S, T, W, publicSetAt, driverRows, m, F, G, close: async () => { await F.close(); await m.close(); } };
}

export async function scoreWindow(x, w, { sources = null, primaryOnly = w.span === 'primary' } = {}) {
  const { S, T, W, publicSetAt, driverRows, m, F, G } = x;
  const { o, cutoffMs: D0, key } = w;
  const t00 = Date.now(), timing = { fitMs: {}, ffmMs: {} };
  const row = { key, span: w.span, norad: o.norad, name: o.name, cluster: o.cluster, cutoff: iso(D0), isoWeek: isoWeek(D0), arms: {} };
  const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
  const first = after.length ? ms(after[0].epoch) : 0;
  const grid = after.filter((l) => (ms(l.epoch) - first) % GRID === 0);
  const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
  row.binEpochs = Object.fromEntries(LEADS.map((k) => [k, bins[k].length]));
  const entered = LEADS.filter((k) => bins[k].length >= MIN_BIN);
  row.entered = entered;
  if (!entered.length) { row.excluded = 'no lead bin holds 260 epochs'; return finish(); }
  const scored = entered.flatMap((k) => bins[k]);
  const epochs = scored.map((l) => l.epoch), epochsMs = epochs.map(ms), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
  const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
  if (O.excluded) { row.excluded = O.excluded; return finish(); }
  row.rsga = O.rsga;
  row.apArc = Math.max(...[1, 2, 3].map((k) => W.gfzDays().days.get(dateOf(D0 - k * DAY))?.ap ?? 0));
  const held = driverRows(O.rows, D0);
  const exO = { rows: S.spwBytes(O.rows) };
  const gridB = S.gridBytes(epochs);
  const set = publicSetAt(o.norad, D0);
  const L = set ? termOf(set, o) : null;
  const score = (e) => {
    const days = {}; let i = 0;
    entered.forEach((k, j) => {
      const s = e.slice(i, i + sizes[j]), tt = epochsMs.slice(i, i + sizes[j]); i += sizes[j];
      const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c])));
      days[k] = { e: Math.hypot(...ric), t: ric[1], mt: s.reduce((a, q) => a + q[1], 0) / s.length, n: s.length };
      if (L) days[k].eL = Math.sqrt(s.reduce((a, q, u) => a + q[0] ** 2 + (q[1] - L(tt[u])) ** 2 + q[2] ** 2, 0) / s.length);
    });
    return days;
  };
  const finite = (st) => st.every((q) => q && [...q.r, ...q.v].every(Number.isFinite));
  // the arcs
  const arc = (end, hours) => {
    const raw = T.series(o, end - hours * HOUR, end).lines;
    const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
    return { coverage, thin: coverage >= MIN_COV ? T.thinned(raw).chosen : null };
  };
  const oemOf = (thin, end) => S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(end) });
  const PCF0 = S.pcfBytes({ forces: X2_FORCES, fit: FIT });
  const pinned = (b) => S.pcfBytes({ forces: X2_FORCES, fit: { dragPrior: { form: config.pinnedBterm.form, mean: b, sigma: config.pinnedBterm.sigma }, srpPrior: FIT.srpPrior } });
  const flyXp = async (name, f, pcf, extra) => {
    const st = await m.propagate(f.omm, gridB, pcf, exO, epochs.length);
    if (!finite(st)) { row.arms[name] = { ok: false, error: 'non-finite state', ...extra }; return; }
    row.arms[name] = { ok: true, ...extra, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
  };
  /** A free XP fit: { b, info } or null with the arm recorded when `name` flies it. */
  const freeFit = async (end, hours, name, fly) => {
    const a = arc(end, hours);
    if (!a.thin) { if (name) row.arms[name] = { ok: false, notRun: 'coverage', coverage: a.coverage }; return { notRun: true, coverage: a.coverage }; }
    const f = await m.fit(oemOf(a.thin, end), PCF0, exO);
    if (name) timing.fitMs[name] = Math.round(f.fitMs);
    if (!f.ok) { if (name) row.arms[name] = { ok: false, error: f.error }; return { error: f.error }; }
    const info = S.readFitOmm(f.omm);
    if (fly) await flyXp(name, f, PCF0, { bterm: info.bterm, fitRmsKm: info.fitRmsKm, iterations: info.iterations, states: info.states });
    return { b: info.bterm, info };
  };
  /** Elements from the last 17 h with BTERM held (PLAN.md, Arms). */
  const refit = async (name, end, b, source) => {
    if (!(b > 0)) { row.arms[name] = { ok: false, error: `no positive B from ${source}` }; return; }
    const a = arc(end, config.arcs.elements);
    if (!a.thin) { row.arms[name] = { ok: false, notRun: 'coverage', coverage: a.coverage }; return; }
    const pcf = pinned(b), f = await m.fit(oemOf(a.thin, end), pcf, exO);
    timing.fitMs[name] = Math.round(f.fitMs);
    if (!f.ok) { row.arms[name] = { ok: false, error: f.error, bHeld: b }; return; }
    const info = S.readFitOmm(f.omm);
    await flyXp(name, f, pcf, { bHeld: b, source, bterm: info.bterm, fitRmsKm: info.fitRmsKm, iterations: info.iterations, states: info.states });
  };
  /** An FFM fit of `hours` ending at `end`, XM3's settings: { b, fit } or { notRun } or { error }; the sample requested is the cutoff, unscored. */
  const ffmB = async (name, end, hours) => {
    const a = arc(end, hours);
    if (!a.thin) return { notRun: true, coverage: a.coverage };
    const ar = await F.arm(o.norad, a.thin, [iso(D0)], held.rows, null);
    timing.ffmMs[name] = Math.round(ar.fitMs);
    if (!ar.ok) return { error: String(ar.error).slice(0, 200), fit: ar.fit ? { termination: ar.fit.termination } : null };
    return { b: ar.fit.parameters.find((p) => p.kind === 'DRAG_AREA_OVER_MASS')?.value, fit: { termination: ar.fit.termination, iterations: ar.fit.iterations, boundStatus: ar.fit.boundStatus, weightedRms: ar.fit.weightedRms, agom: ar.fit.parameters.find((p) => p.kind === 'SRP_AREA_OVER_MASS')?.value } };
  };
  const rf = async (name, end, hours) => {
    try {
      const r = await ffmB(name, end, hours);
      if (r.notRun) { row.arms[name] = { ok: false, notRun: 'coverage', coverage: r.coverage }; return; }
      if (r.error) { row.arms[name] = { ok: false, error: r.error, ffm: r.fit }; return; }
      await refit(name, end, r.b, `FFM ${hours} h`);
      if (row.arms[name]) row.arms[name].ffm = r.fit;
    } catch (error) { row.arms[name] = { ok: false, error: short(error) }; }
  };
  /** Plain SGP4 fitted to truth and flown as P (PLAN.md, Arms): the fit's B* returned. */
  const sgp = async (name, end, hours, bstar) => {
    const a = arc(end, hours);
    if (!a.thin) { row.arms[name] = { ok: false, notRun: 'coverage', coverage: a.coverage }; return null; }
    const t1 = performance.now();
    try {
      const { fr, el, bstar: b } = await G.fit(oemOf(a.thin, end), { from: iso(end - hours * HOUR), to: iso(end), epoch: 'last', ...(bstar == null ? { fitBstar: true } : { fitBstar: false, bstar }) }, o);
      timing.fitMs[name] = Math.round(performance.now() - t1);
      const st = await m.propagateSgp4(el, o.norad, epochsMs, XM.config.scoring.gridSeconds);
      if (st.some((q) => q == null) || !finite(st)) { row.arms[name] = { ok: false, error: 'no state', bstar: b }; return b; }
      row.arms[name] = { ok: true, bstar: b, rmsKm: fr.rms?.rms3dKm, iterations: fr.iterations, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
      return b;
    } catch (error) { row.arms[name] = { ok: false, error: short(error) }; return null; }
  };

  // P
  if (set) {
    row.set = { epoch: set.epoch, creation: set.creationDate, gpId: set.gpId, ageHours: (D0 - ms(set.epoch)) / HOUR, creationAgeHours: (D0 - ms(set.creationDate)) / HOUR };
    try {
      const st = await m.propagateSgp4(set, o.norad, epochsMs, XM.config.scoring.gridSeconds);
      row.P = st.some((q) => q == null) || !finite(st) ? { ok: false, error: 'no state' } : { ok: true, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
    } catch (error) { row.P = { ok: false, error: short(error) }; }
  } else row.noSet = true;
  // the cutoff reading
  let x2;
  try { x2 = await freeFit(D0, config.arcs.free, 'X2', true); } catch (error) { row.arms.X2 = { ok: false, error: short(error) }; x2 = { error: short(error) }; }
  try { if (x2.b > 0) await refit('R17', D0, x2.b, 'X2'); else row.arms.R17 = x2.notRun ? { ok: false, notRun: 'coverage' } : { ok: false, error: 'X2 failed' }; } catch (error) { row.arms.R17 = { ok: false, error: short(error) }; }
  await rf('RF17', D0, config.arcs.ffmLong);
  await rf('RFa24', D0, 24);
  await rf('RFa12', D0, 12);
  const b72 = await sgp('S72L', D0, config.arcs.sgp4Long, null);
  if (b72 != null) await sgp('S17LF', D0, config.arcs.elements, b72); else row.arms.S17LF = row.arms.S72L?.notRun ? { ok: false, notRun: 'coverage' } : { ok: false, error: 'S72L failed' };
  // data age and parity need the public set
  if (set) {
    const Tc = Math.min(D0, ms(set.creationDate));
    await sgp('S17LP', D0, config.arcs.elements, set.elements.BSTAR);
    await sgp('S17LPc', Tc, config.arcs.elements, set.elements.BSTAR);
    await rf('RFa12c', Tc, 12);
    try { const xc = await freeFit(Tc, config.arcs.free, null, false); if (xc.b > 0) await refit('R17c', Tc, xc.b, 'XP 72 h ending at the set\'s creation'); else row.arms.R17c = xc.notRun ? { ok: false, notRun: 'coverage' } : { ok: false, error: `XP 72 h: ${xc.error}` }; } catch (error) { row.arms.R17c = { ok: false, error: short(error) }; }
    if (primaryOnly) { await rf('RFa24c', Tc, 24); await rf('RF17c', Tc, config.arcs.ffmLong); }
  }
  return finish();

  function finish() {
    row.build = build.modulesCommit.slice(0, 12);
    row.sources = sources;
    timing.wallS = (Date.now() - t00) / 1000;
    row.timing = timing;
    return row;
  }
}

// ---- the spent-window control ----------------------------------------------------------------------------------------------
async function runControl() {
  if (!control) throw new Error('--control needs XP2F_CONTROL=1');
  const x = await modules();
  const xmRows = new Map(), x3Rows = new Map();
  for (const f of fs.readdirSync(config.xm.rows).filter((n) => n.endsWith('.jsonl'))) for (const l of fs.readFileSync(path.join(config.xm.rows, f), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (r.group === 'P' && !xmRows.has(r.key)) xmRows.set(r.key, r); }
  for (const f of fs.readdirSync(config.xm3.rows).filter((n) => /^O\.s\d+\.jsonl$/.test(n))) for (const l of fs.readFileSync(path.join(config.xm3.rows, f), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); if (!r.defect && r.group === 'P') x3Rows.set(r.key, r); }
  const keys = (args.windows ?? 'P|39452|2026-03-10,P|43476|2026-03-10').split(',');
  const report = [];
  let misses = 0;
  const miss = (k, what, a, b) => { misses += 1; report.push(`MISS ${k} ${what}: ${a} against ${b}`); };
  for (const key of keys) {
    const [, norad, date] = key.split('|');
    const o = objectOf(norad), cutoffMs = Date.parse(`${date}T00:00:00Z`);
    const t0 = Date.now();
    const row = await scoreWindow(x, { key, span: 'control', o, date, cutoffMs }, { primaryOnly: true });
    const xr = xmRows.get(key), x3 = x3Rows.get(key);
    for (const k of row.entered) {
      if (row.P?.days?.[k]?.e !== xr.P.days[k].rmsKm) miss(key, `P e day ${k}`, row.P?.days?.[k]?.e, xr.P.days[k].rmsKm);
      if (row.P?.days?.[k]?.t !== xr.P.days[k].atKm) miss(key, `P t day ${k}`, row.P?.days?.[k]?.t, xr.P.days[k].atKm);
      const xa = xr.arcs['72'].arms.X2O;
      if (row.arms.X2?.days?.[k]?.e !== xa.days[k].rmsKm) miss(key, `X2 e day ${k}`, row.arms.X2?.days?.[k]?.e, xa.days[k].rmsKm);
    }
    if (row.arms.X2?.bterm !== xr.arcs['72'].arms.X2O.fit.bterm) miss(key, 'X2 BTERM', row.arms.X2?.bterm, xr.arcs['72'].arms.X2O.fit.bterm);
    const bF = x3?.arms?.F2?.fit?.parameters?.find((p) => p.kind === 'DRAG_AREA_OVER_MASS')?.value;
    if (row.arms.RF17?.bHeld !== bF) miss(key, 'RF17 B against XM3\'s F2', row.arms.RF17?.bHeld, bF);
    // the diagnosis's rows of the same arms, where a sample holds this window (scratch rows; report only)
    if (process.env.XP2F_CRITIC) {
      const look = (tag) => { for (const f of fs.readdirSync(process.env.XP2F_CRITIC).filter((n) => new RegExp(`^${tag}\\.w\\d+\\.jsonl$`).test(n))) for (const l of fs.readFileSync(path.join(process.env.XP2F_CRITIC, f), 'utf8').split('\n')) { if (l.includes(`"${key}"`)) { const r = JSON.parse(l); if (r.key === key) return r; } } return null; };
      for (const [tag, pairs] of [['FB', [['RFa12', 'RFa12'], ['RFa24', 'RFa24']]], ['FBr', [['RFa12', 'RFa12'], ['RFa24', 'RFa24']]], ['FBp', [['RFa12p', 'RFa12c']]], ['SG', [['S72L', 'S72L'], ['S17LP', 'S17LP'], ['S17LF', 'S17LF']]], ['SGc', [['S17LP', 'S17LP']]], ['SG2', [['S17LP:crt', 'S17LPc']]]]) {
        const r = look(tag);
        if (!r) continue;
        for (const [from, to] of pairs) if (r.arms?.[from]?.ok) for (const k of row.entered) { const a = row.arms[to]?.days?.[k]?.e, b = r.arms[from].days[k].e; report.push(`${a === b ? 'same' : 'DIFFERS'} diagnosis ${tag} ${from} day ${k}${a === b ? '' : `: ${a} against ${b}`}`); }
      }
    }
    // improved-mode fit, AFSPC flight: S72L over its own arc
    const { S, T, m, G } = x;
    const raw = T.series(o, cutoffMs - config.arcs.sgp4Long * HOUR, cutoffMs).lines, thin = T.thinned(raw).chosen;
    const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(cutoffMs) });
    const { fr, el } = await G.fit(oem, { from: iso(cutoffMs - config.arcs.sgp4Long * HOUR), to: iso(cutoffMs), epoch: 'last', fitBstar: true }, o);
    const tGrid = thin.filter((l) => (ms(l.epoch) - ms(thin[0].epoch)) % GRID === 0), st = await m.propagateSgp4(el, o.norad, tGrid.map((l) => ms(l.epoch)), 300);
    const e = await m.rtn(await m.toAxes(st, tGrid.map((l) => l.epoch), 'GCRF'), tGrid.map((l) => ({ r: l.r, v: l.v })));
    const flown = Math.sqrt(e.reduce((a, q) => a + q[0] ** 2 + q[1] ** 2 + q[2] ** 2, 0) / e.length);
    report.push(`${key}: S72L fit RMS ${fr.rms?.rms3dKm?.toFixed(6)} km as stated (improved mode), ${flown.toFixed(6)} km flown over the same arc (AFSPC mode), ${tGrid.length} states at 300 s`);
    report.push(`${key}: ${((Date.now() - t0) / 1000).toFixed(0)} s, arms ok ${Object.entries(row.arms).filter(([, a]) => a.ok).map(([n]) => n).join(' ')}; not ok ${Object.entries(row.arms).filter(([, a]) => !a.ok).map(([n, a]) => `${n}: ${a.error ?? a.notRun}`).join('; ')}; times ${JSON.stringify(row.timing)}`);
  }
  await x.close();
  console.log(report.join('\n'));
  console.log(misses ? `CONTROL FAILED: ${misses} misses` : 'control passed: P, X2 and RF17\'s B equal the stored rows, every number');
  process.exit(misses ? 1 : 0);
}

// ---- workers -----------------------------------------------------------------------------------------------------------
const rowsOf = () => (fs.existsSync(rowsDir) ? fs.readdirSync(rowsDir).filter((n) => n.endsWith('.jsonl')).sort().flatMap((n) => readJsonl(path.join(rowsDir, n))) : []);
async function runWorker() {
  const k = Number(args.worker), span = args.span;
  const sources = sourcesCommitted();
  fs.mkdirSync(path.join(claimsDir, span), { recursive: true }); fs.mkdirSync(rowsDir, { recursive: true });
  const all = windows(span), PHI = (Math.sqrt(5) - 1) / 2;
  const order = all.map((w, i) => ({ w, u: ((i + 1) * PHI + 0.25) % 1 })).sort((a, b) => a.u - b.u).map((q) => q.w);
  const claim = (key) => { try { fs.mkdirSync(path.join(claimsDir, span, key.replaceAll('|', '_'))); return true; } catch { return false; } };
  const x = await modules();
  const file = path.join(rowsDir, `${span}.w${k}.jsonl`);
  for (const w of order) {
    if (diskFree() < config.disk.stopClaimingBelowGiB * GiB) { console.error(`worker ${k}: under ${config.disk.stopClaimingBelowGiB} GiB free, no further claim`); break; }
    if (!claim(w.key)) continue;
    let row;
    try { row = await scoreWindow(x, w, { sources }); } catch (error) { row = { key: w.key, span, error: short(error?.stack ?? error), arms: {} }; }
    appendJsonl(file, row);
  }
  console.error(`worker ${k} span ${span} finished`);
  await x.close();
  process.exit(0);
}
function launch() {
  const span = args.span, n = Math.min(Number(args.workers ?? config.workers.maximum), config.workers.maximum);
  if (!config.spans[span]) throw new Error('--span');
  sourcesCommitted();
  const pidFile = path.join(store, 'pids', `run-${span}.pids`);
  if (fs.existsSync(pidFile)) for (const l of fs.readFileSync(pidFile, 'utf8').split('\n').filter(Boolean)) { try { process.kill(Number(l), 0); throw new Error(`worker ${l} is alive`); } catch (e) { if (e.code !== 'ESRCH') throw e; } }
  // a claim without a stored row belongs to a stopped worker: it goes back
  const done = new Set(rowsOf().map((r) => r.key));
  const cd = path.join(claimsDir, span);
  if (fs.existsSync(cd)) for (const c of fs.readdirSync(cd)) if (!done.has(c.replaceAll('_', '|'))) fs.rmdirSync(path.join(cd, c));
  fs.mkdirSync(path.dirname(pidFile), { recursive: true });
  const pids = [];
  for (let k = 0; k < n; k += 1) {
    const log = fs.openSync(path.join(store, 'logs', `run-${span}.${k}.log`), 'a');
    const c = spawn('nice', ['-n', String(config.workers.nice), process.execPath, `--max-old-space-size=${config.workers.heapMb}`, path.join(dir, 'run.mjs'), '--worker', String(k), '--span', span], { detached: true, stdio: ['ignore', log, log], cwd: root, env: process.env });
    c.unref(); pids.push(c.pid);
  }
  fs.writeFileSync(pidFile, `${pids.join('\n')}\n`);
  console.log(`launched ${n} workers on ${span}: ${pids.join(' ')}; PID file ${pidFile}`);
  process.exit(0);
}
function status() {
  const rows = rowsOf(), by = {};
  for (const s of Object.keys(config.spans)) by[s] = { expected: config.expectedWindows[s], stored: 0, excluded: 0, errors: 0 };
  const fails = {}, notRun = {}, walls = [], ffm = {};
  for (const r of rows) {
    const b = by[r.span];
    if (!b) continue;
    b.stored += 1;
    if (r.excluded) b.excluded += 1;
    if (r.error) { b.errors += 1; fails[`row: ${String(r.error).slice(0, 100)}`] = (fails[`row: ${String(r.error).slice(0, 100)}`] ?? 0) + 1; }
    if (r.timing?.wallS) walls.push(r.timing.wallS);
    for (const [n, t] of Object.entries(r.timing?.ffmMs ?? {})) (ffm[n] ??= []).push(t);
    for (const [n, a] of Object.entries({ ...r.arms, ...(r.P ? { P: r.P } : {}) })) if (!a.ok) { if (a.notRun) notRun[n] = (notRun[n] ?? 0) + 1; else fails[`${n}: ${String(a.error).slice(0, 70)}`] = (fails[`${n}: ${String(a.error).slice(0, 70)}`] ?? 0) + 1; }
  }
  const med = (v) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] : null);
  const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  console.log(JSON.stringify({ spans: by, failures: fails, notRun, wallS: { median: med(walls), mean: mean(walls) }, ffmMsMean: Object.fromEntries(Object.entries(ffm).map(([n, v]) => [n, Math.round(mean(v))])), freeGiB: +(diskFree() / GiB).toFixed(1) }, null, 0));
  process.exit(0);
}

// ---- the check ---------------------------------------------------------------------------------------------------------
const clean = (r) => { const { timing, ...rest } = r; return rest; };
async function rerun(key) {
  const rows = rowsOf(), stored = rows.find((r) => r.key === key);
  if (!stored) throw new Error(`${key} is not stored`);
  const [, norad, date] = key.split('|');
  const x = await modules();
  const row = await scoreWindow(x, { key, span: spanOfDate(date), o: objectOf(norad), date, cutoffMs: Date.parse(`${date}T00:00:00Z`) }, { sources: stored.sources });
  await x.close();
  const a = JSON.stringify(clean(row)), b = JSON.stringify(clean(stored));
  if (a !== b) { let i = 0; while (a[i] === b[i]) i += 1; console.error(`${key} differs near: ${a.slice(Math.max(0, i - 80), i + 80)} / ${b.slice(Math.max(0, i - 80), i + 80)}`); process.exit(1); }
  console.log(`${key}: every number equal`);
  process.exit(0);
}
function check() {
  sourcesCommitted();
  const children = config.check.windows.map((key) => new Promise((resolve) => { const c = spawn(process.execPath, [`--max-old-space-size=${config.workers.heapMb}`, path.join(dir, 'run.mjs'), '--rerun', key], { stdio: 'inherit', cwd: root, env: process.env }); c.on('exit', (code) => resolve(code)); }));
  Promise.all(children).then((codes) => {
    if (codes.some((c) => c !== 0)) { console.error('a pinned window differs'); process.exit(1); }
    const t = spawnSync(process.execPath, [path.join(dir, 'table.mjs'), '--check'], { stdio: 'inherit', cwd: root, env: process.env });
    if (t.status !== 0) process.exit(1);
    console.log('check passed: the pinned windows equal their stored rows, the table and README rebuild byte for byte');
    process.exit(0);
  });
}

if (args.control) await runControl();
else if (args.worker !== undefined) await runWorker();
else if (args.launch) launch();
else if (args.status) status();
else if (args.rerun) await rerun(args.rerun);
else if (args.check) check();
else { console.error('see the header'); process.exit(2); }
