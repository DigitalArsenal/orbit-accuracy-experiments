#!/usr/bin/env node
// E2b step 05: read the window's element sets for every E2b object once and
// cache them in runs/cache (common.mjs windowSets), so parallel steps share
// one read. Writes nothing else.
//   node experiments/e2b-correlated-covariance/steps/05-sets.mjs --window train
import { cli, allObjects, windowSets } from '../common.mjs';

const { window, archive, reference } = cli();
const objects = allObjects(reference);
const started = performance.now();
const { byObject } = windowSets(archive, reference, window, objects);
const n = [...byObject.values()].reduce((a, l) => a + l.length, 0);
console.log(`${window.name}: ${objects.length} objects, ${byObject.size} with sets, ${n} sets (${((performance.now() - started) / 1000).toFixed(0)} s)`);
