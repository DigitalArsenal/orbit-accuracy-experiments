#!/usr/bin/env node
// Step 20: dev rows. e = SGP4(set -> t) - truth(t) in the truth RTN (km, km/s) at five ages per set and age bin.
//   node steps/20-rows.mjs <scratch dir> <modules pin dir> [workers] [--only n1,n2]
// Rows stay in the scratch directory (never in the repository); the repository gets aggregates only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadModule } from '../../../harness/modules.mjs';
import { ARM_OF, decode, frame } from '../lib/erm-codec.mjs';
import { ommFrame } from '../../../harness/records.mjs';
import { epochMs } from '../../../harness/gp-archive.mjs';
import { loadTruthIndex, FrameReader, ROOTS } from '../lib/truth.mjs';
import { HoldAudit, heldPredicate, admit } from '../lib/holds.mjs';
import { BINS, DAY_MS, desiredAgesMs, snap } from '../lib/bins.mjs';

const isoMs = (ms) => new Date(ms).toISOString().replace('Z', '');
const json = (id, port, value) => frame(port, ARM_OF[id][port], value);
const call = async (m, id, inputs, port) => { const r = await m.invoke(id, inputs); const f = port ? r.outputs.find((o) => o.portId === port) : r.outputs[0]; return decode(Buffer.from(f.payload)); };
const roots = () => [...Object.values(ROOTS), ...(process.env.EXTRA_ROOTS ? process.env.EXTRA_ROOTS.split(',') : [])];

function loadSets(scratch) {
  const byObject = new Map(), seen = new Set();
  for (const f of fs.readdirSync(scratch).filter((n) => /^sets-.*\.json\.gz$/.test(n))) {
    for (const s of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(scratch, f)))).sets) {
      if (seen.has(s.gpId)) continue; seen.add(s.gpId);
      (byObject.get(s.norad) ?? byObject.set(s.norad, []).get(s.norad)).push({ ...s, ms: epochMs(s.epoch) });
    }
  }
  for (const l of byObject.values()) l.sort((a, b) => a.ms - b.ms);
  return byObject;
}

async function work(scratch, pin, norads, tag) {
  const gp = await loadModule(pin, 'analysis/gp-error-model');
  const audit = new HoldAudit();
  const truth = loadTruthIndex({ roots: roots(), audit: new HoldAudit() });
  const sets = loadSets(scratch);
  const frames = new FrameReader();
  const unit = { kind: 'e14-factors', version: 'regime-only', regimes: ['LEO-L', 'LEO-M', 'LEO-H', 'MEO', 'GEO', 'HEO'].map((id) => ({ id })), strata: [{ regime: '*', horizonDays: [0, 1e9], factor: 1 }] };
  const E14 = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../e14-covariance-realism/config.json'), 'utf8'));
  unit.regimes = E14.regimes;
  const out = zlib.createGzip(); const sink = fs.createWriteStream(path.join(scratch, `rows-${tag}.jsonl.gz`)); out.pipe(sink);
  const counts = { objects: 0, sets: 0, targets: 0, rows: 0, missing: 0, noSpan: 0, held: 0 };
  for (const norad of norads) {
    const spans = truth.byObject.get(norad) ?? [];
    const list = sets.get(norad) ?? [];
    if (!spans.length || !list.length) continue;
    ++counts.objects;
    const gnss = spans[0].gnss;
    // regimes of the sets (gp-error-model's rule)
    const regimeOf = new Map();
    for (let i = 0; i < list.length; i += 2000) {
      const batch = list.slice(i, i + 2000);
      const r = await call(gp, 'calibrate_covariance', [json('calibrate_covariance', 'model', unit), json('calibrate_covariance', 'objects', { objects: batch.map((s) => ({ id: s.gpId, set: { norad, epoch: s.epoch }, horizonDays: 0, covariance: [1, 0, 1, 0, 0, 1] })) }), ommFrame(batch)]);
      r.objects.forEach((o) => regimeOf.set(String(o.id), o.regime));
    }
    const first = spans[0].start, last = spans[spans.length - 1].stop;
    const usable = list.filter((s) => s.ms <= last);
    for (let i = 0; i < usable.length; i += 8) {
      const group = usable.slice(i, i + 8);
      const targets = [], meta = [];
      for (const s of group) {
        for (let b = 0; b < BINS.length; ++b) desiredAgesMs(b).forEach((age, k) => {
          const want = s.ms + age;
          const span = spans.find((x) => want >= x.start - 600000 && want <= x.stop + 600000 && snap(s.ms, age, b, x) !== null);
          if (!span) { ++counts.noSpan; return; }
          const t = snap(s.ms, age, b, span);
          if (heldPredicate({ norad, ms: t, gnss }) || heldPredicate({ norad, ms: s.ms, gnss })) { ++counts.held; audit.drop(heldPredicate({ norad, ms: t, gnss }) ?? heldPredicate({ norad, ms: s.ms, gnss })); return; }
          targets.push({ norad, epoch: isoMs(t), afterSeconds: span.stepSeconds, sets: [s.epoch], origin: 'reference' });
          meta.push({ s, b, k, t, span });
        });
      }
      if (!targets.length) continue;
      const tmin = Math.min(...meta.map((m) => m.t)) - 3600000, tmax = Math.max(...meta.map((m) => m.t)) + 3600000;
      const fr = spans.filter((x) => x.stop >= tmin && x.start <= tmax).map((x) => frames.frame(x));
      counts.sets += group.length; counts.targets += targets.length;
      const res = await call(gp, 'common_epoch', [ommFrame(group), ...fr, json('common_epoch', 'options', { targets })], 'differences');
      res.targets.forEach((r, j) => {
        const m = meta[j];
        if (r.missing || !r.sets?.[0]) { ++counts.missing; return; }
        ++counts.rows;
        out.write(`${JSON.stringify({ norad, setMs: m.s.ms, gpId: m.s.gpId, t: m.t, b: m.b, k: m.k, age: r.sets[0].ageDays, rtn: r.sets[0].rtn, regime: regimeOf.get(m.s.gpId) ?? null, gnss: gnss ? 1 : 0, sp3: m.span.sp3 })}\n`);
      });
    }
  }
  out.end();
  await new Promise((r) => sink.on('close', r));
  fs.writeFileSync(path.join(scratch, `rows-${tag}.counts.json`), JSON.stringify({ counts, audit: audit.json(), reference: frames.read }));
}

if (process.argv[2] === '--worker') {
  const [, , , scratch, pin, tag, list] = process.argv;
  await work(scratch, pin, list.split(',').map(Number), tag);
  process.exit(0);
}
const [scratch, pin, nw = '8', , only] = process.argv.slice(2);
const truth = loadTruthIndex({ roots: roots(), audit: new HoldAudit() });
let norads = [...truth.byObject.keys()].sort((a, b) => a - b);
if (only) norads = only.split(',').map(Number);
const k = Number(nw);
const chunks = Array.from({ length: k }, () => []);
norads.forEach((n, i) => chunks[i % k].push(n));
await Promise.all(chunks.map((c, i) => new Promise((resolve) => {
  if (!c.length) return resolve();
  const p = fork(fileURLToPath(import.meta.url), ['--worker', scratch, pin, `w${i}`, c.join(',')], { execArgv: [] });
  p.on('exit', (code) => { if (code) console.error(`worker ${i} exit ${code}`); resolve(); });
})));
