// FIT-SECOND-SOLUTION.md part 1, report only: every published AP window-arm (the keys and arms of the stored ap/b051 rows) fitted again,
// each as its script builds the fit (ap-truth.mjs, ap-truth.mjs --xm, all-regimes.mjs), on the scan build (0.6.2's source plus the
// report-only probe, sdnap_fit_probe); the probe's two starts recorded; the control fits the shipped 0.6.2 dist beside it. Fits only, no flight.
//   SDN_MODULES_ROOT=<modules> node scan.mjs --mode hx|wa|regimes|truth --probe <wasm> --control <wasm> --shard k/n
//   XP2F_CONTROL=1 SDN_MODULES_ROOT=<modules> node scan.mjs --mode truth2 ...
//   node scan.mjs --table      (scan.json and SCAN.md here)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const OT = path.resolve(HERE, '../../../experiments/operator-theory');
const STORED = '/opt/data/sdn-archive/operator-theory/ap/b051';
const STORE = process.env.FIT_SECOND_STORE ?? '/opt/data/sdn-archive/operator-theory/fit-second-solution/scan';
const STORES = { truth: 'truth', truth2: 'truth2', regimes: 'regimes', hx: 'regimes-hx', wa: 'regimes-wa' };
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f))) : []);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** The published window-arms of a mode: Map key -> [arm]. */
function published(mode) {
  const out = new Map();
  for (const r of rowsIn(path.join(STORED, STORES[mode]), /^rows.*\.jsonl$/)) for (const arm of Object.keys(r.arms ?? {})) if (/^AP/.test(arm)) out.set(r.key, [...(out.get(r.key) ?? []), arm]);
  return out;
}

if (args.table) {
  const rows = rowsIn(STORE, /^rows-.*\.jsonl$/);
  const want = Object.keys(STORES).reduce((n, m) => n + [...published(m).values()].reduce((s, a) => s + a.length, 0), 0);
  const best = (r) => [r.probe?.a1, r.probe?.a2?.same ? r.probe.a2 : null].filter((p) => p && p.status >= 0 && Number.isFinite(p.rms)).sort((a, b) => a.rms - b.rms)[0] ?? null;
  const out = rows.map((r) => {
    const b = r.ok ? best(r) : null;
    const ratio = b && r.bterm ? b.b / r.bterm : null;
    const lower = b ? b.rms < 0.98 * r.rms : false;
    return { mode: r.mode, key: r.key, arm: r.arm, ok: r.ok, error: r.error, rms: r.rms, bterm: r.bterm, probeRms: b?.rms ?? null, probeBterm: b?.b ?? null, from: b ? (b === r.probe.a1 ? 'A1' : 'A2') : null,
      second: lower && ratio != null && (ratio > 2 || ratio < 0.5), lowerSameB: lower && ratio != null && ratio <= 2 && ratio >= 0.5, control: r.control ?? null };
  });
  // the stored row's fit RMS (0.5.1) beside the scan's: how many window-arms the scan rebuilt to the same fit
  const pub = new Map();
  for (const m of Object.keys(STORES)) for (const r of rowsIn(path.join(STORED, STORES[m]), /^rows.*\.jsonl$/)) for (const [arm, a] of Object.entries(r.arms ?? {})) if (/^AP/.test(arm) && Number.isFinite(a.rms)) pub.set(`${m}#${r.key}#${arm}`, a.rms);
  for (const x of out) { const p = pub.get(`${x.mode}#${x.key}#${x.arm}`); x.publishedRms = p ?? null; x.samePublished = p != null && x.ok ? Math.abs(p - x.rms) <= 1e-9 : null; }
  const hits = out.filter((x) => x.second), lowerSame = out.filter((x) => x.lowerSameB);
  const ctl = out.filter((x) => x.control !== null);
  const summary = { registration: 'experiments/operator-theory/FIT-SECOND-SOLUTION.md', published: want, scanned: out.length, fitted: out.filter((x) => x.ok).length,
    secondSolutions: hits.length, lowerSameBand: lowerSame.length,
    samePublishedFit: { compared: out.filter((x) => x.samePublished !== null).length, equal: out.filter((x) => x.samePublished === true).length }, control: { compared: ctl.length, equal: ctl.filter((x) => x.control === true).length },
    byMode: Object.fromEntries(Object.keys(STORES).map((m) => [m, { published: [...published(m).values()].reduce((s, a) => s + a.length, 0), scanned: out.filter((x) => x.mode === m).length, fitted: out.filter((x) => x.mode === m && x.ok).length, second: hits.filter((x) => x.mode === m).length }])) };
  fs.writeFileSync(path.join(HERE, 'scan.json'), `${JSON.stringify({ ...summary, hits, lowerSameBand: lowerSame, failed: out.filter((x) => !x.ok).map((x) => ({ mode: x.mode, key: x.key, arm: x.arm, error: x.error })) }, null, 1)}\n`);
  const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
  const line = (x) => `| ${x.mode} | ${x.key} | ${x.arm} | ${f(x.rms * 1000)} | ${x.bterm?.toPrecision(4)} | ${f(x.probeRms * 1000)} | ${x.probeBterm?.toPrecision(4)} | ${x.from} |`;
  const head = '| Store | Window | Arm | Fit RMS (m) | BTERM | Probe fit RMS (m) | Probe BTERM | Start |\n| --- | --- | --- | --: | --: | --: | --: | --- |';
  const md = [`# Second-solution scan on 0.6.2 (FIT-SECOND-SOLUTION.md part 1, report only)`, '',
    `Window-arms published ${want}; scanned ${out.length}; fitted ${summary.fitted}. On a second solution (probe fit RMS below 0.98 times the policy's, BTERM outside 0.5 to 2 times): ${hits.length}. Lower RMS within the band: ${lowerSame.length}. Control, the scan build's $OCM against the shipped dist's: ${summary.control.equal} of ${summary.control.compared} byte-identical. The scan's fit RMS equal to the stored 0.5.1 row's (within 1e-9 km): ${summary.samePublishedFit.equal} of ${summary.samePublishedFit.compared}.`, '',
    '| Store | Published | Scanned | Fitted | Second solution |', '| --- | --: | --: | --: | --: |',
    ...Object.entries(summary.byMode).map(([m, v]) => `| ${m} | ${v.published} | ${v.scanned} | ${v.fitted} | ${v.second} |`), '',
    `Fits whose RMS differs from the stored row's: ${out.filter((x) => x.samePublished === false).map((x) => `${x.key} ${x.arm} (${f(x.publishedRms * 1000)} to ${f(x.rms * 1000)} m)`).join('; ') || 'none'}. ` +
    'TESS (HE): the stored 0.5.1 rows were fitted on the chord truth, the scan reads the ten-minute node truth of the TESS re-score (experiments 158285f); refitted on the 0.5.1 dist (d29acd2b5d92) with the scan\'s inputs, HE|TESS|2026-08-10 gives 174.8 m (AP72) and 1,082.9 m (AP336), the scan\'s values to the last digit: the input moved, not the build.', '',
    '## On a second solution', '', head, ...hits.map(line), '', '## Lower fit RMS, BTERM within the band (report only)', '', head, ...lowerSame.map(line), ''].join('\n');
  fs.writeFileSync(path.join(HERE, 'SCAN.md'), md);
  console.log(JSON.stringify(summary, null, 1));
  process.exit(0);
}

const MODE = args.mode;
if (!STORES[MODE]) throw new Error('--mode hx|wa|regimes|truth|truth2');
if ((MODE === 'truth2') !== (process.env.XP2F_CONTROL === '1')) throw new Error('truth2 runs with XP2F_CONTROL=1, the others without');
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const inShard = (key) => parseInt(sha(key).slice(0, 8), 16) % SHARDS === SHARD;
const WANT = new Map([...published(MODE)].filter(([k]) => inShard(k) && (!args.key || k === args.key)));
const { config, root, store, HOUR, DAY, iso, ms, XM, windows } = await import(`${OT}/lib/xp2.mjs`);
const { apForces, fitPcf, fitWeather, horizonOf, readOcm } = await import(`${OT}/lib/ap.mjs`);
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const MIN_COV = XM.config.fit.minimumCoverage, GRID = XM.config.scoring.gridSeconds * 1000;

const entry = createRequire(path.join(process.env.SDN_MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const P = await createStandaloneHarness('browser', args.probe, { surface: 'direct' }), C = await createStandaloneHarness('browser', args.control, { surface: 'direct' });
const px = P.instance.exports;
px.sdnap_fit_probe(1, 0);
const outPtr = px.sdnap_alloc(128);
async function fitOn(h, oem, pcf, extra) {
  const inputs = [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf },
    ...(extra?.spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: extra.spw }] : [])];
  const r = await h.invoke({ methodId: 'fit', inputs });
  if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}` };
  return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
}
fs.mkdirSync(STORE, { recursive: true });
const outFile = path.join(STORE, `rows-${MODE}-${SHARD}.jsonl`);
const done = new Set(rowsIn(STORE, new RegExp(`^rows-${MODE}-\\d+\\.jsonl$`)).map((r) => `${r.key}#${r.arm}`));
const controlled = (key) => MODE === 'hx' || MODE === 'wa' || /\|HE\|/.test(`|${key}`) || parseInt(sha(key).slice(0, 8), 16) % 10 === 0;
/** One window-arm: the probe build's fit (and the probe's figures), the control's beside it where registered. */
async function scan(key, arm, oem, pcf, extra) {
  if (done.has(`${key}#${arm}`)) return;
  const row = { mode: MODE, key, arm, ok: false };
  const t0 = Date.now();
  try {
    if (!oem) throw new Error('coverage');
    const f = await fitOn(P, oem, pcf, extra);
    if (!f.ok) throw new Error(f.error);
    px.sdnap_fit_probe(-1, outPtr);
    const q = Array.from(new Float64Array(P.memory.buffer, outPtr, 16));
    const info = readOcm(f.ocm);
    Object.assign(row, { ok: true, rms: info.fitRmsKm, bterm: info.bterm, agom: info.agom,
      probe: { policyRms: q[0], policyB: q[1], startB: q[2], fitDrag: q[3], dragSigma: q[4], states: q[5], spanMin: q[6],
        a1: { status: q[7], rms: q[8], b: q[9] }, a2: { same: q[10] === 1, status: q[11], rms: q[12], b: q[13], pinnedRms: q[14] } } });
    if (controlled(key)) {
      const c = await fitOn(C, oem, pcf, extra);
      row.control = c.ok && Buffer.compare(Buffer.from(c.ocm), Buffer.from(f.ocm)) === 0;
      if (c.ok) { const ci = readOcm(c.ocm); row.controlFit = { rms: ci.fitRmsKm, bterm: ci.bterm }; }
    }
  } catch (error) { row.error = String(error?.message ?? error).slice(0, 200); }
  row.seconds = (Date.now() - t0) / 1000;
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  console.error(`${MODE} ${key} ${arm}: ${row.ok ? `rms ${(row.rms * 1000).toFixed(1)} m B ${row.bterm} | A1 ${(row.probe.a1.rms * 1000).toFixed(1)} m B ${row.probe.a1.b} | A2 ${(row.probe.a2.rms * 1000).toFixed(1)} m B ${row.probe.a2.b}${row.control === undefined ? '' : ` control ${row.control}`}` : row.error} (${row.seconds.toFixed(1)} s)`);
}

if (MODE === 'truth' || MODE === 'truth2') {
  // ap-truth.mjs: --arms registered (truth) and --xm with XP2F_CONTROL=1 (truth2), as the b051 rows ran
  const TERMS = { tesseral: 31, zonal: 20 };
  const FIT = { dragPrior: XM.config.fit.dragPrior, srpPrior: XM.config.fit.srpPrior };
  const held = (b, srp) => ({ dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, ...(srp ? { srpPrior: srp } : {}) });
  const ARMS = MODE === 'truth2' ? [{ name: 'AP72', hours: 72, fit: null }, { name: 'AP24', hours: 24, fit: null }] : [{ name: 'AP24', hours: 24, fit: null }, { name: 'APRa12', hours: 17, drag: 'stored' }];
  const storedB = new Map();
  if (MODE === 'truth') for (const f of fs.readdirSync(path.join(store, 'rows')).filter((n) => n.endsWith('.jsonl'))) for (const r of jsonl(path.join(store, 'rows', f))) if (r.arms?.RFa12?.bHeld) storedB.set(r.key, r.arms.RFa12.bHeld);
  const xmWindows = () => Object.entries(XM.config.groups).flatMap(([group, g]) => g.objects.flatMap((o) => XM.daysOf(XM.config.period.from, XM.config.period.to).map((t) => ({ group, o, cutoffMs: t, date: XM.dateOf(t), key: `${group}|${o.norad}|${XM.dateOf(t)}` }))));
  const list = (MODE === 'truth2' ? xmWindows() : Object.keys(config.spans).flatMap((s) => windows(s))).filter((w) => WANT.has(w.key));
  console.error(`${MODE} shard ${SHARD}/${SHARDS}: ${list.length} of ${WANT.size} published windows found`);
  for (const w of list) {
    const { o, cutoffMs: D0, key } = w;
    const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
    const ex = O.excluded ? null : { spw: fitWeather(O.rows, horizonOf(D0)) };
    const arc = (hours) => { const raw = T.series(o, D0 - hours * HOUR, D0).lines; const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
    for (const spec of ARMS) {
      if (!WANT.get(key).includes(spec.name)) continue;
      let fit = spec.fit;
      if (spec.drag) { const b = storedB.get(key); fit = b > 0 ? held(b, FIT.srpPrior) : undefined; }
      const thin = ex && fit !== undefined ? arc(spec.hours) : null;
      const oem = thin ? S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }) : null;
      await scan(key, spec.name, oem, fitPcf({ forces: apForces(TERMS), fit }), ex);
    }
  }
} else {
  // all-regimes.mjs's objects, arcs, $PCF and weather, as the b051 rows ran (regimes LS,DO,GD,IG,GE,HE; hx HX; wa WA)
  XM.config.spaceWeather.rsgaDirs = [...XM.config.spaceWeather.rsgaDirs, '/opt/data/sdn-archive/hac/noaa-swpc/warehouse/2026/RSGA', '/opt/data/sdn-archive/hac/noaa-swpc/2026'];
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const { openAxes } = await import(`${OT}/lib/host.mjs`);
  const { HX, STATIC, DO9, MGEX_CUTOFFS, TESS, WA_CUTOFFS, windowKey } = await import(`${OT}/lib/regimes.mjs`);
  const GROUPS = MODE === 'hx' ? ['HX'] : MODE === 'wa' ? ['WA'] : ['LS', 'DO', 'GD', 'IG', 'GE', 'HE', 'DO9'];
  const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null });
  const PCF_AP_VACUUM = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: null });
  const wanted = (group, name, cutoffs) => cutoffs.some((t) => WANT.has(windowKey(group, name, t)));
  async function spkOnGrid(lines, axes) {
    const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
    const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
    const thin = norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
    return axes.convert(thin, 'EME2000', 'GCRF');
  }
  async function* objects() {
    for (const o of [...STATIC.filter((x) => GROUPS.includes(x.group)), ...(GROUPS.includes('DO9') ? DO9 : [])]) {
      const files = o.files();
      if (!files.length) continue;
      const series = SRC.chain(files);
      yield { group: o.group, name: series.name || o.name, norad: series.norad, objectId: series.objectId ?? '', lines: series.lines, arcs: o.arcs, cutoffs: o.cutoffs };
    }
    if (GROUPS.includes('WA')) {
      const { SBAS, series } = await import(`${OT}/lib/sbas.mjs`);
      for (const [prn, sat] of Object.entries(SBAS)) {
        if (!wanted('WA', sat.name, WA_CUTOFFS)) continue;
        yield { group: 'WA', name: sat.name, norad: sat.norad, objectId: '', lines: await series(Number(prn), WA_CUTOFFS[0] - 3 * DAY, WA_CUTOFFS.at(-1) + 7 * DAY + DAY), arcs: [24, 72], cutoffs: WA_CUTOFFS, vacuum: true };
      }
    }
    for (const [group, klass] of [['IG', 'igso'], ['GE', 'geo']]) {
      if (!GROUPS.includes(group)) continue;
      for (const o of SRC.mgex({ klass })) if (wanted(group, o.name, MGEX_CUTOFFS)) yield { group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', lines: o.lines, arcs: [72], cutoffs: MGEX_CUTOFFS };
    }
    if (GROUPS.includes('HE') && wanted('HE', TESS.name, TESS.cutoffs)) {
      const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
      const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
      const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
      const axes = await openAxes();
      yield { group: 'HE', name: TESS.name, norad: TESS.norad, objectId: TESS.objectId, lines: await spkOnGrid(s.lines, axes), arcs: TESS.arcs, cutoffs: TESS.cutoffs, vacuum: true };
      await axes.close();
    }
    if (GROUPS.includes('HX')) {
      const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
      const axes = await openAxes();
      for (const h of HX) {
        if (!wanted('HX', h.name, h.cutoffs)) continue;
        const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
        yield { group: 'HX', name: h.name, norad: h.norad, objectId: h.objectId, lines: await spkOnGrid(s.lines, axes), arcs: h.arcs, cutoffs: h.cutoffs, vacuum: true };
      }
      await axes.close();
    }
  }
  let found = 0;
  for await (const o of objects()) {
    const times = o.lines.map((l) => ms(l.epoch));
    const between = (a, b) => { const out = []; for (let i = 0; i < times.length; i += 1) if (times[i] >= a && times[i] <= b) out.push(o.lines[i]); return out; };
    for (const D0 of o.cutoffs) {
      const key = windowKey(o.group, o.name, D0);
      if (!WANT.has(key)) continue;
      found += 1;
      let ex = null;
      if (!o.vacuum) { const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0); ex = R.excluded ? undefined : { spw: fitWeather(R.rows, horizonOf(D0)) }; }
      const arc = (hours) => { const raw = between(D0 - hours * HOUR, D0); const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
      for (const hours of o.arcs) {
        const arm = `AP${hours}`;
        if (!WANT.get(key).includes(arm)) continue;
        const thin = ex === undefined ? null : arc(hours);
        const oem = thin ? S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }) : null;
        await scan(key, arm, oem, o.vacuum ? PCF_AP_VACUUM : PCF_AP, ex ?? undefined);
      }
    }
  }
  console.error(`${MODE} shard ${SHARD}/${SHARDS}: ${found} of ${WANT.size} published windows found`);
}
console.error(`${MODE} shard ${SHARD}/${SHARDS}: done`);
process.exit(0);
