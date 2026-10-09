#!/usr/bin/env node
// E4 step 05: truth for the GNSS providers (PLAN.md section 2): the final
// orbits in config.truth for every day of its window, downloaded from the
// public archives and converted to GCRF reference states by the modules.
// Output (ignored): runs/cache/e4-truth/{products,reference/<product>/<norad>.oem,index.json},
// the layout harness/reference.mjs reads.
//
//   node experiments/e4-operator-ephemeris-parity/steps/05-truth.mjs [--truth DIR]
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { startRun } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { DAY_MS, cli, config, configPath } from '../common.mjs';
import { gnssIdentities, sp3Context } from '../sp3.mjs';

const { values, modules, truth } = cli();
const run = startRun({ experiment: config.experiment, step: '05-truth', configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const sinex = fs.readFileSync(config.inputs.satelliteMetadata);
run.addInputs('satelliteMetadata', { [config.inputs.satelliteMetadata]: sha256(sinex) });
const ctx = await sp3Context(modules, run, config.inputs.eopFinals);

async function download(url, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  for (let attempt = 1; attempt <= 3; ++attempt) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) }).catch((error) => ({ ok: false, status: error.message }));
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes);
      return bytes;
    }
    if (response.status === 404) return null;
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
  return null;
}

const report = { products: {}, missing: [] };
for (const [product, spec] of Object.entries(config.truth.products)) {
  report.products[product] = { days: 0, objects: 0 };
  for (let day = Date.parse(`${config.truth.from}T00:00:00Z`); day <= Date.parse(`${config.truth.to}T00:00:00Z`); day += DAY_MS) {
    const d = new Date(day), doy = Math.round((day - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS) + 1;
    const week = Math.floor((day - Date.UTC(1980, 0, 6)) / (7 * DAY_MS));
    const yyyyddd = `${d.getUTCFullYear()}${String(doy).padStart(3, '0')}`;
    const url = spec.url.replace('{week}', week).replace('{yyyyddd}', yyyyddd).replace('{yyyy}', d.getUTCFullYear());
    const name = path.basename(new URL(url).pathname);
    const gz = await download(url, path.join(truth, 'products', name));
    if (!gz) { report.missing.push(url); log(`not available: ${url}`); continue; }
    const satellites = Object.fromEntries(Object.entries(gnssIdentities(sinex.toString(), day + DAY_MS / 2)).filter(([prn]) => spec.systems.includes(prn[0])));
    const key = name.replace('.SP3.gz', '');
    const dir = path.join(truth, 'reference', key);
    try {
      const objects = await ctx.convert(gunzipSync(gz), { product: name, source: url, satellites });
      fs.mkdirSync(dir, { recursive: true });
      const index = objects.map((o) => {
        fs.writeFileSync(path.join(dir, `${o.norad}.oem`), o.bytes);
        return { norad: o.norad, objectId: o.block.OBJECT.OBJECT_ID, start: o.block.START_TIME, stop: o.block.STOP_TIME, epochs: o.block.EPHEMERIS_DATA_LINES.length, file: `${o.norad}.oem`, comment: o.block.COMMENT };
      });
      fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify({ product: name, url, sha256: sha256(gz), identities: config.inputs.satelliteMetadata, identitiesSha256: sha256(sinex), objects: index }, null, 1)}\n`);
      run.addInputs('truth', { [name]: sha256(gz) });
      report.products[product].days += 1;
      report.products[product].objects += index.length;
      log(`${key}: ${index.length} objects`);
    } catch (error) {
      report.missing.push(`${url}: ${error.message}`);
      log(`${key}: ${error.message}`);
    }
  }
}
run.write('truth.json', report);
run.finish();
await ctx.destroy();
