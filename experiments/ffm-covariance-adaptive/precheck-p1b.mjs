// C3-A2 point 1: does GNSS truth from ESA's next file hide a covariance that is too tight? Per class (GLONASS, Galileo), axis and lead (1, 6, 12, 24 h), mean z^2 under C2's P with the primary cells' exclusions (storm samples,
// notices, truth gate): A = forecast against ESA's next file, B = forecast against GFZ0MGXRAP, C = ESA's next file against GFZ scaled by the same P. r_low = A / B, r_high = A / (B - C). Calibration windows of C3's calibration
// satellites only, in the order of the lowest SHA-256 of C3S|p1|<norad>|<E>, one round across every satellite at a time. Paired bootstrap over satellites and windows, 10,000 resamples, seed SHA-256 C3S|p1b|<class>|<axis>|<L>.
// GFZ's products are read from E14's reference directory; E14's results are not. No fresh file. FFM: RK78, relative tolerance 1e-10, steps up to 120 s; fit track 600 s; outputs at the four leads and the 600 s noise grid.
//   node experiments/ffm-covariance-adaptive/precheck-p1b.mjs --run --rounds a:b --shard k/n     rows under <store>/p1b/
//   node experiments/ffm-covariance-adaptive/precheck-p1b.mjs --evaluate                          the widest half-width and the CPU spent, nothing else
//   node experiments/ffm-covariance-adaptive/precheck-p1b.mjs --evaluate --final                  the end: the table, the rule's outcome and the receipt
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, registered, Opened, writeReceipt, c2Results, root, sha256, iso, readJsonl, grid, HOUR, DAY } from './common.mjs';
import { pC2, AXES } from './lib/model.mjs';
import { stormDays, isStorm } from './lib/windows.mjs';
import { parseSinex, loadNotices } from './lib/notices.mjs';

registered();
const opened = new Opened();
const R = config.p1b, dirOut = path.join(store, 'p1b');
fs.mkdirSync(dirOut, { recursive: true });
const P = config.population.judged;
const pop = config.population.calVal.R3.filter((n) => P.glonass.c2.includes(n) || P.galileo.new.includes(n));
const classOf = (n) => (P.glonass.c2.includes(n) ? 'GLONASS' : 'Galileo');
const cutoffs = grid(config.sets.calibration.from, config.sets.calibration.to, config.sets.calibration.everyDays);
const orderOf = (norad) => cutoffs.map((E) => ({ E, h: sha256(Buffer.from(`C3S|p1|${norad}|${iso(E)}`)) })).sort((a, b) => (a.h < b.h ? -1 : 1)).map((x) => x.E);

if (args.run) {
  const [a, b] = args.rounds.split(':').map(Number), [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  const out = path.join(dirOut, `rows.s${a}-${b}.${k}.jsonl`);
  const done = new Set(fs.readdirSync(dirOut).filter((f) => f.startsWith('rows.')).flatMap((f) => readJsonl(path.join(dirOut, f))).map((r) => `${r.norad}|${r.E}`));
  const { openSession } = await import('./run.mjs');
  const { windowOf } = await import('./lib/chain.mjs');
  const { settingsFor } = await import('./lib/open.mjs');
  const { windowTermsRef } = await import('./lib/terms.mjs');
  const SRC = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs'));
  const S = await openSession(opened, { fromMs: Date.parse('2025-09-20T00:00:00Z'), toMs: Date.parse('2026-04-15T00:00:00Z'), allowedToMs: Date.parse('2026-06-15T00:00:00Z') });
  const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))).classes.R3.parameters;
  const IDENTITY = Array.from({ length: 36 }, (_, i) => (i % 7 === 0 ? 1 : 0));
  /** GFZ's state at an epoch: the daily file that holds it, read through the truth gate; nothing else of E14's. */
  const gfzCache = new Map();
  const gfzAt = (norad, epochIso) => {
    const t = Date.parse(/Z$/.test(epochIso) ? epochIso : `${epochIso}Z`) + 18e3, d = new Date(t), y = d.getUTCFullYear(), doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / DAY) + 1;
    const name = `${R.gfz.prefix}${y}${String(doy).padStart(3, '0')}0000_01D_05M_ORB`, file = path.join(R.gfz.root, name, `${norad}.oem`), key = file;
    if (!gfzCache.has(key)) { if (gfzCache.size > 32) gfzCache.delete(gfzCache.keys().next().value); if (!fs.existsSync(file)) gfzCache.set(key, null); else { opened.add(file, 'GFZ0MGXRAP'); gfzCache.set(key, new Map(SRC.readReference(file).lines.map((l) => [Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`), l]))); } }
    const m = gfzCache.get(key), l = m?.get(t - 18e3);
    return l ? { state: [...l.r, ...l.v].map((x) => x * 1000), covariance: IDENTITY } : null;
  };
  const fitInput = (lines) => ({ points: lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference: { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) } });
  const tasks = [];
  for (let r = a; r < b; r += 1) for (const norad of pop) tasks.push({ round: r, norad, E: orderOf(norad)[r] });
  for (let i = 0; i < tasks.length; i += 1) {
    const { round, norad, E } = tasks[i];
    if (i % n !== k || !E || done.has(`${norad}|${iso(E)}`)) continue;
    const t0 = Date.now(), rec = { round, norad, cls: classOf(norad), E: iso(E) };
    const win = windowOf(norad, S.arcsFor(norad), E, { leadToleranceSeconds: 150, leads_h: R.leads_h });
    if (win.excluded) rec.excluded = win.excluded;
    else {
      rec.tIn = win.tIn;
      try {
        const ctx = S.chain.ctxFor(win.tInMs - 24 * HOUR, win.tInMs + 72 * HOUR), settings = settingsFor('R3', S.seedOf(norad), false, S.B2C), fi = fitInput(win.track);
        const f = await S.fitV3(ctx, fi.points, fi.reference, settings);
        if (!f.ok) rec.excluded = `fit ${f.termination ?? f.error}`;
        else {
          const leads = win.leads.filter((l) => l.line).map((l) => ({ ...l, ref: gfzAt(norad, l.line.epoch) }));
          const t = await windowTermsRef(ctx, S.pairs, f, win.tInMs, leads, settings);
          rec.leads = t.leads.filter((l) => l.errRtnM && l.ref?.errRtnM).map((l) => ({ L: l.L, a: l.errRtnM, b: l.ref.errRtnM, p: AXES.map((q) => pC2(FZ, l.terms)[q]) }));
          rec.missingGfz = leads.filter((l) => !l.ref).length;
        }
      } catch (error) { rec.excluded = `refused: ${String(error.message).slice(0, 160)}`; }
    }
    rec.seconds = (Date.now() - t0) / 1000;
    fs.appendFileSync(out, `${JSON.stringify(rec)}\n`);
  }
  fs.writeFileSync(path.join(store, 'opened', `P1b.${a}-${b}.${k}.json`), JSON.stringify(opened.list()));
  process.exit(0);
}

if (args.evaluate) {
  const rows = fs.readdirSync(dirOut).filter((f) => f.startsWith('rows.')).sort().flatMap((f) => readJsonl(opened.add(path.join(dirOut, f), 'P1b rows')));
  const sinex = parseSinex(fs.readFileSync('/opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx', 'utf8'));
  const N = loadNotices(path.join(store, 'notices'), sinex, config.exclusions.notices.sealFrom);
  const storms = stormDays('/opt/data/sdn-archive/hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt', '2026-05-31', opened);
  const seal = Date.parse(`${config.exclusions.notices.sealFrom}T00:00:00Z`);
  const seedOf = (label) => parseInt(sha256(Buffer.from(label)).slice(0, 8), 16);
  const rngOf = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x9e3779b9) >>> 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0; return ((z ^ (z >>> 16)) >>> 0) / 4294967296; }; };
  const ok = rows.filter((r) => r.leads?.length);
  const samples = {};
  for (const r of ok) {
    const tIn = Date.parse(r.tIn);
    if (N.overlap(r.norad, tIn - 24 * HOUR, tIn + 84 * HOUR, seal).length) continue;
    for (const l of r.leads) {
      if (isStorm(storms, tIn, l.L)) continue;
      for (let k = 0; k < 3; k += 1) { const key = `${r.cls}|${'RTN'[k]}|${l.L}`; ((samples[key] ??= new Map()).get(r.norad) ?? samples[key].set(r.norad, []).get(r.norad)).push({ A: l.a[k] ** 2 / l.p[k], B: l.b[k] ** 2 / l.p[k], C: (l.b[k] - l.a[k]) ** 2 / l.p[k] }); }
    }
  }
  const pct = (v, q) => v[Math.min(v.length - 1, Math.floor(v.length * q))];
  const table = [];
  const resamples = R.bootstrap.resamples;
  for (const [key, bySat] of Object.entries(samples)) {
    const [cls, axis, L] = key.split('|'), sats = [...bySat.keys()], all = [...bySat.values()].flat();
    const m = (f, list = all) => list.reduce((p, x) => p + x[f], 0) / list.length;
    const A = m('A'), B = m('B'), C = m('C');
    const rand = rngOf(seedOf(`C3S|p1b|${cls}|${axis}|${L}`));
    const lows = new Float64Array(resamples), highs = new Float64Array(resamples);
    for (let b = 0; b < resamples; b += 1) {
      let sa = 0, sb = 0, sc = 0, n = 0;
      for (let i = 0; i < sats.length; i += 1) { const list = bySat.get(sats[Math.floor(rand() * sats.length)]); for (let j = 0; j < list.length; j += 1) { const x = list[Math.floor(rand() * list.length)]; sa += x.A; sb += x.B; sc += x.C; n += 1; } }
      lows[b] = sa / sb; highs[b] = sa / (sb - sc);
    }
    const lo = [...lows].sort((x, y) => x - y), hi = [...highs].filter(Number.isFinite).sort((x, y) => x - y);
    table.push({ cls, axis, L: Number(L), n: all.length, satellites: sats.length, A, B, C, rLow: A / B, rLow95: [pct(lo, 0.025), pct(lo, 0.975)], halfWidth: (pct(lo, 0.975) - pct(lo, 0.025)) / 2, rHigh: A / (B - C), rHigh95: [pct(hi, 0.025), pct(hi, 0.975)], judged: R.judgedLeads_h.includes(Number(L)) });
  }
  table.sort((a, b) => (a.cls < b.cls ? -1 : a.cls > b.cls ? 1 : a.L - b.L || (a.axis < b.axis ? -1 : 1)));
  const judged = table.filter((x) => x.judged);
  const keep = judged.every((x) => x.rLow95[0] >= R.limit), stop = judged.filter((x) => x.rHigh95[1] < R.limit);
  const cpuHours = rows.reduce((p, r) => p + (r.seconds ?? 0), 0) / 3600;
  const widest = Math.max(...judged.map((x) => x.halfWidth));
  const outcome = keep ? 'keep the GNSS 1, 6 and 12 h cells with the label' : stop.length ? 'stop and ask: r_high wholly below 0.90' : 'between: stop and ask, with the table';
  const out = { plan: 'C3-A2 point 1', rule: R, windows: rows.length, withLeads: ok.length, excluded: rows.filter((r) => r.excluded).length, cpuHours, widestHalfWidth: widest, sampling: widest <= R.stopSampling.halfWidth ? 'half-width reached' : cpuHours >= R.stopSampling.cpuHours ? 'the CPU cap stopped it' : rows.length >= pop.length * cutoffs.length ? 'the calibration windows ran out' : 'continuing', table, outcome, gfzDisclosure: 'GFZ shares the station network with ESA, so an error common to the network cannot show up in this check' };
  // before the end only the half-width and the CPU spent are shown: the stop reads nothing else (C3-A3)
  if (!args.final) { console.log(JSON.stringify({ windows: out.windows, withLeads: out.withLeads, cpuHours, widest, sampling: out.sampling })); process.exit(0); }
  console.log(writeReceipt('precheck-P1b', out, opened));
  console.log(JSON.stringify({ windows: out.windows, withLeads: out.withLeads, cpuHours, widest, sampling: out.sampling, outcome }));
  for (const x of table) console.log(x.cls.padEnd(8), x.axis, String(x.L).padStart(2), 'n', String(x.n).padStart(4), 'A', x.A.toFixed(3), 'B', x.B.toFixed(3), 'C', x.C.toFixed(3), 'rLow', x.rLow.toFixed(3), `[${x.rLow95[0].toFixed(3)}, ${x.rLow95[1].toFixed(3)}]`, 'hw', x.halfWidth.toFixed(3), 'rHigh', x.rHigh.toFixed(3), `[${x.rHigh95[0].toFixed(3)}, ${x.rHigh95[1].toFixed(3)}]`);
  process.exit(0);
}
