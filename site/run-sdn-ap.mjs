#!/usr/bin/env node
// The SDN-AP paper's held-out model (section 12.3), the part the page cannot
// run in the browser: SGP4 fits from analysis/gp-error-model and every
// propagator's covariance (propagator/sdn-ap's sdnap_covariance_at for SDN-AP
// and SGP4-XP, propagator/ffm-v1 with fitted process noise for FFM, the
// error model's population covariance for SGP4), the module's measured
// realism on LAGEOS-1 and the paper's 12.3 row (build-models.mjs
// generateSdnAp). Reads a build of this tree (site/dist: the served modules,
// truth, seeds, kernel and Earth orientation); writes
// site/generated/sdn-ap-held-out.json, which build.mjs publishes.
//
//   node site/build.mjs            (stops at the SDN-AP step the first time; site/dist holds the inputs)
//   node site/run-sdn-ap.mjs --modules <modules checkout at the pinned SDN-AP commit> --paper <sdn-ap checkout>
//   node site/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generateSdnAp } from './build-models.mjs';
import { pinnedModules } from './module-list.mjs';
import { gitState } from '../harness/modules.mjs';
import { PAPER_SOURCES } from './src/models/registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: { modules: { type: 'string' }, paper: { type: 'string' } } });
const modules = path.resolve(values.modules ?? process.env.SDN_AP_MODULES ?? '');
const pin = pinnedModules.find((m) => m.path === 'propagator/sdn-ap');
const at = gitState(modules).commit;
if (at !== pin.commit) throw new Error(`--modules ${modules} is at ${at}; the site pins propagator/sdn-ap at ${pin.commit}`);
const outside = PAPER_SOURCES['sdn-ap'];
const paperFile = path.join(path.resolve(values.paper ?? process.env[outside.env] ?? ''), outside.file);
const started = performance.now();
const data = await generateSdnAp({ dist: path.join(here, 'dist'), modules, paperFile });
fs.writeFileSync(path.join(here, 'generated/sdn-ap-held-out.json'), `${JSON.stringify(data)}\n`);
console.log(`run-sdn-ap: ${data.windows.length} LAGEOS-1 windows, ${Object.keys(data.windows[0].envelopes).join(', ')} envelopes; ${((performance.now() - started) / 1000).toFixed(1)} s`);
process.exit(0);
