// The merged truth roots of the run directory (PLAN section 3): symlink farms over V1c5's refreshed truth (main) and the archive's COSMIC-2 products
// (leo), plus the products fetched for the rescore that they lack (the first source wins on a name clash). Reading and linking only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { config } from './common.mjs';

function farm(target, sources) {
  fs.mkdirSync(target, { recursive: true });
  const added = {};
  for (const { dir, names, label } of sources) {
    added[label] = 0;
    for (const name of names) {
      const link = path.join(target, name);
      if (fs.existsSync(link)) continue;
      fs.symlinkSync(path.join(dir, name), link); added[label]++;
    }
  }
  return { products: fs.readdirSync(target).length, added };
}
export function mergeTruth(runDir) {
  const fetched = path.join(runDir, 'truth/reference'), names = fs.readdirSync(fetched);
  const { v1c5Refreshed, archiveLeo } = config.truth.merged;
  const list = dir => ({ dir, names: fs.readdirSync(dir) });
  const main = farm(path.join(runDir, 'truth/main'), [{ ...list(v1c5Refreshed), label: 'v1c5Refreshed' }, { dir: fetched, names: names.filter(n => !n.startsWith('leoOrb_')), label: 'fetched' }]);
  const leo = farm(path.join(runDir, 'truth/leo'), [{ ...list(archiveLeo), label: 'archive' }, { dir: fetched, names: names.filter(n => n.startsWith('leoOrb_')), label: 'fetched' }]);
  assert(main.products > 0 && leo.products > 0);
  return { main, leo };
}
