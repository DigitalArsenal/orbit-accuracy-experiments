// Amendment A5: SGP4 and SGP4-XP on the Earth-centred highly elliptical orbits in the NAIF kernels (THEMIS A, D, E; Chandra;
// the high-Earth-orbit checkout of Artemis II), with the radial / in-track / cross-track split. States from
// files/orbit-products, epochs from foundation/time. One JSON line per window under <store>/rows/<source>.jsonl.
//   node experiments/sdn-gp-starlink-ffm-match/spk-windows.mjs [--source heo-themis,heo-chandra,heo-artemis2,heo-tess]
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, args } from './common.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines, scoreWindow } from './lib/baselines.mjs';
import { openContainers } from './lib/containers.mjs';
import { openTime } from './lib/timeconv.mjs';
import { KERNELS, A5, A8, spkObject, spkObjectSeries } from './lib/spk-sources.mjs';
import { windowStarts, ms, iso } from './lib/windows.mjs';


const wanted = new Set((args.source ?? 'heo-themis,heo-chandra,heo-artemis2,heo-tess').split(','));
const FILES = (dir) => ({
  themis: (letter) => path.join(dir, `themis/THEMIS_${letter}_2013_039_055.bsp`),
  chandra: path.join(dir, 'chandra/chandra_merged.bsp'),
  artemis2: path.join(dir, 'artemis2/art002_rec_260402_260410_jsc_bet_revf.bsp'),
});

frozen();
const modules = modulesRoot();
const containers = await openContainers(modules), time = await openTime(modules), b = await openBaselines(modules);
const files = FILES(KERNELS(config.archive));
fs.mkdirSync(path.join(store, 'rows'), { recursive: true });

async function run(source, objects, fits, { leadDays = [1, 2, 3], minCoverage = config.windows.minimumCoverage, stride = A5.strideSeconds } = {}) {
  const file = path.join(store, 'rows', `${source}.jsonl`);
  const done = new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.id}|${r.startUtc}|${r.fitSeconds}`; }) : []);
  let n = 0;
  for (const object of objects) {
    for (const hours of fits) {
      const fitSeconds = hours * 3600;
      for (const start of windowStarts(object, { fitSeconds, strideSeconds: stride, minLeadDays: leadDays.length ? 1 : 0.4 })) {
        if (done.has(`${object.id}|${iso(start)}|${fitSeconds}`)) continue;
        const row = await scoreWindow(b, object, start, { fitSeconds, leadDays, minCoverage });
        if (!row) continue;
        fs.appendFileSync(file, `${JSON.stringify(row)}\n`);
        n += 1;
      }
    }
  }
  console.error(`${source}: ${n} new windows`);
}

if (wanted.has('heo-themis')) {
  const objects = [];
  for (const [letter, target] of A5.themis.objects) objects.push(await spkObject(modules, { file: files.themis(letter), source: 'heo-themis', id: `THEMIS-${letter} (${target})`, name: `THEMIS-${letter}`, norad: 99000 - target, fromUtc: A5.themis.span[0], toUtc: A5.themis.span[1], containers, time }));
  await run('heo-themis', objects, A5.fitHours);
}
if (wanted.has('heo-chandra')) {
  const chandra = await spkObject(modules, { file: files.chandra, source: 'heo-chandra', id: 'Chandra (-151)', name: 'CHANDRA', norad: 99151, fromUtc: A5.chandra.span[0], toUtc: A5.chandra.span[1], containers, time });
  await run('heo-chandra', [chandra], A5.fitHours);
}
if (wanted.has('heo-tess')) { // amendment A8b: TESS from the MAST definitive ephemeris files
  const dir = path.join(config.archive, 'hac/mast-tess/models');
  const names = fs.readdirSync(dir).filter((f) => /^TESS_EPH_DEF_\d{7}_\d+\.bsp$/.test(f)).sort();
  const tess = await spkObjectSeries(modules, { files: names.map((f) => path.join(dir, f)), source: 'heo-tess', id: 'TESS (-95)', name: 'TESS', norad: A8.tess.norad, fromUtc: A8.tess.span[0], toUtc: A8.tess.span[1], stride: A8.tess.stride, containers, time });
  console.error(`heo-tess: ${tess.lines.length} states ${tess.lines[0].epoch} to ${tess.lines.at(-1).epoch} from ${names.length} files`);
  await run('heo-tess', [tess], A5.fitHours);
}
if (wanted.has('heo-artemis2')) {
  const orion = await spkObject(modules, { file: files.artemis2, source: 'heo-artemis2', id: 'Artemis II HEO checkout (-24)', name: 'ARTEMIS-II', norad: 99024, fromUtc: A5.artemis2.span[0], toUtc: A5.artemis2.span[1], containers, time });
  const file = path.join(store, 'rows/heo-artemis2.jsonl');
  const row = await scoreWindow(b, orion, orion.t[0], { fitSeconds: A5.artemis2.fitHours * 3600, leadDays: [1], minCoverage: A5.artemis2.minCoverage });
  if (row) fs.writeFileSync(file, `${JSON.stringify(row)}\n`);
  console.error(`heo-artemis2: ${orion.lines.length} states, ${row ? 'scored' : 'no window'}`);
}
await containers.destroy(); await time.destroy(); await b.close();
process.exit(0);
