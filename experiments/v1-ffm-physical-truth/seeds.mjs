// V1's seeds: precise-orbit states (analysis/reference-states $OEM output) and
// the truth at each horizon, selected as PLAN.md section 2 describes. Shared
// by run.mjs and the site build, so both use the same seeds.
import fs from 'node:fs';
import path from 'node:path';
import { decodeOemStream } from '../../harness/records.mjs';
import { sha256 } from '../../harness/modules.mjs';

export const HOUR_MS = 3600000;
export const utcMs = (iso) => Date.parse(/Z$/.test(iso) ? iso : `${iso}Z`);

// One object's states from a list of $OEM files: Map(utc ms -> {epoch, position, velocity}).
export function readArc(referenceDir, files, onInput = () => {}) {
  const byTime = new Map();
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(referenceDir, file));
    onInput(file, sha256(bytes));
    for (const line of decodeOemStream(new Uint8Array(bytes))[0].EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES) {
      byTime.set(utcMs(line.EPOCH), { epoch: line.EPOCH.replace(/Z$/, ''), position: [line.X, line.Y, line.Z], velocity: [line.X_DOT, line.Y_DOT, line.Z_DOT] });
    }
  }
  return byTime;
}

// [{group, object, norad, arc, seed, targets: [{hours, truth}], params, states}]
export function selectSeeds(config, referenceDir, { quick = false, log = () => {}, onInput } = {}) {
  const dirs = fs.readdirSync(referenceDir).sort();
  const seeds = [];
  for (const o of config.slr.objects) {
    for (const arc of config.slr.arcs) {
      const product = dirs.find((d) => d.startsWith(`ilrsa.orb.${o.name}.${arc}`));
      if (!product) { log(`missing ILRS arc ${o.name} ${arc}`); continue; }
      const states = readArc(referenceDir, [path.join(product, `${o.norad}.oem`)], onInput);
      const t0 = Math.min(...states.keys());
      for (const offset of config.slr.seedOffsetsHours) {
        const start = t0 + offset * HOUR_MS;
        const targets = config.horizonsHours.map((h) => ({ hours: h, truth: states.get(start + h * HOUR_MS) })).filter((t) => t.truth);
        if (!states.has(start) || targets.length !== config.horizonsHours.length) { log(`skipped ${o.name} ${arc} +${offset} h: horizon not inside the arc`); continue; }
        const areaM2 = Math.PI * (o.diameterM / 2) ** 2;
        seeds.push({ group: 'SLR', object: o.name, norad: o.norad, arc, product, seed: states.get(start), targets, params: { massKg: o.massKg, areaM2, cr: o.cr }, states });
      }
    }
  }
  const igs = dirs.filter((d) => d.startsWith(config.gps.productPrefix));
  const gpsObjects = [...new Set(igs.flatMap((d) => JSON.parse(fs.readFileSync(path.join(referenceDir, d, 'index.json'))).objects.map((o) => o.norad)))].sort((a, b) => a - b);
  for (const norad of quick ? gpsObjects.slice(0, 3) : gpsObjects) {
    const states = readArc(referenceDir, igs.filter((d) => fs.existsSync(path.join(referenceDir, d, `${norad}.oem`))).map((d) => path.join(d, `${norad}.oem`)), onInput);
    for (const day of config.gps.seedDays) {
      const start = [...states.keys()].sort((a, b) => a - b).find((t) => t >= Date.parse(`${day}T00:00:00Z`));
      const targets = config.horizonsHours.map((h) => ({ hours: h, truth: states.get(start + h * HOUR_MS) })).filter((t) => t.truth);
      if (start === undefined || targets.length !== config.horizonsHours.length) continue;
      seeds.push({ group: 'GPS', object: `gps-${norad}`, norad, arc: day, product: config.gps.productPrefix, seed: states.get(start), targets, params: { massKg: config.gps.massKg, areaM2: config.gps.areaM2, cr: config.gps.cr }, states });
    }
  }
  return seeds;
}
