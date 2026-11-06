// THEMIS-RIPPLE-FIX.md Amendment 1/3 cost: wall per fit and per propagation step (7 days at 300 s), median of 5, per build; timing only.
//   SDN_MODULES_ROOT=<root> node cost.mjs <out.json> <label=wasmPath[,omm]>...
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const EXP = '/Users/tj/software/private/coordinator-d9/orbit-accuracy-experiments-cov/experiments/operator-theory';
const { config, root, iso, ms } = await import(`${EXP}/lib/xp2.mjs`);
const { apForces, fitPcf } = await import(`${EXP}/lib/ap.mjs`);
const { openAxes } = await import(`${EXP}/lib/host.mjs`);
const { HX, TESS } = await import(`${EXP}/lib/regimes.mjs`);
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
const MOD = process.env.SDN_MODULES_ROOT;
const entry = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const STEP_S = 300, HOUR = 3600000, DAY = 86400000, REPS = 5;
const builds = process.argv.slice(3).map((a) => { const [label, rest] = a.split('='); const [file, api] = rest.split(','); return { label, file, api: api ?? 'ocm' }; });
const WINDOWS = [
  { key: 'THEMIS D 2013-02-12', x: HX.find((v) => v.name === 'THEMIS D'), D0: Date.parse('2013-02-12T00:00:00Z'), id: null },
  { key: 'THEMIS E 2013-02-16', x: HX.find((v) => v.name === 'THEMIS E'), D0: Date.parse('2013-02-16T00:00:00Z'), id: null },
  { key: 'TESS 2026-07-27', x: { ...TESS, id: 'TESS (-95)', files: fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f)) }, D0: Date.parse('2026-07-27T00:00:00Z') },
];
const median = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const axes = await openAxes();
const out = [];
for (const W of WINDOWS) {
  const x = W.x;
  const s = await spkObjectSeries(MOD, { files: x.files ?? [x.file], source: 'ap6-heo', id: x.id, name: x.name, norad: x.norad, fromUtc: x.from, toUtc: x.to, stride: 1 });
  const norm = s.lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  const lines = await axes.convert(norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % (STEP_S * 1000) === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() })), 'EME2000', 'GCRF');
  const raw = lines.filter((l) => ms(l.epoch) >= W.D0 - 72 * HOUR && ms(l.epoch) <= W.D0);
  const thin = T.thinned(raw).chosen;
  const oem = S.oemBytes({ frame: 'GCRF', object: { name: x.name, id: x.objectId, norad: x.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(W.D0) });
  // the flight grid: (cutoff, cutoff + 7 d] at 300 s, epochs only (no reference state is read)
  const epochs = []; for (let t = W.D0 + STEP_S * 1000; t <= W.D0 + 7 * DAY; t += STEP_S * 1000) epochs.push(new Date(t).toISOString());
  for (const b of builds) {
    const h = await createStandaloneHarness('browser', b.file, { surface: 'direct' });
    const call = async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode} ${r.errorMessage}`); return r.outputs; };
    const forces = apForces({ tesseral: 31, zonal: 20, atmosphere: false });
    const pcf = b.api === 'ocm' ? fitPcf({ forces, fit: null }) : S.pcfBytes({ forces, fit: null });
    const fitT = [], flyT = [];
    let set;
    for (let r = 0; r < REPS; r += 1) {
      const t0 = performance.now();
      set = new Uint8Array((await call('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }])).find((o) => o.portId === 'elements').payload);
      fitT.push(performance.now() - t0);
    }
    for (let r = 0; r < REPS; r += 1) {
      const t0 = performance.now();
      if (b.api === 'ocm') await call('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }]);
      else await call('propagate', [{ portId: 'omm', typeRef: S.TYPE('OMM'), payload: set }, { portId: 'grid', typeRef: S.TYPE('OEM'), payload: S.gridBytes(epochs) }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }]);
      flyT.push(performance.now() - t0);
    }
    const row = { window: W.key, build: b.label, fitMs: median(fitT), flightMs: median(flyT), steps: epochs.length, usPerStep: (1000 * median(flyT)) / epochs.length, fitAll: fitT, flyAll: flyT };
    out.push(row);
    console.error(JSON.stringify({ window: row.window, build: row.build, fitMs: row.fitMs.toFixed(1), usPerStep: row.usPerStep.toFixed(2) }));
  }
}
await axes.close();
fs.writeFileSync(process.argv[2], `${JSON.stringify(out, null, 1)}\n`);
process.exit(0);
