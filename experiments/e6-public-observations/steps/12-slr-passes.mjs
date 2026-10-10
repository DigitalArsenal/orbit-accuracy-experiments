// Laser-ranging arm: ILRS normal points -> range measurements (PLAN.md
// §4.5) for one window. Per CRD pass of a target: the station's ITRF
// position (the weekly ILRS solution nearest the pass that holds it, plus
// its published eccentricity); per normal point the range c tof / 2 at the
// bounce instant, the station's GCRF position at that instant and the
// target's elevation, both from analysis/association (the latest published
// element set, propagated by propagator/sgp4, as the prediction; the
// elevation only maps the troposphere), and the CRD met record for the
// estimator's Marini-Murray troposphere. Writes runs/cache/e6/slr/<target>.json.
//   node experiments/e6-public-observations/steps/12-slr-passes.mjs --window dev
import fs from 'node:fs';
import path from 'node:path';
import { cli, config, guard, home, windowOf, DAY_MS } from '../common.mjs';
import { loadModule, sha256 } from '../../../harness/modules.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { readSets, setAt } from '../../e4-operator-ephemeris-parity/products.mjs';
import { finalsRecords } from '../eop.mjs';
import { eopStream, jsonFrame, predictionFrame } from '../records.mjs';
import { earthFixedStates } from '../sgp4.mjs';
import { parseCrd, parseSinex } from '../slr.mjs';
import * as flatbuffers from 'flatbuffers';
import * as RDO from 'spacedatastandards.org/lib/js/RDO/main.js';

const { values, modules, archive } = cli({ window: { type: 'string' } });
const windowName = values.window ?? 'dev';
const modulesDir = modules();
const run = startRun({ experiment: 'e6', step: `12-slr-passes-${windowName}`, configPath: path.join(repoRoot, 'experiments/e6-public-observations/config.json'), modulesDir, args: values });
const m = {};
for (const name of ['propagator/sgp4', 'analysis/association', 'data-source/eop-parser']) { m[name] = await loadModule(modulesDir, name); run.addModule(m[name].provenance); }
const finals = await finalsRecords(m['data-source/eop-parser'], config.inputs.eopFinals);
const root = home(config.inputs.ilrs);
const iso = (ms) => new Date(ms).toISOString();

// Station solutions, by epoch.
const solutions = fs.readdirSync(path.join(root, 'pos+eop')).filter((n) => n.endsWith('.snx.gz')).sort().map((n) => {
  const bytes = fs.readFileSync(path.join(root, 'pos+eop', n));
  run.addInputs('sinex', { [n]: sha256(bytes) });
  return { name: n, ...parseSinex(bytes) };
});
const stationAt = (code, ms) => solutions.filter((s) => s.sites.has(code)).sort((a, b) => Math.abs(a.epochMs - ms) - Math.abs(b.epochMs - ms))[0];

const rdo = (fields) => {
  const t = Object.assign(new RDO.RDOT(), fields);
  const b = new flatbuffers.Builder(512);
  b.finish(t.pack(b), '$RDO');
  return { portId: 'radar_observations', typeRef: { schemaName: 'RDO.fbs', fileIdentifier: '$RDO', rootTypeName: 'RDO', wireFormat: 'flatbuffer' }, payload: b.asUint8Array().slice() };
};
const out = path.join(repoRoot, 'runs/cache/e6/slr');
fs.mkdirSync(out, { recursive: true });
const counts = {};
for (const [name, target] of Object.entries(config.slr.targets)) {
  const c = (counts[name] = { files: 0, passes: 0, points: 0, noStation: 0, noSet: 0, notTwoWay: 0, outside: 0, duplicate: 0 });
  const seen = new Set();
  const dir = path.join(root, 'npt_crd_v2', name);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.np2')).sort() : [];
  const sets = readSets(archive, config.sources.ilrs.span[0], config.sources.ilrs.span[1], new Set([target.norad]), run).get(target.norad) ?? [];
  const passes = [];
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    const crd = parseCrd(bytes.toString('latin1'));
    if (!crd.length) continue;
    let used = false;
    for (const p of crd) {
      const times = p.points.map((x) => x.bounceMs);
      if (windowOf(Math.min(...times), 'slr') !== windowName || windowOf(Math.max(...times), 'slr') !== windowName) { ++c.outside; continue; }
      // Monthly files and late daily files can repeat a pass: one copy.
      const id = `${p.station}:${p.points[0].bounceMs}`;
      if (seen.has(id)) { ++c.duplicate; continue; }
      seen.add(id);
      if (!used) { run.addInputs('normalPoints', { [`${name}/${f}`]: sha256(bytes) }); ++c.files; used = true; }
      guard(Math.min(...times), 'step 12', 'slr');
      if (p.rangeType !== 2) { ++c.notTwoWay; continue; }
      const sol = stationAt(p.station, times[0]);
      if (!sol) { ++c.noStation; continue; }
      const site = sol.sites.get(p.station);
      const set = setAt(sets, Math.min(...times));
      if (!set) { ++c.noSet; continue; }
      // Association: station GCRF position and target elevation per point.
      const grid = []; for (let t = Math.floor(Math.min(...times) / 10000) * 10000 - 120000; t <= Math.max(...times) + 120000; t += 10000) grid.push(t);
      const states = await earthFixedStates(m['propagator/sgp4'], { norad: target.norad, epoch: set.epoch, elements: set.elements }, grid);
      const lower = []; for (let r = 0; r < 6; r++) for (let k = 0; k <= r; k++) lower.push(r === k ? (r < 3 ? 1 : 1e-6) : 0);
      const prediction = predictionFrame({ norad: target.norad, frame: 'ITRF2000', states: grid.map((t, i) => ({ epoch: iso(t), state: states[i] })), covariances: [{ epoch: iso(grid[0]), lower }, { epoch: iso(grid.at(-1)), lower }] });
      const eop = eopStream(finals.records.filter((r) => Math.abs(r.mjd - (times[0] / DAY_MS + 40587)) < 2).map((r) => r.row));
      const records = p.points.map((x, i) => rdo({ OB_TIME: iso(x.bounceMs), RANGE: x.rangeM / 1000, RANGE_UNC: 0.001, ELEVATION: 45, ELEVATION_UNC: 10, SENX: site.itrf[0] / 1000, SENY: site.itrf[1] / 1000, SENZ: site.itrf[2] / 1000, ID_SENSOR: p.station, TRACK_ID: `${f}:${i}` }));
      const response = await m['analysis/association'].invoke('associate_observations', [...records, prediction, eop, jsonFrame('options', { scan: 'observation', geometry: true, max_candidates: 1, light_time: false })]);
      const report = JSON.parse(Buffer.from(response.outputs.find((x) => x.portId === 'report').payload));
      const points = p.points.map((x, i) => {
        const o = report.observations[i], cand = o.candidates[0];
        return {
          time: iso(x.bounceMs), rangeM: x.rangeM, tofS: x.tofS, rmsPs: x.rmsPs, returns: x.returns, station: o.sensor_gcrf_km.map((v) => v * 1000),
          elevationDeg: cand?.predicted?.elevation_deg ?? null, predictedRangeM: cand?.predicted?.range_km ? cand.predicted.range_km * 1000 : null,
          media: { pressureHpa: x.met?.pressureHpa ?? 0, temperatureK: x.met?.temperatureK ?? 0, relativeHumidity: x.met?.humidity ?? 0, wavelengthM: p.wavelengthM ?? 532e-9,
            latitudeRad: site.latDeg * Math.PI / 180, heightM: site.heightM, elevationRad: (cand?.predicted?.elevation_deg ?? 0) * Math.PI / 180 },
        };
      });
      passes.push({ key: `${name}:${p.station}:${p.points[0].bounceMs}`, file: f, target: name, norad: target.norad, station: p.station, stationName: p.stationName, sinex: sol.name,
        troposphereApplied: p.troposphereApplied, comApplied: p.comApplied, met: p.points.some((x) => x.met), setEpoch: set.epoch, points });
      ++c.passes; c.points += points.length;
    }
  }
  passes.sort((a, b) => Date.parse(a.points[0].time) - Date.parse(b.points[0].time));
  fs.writeFileSync(path.join(out, `${name}-${windowName}.json`), JSON.stringify(passes));
}
console.log(JSON.stringify(counts));
run.write('summary.json', counts);
run.finish({ counts });
