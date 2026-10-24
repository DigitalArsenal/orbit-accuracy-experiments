// Amendment A9f: the Moon-centred SDN-GP on the LRO and Danuri windows of A8 (fits of 24 h and 72 h every 48 h, held-out days 1 to 3), rows per build of the module.
// Per window: the pack's states of the fit span and the three days after it as a $OEM block (CENTER_NAME MOON, the pack's axes declared, UTC), the fit span as the useable interval,
// `fit_sdngp` (no environment, no prior); the set is propagated by `propagate` on a grid block (CENTER_NAME MOON, ICRF axes, explicit EPOCHs: every fifth pack epoch of the held-out
// days; the module wants the template to name EARTH and answers about the Moon) and scored by score-pack.mjs (gp-error-model pair_statistics in the pack's Moon-centred axes). Rows: rows/sdngp/<build>/lunar.s<k>.jsonl.
//   SDNGP_SNAPSHOT=<build> node experiments/sdn-gp-starlink-ffm-match/lunar-windows.mjs [--pack lro-lunar,danuri-lunar] [--shard k/n] [--limit N]
import { frozen, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { readPack } from './lib/packs.mjs';
import { RULES, windowsOf } from './regime-windows.mjs';
import { scorePack } from './score-pack.mjs';
import { sdngpSink, rowKey } from './lib/sdngp-rows.mjs';
import { oemBytes } from './lib/sds.mjs';
import { DAY, iso, ms, slice } from './lib/windows.mjs';

const H = 3600000;
const AXES = { 'lro-lunar': 'J2000', 'danuri-lunar': 'ICRF' }; // the declared axes of the pack (regime-windows.mjs frameLabel)
const THIN = 5; // held-out epochs: every fifth pack epoch (5 min at 60 s)

/** One lunar window through the module: { row } as the sink stores it. */
export async function lunarWindow(b, loaded, pack, startMs, fitHours) {
  const rule = RULES[pack], { meta, object } = loaded;
  const stop = startMs + fitHours * H;
  const lines = slice(object, startMs, stop + rule.leadDays.at(-1) * DAY);
  const frame = AXES[pack];
  const block = (extra) => ({ frame, frameName: frame, center: 'MOON', timeSystem: 'UTC', object: { name: meta.name, id: '', norad: 0 }, ...extra });
  const base = { source: pack, id: pack, norad: 0, startUtc: iso(startMs), fitSeconds: fitHours * 3600, fitHours, states: lines.length };
  const fit = await b.sdngp.fit(oemBytes({ originator: 'G1 truth pack', block: block({ lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStart: lines[0].epoch, useableStop: iso(stop) }), sizePrefixed: false }));
  if (!fit.ok) return { ...base, sdngp: { ok: false, error: fit.error } };
  const held = slice(object, stop + 1, stop + rule.leadDays.at(-1) * DAY).filter((_, i) => i % THIN === 0);
  const grid = oemBytes({ originator: 'G1', block: { ...block({ lines: held.map((l) => ({ epoch: l.epoch, r: [0, 0, 0], v: [0, 0, 0] })), start: held[0].epoch, stop: held.at(-1).epoch }), frame: 'ICRF', frameName: 'ICRF', center: 'EARTH' }, sizePrefixed: false }); // the template must name EARTH (invalid-grid otherwise); the Moon-centred set answers about the Moon
  const prop = await b.sdngp.propagateGrid(fit.omm, grid);
  if (!prop.ok) return { ...base, sdngp: { ok: false, error: `propagate: ${prop.error}`, fitRmsKm: fit.fitRmsKm } };
  const scored = await scorePack(b, { pack, startMs, fitHours, leadDays: rule.leadDays, predicted: prop.blocks[0], predictedCenter: prop.centre, loaded });
  const spanMatch = /span ([\d.]+) h/.exec(fit.comment ?? '');
  return { ...base, sdngp: {
    ok: true, fitRmsKm: fit.fitRmsKm, fitMaxKm: fit.fitMaxKm, heldOutRmsKm: fit.heldOutRmsKm, iterations: fit.iterations, fitStates: fit.statesFitted, spanHours: spanMatch ? Number(spanMatch[1]) : null,
    days: Object.fromEntries(Object.entries(scored.byDay).filter(([, d]) => d).map(([k, d]) => [k, { rmsKm: d.rmsKm, n: d.n, ric: d.ric }])),
    matched: scored.matched, unmatched: scored.unmatched, centerCheck: scored.centerCheck, recordBytes: fit.omm.length, elementBytes: fit.minimal.length,
    module: b.sdngp.provenance.wasmSha256.slice(0, 12), params: fit.params, comment: fit.comment,
  } };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  frozen();
  const b = await openBaselines(modulesRoot(), { sdngp: true });
  const sink = sdngpSink(b, 'lunar', args.shard);
  const limit = args.limit ? Number(args.limit) : Infinity;
  let n = 0;
  for (const pack of (args.pack ?? 'lro-lunar,danuri-lunar').split(',')) {
    const loaded = readPack(pack);
    for (const fitHours of RULES[pack].fitHours) {
      for (const { startMs } of windowsOf(loaded.object, RULES[pack], fitHours).starts) {
        if (!sink.mine() || sink.has(rowKey({ source: pack, id: pack, startUtc: iso(startMs), fitSeconds: fitHours * 3600 }))) continue;
        if (n >= limit) break;
        const row = await lunarWindow(b, loaded, pack, startMs, fitHours);
        sink.append(row);
        n += 1;
        if (n % 10 === 0) console.error(`lunar: ${n} windows`);
      }
    }
  }
  console.error(`lunar: ${n} new windows (build ${sink.build}, shard ${args.shard ?? '0/1'})`);
  await b.close();
  process.exit(0);
}
