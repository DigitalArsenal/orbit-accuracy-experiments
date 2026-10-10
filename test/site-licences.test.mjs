// The site publishes only what data/licenses.json lets us reproduce, labelled
// with each source's own licence; its VCM is synthetic and reads in the real
// analysis/vcm-adapter.
//
//   SDN_MODULES_ROOT=<modules checkout> npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadModule, modulesRoot } from '../harness/modules.mjs';
import { labelFor } from '../harness/data-licenses.mjs';
import { repoRoot } from '../harness/provenance.mjs';
import { syntheticVcm } from '../site/synthetic-vcm.mjs';

test('the site refuses sources that may not be reproduced and labels the rest by their own terms', () => {
  for (const id of ['celestrak', 'set-jb2008', 'sds-vcm-sample', 'esa-earth-observation', 'esa-navigation-office-pod']) {
    assert.throws(() => labelFor([id]), /may not be reproduced/, id);
  }
  const iers = labelFor(['iers']);
  assert.ok(!/^MIT/.test(iers.license), 'IERS rows are not MIT');
  assert.match(iers.license, /finals2000A/);
  assert.match(iers.credit, /IERS Earth Orientation Centre/);
});

const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'experiments/v1-hpop-physical-truth/config.json'), 'utf8'));
const modules = modulesRoot({ configured: config.inputs.modules, repoRoot });
const haveAdapter = fs.existsSync(path.join(modules, 'analysis/vcm-adapter/dist/isomorphic/module.wasm'));
test('the synthetic VCM is marked SYNTHETIC and reads in analysis/vcm-adapter', { skip: haveAdapter ? false : 'no built analysis/vcm-adapter' }, async (t) => {
  const adapter = await loadModule(modules, 'analysis/vcm-adapter');
  t.after(() => adapter.destroy());
  const { text, report } = await syntheticVcm(adapter);
  assert.match(text.split('\n').slice(0, 3).join('\n'), /SYNTHETIC/);
  assert.deepEqual(report.dynamicParameters, ['DRAG_AREA_OVER_MASS']);
  for (let i = 0; i < 3; ++i) assert.ok(Math.abs(report.recomputedUvwSigmasKm[i] / report.statedUvwSigmasKm[i] - 1) < 0.01);
});
