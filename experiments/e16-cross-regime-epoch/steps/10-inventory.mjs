// Step 10, the inventory (PLAN.md 5.4, 6.5, 11 step 2): every object of every regime class, its orbit summary from the
// train window's element sets, its SINEX block or Planet family, its folds in every tier, and the Q2 objects. Reads
// identities (truth indexes, Planet's crosswalks of the train and validation windows, the IGS SINEX, E13's Planet
// sample) and train-window element sets only; computes no error.
//
//   node experiments/e16-cross-regime-epoch/steps/10-inventory.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { startRun } from '../../../harness/provenance.mjs';
import { readGpsMetadata } from '../../e7-full-force-handoff/gnss.mjs';
import { config, configPath, modulesRoot, repoRoot, resultsDir, sha256, windowSpan } from '../common.mjs';
import { MultiProducts, planetFamily } from '../truth.mjs';
import { byObject, windowSets } from '../sets.mjs';
import { foldsO, gnssGeneration, gnssPlanes, orbitClassOf, orbitSummary, sp3System, stratumOf, tiersOf } from '../objects.mjs';

const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const run = startRun({ experiment: config.experiment, step: '10-inventory', configPath, modulesDir: modulesRoot(), args: process.argv.slice(2) });

// ── Identities ──
// Planet: every satellite in the crosswalks of the train and validation windows (names and NORAD numbers only).
const planet = new Map();   // norad -> {name, hwids}
const crossFiles = {};
for (const name of fs.readdirSync(config.inputs.planetDir).filter((n) => /^planet_mc_\d{8}\.tle$/.test(n)).sort()) {
  const day = `${name.slice(10, 14)}-${name.slice(14, 16)}-${name.slice(16, 18)}`;
  if (day < config.windows.train[0] || day > config.windows.validation[1]) continue;
  const bytes = fs.readFileSync(path.join(config.inputs.planetDir, name));
  crossFiles[name] = sha256(bytes);
  const lines = bytes.toString('utf8').split(/\r?\n/);
  for (let i = 0; i + 1 < lines.length; ++i) {
    if (!lines[i].startsWith('0 ') || !lines[i + 1].startsWith('1 ')) continue;
    const words = lines[i].trim().split(/\s+/);
    const norad = Number(lines[i + 1].slice(2, 7));
    if (!norad) continue;   // early days after a launch carry NORAD 0: no identity yet
    const entry = planet.get(norad) ?? { name: words.slice(1, -1).join(' '), hwids: new Set() };
    entry.hwids.add(words.at(-1).toLowerCase());
    planet.set(norad, entry);
  }
}
run.addInputs('planetCrosswalk', crossFiles);
log(`Planet: ${planet.size} satellites in the crosswalks of ${Object.keys(crossFiles).length} days`);

// Converted precise orbits: the configured objects, and every GNSS satellite ESA or GFZ carries.
const objects = [];
for (const [cls, r] of Object.entries(config.regimes)) {
  if (r.truth === 'planet') {
    for (const [norad, p] of planet) objects.push({ norad, name: p.name, regimeClass: cls, group: r.group, family: planetFamily(p.name) });
    continue;
  }
  const products = new MultiProducts(config.inputs.referenceRoots, r.prefixes, r.fallbackPrefixes ?? []);
  if (r.objects) {
    for (const [norad, name] of Object.entries(r.objects)) {
      const n = Number(norad);
      if (products.entries(n).length) objects.push({ norad: n, name, regimeClass: cls, group: r.group });
      else log(`${cls} ${name} (${n}): no converted product; not an E16 object`);
    }
    continue;
  }
  if (cls !== 'GNSS') continue;   // IGSO/GEO objects come from the same products and are split by orbit class below
  for (const norad of products.objects()) {
    const system = sp3System(products.entries(norad));
    if (r.systems.includes(system)) objects.push({ norad, name: null, regimeClass: 'GNSS', group: r.group, system });
  }
}
log(`${objects.length} candidate objects`);

// ── Orbit summaries from the train window's element sets ──
const train = windowSets('train', objects.map((o) => o.norad), { log });
run.addInputs('gpHistory', train.files);
const setsBy = byObject(train.sets);
const sinex = readGpsMetadata(config.inputs.gnssMetadata, { systems: ['G', 'E', 'R', 'C', 'J'] });
run.addInputs('gnssMetadata', { [path.basename(config.inputs.gnssMetadata)]: sinex.sha256 });
const kept = [];
for (const o of objects) {
  const [from, to] = windowSpan('train', o.regimeClass === 'GNSS' ? 'GNSS' : o.regimeClass);
  const lo = Date.parse(`${from}T00:00:00Z`), hi = Date.parse(`${to}T00:00:00Z`) + 86400000;
  const sets = (setsBy.get(o.norad) ?? []).filter((s) => s.epochMs >= lo && s.epochMs < hi);
  if (!sets.length) { o.excluded = 'no element set in the train window'; kept.push(o); continue; }
  Object.assign(o, orbitSummary(sets));
  if (o.group === 'MEO/GEO') {
    o.orbitClass = orbitClassOf(o);
    if (o.regimeClass === 'GNSS' && o.orbitClass !== 'MEO') o.regimeClass = 'IGSO/GEO';
    if (o.system) {
      const meta = sinex.at(o.norad, hi - 1);
      o.block = meta?.block ?? null;
      o.generation = gnssGeneration(o.system, o.block);
      o.name = meta ? `${o.system} SVN ${meta.svn} ${meta.block}` : `${o.system} (no SINEX entry)`;
    }
  } else {
    o.orbitClass = 'LEO';
  }
  o.objectId = sets[0].objectId ?? null;
  kept.push(o);
}
const active = kept.filter((o) => !o.excluded);
log(`${active.length} objects with train-window element sets; ${kept.length - active.length} without`);

// ── Folds ──
for (const o of active) o.stratum = stratumOf(o);
const foldO = new Map([...foldsO(active.filter((o) => o.group === 'LEO')), ...foldsO(active.filter((o) => o.group === 'MEO/GEO'))]);
const planes = gnssPlanes(active, setsBy, config.windows.trainGnssMeo[0]);
for (const o of active) o.tiers = tiersOf(o, { foldO: foldO.get(o.norad), plane: planes.get(o.norad) });

// ── Q2 objects (PLAN.md 6.5) ──
const q2 = config.q2;
const e13 = JSON.parse(fs.readFileSync(path.join(repoRoot, config.inputs.e13.sample), 'utf8'));
const hwidToNorad = new Map([...planet].flatMap(([norad, p]) => [...p.hwids].map((h) => [h, norad])));
const e13Calibration = new Set(e13.calibration.map((h) => hwidToNorad.get(String(h).toLowerCase())).filter(Boolean));
const e13HeldOut = e13.heldOut.map((h) => hwidToNorad.get(String(h).toLowerCase())).filter(Boolean);
const e13Sample = new Set([...e13Calibration, ...e13HeldOut]);
const draw = (list, n) => list.map((o) => ({ o, h: crypto.createHash('sha256').update(`${q2.planet.salt}:${o.norad}`).digest('hex') })).sort((a, b) => a.h.localeCompare(b.h)).slice(0, n).map((x) => x.o);
const planetActive = active.filter((o) => o.regimeClass === 'LEO-PL');
// E13's calibration satellites (Doves, two Pelicans and a Tanager) calibrate E13's correction: never Q2 objects.
const eligible = planetActive.filter((o) => !e13Calibration.has(o.norad));
const q2Objects = [
  ...active.filter((o) => (o.regimeClass === 'LEO-POD' || o.regimeClass === 'SLR-LEO') && o.meanMotion >= q2.objectsMinimumMeanMotionRevPerDay),
  ...eligible.filter((o) => e13HeldOut.includes(o.norad)),
  ...draw(eligible.filter((o) => o.family === 'SkySat'), q2.planet.skysat),
  ...draw(eligible.filter((o) => o.family === 'Pelican and Tanager'), q2.planet.pelicanTanager),
  ...draw(eligible.filter((o) => o.family === 'SuperDove' && !e13Sample.has(o.norad)), q2.planet.superdoveOutsideE13),
].filter((o, i, a) => a.findIndex((x) => x.norad === o.norad) === i);

// ── Output ──
const tally = (key) => Object.fromEntries([...new Set(active.map(key))].sort().map((k) => [k, active.filter((o) => key(o) === k).length]));
const inventory = {
  experiment: config.experiment, run: run.id, decided: new Date().toISOString(),
  rule: 'PLAN.md 5.4 and 6.5; config.json tiers and q2: identities, SINEX blocks, Planet families and train-window element-set fields only',
  counts: { byRegimeClass: tally((o) => o.regimeClass), byGroup: tally((o) => o.group), excluded: kept.length - active.length },
  e13: { calibrationSatellites: e13Calibration.size, heldOutSatellites: e13HeldOut.length },
  objects: kept.map((o) => ({
    norad: o.norad, name: o.name, objectId: o.objectId ?? null, regimeClass: o.regimeClass, group: o.group, system: o.system ?? null, block: o.block ?? null,
    generation: o.generation ?? null, family: o.family ?? null, orbitClass: o.orbitClass ?? null,
    meanMotion: o.meanMotion ?? null, inclination: o.inclination ?? null, trainSets: o.sets ?? 0, stratum: o.stratum ?? null, tiers: o.tiers ?? null, excluded: o.excluded ?? null,
  })),
  lateFoldRule: 'objects first seen after the inventory: tier O fold = salted-hash mod 5 (objects.mjs foldOLate); other tiers by the same rules',
  q2: q2Objects.map((o) => ({ norad: o.norad, name: o.name, regimeClass: o.regimeClass, family: o.family ?? null, meanMotion: o.meanMotion, e13HeldOut: e13HeldOut.includes(o.norad) })),
};
fs.mkdirSync(resultsDir, { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'inventory.json'), `${JSON.stringify(inventory, null, 1)}\n`);
run.write('inventory.json', inventory);
const m = run.finish({ objects: active.length, q2Objects: q2Objects.length });
fs.mkdirSync(path.join(resultsDir, 'manifests'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'manifests', `${m.run}.json`), `${JSON.stringify(m, null, 1)}\n`);
log(`inventory: ${JSON.stringify(inventory.counts.byRegimeClass)}; Q2 objects ${q2Objects.length}`);
