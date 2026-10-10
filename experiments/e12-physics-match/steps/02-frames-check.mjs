// Step 02 (development): round trips of the frame and time readings the
// hypotheses use (GCRF -> axis/scale -> GCRF through foundation/frames and
// foundation/time), the size of each mislabel, and the Sun lookup.
import fs from 'node:fs';
import path from 'node:path';
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { loadEnvironment } from '../environment.mjs';
import { DEFAULT } from '../hypothesis.mjs';

const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'experiments/e12-physics-match/config.json'), 'utf8'));
const env = await loadEnvironment({ modulesDir: modulesRoot({ configured: config.inputs.modules, repoRoot }), config });
const pts = [{ epoch: '2026-08-01T00:00:00.000Z', position: [6778137, 0, 0], velocity: [0, 4790, 5995] }, { epoch: '2026-08-01T00:01:00.000Z', position: [6758000, 287000, 359000], velocity: [-570, 4770, 5970] }];
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
for (const frame of ['EME2000', 'TEME', 'TOD', 'MOD', 'ITRF']) {
  for (const scale of ['UTC', 'GPS']) {
    const out = await env.fromGcrf(pts, frame, scale, 'FINALS');
    const back = await env.toGcrf(out.map((p) => ({ ...p })), { frame, timeScale: scale }, { ...DEFAULT, frame, timeScale: scale });
    console.log(frame, scale, out[0].epoch, `|label - GCRF| ${d(out[0].position, pts[0].position).toFixed(3)} m, round trip ${d(back[0].position, pts[0].position).toExponential(2)} m, epoch back ${back[0].epoch}`);
  }
}
console.log('sun', (await env.sunPositions(['2026-08-01T00:00:00Z']))[0].map((x) => (x / 1.496e11).toFixed(4)));
console.log('rtn', (await env.rtnAxes('2026-08-01T00:00:00Z', [...pts[0].position, ...pts[0].velocity])).map((x) => x.toFixed(4)).join(' '));
await env.destroy();
