// The results the truth gate's drops (experiments/truth-gate/flags.json) reach, into experiments/truth-gate/affected.json. For every
// experiment whose truth holds a dropped state's product, the drops inside its windows, and the evidence that its published numbers do or do
// not carry them:
//   - E2b and E14 screen their truth themselves (an epoch whose radius departs from its neighbors' by more than 10 km is not scored): their
//     own screens are run on the files as written, and a drop they exclude does not reach their results;
//   - E16 and E7 have no screen: a dropped state misses the true orbit by `km` (at least 2,127 km), so a published cell of n samples whose
//     RMS (E16) or maximum (E7) error bounds every single error below the smallest miss used none of them;
//   - V1c5 and V1c4: experiments/etalon2-anomaly re-scored V1c5 (unchanged) and labeled V1c4 (its durable run is not on this machine).
// Reading and counting only.
//   node experiments/truth-gate/affected.mjs [--out <file>]
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const DAY = 86400e3;
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const ledger = json('experiments/truth-gate/flags.json');
const drops = ledger.flags.filter((f) => f.action === 'drop');
// one entry per dropped state (the center rule and the jump rule find the same states under different sets)
const states = [...new Map(drops.map((f) => [`${f.product}|${f.norad}|${f.epoch}`, f])).values()].map((f) => ({
  product: f.product, norad: f.norad, epoch: f.epoch,
  rules: [...new Set(drops.filter((g) => g.product === f.product && g.norad === f.norad && g.epoch === f.epoch).map((g) => g.rule))],
  missKm: Math.max(...drops.filter((g) => g.product === f.product && g.norad === f.norad && g.epoch === f.epoch && g.km).map((g) => g.km)),
}));
const minMissKm = Math.min(...states.map((s) => s.missKm));
const inWindow = (t, [from, to], padDays = 0) => t >= Date.parse(`${from.slice(0, 10)}T00:00:00Z`) && t < Date.parse(`${to.slice(0, 10)}T00:00:00Z`) + (1 + padDays) * DAY;
const hits = (windows, products, norads, padDays = 0) => Object.entries(windows).flatMap(([name, w]) => states
  .filter((s) => norads.includes(s.norad) && products.some((p) => s.product.startsWith(p)) && inWindow(Date.parse(s.epoch), w, padDays))
  .map((s) => ({ window: name, product: s.product, norad: s.norad, epoch: s.epoch })));
const rows = [];

// E2b: SLR-MEO from ilrsa.orb. products; its screen (truthDefects) on the files as written; horizons reach 7 d past a window
{
  const e = json('experiments/e2b-correlated-covariance/config.json');
  const r = e.regimes['SLR-MEO'];
  const C = await import(path.join(root, 'experiments/e2b-correlated-covariance/common.mjs'));
  const reference = C.regimeReference(e.inputs.reference, 'SLR-MEO');
  const found = hits(e.windows, r.products, r.objects, 7)
    .map((h) => { const t = Date.parse(h.epoch); const d = C.truthDefects(reference, h.norad, t - DAY, t + DAY); return { ...h, excludedByOwnScreen: [...d].some((x) => Math.abs(Date.parse(/Z$/.test(x) ? x : `${x}Z`) - t) < 1000) }; });
  rows.push({ experiment: 'E2b (e2b-correlated-covariance)', truth: `SLR-MEO from ${r.products.join(', ')}`, check: `own truth screen: radius departure over ${e.measurement.truthScreenKm} km`, drops: found,
    verdict: found.every((h) => h.excludedByOwnScreen) ? 'unaffected: its own screen excluded every dropped state in its windows' : 'affected: a dropped state passed its screen' });
}

// E14: every product under its reference roots; its screen (Truth.defects) on the files as written; horizons reach 3 d past a window
{
  const e = json('experiments/e14-covariance-realism/config.json');
  const C = await import(path.join(root, 'experiments/e14-covariance-realism/common.mjs'));
  const truth = new C.Truth();
  const objects = [...new Set(Object.values(e.truth.objects).flat())];
  const found = hits({ ...e.windows, ...Object.fromEntries(Object.entries(e.s1Windows).map(([k, w]) => [`s1-${k}`, w])) }, ['ilrsa.orb.'], objects, 3)
    .map((h) => { const t = Date.parse(h.epoch); const d = truth.defects(h.norad, t - DAY, t + DAY); return { ...h, excludedByOwnScreen: [...d].some((x) => Math.abs(Date.parse(/Z$/.test(x) ? x : `${x}Z`) - t) < 1000) }; });
  rows.push({ experiment: 'E14 (e14-covariance-realism)', truth: 'every product under its reference roots (ETALON-1 and ETALON-2 among its MEO objects)', check: `own truth screen: radius departure over ${e.truth.radiusScreenKm} km`, drops: found,
    verdict: found.every((h) => h.excludedByOwnScreen) ? 'unaffected: its own screen excluded every dropped state in its windows' : 'affected: a dropped state passed its screen' });
}

// E16: no screen; every published test cell bounded: a single error is at most RMS x sqrt(n)
{
  const e = json('experiments/e16-cross-regime-epoch/config.json');
  const r = e.regimes['SLR-MEO'];
  const found = hits({ test: e.windows.test }, r.prefixes, Object.keys(r.objects).map(Number), 3);
  const m = json('results/e16/test/metrics.json');
  let worst = { cell: null, boundKm: 0 };
  const walk = (x, p) => {
    if (Array.isArray(x)) return x.forEach((v, i) => walk(v, `${p}[${i}]`));
    if (!x || typeof x !== 'object') return;
    const rms = Object.entries(x).filter(([k, v]) => k.startsWith('rms') && typeof v === 'number').map(([, v]) => v);
    if (typeof x.n === 'number' && rms.length) { const b = Math.max(...rms) * Math.sqrt(x.n); if (b > worst.boundKm) worst = { cell: p.slice(1), boundKm: Number(b.toFixed(1)) }; }
    for (const [k, v] of Object.entries(x)) walk(v, `${p}.${k}`);
  };
  walk(m, '');
  rows.push({ experiment: 'E16 (e16-cross-regime-epoch)', truth: `SLR-MEO from ${r.prefixes.join(', ')}`, check: 'no screen; the largest single error any published test cell allows (RMS x sqrt(n)) against the smallest miss', drops: found,
    largestAllowedErrorKm: worst.boundKm, cell: worst.cell, smallestMissKm: minMissKm,
    verdict: worst.boundKm < minMissKm ? 'unaffected: no published cell can hold an error the size of a dropped state' : 'affected' });
}

// E7: no screen; the published maximum error of every variant and horizon in the regime
{
  const e = json('experiments/e7-full-force-handoff/config.json');
  const r = e.regimes['SLR-MEO'];
  const found = Object.keys(e.windows).filter((w) => fs.existsSync(path.join(root, 'results/e7', w, 'metrics.json')))
    .flatMap((w) => hits({ [w]: e.windows[w] }, r.truthPrefixes, Object.keys(r.objects).map(Number), 7));
  const maxima = {};
  for (const w of new Set(found.map((h) => h.window))) {
    const v = json(`results/e7/${w}/metrics.json`).regimes['SLR-MEO'].variants;
    maxima[w] = Number((Math.max(...Object.values(v).flat().map((x) => x.max ?? 0)) / 1000).toFixed(3)); // metres -> km
  }
  rows.push({ experiment: 'E7 (e7-full-force-handoff)', truth: `SLR-MEO from ${r.truthPrefixes.join(', ')}`, check: 'no screen; the largest published error (every variant and horizon, H-truth included) against the smallest miss', drops: found,
    largestErrorKm: maxima, smallestMissKm: minMissKm,
    verdict: Object.values(maxima).every((x) => x < minMissKm) ? 'unaffected: no published error is the size of a dropped state' : 'affected' });
}

// E3 and V1: windows and arcs outside every dropped state
{
  const e3 = json('experiments/e3-combined-catalog/config.json');
  const found = hits(e3.windows, e3.truthPrefixes, [19751, 20026], 7);
  rows.push({ experiment: 'E3 (e3-combined-catalog)', truth: `truth prefixes ${e3.truthPrefixes.join(', ')}`, check: 'windows', drops: found, verdict: found.length ? 'affected' : 'unaffected: no dropped state in its windows' });
  const v1 = json('experiments/v1-ffm-physical-truth/config.json');
  const arcs = v1.slr.arcs, names = v1.slr.objects.map((o) => o.name);
  const used = states.filter((s) => arcs.some((a) => names.some((n) => s.product.startsWith(`ilrsa.orb.${n}.${a}`)))); // seeds.mjs: ilrsa.orb.<name>.<arc>
  rows.push({ experiment: 'V1 (v1-ffm-physical-truth)', truth: `ILRS weekly arcs ${arcs.join(', ')}`, check: 'arcs', drops: used, verdict: used.length ? 'affected' : 'unaffected: no dropped state in its arcs' });
}

// V1c5 and V1c4: experiments/etalon2-anomaly (landed b9142b4)
{
  const v = json('experiments/etalon2-anomaly/rescore-v1c5.json');
  rows.push({ experiment: 'V1c5', truth: 'ilrsa.orb.etalon2.261010.v80 (V1c5 refreshed truth)', check: 'experiments/etalon2-anomaly/rescore-v1c5.json: re-scored without the samples near the dropped states',
    drops: states.filter((s) => s.product === 'ilrsa.orb.etalon2.261010.v80').map((s) => ({ window: 'test', product: s.product, norad: s.norad, epoch: s.epoch })),
    rescore: { removedSamples: v.removedSamples, published: { selected: v.published.selected, realisticCells: v.published.claimed }, reselected: v.crossValidation.reselected, corrected: Object.fromEntries(Object.entries(v.corrected).map(([k, c]) => [k, { realisticCells: c.claimed }])) },
    verdict: 're-scored: unchanged (the selected model and 0 of 24 realistic cells); the Etalon-2 samples within 1 h of a dropped state are labeled wrong truth' });
  const v4 = json('experiments/v1c4-console-covariance-calibration/config.json').windows.test;
  rows.push({ experiment: 'V1c4', truth: `ilrsa.orb.etalon2.261010.v80 (test issues ${v4[0]} to ${v4[1]}, horizons to 72 h)`, check: 'the durable run is not on this machine',
    drops: hits({ test: v4 }, ['ilrsa.orb.etalon2.'], [20026], 3),
    verdict: 'labeled: its SLR MEO cells (results/v1c4 README, mean d²/3 of order 1e8 at 24 to 72 h) carry these wrong truth states' });
}

// G1, B1, B2, GP history: their Etalon weeks agree with the centers (experiments/etalon2-anomaly); the scan flags nothing in their copies
rows.push({ experiment: 'G1, B1 (SDN-AP baselines), B2 (mixed screening), SDN-AP GP history', truth: 'G1 laser-ranging copies (CDDIS) and NSGF orbits', check: 'flags.json: no drop in their sets',
  drops: [], verdict: 'unaffected' });

const out = { ledger: 'experiments/truth-gate/flags.json', states, smallestMissKm: minMissKm, experiments: rows };
const target = process.argv.includes('--out') ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : path.join(here, 'affected.json');
fs.writeFileSync(target, `${JSON.stringify(out, null, 1)}\n`);
for (const r of rows) console.error(`${r.experiment}: ${r.drops.length} drops in its windows; ${r.verdict}`);
process.exit(0);
