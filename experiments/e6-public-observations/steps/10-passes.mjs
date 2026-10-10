// SatNOGS passes -> range-rate measurements (PLAN.md §4.1) for one window.
// For each captured observation of the object with a waterfall: the track
// (waterfall.mjs), then the measurements (passes.mjs: sgp4 + association).
// Writes runs/cache/e6/passes/<id>.json (track, measurements, RFO records as
// base64) and the run's summary. The test window needs the freeze.
//   node experiments/e6-public-observations/steps/10-passes.mjs --window dev [--limit 20]
import fs from 'node:fs';
import path from 'node:path';
import { cli, config, guard, windowOf } from '../common.mjs';
import { loadModule, sha256 } from '../../../harness/modules.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { finalsRecords } from '../eop.mjs';
import { eopStream } from '../records.mjs';
import { passMeasurements, waterfallTrack } from '../passes.mjs';

const { values, satnogs, modules } = cli({ window: { type: 'string' }, limit: { type: 'string' }, norad: { type: 'string' }, force: { type: 'boolean' } });
const windowName = values.window ?? 'dev';
const norad = values.norad ?? String(config.satnogs.norad);
const modulesDir = modules();
const run = startRun({ experiment: 'e6', step: `10-passes-${windowName}`, configPath: path.join(repoRoot, 'experiments/e6-public-observations/config.json'), modulesDir, args: values });
const m = {};
for (const name of ['propagator/sgp4', 'analysis/association', 'data-source/eop-parser']) { m[name] = await loadModule(modulesDir, name); run.addModule(m[name].provenance); }
const finals = await finalsRecords(m['data-source/eop-parser'], config.inputs.eopFinals);
run.addInputs('eop', { [config.inputs.eopFinals]: finals.sha256 });
const out = path.join(repoRoot, 'runs/cache/e6/passes');
fs.mkdirSync(out, { recursive: true });

// Every captured observation of the object, once.
const dir = path.join(satnogs, 'observations', norad);
const byId = new Map();
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) for (const o of JSON.parse(fs.readFileSync(path.join(dir, f)))) if (String(o.norad_cat_id) === norad) byId.set(o.id, o);
const list = [...byId.values()].filter((o) => windowOf(Date.parse(o.start)) === windowName && windowOf(Date.parse(o.end)) === windowName)
  .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
const counts = { observations: list.length, noWaterfall: 0, unreadable: {}, noTrack: 0, offCenter: 0, fewPoints: 0, passes: 0, measurements: 0 };
const ex = config.extraction;
for (const obs of list.slice(0, values.limit ? Number(values.limit) : undefined)) {
  guard(Date.parse(obs.start), 'step 10');
  const file = path.join(out, `${obs.id}.json`);
  if (fs.existsSync(file) && !values.force) { const p = JSON.parse(fs.readFileSync(file)); if (p.measurements) { ++counts.passes; counts.measurements += p.measurements.length; } else counts[p.rejected === 'no-track' ? 'noTrack' : p.rejected === 'off-center' ? 'offCenter' : 'fewPoints'] += p.rejected ? 1 : 0; continue; }
  const png = obs.waterfall && path.join(satnogs, 'waterfalls', norad, path.basename(new URL(obs.waterfall).pathname));
  if (!png || !fs.existsSync(png)) { ++counts.noWaterfall; continue; }
  const bytes = fs.readFileSync(png);
  run.addInputs('waterfalls', { [path.basename(png)]: sha256(bytes) });
  let track;
  try { track = waterfallTrack(bytes, obs, ex); } catch (e) { const k = e.message.replace(/\(.*$/, '').trim(); counts.unreadable[k] = (counts.unreadable[k] ?? 0) + 1; continue; }
  const base = { id: obs.id, start: obs.start, end: obs.end, station: obs.ground_station, stationName: obs.station_name, lat: obs.station_lat, lon: obs.station_lng, altM: obs.station_alt,
    f0: obs.observation_frequency, transmitter: obs.transmitter_uuid, mode: obs.transmitter_mode, status: obs.status, maxAltitude: obs.max_altitude, tle: [obs.tle1, obs.tle2], scale: track.scale, center: track.center };
  let rejected = null;
  if (track.center === null) rejected = 'no-track';
  else if (Math.abs(track.center) > ex.maxCenterHz || Math.abs(track.center) < ex.minCenterHz) rejected = 'off-center';
  else if (track.points.length < ex.minPoints) rejected = 'few-points';
  if (rejected) { fs.writeFileSync(file, JSON.stringify({ ...base, rejected })); counts[{ 'no-track': 'noTrack', 'off-center': 'offCenter', 'few-points': 'fewPoints' }[rejected]]++; continue; }
  const eopRows = finals.records.filter((r) => r.mjd >= Math.floor(Date.parse(obs.start) / 86400000 + 40587) - 1 && r.mjd <= Math.floor(Date.parse(obs.end) / 86400000 + 40587) + 1).map((r) => r.row);
  const meas = await passMeasurements({ association: m['analysis/association'], sgp4: m['propagator/sgp4'], eop: eopStream(eopRows) }, obs, track, { lagSeconds: 0, sigmaScale: 1 });
  fs.writeFileSync(file, JSON.stringify({ ...base, lagSeconds: 0, points: track.points, measurements: meas.map(({ rfo, ...x }) => ({ ...x, rfo: Buffer.from(rfo).toString('base64') })) }));
  ++counts.passes; counts.measurements += meas.length;
  if (counts.passes % 25 === 0) { console.log(JSON.stringify(counts)); run.checkpoint(); }
}
console.log(JSON.stringify(counts));
run.write('summary.json', counts);
run.finish({ counts });
