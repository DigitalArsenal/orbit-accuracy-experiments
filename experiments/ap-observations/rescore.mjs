// check.mjs's re-flight worker: the stored AP $OCMs of its rows (both AP arms) flown again by propagator/sdn-ap and scored
// again by analysis/reference-states compare_to_reference; posts [[key, {arm: {ok, days}}]].
import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import * as L from './lib.mjs';

const { config, DAY, iso } = L;
const h = await L.openHosts(['sdnAp', 'refs']);
const out = [];
for (const r of workerData.rows) {
  const T = Date.parse(r.cutoff), truth = await L.truthOf(r.target);
  const { chosen, every, minPerDay } = L.thinned(truth, T);
  const reference = L.linesOem('GCRF', chosen.map((x) => x.l));
  const again = {};
  for (const [arm, file] of [['ap', 'ap.ocm'], ['apNsgf', 'ap-nsgf.ocm']]) {
    if (!r.arms[arm]?.ok) { again[arm] = r.arms[arm]; continue; }
    const ocm = new Uint8Array(fs.readFileSync(path.join(L.store, 'products', L.stampOf(r), file)));
    const eph = await L.apPropagate(h, ocm, iso(T), iso(T + Math.max(...config.leadDays) * DAY), config.carryStepSeconds);
    again[arm] = { ok: true, days: L.dayValues(await L.compare(h, eph, reference), T, every, minPerDay) };
  }
  out.push([L.keyOf(r), again]);
}
await h.close();
parentPort.postMessage(out);
