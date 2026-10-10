#!/usr/bin/env node
// E8 step 08: the calibration set of each window, by PLAN.md section 3's rule,
// from the 60 days before the window's first fit day S only (the sets created
// before S). Candidates: rocket bodies and debris (SATCAT), and GCAT spheres;
// not held out; launched a year before S; perigee height of the latest set
// (analysis/density-calibration `decay`, one set) in [300, 900) km with e
// below the limit; enough sets. Tiers A (spheres), B (GCAT mass, length and
// diameter), C; in each 50-km perigee bin by tier, then number of sets, then
// NORAD number; screened in that order by analysis/maneuver-detection
// (element sets on its `elements` port) until the largest K of section 5 is
// filled. Writes pool.json: per bin the passing objects in order (the first K
// of each bin is the calibration set for K), with their ln B priors.
//
//   node .../08-pool.mjs --window validation|test|historicalTest
import { parseArgs } from 'node:util';
import { startRun } from '../../../harness/provenance.mjs';
import { callJson, config, configPath, DAY_MS, dayMs, isHistorical, isoDay, jb2008Rows, loadModules, modulesDir, windowSpans } from '../common.mjs';
import { asModuleSet, asOf, gcat, readCache, satcat } from '../omm.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, modules: { type: 'string' } } });
const spans = windowSpans(values.window);
const historical = isHistorical(values.window);
const run = startRun({ experiment: config.experiment, step: `08-pool-${values.window}`, configPath, modulesDir: modulesDir(values.modules), args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const { loaded } = await loadModules(run, ['analysis/density-calibration', 'analysis/maneuver-detection'], values);
const dc = loaded['analysis/density-calibration'], mnv = loaded['analysis/maneuver-detection'];
const p = config.pool, d = config.decay;
const sats = satcat(), cat = gcat();
run.addInputs('catalogs', { satcat: sats.sha256, gcat: cat.sha256 });
const exclude = new Set(Object.keys(historical ? p.exclude.historical : p.exclude['2026']).map(Number));
const maxK = Math.max(...p.candidates.perBin);

// Tier and ln B prior from GCAT (PLAN.md section 3).
function tierOf(norad) {
  const g = cat.map.get(norad);
  if (g && g.shape === 'Sphere' && g.mass && g.diameter) {
    return { tier: 'A', prior: { mean: Math.log(p.priors.cd * Math.PI * g.diameter ** 2 / 4 / g.mass), sigma: p.priors.sphereLnBSigma }, gcat: { shape: g.shape, mass: g.mass, diameter: g.diameter } };
  }
  const mass = g?.dryMass ?? g?.mass;
  if (g && mass && g.length && g.diameter) {
    const surface = Math.PI * g.diameter * g.length + Math.PI * g.diameter ** 2 / 2;
    return { tier: 'B', prior: { mean: Math.log(p.priors.cd * surface / 4 / mass), sigma: p.priors.bodyLnBSigma }, gcat: { shape: g.shape, mass, length: g.length, diameter: g.diameter } };
  }
  return { tier: 'C', prior: null, gcat: g ? { shape: g.shape } : null };
}

const out = { window: values.window, spans: [] };
for (const [k, span] of spans.entries()) {
  const cache = readCache(`${values.window}-${k}`);
  run.addInputs('elementSetCache', { [`${values.window}-${k}`]: cache.sha256 });
  run.addInputs('elementSetFiles', cache.files);
  const S = dayMs(span.from) - d.fitLeadDays * DAY_MS, P0 = S - p.preWindowDays * DAY_MS, recent = S - p.recentDays * DAY_MS;
  const counts = { objects: cache.objects.size, held: 0, type: 0, age: 0, sets: 0, gap: 0, perigee: 0, eccentricity: 0 };
  const candidates = [];
  for (const o of cache.objects.values()) {
    // Held out: the window's list (PLAN.md section 3; 2026: every target).
    if (exclude.has(o.norad)) { ++counts.held; continue; }
    const t = tierOf(o.norad);
    const sc = sats.map.get(o.norad);
    if (t.tier !== 'A' && !p.objectTypes.includes(sc?.type ?? o.type)) { ++counts.type; continue; }
    const launch = sc?.launch ?? o.launch;
    if (!launch || dayMs(launch) > S - p.minimumAgeDays * DAY_MS) { ++counts.age; continue; }
    const sets = asOf(o.rows, P0, S, historical ? null : S);
    if (sets.length < p.minimumSets) { ++counts.sets; continue; }
    const last30 = sets.filter((r) => r[0] >= recent).map((r) => r[0]);
    const gaps = [...last30.slice(1).map((x, i) => x - last30[i]), S - (last30.at(-1) ?? recent), (last30[0] ?? S) - recent];
    if (Math.max(...gaps) > p.maximumRecentGapDays * DAY_MS) { ++counts.gap; continue; }
    candidates.push({ norad: o.norad, name: o.name || sc?.name || null, type: sc?.type ?? o.type, launch, sets, ...t });
  }
  // Perigee heights of the latest sets, from the module (one set each: no integration).
  const perigee = new Map();
  for (let i = 0; i < candidates.length; i += 2000) {
    const batch = candidates.slice(i, i + 2000);
    const r = await callJson(dc, 'decay', 'request', { jb2008: { rows: jb2008Rows(isoDay(S - 10 * DAY_MS), isoDay(S + 2 * DAY_MS)) },
      objects: batch.map((c) => ({ id: String(c.norad), sets: [asModuleSet(c.sets.at(-1))] })) });
    r.objects.forEach((o) => { if (o.sets[0]) perigee.set(Number(o.id), { perigeeKm: o.sets[0].perigeeKm, eccentricity: o.sets[0].eccentricity, aKm: o.sets[0].aKm }); });
  }
  const binned = new Map();
  for (const c of candidates) {
    const g = perigee.get(c.norad);
    if (!g || !(g.perigeeKm >= p.perigeeKm[0] && g.perigeeKm < p.perigeeKm[1])) { ++counts.perigee; continue; }
    if (!(g.eccentricity < (c.tier === 'A' ? p.maximumEccentricitySphere : p.maximumEccentricity))) { ++counts.eccentricity; continue; }
    Object.assign(c, g);
    const bin = Math.floor((g.perigeeKm - p.perigeeKm[0]) / p.binKm);
    if (!binned.has(bin)) binned.set(bin, []);
    binned.get(bin).push(c);
  }
  // Rank, then screen for manoeuvres in rank order until maxK pass.
  const order = { A: 0, B: 1, C: 2 };
  const bins = [];
  let screened = 0;
  for (const bin of [...binned.keys()].sort((a, b) => a - b)) {
    const list = binned.get(bin).sort((a, b) => order[a.tier] - order[b.tier] || b.sets.length - a.sets.length || a.norad - b.norad);
    const chosen = [], rejected = [];
    for (const c of list) {
      if (chosen.length >= maxK) break;
      const res = await mnv.invoke('detect_maneuvers', [
        { portId: 'elements', payload: Buffer.from(JSON.stringify({ objects: [{ norad: c.norad, sets: c.sets.map(asModuleSet) }] })), typeRef: { schemaName: 'application/json' } },
        { portId: 'options', payload: Buffer.from(JSON.stringify(p.maneuverOptions)), typeRef: { schemaName: 'application/json' } },
      ]);
      ++screened;
      const report = JSON.parse(Buffer.from(res.outputs.find((f) => f.portId === 'report').payload).toString('utf8'));
      const events = (report.objects[0]?.events ?? []).map((e) => ({ time: e.time, characterization: e.characterization, inTrackMps: e.in_track_mps, crossTrackMps: e.cross_track_mps }));
      const entry = { norad: c.norad, name: c.name, type: c.type, tier: c.tier, prior: c.prior, gcat: c.gcat, perigeeKm: c.perigeeKm, eccentricity: c.eccentricity,
        aKm: c.aKm, sets: c.sets.length, events: events.length, maneuverStatus: report.objects[0]?.status ?? null };
      if (events.some((e) => !p.maneuverAllowed.includes(e.characterization))) rejected.push({ ...entry, reason: 'maneuver', detected: events });
      else chosen.push(entry);
    }
    bins.push({ bin, fromKm: p.perigeeKm[0] + bin * p.binKm, toKm: p.perigeeKm[0] + (bin + 1) * p.binKm, candidates: list.length, chosen, rejected });
    log(`${span.from} bin ${p.perigeeKm[0] + bin * p.binKm} km: ${list.length} candidates, ${chosen.length} chosen (${chosen.map((c) => c.tier).join('')}), ${rejected.length} rejected`);
  }
  out.spans.push({ span, S: isoDay(S), poolFrom: isoDay(P0), counts, screened, bins });
  log(`${span.from}: ${JSON.stringify(counts)}; ${screened} screened`);
}
run.write('pool.json', out);
run.finish();
log('done');
