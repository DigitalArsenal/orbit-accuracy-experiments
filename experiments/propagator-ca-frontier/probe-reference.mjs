import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, options, pinnedModules, newRun, finishRun, sha } from './lib.mjs';
import { corpus, queryTimes } from './xp-corpus.mjs';
import { compare } from './batch.mjs';

export async function probeReference(opts) {
  const modules = pinnedModules(opts.modules), run = newRun('reference', opts, modules);
  const { referenceLibrary } = await import(pathToFileURL(path.join(modules.root, 'propagator/sgp4-xp/tests/lib/tle.mjs')));
  const ref = await referenceLibrary(), { cases } = await corpus(modules.root);
  const times = queryTimes('forward'), sorted = [...times].sort((a, b) => a - b);
  const index = new Map(times.map((t, i) => [t, i]));
  run.manifest.inputs.corpusSha256 = sha(JSON.stringify(cases.slice(0, 5).map((c) => c.lines)));
  run.manifest.inputs.querySha256 = sha(JSON.stringify(times));
  const normalize = (rows, queries) => {
    if (!rows || rows.length !== queries.length) throw new Error('Reference wrapper refused input');
    const values = new Float64Array(times.length * 6), statuses = new Int32Array(times.length);
    rows.forEach((r, i) => {
      if (!Number.isFinite(r.error)) throw new Error('Nonfinite reference status');
      const at = index.get(queries[i]);
      values.set([...r.r, ...r.v], at * 6); statuses[at] = r.error;
    });
    return { values, statuses };
  };
  const result = { diagnostic: 'Existing single-object reference wrapper, independent of the new multi-object adapter',
    version: 'USSF 9.1.1.0 WASM', queries: times.length, rows: [] };
  for (const c of cases.slice(0, 5)) {
    const baseline = normalize(ref.propagate(c.lines, sorted), sorted);
    for (const prepared of [false, true]) {
      const queries = prepared ? [config.xp.durationMinutes, ...times] : times;
      const raw = ref.propagate(c.lines, queries);
      const shuffled = normalize(prepared ? raw.slice(1) : raw, times);
      result.rows.push({ regime: c.regime, preparedTo72h: prepared, ...compare(shuffled, baseline, 1) });
    }
  }
  result.pass = result.rows.every((r) => r.pass);
  const output = finishRun(run, result, 'reference.json');
  console.log(JSON.stringify({ output, pass: result.pass }));
  return { result, manifest: run.manifest, dir: run.dir };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { if (!(await probeReference(options())).result.pass) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
