// FFM through the modules: the operator fit (analysis/od `fit_ffm`) and the propagation of its state (propagator/ffm).
// This file builds typed requests with the modules' own helpers (propagator/ffm/catalog.mjs,
// analysis/od/scripts/operator-environment.mjs) and decodes the typed answers. Dynamics, frames and the fit are WASM.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as fb from 'flatbuffers';
import { createBrowserModuleHarness } from 'space-data-module-sdk/host/browser-module';
import { OCM } from 'spacedatastandards.org/lib/js/OCM/OCM.js';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { sha256 } from '../common.mjs';
import { iso } from './windows.mjs';

const KERNEL = 'hac/naif-kernels/spk/planets/de440s.bsp';

/** The environment of the run: EOP and space weather are fixed once in the store so every satellite uses the same rows. */
export async function loadEnvironment(modules, { archive, store }) {
  const env = await import(pathToFileURL(path.join(modules, 'analysis/od/scripts/operator-environment.mjs')));
  const catalog = await import(pathToFileURL(path.join(modules, 'propagator/ffm/catalog.mjs')));
  const file = path.join(store, 'environment/environment.json');
  const kernelPath = path.join(archive, KERNEL);
  const kernel = catalog.kernelRecord(fs.readFileSync(kernelPath));
  if (!fs.existsSync(file)) {
    const fresh = await env.environment(); // EOP from the local IERS finals; space weather through the space-weather module (GFZ, NOAA)
    const weather = await extendWeather(env, fresh.inputs.find((i) => i.portId === 'space_weather'), 8);
    const keep = Object.fromEntries(fresh.inputs.filter((i) => i.portId !== 'kernel').map((i) => [i.portId, Buffer.from(i.portId === 'space_weather' ? weather.frame.payload : i.payload).toString('base64')]));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try { fs.writeFileSync(file, JSON.stringify({ createdUtc: new Date().toISOString(), weatherSources: fresh.provenance, weatherExtension: weather.note, kernel: { path: KERNEL, sha256: sha256(fs.readFileSync(kernelPath)) }, inputs: keep }, null, 1), { flag: 'wx' }); } catch { /* another worker wrote it first */ }
  }
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  const inputs = [env.input('kernel', 'PRW', kernel), ...Object.entries(saved.inputs).map(([portId, b64]) => env.input(portId, 'PRW', new Uint8Array(Buffer.from(b64, 'base64'))))];
  return { env, catalog, inputs, provenance: { environmentSha256: sha256(fs.readFileSync(file)), weatherSources: saved.weatherSources, weatherExtension: saved.weatherExtension, kernel: saved.kernel } };
}


// The space-weather module's rows end where its Kp forecast ends (about two days ahead). The truth is propagated up to
// four days, so days after the last row are appended from NOAA SWPC's 45-day forecast (public domain): its daily Ap and
// F10.7, with the last row's Kp, 81-day average and provenance held. Density uses Ap, F10.7 and the 81-day average;
// Kp only enters the winds. The extension is recorded in the environment file.
async function extendWeather(env, frameIn, days = 8) {
  const text = await (await fetch('https://services.swpc.noaa.gov/text/45-day-forecast.txt', { signal: AbortSignal.timeout(60000) })).text();
  const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const section = (title) => {
    const body = text.split(title)[1]?.split(/45-DAY|FORECASTER/)[0] ?? '';
    return new Map([...body.matchAll(/(\d{2})([A-Z][a-z]{2})(\d{2}) (\d+)/g)].map((m) => [new Date(Date.UTC(2000 + Number(m[3]), MONTHS[m[2]], Number(m[1]))).toISOString().slice(0, 10), Number(m[4])]));
  };
  const ap = section('45-DAY AP FORECAST'), flux = section('45-DAY F10.7 CM FLUX FORECAST');
  const prw = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(frameIn.payload))).unpack();
  const rows = prw.SPACE_WEATHER.ROWS;
  const last = rows.at(-1);
  const added = [];
  for (let day = new Date(Date.parse(`${last.DATE}T00:00:00Z`) + 86400000); added.length < days; day = new Date(day.getTime() + 86400000)) {
    const key = day.toISOString().slice(0, 10);
    if (!ap.has(key) || !flux.has(key)) break;
    rows.push(Object.assign(new last.constructor(), last, { DATE: key, AP_AVG: ap.get(key), F107_OBS: flux.get(key) }));
    added.push(key);
  }
  const frame = env.prw('space_weather', 'SPACE_WEATHER', env.table('PRWSpaceWeatherTable', { ROWS: rows }));
  return { frame, note: { source: 'https://services.swpc.noaa.gov/text/45-day-forecast.txt', sha256: sha256(Buffer.from(text)), daysAdded: added, held: 'Kp, F10.7 81-day average and provenance of the last module row' } };
}

const decodeOcm = (payload) => {
  const record = OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(payload)).unpack();
  const user = Object.fromEntries(record.USER_DEFINED_PARAMETERS.map((p) => [p.PARAM_NAME, p.PARAM_VALUE]));
  return { record, user };
};

/** analysis/od `fit_ffm` on one MEME text (in memory). Returns the segments (OCM) and the event count. */
export async function operatorFit(modules, context, { memeBytes, name, norad, epoch, fit }) {
  const base = path.join(modules, 'analysis/od');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'plugin-manifest.json')));
  const config = {
    fitWindowSeconds: fit.windowSeconds, sampleSeconds: fit.sampleSeconds, maxIterations: fit.maxIterations,
    ballisticSeed: fit.ballisticSeed, ballisticPrior: fit.ballisticPrior,
    srpAreaOverMass: norad < 56000 ? fit.srpAreaOverMass.before56000 : fit.srpAreaOverMass.from56000, dataSource: 'G1 SpaceX public MEME',
  };
  const harness = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(base, 'dist/isomorphic/module.wasm')), manifest, surface: 'direct', hostOptions: { config } });
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  try {
    const response = await harness.invoke({ methodId: 'fit_ffm', inputs: [context.env.fil(memeBytes, name), context.env.configuration(epoch), ...context.inputs] });
    if (response.statusCode !== 0) return { ok: false, error: `${response.errorCode}: ${String(response.errorMessage).slice(0, 200)}` };
    const cpu = process.cpuUsage(cpu0);
    const segments = response.outputs.filter((o) => o.portId === 'ocm').map((o) => decodeOcm(o.payload));
    return {
      ok: true, segments, events: response.outputs.filter((o) => o.portId === 'mnv').length, config,
      wallSeconds: (performance.now() - t0) / 1000, cpuSeconds: (cpu.user + cpu.system) / 1e6,
      wasmSha256: sha256(fs.readFileSync(path.join(base, 'dist/isomorphic/module.wasm'))),
    };
  } finally { await harness.destroy(); }
}

/** FFM-1 states at the given epochs (ms) from a GCRF state [m, m/s] at `epoch` (ISO). Returns [{ms, state}] in m and m/s. */
export async function propagate(modules, context, { epoch, state, cdAm, crAm, epochs, integrator }) {
  const c = context.catalog;
  const request = c.fullForceRequest({ epoch, state, target: iso(epochs.at(-1)), cdAm, crAm, integrator: { ...c.CATALOG_INTEGRATOR, ...integrator } });
  request.SAMPLE_EPOCHS = epochs.map((t) => c.instant(iso(t)));
  const dir = path.join(modules, 'propagator/ffm');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json')));
  const harness = await createBrowserModuleHarness({ wasmSource: fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm')), manifest, surface: 'direct' });
  const cpu0 = process.cpuUsage();
  try {
    const response = await harness.invoke({ methodId: 'invoke', inputs: [{ portId: 'request', typeRef: c.TYPE, payload: c.encode('EXECUTION_REQUEST', request) }, ...context.inputs] });
    if (response.statusCode !== 0) throw new Error(`propagator/ffm invoke: ${response.errorCode}: ${response.errorMessage}`);
    const result = c.prw.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs.find((f) => f.portId === 'response').payload))).unpack().EXECUTION_RESULT;
    if (!result?.SAMPLES || result.SAMPLES.length !== epochs.length) throw new Error('FFM did not return all epochs');
    const cpu = process.cpuUsage(cpu0);
    return {
      cpuSeconds: (cpu.user + cpu.system) / 1e6,
      samples: result.SAMPLES.map((s, i) => {
        if (s.STATE.VALID === false) throw new Error('invalid FFM state');
        const v = s.STATE.STATE;
        return { ms: epochs[i], state: ['POSITION', 'VELOCITY'].flatMap((k) => ['X', 'Y', 'Z'].map((a) => v[k][a])) };
      }),
      wasmSha256: sha256(fs.readFileSync(path.join(dir, 'dist/isomorphic/module.wasm'))),
    };
  } finally { await harness.destroy(); }
}
