// E13 step 72 (EXPLORATORY, PLAN.md Amendment S3 items 5-7): Planet and Starlink on one reference (NRLMSISE-00), solved together and alone, and scored against satellites that were
// in no solve. Observations: Planet's live arcs (24 h; steps/74) and Starlink's pairs (7 h, the decaying strata and the clean-pair filters of S2 item 4(a)); one common mode on
// nodes every 6 h, a random-walk baseline per satellite, a robust scale per fleet (solveCommonMode's `group`). No density truth exists for these dates (Swarm and GRACE-FO
// densities of 2026-10-09 on arrive 49-92 days late); the scores are those of S3 item 6(a) and (b).
//
//   node steps/72-combined-solve.mjs [--through ISO] [--node-hours 6] [--history 4] [--latencies 1,6] [--bands all,450-700] [--prior-scale 1] [--out DIR]
//
// Written to results/e13/s3/combined-solve.json; the verdict is S3 item 7's literal rule.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { DAY, H, config, experimentDir, paths, readJson } from '../common.mjs';
import { arcsFromRows, solveCommonMode } from '../common-mode.mjs';
import { crossFleetAgreement, halves, heldOutRecords, hindcastR3 } from '../combined.mjs';
import { latencyStatistic } from '../score.mjs';

const { values } = parseArgs({ options: { through: { type: 'string' }, 'node-hours': { type: 'string', default: '6' }, history: { type: 'string', default: '4' }, latencies: { type: 'string', default: '1,6' }, bands: { type: 'string', default: 'all,450-700' },
  'prior-scale': { type: 'string', default: '1' }, out: { type: 'string' } } });
const S = config.analysis.solver;
const selection = readJson(path.join(repoRoot, 'results', 'e13', 'selection.json'));
const nodeHours = Number(values['node-hours']), historyDays = Number(values.history), latencies = values.latencies.split(',').map(Number), taus = config.analysis.forecast.tauHoursCandidates;
const through = values.through ? Date.parse(values.through) : Infinity;
const sampleFile = readJson(path.join(experimentDir, 'sample.json')), planetSample = readJson(path.join(experimentDir, 'planet-sample.json'));
const MINIMUM = { starlinkPairs: 100, planetArcs: 100 };

// ── observations ──
const liveFile = path.join(paths.planetArcs, `live-${config.planet.arc.profile}.jsonl`);
const planetRows = fs.existsSync(liveFile) ? fs.readFileSync(liveFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const planetAll = arcsFromRows(planetRows.filter((r) => Date.parse(r.utcB) <= through), { hwids: [...planetSample.calibration, ...planetSample.heldOut], maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly })
  .map((a) => ({ ...a, group: 'planet' }));
const starlinkAll = [];
const seen = new Set();
if (fs.existsSync(paths.pairs)) for (const dir of fs.readdirSync(paths.pairs)) for (const f of fs.readdirSync(path.join(paths.pairs, dir))) {
  const p = readJson(path.join(paths.pairs, dir, f));
  const key = `${p.norad}|${p.t1}`;
  if (p.kind !== 'e13-pair' || seen.has(key) || !p.methodB || Date.parse(p.t1) > through) continue;
  seen.add(key);
  const B = p.methodB.cdAreaOverMass;
  if (!(p.hoursBetween >= 5 && p.hoursBetween <= 9) || !sampleFile.satellites[p.norad]?.startsWith('decay') || !(B > 0.002 && B < 0.5) || !(Math.abs(p.methodB.checkMismatchJkg ?? 1e9) < 1) || !(p.energyJkg.predictedChange <= -20)) continue;
  starlinkAll.push({ dove: String(p.norad), startMs: Date.parse(p.t0), endMs: Date.parse(p.t1), y: Math.log(B), altKm: p.geodeticAltitudeKm?.oldT0 ?? NaN, group: 'starlink' });
}
console.log(`Planet: ${planetAll.length} live arcs of ${new Set(planetAll.map((a) => a.dove)).size} Doves; Starlink: ${starlinkAll.length} clean decaying-stratum pairs of ${new Set(starlinkAll.map((a) => a.dove)).size} satellites`);
if (planetAll.length < MINIMUM.planetArcs || starlinkAll.length < MINIMUM.starlinkPairs) { console.log(`too few for the combined analysis (${MINIMUM.planetArcs} Planet arcs and ${MINIMUM.starlinkPairs} Starlink pairs needed)`); process.exit(0); }

// ── solver ──
const smoothSigma = (selection.solver.smoothSigma ?? 0.05) * Math.sqrt(nodeHours / 24) * Number(values['prior-scale']);
const solver = { nodeHours, baseline: selection.solver.baseline, smoothSigma, huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
const BLOCK = 2 * DAY;
const results = [];
const f3 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? 'n/a' : x.toFixed(3));
const interval = (r) => (r?.lower === null || r?.lower === undefined ? '' : ` [${f3(r.lower)}, ${f3(r.upper)}]`);

for (const band of values.bands.split(',')) {
  const [lo, hi] = band === 'all' ? [-Infinity, Infinity] : band.split('-').map(Number);
  const starlink = starlinkAll.filter((a) => band === 'all' || (a.altKm >= lo && a.altKm < hi));
  if (starlink.length < MINIMUM.starlinkPairs) { console.log(`Starlink band ${band} km: ${starlink.length} pairs, skipped`); continue; }
  const fleets = { planet: planetAll, starlink };
  const everything = [...planetAll, ...starlink];
  const first = Math.min(...everything.map((a) => a.startMs)), last = Math.max(...everything.map((a) => a.endMs));
  const T0 = Math.floor(first / DAY) * DAY;
  const issues = [];
  for (let t0 = Math.ceil((first + historyDays * DAY) / (6 * H)) * 6 * H; t0 + 3 * DAY <= last; t0 += 6 * H) issues.push(t0);
  console.log(`\nStarlink band ${band} km: ${starlink.length} pairs; ${new Date(first).toISOString()} to ${new Date(last).toISOString()}; ${issues.length} issue times; nodes every ${nodeHours} h, prior step ${smoothSigma.toFixed(4)}`);

  // the fleets' own hindcasts against each other (item 6b), and the three hindcast solves on the whole window
  const solve = (arcs) => solveCommonMode(arcs, { anchorMs: T0, ...solver });
  const alone = { planet: solve(planetAll), starlink: solve(starlink), both: solve(everything) };
  const agreement = crossFleetAgreement(alone.planet, alone.starlink, first, last, 12);
  console.log(`  own hindcasts, 12 h windows: ${agreement.windows} windows; correlation of the means ${f3(agreement.correlationOfMeans)}, of 12 h changes ${f3(agreement.correlationOfChangesOver12h)}, of 24 h changes ${f3(agreement.correlationOfChangesOver24h)}; sd Planet ${f3(agreement.sdA)}, Starlink ${f3(agreement.sdB)}; scales (both): ${JSON.stringify(Object.fromEntries(Object.entries(alone.both.groupSigma ?? {}).map(([k, v]) => [k, +v.toFixed(3)])))}`);

  const scores = {};
  for (const target of ['planet', 'starlink']) {
    const otherFleet = target === 'planet' ? 'starlink' : 'planet';
    const pieces = halves(fleets[target]).map(({ target: held, other }) => ({ held, ownOther: other, otherFleet: fleets[otherFleet] }));
    const kinds = { own: (p) => p.ownOther, other: (p) => p.otherFleet, both: (p) => [...p.ownOther, ...p.otherFleet] };
    const row = { hindcast: {}, forecast: {} };
    for (const [kind, arcsOf] of Object.entries(kinds)) {
      const parts = pieces.map((p) => ({ target: p.held, sol: solve(arcsOf(p)) }));
      row.hindcast[kind] = hindcastR3(parts);
      row.forecast[kind] = {};
      for (const L of latencies) {
        const records = pieces.flatMap((p) => heldOutRecords({ calibration: arcsOf(p), target: p.held, issues, latencyHours: L, historyDays, taus, anchorMs: T0, solver, fitHours: target === 'planet' ? 30 : 24, minimumFitArcs: target === 'planet' ? 1 : 2, blockMs: BLOCK, firstMs: first }));
        row.forecast[kind][L] = latencyStatistic(records, taus);
      }
    }
    scores[target] = row;
    console.log(`  target ${target} (held-out half; the solve is of ${target}'s other half = own, ${otherFleet} = other, both together):`);
    for (const kind of Object.keys(kinds)) {
      const h = row.hindcast[kind];
      const fc = latencies.map((L) => { const st = row.forecast[kind][L], b = st.byTau['48']; return b ? `L=${L} h: ${st.windows} arcs, no correction ${f3(st.rmsNoCorrection)}, tau 48 h ${f3(b.rmsUnpredicted)} (${f3(b.ratio)}${interval(b)})` : `L=${L} h: no arcs`; }).join('; ');
      console.log(`    ${kind.padEnd(5)} hindcast R3 ${h.r3 ? `${f3(h.r3.estimate)}${interval(h.r3)}` : 'n/a'} (slope of y on s-bar ${f3(h.slope)}) over ${h.n} arcs of ${h.satellites} satellites | forecast ${fc}`);
    }
  }

  // S3 item 7, literally
  const verdictOf = () => {
    const checks = ['planet', 'starlink'].map((target) => {
      const h = scores[target].hindcast, f = scores[target].forecast, L = latencies[0];
      if (!h.own.r3 || !h.other.r3 || !h.both.r3 || !f.own[L].byTau['48'] || !f.other[L].byTau['48'] || !f.both[L].byTau['48']) return null;
      const bestOther = Math.max(h.own.r3.estimate, h.other.r3.estimate), gainR3 = h.both.r3.estimate - bestOther;
      const bestRatio = Math.min(f.own[L].byTau['48'].ratio, f.other[L].byTau['48'].ratio), gainRatio = bestRatio - f.both[L].byTau['48'].ratio;
      return { target, gainR3, gainRatio, helps: gainR3 >= 0.03 && gainRatio >= 0.02, shortfall: gainR3 <= -0.03 };
    });
    if (checks.some((c) => c === null)) return { verdict: 'not computable (a target has no score)', checks };
    return { verdict: checks.every((c) => c.helps) ? 'the combination helps' : checks.some((c) => c.shortfall) ? 'the combination does not help' : 'unresolved', checks };
  };
  const verdict = verdictOf();
  console.log(`  S3 item 7 (R3 of the combined solve at least 0.03 above the better of the others and the forecast ratio at tau 48 h, L = ${latencies[0]} h, at least 0.02 below the better of theirs, for both targets; shortfall of 0.03 for either target = does not help): ${verdict.verdict}`);
  for (const c of verdict.checks.filter(Boolean)) console.log(`    ${c.target}: R3 gain over the better of the others ${f3(c.gainR3)}, forecast ratio gain ${f3(c.gainRatio)}`);
  results.push({ band, starlinkPairs: starlink.length, starlinkSatellites: new Set(starlink.map((a) => a.dove)).size, span: [new Date(first).toISOString(), new Date(last).toISOString()], issues: issues.length, agreement, scales: alone.both.groupSigma ?? null, scores, verdict });
}

const out = { exploratory: true, amendment: 'S3', nodeHours, historyDays, latencies, taus, blockDays: BLOCK / DAY, solver: { baseline: selection.solver.baseline, smoothSigma }, planetArcs: planetAll.length, planetDoves: new Set(planetAll.map((a) => a.dove)).size,
  note: 'No density truth exists for these dates; every score is against satellites that were in no solve (S3 item 6a) or the fleets against each other (6b). The reading is S3 item 7.', results };
const dir = values.out ?? path.join(repoRoot, 'results', 'e13', 's3');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'combined-solve.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`wrote ${path.join(dir, 'combined-solve.json')}`);
