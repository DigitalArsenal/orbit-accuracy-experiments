// The numerical arm's trajectory for every scoreboard window: for each window and fit arc of the window list, the fit the window's
// numerical row stands for (lib/numerical.mjs rowFitOf, at the row's arm as table.mjs and bar.mjs choose it, rowArmOf), from the fit arc's
// first state to 7 days after the cutoff on 300 s, GCRF. Source: for a window whose numerical row is a refit on the arc after a burn (the
// refits after a burn read with the lists that made them, --burns, from the folder --after-burn-store names, as bar.mjs reads them:
// lib/numerical.mjs readAfterBurn), with --refit, that refit made again on its arc (its recorded start, else the arc the rule gives from
// its last burn, with the row's own minimum arc); for any other window, in order, the stored trajectory of the fit (every state on 300 s of
// its own step), a forecast from the stored fitted product, or (with --refit) a refit of that setting on the window's truth over the
// full arc. A window with no arm gets a line saying why (source none).
//   node experiments/headline-loop/trajectories.mjs --keys-file <file of window keys> [--groups LS,DO,...] [--burns <lists>
//     [--after-burn-store <folder>]] [--redo <file of key|arc>] [--only <key|arc;...>] [--first G,G] [--groups-first]
//     [--order G:arc,...] [--inventory] [--refit] [--jobs 4]
//   node experiments/headline-loop/trajectories.mjs --check
// Needs: the store (HEADLINE_LOOP_STORE: its numerical rows, ffm-cache, refit folder), the truth archive and the space weather the
// windows read, the NAIF kernels and the modules checkout (SDN_MODULES_ROOT) the FFM build and arms load from.
// A window-arc is done where a line of it holds the fit the row gives now (lib/numerical.mjs lineFitOf and sameFit: the setting, the
// process and the arc start in milliseconds), its file in place at the sha256 the line names. A line holds none where it has no trajectory
// (no arm, or a failed attempt), where a later line wrote its file again, where its refit's weighted RMS is not the stored fit's, where it
// is a refit after a burn that records no arc start, or where its file is missing or not at its hash: such a window-arc is made again. So a
// run cut off between a file's rename and its line's append (new bytes under an earlier line's name) heals on the next run: that line's
// file is not at its hash, the window-arc is made again, and bar.mjs, which stores nothing for a trajectory it cannot read, reads the new line. --redo flies given window-arcs again; a window-arc listed twice is refused. Each attempt
// appends one manifest line. A trajectory's line names its fit (fit) and its file's sha256; the file is named by its fit
// (<group>/<key>-<arc>-<fit tag>.bin, lib/numerical.mjs fitTag), written to a temporary name and renamed into place before the line is
// appended. A failed attempt's line names the fit it tried (tried) and the error, and holds no fit. A refit of a stored fit (after a burn,
// or of the full arc) must give the stored weighted RMS (lib/numerical.mjs rmsAgrees: within 1e-9 absolute where the stored RMS is at
// most 1, relative above), or the window-arc fails, its line saying so; a stored row that records no weighted RMS has nothing to compare,
// and its refit is taken as it is.
import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
import crypto from 'node:crypto';
const SELF = new URL(import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const E = await import('./lib/env.mjs'); E.usePackages();
const W = await import('./lib/windows.mjs');
const A = await import('./lib/arms.mjs');
const N = await import('./lib/numerical.mjs');
const OUT = path.join(A.STORE_ROOT, 'numerical-trajectories'), CACHE = path.join(A.STORE_ROOT, 'ffm-cache');
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE72', 'HE', 'HX'], STEP_S = 300, LEAD_D = 7;
const AFTER_BURN = 'a refit after the burn: the full setting on the arc after the last known burn (refly.mjs --after-burns), made again here';
const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const nameOf = (key, arc) => `${key.replace(/[| ]/g, '_')}-${arc}`;
const productOf = (setting, key, arc) => { for (const d of fs.readdirSync(CACHE).filter((x) => x.startsWith(`${setting}-`))) { const f = path.join(CACHE, d, `${nameOf(key, arc)}.json`); if (fs.existsSync(f)) return { file: f, meta: JSON.parse(fs.readFileSync(f, 'utf8')) }; } return null; };
const readBase = () => {
  const base = new Map();
  for (const r of fs.readdirSync(path.join(A.STORE_ROOT, A.NUMERICAL_STORE)).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(A.STORE_ROOT, A.NUMERICAL_STORE, f)))) { const k = `${r.key}|${r.arcH}`; if (A.laterWins(base.get(k), r, W.GROUPS[r.group]?.oneFile)) base.set(k, r); }
  return base;
};

if (args.check) await check(); else if (args.worker) await worker(); else await main();

async function main() {
  if (!args['keys-file']) throw new Error('usage: --keys-file <file of window keys>');
  const KEYS = new Set(fs.readFileSync(args['keys-file'], 'utf8').split('\n').filter(Boolean));
  const base = readBase(), groups = args.groups ? args.groups.split(',') : ALL;
  // the refits after a burn, read as bar.mjs reads them, and each window's numerical row by the one function both read
  const { afterBurn, afterBurnGroups } = N.readAfterBurn({ burns: args.burns, store: args['after-burn-store'], readRows: read });
  const numericalOf = (w, arc) => N.numericalOf({ w, arc, base, afterBurn, afterBurnGroups });
  // the fits the manifest's lines hold (a line whose file a later line wrote again holds none; on a one-file row, windows.mjs oneFile, a line
  // that names no reference file holds none: it was made before lines named it)
  const prior = fs.existsSync(path.join(OUT, 'manifest.jsonl')) ? read(path.join(OUT, 'manifest.jsonl')) : [];
  const lastWriter = new Map(); prior.forEach((x, i) => { if (x.file) lastWriter.set(x.file, i); });
  const fitsOf = new Map(); prior.forEach((x, i) => { const k = `${x.key}|${x.arcH}`; if (!fitsOf.has(k)) fitsOf.set(k, []); fitsOf.get(k).push({ fit: !W.GROUPS[x.group]?.oneFile || x.truthFile ? N.lineFitOf(x, lastWriter.get(x.file) === i) : null, x }); });
  // a line's file in place, at the sha256 the line names (a line written before lines named one: in place)
  const intact = (x) => { const f = path.join(OUT, x.file); return fs.existsSync(f) && (!x.sha256 || crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === x.sha256); };
  // --redo <file of key|arc>: those window-arcs are flown again whatever their lines
  const redo = args.redo ? new Set(fs.readFileSync(args.redo, 'utf8').split('\n').filter(Boolean)) : new Set();
  const jobs = [], count = {}, listed = N.listedOf(groups, base);
  for (const g of groups) {
    const ws0 = listed.filter((w) => w.group === g && KEYS.has(w.key));
    for (const arc of [...new Set(ws0.flatMap((w) => w.arcs))].sort((a, b) => a - b)) {
      // the row's arm over every listed window of the row, as bar.mjs and table.mjs choose it; each window's fit by it
      const label = N.rowArmOf(g, listed.filter((w) => w.group === g && w.arcs.includes(arc)).map((w) => numericalOf(w, arc)), afterBurnGroups);
      const ws = ws0.filter((w) => w.arcs.includes(arc));
      const c = (count[`${g} ${arc} h`] = { windows: ws.length, arm: label, trajectory: 0, product: 0, refit: 0, afterBurn: 0, noFit: 0, done: 0 });
      for (const w of ws) {
        const nr = numericalOf(w, arc), fit = N.rowFitOf(nr, label, w.cutoffMs, arc), k = `${w.key}|${arc}`;
        const p = fit?.process === 'full arc' ? productOf(fit.setting, w.key, arc) : null;
        const source = !fit?.arcStart ? 'none' : fit.process === 'after burn' ? 'after-burn' : p?.meta?.trajectory && fs.existsSync(path.join(path.dirname(p.file), p.meta.trajectory.file)) ? 'trajectory' : p ? 'product' : 'refit';
        c[source === 'none' ? 'noFit' : source === 'after-burn' ? 'afterBurn' : source] += 1;
        if (source !== 'none' && !redo.has(k) && (fitsOf.get(k) ?? []).some((l) => N.sameFit(l.fit, fit) && intact(l.x))) { c.done += 1; continue; }
        jobs.push({ g, key: w.key, arc, label, setting: fit?.setting ?? null, source, fit: fit?.arcStart ? { setting: fit.setting, process: fit.process, arcStart: fit.arcStart } : null, product: p?.file ?? null, storedRms: label ? nr?.arms?.[label]?.weightedRms ?? null : null, truthFile: nr?.truthFile ?? null });
      }
    }
  }
  // one job per window-arc: two would write one file
  const twice = jobs.map((j) => `${j.key}|${j.arc}`).filter((k, i, all) => all.indexOf(k) !== i);
  if (twice.length) throw new Error(`refused: ${twice.length} window-arcs listed twice (${twice.slice(0, 3).join(', ')})`);
  console.log(JSON.stringify(count, null, 1));
  if (args.inventory) process.exit(0);
  fs.mkdirSync(OUT, { recursive: true });
  // --only <key|arc;key|arc>: those window-arcs alone
  const onlyKeys = args.only ? new Set(args.only.split(';')) : null;
  const todo = jobs.filter((j) => (!onlyKeys || onlyKeys.has(`${j.key}|${j.arc}`)) && (j.source === 'trajectory' || j.source === 'product' || ((j.source === 'refit' || j.source === 'after-burn') && args.refit)));
  // the stored trajectories first (no flight); then the 72 h fits before the others, by the groups asked first (--first S1,P,T,GN,GN_GAL),
  // a forecast before a refit
  const first = (args.first ?? 'S1,P,T,GN,GN_GAL').split(','), rank = (g) => (first.includes(g) ? first.indexOf(g) : first.length);
  const src = (s) => ['trajectory', 'product', 'after-burn', 'refit'].indexOf(s);
  // --groups-first: the --first groups ahead of everything, both fit arcs; --order G:arc,G:arc,...: those rows first, in that order
  const gf = !!args['groups-first'], order = args.order ? args.order.split(',') : [], ord = (j) => { const k = order.indexOf(`${j.g}:${j.arc}`); return k < 0 ? order.length : k; };
  todo.sort((a, b) => (a.source === 'trajectory' ? 0 : 1) - (b.source === 'trajectory' ? 0 : 1) || ord(a) - ord(b) || (gf ? rank(a.g) - rank(b.g) : 0) || (a.arc === 72 ? 0 : 1) - (b.arc === 72 ? 0 : 1) || rank(a.g) - rank(b.g) || src(a.source) - src(b.source));
  const inManifest = new Set(prior.map((x) => `${x.key}|${x.arcH}`));
  for (const j of jobs.filter((x) => x.source === 'none' && !inManifest.has(`${x.key}|${x.arc}`))) fs.appendFileSync(path.join(OUT, 'manifest.jsonl'), `${JSON.stringify({ key: j.key, arcH: j.arc, group: j.g, arm: j.label, source: 'none', why: j.label ? 'the row\'s numerical arm has no successful fit for this window' : 'no properly configured numerical arm on this row' })}\n`);
  let next = 0, n = 0;
  const JOBS = Math.min(Number(args.jobs ?? 4), todo.length);
  await Promise.all(Array.from({ length: JOBS }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => (next < todo.length ? child.send(todo[next++]) : child.send({ stop: true }));
    child.on('message', (m) => { if (m.line) { fs.appendFileSync(path.join(OUT, 'manifest.jsonl'), `${JSON.stringify(m.line)}\n`); n += 1; if (n % 100 === 0 || n === todo.length) console.error(`  ${n}/${todo.length}`); } give(); });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${code}`))));
  })));
  process.exit(0);
}

async function worker() {
  const { openFfm, SETTINGS } = await import('./lib/ffm.mjs');
  let F = null, AX = null, ARMS = null;
  // the truth on the window's full span (the fit arc and 7 days), as refly.mjs reads it: on the 72 h TESS row the one file is chosen from that
  // span, so the refit here reads the same file as the stored one; the frame axes are the arms' (the NAIF kernels' EME2000 to GCRF)
  const truthSpan = async (w, D0, arc) => { ARMS ??= await A.openArms(); AX ??= ARMS.axes; return W.truthOf(w, D0 - arc * W.HOUR - W.HOUR, D0 + LEAD_D * W.DAY + W.HOUR, AX); };
  const ms = (t) => Date.parse(/Z$/.test(t) ? t : `${t}Z`);
  process.on('message', async (j) => {
    if (j.stop) { if (F) await F.close(); if (ARMS) await ARMS.close(); process.exit(0); }
    const line = { key: j.key, arcH: j.arc, group: j.g, arm: j.label, setting: j.setting, stepS: STEP_S, frame: 'GCRF', layout: 'Float64 x, y, z km, vx, vy, vz km/s per state' };
    try {
      const w = [...W.windowsOf([j.g]).windows, ...W.windowsOf([j.g]).second].find((x) => x.key === j.key), D0 = w.cutoffMs, G = W.GROUPS[j.g];
      // the fit this attempt makes: its arc's start is the row's (rowFitOf)
      const startMs = Date.parse(j.fit.arcStart);
      let product, states, stepOf = null;
      if (j.source === 'after-burn' || j.source === 'refit') {
        F ??= await openFfm();
        const truth = await truthSpan(w, D0, j.arc);
        if (truth.file) line.truthFile = truth.file;
        const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= startMs && t <= D0; }), (D0 - startMs) / W.HOUR);
        if (!thin) throw new Error(j.source === 'after-burn' ? 'coverage of the arc after the burn' : 'coverage');
        const f = await F.fit(thin, SETTINGS[j.setting], D0, G.vacuum ? null : W.weatherAt(D0).ffm);
        product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
        line.check = { arcStart: new Date(startMs).toISOString(), refitWeightedRms: f.weightedRms ?? null, storedWeightedRms: j.storedRms ?? null };
        if (!N.rmsAgrees(line.check)) throw new Error(`the refit is not the stored fit: weighted RMS ${line.check.refitWeightedRms} against the stored ${line.check.storedWeightedRms}`);
      } else { product = JSON.parse(fs.readFileSync(j.product, 'utf8')).product; if (j.truthFile) line.truthFile = j.truthFile; }
      const from = ms(product.epoch), count = Math.floor((D0 + LEAD_D * W.DAY - from) / (STEP_S * 1000)) + 1;
      if (j.source === 'trajectory') {
        const meta = JSON.parse(fs.readFileSync(j.product, 'utf8')), tr = meta.trajectory, buf = fs.readFileSync(path.join(path.dirname(j.product), tr.file)), f64 = new Float64Array(buf.buffer, buf.byteOffset, buf.length / 8);
        const k0 = Math.round((from - ms(tr.from)) / (tr.stepS * 1000)), every = STEP_S / tr.stepS;
        if (k0 !== 0 || every !== Math.round(every) || k0 + (count - 1) * every >= tr.count) throw new Error(`the stored trajectory does not cover the span (${tr.from}, ${tr.count} at ${tr.stepS} s)`);
        states = Array.from({ length: count }, (_, k) => Array.from(f64.subarray((k * every) * 6, (k * every) * 6 + 6)));
        stepOf = tr.stepS;
      } else {
        F ??= await openFfm();
        const epochs = Array.from({ length: count }, (_, k) => new Date(from + k * STEP_S * 1000).toISOString());
        states = (await F.forecast(product, epochs, SETTINGS[j.setting], G.vacuum ? null : W.weatherAt(D0).ffm)).map((s) => [...s.r, ...s.v]);
      }
      if (states.length !== count || states.some((s) => s.length !== 6 || !s.every(Number.isFinite))) throw new Error(`the trajectory holds ${states.length} states of the ${count} asked for, or a state that is not finite`);
      // the file named by its fit, written to a temporary name and renamed into place; its sha256 is of the bytes written
      const dir = path.join(OUT, j.g); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${nameOf(j.key, j.arc)}-${N.fitTag(j.fit)}.bin`), buf = Buffer.from(new Float64Array(states.flat()).buffer), tmp = `${file}.tmp-${process.pid}`;
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file);
      Object.assign(line, { fit: { ...j.fit, firstState: new Date(from).toISOString() }, sha256, source: j.source === 'trajectory' ? `the stored ${stepOf} s trajectory, every ${STEP_S / stepOf}th state` : j.source === 'product' ? 'a forecast from the stored fitted product' : j.source === 'after-burn' ? AFTER_BURN : 'a refit of the row\'s setting on the window\'s truth', file: path.relative(OUT, file), from: new Date(from).toISOString(), cutoff: new Date(D0).toISOString(), count, parameters: product.parameters });
    } catch (e) {
      // a failed attempt holds no fit: it names the fit it tried and why it failed
      for (const k of ['fit', 'sha256', 'file']) delete line[k];
      Object.assign(line, { source: 'failed', ...(j.fit ? { tried: j.fit } : {}), error: String(e?.message ?? e).slice(0, 200) });
    }
    process.send({ line });
  });
  process.send({ ready: true });
}

/** --check: on a store of its own, made from the real store: its numerical rows and ffm-cache linked (symbolic links; the check writes into
 *  neither), and a refit folder holding the cut's refit rows of the two rows the check reads (HE72 and S1, every window, so the rows' arm is
 *  the cut's), read with the cut's lists. One window per source: a stored trajectory and a stored product (two windows of one row, of a
 *  group the refit folder does not hold, at the row's arm), a refit of the stored full-arc fit, a refit after a burn on a row whose minimum
 *  arc is 9 h (on an arc under 24 h that a burn, not the minimum, sets) and on one whose minimum is 24 h. Each gives a line whose fit is
 *  the row's as the bar reads it (lib/numerical.mjs rowFitOf, sameFit), with count = floor((cutoff + 7 d - first state) / 300 s) + 1 and a
 *  file named by its fit of count x 48 bytes whose sha256 the line names; each refit gives the stored weighted RMS. A second run flies
 *  nothing. A refit row whose last burn moved flies that window-arc again, and its line fails against the stored RMS with no fit; a run
 *  after it reads that line and flies the window-arc again. Lines as an earlier tool wrote them are not the row's fit and their window-arcs
 *  are made again: a failed line that names a fit, a refit line whose RMS is not the stored one, a refit after a burn that records no arc
 *  start. A refit folder of other lists is refused. Not covered here: the bar's reading and its refusal of a changed file (bar.mjs), a
 *  window whose stored and refitted processes both hold lines, more than one job, the 1e-13 lines (refly.mjs --tight). Without the cut's
 *  lists and refit folder in the store the check fails. */
async function check() {
  const E2 = await import('./lib/e2e.mjs');
  const { check: ok, done } = E2.checker('TRAJECTORIES');
  const lists = path.join(A.STORE_ROOT, 'lists-9baa9131dcf8'), folder = `${A.NUMERICAL_STORE}-after-burn-9baa9131dcf8`, abReal = path.join(A.STORE_ROOT, folder);
  if (!fs.existsSync(lists) || !fs.existsSync(abReal)) { ok(false, `the store holds no lists-9baa9131dcf8 or ${folder}: nothing was checked`); done('nothing'); }
  const dir = E2.tmp('trajectories'), store = path.join(dir, 'store'), keys = path.join(dir, 'keys.txt'), TRAJ = path.join(store, 'numerical-trajectories');
  fs.mkdirSync(path.join(store, folder), { recursive: true });
  fs.symlinkSync(path.join(A.STORE_ROOT, A.NUMERICAL_STORE), path.join(store, A.NUMERICAL_STORE)); fs.symlinkSync(CACHE, path.join(store, 'ffm-cache'));
  const base = readBase();
  // the cut's refit rows as the tools read them (the first of a window-arc's, or the first without an error after one with one)
  const abSel = new Map();
  for (const r of fs.readdirSync(abReal).filter((f) => /^rows-after-burn-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(abReal, f)))) { const k = `${r.key}|${r.arcH}`; if (!abSel.has(k) || (abSel.get(k).error && !r.error)) abSel.set(k, r); }
  const held = [...abSel.values()].filter((r) => r.group === 'HE72' || r.group === 'S1');
  const refitOf = (g, test) => held.find((r) => r.group === g && r.arcH === 72 && r.fitProcess === N.REFIT && r.arms?.FFMq?.ok && test(r));
  const he9 = refitOf('HE72', (r) => r.fitArcHours > 9.05 && r.fitArcHours < 24 && !r.burnInArc), s24 = refitOf('S1', (r) => r.fitArcHours >= 24 && r.fitArcHours < 70), full = held.find((r) => r.group === 'HE72' && r.arcH === 72 && /^the full arc/.test(r.fitProcess ?? ''));
  const writeHeld = (swap = new Map()) => fs.writeFileSync(path.join(store, folder, 'rows-after-burn-check.jsonl'), `${held.map((r) => JSON.stringify(swap.get(`${r.key}|${r.arcH}`) ?? r)).join('\n')}\n`);
  // a stored trajectory and a stored product: two windows of one row of a group the refit folder does not hold, at the row's arm (the
  // fullest setting by name over every listed window, as the tool and the bar choose it), one with that fit's stored trajectory and one
  // with its product alone
  const inFolder = new Set([...abSel.values()].map((r) => r.group)), none = { afterBurn: new Map(), afterBurnGroups: new Set() };
  const kindOf = (k, arc, a) => { const b = base.get(`${k}|${arc}`), p = b?.arms?.[a]?.ok ? productOf(b.arms[a].arm, k, arc) : null; return !p ? null : p.meta?.trajectory && fs.existsSync(path.join(path.dirname(p.file), p.meta.trajectory.file)) ? 'trajectory' : 'product'; };
  const storedPair = () => {
    for (const g of ['LS', 'DO', 'S1', 'P', 'GN'].filter((x) => !inFolder.has(x))) for (const arc of [24, 72]) {
      const row = N.listedOf([g], base).filter((w) => w.arcs.includes(arc)), a = N.rowArmOf(g, row.map((w) => N.numericalOf({ w, arc, base, ...none })), none.afterBurnGroups);
      const of = (kind) => row.find((w) => kindOf(w.key, arc, a) === kind)?.key, t = a && of('trajectory'), p = a && of('product');
      if (t && p) return { g, arc, traj: t, prod: p };
    }
    return null;
  };
  const sp = storedPair(), traj = sp?.traj, prod = sp?.prod, picked = [he9, s24, full].filter(Boolean);
  writeHeld();
  fs.writeFileSync(keys, `${[...picked.map((r) => r.key), traj, prod].filter(Boolean).join('\n')}\n`);
  const groups = ['HE72', 'S1', sp?.g].filter(Boolean);
  const run = (more = [], burns = lists) => E2.run('trajectories.mjs', ['--keys-file', keys, '--groups', groups.join(','), '--burns', burns, '--after-burn-store', folder, '--refit', '--jobs', '1', ...more], { HEADLINE_LOOP_STORE: store });
  const manifest = () => read(path.join(TRAJ, 'manifest.jsonl'));
  // the bar's reading: the refit rows of the check's folder, each window's numerical row, the row's arm and fit, the last line holding that
  // fit (lib/numerical.mjs, as bar.mjs calls it)
  const reading = () => {
    const ab = { afterBurn: new Map(held.map((r) => [`${r.key}|${r.arcH}`, r])), afterBurnGroups: new Set(held.map((r) => r.group)) }, all = N.listedOf(groups, base);
    const ls = manifest(), lastWriter = new Map(); ls.forEach((x, i) => { if (x.file) lastWriter.set(x.file, i); });
    return (key, arc) => {
      const w = all.find((x) => x.key === key), nrOf = (v) => N.numericalOf({ w: v, arc, base, ...ab });
      const label = N.rowArmOf(w.group, all.filter((v) => v.group === w.group && v.arcs.includes(arc)).map(nrOf), ab.afterBurnGroups), rf = N.rowFitOf(nrOf(w), label, w.cutoffMs, arc);
      const x = ls.filter((l, i) => l.key === key && l.arcH === arc && N.sameFit(N.lineFitOf(l, lastWriter.get(l.file) === i), rf)).at(-1);
      return { w, rf, x };
    };
  };
  const accepted = (read1, key, arc) => {
    const { w, rf, x } = read1(key, arc);
    const buf = x?.file && fs.existsSync(path.join(TRAJ, x.file)) ? fs.readFileSync(path.join(TRAJ, x.file)) : null, count = x ? Math.floor((w.cutoffMs + LEAD_D * 864e5 - Date.parse(x.from)) / (STEP_S * 1000)) + 1 : null;
    const good = !!x && x.count === count && buf?.length === count * 48 && crypto.createHash('sha256').update(buf).digest('hex') === x.sha256 && x.file === `${w.group}/${nameOf(key, arc)}-${N.fitTag(rf)}.bin` && N.rmsAgrees(x.check) && (!W.GROUPS[w.group]?.oneFile || !!x.truthFile);
    return { ok: good, x, why: good ? null : JSON.stringify({ key, row: rf, line: x ? { source: x.source, fit: x.fit, file: x.file, count: [x.count, count], bytes: buf?.length ?? null, check: x.check ?? null, truthFile: x.truthFile ?? null } : null }) };
  };
  const r1 = run(), read1 = reading();
  const results = [[he9?.key, 72], [s24?.key, 72], [full?.key, 72], [traj, sp?.arc], [prod, sp?.arc]].map(([k, a]) => (k ? accepted(read1, k, a) : { ok: false, why: 'no such window in the store' }));
  ok(r1.code === 0 && he9 && s24 && full && traj && prod && results.every((x) => x.ok) && /after the burn/.test(results[0].x.source) && /after the burn/.test(results[1].x.source) && /a refit of the row/.test(results[2].x.source) && /^the stored \d+ s trajectory/.test(results[3].x.source) && /a forecast from the stored fitted product/.test(results[4].x.source),
    `each source gives the row's fit: ${r1.err.slice(-300)} ${results.map((x) => (x.ok ? x.x.source.slice(0, 30) : x.why)).join(' | ')}`);
  const lines1 = manifest(), r2 = run(), lines2 = manifest();
  ok(r2.code === 0 && lines2.length === lines1.length, `a second run flew again: ${r2.err.slice(-200)} ${lines2.length - lines1.length} lines`);
  // the refit row's last burn (and its recorded start, where it has one) moved by 5 minutes: that window-arc is flown again; the stored RMS
  // is of the other arc, so the line fails, naming the fit it tried and holding none; a run after it reads that line and flies it again
  const shift = (t) => new Date(Date.parse(t) + 5 * 60e3).toISOString(), moved = { ...he9, lastBurn: shift(he9.lastBurn), ...(he9.fitArcStart ? { fitArcStart: shift(he9.fitArcStart) } : {}) };
  writeHeld(new Map([[`${he9.key}|72`, moved]]));
  const r3 = run(), lines3 = manifest(), new3 = lines3.slice(lines2.length);
  const failedRight = (xs) => xs.length === 1 && xs[0].key === he9.key && xs[0].source === 'failed' && /the refit is not the stored fit/.test(xs[0].error ?? '') && !xs[0].fit && !xs[0].file && xs[0].tried?.process === 'after burn' && N.lineFitOf(xs[0], true) === null;
  ok(r3.code === 0 && failedRight(new3), `a moved refit row flies its window-arc again and fails: ${r3.err.slice(-200)} ${JSON.stringify(new3.map((x) => [x.key, x.source, x.error?.slice(0, 60), !!x.fit]))}`);
  const r3b = run(), new3b = manifest().slice(lines3.length);
  ok(r3b.code === 0 && failedRight(new3b), `a run after a refused refit reads its line: ${r3b.code} ${r3b.err.slice(-300)} ${new3b.length} lines`);
  // lines as an earlier tool wrote them: a failed line naming a fit in place of the stored product's line, the 9 h refit's line with no fit
  // and a stored RMS not its own, the 24 h-minimum refit's line with no fit and no recorded arc start. None is the row's fit: those three
  // window-arcs are made again, and nothing else
  writeHeld();
  const lastLine = (key, arc, ls) => ls.findLastIndex((x) => x.key === key && x.arcH === arc && x.file);
  const old = manifest(), iP = lastLine(prod, sp?.arc, old), iH = lastLine(he9.key, 72, old), iS = lastLine(s24.key, 72, old);
  const strip = ({ fit, ...x }) => x;
  old[iP] = { ...strip(old[iP]), source: 'failed', fit: old[iP].fit, error: 'a forecast that failed after its fit was named' }; delete old[iP].file; delete old[iP].sha256;
  old[iH] = { ...strip(old[iH]), check: { ...old[iH].check, storedWeightedRms: old[iH].check.refitWeightedRms * 2 } };
  old[iS] = { ...strip(old[iS]), check: (({ arcStart, ...c }) => c)(old[iS].check) };
  fs.writeFileSync(path.join(TRAJ, 'manifest.jsonl'), `${old.map((x) => JSON.stringify(x)).join('\n')}\n`);
  const r5 = run(), new5 = manifest().slice(old.length), read5 = reading();
  const again = new Set(new5.map((x) => `${x.key}|${x.arcH}`)), want5 = [`${prod}|${sp?.arc}`, `${he9.key}|72`, `${s24.key}|72`];
  ok(r5.code === 0 && new5.length === 3 && want5.every((k) => again.has(k)) && new5.every((x) => x.fit && x.file) && [[prod, sp?.arc], [he9.key, 72], [s24.key, 72]].every(([k, a]) => accepted(read5, k, a).ok),
    `the earlier tool's lines are made again: ${r5.err.slice(-200)} ${JSON.stringify(new5.map((x) => [x.key, x.arcH, x.source?.slice(0, 20)]))}`);
  // a refit folder of other lists is refused
  const other = path.join(dir, 'lists-other');
  fs.cpSync(lists, other, { recursive: true });
  const tess = path.join(other, 'HE', 'TESS.burns.json');
  fs.writeFileSync(tess, `${fs.readFileSync(tess, 'utf8').trimEnd()} `);
  const r4 = run([], other);
  ok(r4.code !== 0 && /refused: .* were made on burn lists other than --burns gives/.test(r4.err), `a folder of other lists: ${r4.code} ${r4.err.slice(-200)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  done('trajectories.mjs gives, for one window of each source (a stored trajectory, a stored product, a refit of the stored full-arc fit, a refit after a burn on a 9 h-minimum and on a 24 h-minimum row), a line whose fit is the row\'s as the bar reads it, with its count, a file named by its fit of count x 48 bytes and the sha256 its line names, each refit at the stored weighted RMS; a second run flies nothing; a refit row whose last burn moved flies that window-arc again and fails against the stored RMS with no fit, and a run after it reads that line and flies it again; an earlier tool\'s failed line naming a fit, refit line off the stored RMS and refit line with no arc start are made again; a refit folder of other lists is refused');
}
