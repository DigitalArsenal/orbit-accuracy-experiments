import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config, options, pinnedModules, newRun, finishRun, cpu, sha } from './lib.mjs';
import { queryBatch, compare } from './batch.mjs';
import { corpus, queryTimes } from './xp-corpus.mjs';

export async function runXp(opts) {
  const modules = pinnedModules(opts.modules), run = newRun('xp', opts, modules);
  const { openModule } = await import(pathToFileURL(path.join(modules.root, 'propagator/sdn-ap/test/lib/module.mjs')));
  const { lines, sets } = await corpus(modules.root), n = sets.length;
  run.manifest.inputs.syntheticElementStrings = sha(JSON.stringify(lines));
  const require = createRequire(import.meta.url);
  const loadingAt = performance.now();
  const M = require(path.join(modules.root, 'propagator/sgp4-xp/third_party/ussf-sgp4/Sgp4Prop.xp.js'));
  M.print = () => {}; M.printErr = () => {};
  if (!M.calledRun) await new Promise((resolve) => { M.onRuntimeInitialized = resolve; });
  const ussfLoadMs = performance.now() - loadingAt;

  async function white() {
    const start = performance.now(), m = await openModule(), minutes = new Float64Array(n);
    return { loadMs: performance.now() - start, init: () => m.init(sets),
      at(t) {
        const s = m.atMinutes(minutes.fill(t));
        return { values: new Float64Array(s.x.buffer), status: s.status };
      }, storeBytes: () => m.storeBytes(), memoryBytes: () => m.memoryBytes(),
      async close() { m.destroy(); await m.harness.destroy(); } };
  }
  function reference() {
    const keys = M._malloc(8 * n), errors = M._malloc(8 * n), out = M._malloc(64 * n);
    const string = (s) => {
      const b = new TextEncoder().encode(s), p = M._malloc(b.length + 1);
      M.HEAPU8.set(b, p); M.HEAPU8[p + b.length] = 0; return p;
    };
    return { loadMs: 0, init() {
      lines.forEach(([a, b], i) => {
        const p = string(a), q = string(b), key = M._TleAddSatFrLines_wasm(p, q);
        M._free(p); M._free(q);
        if (key < 0n) throw new Error('USSF refused a synthetic input');
        M.HEAP64[(keys >> 3) + i] = BigInt(key);
      });
      if (M._Sgp4InitSats_wasm(keys, n, errors) !== 0) throw new Error('USSF initialization failed');
    }, at(t) {
      if (M._Sgp4PropPosVel_wasm(keys, n, t, 1, 1, out) !== 0) throw new Error('USSF propagation call failed');
      const raw = new Float64Array(M.HEAPU8.buffer, out, 8 * n);
      const values = new Float64Array(6 * n), status = new Int32Array(n);
      for (let i = 0; i < n; i++) {
        status[i] = raw[8 * i];
        for (let j = 0; j < 6; j++) values[j * n + i] = raw[8 * i + j + 2];
      }
      return { values, status };
    }, storeBytes: () => null, memoryBytes: () => M.HEAPU8.buffer.byteLength,
    close() {
      M._Sgp4RemoveSats_wasm(keys, n, errors); M._TleRemoveSats_wasm(keys, n, errors);
      for (const p of [keys, errors, out]) M._free(p);
    } };
  }
  const open = (engine) => engine === 'white' ? white() : reference();
  for (const engine of ['white', 'ussf']) {
    const instance = await open(engine);
    try { instance.init(); for (let i = 0; i < config.xp.warmupQueries; i++) instance.at(i); }
    finally { await instance.close(); }
  }
  const repetitions = opts.quick ? 1 : config.xp.repetitions;
  const result = { exploratory: true, objects: n, queries: config.xp.queries, repetitions, ussfLoadMs,
    inputSha256: run.manifest.inputs.syntheticElementStrings, rows: [], comparisons: [],
    timingIncludes: 'ingest, planning, sorting, propagation, output copying and restoration of caller order',
    timingExcludes: 'module load, fits, frames, covariance, TCA, Pc and transport',
    memoryNote: 'output allocation and resident store reported separately; WASM memory is a runtime high-water mark, not comparable retained object memory' };
  for (const direction of config.xp.directions) {
    const times = queryTimes(direction);
    run.manifest.inputs[`${direction}QueryEpochs`] = sha(JSON.stringify(times));
    for (let rep = 0; rep < repetitions; rep++) {
      for (const engine of rep % 2 ? ['ussf', 'white'] : ['white', 'ussf']) {
        const outputs = {};
        for (const temporal of rep % 2 ? [true, false] : [false, true]) {
          const instance = await open(engine);
          try {
            const startedCpu = cpu(), startedWall = performance.now();
            instance.init();
            const initCpuUs = cpu() - startedCpu, initWallMs = performance.now() - startedWall;
            const batch = queryBatch(instance, times, n, temporal);
            const key = temporal ? 'temporal' : 'caller';
            outputs[key] = batch;
            result.rows.push({ direction, rep, engine, order: key, initCpuUs, initWallMs,
              planningCpuUs: batch.planningCpuUs, queryCpuUs: batch.cpuUs, queryWallMs: batch.wallMs,
              jobCpuUs: initCpuUs + batch.cpuUs, jobWallMs: initWallMs + batch.wallMs,
              jobCpuUsPerState: (initCpuUs + batch.cpuUs) / (n * times.length),
              moduleLoadMs: instance.loadMs, storeBytes: instance.storeBytes(), wasmMemoryBytes: instance.memoryBytes(),
              outputBytes: batch.values.byteLength + batch.statuses.byteLength, load: os.loadavg() });
          } finally { await instance.close(); }
        }
        const check = compare(outputs.caller, outputs.temporal, n);
        result.comparisons.push({ direction, rep, engine, ...check,
          outputSha256: sha(Buffer.concat([Buffer.from(outputs.caller.values.buffer), Buffer.from(outputs.caller.statuses.buffer)])) });
      }
    }
    console.error(`XP ${direction}: ${repetitions} repetitions complete`);
  }
  result.pass = result.comparisons.every((r) => r.pass);
  result.enginePass = Object.fromEntries(['white', 'ussf'].map((e) => [e, result.comparisons.filter((r) => r.engine === e).every((r) => r.pass)]));
  result.timingAdmissible = result.rows.every((r) => r.load[0] < os.availableParallelism());
  const output = finishRun(run, result, 'xp.json');
  console.log(JSON.stringify({ output, pass: result.pass, timingAdmissible: result.timingAdmissible }));
  return { result, manifest: run.manifest, dir: run.dir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { if (!(await runXp(options())).result.pass) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
