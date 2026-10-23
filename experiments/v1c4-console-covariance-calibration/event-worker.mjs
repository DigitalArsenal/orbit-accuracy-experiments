// One detector run per message: the object's causal sets in, the detector's event times out.
import { parentPort, workerData } from 'node:worker_threads';
import { makeDetector } from './maneuvers.mjs';

const detector = await makeDetector(workerData.runtime);
parentPort.on('message', async sets => {
  try { parentPort.postMessage({ result: { events: (await detector.events(sets)).map(e => e.time) } }); }
  catch (error) { parentPort.postMessage({ result: { events: [], error: String(error.message ?? error).slice(0, 200) } }); }
});
parentPort.postMessage({ ready: true, provenance: detector.provenance });
