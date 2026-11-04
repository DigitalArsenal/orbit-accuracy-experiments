// AP against precise orbits on xp2-fit-design's windows (--arms registered: AP.md, Part T; else exploratory, not registered), its truth, grid and as-issued weather, so rows join to its stored rows by window key. Module calls only.
//   node experiments/operator-theory/ap-truth.mjs --out <dir> --from 2025-01-01 --to 2025-03-31 --shard k/n
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, root, store, HOUR, DAY, iso, ms, rms, XM, windows } from './lib/xp2.mjs';
import { apForces, openAp, fitPcf, fitWeather, horizonOf, readOcm } from './lib/ap.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const OUT = args.out, FROM = args.from, TO = args.to;
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const m = await openModules(), A = await openAp();
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
const FIT = { dragPrior: XM.config.fit.dragPrior, srpPrior: XM.config.fit.srpPrior };
const TERMS = { tesseral: 31, zonal: 20 };
const held = (b, srp) => ({ dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, ...(srp ? { srpPrior: srp } : {}) });
// name, arc hours, fit: 'module' or XM's, terms, optional drag source
const REGISTERED = [
  { name: 'AP24', hours: 24, fit: null, terms: TERMS },
  { name: 'APRa12', hours: 17, drag: 'stored', terms: TERMS },
];
const REGISTERED_XM = [
  { name: 'AP72', hours: 72, fit: null, terms: TERMS },
  { name: 'AP24', hours: 24, fit: null, terms: TERMS },
];
// --xm, with XP2F_CONTROL=1: AP2.md, xp-atmosphere-merit's own windows, store and truth.
const ON_XM = args.xm === 'true';
const ARMS = ON_XM ? REGISTERED_XM : args.arms === 'registered' ? REGISTERED : [
  { name: 'T72x', hours: 72, fit: FIT, terms: {} },
  { name: 'AP72x', hours: 72, fit: FIT, terms: TERMS },
  { name: 'AP48x', hours: 48, fit: FIT, terms: TERMS },
  { name: 'AP24x', hours: 24, fit: FIT, terms: TERMS },
  { name: 'AP17x', hours: 17, fit: FIT, terms: TERMS },
  { name: 'AP72m', hours: 72, fit: null, terms: TERMS },
  { name: 'AP48m', hours: 48, fit: null, terms: TERMS },
  { name: 'AP24m', hours: 24, fit: null, terms: TERMS },
  { name: 'AP17m', hours: 17, fit: null, terms: TERMS },
  { name: 'APR72', hours: 17, drag: 'AP72x', terms: TERMS },
  { name: 'APRa12', hours: 17, drag: 'stored', terms: TERMS },
];
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
const storedB = new Map();
for (const f of fs.readdirSync(path.join(store, 'rows')).filter((n) => n.endsWith('.jsonl'))) for (const l of fs.readFileSync(path.join(store, 'rows', f), 'utf8').split('\n')) if (l) { const r = JSON.parse(l); if (r.arms?.RFa12?.bHeld) storedB.set(r.key, r.arms.RFa12.bHeld); }
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
    const epochs = scored.map((l) => l.epoch), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
    const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
    if (O.excluded) throw new Error(O.excluded);
    const ex = { spw: fitWeather(O.rows, horizonOf(D0)) };
    const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
    const arc = (hours) => { const raw = T.series(o, D0 - hours * HOUR, D0).lines; const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
    const bterm = {};
    for (const spec of ARMS) {
      const a = { ok: false };
      try {
        let fit = spec.fit;
        if (spec.drag) { const b = spec.drag === 'stored' ? storedB.get(key) : bterm[spec.drag]; if (!(b > 0)) throw new Error('no positive B'); fit = { ...held(b, FIT.srpPrior) }; a.bHeld = b; }
        const thin = arc(spec.hours);
        if (!thin) throw new Error('coverage');
        const forces = apForces(spec.terms), pcf = fitPcf({ forces, fit });
        const t1 = performance.now();
        const f = await A.fit(S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }), pcf, ex);
        a.fitMs = Math.round(performance.now() - t1);
        if (!f.ok) throw new Error(f.error);
        const info = readOcm(f.ocm);
        a.bterm = info.bterm; a.agom = info.agom; a.rms = info.fitRmsKm; bterm[spec.name] = info.bterm;
        const st = await A.propagate(f.ocm, epochs, epochs.length);
        a.days = score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth));
        a.ok = true;
      } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
      row.arms[spec.name] = a;
    }
  } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
}
console.error(`shard ${SHARD}/${SHARDS}: ${list.length} windows`);
process.exit(0);
