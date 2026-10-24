// Amendment A8: windows prepared for SDN-GP in the regimes SGP4 and SGP4-XP do not describe (lunar, cislunar, heliocentric), so that
// they score as soon as side B's regime extensions exist. For every truth pack under <store>/pack/ (lib/packs.mjs) this step lists the fit
// windows by the rule of its regime (below), writes results/.../regime-windows.json (pack descriptions, window starts and counts, hashes:
// no states), and can export one window's fit span as a $OEM for SDN-GP to fit:
//   node experiments/sdn-gp-starlink-ffm-match/regime-windows.mjs                      # list windows, write the results file
//   node experiments/sdn-gp-starlink-ffm-match/regime-windows.mjs --export <pack> --start <ISO> --fit-hours <h> --out <file.oem>
// The scorer is score-pack.mjs. Rules (PLAN A8): Moon-centred (LRO, Danuri): fits of 24 h and 72 h every 48 h, held-out days 1 to 3;
// Earth-centred cislunar transfers (Artemis I, Artemis II): fit 24 h every 48 h, held-out days 1 to 3; libration and distant-retrograde
// segments (CAPSTONE, Artemis I around the Moon): fit 14 d, held-out days 1 to 7, a window every 7 d (every 4 d for the 25 d of Artemis I);
// heliocentric cruise: fit 30 d, held-out 15 d (no pack yet: the Psyche, Lucy and Juno kernels are SPK type 1, which files/orbit-products
// 0.1.4 does not read, and Horizons for them is not approved). A window needs 90 % of its states in the fit span and in every held-out day.
import fs from 'node:fs';
import path from 'node:path';
import { results, write, args, frozen } from './common.mjs';
import { listPacks, readPack } from './lib/packs.mjs';
import { oemBytes } from './lib/sds.mjs';
import { DAY, ms, iso, slice } from './lib/windows.mjs';

const H = 3600000;
export const RULES = {
  'lro-lunar': { regime: 'lunar', fitHours: [24, 72], strideHours: 48, leadDays: [1, 2, 3] },
  'danuri-lunar': { regime: 'lunar', fitHours: [24, 72], strideHours: 48, leadDays: [1, 2, 3] },
  'artemis2-cislunar': { regime: 'cislunar-transfer', fitHours: [24], strideHours: 48, leadDays: [1, 2, 3] },
  'artemis1-cislunar': { regime: 'cislunar-transfer', fitHours: [24], strideHours: 48, leadDays: [1, 2, 3] },
  'capstone-nrho': { regime: 'cislunar-libration', fitHours: [336], strideHours: 168, leadDays: [1, 2, 3, 4, 5, 6, 7] },
  'artemis1-lunar': { regime: 'cislunar-libration', fitHours: [336], strideHours: 96, leadDays: [1, 2, 3, 4, 5, 6, 7] },
};
export const HELIOCENTRIC = { regime: 'heliocentric-cruise', fitHours: [720], leadDays: Array.from({ length: 15 }, (_, i) => i + 1), packs: 'none yet: SPK type 1 (Psyche, Lucy, Juno) is not readable by files/orbit-products 0.1.4' };
const frameLabel = (meta) => (/ICRF/.test(meta.axes ?? '') ? 'ICRF' : 'J2000');

/** Window starts (ms) of one pack for one fit length by the pack's rule; only windows with 90 % of the states in every span. */
export function windowsOf(object, rule, fitHours) {
  const first = object.t[0], last = object.t.at(-1);
  const gaps = Array.from(object.t.slice(1), (t, i) => t - object.t[i]).sort((a, b) => a - b); // median over the whole series: some kernels are denser at the start
  const step = gaps[Math.floor(gaps.length / 2)];
  const out = [];
  for (let start = first; start + fitHours * H + rule.leadDays.at(-1) * DAY <= last + 1; start += rule.strideHours * H) {
    const fitStates = slice(object, start, start + fitHours * H).length;
    let ok = fitStates >= 0.9 * (fitHours * H) / step;
    for (const k of rule.leadDays) {
      const a = start + fitHours * H + (k - 1) * DAY;
      if (slice(object, a + 1, a + DAY).length < 0.9 * DAY / step) ok = false;
    }
    if (ok) out.push({ startMs: start, fitStates });
  }
  return { step: step / 1000, starts: out };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  frozen();
  if (args.export) {
    const { meta, object } = readPack(args.export);
    const start = ms(args.start), stop = start + Number(args['fit-hours']) * H;
    const lines = slice(object, start, stop);
    const bytes = oemBytes({ originator: 'G1 truth pack', block: { frame: frameLabel(meta), center: meta.center.toUpperCase(), timeSystem: 'UTC', object: { name: meta.name, id: '', norad: 0 }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStart: lines[0].epoch, useableStop: lines.at(-1).epoch } });
    fs.writeFileSync(args.out, bytes);
    console.error(`${args.export}: ${lines.length} states ${lines[0].epoch} to ${lines.at(-1).epoch}, centre ${meta.center}, frame ${frameLabel(meta)}, written to ${args.out}`);
    process.exit(0);
  }
  const packs = [], windows = {};
  for (const name of listPacks()) {
    const rule = RULES[name];
    const { meta, object } = readPack(name);
    packs.push({ name, regime: rule?.regime ?? null, center: meta.center, axes: meta.axes, frameLabel: frameLabel(meta), source: meta.source ?? (meta.kernel ? `NAIF SPK ${meta.kernel}` : null), states: meta.states, startUtc: meta.startUtc, stopUtc: meta.stopUtc, sha256: meta.sha256, sourceFiles: meta.sourceFiles ?? null, note: meta.note ?? null });
    if (!rule) continue;
    windows[name] = { rule: { fitHours: rule.fitHours, strideHours: rule.strideHours, leadDays: rule.leadDays }, byFit: {} };
    for (const fitHours of rule.fitHours) {
      const w = windowsOf(object, rule, fitHours);
      windows[name].byFit[fitHours] = { stepSeconds: w.step, count: w.starts.length, startsUtc: w.starts.map((x) => iso(x.startMs)) };
      console.error(`${name}: fit ${fitHours} h, ${w.starts.length} windows (${w.step} s states)`);
    }
  }
  const out = { generatedFrom: 'truth packs under the local store (statistics and window starts only)', packs, windows, heliocentric: HELIOCENTRIC };
  write(path.join(results, 'regime-windows.json'), out);
  console.error(`regime-windows.json: ${packs.length} packs, ${Object.values(windows).reduce((a, w) => a + Object.values(w.byFit).reduce((b, x) => b + x.count, 0), 0)} windows`);
}
