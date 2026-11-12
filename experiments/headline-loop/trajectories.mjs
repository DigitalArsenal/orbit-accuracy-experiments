// The numerical arm's trajectory for every scoreboard window (stack #503 step 4, #504): for each window and fit arc of the window list,
// the row's numerical arm (the fullest stored setting by name, as table.mjs picks it), its trajectory from the fit arc's first state to
// 7 days after the cutoff on the fit arc's own 300 s grid, GCRF. Source, in order: the stored 60 s trajectory taken every 5th state; else
// a forecast from the stored fitted product; else a refit of that setting on the window's truth (with --refit); else none (counted).
//   node experiments/headline-loop/trajectories.mjs --keys <file of window keys> [--groups LS,DO,...] [--after-burn-store <folder>]
//     [--arm G=LABEL,...] [--redo <file of key|arc>] [--only <key|arc;...>] [--inventory] [--refit] [--jobs 4]
// A refit after a burn is made on the arc the rule gives from the refit row's last burn, with the row's own minimum arc (lib/arms.mjs
// minHoursOf); every refit, after a burn or of the full arc, records its weighted RMS beside the stored fit's (check), so a refit that is
// not the stored fit shows. The truth is read over the window's full span (the fit arc and 7 days), as refly.mjs reads it.
// Writes <store>/numerical-trajectories/<group>/<key>-<arc>.bin (Float64 x, y, z km, vx, vy, vz km/s per state) and one manifest line per
// window-arc to <store>/numerical-trajectories/manifest.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { fork } from 'node:child_process';
const SELF = new URL(import.meta.url).pathname;
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const E = await import('./lib/env.mjs'); E.usePackages();
const W = await import('./lib/windows.mjs');
const A = await import('./lib/arms.mjs');
const OUT = path.join(A.STORE_ROOT, 'numerical-trajectories'), CACHE = path.join(A.STORE_ROOT, 'ffm-cache');
const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'], NOT_CONFIGURED = new Set(['WA']), STEP_S = 300, LEAD_D = 7;
const AFTER_BURN = 'a refit after the burn: the full setting on the arc after the last known burn (refly.mjs --after-burns), made again here';
const read = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const nameOf = (key, arc) => `${key.replace(/[| ]/g, '_')}-${arc}`;
const productOf = (setting, key, arc) => { for (const d of fs.readdirSync(CACHE).filter((x) => x.startsWith(`${setting}-`))) { const f = path.join(CACHE, d, `${nameOf(key, arc)}.json`); if (fs.existsSync(f)) return { file: f, meta: JSON.parse(fs.readFileSync(f, 'utf8')) }; } return null; };

if (args.worker) await worker(); else await main();

async function main() {
  const KEYS = new Set(fs.readFileSync(args.keys, 'utf8').split('\n').filter(Boolean));
  const baseDir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE), base = new Map();
  for (const r of fs.readdirSync(baseDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(baseDir, f)))) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  const groups = args.groups ? args.groups.split(',') : ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE72', 'HE', 'HX'];
  // the numerical arm's fit of a maneuvering object on the arc after its last burn (refly.mjs --after-burns, stack #462): where the rule
  // moved the arc, that refit is the window's numerical arm and its trajectory is made from it (the refit rows hold no fitted state, so
  // the same refit is made again here on the same arc)
  // --after-burn-store <folder>: the refits of the lists the table reads (one folder per set of lists, table.mjs --after-burn-store)
  const abDir = path.join(A.STORE_ROOT, args['after-burn-store'] ?? A.NUMERICAL_AFTER_BURN.store), afterBurn = new Map();
  for (const r of fs.existsSync(abDir) ? fs.readdirSync(abDir).filter((f) => /^rows-after-burn-.*\.jsonl$/.test(f)).flatMap((f) => read(path.join(abDir, f))) : []) if (!r.error) afterBurn.set(`${r.key}|${r.arcH}`, r);
  const moved = (k) => { const r = afterBurn.get(k); return r && /^maneuvering: the arc after its last burn/.test(r.fitProcess) && r.arms?.FFMq?.ok ? r : null; };
  const prior = fs.existsSync(path.join(OUT, 'manifest.jsonl')) ? read(path.join(OUT, 'manifest.jsonl')) : [];
  // a window-arc is done when its last line is a trajectory of the source it needs now (an after-burn refit supersedes the stored fit's)
  const lastLine = new Map(prior.map((x) => [`${x.key}|${x.arcH}`, x]));
  // --redo <file of key|arc>: those window-arcs are flown again whatever their last line (a refit made again on the rule in code)
  const redo = args.redo ? new Set(fs.readFileSync(args.redo, 'utf8').split('\n').filter(Boolean)) : new Set();
  const done = new Set([...lastLine].filter(([k, x]) => !redo.has(k) && x.source !== 'none' && x.source !== 'failed' && (!moved(k) || x.source === AFTER_BURN)).map(([k]) => k));
  const jobs = [], count = {};
  for (const g of groups) {
    const all = W.windowsOf([g]), ws0 = [...all.windows, ...all.second].filter((w) => KEYS.has(w.key));
    for (const arc of [...new Set(ws0.flatMap((w) => w.arcs))].sort((a, b) => a - b)) {
      const ws = ws0.filter((w) => w.arcs.includes(arc)), bs = ws.map((w) => base.get(`${w.key}|${arc}`));
      // --arm G=LABEL: the row's arm named outright (a row the scoreboard gives an arm the table rule does not, e.g. WA=FFMq)
      const forced = Object.fromEntries(String(args.arm ?? '').split(',').filter(Boolean).map((x) => x.split('=')));
      const label = forced[g] ?? (NOT_CONFIGURED.has(g) || !bs.every(Boolean) ? null : PREFER.find((a) => bs.some((b) => b?.arms?.[a]?.ok)) ?? null);
      const c = (count[`${g} ${arc} h`] = { windows: ws.length, arm: label, trajectory: 0, product: 0, refit: 0, noFit: 0, done: 0 });
      c.afterBurn = 0;
      ws.forEach((w, i) => {
        const ab = moved(`${w.key}|${arc}`);
        if (ab) {
          c.afterBurn += 1;
          if (done.has(`${w.key}|${arc}`)) { c.done += 1; return; }
          jobs.push({ g, key: w.key, arc, label: 'FFMq', setting: ab.arms.FFMq.arm, source: 'after-burn', lastBurn: ab.lastBurn, storedRms: ab.arms.FFMq.weightedRms });
          return;
        }
        const a = label ? bs[i]?.arms?.[label] : null, setting = a?.ok ? a.arm : null, p = setting ? productOf(setting, w.key, arc) : null;
        const source = !setting ? 'none' : p?.meta?.trajectory && fs.existsSync(path.join(path.dirname(p.file), p.meta.trajectory.file)) ? 'trajectory' : p ? 'product' : 'refit';
        c[source === 'none' ? 'noFit' : source] += 1;
        if (done.has(`${w.key}|${arc}`)) { c.done += 1; return; }
        jobs.push({ g, key: w.key, arc, label, setting, source, product: p?.file ?? null, storedRms: a?.weightedRms ?? null });
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
  const N = Math.min(Number(args.jobs ?? 4), todo.length);
  await Promise.all(Array.from({ length: N }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => (next < todo.length ? child.send(todo[next++]) : child.send({ stop: true }));
    child.on('message', (m) => { if (m.line) { fs.appendFileSync(path.join(OUT, 'manifest.jsonl'), `${JSON.stringify(m.line)}\n`); n += 1; if (n % 100 === 0 || n === todo.length) console.error(`  ${n}/${todo.length}`); } give(); });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker ${code}`))));
  })));
  process.exit(0);
}

async function worker() {
  const { openFfm, SETTINGS } = await import('./lib/ffm.mjs');
  let F = null, AX = null;
  // the truth on the window's full span (the fit arc and 7 days), as refly.mjs reads it: on the 72 h TESS row the one file is chosen from that
  // span, so the refit here reads the same file as the stored one; the frame axes are the arms' (the NAIF kernels' EME2000 to GCRF)
  const truthSpan = async (w, D0, arc) => { AX ??= (await A.openArms()).axes; return W.truthOf(w, D0 - arc * W.HOUR - W.HOUR, D0 + LEAD_D * W.DAY + W.HOUR, AX); };
  const ms = (t) => Date.parse(/Z$/.test(t) ? t : `${t}Z`);
  process.on('message', async (j) => {
    if (j.stop) { if (F) await F.close(); process.exit(0); }
    const line = { key: j.key, arcH: j.arc, group: j.g, arm: j.label, setting: j.setting, stepS: STEP_S, frame: 'GCRF', layout: 'Float64 x, y, z km, vx, vy, vz km/s per state' };
    try {
      const w = [...W.windowsOf([j.g]).windows, ...W.windowsOf([j.g]).second].find((x) => x.key === j.key), D0 = w.cutoffMs, G = W.GROUPS[j.g];
      let product, states;
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
      } else if (j.source === 'refit') {
        F ??= await openFfm();
        const truth = await truthSpan(w, D0, j.arc);
        const thin = W.arcOf(truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - j.arc * W.HOUR && t <= D0; }), j.arc);
        if (!thin) throw new Error('coverage');
        const f = await F.fit(thin, SETTINGS[j.setting], D0, G.vacuum ? null : W.weatherAt(D0).ffm);
        product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
        line.check = { arcStart: new Date(D0 - j.arc * W.HOUR).toISOString(), refitWeightedRms: f.weightedRms ?? null, storedWeightedRms: j.storedRms ?? null };
      } else product = JSON.parse(fs.readFileSync(j.product, 'utf8')).product;
      const from = ms(product.epoch), count = Math.floor((D0 + LEAD_D * W.DAY - from) / (STEP_S * 1000)) + 1;
      if (j.source === 'trajectory') {
        const meta = JSON.parse(fs.readFileSync(j.product, 'utf8')), tr = meta.trajectory, buf = fs.readFileSync(path.join(path.dirname(j.product), tr.file)), f64 = new Float64Array(buf.buffer, buf.byteOffset, buf.length / 8);
        const k0 = Math.round((from - ms(tr.from)) / (tr.stepS * 1000)), every = STEP_S / tr.stepS;
        if (k0 !== 0 || every !== Math.round(every) || k0 + (count - 1) * every >= tr.count) throw new Error(`the stored trajectory does not cover the span (${tr.from}, ${tr.count} at ${tr.stepS} s)`);
        states = Array.from({ length: count }, (_, k) => Array.from(f64.subarray((k * every) * 6, (k * every) * 6 + 6)));
      } else {
        F ??= await openFfm();
        const epochs = Array.from({ length: count }, (_, k) => new Date(from + k * STEP_S * 1000).toISOString());
        states = (await F.forecast(product, epochs, SETTINGS[j.setting], G.vacuum ? null : W.weatherAt(D0).ffm)).map((s) => [...s.r, ...s.v]);
      }
      const dir = path.join(OUT, j.g); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${nameOf(j.key, j.arc)}.bin`);
      fs.writeFileSync(file, Buffer.from(new Float64Array(states.flat()).buffer));
      Object.assign(line, { source: j.source === 'trajectory' ? 'the stored 60 s trajectory, every 5th state' : j.source === 'product' ? 'a forecast from the stored fitted product' : j.source === 'after-burn' ? AFTER_BURN : 'a refit of the row\'s setting on the window\'s truth', file: path.relative(OUT, file), from: new Date(from).toISOString(), cutoff: new Date(D0).toISOString(), count, parameters: product.parameters });
    } catch (e) { line.source = 'failed'; line.error = String(e?.message ?? e).slice(0, 200); }
    process.send({ line });
  });
  process.send({ ready: true });
}
