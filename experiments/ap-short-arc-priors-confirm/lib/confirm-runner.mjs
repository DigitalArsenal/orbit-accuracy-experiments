// Registered confirmation of sdn-ap 0.4.7's short-arc prior (experiments ap-short-arc-priors-confirm): the config.json windows x arms -> rows. Forked from ap-heo-frame-confirm/lib/confirm-runner.mjs
// (48791db), whose sources are hashed into that task's manifests and so stay as they were; this copy adds the sources and filters named below and nothing else.
// Truth, grid, coverage rule, bins, scoring and the arms' calls are AP5/AP6's (truth-compare.mjs, all-regimes.mjs), unchanged; module calls only. The groups, windows, arms, pins and holds are
// the task's config.json, frozen by its registration commit; this runner refuses a scored run whose sources differ from HEAD, any pin that differs, and any window a hold bars.
//   node experiments/<task>/run.mjs --out <dir> --shard k/n [--groups A,B] [--smoke true]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { config as xp2, root, HOUR, DAY, iso, ms, rms, XM } from '../../xp2-fit-design/common.mjs';
import { driverRows } from '../../ffm-atmosphere-xm3/lib/ffm.mjs';
import { apForces, openAp } from '../../operator-theory/lib/ap.mjs';
import { openUssfXp } from '../../operator-theory/lib/ussf-xp.mjs';
import { openFfmHost, openAxes, apriori } from '../../operator-theory/lib/host.mjs';
import { cutoffsOf, dayStr, windowKey } from '../../ap-heo-frame-confirm/lib/cutoffs.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
const ARCHIVE = '/opt/data/sdn-archive/reference-states';
const REF = path.join(ARCHIVE, 'reference'), POD = path.join(ARCHIVE, 'reference-leo-pod-2');
const yymmdd = (s) => Date.UTC(2000 + Number(s.slice(0, 2)), Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)));
const yyddd = (s) => Date.UTC(2000 + Number(s.slice(0, 2)), 0, 1) + (Number(s.slice(2)) - 1) * DAY;
const oemIn = (dir) => { const f = fs.readdirSync(dir).find((n) => n.endsWith('.oem')); return f ? path.join(dir, f) : null; };

/** The holds, enforced before any data is read: a held object or a held date never reaches a fit. */
function checkHolds(cfg, groups) {
  const barred = new Set(cfg.holds.norads), from = Date.parse(`${cfg.holds.noTruthFrom}T00:00:00Z`);
  for (const [id, g] of Object.entries(groups)) {
    for (const t of cutoffsOf(g.cutoffs)) {
      const last = t + 7 * DAY;
      if (!g.exemptFromTimeHold && last >= from) throw new Error(`${id}: cutoff ${dayStr(t)} scores truth on or after ${cfg.holds.noTruthFrom} (held)`);
    }
    for (const o of g.source.objects ?? []) if (o.norad && barred.has(o.norad)) throw new Error(`${id}: ${o.name} (${o.norad}) is held`);
  }
}

/** The objects of one group: { name, norad, objectId, range(fromMs, toMs) -> lines, step } with lines [{epoch, r, v}] km GCRF. Reading and selection only. */
async function objectsOf(id, g, ctx) {
  const { SRC, T, cfg } = ctx;
  const barred = new Set(cfg.holds.norads), s = g.source, windows = cutoffsOf(g.cutoffs);
  const span = [Math.min(...windows) - 15 * DAY, Math.max(...windows) + 15 * DAY];
  const chainObject = (name, files) => {
    if (!files.length) { console.error(`${id} ${name}: no product`); return null; }
    const series = SRC.chain(files);
    if (barred.has(series.norad)) throw new Error(`${id}: ${name} (${series.norad}) is held`);
    return fromLines(series.name || name, series.norad, series.objectId ?? '', series.lines);
  };
  const fromLines = (name, norad, objectId, lines) => {
    const times = lines.map((l) => ms(l.epoch));
    return { name, norad, objectId, step: times.length > 1 ? times[1] - times[0] : 300000, range: (a, b) => lines.filter((_, i) => times[i] >= a && times[i] <= b) };
  };
  const laserFiles = (prefix) => fs.readdirSync(REF).filter((d) => d.startsWith(prefix)).filter((d) => { const t = yymmdd(d.split('.')[3]); return t >= span[0] && t <= span[1]; }).sort().map((d) => oemIn(path.join(REF, d))).filter(Boolean);
  const dorisFiles = (codes) => fs.readdirSync(POD).filter((d) => codes.some((c) => d.startsWith(`ssa${c}.`))).filter((d) => { const m = /\.b(\d{5})\.e(\d{5})/.exec(d); return m && yyddd(m[1]) >= span[0] && yyddd(m[1]) <= span[1]; }).sort().map((d) => oemIn(path.join(POD, d))).filter(Boolean);
  if (s.kind === 'laser') return s.objects.map((o) => chainObject(o.name, laserFiles(`${o.product}.orb.${o.target}.`))).filter(Boolean);
  if (s.kind === 'doris') return s.objects.map((o) => chainObject(o.name, dorisFiles(o.codes))).filter(Boolean);
  if (s.kind === 'mgex') return SRC.mgex({ klass: s.klass }).filter((o) => !barred.has(o.norad)).map((o) => fromLines(o.name, o.norad, o.objectId ?? '', o.lines));
  if (s.kind === 'esa-final') {
    // Every satellite with a daily ESA final file in the span, minus the held; a window's truth is XM's series() (each epoch from the newest file starting at or before it).
    const days = fs.readdirSync(REF).filter((d) => /^ESA0OPSFIN_\d{11}_01D_05M_ORB$/.test(d)).filter((d) => { const t = Date.UTC(Number(d.slice(11, 15)), 0, 1) + (Number(d.slice(15, 18)) - 1) * DAY; return t >= span[0] && t <= span[1]; });
    const first = new Map();
    for (const d of days) for (const f of fs.readdirSync(path.join(REF, d))) if (/^\d+\.oem$/.test(f) && !first.has(Number(f.slice(0, -4)))) first.set(Number(f.slice(0, -4)), path.join(REF, d, f));
    return [...first].sort((a, b) => a[0] - b[0]).filter(([norad]) => !barred.has(norad) && (!s.norads || s.norads.includes(norad))).map(([norad, file]) => {
      const name = SRC.readReference(file).name;
      const o = { truth: 'gnss', norad, name };
      return { name, norad, objectId: '', step: 300000, constellation: name[0], range: (a, b) => T.series(o, a, b).lines };
    }).filter((o) => !s.constellations || s.constellations.includes(o.constellation));
  }
  if (s.kind === 'xm-truth') {
    // XM's truth reader for products it names (Sentinel-1 POEORB): each epoch from the newest file that starts at or before it.
    return s.objects.filter((x) => !barred.has(x.norad)).map((x) => {
      const o = { truth: s.truth, norad: x.norad, product: x.product, name: x.name };
      const name = SRC.readReference(T.productFiles(o)[0].file).name;
      return { name, norad: x.norad, objectId: '', step: (s.stepSeconds ?? 10) * 1000, range: (a, b) => T.series(o, a, b).lines };
    });
  }
  if (s.kind === 'spk') {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const axes = await openAxes(), out = [];
    try {
      for (const o of s.objects) {
        const files = o.dir ? fs.readdirSync(o.dir).filter((f) => new RegExp(o.pattern).test(f)).sort().map((f) => path.join(o.dir, f)) : [o.file];
        const series = await spkObjectSeries(cfg.modulesRoot, { files, source: 'ap-confirm-heo', id: o.id, name: o.name, norad: o.norad, fromUtc: o.from, toUtc: o.to, stride: 1 });
        const norm = series.lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
        const first = Math.round(ms(norm[0].epoch) / 1000) * 1000, grid = XM.config.scoring.gridSeconds * 1000;
        // A kernel sampled more often than the grid keeps the grid's lattice; one sampled less often keeps every state (its segments can start a second off each other, which a lattice would drop).
        const coarse = norm.length > 1 && ms(norm[1].epoch) - ms(norm[0].epoch) > grid;
        const thin = norm.filter((l) => coarse || (Math.round(ms(l.epoch) / 1000) * 1000 - first) % grid === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
        out.push(fromLines(o.name, o.norad, o.objectId ?? '', await axes.convert(thin, 'EME2000', 'GCRF')));
      }
    } finally { await axes.close(); }
    return out;
  }
  throw new Error(`${id}: unknown source kind ${s.kind}`);
}

export async function run(configUrl) {
  const cfg = JSON.parse(fs.readFileSync(configUrl, 'utf8'));
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number), SMOKE = args.smoke === 'true';
  const OUT = args.out;
  if (!cfg.frozen) throw new Error('the registration is not frozen');
  const inStore = path.resolve(OUT) === cfg.store || path.resolve(OUT).startsWith(`${cfg.store}/`);
  if (!SMOKE && !inStore) throw new Error(`${OUT} is outside the registered store ${cfg.store}`);
  if (SMOKE && inStore) throw new Error('a smoke run never writes into the registered store');
  const groups = Object.fromEntries(Object.entries(cfg.groups).filter(([id]) => !args.groups || args.groups.split(',').includes(id)));
  checkHolds(cfg, groups);

  // Sources committed unchanged before a scored run, pins checked, then the manifest.
  const sourceFiles = [...cfg.sources];
  const sources = {};
  for (const rel of sourceFiles) {
    const bytes = fs.readFileSync(path.join(root, rel));
    if (!SMOKE) { let committed; try { committed = execFileSync('git', ['-C', root, 'show', `HEAD:${rel}`]); } catch { throw new Error(`${rel} is not committed`); } if (!committed.equals(bytes)) throw new Error(`${rel} differs from HEAD; commit it before a scored run`); }
    sources[rel] = sha256(bytes);
  }
  for (const [name, b] of Object.entries(cfg.builds)) if (sha256(fs.readFileSync(b.file)) !== b.sha256) throw new Error(`${name}: ${b.file} is not the registered ${b.sha256}`);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `manifest-${SHARD}-${Date.now()}.json`), `${JSON.stringify({ task: cfg.task, started: new Date().toISOString(), smoke: SMOKE, config: sha256(fs.readFileSync(configUrl)), command: process.argv, commit: git('rev-parse', 'HEAD'), modulesCommit: execFileSync('git', ['-C', cfg.modulesRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version, host: os.hostname(), load: os.loadavg(), pins: Object.fromEntries(Object.entries(cfg.builds).map(([k, b]) => [k, b.sha256])), sources }, null, 1)}\n`);

  // XM's libraries (AP6's imports), the space weather of 2024-2026, the modules.
  XM.config.spaceWeather.rsgaDirs = cfg.weatherDirs;
  const S = await import(path.join(root, xp2.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, xp2.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, xp2.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const { openModules } = await import(path.join(root, xp2.xm.dir, 'lib/modules.mjs'));
  const m = await openModules();
  const armNames = [...new Set(Object.values(groups).flatMap((g) => g.arms))];
  const builds = new Set(armNames.map((a) => cfg.arms[a]).filter((a) => a.kind === 'ap').map((a) => a.build));
  const AP = Object.fromEntries(await Promise.all([...builds].map(async (b) => [b, await openAp(cfg.builds[b].file)])));
  const U = armNames.some((a) => cfg.arms[a].kind === 'ussf') ? await openUssfXp() : null;
  if (U && sha256(fs.readFileSync(cfg.builds.ussf.file)) !== cfg.builds.ussf.sha256) throw new Error('the Space Force XP module is not the registered build');
  const F = armNames.some((a) => cfg.arms[a].kind === 'ffm') ? await openFfmHost() : null;

  const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
  const ATM = XM.config.arms.X2.forces;
  const PCF = { ap: S.pcfBytes({ forces: apForces(ATM, { tesseral: 31, zonal: 20 }), fit: null }), apVacuum: S.pcfBytes({ forces: apForces(ATM, { tesseral: 31, zonal: 20, atmosphere: false }), fit: null }), xp: S.pcfBytes({ forces: {}, fit: null }) };
  // CHEAPER.md's FFM settings by altitude, as AP6.
  const ffmLow = () => ({
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
  });
  const ffmHigh = () => ({
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
  });

  const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
  const outFile = path.join(OUT, `rows-${SHARD}.jsonl`);
  const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
  const only = args.keys ? new Set(args.keys.split(',')) : null;
  let count = 0;

  for (const [id, g] of Object.entries(groups)) {
    const cutoffs = cutoffsOf(g.cutoffs);
    const keyOf = (o, t) => windowKey(id, ['esa-final', 'xm-truth'].includes(g.source.kind) ? o.norad : o.name, t);
    const wanted = (o) => cutoffs.some((t) => inShard(keyOf(o, t)) && !done.has(keyOf(o, t)) && (!only || only.has(keyOf(o, t))));
    if (g.source.kind === 'spk' && !g.source.objects.some(wanted)) continue;
    const objects = await objectsOf(id, g, { SRC, T, cfg });
    fs.appendFileSync(path.join(OUT, `plan-${SHARD}.jsonl`), objects.flatMap((o) => cutoffs.map((t) => keyOf(o, t))).filter(inShard).map((k) => `${JSON.stringify({ key: k })}\n`).join(''));
    for (const o of objects.filter(wanted)) {
      const gridMs = Math.max(GRID, Math.ceil(GRID / o.step) * o.step);
      // XM's minimum, 260 of the 288 states of a day at 300 s, is 90 % of a day's states; a product on a coarser grid is held to the same share.
      const minBin = Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
      for (const D0 of cutoffs) {
        const key = keyOf(o, D0);
        if (!inShard(key) || done.has(key) || (only && !only.has(key))) continue;
        const row = { key, group: id, norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
        try {
          const after = o.range(D0 + 1, D0 + 7 * DAY);
          const first = after.length ? ms(after[0].epoch) : 0;
          const grid = o.step > GRID ? after : after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
          const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
          const entered = LEADS.filter((k) => bins[k].length >= minBin);
          if (!entered.length) throw new Error('no lead bin');
          const scored = entered.flatMap((k) => bins[k]);
          const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
          let ex, spw;
          if (!g.vacuum) {
            const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
            if (R.excluded) throw new Error(R.excluded);
            ex = { rows: S.spwBytes(R.rows) };
            spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
          }
          const gridB = S.gridBytes(epochs);
          const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
          const arc = (hours) => { const raw = o.range(D0 - hours * HOUR, D0); const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
          const high = Math.hypot(...scored[0].r) >= 8400;
          for (const hours of g.arcs) {
            const thin = arc(hours);
            const oem = thin ? S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }) : null;
            for (const name of g.arms) {
              const arm = cfg.arms[name], a = { ok: false };
              try {
                if (!thin) throw new Error('coverage');
                if (arm.kind === 'ap') {
                  const pcf = arm.forces === 'xp' ? PCF.xp : g.vacuum ? PCF.apVacuum : PCF.ap, extra = arm.forces === 'xp' ? undefined : ex;
                  const f = await AP[arm.build].fit(oem, pcf, extra);
                  if (!f.ok) throw new Error(f.error);
                  const st = await AP[arm.build].propagate(f.omm, gridB, pcf, extra, epochs.length);
                  Object.assign(a, { rms: S.readFitOmm(f.omm).fitRmsKm, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) });
                } else if (arm.kind === 'ussf') {
                  const f = await U.fit(oem);
                  if (!f.ok) throw new Error(f.error);
                  Object.assign(a, { rms: S.readFitOmm(f.omm).fitRmsKm, days: score(await m.rtn(await m.toAxes(await U.propagate(f.omm, gridB, epochs.length), epochs, 'GCRF'), truth)) });
                } else if (arm.kind === 'ffm') {
                  const settings = high ? ffmHigh() : ffmLow();
                  const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
                  if (!f.state) throw new Error(f.error ?? f.termination);
                  const st = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, settings, spw);
                  Object.assign(a, { fitOk: !!f.ok, termination: f.termination, days: score(await m.rtn(st, truth)) });
                } else throw new Error(`unknown arm kind ${arm.kind}`);
                a.ok = true;
              } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
              row.arms[`${name}${hours}`] = a;
            }
          }
        } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
        fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
        count += 1;
      }
    }
  }
  console.error(`shard ${SHARD}/${SHARDS}: ${count} windows`);
  await F?.close();
  process.exit(0);
}
