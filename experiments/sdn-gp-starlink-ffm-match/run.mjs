// E2E for G1: node experiments/sdn-gp-starlink-ffm-match/run.mjs --check [--replay N]
// 1. the plan and config are frozen and committed unchanged;
// 2. the committed manifest matches the module artifacts that would run (WASM SHA-256);
// 3. tables.json is re-derived from the recorded window rows (statistics only) and must equal the committed file;
// 4. N windows (default 5 precise-orbit windows, one per source, plus a Starlink FFM truth and an in-span SpaceX window) are replayed through the modules and must reproduce their recorded
//    statistics, and the committed results hold no raw operator, Space-Track or COMSPOC records.
// Without the local records the check says so and exits 2: a skip is never a pass.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, frozen, store, results, root } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { build } from './tables.mjs';
import { manifest } from './manifest.mjs';
import * as sources from './lib/sources.mjs';
import { parseMeme } from './lib/sources.mjs';
import { windowStarts, withT, ms } from './lib/windows.mjs';

const args = process.argv.slice(2);
const replay = args.includes('--replay') ? Number(args[args.indexOf('--replay') + 1]) : 5;
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

const tables = JSON.parse(fs.readFileSync(path.join(results, 'tables.json'), 'utf8'));
if (JSON.stringify(tables) !== JSON.stringify(JSON.parse(JSON.stringify(build())))) fail('tables.json is not reproduced by the recorded rows');
ok('tables.json reproduced from the recorded rows');

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
for (const source of ['gnss', 'iss', 'slr-low', 'slr-high', 'mgex-geo']) { const rows = read(path.join(store, 'rows', `${source}.jsonl`)); if (rows.length) picks.push({ source, row: rows[Math.floor(rows.length / 2)] }); }
let replayed = 0;
const same = (a, c) => Math.abs(a - c) <= 1e-9 * Math.max(1, Math.abs(c));
for (const { source, row } of picks.slice(0, replay)) {
  const object = source === 'gnss' ? sources.gnss(config.precise.gnss).find((o) => o.id === row.id)
    : source === 'iss' ? sources.iss().find((o) => o.id === row.id)
    : source === 'mgex-geo' ? sources.mgex({ klass: 'geo', ...sources.MGEX_A4 }).find((o) => o.id === row.id)
    : source === 'slr-low' ? config.precise.slrLow.targets.flatMap((t) => sources.slrLow({ target: t, arcs: config.precise.slrLow.arcs })).find((o) => o.id === row.id)
    : config.precise.slrHigh.targets.flatMap((t) => sources.slrHigh({ target: t, weeks: config.precise.slrHigh.weeks })).find((o) => o.id === row.id);
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
await b.close();
ok(`${replayed} windows replayed through the modules reproduce their recorded statistics`);
console.log('G1 --check passed');
process.exit(0);
