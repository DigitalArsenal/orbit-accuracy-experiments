#!/usr/bin/env node
// E14 step 30: the open DCP's density forecast errors (PLAN.md section 4, S4 steps 1-2). For every NOAA SWPC RSGA
// issue (22:00 UTC, day d) whose lead days d+1..d+7 lie in the asked span: the daily space weather as released then
// (harness releasedSpwRows: GFZ's observed values before d, the RSGA's observed F10.7 and estimated Ap for d, its
// predictions for d+1..d+3, day 3 held after) against GFZ's observed values (harness spwRows); NRLMSISE-00 densities
// (propagator/atmosphere query_atmosphere_state_batch) on a fixed grid per lead day and altitude under both; per lead
// day k and altitude the grid mean of ln rho(forecast) - ln rho(observed) (Hejduk's global density error).
// Rows: runs/<id>/forecast-errors.jsonl.gz {issued, day, class (max predicted Ap, days 1-3), altitudesKm, delta [alt][k]}.
//
//   node experiments/e14-covariance-realism/steps/30-s4-forecast.mjs --from 2024-01-01 --to 2026-04-22   (issue days; lead days to +7)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as flatbuffers from 'flatbuffers';
import { AtmosphericModelFamily, ATMT, HFC, HFCT, hfcAtmosphereCouplingMode } from 'spacedatastandards.org/lib/js/HFC/main.js';
import { F107DataType, SPW, SPWT } from 'spacedatastandards.org/lib/js/SPW/main.js';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot } from '../../../harness/modules.mjs';
import { readRsga, releasedSpwRows } from '../../../harness/cutoff-environment.mjs';
import { readGfzKp, spwRows } from '../../../harness/full-force.mjs';
import { config, configPath, DAY_MS, moduleOf, jsonlWriter, isoDay, waitForLoad } from '../common.mjs';
import { assertSpanReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, modules: { type: 'string' } } });
const fromMs = Date.parse(`${values.from}T00:00:00Z`), toMs = Date.parse(`${values.to}T00:00:00Z`) + DAY_MS;
// Every lead day of every issue read here is observed truth for S4: the span must be readable.
assertSpanReadable(fromMs, toMs + 7 * DAY_MS - 1);  // the last issue day's lead days end 8 days after it
await waitForLoad();
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const run = startRun({ experiment: config.experiment, step: `30-s4-forecast-${values.from}-${values.to}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const atm = await moduleOf(modules, 'propagator/atmosphere', run);
const W = path.join(config.inputs.rsga, 'warehouse');
const sources = [...fs.readdirSync(W).filter((n) => /^\d{4}_RSGA\.tar\.gz$/.test(n)).map((n) => path.join(W, n)), path.join(W, '2026', 'RSGA')];
const rsga = readRsga(sources, path.join(repoRoot, 'runs', 'cache', 'e14-rsga'));
run.addInputs('rsga', rsga.files);
const gfz = readGfzKp(config.inputs.gfzKp);
run.addInputs('gfz', { [path.basename(config.inputs.gfzKp)]: gfz.sha256 });
const S4 = config.s4;
const altitudes = [...new Set(Object.values(S4.altitudesKm).flat())].sort((a, b) => a - b);
const lats = [], lons = [];
for (let lat = S4.grid.latitudeDeg[0]; lat <= S4.grid.latitudeDeg[1]; lat += S4.grid.latitudeDeg[2])
  for (let lon = S4.grid.longitudeDeg[0]; lon <= S4.grid.longitudeDeg[1]; lon += S4.grid.longitudeDeg[2]) { lats.push(lat); lons.push(lon); }

const hfcFrame = (epochs, la, lo, al) => {
  const b = new flatbuffers.Builder(1 << 22);
  const env = new HFCT('e14-dcp', new Date().toISOString(), 'orbit-accuracy-experiments E14', 'ATMOSPHERE-QUERY', 'UTC', 'ITRF', null, null, 0, null, null,
    new ATMT(AtmosphericModelFamily.NRLMSIS00E, 2000), null, null, hfcAtmosphereCouplingMode.BATCH_QUERY, null, null, undefined, 0, [], epochs, la, lo, al, []);
  HFC.finishHFCBuffer(b, env.pack(b));
  return { portId: 'atmosphere', typeRef: { schemaName: 'HFC.fbs', fileIdentifier: '$HFC', rootTypeName: 'HFC' }, payload: b.asUint8Array() };
};
const spwFrame = (row) => {
  const b = new flatbuffers.Builder(512);
  const t = Object.assign(new SPWT(), { ...row, ND: 1, F107_DATA_TYPE: row.F107_DATA_TYPE === 1 ? F107DataType.PRD : F107DataType.OBS });
  SPW.finishSPWBuffer(b, t.pack(b));
  return { portId: 'space_weather', typeRef: { schemaName: 'SPW.fbs', fileIdentifier: '$SPW', rootTypeName: 'SPW' }, payload: b.asUint8Array() };
};
// Densities of the grid (lead days 1..7 x altitudes x grid x hours) under one set of daily rows.
const epochs = [], la = [], lo = [], al = [], index = [];
function points(d) {
  epochs.length = la.length = lo.length = al.length = index.length = 0;
  for (let k = 1; k <= S4.leadDays; ++k) for (let a = 0; a < altitudes.length; ++a) for (const h of S4.grid.hoursUtc) for (let g = 0; g < lats.length; ++g) {
    epochs.push(new Date(d + k * DAY_MS + h * 3600000).toISOString()); la.push(lats[g]); lo.push(lons[g]); al.push(altitudes[a] * 1000); index.push([k - 1, a]);
  }
}
async function densities(rows) {
  const r = await atm.invoke('query_atmosphere_state_batch', [hfcFrame(epochs, la, lo, al), ...rows.map(spwFrame)]);
  const out = HFC.getRootAsHFC(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[0].payload)));
  return Float64Array.from({ length: out.densityKgPerM3Length() }, (_, i) => out.DENSITY_KG_PER_M3(i));
}

const out = jsonlWriter(path.join(run.dir, 'forecast-errors.jsonl.gz'));
const counts = { issues: 0, written: 0, skipped: 0 };
for (const issue of rsga.reports) {
  const d = Math.floor(issue.issuedMs / DAY_MS) * DAY_MS;  // the issue's UTC day
  if (d < fromMs || d >= toMs) continue;
  ++counts.issues;
  let fc, ob;
  try {
    fc = releasedSpwRows(gfz, rsga, issue.issuedMs + 1000, d - 3 * DAY_MS, d + S4.leadDays * DAY_MS).rows;
    ob = spwRows(gfz, d - 3 * DAY_MS, d + S4.leadDays * DAY_MS);
  } catch (error) { ++counts.skipped; log(`${isoDay(d)}: ${error.message}`); continue; }
  points(d);
  const [rf, ro] = [await densities(fc), await densities(ob)];
  const sum = Array.from({ length: S4.leadDays }, () => altitudes.map(() => 0)), n = Array.from({ length: S4.leadDays }, () => altitudes.map(() => 0));
  index.forEach(([k, a], i) => { if (rf[i] > 0 && ro[i] > 0) { sum[k][a] += Math.log(rf[i] / ro[i]); ++n[k][a]; } });
  const delta = altitudes.map((_, a) => sum.map((row, k) => (n[k][a] ? row[a] / n[k][a] : null)));
  const predictedAp = issue.ap.filter((x) => x.kind === 'predicted').map((x) => x.value);
  out.write({ issued: new Date(issue.issuedMs).toISOString(), day: isoDay(d), predictedApMax: Math.max(...predictedAp), predictedF107: issue.f107.filter((x) => x.kind === 'predicted').map((x) => x.value),
    observedAp: ob.slice(4, 4 + S4.leadDays).map((r) => r.AP_AVG), observedF107: ob.slice(3, 3 + S4.leadDays).map((r) => r.F107_OBS), altitudesKm: altitudes, delta });
  ++counts.written;
  if (counts.written % 50 === 0) log(`${isoDay(d)}: ${counts.written} issues`);
}
const rows = await out.close();
run.finish({ counts, rows, altitudes, grid: { points: lats.length, hours: S4.grid.hoursUtc.length } });
log(`done: ${JSON.stringify(counts)}`);
