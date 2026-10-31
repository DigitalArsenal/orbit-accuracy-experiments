// XM4's smoke (PLAN.md, The path as flown; Reproduction): XM3's smoke window, outside the period, no truth after its cutoff, nothing scored.
// It measures the cost of one flight and repeats the equivalences the registration states:
//   the records against OrbPro's own prepareCatalogConfiguration; reads at the bins against every 300 s; one object against a two-object
//   shard; FFM 2.0.3 (the previous pin) against 2.0.4; the console's SGP4 bytes (browser-shared) against the isomorphic ones.
// A difference fails the smoke. <store>/smoke.json holds the numbers; --launch requires it to have passed.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, build, root, store, sha256, modulesRoot, pinned, showModules, DAY, HOUR, iso } from '../common.mjs';
import { openPath, enc, jd } from './ffm1.mjs';
import { driverRows, cachedDcl, framedRecord, moveRecord } from './inputs.mjs';

const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const { publicSetAt } = await import(path.join(root, config.xm.dir, 'lib/public.mjs'));

const GRID = config.scoring.gridSeconds * 1000;
const within = (a, b) => { let differ = 0, maxM = 0; a.forEach((s, i) => { const d = Math.hypot(s.r[0] - b[i].r[0], s.r[1] - b[i].r[1], s.r[2] - b[i].r[2]) * 1000; if (d !== 0) differ += 1; maxM = Math.max(maxM, d); }); return { epochs: a.length, differ, maxM }; };

/** The Earth-fixed seeds of the console's SGP4 bytes: the browser-shared artifact with its Emscripten glue, on shared memory. */
async function browserSharedSeeds(modules, norads, D0) {
  const { commit, sha256: want } = build.console.sgp4BrowserShared;
  const wasm = showModules(modules, commit, 'propagator/sgp4/dist/browser-shared/module.wasm');
  if (sha256(wasm) !== want) throw new Error(`browser-shared SGP4 is ${sha256(wasm)}, registered ${want}`);
  const glue = path.join(store, 'smoke', `sgp4-browser-shared-${want.slice(0, 12)}.mjs`);
  fs.mkdirSync(path.dirname(glue), { recursive: true });
  fs.writeFileSync(glue, showModules(modules, commit, 'propagator/sgp4/dist/browser-shared/module.js'));
  const factory = (await import(pathToFileURL(glue).href)).default;
  const mod = await factory({ wasmBinary: wasm, wasmMemory: new WebAssembly.Memory({ initial: 1024, maximum: 32768, shared: true }), noInitialRun: true, noExitRuntime: true });
  const out = {};
  for (const norad of norads) {
    const set = publicSetAt(norad, D0), e = set.elements;
    const omm = enc.encodeOmmPayload({ noradId: norad, objectName: set.objectName ?? '', objectId: set.objectId ?? '', epoch: set.epoch, meanMotion: e.MEAN_MOTION, eccentricity: e.ECCENTRICITY, inclination: e.INCLINATION,
      raan: e.RA_OF_ASC_NODE, argPericenter: e.ARG_OF_PERICENTER, meanAnomaly: e.MEAN_ANOMALY, bstar: e.BSTAR, meanMotionDot: e.MEAN_MOTION_DOT, meanMotionDdot: e.MEAN_MOTION_DDOT });
    const stream = enc.encodeSizePrefixedStream([omm]);
    mod._plugin_init();
    const p = mod._malloc(stream.length);
    mod.HEAPU8.set(stream, p);
    const count = mod._plugin_init_omm_flatbuffer_stream(p, stream.length);
    mod._free(p);
    if (count !== 1) throw new Error(`browser-shared SGP4 took ${count} sets for ${norad}`);
    const state = mod._malloc(64);
    const r = mod._plugin_propagate_batch(jd(D0), state, 1);
    if (r !== 0) throw new Error(`browser-shared plugin_propagate_batch ${r} for ${norad}`);
    out[norad] = Array.from(new Float64Array(mod.HEAPU8.buffer, state, 7)).slice(1);
    mod._free(state);
    mod._plugin_destroy?.();
  }
  return out;
}

export async function smoke() {
  const modules = modulesRoot();
  const o = config.groups.P.objects.find((x) => x.norad === 39452);
  const D0 = Date.parse('2025-12-31T00:00:00Z');
  const epochsMs = config.scoring.leadDays.flatMap((k) => Array.from({ length: DAY / GRID }, (_, j) => D0 + (k - 1) * DAY + (j + 1) * GRID));
  const M = W.rowsM(D0 - 72 * HOUR - config.weather.rowsMarginDays * DAY, epochsMs.at(-1) + DAY);
  const rows = driverRows(M.rows, D0).rows;
  const cached = cachedDcl(Date.parse('2026-01-01T00:00:00Z'));
  if (!cached.ok) throw new Error(`XM's cached $DCL for issue 2026-01-01T00:00Z was refused: ${cached.error}`);
  const framed = framedRecord(cached.dcl);
  const path_ = await openPath();
  const set = publicSetAt(o.norad, D0), bstar = set.elements.BSTAR;
  const s = await path_.seed(set, o.norad, D0);
  if (!s.ok) throw new Error(s.error);
  const object = { fixed: s.fixed, bstar };
  const k1Records = path_.records(D0, rows, null), k2Records = path_.records(D0, rows, framed);
  const k1 = await path_.fly({ D0, objects: [object], recordBytes: k1Records, epochsMs });
  const k2 = await path_.fly({ D0, objects: [object], recordBytes: k2Records, epochsMs });
  if (!k1.ok || !k2.ok) throw new Error(`smoke flight: ${k1.error ?? k2.error}`);
  const out = { window: config.smoke.window, modulesCommit: build.modulesCommit, provenance: path_.provenance, set: { epoch: set.epoch, creationDate: set.creationDate, gpId: set.gpId, bstar }, profile: k1.profile, dragAreaOverMass: k1.dragAreaOverMass, epochs: epochsMs.length,
    cost: { note: 'one arm over 7 days: GJ8 PEC on the TT grid by perigee, RK78 startup at relative 1e-14 and absolute 1e-11 m and m/s, 300 s Chebyshev segments, the scored epochs at 300 s', K1: { setupSeconds: k1.setupMs / 1000, coverageSeconds: k1.coverageMs / 1000 }, K2: { setupSeconds: k2.setupMs / 1000, coverageSeconds: k2.coverageMs / 1000 } },
    k2MinusK1Km: Object.fromEntries([[1, 287], [2, 575], [3, 863], [7, 1151]].map(([day, i]) => [day, Math.hypot(...k2.states[i].r.map((v, c) => v - k1.states[i].r[c]))])), checks: {} };

  // K3's form: a record with its node times moved is accepted, and flies differently
  const k3 = await path_.fly({ D0, objects: [object], recordBytes: path_.records(D0, rows, moveRecord(cached.dcl, -DAY)), epochsMs });
  if (!k3.ok) throw new Error(`moved-record flight: ${k3.error}`);
  out.checks.movedRecord = { accepted: true, differsFromK2: within(k2.states, k3.states).differ };

  // reads at the bins only against reads every 300 s
  const dense = Array.from({ length: 7 * (DAY / GRID) }, (_, j) => D0 + (j + 1) * GRID);
  const k1d = await path_.fly({ D0, objects: [object], recordBytes: k1Records, epochsMs: dense });
  if (!k1d.ok) throw new Error(`dense flight: ${k1d.error}`);
  const at = new Map(dense.map((t, i) => [t, k1d.states[i]]));
  out.checks.binsAgainstEvery300s = within(k1.states, epochsMs.map((t) => at.get(t)));

  // one object against a two-object shard
  const nb = publicSetAt(config.smoke.neighbor, D0), sn = await path_.seed(nb, config.smoke.neighbor, D0);
  if (!sn.ok) throw new Error(sn.error);
  const two = await path_.fly({ D0, objects: [object, { fixed: sn.fixed, bstar: nb.elements.BSTAR }], recordBytes: k2Records, epochsMs });
  if (!two.ok) throw new Error(`two-object flight: ${two.error}`);
  out.checks.oneObjectAgainstTwoObjectShard = within(k2.states, two.states);

  // FFM 2.0.3, the previous pin, on K2's records
  const old = pinned(modules, 'propagator/ffm', build.console.ffmPrevious.commit, build.console.ffmPrevious.sha256);
  const k2old = await path_.fly({ D0, objects: [object], recordBytes: k2Records, epochsMs, compiled: await WebAssembly.compile(old.bytes), manifest: old.manifest });
  if (!k2old.ok) throw new Error(`previous FFM flight: ${k2old.error}`);
  out.checks.ffmPreviousAgainstPinned = { previous: old.manifest.version, ...within(k2.states, k2old.states) };

  // the console's SGP4 bytes against the bytes P and the seeds use
  const shared = await browserSharedSeeds(modules, config.smoke.seedObjects, D0);
  const seeds = {};
  for (const norad of config.smoke.seedObjects) {
    const f = await path_.seed(publicSetAt(norad, D0), norad, D0);
    if (!f.ok) throw new Error(f.error);
    seeds[norad] = JSON.stringify(f.fixed) === JSON.stringify(shared[norad]);
  }
  out.checks.sgp4BrowserSharedAgainstIsomorphic = { objects: seeds, differ: Object.values(seeds).filter((x) => !x).length };

  // the records against OrbPro's own encoder, when its checkout and build are here
  const encoder = path.resolve(root, '../../main-packages/OrbPro', config.smoke.orbproEncoder);
  try {
    const { prepareCatalogConfiguration } = await import(pathToFileURL(encoder).href);
    const spw = rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
    const a = prepareCatalogConfiguration({ profile: 'FFM-1', kernel: { bytes: path_.env.kernelBytes, sha256: config.environment.kernel.sha256 }, earthOrientation: path_.eopFor(D0).map((r) => ({ ...r })), spaceWeather: spw, bstars: [bstar], densityCorrection: framed }, 1, jd(D0));
    out.checks.orbproEncoder = { checked: true, bytes: a.records.byteLength, equal: sha256(a.records) === sha256(k2Records), newestNodeEpoch: iso(a.densityCorrection.newestNodeEpochMs) };
  } catch (error) { out.checks.orbproEncoder = { checked: false, reason: String(error?.message ?? error).slice(0, 200) }; }

  const c = out.checks;
  out.passed = c.movedRecord.differsFromK2 > 0 && c.binsAgainstEvery300s.differ === 0 && c.oneObjectAgainstTwoObjectShard.differ === 0 && c.ffmPreviousAgainstPinned.differ === 0 && c.sgp4BrowserSharedAgainstIsomorphic.differ === 0 && c.orbproEncoder.equal !== false;
  return out;
}
