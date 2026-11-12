// The numerical arm's trajectory for every scoreboard window: for each window and fit arc of the window list, the row's numerical arm (the
// fullest stored setting by name, as table.mjs picks it, or the arm --arm names), its trajectory from the fit arc's first state to 7 days
// after the cutoff on 300 s, GCRF. Source, in order: the stored trajectory of the fit (every state on 300 s of its own step); else a
// forecast from the stored fitted product; else (with --refit) a refit of that setting on the window's truth over the stored arc; for a
// window whose numerical row is a refit on the arc after a burn (the refit folder, --after-burn-store, read with the lists that made it,
// --burns), with --refit, that refit made again on the arc the rule gives from the refit row's last burn (the row's own minimum arc,
// lib/arms.mjs minHoursOf). A window with no arm gets a line saying why (source none).
//   node experiments/headline-loop/trajectories.mjs --keys-file <file of window keys> [--groups LS,DO,...] [--burns <lists>
//     --after-burn-store <folder>] [--arm G=LABEL,...] [--redo <file of key|arc>] [--only <key|arc;...>] [--first G,G] [--groups-first]
//     [--order G:arc,...] [--inventory] [--refit] [--jobs 4]
//   node experiments/headline-loop/trajectories.mjs --check   (on a store of its own: the store's numerical rows and ffm-cache linked read-only)
// Needs: the store (HEADLINE_LOOP_STORE: its numerical rows, ffm-cache, refit folder), the truth archive and the space weather the
// windows read, the NAIF kernels and the modules checkout (SDN_MODULES_ROOT) the FFM build and arms load from.
// A window-arc is done where a line of it, of a file no later line wrote again, holds the fit the rows give now (setting, process, arc
// start to the millisecond); --redo flies given window-arcs again. Each attempt appends one manifest line (a failure too); the trajectory
// is written to a name of its own fit's kind (<group>/<key>-<arc>.bin, or -after-burn.bin), through a temporary file renamed into place,
// and its line names the file's sha256. A refit of a stored fit (after a burn, or of the full arc) must give the stored weighted RMS (to
// REFIT_RMS_TOLERANCE, relative), or the window-arc fails, its line saying so.
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
const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'], NOT_CONFIGURED = new Set(['WA']), STEP_S = 300, LEAD_D = 7;
const AFTER_BURN = 'a refit after the burn: the full setting on the arc after the last known burn (refly.mjs --after-burns), made again here';
const REFIT_RMS_TOLERANCE = 1e-9;
const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const nameOf = (key, arc) => `${key.replace(/[| ]/g, '_')}-${arc}`;
const productOf = (setting, key, arc) => { for (const d of fs.readdirSync(CACHE).filter((x) => x.startsWith(`${setting}-`))) { const f = path.join(CACHE, d, `${nameOf(key, arc)}.json`); if (fs.existsSync(f)) return { file: f, meta: JSON.parse(fs.readFileSync(f, 'utf8')) }; } return null; };

if (args.check) await check(); else if (args.worker) await worker(); else await main();

async function main() {
  if (!args['keys-file']) throw new Error('usage: --keys-file <file of window keys>');
  const KEYS = new Set(fs.readFileSync(args['keys-file'], 'utf8').split('\n').filter(Boolean));
  const baseDir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE), base = new Map();
  for (const r of fs.readdirSync(baseDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(baseDir, f)))) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  const groups = args.groups ? args.groups.split(',') : ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE72', 'HE', 'HX'];
  // the numerical arm's fit of a maneuvering object on the arc after its last burn (refly.mjs --after-burns): where the rule
  // moved the arc, that refit is the window's numerical arm and its trajectory is made from it (the refit rows hold no fitted state, so
  // the same refit is made again here on the same arc)
  // --after-burn-store <folder>: the refits of the lists the table reads (one folder per set of lists, table.mjs --after-burn-store)
  const abDir = path.join(A.STORE_ROOT, args['after-burn-store'] ?? A.NUMERICAL_AFTER_BURN.store), afterBurn = new Map();
  const abRows = fs.existsSync(abDir) && args['after-burn-store'] ? fs.readdirSync(abDir).filter((f) => /^rows-after-burn-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(abDir, f))) : [];
  if (abRows.length && !args.burns) throw new Error('--after-burn-store needs the lists that made it (--burns)');
  const wrong = abRows.filter((r) => (r.burnList ?? null) !== A.listSha(args.burns, r.group, r.name) || ((r.lastBurn || r.burnInArc) && !r.burnList));
  if (wrong.length) throw new Error(`refused: ${wrong.length} rows of ${args['after-burn-store']} were made on burn lists other than --burns gives (${[...new Set(wrong.map((r) => r.group))].join(', ')})`);
  for (const r of abRows) if (!r.error && !afterBurn.has(`${r.key}|${r.arcH}`)) afterBurn.set(`${r.key}|${r.arcH}`, r);
  const moved = (k) => { const r = afterBurn.get(k); return r && /^maneuvering: the arc after its last burn/.test(r.fitProcess) && r.arms?.FFMq?.ok ? r : null; };
  const prior = fs.existsSync(path.join(OUT, 'manifest.jsonl')) ? read(path.join(OUT, 'manifest.jsonl')) : [];
  // a window-arc is done when its last line is a trajectory of the source it needs now (an after-burn refit supersedes the stored fit's)
  const lastWriter = new Map(); prior.forEach((x, i) => { if (x.file) lastWriter.set(x.file, i); });
  const fitsOf = new Map(); prior.forEach((x, i) => { const k = `${x.key}|${x.arcH}`; if (!fitsOf.has(k)) fitsOf.set(k, []); fitsOf.get(k).push(N.lineFitOf(x, lastWriter.get(x.file) === i)); });
  // --redo <file of key|arc>: those window-arcs are flown again whatever their last line (a refit made again on the rule in code)
  const redo = args.redo ? new Set(fs.readFileSync(args.redo, 'utf8').split('\n').filter(Boolean)) : new Set();
  // the fit a job makes (setting, process, arc start): done where a line of the window-arc holds it
  const H = 3600e3, fitOfJob = (j, D0) => ({ setting: j.setting, process: j.source === 'after-burn' ? 'after burn' : 'full arc', arcStart: new Date(j.source === 'after-burn' ? A.numericalArc([{ from: j.lastBurn, to: j.lastBurn }], D0, Infinity, j.arc, A.minHoursOf(j.g)).startMs : D0 - j.arc * H).toISOString() });
  const doneFit = (j, D0) => { const want = fitOfJob(j, D0), k = `${j.key}|${j.arc}`; return !redo.has(k) && (fitsOf.get(k) ?? []).some((x) => x && x.setting === want.setting && x.process === want.process && x.arcStart === want.arcStart); };
  const jobs = [], count = {};
  for (const g of groups) {
    const all = W.windowsOf([g]), ws0 = [...all.windows, ...all.second].filter((w) => KEYS.has(w.key));
    for (const arc of [...new Set(ws0.flatMap((w) => w.arcs))].sort((a, b) => a - b)) {
      const ws = ws0.filter((w) => w.arcs.includes(arc)), bs = ws.map((w) => base.get(`${w.key}|${arc}`));
      // --arm G=LABEL: the row's arm named outright (the commercial geostationary row's FFMq, which the table gives the windows whose arcs it
      // frees of known burns)
      const forced = Object.fromEntries(String(args.arm ?? '').split(',').filter(Boolean).map((x) => x.split('=')));
      const label = forced[g] ?? (NOT_CONFIGURED.has(g) || !bs.every(Boolean) ? null : PREFER.find((a) => bs.some((b) => b?.arms?.[a]?.ok)) ?? null);
      const c = (count[`${g} ${arc} h`] = { windows: ws.length, arm: label, trajectory: 0, product: 0, refit: 0, noFit: 0, done: 0 });
      c.afterBurn = 0;
      ws.forEach((w, i) => {
        const ab = moved(`${w.key}|${arc}`);
        if (ab) {
          c.afterBurn += 1;
          const job = { g, key: w.key, arc, label: 'FFMq', setting: ab.arms.FFMq.arm, source: 'after-burn', lastBurn: ab.lastBurn, storedRms: ab.arms.FFMq.weightedRms };
          if (doneFit(job, w.cutoffMs)) { c.done += 1; return; }
          jobs.push(job);
          return;
        }
        const a = label ? bs[i]?.arms?.[label] : null, setting = a?.ok ? a.arm : null, p = setting ? productOf(setting, w.key, arc) : null;
        const source = !setting ? 'none' : p?.meta?.trajectory && fs.existsSync(path.join(path.dirname(p.file), p.meta.trajectory.file)) ? 'trajectory' : p ? 'product' : 'refit';
        c[source === 'none' ? 'noFit' : source] += 1;
        const job = { g, key: w.key, arc, label, setting, source, product: p?.file ?? null, storedRms: a?.weightedRms ?? null };
        if (source !== 'none' && doneFit(job, w.cutoffMs)) { c.done += 1; return; }
        jobs.push(job);
      });
    }
  }
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
  const listed = new Set(fs.existsSync(path.join(OUT, 'manifest.jsonl')) ? read(path.join(OUT, 'manifest.jsonl')).map((x) => `${x.key}|${x.arcH}`) : []);
  for (const j of jobs.filter((x) => x.source === 'none' && !listed.has(`${x.key}|${x.arc}`))) fs.appendFileSync(path.join(OUT, 'manifest.jsonl'), `${JSON.stringify({ key: j.key, arcH: j.arc, group: j.g, arm: j.label, source: 'none', why: j.label ? 'the row\'s numerical arm has no successful fit for this window' : 'no properly configured numerical arm on this row' })}\n`);
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
      let product, states, stepOf = null;
      if (j.source === 'after-burn') {
        // the arc the rule gives from the last known burn (the refit row's lastBurn is that burn's end), refitted as refly.mjs does
        F ??= await openFfm();
        const startMs = A.numericalArc([{ from: j.lastBurn, to: j.lastBurn }], D0, Infinity, j.arc, A.minHoursOf(j.g)).startMs, hours = (D0 - startMs) / W.HOUR;
        const truth = await truthSpan(w, D0, j.arc);
        const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= startMs && t <= D0; }), hours);
        if (!thin) throw new Error('coverage of the arc after the burn');
        const f = await F.fit(thin, SETTINGS[j.setting], D0, G.vacuum ? null : W.weatherAt(D0).ffm);
        product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
        line.check = { arcStart: new Date(startMs).toISOString(), refitWeightedRms: f.weightedRms ?? null, storedWeightedRms: j.storedRms ?? null };
        line.fit = { setting: j.setting, process: 'after burn', arcStart: new Date(startMs).toISOString() };
      } else if (j.source === 'refit') {
        F ??= await openFfm();
        const truth = await truthSpan(w, D0, j.arc);
        const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - j.arc * W.HOUR && t <= D0; }), j.arc);
        if (!thin) throw new Error('coverage');
        const f = await F.fit(thin, SETTINGS[j.setting], D0, G.vacuum ? null : W.weatherAt(D0).ffm);
        product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
        line.check = { arcStart: new Date(D0 - j.arc * W.HOUR).toISOString(), refitWeightedRms: f.weightedRms ?? null, storedWeightedRms: j.storedRms ?? null };
      } else product = JSON.parse(fs.readFileSync(j.product, 'utf8')).product;
      if (line.check && line.check.storedWeightedRms != null && !(Math.abs(line.check.refitWeightedRms - line.check.storedWeightedRms) <= REFIT_RMS_TOLERANCE * Math.max(1, Math.abs(line.check.storedWeightedRms)))) throw new Error(`the refit is not the stored fit: weighted RMS ${line.check.refitWeightedRms} against the stored ${line.check.storedWeightedRms}`);
      line.fit ??= { setting: j.setting, process: 'full arc', arcStart: new Date(D0 - j.arc * W.HOUR).toISOString() };
      const from = ms(product.epoch), count = Math.floor((D0 + LEAD_D * W.DAY - from) / (STEP_S * 1000)) + 1;
      line.fit.firstState = new Date(from).toISOString();
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
      const dir = path.join(OUT, j.g); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${nameOf(j.key, j.arc)}${line.fit.process === 'after burn' ? '-after-burn' : ''}.bin`), buf = Buffer.from(new Float64Array(states.flat()).buffer), tmp = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file);
      line.sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      Object.assign(line, { source: j.source === 'trajectory' ? `the stored ${stepOf} s trajectory, every ${STEP_S / stepOf}th state` : j.source === 'product' ? 'a forecast from the stored fitted product' : j.source === 'after-burn' ? AFTER_BURN : 'a refit of the row\'s setting on the window\'s truth', file: path.relative(OUT, file), from: new Date(from).toISOString(), cutoff: new Date(D0).toISOString(), count, parameters: product.parameters });
    } catch (e) { line.source = 'failed'; line.error = String(e?.message ?? e).slice(0, 200); }
    process.send({ line });
  });
  process.send({ ready: true });
}

/** --check: on a store of its own (the numerical rows and ffm-cache linked read-only, a refit folder of the cut's rows, its lists), one
 *  window per source: a stored trajectory, a stored product, a refit of the stored full-arc fit, a refit after a burn on a row whose minimum
 *  arc is 9 h and on one whose minimum is 24 h. Each gives a line whose fit is the row's as the bar reads it (lib/numerical.mjs sameFit),
 *  with count = floor((cutoff + 7 d - first state) / 300 s) + 1 and a file of count x 48 bytes whose sha256 the line names; each refit
 *  gives the stored weighted RMS (the 9 h-minimum one on an arc under 24 h that a burn, not the minimum, sets). A second run flies nothing; a refit row whose last burn moved flies that window-arc again (and, its stored
 *  RMS being of another arc, the line fails); a refit folder of other lists is refused. */
async function check() {
  const E = await import('./lib/e2e.mjs');
  const { check: ok, done } = E.checker('TRAJECTORIES');
  const lists = path.join(A.STORE_ROOT, 'lists-9baa9131dcf8'), folder = `${A.NUMERICAL_STORE}-after-burn-9baa9131dcf8`, abReal = path.join(A.STORE_ROOT, folder);
  if (!fs.existsSync(lists) || !fs.existsSync(abReal)) { console.log('TRAJECTORIES CHECK: did not run: the store holds no lists-9baa9131dcf8 or its refit folder'); return; }
  const dir = E.tmp('trajectories'), store = path.join(dir, 'store'), keys = path.join(dir, 'keys.txt'), H = 3600e3;
  fs.mkdirSync(path.join(store, folder), { recursive: true });
  fs.symlinkSync(path.join(A.STORE_ROOT, A.NUMERICAL_STORE), path.join(store, A.NUMERICAL_STORE)); fs.symlinkSync(CACHE, path.join(store, 'ffm-cache'));
  const base = new Map();
  for (const r of fs.readdirSync(path.join(A.STORE_ROOT, A.NUMERICAL_STORE)).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(A.STORE_ROOT, A.NUMERICAL_STORE, f)))) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  const abRows = fs.readdirSync(abReal).filter((f) => /^rows-after-burn-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(abReal, f)));
  const refitOf = (g, test) => abRows.find((r) => r.group === g && r.arcH === 72 && r.fitProcess === N.REFIT && r.arms?.FFMq?.ok && test(r));
  const he9 = refitOf('HE72', (r) => r.fitArcHours > 9.05 && r.fitArcHours < 24 && !r.burnInArc), s24 = refitOf('S1', (r) => r.fitArcHours >= 24 && r.fitArcHours < 70), full = abRows.find((r) => r.group === 'HE72' && r.arcH === 72 && /^the full arc/.test(r.fitProcess ?? ''));
  // a stored trajectory and a stored product: two windows of one row of a group the refit folder does not hold, whose first ok arm (the
  // arm the tool picks for a row of those two) is the same, one with that fit's stored trajectory and one with its product alone
  const inFolder = new Set(abRows.map((r) => r.group));
  const kindOf = (k, arc, a) => { const b = base.get(`${k}|${arc}`), p = b?.arms?.[a]?.ok ? productOf(b.arms[a].arm, k, arc) : null; return !p ? null : p.meta?.trajectory && fs.existsSync(path.join(path.dirname(p.file), p.meta.trajectory.file)) ? 'trajectory' : 'product'; };
  const firstArm = (k, arc) => PREFER.find((a) => base.get(`${k}|${arc}`)?.arms?.[a]?.ok);
  const storedPair = () => {
    for (const g of ['LS', 'DO', 'S1', 'P', 'GN'].filter((x) => !inFolder.has(x))) for (const arc of [24, 72]) {
      const ks = W.windowsOf([g]).windows.map((w) => w.key);
      for (const a of PREFER) { const of = (kind) => ks.find((k) => firstArm(k, arc) === a && kindOf(k, arc, a) === kind), t = of('trajectory'), p = of('product'); if (t && p) return { g, arc, arm: a, traj: t, prod: p }; }
    }
    return null;
  };
  const sp = storedPair(), traj = sp?.traj, prod = sp?.prod;
  const picked = [he9, s24, full].filter(Boolean);
  fs.writeFileSync(path.join(store, folder, 'rows-after-burn-check.jsonl'), `${picked.map((r) => JSON.stringify(r)).join('\n')}\n`);
  fs.writeFileSync(keys, `${[...picked.map((r) => r.key), traj, prod].filter(Boolean).join('\n')}\n`);
  const run = (more = [], burns = lists) => E.run('trajectories.mjs', ['--keys-file', keys, '--groups', ['HE72', 'S1', sp?.g].filter(Boolean).join(','), '--burns', burns, '--after-burn-store', folder, '--refit', '--jobs', '1', ...more], { HEADLINE_LOOP_STORE: store });
  const r1 = run(), manifest = () => read(path.join(store, 'numerical-trajectories', 'manifest.jsonl'));
  const lines1 = manifest(), lastOf = (key, arc) => lines1.filter((x) => x.key === key && x.arcH === arc).at(-1);
  // the bar's reading: the window's numerical row (the refit where the rule moved the arc), the row's fit, the line's fit
  const afterBurn = new Map(picked.map((r) => [`${r.key}|${r.arcH}`, r])), afterBurnGroups = new Set(picked.map((r) => r.group));
  const winOf = (key) => Object.values(W.windowsOf([key.split('|')[0]])).flat().find((w) => w.key === key);
  const accepted = (key, arc, label) => {
    const w = winOf(key), x = lastOf(key, arc), nr = N.numericalOf({ w, arc, base, afterBurn, afterBurnGroups }), rf = N.rowFitOf(nr, label ?? (nr?.fitProcess === N.REFIT ? 'FFMq' : PREFER.find((a) => nr?.arms?.[a]?.ok)), w.cutoffMs, arc);
    const buf = x?.file ? fs.readFileSync(path.join(store, 'numerical-trajectories', x.file)) : null, count = x ? Math.floor((w.cutoffMs + LEAD_D * 864e5 - Date.parse(x.from)) / (STEP_S * 1000)) + 1 : null;
    const good = !!x && N.sameFit(N.lineFitOf(x, true), rf) && x.count === count && buf?.length === count * 48 && crypto.createHash('sha256').update(buf).digest('hex') === x.sha256 && (!x.check || x.check.refitWeightedRms === x.check.storedWeightedRms);
    return { ok: good, x, why: good ? null : JSON.stringify({ key, source: x?.source, error: x?.error, line: x ? N.lineFitOf(x, true) : null, row: rf, count: [x?.count, count], bytes: buf?.length ?? null, check: x?.check ?? null }) };
  };
  const results = [[he9?.key, 72], [s24?.key, 72], [full?.key, 72], [traj, sp?.arc, sp?.arm], [prod, sp?.arc, sp?.arm]].map(([k, a, l]) => (k ? accepted(k, a, l) : { ok: false, why: 'no such window in the store' }));
  ok(r1.code === 0 && he9 && s24 && full && traj && prod && results.every((x) => x.ok) && /after the burn/.test(results[0].x.source) && /after the burn/.test(results[1].x.source) && /a refit of the row/.test(results[2].x.source) && /^the stored \d+ s trajectory/.test(results[3].x.source) && /a forecast from the stored fitted product/.test(results[4].x.source),
    `each source gives the row's fit: ${r1.err.slice(-300)} ${results.map((x) => (x.ok ? x.x.source.slice(0, 30) : x.why)).join(' | ')}`);
  const r2 = run(), lines2 = manifest();
  ok(r2.code === 0 && lines2.length === lines1.length, `a second run flew again: ${lines2.length - lines1.length} lines`);
  // the refit row's last burn moved by 5 minutes: that window-arc is flown again; the stored RMS is of the other arc, so the line fails
  const moved = { ...he9, lastBurn: new Date(Date.parse(he9.lastBurn) + 5 * 60e3).toISOString() };
  fs.writeFileSync(path.join(store, folder, 'rows-after-burn-check.jsonl'), `${[moved, s24, full].map((r) => JSON.stringify(r)).join('\n')}\n`);
  const r3 = run(), lines3 = manifest(), new3 = lines3.slice(lines2.length);
  ok(r3.code === 0 && new3.length === 1 && new3[0].key === he9.key && new3[0].source === 'failed' && /the refit is not the stored fit/.test(new3[0].error ?? ''),
    `a moved refit row flies its window-arc again: ${JSON.stringify(new3.map((x) => [x.key, x.source, x.error?.slice(0, 60)]))}`);
  // a refit folder of other lists is refused
  const other = path.join(dir, 'lists-other');
  fs.cpSync(lists, other, { recursive: true });
  const tess = path.join(other, 'HE', 'TESS.burns.json');
  fs.writeFileSync(tess, `${fs.readFileSync(tess, 'utf8').trimEnd()} `);
  const r4 = run([], other);
  ok(r4.code !== 0 && /refused: .* were made on burn lists other than --burns gives/.test(r4.err), `a folder of other lists: ${r4.code} ${r4.err.slice(-200)}`);
  fs.rmSync(dir, { recursive: true, force: true });
  done('trajectories.mjs gives, for one window of each source (a stored trajectory, a stored product, a refit of the stored full-arc fit, a refit after a burn on a 9 h-minimum and on a 24 h-minimum row), a line whose fit is the row\'s as the bar reads it, with its count, a file of count x 48 bytes and the sha256 its line names, each refit at the stored weighted RMS; a second run flies nothing; a refit row whose last burn moved flies that window-arc again, refused against the stored RMS; a refit folder of other lists is refused');
}
