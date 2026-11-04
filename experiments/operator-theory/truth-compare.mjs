// AP5.md: XP, SGP4 and FFM on AP's precise-orbit windows, its truth, grid and as-issued weather, so rows join to AP's stored rows by window key. Module calls only.
//   node experiments/operator-theory/truth-compare.mjs --out <dir> --from 2025-04-01 --to 2025-12-21 --shard k/n [--xm]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, root, HOUR, DAY, iso, ms, rms, XM, windows } from './lib/xp2.mjs';
import { openSgp4Fit } from './lib/xp2.mjs';
import { driverRows } from './lib/xm3.mjs';
import { openAp, fitPcf, readOcm } from './lib/ap.mjs';
import { openFfmHost, apriori } from './lib/host.mjs';
import { openUssfXp } from './lib/ussf-xp.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const OUT = args.out, FROM = args.from, TO = args.to, ON_XM = args.xm === 'true';
// --arms U: the Space Force's SGP4-XP alone, in its own store. --arms XP (any of XP, S, F): only those, in their own store, as for a
// later AP build (AP7.md). Without it, this file's registered arms, unchanged.
const ARMS = (args.arms ?? 'XP,S,F').split(','), ONLY_U = ARMS.includes('U'), has = (a) => !ONLY_U && ARMS.includes(a);
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const m = await openModules(), A = has('XP') ? await openAp() : null, G = has('S') ? await openSgp4Fit() : null, F = has('F') ? await openFfmHost() : null, U = ONLY_U ? await openUssfXp() : null;
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
const ARCS = ON_XM ? [24, 72] : [24];
const PCF_XP = fitPcf({ forces: {}, fit: null });

// CHEAPER.md's settings, unchanged, with its seeds for every object.
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
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, `rows-${SHARD}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
const xmWindows = () => Object.entries(XM.config.groups).flatMap(([group, g]) => g.objects.flatMap((o) => XM.daysOf(XM.config.period.from, XM.config.period.to).map((t) => ({ group, o, cutoffMs: t, date: XM.dateOf(t), key: `${group}|${o.norad}|${XM.dateOf(t)}` }))));
const list = (ON_XM ? xmWindows() : Object.keys(config.spans).flatMap((s) => windows(s))).filter((w) => w.date >= FROM && w.date <= TO && inShard(w.key) && !done.has(w.key));

for (const w of list) {
  const { o, cutoffMs: D0, key } = w;
  const row = { key, group: w.group, norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
  try {
    const after = T.series(o, D0 + 1, D0 + 7 * DAY).lines;
    const first = after.length ? ms(after[0].epoch) : 0;
    const grid = after.filter((l) => (ms(l.epoch) - first) % GRID === 0);
    const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
    const entered = LEADS.filter((k) => bins[k].length >= MIN_BIN);
    if (!entered.length) throw new Error('no lead bin');
    const scored = entered.flatMap((k) => bins[k]);
    const epochs = scored.map((l) => l.epoch), epochsMs = epochs.map(ms), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
    const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
    if (O.excluded) throw new Error(O.excluded);
    const spw = driverRows(O.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
    const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
    const arc = (hours) => { const raw = T.series(o, D0 - hours * HOUR, D0).lines; const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
    const high = Math.hypot(...scored[0].r) >= 8400;
    for (const hours of ARCS) {
      const thin = arc(hours);
      const run = async (name, fn) => {
        if (!ONLY_U && !has(name)) return;
        const a = { ok: false };
        try {
          if (!thin) throw new Error('coverage');
          Object.assign(a, await fn());
          a.ok = true;
        } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
        row.arms[`${name}${hours}`] = a;
      };
      const oem = thin ? S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }) : null;
      if (ONLY_U) {
        await run('U', async () => {
          const f = await U.fit(oem);
          if (!f.ok) throw new Error(f.error);
          return { rms: readOcm(f.ocm).fitRmsKm, days: score(await m.rtn(await m.toAxes(await U.propagate(f.ocm, epochs, epochs.length), epochs, 'GCRF'), truth)) };
        });
        continue;
      }
      await run('XP', async () => {
        const f = await A.fit(oem, PCF_XP, undefined);
        if (!f.ok) throw new Error(f.error);
        const st = await A.propagate(f.ocm, epochs, epochs.length);
        return { rms: readOcm(f.ocm).fitRmsKm, days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
      });
      await run('S', async () => {
        const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: o.name, objectId: o.objectId ?? '' });
        const flown = await m.propagateSgp4(el, o.norad, epochsMs, GRID / 1000);
        const present = flown.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
        if (present.length !== flown.length) throw new Error(`SGP4 returned ${present.length} of ${flown.length} states`);
        return { days: score(await m.rtn(await m.toAxes(flown, epochs, 'GCRF'), truth)) };
      });
      await run('F', async () => {
        const settings = high ? ffmHigh() : ffmLow();
        const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
        if (!f.state) throw new Error(f.error ?? f.termination);
        const st = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, settings, spw);
        return { fitOk: !!f.ok, termination: f.termination, days: score(await m.rtn(st, truth)) };
      });
    }
  } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
}
console.error(`shard ${SHARD}/${SHARDS}: ${list.length} windows`);
await F?.close();
process.exit(0);
