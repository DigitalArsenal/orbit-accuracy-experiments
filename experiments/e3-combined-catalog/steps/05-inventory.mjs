#!/usr/bin/env node
// E3 step 05: check A0.1 (the Earth orientation substitution) and record the
// source inventory: Vimpel coverage of the truth objects, the CelesTrak
// capture's outcome (PLAN.md sections 2, 3 and 6). Reads no element set.
//
//   node experiments/e3-combined-catalog/steps/05-inventory.mjs --vimpel DIR [--celestrak DIR]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { config, configPath } from '../common.mjs';
import { Products } from '../truth.mjs';

const { values } = parseArgs({ options: { vimpel: { type: 'string' }, celestrak: { type: 'string' }, modules: { type: 'string' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const run = startRun({ experiment: config.experiment, step: '05-inventory', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const checks = {};

// ── A0.1: the same products converted with C04 and with finals2000A ──
const families = ['S1C_OPER_AUX_POEORB', 'S1D_OPER_AUX_POEORB', 'SW_OPER_SP3ACOM', 'SW_OPER_SP3BCOM', 'SW_OPER_SP3CCOM', 'ilrsa.orb.'];
const c04 = new Products(config.inputs.referenceC04, families);
const finals = new Products(config.inputs.reference, families);
const common = c04.products.map((p) => p.product).filter((p) => finals.products.some((q) => q.product === p));
const byFamily = {};
for (const product of common) {
  const family = families.find((f) => product.startsWith(f));
  for (const n of c04.objects()) {
    const a = c04.entries(n).find((e) => e.product === product), b = finals.entries(n).find((e) => e.product === product);
    if (!a || !b) continue;
    const la = c04.load(a), lb = finals.load(b);
    const at = new Map(lb.lines.map((l, i) => [lb.epochs[i], l]));
    for (let i = 0; i < la.lines.length; ++i) {
      const l = la.lines[i], m = at.get(la.epochs[i]);
      if (!m) continue;
      const d = Math.hypot(l.X - m.X, l.Y - m.Y, l.Z - m.Z) * 1000;
      byFamily[family] ??= { products: new Set(), epochs: 0, maxM: 0, sumSq: 0 };
      const f = byFamily[family];
      f.products.add(product); f.epochs += 1; f.maxM = Math.max(f.maxM, d); f.sumSq += d * d;
    }
  }
}
run.addInputs('referenceC04', c04.read);
run.addInputs('reference', finals.read);
const a01 = Object.fromEntries(Object.entries(byFamily).map(([k, f]) => [k, { products: f.products.size, epochs: f.epochs, maxM: f.maxM, rmsM: Math.sqrt(f.sumSq / f.epochs) }]));
const worst = Math.max(...Object.values(a01).map((f) => f.maxM));
checks['A0.1'] = { description: 'largest position difference between C04 and finals2000A conversions of the same products', families: a01, maxM: worst, limitM: config.decisions['A0.1'].maxDifferenceM, pass: Number.isFinite(worst) && worst <= config.decisions['A0.1'].maxDifferenceM };
log(`A0.1 ${checks['A0.1'].pass ? 'PASS' : 'FAIL'}: max ${worst.toFixed(4)} m over ${common.length} products`);

// ── Vimpel coverage of the truth objects ──
const truthNorads = new Set([...Object.values(config.regimes).flatMap((r) => Object.keys(r.objects ?? {}).map(Number))]);
const gps = new Products(config.inputs.reference, [config.regimes.GPS.truthPrefix]);
for (const n of gps.objects()) if (gps.entries(n).some((e) => e.comment.includes(`SP3 satellite ${config.regimes.GPS.sp3System}`))) truthNorads.add(n);
let vimpel = null;
if (values.vimpel) {
  vimpel = { editions: {} };
  for (const [name, hash] of Object.entries(config.inputs.vimpelEditions)) {
    const bytes = fs.readFileSync(path.join(values.vimpel, name));
    if (sha256(bytes) !== hash) throw new Error(`${name}: SHA-256 differs from config.json`);
    run.addInputs('vimpel', { [name]: hash });
    const text = bytes.toString('latin1');
    if (name.startsWith('orbits')) vimpel.editions[name] = { rows: text.split('\n').filter((l) => l.trim()).length };
    else {
      const rows = text.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((r) => r.length >= 4);
      vimpel.crosswalkRows = rows.length;
      vimpel.crosswalkNoradIds = new Set(rows.map((r) => Number(r[2]))).size;
      vimpel.truthObjectsInCrosswalk = rows.filter((r) => truthNorads.has(Number(r[2]))).map((r) => Number(r[2]));
    }
  }
  log(`Vimpel: ${JSON.stringify(vimpel)}`);
}

// ── CelesTrak capture outcome ──
let celestrak = null;
const captureRoot = values.celestrak ?? config.inputs.celestrakCaptures;
if (fs.existsSync(captureRoot)) {
  celestrak = fs.readdirSync(captureRoot).filter((d) => fs.existsSync(path.join(captureRoot, d, 'capture.json'))).sort().map((d) => {
    const raw = fs.readFileSync(path.join(captureRoot, d, 'capture.json'));
    run.addInputs('celestrakCapture', { [`${d}/capture.json`]: sha256(raw) });
    const m = JSON.parse(raw);
    return { capture: d, requests: m.files.length, captured: m.files.filter((f) => f.sha256).length, failures: [...new Set(m.files.filter((f) => !f.sha256).map((f) => String(f.status ?? f.skipped)))] };
  });
  log(`CelesTrak captures: ${JSON.stringify(celestrak)}`);
}

run.write('metrics.json', { checks, truthObjects: truthNorads.size, vimpel, celestrak });
run.finish();
if (Object.values(checks).some((c) => !c.pass)) process.exitCode = 1;
