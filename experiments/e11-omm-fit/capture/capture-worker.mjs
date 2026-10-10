// A capture.mjs pool thread: fits one operator file version in memory and
// returns derived records only (the OMMs and statistics). The raw bytes arrive
// as a transferred ArrayBuffer and are released when the task returns. Physics
// runs in analysis/gp-error-model (fit_elements, element_residuals).
import { parentPort, workerData } from 'node:worker_threads';
import { loadModule } from '../../../harness/modules.mjs';
import { readMeme, readOem } from '../../e4-operator-ephemeris-parity/operators.mjs';
import { fitVersion } from './capture.mjs';

const gp = await loadModule(workerData.modules, 'analysis/gp-error-model');
parentPort.postMessage({ ready: true, provenance: gp.provenance });
parentPort.on('message', async (task) => {
  const t0 = Date.now();
  try {
    const text = Buffer.from(task.body).toString('utf8');
    task.body = null;
    const parsed = task.format === 'meme' ? readMeme(text) : readOem(text);
    const tParse = Date.now();
    const out = await fitVersion(gp, { ...task.input, parsed });
    parentPort.postMessage({ id: task.id, ...out, timing: { parseSeconds: (tParse - t0) / 1000, fitSeconds: (Date.now() - tParse) / 1000 } });
  } catch (e) {
    parentPort.postMessage({ id: task.id, failure: { reason: String(e.stack ?? e).slice(0, 800) } });
  }
});
