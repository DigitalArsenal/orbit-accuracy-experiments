// Part 5 (A4, A5, A8): real Starlink-Starlink close approaches of part 1a, once bin 3 is complete. Phases, each under <store>/part5/<through>/:
//   states   each satellite both SGP4-XP and FFM fitted: its truth lines (part 1a's reader) and FFM's and SGP4-XP's predictions at the same
//            epochs (states/<norad>.f64: per epoch ms, then truth, FFM, SGP4-XP position and velocity, km and km/s, GCRF)
//   screen   one set (--set truth|ffm|sgp4xp) screened all-vs-all by analysis/conjunction-assessment in 1 h windows and lossless units (A8)
//   encounters  the three sets' events merged into encounters; those entering (any set under 5 km)
//   cov      FFM's carried covariance and SGP4-XP's module covariance at 60 s steps over each entering encounter's 20 min
//   assess   per entering encounter, the two objects screened by screen_catalog over 20 min (A9): the truth's closest approach, and each
//            arm's TCA, miss and Pc (Foster, 20 m, from the arm's covariance)
//   summary  per class (unmaneuvered, maneuvered pairs): A4's metrics and verdict, A5's calls (rows/ca.part5.json)
//   node experiments/sdn-ap-mixed-screening/part5-starlink.mjs --through <cycle> --phase <phase> [--set <set>] [--shard k/n]
// JavaScript routes records, groups satellites by the module's own states and counts; screening, TCA, miss and Pc are the module's.
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, frozen, readJsonl, write, g1Dir, paced } from './common.mjs';

frozen();
const { windowOf, completeBins, forecastCycle } = await import('./part1-starlink.mjs');
const H = 3600e3, MIN = 60e3, UNIT = 600;
const THRESHOLD_M = process.env.B2_PART5_TEST ? Number(process.env.B2_PART5_TEST_THRESHOLD_M ?? 5000) : 5000; // A8: 5 km; a test may widen it
const through = args.through;
// B2_PART5_TEST lets a test run the phases on capture cycles before the registration, where bin 3 cannot be complete; the check never sets it
if (!through || (completeBins(through).length !== config.part1.starlink.binsHours.length && !process.env.B2_PART5_TEST)) throw new Error('part 5 runs at a cycle where bin 3 is complete (--through)');
const phase = args.phase;
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const dir = path.join(store, 'part5', through);
fs.mkdirSync(path.join(dir, 'states'), { recursive: true });
const rowsOf = (prefix) => new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => f.startsWith(prefix)).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.norad, r]));
const SETS = ['truth', 'ffm', 'sgp4xp'];
const statesFile = (norad) => path.join(dir, 'states', `${norad}.f64`);
/** A satellite's stored states: { ms: Float64Array, truth|ffm|sgp4xp: [{ r, v }] by epoch index }. */
function readStates(norad) {
  const a = new Float64Array(fs.readFileSync(statesFile(norad)).buffer.slice(0));
  const count = a.length / 19, ms = new Float64Array(count), sets = { truth: [], ffm: [], sgp4xp: [] };
  for (let i = 0; i < count; i += 1) {
    const o = 19 * i; ms[i] = a[o];
    SETS.forEach((s, j) => sets[s].push({ r: [a[o + 1 + 6 * j], a[o + 2 + 6 * j], a[o + 3 + 6 * j]], v: [a[o + 4 + 6 * j], a[o + 5 + 6 * j], a[o + 6 + 6 * j]] }));
  }
  return { ms, ...sets };
}
const index = () => fs.readdirSync(dir).filter((f) => /^states\.s\d+\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(dir, f)));

const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
const modules = modulesRoot();

if (phase === 'states') {
  const { openFits, statesAt } = await import('./lib/fits.mjs');
  const a = await openFits(modules), ff = await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules);
  const fits = rowsOf('starlink-fit.'), ffmFits = rowsOf('starlink-ffm.');
  const score = new Map(fs.readdirSync(path.join(store, 'rows')).filter((f) => f.startsWith(`starlink-score.${through}.`)).flatMap((f) => readJsonl(path.join(store, 'rows', f))).map((r) => [r.norad, r]));
  const population = [...fits.keys()].filter((x) => fits.get(x).sgp4xp?.ok && ffmFits.get(x)?.ffm?.ok && (score.get(x)?.arms || process.env.B2_PART5_TEST)).sort((x, y) => x - y);
  const out = path.join(dir, `states.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => r.norad));
  for (let i = 0; i < population.length; i += 1) {
    const norad = population[i];
    if (i % n !== k || done.has(norad)) continue;
    if (i % 50 === k) await paced();
    const w = windowOf(norad, through);
    const epochs = w.truth.map((l) => Date.parse(l.epoch));
    const f = ffmFits.get(norad), g = fits.get(norad);
    let row = { norad, E: new Date(w.E).toISOString(), epochs: epochs.length, maneuverEvident: score.get(norad)?.maneuverEvident ?? null };
    try {
      const fm = await ff.predict(f.ffm, norad, epochs, w.E), xp = await statesAt(a, g.sgp4xp.omm, epochs, 'GCRF');
      const buf = new Float64Array(19 * epochs.length);
      epochs.forEach((t, j) => { buf.set([t, ...w.truth[j].r, ...w.truth[j].v, ...fm[j].r, ...fm[j].v, ...xp[j].r, ...xp[j].v], 19 * j); });
      fs.writeFileSync(statesFile(norad), Buffer.from(buf.buffer));
    } catch (error) { row = { ...row, error: String(error.message).slice(0, 160) }; }
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  }
  await a.close(); await ff.close();
  process.exit(0);
}

if (phase === 'screen') {
  const set = args.set;
  if (!SETS.includes(set)) throw new Error('--set truth|ffm|sgp4xp');
  const { openCqr } = await import('./lib/cqr.mjs');
  const cqr = await openCqr(modules);
  const sats = index().filter((r) => !r.error).map((r) => ({ norad: r.norad, E: Date.parse(r.E), ...readStates(r.norad) }));
  const first = Math.min(...sats.map((s) => s.E)), last = Math.max(...sats.map((s) => s.E)) + 72 * H;
  const windows = Math.ceil((last - first) / H);
  const workers = Number(args.workers ?? 4);
  for (let wi = 0; wi < windows; wi += 1) {
    if (wi % n !== k) continue;
    const out = path.join(dir, `events.${set}.w${wi}.json`);
    if (fs.existsSync(out)) continue;
    await paced();
    const ws = first + wi * H, we = Math.min(ws + H, last);
    const covered = [], uncovered = [];
    for (const s of sats) {
      const idx = []; for (let i = 0; i < s.ms.length; i += 1) if (s.ms[i] >= ws - 20 * MIN && s.ms[i] <= we + 20 * MIN) idx.push(i);
      const t = idx.map((i) => s.ms[i]);
      const gaps = t.slice(1).every((x, i) => x - t[i] <= 11 * MIN);
      if (!t.length || t[0] > ws - 10 * MIN || t.at(-1) < we + 10 * MIN || !gaps) { uncovered.push(s.norad); continue; }
      const states = idx.map((i) => ({ ms: s.ms[i], ...s[set][i] }));
      const radii = idx.filter((i) => s.ms[i] >= ws - 10 * MIN && s.ms[i] <= we + 10 * MIN).map((i) => Math.hypot(...s[set][i].r));
      covered.push({ norad: s.norad, states, lo: Math.min(...radii), hi: Math.max(...radii) });
    }
    // lossless units (A8 point 3): satellites in order of their least distance from Earth's center, a unit's range the union of its members'
    covered.sort((x, y) => x.lo - y.lo);
    const units = [];
    for (let i = 0; i < covered.length; i += UNIT) { const m = covered.slice(i, i + UNIT); units.push({ m, lo: Math.min(...m.map((x) => x.lo)), hi: Math.max(...m.map((x) => x.hi)), sources: m.map((x, j) => cqr.source(j + 1, x.norad, x.states)) }); }
    const ctl = { startMs: ws, seconds: (we - ws) / 1000, thresholdM: THRESHOLD_M, workers };
    const events = [], stats = { calls: 0, pairs: 0, unitPairsSkipped: 0 };
    const t0 = Date.now();
    for (let ua = 0; ua < units.length; ua += 1) {
      for (let ub = ua; ub < units.length; ub += 1) {
        const A = units[ua], B = units[ub];
        if (ub > ua && (B.lo > A.hi + THRESHOLD_M / 1000 || A.lo > B.hi + THRESHOLD_M / 1000)) { stats.unitPairsSkipped += 1; continue; }
        const r = ub === ua ? await cqr.screen(A.sources, null, ctl) : await cqr.screen(A.sources, B.sources.map((x, j) => Object.assign(Object.create(Object.getPrototypeOf(x)), x, { SOURCE_HANDLE: A.sources.length + j + 1 })), ctl);
        stats.calls += 1; stats.pairs += r.statistics.PAIRS_SCREENED ?? 0;
        events.push(...r.events);
      }
    }
    write(out, { set, window: wi, startUtc: new Date(ws).toISOString(), stopUtc: new Date(we).toISOString(), covered: covered.length, uncovered, units: units.length, ...stats, seconds: (Date.now() - t0) / 1000, events });
    console.error(`part 5 screen ${set} window ${wi}/${windows}: ${covered.length} covered, ${events.length} events, ${stats.calls} calls, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  await cqr.close();
  process.exit(0);
}

/** The three sets' events merged into encounters (A8 point 4): a pair's events within 10 min of each other, timed at the earliest. */
function encountersOf() {
  const byPair = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^events\.(truth|ffm|sgp4xp)\.w\d+\.json$/.test(x))) {
    const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const e of w.events) { const a = Math.min(e.a, e.b), b = Math.max(e.a, e.b), key = `${a}|${b}`; if (!byPair.has(key)) byPair.set(key, []); byPair.get(key).push({ ...e, a, b, set: w.set }); }
  }
  const out = [];
  for (const list of byPair.values()) {
    list.sort((x, y) => x.tcaMs - y.tcaMs);
    let cur = null;
    for (const e of list) {
      if (cur && e.tcaMs - cur.timeMs <= 10 * MIN) { cur.events.push(e); continue; } // within 10 min of the encounter's earliest event (A9)
      cur = { a: e.a, b: e.b, timeMs: e.tcaMs, events: [e] }; out.push(cur);
    }
  }
  return out.map((x) => ({ ...x, entering: x.events.some((e) => e.missM < THRESHOLD_M) })).sort((x, y) => x.timeMs - y.timeMs || x.a - y.a || x.b - y.b);
}

if (phase === 'encounters') {
  const all = encountersOf(), entering = all.filter((x) => x.entering);
  entering.forEach((x, i) => { x.id = i; });
  write(path.join(dir, 'encounters.json'), { encounters: all.length, entering: entering.length, list: entering });
  console.error(`part 5: ${all.length} encounters, ${entering.length} entering`);
  process.exit(0);
}

const enc = () => JSON.parse(fs.readFileSync(path.join(dir, 'encounters.json'), 'utf8')).list;
const assessEpochs = (timeMs) => Array.from({ length: 21 }, (_, j) => Math.round(timeMs / 1000) * 1000 - 10 * MIN + j * MIN);

if (phase === 'cov') {
  // FFM's carried covariance and SGP4-XP's at the 21 epochs of each entering encounter, one propagation per satellite (A8 point 5)
  const { openFits, sgp4xpCovarianceAt } = await import('./lib/fits.mjs');
  const a = await openFits(modules), ff = await (await import('./lib/ffm-fit.mjs')).openFfmFit(modules);
  const fits = rowsOf('starlink-fit.'), ffmFits = rowsOf('starlink-ffm.');
  const need = new Map();
  for (const e of enc()) for (const x of [e.a, e.b]) { if (!need.has(x)) need.set(x, new Set()); for (const t of assessEpochs(e.timeMs)) need.get(x).add(t); }
  const sats = [...need.keys()].sort((x, y) => x - y);
  fs.mkdirSync(path.join(dir, 'cov'), { recursive: true });
  const E = new Map(index().map((r) => [r.norad, Date.parse(r.E)]));
  for (let i = 0; i < sats.length; i += 1) {
    const norad = sats[i], file = path.join(dir, 'cov', `${norad}.json`);
    if (i % n !== k || fs.existsSync(file)) continue;
    if (i % 50 === k) await paced();
    const epochs = [...need.get(norad)].sort((x, y) => x - y);
    const out = { norad, epochs };
    try {
      const g = ffmFits.get(norad).ffm, scale = Math.max(1, g.reducedChiSquare ?? 1);
      const fm = await ff.predict(g, norad, epochs, E.get(norad), 'starlink', { covariance: g.covariance.map((x) => x * scale) });
      out.ffm = fm.map((s) => ({ r: s.r, v: s.v, covariance: Array.from({ length: 36 }, (_, q) => s.covariance[Math.floor(q / 6) * s.n + (q % 6)] * 1e-6) }));
    } catch (error) { out.ffmError = String(error.message).slice(0, 160); }
    try { out.sgp4xp = await sgp4xpCovarianceAt(a, fits.get(norad).sgp4xp.omm, epochs); } catch (error) { out.sgp4xpError = String(error.message).slice(0, 160); }
    write(file, out);
  }
  await a.close(); await ff.close();
  process.exit(0);
}

if (phase === 'assess') {
  const { openCqr } = await import('./lib/cqr.mjs');
  const cqr = await openCqr(modules);
  // --only <id> --out <file>: one encounter into another file (run.mjs --check replays it)
  const out = args.out ?? path.join(dir, `assessed.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => r.id));
  const only = args.only != null ? Number(args.only) : null;
  const cache = new Map();
  const statesOf = (norad) => { if (!cache.has(norad)) { if (cache.size > 2000) cache.delete(cache.keys().next().value); cache.set(norad, readStates(norad)); } return cache.get(norad); };
  const covOf = (norad) => JSON.parse(fs.readFileSync(path.join(dir, 'cov', `${norad}.json`), 'utf8'));
  const man = new Map(index().map((r) => [r.norad, r.maneuverEvident]));
  for (const e of enc()) {
    if (only != null ? e.id !== only : e.id % n !== k || done.has(e.id)) continue;
    if (only == null && e.id % 200 === k) await paced();
    const epochs = assessEpochs(e.timeMs);
    const ctl = (algorithm, from, to) => ({ startMs: from, seconds: (to - from) / 1000, thresholdM: 1e6, algorithm, coarseStepSeconds: 10 });
    const row = { id: e.id, a: e.a, b: e.b, timeMs: e.timeMs, maneuvered: Boolean(man.get(e.a) || man.get(e.b)), sets: Object.fromEntries(e.events.map((x) => [x.set, { tcaMs: x.tcaMs, missM: x.missM }])) };
    // the truth's closest approach: the truth states within 30 min either side, no gap over 11 min
    const truthSource = (norad, h) => {
      const s = statesOf(norad), idx = [];
      for (let i = 0; i < s.ms.length; i += 1) if (Math.abs(s.ms[i] - e.timeMs) <= 30 * MIN) idx.push(i);
      const t = idx.map((i) => s.ms[i]);
      if (!t.length || t[0] > e.timeMs - 10 * MIN || t.at(-1) < e.timeMs + 10 * MIN || !t.slice(1).every((x, i) => x - t[i] <= 11 * MIN)) return null;
      return { source: cqr.source(h, norad, idx.map((i) => ({ ms: s.ms[i], ...s.truth[i] }))), from: t[0], to: t.at(-1) };
    };
    const ta = truthSource(e.a, 1), tb = truthSource(e.b, 2);
    if (!ta || !tb) row.setAside = 'a truth gap at the encounter';
    else {
      row.truth = await cqr.closest(ta.source, tb.source, ctl('ALFANO_MAXIMUM', Math.max(ta.from, tb.from), Math.min(ta.to, tb.to)));
      if (row.truth.error === 'no minimum in the window') row.setAside = 'no true minimum within 30 min (A9)';
      const ca = covOf(e.a), cb = covOf(e.b);
      row.arms = {};
      for (const [arm, frame] of [['ffm', 'GCRF'], ['sgp4xp', 'TEME']]) {
        if (!ca[arm] || !cb[arm]) { row.arms[arm] = { pcError: ca[`${arm}Error`] ?? cb[`${arm}Error`] ?? 'no covariance' }; continue; }
        const pick = (c) => epochs.map((t) => { const j = c.epochs.indexOf(t); return { ms: t, ...c[arm][j] }; });
        const r = await cqr.closest(cqr.source(1, e.a, pick(ca), frame), cqr.source(2, e.b, pick(cb), frame), ctl('FOSTER', epochs[0], epochs.at(-1)), frame);
        // no minimum in the 20 min: the arm predicts no close approach there, a green call (A9 point 3)
        row.arms[arm] = r.error === 'no minimum in the window' ? { noMinimum: true, predictedMissM: null, pc: 0 } : r.error ? { pcError: r.error } : { tcaMs: r.tcaMs, predictedMissM: r.missM, pc: r.pc, pcConverged: r.pcConverged };
      }
    }
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  }
  await cqr.close();
  process.exit(0);
}

if (phase === 'summary') {
  const { summarize } = await import('./lib/ca.mjs');
  const rows = fs.readdirSync(dir).filter((f) => /^assessed\.s\d+\.jsonl$/.test(f)).flatMap((f) => readJsonl(path.join(dir, f)));
  const screens = fs.readdirSync(dir).filter((f) => /^events\..+\.json$/.test(f)).map((f) => { const w = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return { set: w.set, window: w.window, covered: w.covered, uncovered: w.uncovered.length, events: w.events.length, calls: w.calls, pairs: w.pairs, seconds: w.seconds }; });
  const ok = rows.filter((r) => !r.setAside && !r.truth?.error);
  const noMinimum = Object.fromEntries(['ffm', 'sgp4xp'].map((arm) => [arm, ok.filter((r) => r.arms?.[arm]?.noMinimum).length]));
  const asEncounter = (r) => ({ k: r.id, L: 'all', primary: `${r.a}|${r.b}`, primaryObject: String(r.a), trueMissM: r.truth.missM, arms: Object.fromEntries(Object.entries(r.arms).map(([arm, x]) => [arm, x.pcError ? { predictedMissM: x.predictedMissM ?? null, pc: null } : { predictedMissM: x.predictedMissM, pc: x.pc }])) });
  const summary = { through, forecastCycle, noMinimum, encounters: JSON.parse(fs.readFileSync(path.join(dir, 'encounters.json'), 'utf8')).encounters, entering: rows.length, setAside: rows.filter((r) => r.setAside).length, truthFailed: rows.filter((r) => r.truth?.error).length,
    screens: { windows: new Set(screens.map((s) => s.window)).size, bySet: Object.fromEntries(SETS.map((s) => [s, { windows: screens.filter((x) => x.set === s).length, events: screens.filter((x) => x.set === s).reduce((t, x) => t + x.events, 0), pairsScreened: screens.filter((x) => x.set === s).reduce((t, x) => t + x.pairs, 0), meanCovered: screens.filter((x) => x.set === s).reduce((t, x) => t + x.covered, 0) / Math.max(1, screens.filter((x) => x.set === s).length) }])) },
    classes: {} };
  for (const [cls, f] of [['unmaneuvered', (r) => !r.maneuvered], ['maneuvered', (r) => r.maneuvered]]) {
    const list = ok.filter(f).map(asEncounter);
    summary.classes[cls] = list.length ? summarize('starlink-part5', cls, list, { attempted: list.length, noPrimary: 0, noSecondary: 0 }, { leads: ['all'] }) : { encounters: 0, note: 'no encounter' };
  }
  write(path.join(store, 'rows', 'ca.part5.json'), summary);
  console.error(`part 5 summary: ${rows.length} entering, ${summary.setAside} set aside`);
  process.exit(0);
}
throw new Error(`unknown phase ${phase}`);
