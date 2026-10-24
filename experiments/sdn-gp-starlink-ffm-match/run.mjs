// E2E for G1: node experiments/sdn-gp-starlink-ffm-match/run.mjs --check [--replay N]   (N replays of SGP4 / SGP4-XP windows, default 9: one per precise-orbit source)
// 1. the plan and config are frozen and committed unchanged;
// 2. the committed manifest matches the module artifacts that would run (WASM SHA-256);
// 3. tables.json is re-derived from the recorded window rows (statistics only) and must equal the committed file;
// 3b. m123.json (DESIGN.md M1 to M3, amendments A7 to A7c) is re-derived from its recorded rows, and two of those windows (LAGEOS-1 and the ISS) are
//    replayed through FFM-1 under full and zonal-only gravity and the SGP4 and SGP4-XP fits, and must reproduce their recorded numbers;
// 3c. the windows prepared for SDN-GP (regime-windows.json) are re-derived from the local truth packs, and the pack scorer returns a known
//    offset (1 km added to a Danuri window's held-out states comes back as 1 km RMS on each day);
// 4. N windows (default 9 precise-orbit windows, one per source, plus a Starlink FFM truth and an in-span SpaceX window) are replayed through the modules and must reproduce their recorded
//    statistics, and the committed results hold no raw operator, Space-Track or COMSPOC records;
// 4b. SDN-GP (amendment A9b): windows of the headline build (ISS, GNSS, a current SLR arc and a Starlink FFM truth) are fitted again by the pinned copy of the
//    module (<store>/sdngp-snapshot/<build>) and must reproduce their recorded fit RMS and held-out days.
// Without the local records the check says so and exits 2: a skip is never a pass.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store, results, sha256 } from './common.mjs';
import { features, select } from './population.mjs';
import { KERNELS, A5, spkObject } from './lib/spk-sources.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { build } from './tables.mjs';
import { build as buildM123 } from './m123-report.mjs';
import { allWindows, processWindow } from './m123.mjs';
import { listPacks, readPack } from './lib/packs.mjs';
import { RULES, windowsOf } from './regime-windows.mjs';
import { scorePack } from './score-pack.mjs';
import { spkObjectSeries, A8 } from './lib/spk-sources.mjs';
import { loadEnvironment } from './lib/ffm.mjs';
import { openModule } from './lib/modules.mjs';
import { manifest } from './manifest.mjs';
import * as sources from './lib/sources.mjs';
import { parseMeme } from './lib/sources.mjs';
import { windowStarts, withT, ms } from './lib/windows.mjs';
import { builds as sdngpBuilds, buildRows, rowKey } from './lib/sdngp-rows.mjs';
import { spanObject } from './span-windows.mjs';

const args = process.argv.slice(2);
const replay = args.includes('--replay') ? Number(args[args.indexOf('--replay') + 1]) : 9;
const fail = (message) => { console.error(`FAIL: ${message}`); process.exit(1); };
const ok = (message) => console.log(`ok: ${message}`);

frozen();
ok('plan and config are frozen and committed unchanged');
if (!fs.existsSync(path.join(store, 'rows'))) { console.error(`SKIPPED: the local records (${store}/rows) are absent; this check does not pass without them`); process.exit(2); }

const committed = JSON.parse(fs.readFileSync(path.join(results, 'manifest.json'), 'utf8'));
const now = manifest();
for (const a of committed.modules.artifacts) {
  const same = now.modules.artifacts.find((x) => x.path === a.path);
  if (!same || same.wasmSha256 !== a.wasmSha256) fail(`module artifact ${a.path} differs from the manifest`);
}
ok(`module artifacts match the manifest (${committed.modules.artifacts.length})`);

// the registered population is re-derived from the capture's derived products and must hash to the committed queue
const cycleDir = path.join(config.archive, 'operator-capture/cycles', config.cycle);
if (fs.existsSync(cycleDir)) {
  const { queue } = select(features(cycleDir));
  const hash = sha256(JSON.stringify(queue.map((q) => [q.norad, q.stratum, q.tercile, q.rank])));
  if (hash !== JSON.parse(fs.readFileSync(path.join(results, 'population.json'), 'utf8')).queueSha256) fail('the population drawn from the capture differs from population.json');
  ok(`population of ${queue.filter((q) => q.seat).length} seats re-derived from the capture cycle`);
}

const tables = JSON.parse(fs.readFileSync(path.join(results, 'tables.json'), 'utf8'));
if (JSON.stringify(tables) !== JSON.stringify(JSON.parse(JSON.stringify(build())))) fail('tables.json is not reproduced by the recorded rows');
ok('tables.json reproduced from the recorded rows');

if (fs.existsSync(path.join(store, 'pack')) && fs.existsSync(path.join(results, 'regime-windows.json'))) {
  const rw = JSON.parse(fs.readFileSync(path.join(results, 'regime-windows.json'), 'utf8'));
  let windowsChecked = 0;
  for (const name of listPacks()) {
    const rule = RULES[name]; if (!rule) continue;
    const { meta, object } = readPack(name);
    const recorded = rw.packs.find((p) => p.name === name);
    if (!recorded || recorded.sha256 !== meta.sha256) fail(`truth pack ${name} differs from regime-windows.json`);
    for (const fit of rule.fitHours) {
      const again = windowsOf(object, rule, fit).starts.map((x) => new Date(x.startMs).toISOString());
      if (JSON.stringify(again) !== JSON.stringify(rw.windows[name].byFit[fit].startsUtc)) fail(`windows of ${name} (fit ${fit} h) differ from regime-windows.json`);
      windowsChecked += again.length;
    }
  }
  ok(`regime-windows.json reproduced from the local truth packs (${windowsChecked} windows)`);
}

const m123Dir = path.join(store, 'm123');
if (fs.existsSync(m123Dir)) {
  const recordedM123 = JSON.parse(fs.readFileSync(path.join(results, 'm123.json'), 'utf8'));
  if (JSON.stringify(recordedM123) !== JSON.stringify(JSON.parse(JSON.stringify(buildM123())))) fail('m123.json is not reproduced by the recorded rows');
  ok(`m123.json reproduced from ${recordedM123.windows} recorded windows`);
}

// no raw records in the committed results
const patterns = [/^1 \d{5}U .{8}\s+\d{5}\.\d+/m, /ephemeris_start:/, /ephemeris_source:/, /CCSDS_OEM_VERS/, /spacetrack|space-track\.org\/basicspacedata/i];
for (const name of fs.readdirSync(results)) {
  const text = fs.readFileSync(path.join(results, name), 'utf8');
  for (const p of patterns) if (p.test(text)) fail(`${name} contains raw-record text (${p})`);
}
ok('committed results hold aggregates only');

// replay a few recorded windows through the modules
const modules = modulesRoot();
const b = await openBaselines(modules);
const picks = [];
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []);
for (const source of ['gnss', 'iss', 'slr-low', 'slr-high', 'mgex-geo', 'gnss-rapid', 'mgex-igso-rapid', 'slr-low-current', 'slr-high-current']) { const rows = read(path.join(store, 'rows', `${source}.jsonl`)); if (rows.length) picks.push({ source, row: rows[Math.floor(rows.length / 2)] }); }
let replayed = 0;
const same = (a, c) => Math.abs(a - c) <= 1e-9 * Math.max(1, Math.abs(c));
const objectOf = (source, row) => (source === 'gnss' ? sources.gnss(config.precise.gnss).find((o) => o.id === row.id)
  : source === 'iss' ? sources.iss().find((o) => o.id === row.id)
  : source === 'mgex-geo' ? sources.mgex({ klass: 'geo', ...sources.MGEX_A4 }).find((o) => o.id === row.id)
  : source === 'gnss-rapid' ? sources.gnssRapid().find((o) => o.id === row.id)
  : source === 'mgex-igso-rapid' ? sources.mgexRapid({ klass: 'igso' }).find((o) => o.id === row.id)
  : source === 'slr-low' ? config.precise.slrLow.targets.flatMap((t) => sources.slrLow({ target: t, arcs: config.precise.slrLow.arcs })).find((o) => o.id === row.id)
  : source === 'slr-low-current' ? config.precise.slrLow.targets.flatMap((t) => sources.slrLowCurrent({ target: t })).find((o) => o.id === row.id)
  : source === 'slr-high-current' ? config.precise.slrHigh.targets.flatMap((t) => sources.slrHighCurrent({ target: t })).find((o) => o.id === row.id)
  : config.precise.slrHigh.targets.flatMap((t) => sources.slrHigh({ target: t, weeks: config.precise.slrHigh.weeks })).find((o) => o.id === row.id));
for (const { source, row } of picks.slice(0, replay)) {
  const object = objectOf(source, row);
  if (!object) fail(`replay: object ${row.id} not found`);
  const again = await scoreWindow(b, object, ms(row.startUtc), { fitSeconds: row.fitSeconds, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage });
  for (const arm of ['xp', 'sgp4']) {
    if (Boolean(again[arm].ok) !== Boolean(row[arm].ok)) fail(`replay ${row.id}: ${arm} ok differs`);
    if (row[arm].ok && !same(again[arm].fitRmsKm, row[arm].fitRmsKm)) fail(`replay ${row.id}: ${arm} fit RMS ${again[arm].fitRmsKm} vs ${row[arm].fitRmsKm}`);
    for (const k of Object.keys(row[arm].days ?? {})) if (!same(again[arm].days[k].rmsKm, row[arm].days[k].rmsKm)) fail(`replay ${row.id}: ${arm} day ${k} differs`);
  }
  replayed += 1;
}
// replay the truth of one Starlink from its stored derived trajectory
const truthDir = path.join(store, 'truth');
const metas = fs.existsSync(truthDir) ? fs.readdirSync(truthDir).filter((n) => /^\d+\.json$/.test(n)).sort() : [];
if (metas.length) {
  const meta = JSON.parse(fs.readFileSync(path.join(truthDir, metas[Math.floor(metas.length / 2)])));
  const flat = new Float64Array(fs.readFileSync(path.join(truthDir, `${meta.norad}.f64`)).buffer.slice(0));
  const t0 = ms(meta.truth.epochUtc);
  const object = withT({ source: 'starlink-ffm', id: `STARLINK (${meta.norad})`, norad: meta.norad, name: `STARLINK-${meta.norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
    lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: new Date(t0 + i * config.truth.cadenceSeconds * 1000).toISOString(), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
  const again = await scoreWindow(b, object, t0, { fitSeconds: config.windows.fitHours * 3600, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage });
  const rec = JSON.parse(fs.readFileSync(path.join(store, 'rows/starlink', `${meta.norad}.json`))).ffm;
  for (const arm of ['xp', 'sgp4']) if (rec[arm].ok && !same(again[arm].fitRmsKm, rec[arm].fitRmsKm)) fail(`replay STARLINK ${meta.norad}: ${arm} fit RMS differs`);
  replayed += 1;
}
// replay one HEO window from the NAIF kernel (states by files/orbit-products, epochs by foundation/time)
const heoRows = read(path.join(store, 'rows', 'heo-themis.jsonl'));
if (heoRows.length) {
  const row = heoRows[Math.floor(heoRows.length / 2)];
  const letter = /THEMIS-(\w)/.exec(row.id)[1];
  const object = await spkObject(modules, { file: path.join(KERNELS(config.archive), `themis/THEMIS_${letter}_2013_039_055.bsp`), source: 'heo-themis', id: row.id, name: `THEMIS-${letter}`, norad: row.norad, fromUtc: A5.themis.span[0], toUtc: A5.themis.span[1] });
  const again = await scoreWindow(b, object, ms(row.startUtc), { fitSeconds: row.fitSeconds, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage });
  for (const arm of ['xp', 'sgp4']) {
    if (Boolean(again[arm].ok) !== Boolean(row[arm].ok)) fail(`replay ${row.id}: ${arm} ok differs`);
    if (row[arm].ok && !same(again[arm].fitRmsKm, row[arm].fitRmsKm)) fail(`replay ${row.id}: ${arm} fit RMS differs`);
  }
  replayed += 1;
}
// replay one TESS window from the MAST definitive ephemeris files
const tessRows = read(path.join(store, 'rows', 'heo-tess.jsonl'));
if (tessRows.length) {
  const row = tessRows.filter((r) => r.fitSeconds === 86400)[Math.floor(tessRows.filter((r) => r.fitSeconds === 86400).length / 2)];
  const dir = path.join(config.archive, 'hac/mast-tess/models');
  const names = fs.readdirSync(dir).filter((f) => /^TESS_EPH_DEF_\d{7}_\d+\.bsp$/.test(f)).sort();
  const object = await spkObjectSeries(modules, { files: names.map((f) => path.join(dir, f)), source: 'heo-tess', id: 'TESS (-95)', name: 'TESS', norad: A8.tess.norad, fromUtc: A8.tess.span[0], toUtc: A8.tess.span[1], stride: A8.tess.stride });
  const again = await scoreWindow(b, object, ms(row.startUtc), { fitSeconds: row.fitSeconds, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage });
  for (const arm of ['xp', 'sgp4']) {
    if (Boolean(again[arm].ok) !== Boolean(row[arm].ok)) fail(`replay ${row.id}: ${arm} ok differs`);
    if (row[arm].ok && !same(again[arm].fitRmsKm, row[arm].fitRmsKm)) fail(`replay ${row.id}: ${arm} fit RMS differs`);
  }
  replayed += 1;
}
// the pack scorer returns a known offset
if (fs.existsSync(path.join(store, 'pack/danuri-lunar.json'))) {
  const { object } = readPack('danuri-lunar');
  const start = ms('2026-09-01T00:00:00Z'), fitEnd = start + 24 * 3600e3;
  const predicted = object.lines.filter((l, i) => object.t[i] > fitEnd && object.t[i] <= fitEnd + 3 * 86400e3).map((l) => ({ epoch: l.epoch, r: [l.r[0] + 1, l.r[1], l.r[2]], v: l.v }));
  const r = await scorePack(b, { pack: 'danuri-lunar', startMs: start, fitHours: 24, leadDays: [1, 2, 3], predicted, predictedCenter: 'Moon' });
  for (const k of [1, 2, 3]) if (!r.byDay[k] || Math.abs(r.byDay[k].rmsKm - 1) > 1e-6) fail(`pack scorer: a 1 km offset came back as ${r.byDay[k]?.rmsKm} km on day ${k}`);
  replayed += 1;
}
// replay the in-span SpaceX window of one same-day Starlink from the local capture (read in memory)
const dailyDir = path.join(config.archive, 'operator-ephemerides/daily/2026-10-23/starlink');
const dailyRows = fs.existsSync(path.join(store, 'rows/starlink')) ? fs.readdirSync(path.join(store, 'rows/starlink')).filter((n) => /^\d+\.json$/.test(n)).map((n) => JSON.parse(fs.readFileSync(path.join(store, 'rows/starlink', n)))).filter((r) => r.population === 'daily' && r.spacex) : [];
if (dailyRows.length && fs.existsSync(dailyDir)) {
  const rec = dailyRows[Math.floor(dailyRows.length / 2)];
  const text = zlib.gunzipSync(fs.readFileSync(path.join(dailyDir, `${rec.norad}.txt.gz`))).toString('utf8');
  const states = parseMeme(text);
  const start = ms(states[0].epoch);
  const inSpan = states.filter((x) => ms(x.epoch) < start + 48 * 3600e3 - 1000);
  const object = withT({ source: 'starlink-spacex', id: `STARLINK (${rec.norad})`, norad: rec.norad, name: `STARLINK-${rec.norad}`, objectId: '', originator: 'SpaceX', creation: '', frame: 'EME2000', timeSystem: 'UTC', lines: inSpan });
  const again = await scoreWindow(b, object, ms(inSpan[0].epoch), { fitSeconds: config.windows.fitHours * 3600, leadDays: config.windows.spacexInSpanLeadDays, minCoverage: config.windows.minimumCoverage });
  for (const arm of ['xp', 'sgp4']) if (!same(again[arm].fitRmsKm, rec.spacex[arm].fitRmsKm) || !same(again[arm].days[1].rmsKm, rec.spacex[arm].days[1].rmsKm)) fail(`replay SpaceX ${rec.norad}: ${arm} differs`);
  replayed += 1;
}
// replay two M1 to M3 windows: FFM-1 under full and zonal gravity, then the 24 h fits
if (fs.existsSync(m123Dir)) {
  const context = await loadEnvironment(modules, { archive: config.archive, store });
  const frames = await openModule(modules, 'foundation/frames');
  const windows = await allWindows(frames);
  for (const family of ['lageos1', 'iss']) {
    const files = fs.readdirSync(path.join(m123Dir, family)).filter((n) => n.endsWith('.json')).sort();
    const recorded = JSON.parse(fs.readFileSync(path.join(m123Dir, family, files[Math.floor(files.length / 2)])));
    const w = windows.find((x) => x.family === family && x.id === recorded.id);
    if (!w) fail(`replay M1 to M3: window ${family} ${recorded.id} not found`);
    const again = await processWindow(w, { modules, context, baselines: b }, { variants: ['full', 'zonal'], fits: ['h24'], pairs: false, long: false, write: false });
    for (const v of ['full', 'zonal']) for (const arm of ['xp', 'sgp4']) {
      const a = again.variants[v].h24[arm], c = recorded.variants[v].h24[arm];
      if (!same(a.fitRmsKm, c.fitRmsKm)) fail(`replay ${family} ${recorded.id} ${v}: ${arm} fit RMS ${a.fitRmsKm} vs ${c.fitRmsKm}`);
      for (const k of Object.keys(c.days)) if (!same(a.days[k].rmsKm, c.days[k].rmsKm)) fail(`replay ${family} ${recorded.id} ${v}: ${arm} day ${k} differs`);
    }
    replayed += 1;
  }
  await frames.destroy();
}
// replay SDN-GP windows of the headline build with the pinned copy of the module
const headline = sdngpBuilds().filter((x) => x.complete).at(-1);
if (headline) {
  process.env.SDNGP_SNAPSHOT = headline.build;
  const bs = await openBaselines(modules, { sdngp: true });
  const recorded = new Map(buildRows(headline.dir).filter((r) => r.sdngp).map((r) => [rowKey(r), r]));
  let sdReplayed = 0;
  const check = async (object, startMs, fitSeconds, leadDays) => {
    const rec = recorded.get(rowKey({ source: object.source, id: object.id, startUtc: new Date(startMs).toISOString(), fitSeconds }))?.sdngp;
    if (!rec) fail(`SDN-GP replay: no recorded row for ${object.id} ${new Date(startMs).toISOString()} in build ${headline.build}`);
    const again = (await scoreWindow(bs, object, startMs, { fitSeconds, leadDays, minCoverage: config.windows.minimumCoverage, arms: 'sdngp' })).sdngp;
    if (Boolean(again.ok) !== Boolean(rec.ok)) fail(`SDN-GP replay ${object.id}: ok differs`);
    if (rec.ok && !same(again.fitRmsKm, rec.fitRmsKm)) fail(`SDN-GP replay ${object.id}: fit RMS ${again.fitRmsKm} vs ${rec.fitRmsKm}`);
    for (const k of Object.keys(rec.days ?? {})) if (!same(again.days[k].rmsKm, rec.days[k].rmsKm)) fail(`SDN-GP replay ${object.id}: day ${k} differs`);
    sdReplayed += 1;
  };
  for (const source of ['iss', 'gnss', 'slr-low-current']) {
    const rows = read(path.join(store, 'rows', `${source}.jsonl`));
    if (!rows.length) continue;
    const row = rows[Math.floor(rows.length / 2)];
    const object = objectOf(source, row);
    if (object) await check(object, ms(row.startUtc), row.fitSeconds, config.windows.leadDays);
  }
  const spanRows = read(path.join(store, 'rows', 'span-slr.jsonl')); // a COMSPOC-aligned fit-span window (A9e): SGP4 and XP here, SDN-GP below
  const spanRow = spanRows.filter((r) => r.spanHours === 72)[0] ?? spanRows[0];
  if (spanRow) {
    const object = spanObject({ kind: 'laser-ranged', norad: spanRow.norad });
    const again = await scoreWindow(b, object, ms(spanRow.startUtc), { fitSeconds: spanRow.fitSeconds, leadDays: config.windows.leadDays, minCoverage: config.windows.minimumCoverage });
    for (const arm of ['xp', 'sgp4']) {
      if (Boolean(again[arm].ok) !== Boolean(spanRow[arm].ok)) fail(`replay span ${spanRow.id}: ${arm} ok differs`);
      if (spanRow[arm].ok && !same(again[arm].fitRmsKm, spanRow[arm].fitRmsKm)) fail(`replay span ${spanRow.id}: ${arm} fit RMS differs`);
      for (const k of Object.keys(spanRow[arm].days ?? {})) if (!same(again[arm].days[k].rmsKm, spanRow[arm].days[k].rmsKm)) fail(`replay span ${spanRow.id}: ${arm} day ${k} differs`);
    }
    replayed += 1;
    await check(object, ms(spanRow.startUtc), spanRow.fitSeconds, config.windows.leadDays);
  }
  if (metas.length) { // a Starlink FFM truth
    const meta = JSON.parse(fs.readFileSync(path.join(truthDir, metas[Math.floor(metas.length / 3)])));
    const flat = new Float64Array(fs.readFileSync(path.join(truthDir, `${meta.norad}.f64`)).buffer.slice(0));
    const t0 = ms(meta.truth.epochUtc);
    const object = withT({ source: 'starlink-ffm', id: `STARLINK (${meta.norad})`, norad: meta.norad, name: `STARLINK-${meta.norad}`, objectId: '', originator: 'G1 FFM-1', creation: '', frame: 'GCRF', timeSystem: 'UTC',
      lines: Array.from({ length: flat.length / 6 }, (_, i) => ({ epoch: new Date(t0 + i * config.truth.cadenceSeconds * 1000).toISOString(), r: [flat[i * 6], flat[i * 6 + 1], flat[i * 6 + 2]], v: [flat[i * 6 + 3], flat[i * 6 + 4], flat[i * 6 + 5]] })) });
    await check(object, t0, config.windows.fitHours * 3600, config.windows.leadDays);
  }
  await bs.close();
  ok(`${sdReplayed} SDN-GP windows replayed with the pinned module build ${headline.build} reproduce their recorded statistics`);
  replayed += sdReplayed;
}
await b.close();
ok(`${replayed} windows replayed through the modules reproduce their recorded statistics`);
console.log('G1 --check passed');
process.exit(0);
