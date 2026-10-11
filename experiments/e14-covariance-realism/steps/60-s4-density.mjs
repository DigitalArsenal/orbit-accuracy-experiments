#!/usr/bin/env node
// E14 step 60: the open DCP's density error against independent densities (PLAN.md H6). Swarm A, B, C (POD) and
// GRACE-FO 1 (ACC) daily densities (ESA; E13's converted copies for 2025-10..12, this experiment's conversions
// otherwise), every 5 minutes of valid samples. For each RSGA issue (day d) and lead day k = 1..3, each satellite's
// daily mean of ln rho_obs - ln rho_NRLMSISE(drivers released at the issue) and of ln rho_obs - ln rho_NRLMSISE(observed
// drivers) along its track (propagator/atmosphere). Rows: runs/<id>/density-errors.jsonl.gz
// {issued, day, lead, satellite, n, altitudeKm, forecast, observed, class}.
//
//   node experiments/e14-covariance-realism/steps/60-s4-density.mjs --from 2025-10-01 --to 2025-12-28
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import * as flatbuffers from 'flatbuffers';
import { AtmosphericModelFamily, ATMT, HFC, HFCT, hfcAtmosphereCouplingMode } from 'spacedatastandards.org/lib/js/HFC/main.js';
import { F107DataType, SPW, SPWT } from 'spacedatastandards.org/lib/js/SPW/main.js';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot } from '../../../harness/modules.mjs';
import { readRsga, releasedSpwRows } from '../../../harness/cutoff-environment.mjs';
import { readGfzKp, spwRows } from '../../../harness/full-force.mjs';
import { config, configPath, DAY_MS, moduleOf, jsonlWriter, isoDay } from '../common.mjs';
import { assertSpanReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, modules: { type: 'string' } } });
const fromMs = Date.parse(`${values.from}T00:00:00Z`), toMs = Date.parse(`${values.to}T00:00:00Z`) + DAY_MS;
assertSpanReadable(fromMs, toMs + 3 * DAY_MS - 1);  // lead days 1..3 of the last issue day
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const run = startRun({ experiment: config.experiment, step: `60-s4-density-${values.from}-${values.to}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const atm = await moduleOf(modules, 'propagator/atmosphere', run);
const W = path.join(config.inputs.rsga, 'warehouse');
const rsga = readRsga([...fs.readdirSync(W).filter((n) => /^\d{4}_RSGA\.tar\.gz$/.test(n)).map((n) => path.join(W, n)), path.join(W, '2026', 'RSGA')], path.join(repoRoot, 'runs', 'cache', 'e14-rsga'));
const gfz = readGfzKp(config.inputs.gfzKp);
run.addInputs('gfz', { [path.basename(config.inputs.gfzKp)]: gfz.sha256 });
const SATS = {
  swarmA: { raw: '/opt/data/sdn-archive/hac/esa-swarm-dns/POD/Sat_A', pattern: 'SW_OPER_DNSAPOD_2__' },
  swarmB: { raw: '/opt/data/sdn-archive/hac/esa-swarm-dns/POD/Sat_B', pattern: 'SW_OPER_DNSBPOD_2__' },
  swarmC: { raw: '/opt/data/sdn-archive/hac/esa-swarm-dns/POD/Sat_C', pattern: 'SW_OPER_DNSCPOD_2__' },
  gracefo1: { raw: '/opt/data/sdn-archive/hac/esa-gracefo-dns/Sat_1', pattern: 'GF_OPER_DNS1ACC_2__' },
};
const e13Cache = path.join(config.inputs.e13Store, 'density-cache');
const ownCache = path.join(repoRoot, 'runs', 'cache', 'e14-densities');
const python = '/opt/data/sdn-archive/e13-open-dca/venv/bin/python3';
const converter = path.join(repoRoot, 'experiments/e5-density-calibration/convert/cdf_densities.py');
// One day of one satellite: {t, lat, lon, altKm, rho} at 5-minute samples, valid only; converted on first use.
function day(sat, dayIso) {
  const stamp = dayIso.replaceAll('-', '');
  for (const dir of [path.join(e13Cache, sat), path.join(ownCache, sat)]) {
    const f = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.startsWith(`${SATS[sat].pattern}${stamp}T`)) : null;
    if (f) return read(path.join(dir, f));
  }
  const raw = fs.readdirSync(SATS[sat].raw).find((n) => n.startsWith(`${SATS[sat].pattern}${stamp}T`) && !n.endsWith('.provenance.json'));
  if (!raw) return null;
  fs.mkdirSync(path.join(ownCache, sat), { recursive: true });
  execFileSync(python, ['-I', converter, path.join(ownCache, sat), path.join(SATS[sat].raw, raw)], { stdio: 'ignore' });
  const f = fs.readdirSync(path.join(ownCache, sat)).find((n) => n.startsWith(`${SATS[sat].pattern}${stamp}T`));
  return f ? read(path.join(ownCache, sat, f)) : null;
}
function read(file) {
  const r = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  run.addInputs('densities', { [path.basename(file)]: r.sha256 });
  const out = { t: [], lat: [], lon: [], altKm: [], rho: [] };
  r.t.forEach((s, i) => {
    if (s === null || Math.round(s) % 300 !== 0 || r.flag[i] !== 0 || !(r.rho[i] > 0) || ![r.lat[i], r.lon[i], r.altKm[i]].every(Number.isFinite)) return;
    out.t.push(Math.round(s) * 1000); out.lat.push(r.lat[i]); out.lon.push(r.lon[i]); out.altKm.push(r.altKm[i]); out.rho.push(r.rho[i]);
  });
  return out;
}
const hfc = (d) => {
  const b = new flatbuffers.Builder(1 << 20);
  const env = new HFCT('e14-h6', new Date().toISOString(), 'orbit-accuracy-experiments E14', 'ATMOSPHERE-QUERY', 'UTC', 'ITRF', null, null, 0, null, null,
    new ATMT(AtmosphericModelFamily.NRLMSIS00E, 2000), null, null, hfcAtmosphereCouplingMode.BATCH_QUERY, null, null, undefined, 0, [],
    d.t.map((ms) => new Date(ms).toISOString()), d.lat, d.lon, d.altKm.map((x) => x * 1000), []);
  HFC.finishHFCBuffer(b, env.pack(b));
  return { portId: 'atmosphere', typeRef: { schemaName: 'HFC.fbs', fileIdentifier: '$HFC', rootTypeName: 'HFC' }, payload: b.asUint8Array() };
};
const spw = (row) => {
  const b = new flatbuffers.Builder(512);
  SPW.finishSPWBuffer(b, Object.assign(new SPWT(), { ...row, ND: 1, F107_DATA_TYPE: row.F107_DATA_TYPE === 1 ? F107DataType.PRD : F107DataType.OBS }).pack(b));
  return { portId: 'space_weather', typeRef: { schemaName: 'SPW.fbs', fileIdentifier: '$SPW', rootTypeName: 'SPW' }, payload: b.asUint8Array() };
};
async function rho(d, rows) {
  const r = await atm.invoke('query_atmosphere_state_batch', [hfc(d), ...rows.map(spw)]);
  const o = HFC.getRootAsHFC(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[0].payload)));
  return Float64Array.from({ length: o.densityKgPerM3Length() }, (_, i) => o.DENSITY_KG_PER_M3(i));
}
const out = jsonlWriter(path.join(run.dir, 'density-errors.jsonl.gz'));
const counts = { issues: 0, rows: 0 };
const classOf = (ap) => (ap < config.s4.forecastClassesAp[0] ? 0 : ap < config.s4.forecastClassesAp[1] ? 1 : 2);
for (const issue of rsga.reports) {
  const d = Math.floor(issue.issuedMs / DAY_MS) * DAY_MS;
  if (d < fromMs || d >= toMs) continue;
  ++counts.issues;
  const fc = releasedSpwRows(gfz, rsga, issue.issuedMs + 1000, d - 3 * DAY_MS, d + 4 * DAY_MS).rows;
  const ob = spwRows(gfz, d - 3 * DAY_MS, d + 4 * DAY_MS);
  const cls = classOf(Math.max(...issue.ap.filter((x) => x.kind === 'predicted').map((x) => x.value)));
  for (let k = 1; k <= 3; ++k) {
    const dayIso = isoDay(d + k * DAY_MS);
    for (const sat of Object.keys(SATS)) {
      const dd = day(sat, dayIso);
      if (!dd || dd.t.length < 100) continue;
      const [rf, ro] = [await rho(dd, fc), await rho(dd, ob)];
      let sf = 0, so = 0, n = 0;
      dd.rho.forEach((x, i) => { if (rf[i] > 0 && ro[i] > 0) { sf += Math.log(x / rf[i]); so += Math.log(x / ro[i]); ++n; } });
      out.write({ issued: new Date(issue.issuedMs).toISOString(), day: dayIso, lead: k, satellite: sat, n, altitudeKm: dd.altKm.reduce((a, x) => a + x, 0) / dd.altKm.length,
        forecast: sf / n, observed: so / n, class: cls });
      ++counts.rows;
    }
  }
}
const rows = await out.close();
run.finish({ counts, rows });
log(`done: ${JSON.stringify(counts)}`);
