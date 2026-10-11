#!/usr/bin/env node
// E14 step 22: S2's P0 file (PLAN.md, changes before the freeze): S3-T's age-0 strata of the first S3 fit
// (results/e14/dev/s3-models-s2p0.json, the file S2's first dev-fit runs read) for every regime it has, and of the refit
// (results/e14/dev/s3-models.json) for the regimes the first fit lacks (GEO and HEO, which had no truth then), when the
// stratum holds at least s3.minimumBinSamples samples. Writes results/e14/dev/s2-p0.json in the S3 model layout step
// 40 reads.
//
//   node experiments/e14-covariance-realism/steps/22-s2-p0.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config, writeJson } from '../common.mjs';

const rel = { first: 'results/e14/dev/s3-models-s2p0.json', refit: 'results/e14/dev/s3-models.json' };
const bytes = Object.fromEntries(Object.entries(rel).map(([k, f]) => [k, fs.readFileSync(path.join(repoRoot, f))]));
const first = JSON.parse(bytes.first).candidates['S3-T'], refit = JSON.parse(bytes.refit).candidates['S3-T'];
const age0 = (m) => m.strata.filter((s) => s.ageIndex === 0);
const have = new Set(age0(first).map((s) => s.regime));
const strata = [...age0(first).map((s) => ({ ...s, from: 'first' })), ...age0(refit).filter((s) => !have.has(s.regime) && s.n >= config.s3.minimumBinSamples).map((s) => ({ ...s, from: 'refit' }))]
  .sort((a, b) => a.regimeIndex - b.regimeIndex);
const out = { kind: 'e14-s2-p0', note: 'S3-T age-0 strata: the first fit where it has the regime, else the refit (GEO, HEO)',
  sources: Object.fromEntries(Object.entries(rel).map(([k, f]) => [k, { file: f, sha256: createHash('sha256').update(bytes[k]).digest('hex') }])),
  candidates: { 'S3-T': { version: `${first.version}+${refit.version}`, strata } } };
writeJson(path.join(repoRoot, 'results/e14/dev/s2-p0.json'), out);
console.log(`wrote results/e14/dev/s2-p0.json: ${strata.map((s) => `${s.regime} (${s.from}, n ${s.n})`).join(', ')}`);
