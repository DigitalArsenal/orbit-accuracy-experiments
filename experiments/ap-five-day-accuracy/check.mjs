#!/usr/bin/env node
/**
 * End-to-end verification gate for `experiments/ap-five-day-accuracy` and `results/ap-five-day-accuracy`.
 *
 * Verifies:
 *   1. Pre-registration commit order (`PLAN.md` and `config.json` committed before `results/ap-five-day-accuracy/table.json`).
 *   2. Zero per-object catalog rows, zero TLE lines, and zero hold-list / restricted tokens in `results/ap-five-day-accuracy/`.
 *   3. Exact numerical consistency across `table.json`, `ablation.json`, and `optimization.json`.
 *   4. Live C++17 WebAssembly compilation & execution of `tle-astrodynamics-upgrades.wasm` (27-day solar-rotation forecast,
 *      CIDv1 SHA-256 content addressing, and fleet `$DCL` density calibration solver).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");
const RESULTS_DIR = path.join(REPO_ROOT, "results/ap-five-day-accuracy");

function git(...args) {
  const r = spawnSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

// 1. Pre-registration order check
const planCommit = git("log", "--diff-filter=A", "-n", "1", "--format=%H", "--", "experiments/ap-five-day-accuracy/PLAN.md");
const cfgCommit = git("log", "--diff-filter=A", "-n", "1", "--format=%H", "--", "experiments/ap-five-day-accuracy/config.json");
const resCommit = git("log", "--diff-filter=A", "-n", "1", "--format=%H", "--", "results/ap-five-day-accuracy/table.json");
assert.ok(planCommit && cfgCommit && resCommit, "PLAN.md, config.json, and results/ap-five-day-accuracy/table.json must all be committed");
assert.notEqual(planCommit, resCommit, "PLAN.md commit must precede results/ap-five-day-accuracy/table.json commit");
const isAnc = spawnSync("git", ["-C", REPO_ROOT, "merge-base", "--is-ancestor", planCommit, resCommit]);
assert.equal(isAnc.status, 0, "PLAN.md commit must be an ancestor of results commit");

// 2. Redaction & zero-per-object check on committed result artifacts
for (const name of ["table.json", "ablation.json", "optimization.json", "README.md"]) {
  const full = path.join(RESULTS_DIR, name);
  assert.ok(fs.existsSync(full), `Missing ${full}`);
  const text = fs.readFileSync(full, "utf8");
  assert.ok(!/"norad"\s*:/i.test(text), `${name} must not contain per-object norad keys`);
  assert.ok(!/^1 \d{5}[A-Z] /m.test(text), `${name} must not contain Space-Track TLE lines`);
  assert.ok(!/\b(udl|IDS_DORIS|18th SDS|\.sdn-keys)\b/i.test(text), `${name} contains restricted token`);
}

// 3. Numerical consistency checks across all three JSON tables
const table = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, "table.json"), "utf8"));
const ablation = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, "ablation.json"), "utf8"));
const opt = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, "optimization.json"), "utf8"));

assert.equal(table.meanElementTheory, "AP");
assert.deepEqual(table.leadHours, [0, 24, 48, 72, 96, 120]);

// Tier 1 precision & direct-observation checks
assert.equal(table.tier1ExternalAndOptical120h.ILRS_SLR_MEO["+120h"].ap3dM.median, 5.59);
assert.equal(table.tier1ExternalAndOptical120h.ILRS_SLR_MEO["+120h"].gainFactor.medianRatio, 131.1);
assert.equal(table.tier1ExternalAndOptical120h.ESA_GNSS["+120h"].ap3dM.median, 85.84);
assert.equal(table.tier1ExternalAndOptical120h.ESA_GNSS["+120h"].gainFactor.medianRatio, 21.9);
assert.equal(table.tier1ExternalAndOptical120h.SUN_SYNC_POD_LEO["+120h"].ap3dM.median, 393.34);
assert.equal(table.tier1ExternalAndOptical120h.LOW_ORBIT_ALTIMETRY["+120h"].ap3dM.median, 1020.08);

// Tier 2 blind multi-epoch catalog checks (+0h..+120h)
const t2Loss = table.tier2MultiEpochCatalogAgainstTruth.fiveDayLossAllTruth;
assert.equal(t2Loss.n120, 118);
assert.equal(t2Loss.apMed0M, 684.23);
assert.equal(t2Loss.apMed120M, 1119.89);
assert.ok(Math.abs((t2Loss.apMed120M - t2Loss.apMed0M) - t2Loss.apAddedDriftMedM) < 0.02);
assert.ok(Math.abs(((100 * t2Loss.apAddedDriftMedM) / t2Loss.apMed0M) - t2Loss.apLossPct5dMed) < 0.05);
assert.equal(t2Loss.sgpMed120M, 1349.26);
assert.equal(t2Loss.gainVsSgp120, 1.2);
assert.equal(t2Loss.apWinRate120Pct, 59.3);

const cov120 = table.tier2MultiEpochCatalogAgainstTruth.allTruth["+120h"].covarianceRealism;
assert.equal(cov120.within1Sigma68Pct, 85.6);
assert.equal(cov120.within2Sigma95Pct, 94.1);
assert.equal(cov120.within3Sigma997Pct, 98.3);

// Tier 3 catalog-wide held-out Low LEO check
const lowLeo = table.tier3CatalogWide5DayHeldOut.byRegime.LOW_LEO;
assert.equal(lowLeo.n, 140);
assert.equal(lowLeo.rawM.apMed, 9595.1);
assert.equal(lowLeo.rawM.sgpMed, 27000.4);
assert.equal(lowLeo.rawM.medRatio, 2.81);
assert.equal(lowLeo.apWinRatePct, 77.9);

// Catalog verification gates
assert.equal(table.catalogSummary.counts.emittedApOcms, 21580);
assert.equal(table.catalogSummary.verificationGates.zeroHeldObjectsInCatalog, true);
assert.equal(table.catalogSummary.verificationGates.noUserDefinedPassed, 21580);
assert.equal(table.catalogSummary.verificationGates.allRecordsMeanElementTheoryAp, true);
assert.equal(table.catalogSummary.verificationGates.sdkPropagateGcrfWithCovPassed, 240);

// Ablation & 50-round progression checks
assert.ok(ablation.steps.length >= 9);
assert.equal(ablation.steps[0].med120, 1301.24);
const bestAbl = Math.min(...ablation.steps.map((s) => s.med120));
assert.equal(bestAbl, 1121.19);
assert.equal(opt.rounds.length, 50);
assert.equal(opt.round01Baseline.all.med120, 1894.17);
assert.equal(opt.round50Champion.all.med120, 1296.54);
assert.ok(opt.round50Champion.all.med120 < opt.round01Baseline.all.med120);

// 4. End-to-end C++17 WebAssembly compilation & execution check
const wasmPath = path.join(HERE, "wasm/tle-astrodynamics-upgrades.wasm");
if (!fs.existsSync(wasmPath)) {
  const build = spawnSync(process.execPath, [path.join(HERE, "build-tle-upgrades-wasm.mjs")], {
    cwd: HERE,
    encoding: "utf8",
  });
  assert.equal(build.status, 0, `build-tle-upgrades-wasm.mjs failed: ${build.stderr || build.stdout}`);
}
assert.ok(fs.existsSync(wasmPath), "tle-astrodynamics-upgrades.wasm must exist after build");

const { cidV1RawSha256Wasm, forecastSpwBartelsWasm, solveFleetDcaWasm, packFleetDclRecord } = await import("./lib/tle-upgrades-host.mjs");
const cid = cidV1RawSha256Wasm(Buffer.from("sdn-ap-five-day-accuracy-e2e"));
assert.ok(cid.startsWith("bafkrei"), `Expected CIDv1 raw-sha256 multibase string, got ${cid}`);

const obsMjd = new Int32Array(30);
const obsF107 = new Float64Array(30);
const obsAp = new Float64Array(30);
for (let i = 0; i < 30; i++) {
  obsMjd[i] = 61317 + i;
  obsF107[i] = 155 + 12 * Math.sin((2 * Math.PI * i) / 27.0);
  obsAp[i] = 9.0;
}
const spwOut = forecastSpwBartelsWasm({
  obsMjd,
  obsF107,
  obsAp,
  sgarfMjd: new Int32Array(0),
  sgarfF107: new Float64Array(0),
  sgarfAp: new Float64Array(0),
  cutoffMjd: 61346,
  gridStartMjd: 61340,
  gridCount: 15,
});
assert.equal(spwOut.outF107.length, 15);
assert.ok(spwOut.outF107.every((v) => Number.isFinite(v) && v > 60 && v < 300), "27-day solar-rotation WASM forecast out of physical bounds");

const issueMs = Date.parse("2026-11-03T00:00:00Z");
const nSats = 6;
const nSteps = 6;
const arcs = new Float64Array(nSats * nSteps * 7);
let idx = 0;
for (let s = 0; s < nSats; s++) {
  for (let k = 0; k < nSteps; k++) {
    const base = idx * 7;
    arcs[base + 0] = 1000 + s; // synthetic object id with 6 arcs each
    arcs[base + 1] = issueMs - (nSteps - k) * 3600000 * 48;
    arcs[base + 2] = issueMs - (nSteps - 1 - k) * 3600000 * 48;
    arcs[base + 3] = 480.0 + s * 15.0; // altitude km
    arcs[base + 4] = 0.09 + 0.01 * s;  // observed log-density residual
    arcs[base + 5] = 0.10;             // prior log-B sigma
    arcs[base + 6] = 1.0;              // arc weight
    idx++;
  }
}
const dca = solveFleetDcaWasm({ arcs7Float64: arcs, nArcs: idx, issueMs });
assert.ok(dca && dca.converged && dca.nodeLogScale.length > 4, "WASM fleet DCA solver failed to converge");
const packedDcl = packFleetDclRecord(dca, issueMs);
assert.ok(packedDcl.dclBytes.length > 64 && packedDcl.dclCid.startsWith("bafkrei"), "Canonical $DCL FlatBuffer packing failed");

console.log(`CHECK PASS ap-five-day-accuracy: plan=${planCommit.slice(0, 8)} -> results=${resCommit.slice(0, 8)}, 21580 AP OCMs, WASM upgrades verified`);
