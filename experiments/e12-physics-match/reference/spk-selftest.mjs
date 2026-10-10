// Self-test of spk-reader.mjs against SpiceyPy: SpiceyPy writes a synthetic
// type 9 and type 13 SPK (spk_selftest.py), the reader lists them and returns
// the stored states, and spkez evaluated at the stored epochs must return the
// same states (the interpolation nodes). A big-endian twin of each file (DAF
// words byte-swapped here) is read the same way, and read by CSPICE too.
// SPICE computes; this file compares. Synthetic kernels go to
// runs/cache/spk-selftest/ (nothing is an operator's).
//   nice -n 10 node experiments/e12-physics-match/reference/spk-selftest.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { repoRoot } from '../../../harness/provenance.mjs';
import { parseSpk, storedStates } from '../spk-reader.mjs';

const dir = path.join(repoRoot, 'runs/cache/spk-selftest');
const py = path.join(repoRoot, 'runs/cache/spice-venv/bin/python');
const script = path.join(path.dirname(new URL(import.meta.url).pathname), 'spk_selftest.py');
const run = (args, input) => { const r = spawnSync('nice', ['-n', '10', py, '-I', script, ...args], { input, encoding: 'utf8', maxBuffer: 1 << 26 }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout; };
run(['make', dir]);

// Byte-swap a little-endian SPK into its big-endian twin (file record ints, summary records, data words).
function bigEndianTwin(bytes) {
  const spk = parseSpk(bytes), b = Buffer.from(bytes);
  const swap = (at, size, count) => { for (let k = 0; k < count; ++k) b.subarray(at + k * size, at + (k + 1) * size).reverse(); };
  swap(8, 4, 2); swap(76, 4, 3); b.write('BIG-IEEE', 88, 'latin1');
  for (let rec = bytes.readInt32LE(76); rec > 0;) {
    const at = (rec - 1) * 1024, next = bytes.readDoubleLE(at), count = bytes.readDoubleLE(at + 16);
    swap(at, 8, 3);
    for (let k = 0; k < count; ++k) { const s = at + 24 + k * 40; swap(s, 8, 2); swap(s + 16, 4, 6); }
    rec = Math.round(next);
  }
  for (const s of spk.segments) swap((s.beginAddr - 1) * 8, 8, s.endAddr - s.beginAddr + 1);
  return b;
}

let worst = 0, ok = true;
for (const typ of [9, 13]) {
  const little = fs.readFileSync(path.join(dir, `synthetic-type${typ}.bsp`));
  const bigPath = path.join(dir, `synthetic-type${typ}-be.bsp`);
  fs.writeFileSync(bigPath, bigEndianTwin(little));
  for (const [label, bytes, file] of [['LE', little, path.join(dir, `synthetic-type${typ}.bsp`)], ['BE', fs.readFileSync(bigPath), bigPath]]) {
    const spk = parseSpk(bytes), [seg] = spk.segments;
    const stored = storedStates(spk, seg);
    const spice = JSON.parse(run(['eval', file], JSON.stringify({ epochs: stored.samples.map((s) => s.et) }))).states;
    let rel = 0;
    stored.samples.forEach((s, i) => {
      const mine = [...s.position, ...s.velocity].map((x) => x / 1000);
      const scale = Math.max(...spice[i].map(Math.abs));
      for (let j = 0; j < 6; ++j) rel = Math.max(rel, Math.abs(mine[j] - spice[i][j]) / scale);
    });
    worst = Math.max(worst, rel);
    const pass = rel < 1e-9 && seg.type === typ && seg.target === -999 && seg.center === 399 && seg.frame === 1 && stored.count === 200;
    ok &&= pass;
    console.log(`type ${typ} ${label} (${spk.endian}): segment target ${seg.target} centre ${seg.center} frame ${seg.frame} type ${seg.type} ${seg.startIso} .. ${seg.stopIso}; ${stored.count} states, degree ${stored.degree}; max relative difference to SPICE spkez ${rel.toExponential(2)} ${pass ? 'PASS' : 'FAIL'}`);
  }
}
console.log(ok ? `self-test PASS (worst ${worst.toExponential(2)})` : 'self-test FAIL');
process.exit(ok ? 0 : 1);
