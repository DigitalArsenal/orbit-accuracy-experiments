// The truth gate's end-to-end check (task experiments-truth-ingest-gate-20261025):
//   1. scan.mjs regenerates the ledger's centers, ISS, packs, SPK and capture parts whole, and the reference part for every product the ledger
//      lists (the full reference part is the same code over 77,000 more files); each equals flags.json;
//   2. every gated reader drops every listed state and keeps the rest: G1's readReference (raw holds it), harness ReferenceIndex.frames and
//      e3's Products.load (bytes and lines); a product with no drop comes back byte for byte;
//   3. affected.mjs regenerates affected.json, and report.mjs renders REPORT.md, unchanged.
// Needs the archive and a built modules checkout (SDN_MODULES_ROOT, or the task's sibling worktree) for the SPK part and the confirmations.
//   node experiments/truth-gate/check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const t0 = Date.now();
const bar = (s) => console.error(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);
const ledger = JSON.parse(fs.readFileSync(path.join(here, 'flags.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truth-gate-check-'));
const scan = (args, out) => run(process.execPath, [path.join(here, 'scan.mjs'), ...args, '--out', out], { cwd: root, maxBuffer: 1 << 26 }).then(() => JSON.parse(fs.readFileSync(out, 'utf8')));
const setDir = new Map(ledger.sets.filter((s) => s.directory).map((s) => [s.set, s.directory]));
const referenceSets = new Set(['reference-states', 'reference-states finals2000a', 'reference-states LEO POD 2', 'V1c5 refreshed truth', 'G1 laser-ranging copies (CDDIS)', 'G1 GFZ rapid orbits', 'E14 MGEX orbits', 'V1c5 re-score truth']);
const listed = ledger.flags.filter((f) => referenceSets.has(f.set));

try {
  // 1. the parts, regenerated (in parallel) and compared
  const whole = ['centers', 'iss', 'packs', 'spk', 'capture'];
  const products = [...new Set(listed.map((f) => f.product))];
  const [parts, reference] = await Promise.all([
    Promise.all(whole.map((p) => scan(['--only', p], path.join(tmp, `${p}.json`)))),
    scan(['--only', 'reference', '--products', products.join(',')], path.join(tmp, 'reference.json')),
  ]);
  for (const part of parts) {
    for (const s of part.sets) assert.deepEqual(s, ledger.sets.find((x) => x.set === s.set), `set ${s.set} differs from flags.json`);
    const names = new Set(part.sets.map((s) => s.set));
    assert.deepEqual(part.flags, ledger.flags.filter((f) => names.has(f.set)), `flags of ${[...names].join(', ')} differ from flags.json`);
  }
  assert.deepEqual(reference.flags, listed, 'reference flags of the listed products differ from flags.json');
  bar(`scan: ${whole.join(', ')} regenerated whole; reference regenerated for ${products.length} listed products; ${ledger.flags.length} ledger entries reproduced`);

  // 2. the readers
  const { readReference } = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs'));
  const { ReferenceIndex } = await import(path.join(root, 'harness/reference.mjs'));
  const { Products } = await import(path.join(root, 'experiments/e3-combined-catalog/truth.mjs'));
  const { decodeOemStream } = await import(path.join(root, 'harness/records.mjs'));
  const { gateOemFrame } = await import(path.join(root, 'harness/truth-gate.mjs'));
  const ms = (e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`);
  const epochsOf = (bytes) => new Set(decodeOemStream(new Uint8Array(bytes)).flatMap((o) => o.EPHEMERIS_DATA_BLOCK.flatMap((b) => b.EPHEMERIS_DATA_LINES.map((l) => ms(l.EPOCH)))));
  let checked = 0;
  for (const f of ledger.flags.filter((x) => x.action === 'drop' && referenceSets.has(x.set))) {
    const dir = setDir.get(f.set), t = Date.parse(f.epoch), file = path.join(dir, f.product, `${f.norad}.oem`);
    const raw = readReference(file, { raw: true }).lines.map((l) => ms(l.epoch)), gated = readReference(file).lines.map((l) => ms(l.epoch));
    assert.ok(raw.includes(t), `${f.product} ${f.epoch}: not in the file as written`);
    assert.ok(!gated.includes(t) && gated.length === raw.length - listed.filter((g) => g.set === f.set && g.product === f.product && g.norad === f.norad && g.action === 'drop').length, `${f.product} ${f.epoch}: readReference kept it, or dropped another state`);
    const index = new ReferenceIndex(dir, [f.product]);
    const frames = index.frames(f.norad, t - 3600e3, t + 3600e3);
    assert.ok(frames.length && frames.every((x) => !epochsOf(x.payload).has(t)) && index.gated.some((d) => Date.parse(d.epoch) === t), `${f.product} ${f.epoch}: ReferenceIndex.frames kept it`);
    const products = new Products(dir, [f.product]);
    const entry = products.entries(f.norad)[0], loaded = products.load(entry);
    assert.ok(!loaded.epochs.includes(t) && !epochsOf(loaded.bytes).has(t) && products.gated.some((d) => Date.parse(d.epoch) === t), `${f.product} ${f.epoch}: Products.load kept it`);
    checked += 1;
  }
  // a product with no drop: the frame comes back as the same bytes
  const clean = fs.readdirSync(setDir.get('reference-states')).find((p) => p.startsWith('ilrsa.orb.lageos1.') && !listed.some((f) => f.product === p));
  const cleanFile = fs.readdirSync(path.join(setDir.get('reference-states'), clean)).find((x) => x.endsWith('.oem'));
  const bytes = fs.readFileSync(path.join(setDir.get('reference-states'), clean, cleanFile));
  const g = gateOemFrame(bytes, { product: clean });
  assert.ok(g.bytes === bytes && g.dropped.length === 0, `${clean}: a product with no drop was re-encoded`);
  bar(`readers: ${checked} dropped states absent from readReference, ReferenceIndex.frames and Products.load; ${clean} passes unchanged`);

  // 3. affected.json and REPORT.md
  await run(process.execPath, [path.join(here, 'affected.mjs'), '--out', path.join(tmp, 'affected.json')], { cwd: root, maxBuffer: 1 << 26 });
  assert.equal(fs.readFileSync(path.join(tmp, 'affected.json'), 'utf8'), fs.readFileSync(path.join(here, 'affected.json'), 'utf8'), 'affected.json differs');
  const { render } = await import(path.join(here, 'report.mjs'));
  assert.equal(render(ledger, JSON.parse(fs.readFileSync(path.join(here, 'affected.json'), 'utf8'))), fs.readFileSync(path.join(here, 'REPORT.md'), 'utf8'), 'REPORT.md differs');
  const affected = JSON.parse(fs.readFileSync(path.join(here, 'affected.json'), 'utf8'));
  bar(`affected.json and REPORT.md regenerated: ${affected.states.length} dropped states; ${affected.experiments.map((e) => `${e.experiment.split(' ')[0]} ${e.verdict.split(':')[0]}`).join(', ')}`);
  console.error('truth gate check: PASS');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(0);
