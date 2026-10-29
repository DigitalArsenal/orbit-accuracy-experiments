#!/usr/bin/env node
// ca-screen-recall: POST-HOC diagnostic, written after the registered results were read (it is not in PLAN.md).
// Where do the screen's built-in SGP4 and the propagator/sgp4 module disagree? For every matched event of the
// pass-rule arm, both objects' states at the screen's TCA are compared (the screen's own against the module's) and
// binned by the size of the element set's BSTAR drag term and by the time since its epoch. Aggregates only.
//   node experiments/ca-screen-recall/parity-diagnostic.mjs --run <runs/ca-screen-recall/RUN> [--out FILE] [--modules DIR]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, id, readSnapshot, selectSubset, ommBytes, modulesRoot, pinnedModules } from './common.mjs';
import { openScreen, openSgp4 } from './access.mjs';
import { distribution } from './compare.mjs';

const { values } = parseArgs({ options: { run: { type: 'string' }, out: { type: 'string' }, modules: { type: 'string' } } });
if (!values.run) throw new Error('usage: parity-diagnostic.mjs --run <run directory> [--out FILE]');
const read = (f) => JSON.parse(fs.readFileSync(path.join(values.run, f), 'utf8'));
const events = read('screen-events.defaults.json'), matches = read('matches.defaults.json'), manifest = read('manifest.json');
if (manifest.mode !== 'registered') throw new Error('the diagnostic reads a registered run');

const snapshot = readSnapshot(), subset = selectSubset(snapshot.rows, config.selection);
const element = new Map(subset.objects.map((r) => [Number(r.NORAD_CAT_ID), r]));
const modules = modulesRoot(values.modules), pinned = pinnedModules(modules);
const screen = await openScreen({ modules, pinned, workDir: values.run }), sgp4 = await openSgp4({ modules, pinned });
const byKey = new Map(events.map((e) => [`${Math.min(e.primary, e.secondary)}-${Math.max(e.primary, e.secondary)}@${e.tcaJd}`, e]));

const BSTAR_BINS = [['BSTAR under 0.001', 0, 1e-3], ['BSTAR 0.001 to 0.01', 1e-3, 1e-2], ['BSTAR 0.01 to 0.1', 1e-2, 1e-1], ['BSTAR 0.1 or more', 1e-1, Infinity]];  // absolute value of BSTAR
const AGE_BINS = [['0 to 1 day', 0, 1], ['1 to 2 days', 1, 2], ['2 to 3 days', 2, 3], ['3 to 4 days', 3, 4], ['4 days and more', 4, Infinity]];
const bstarBin = (b) => BSTAR_BINS.find(([, lo, hi]) => Math.abs(b) >= lo && Math.abs(b) < hi)[0];
const ageBin = (a) => AGE_BINS.find(([, lo, hi]) => a >= lo && a < hi)[0];
const rows = [], perEvent = [];
try {
  await sgp4.ingest(subset.objects.map((gp) => ommBytes(screen.flatc, screen.ommSchema, gp)));
  for (const m of matches) {
    const e = byKey.get(`${m.pair[0]}-${m.pair[1]}@${m.screenTcaJd}`);
    if (!e) throw new Error(`no screen event for ${m.pair} at ${m.screenTcaJd}`);
    const states = await sgp4.state({ jd: e.tcaJd, numbers: [e.primary, e.secondary] });
    const eventRows = [];
    for (const [num, st] of [[e.primary, e.primaryState], [e.secondary, e.secondaryState]]) {
      const ref = states.get(num), el = element.get(num);
      const epochJd = Date.parse(`${el.EPOCH}Z`) / 86400000 + 2440587.5;
      const row = { norad: num, name: el.OBJECT_NAME, positionM: Math.hypot(st.pos[0] - ref.pos[0], st.pos[1] - ref.pos[1], st.pos[2] - ref.pos[2]),
        velocityMS: Math.hypot(st.vel[0] - ref.vel[0], st.vel[1] - ref.vel[1], st.vel[2] - ref.vel[2]), bstar: bstarBin(Number(el.BSTAR)), age: ageBin(e.tcaJd - epochJd), tcaJd: e.tcaJd };
      rows.push(row); eventRows.push(row);
    }
    // The screen's miss is the distance of its two states; the reference's, of the module's two. They cannot differ by more
    // than the two objects' state differences (plus the second-order effect of a millisecond between the two TCAs).
    perEvent.push({ pair: m.pair, band: m.band, tcaJd: e.tcaJd, referenceMissM: m.referenceMissM, dMissM: m.screenMissM - m.referenceMissM, objects: eventRows });
  }
} finally { await screen.destroy(); await sgp4.destroy(); }

const summarize = (bins, key) => bins.map(([label]) => {
  const r = rows.filter((x) => x[key] === label);
  return { bin: label, objectStates: r.length, objects: new Set(r.map((x) => x.norad)).size, positionM: distribution(r.map((x) => x.positionM)), velocityMS: distribution(r.map((x) => x.velocityMS)) };
});
const flagged = matches.filter((m) => Math.abs(m.screenTcaJd - m.referenceTcaJd) * 86400 > config.comparison.flag.tcaSeconds || Math.abs(m.screenMissM - m.referenceMissM) > config.comparison.flag.missM);
const heavy = new Set(rows.filter((x) => x.bstar === BSTAR_BINS[2][0] || x.bstar === BSTAR_BINS[3][0]).map((x) => x.norad));
const out = {
  note: 'post-hoc diagnostic written after the registered results were read; not part of PLAN.md',
  run: path.basename(values.run), objectStates: rows.length, positionM: distribution(rows.map((x) => x.positionM)), velocityMS: distribution(rows.map((x) => x.velocityMS)),
  byBstar: summarize(BSTAR_BINS, 'bstar'), byAgeAtEvent: summarize(AGE_BINS, 'age'),
  largest: [...rows].sort((a, b) => b.positionM - a.positionM).slice(0, 10).map((x) => ({ norad: x.norad, name: x.name, positionM: x.positionM, velocityMS: x.velocityMS, bstar: x.bstar, ageAtEvent: x.age, tcaUtc: new Date((x.tcaJd - 2440587.5) * 86400000).toISOString() })),
  flaggedEvents: { count: flagged.length, withAnObjectOf: 'BSTAR 0.01 or more', withHeavyDrag: flagged.filter((m) => heavy.has(m.pair[0]) || heavy.has(m.pair[1])).length },
  tcaDifferencesAbove10ms: matches.filter((m) => Math.abs(m.screenTcaJd - m.referenceTcaJd) * 86400 > 0.01).map((m) => ({ pair: m.pair, band: m.band, referenceMissM: m.referenceMissM,
    relativeSpeedMS: byKey.get(`${m.pair[0]}-${m.pair[1]}@${m.screenTcaJd}`).relSpeedMS, dtSeconds: (m.screenTcaJd - m.referenceTcaJd) * 86400, dMissM: m.screenMissM - m.referenceMissM })),
  missDifferenceVersusStateDifferences: (() => {
    const slackM = 1, sums = perEvent.map((x) => x.objects[0].positionM + x.objects[1].positionM);
    const large = perEvent.map((x, n) => ({ x, sum: sums[n] })).filter(({ x }) => Math.abs(x.dMissM) > config.comparison.flag.missM);
    const top = [...perEvent.map((x, n) => ({ x, sum: sums[n] }))].sort((a, b) => Math.abs(b.x.dMissM) - Math.abs(a.x.dMissM)).slice(0, 10);
    const describe = ({ x, sum }) => ({ pair: x.pair, band: x.band, tcaUtc: new Date((x.tcaJd - 2440587.5) * 86400000).toISOString(), referenceMissM: x.referenceMissM, missDifferenceM: x.dMissM,
      objects: x.objects.map((o) => ({ norad: o.norad, name: o.name, bstar: o.bstar, positionM: o.positionM })), sumOfStateDifferencesM: sum });
    return { slackM, events: perEvent.length, withinStateDifferences: perEvent.filter((x, n) => Math.abs(x.dMissM) <= sums[n] + slackM).length,
      eventsWithMissDifferenceAbove: config.comparison.flag.missM, largeMissDifferenceEvents: large.length,
      largeWithAnObjectOfBstar0001OrMore: large.filter(({ x }) => x.objects.some((o) => o.bstar !== BSTAR_BINS[0][0])).length,
      largeRatioToStateDifferences: distribution(large.map(({ x, sum }) => Math.abs(x.dMissM) / sum)),
      largest: top.map(describe) };
  })(),
  matchedEventsWithHeavyDragObject: matches.filter((m) => heavy.has(m.pair[0]) || heavy.has(m.pair[1])).length, matchedEvents: matches.length,
};
const target = values.out ?? path.join(values.run, 'parity-diagnostic.json');
fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ target, objectStates: out.objectStates, byBstar: out.byBstar.map((b) => [b.bin, b.objectStates, b.positionM.median, b.positionM.max]), flagged: out.flaggedEvents }));
process.exit(0);
