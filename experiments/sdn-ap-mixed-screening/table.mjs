// B2 aggregation (PLAN.md, Scoring and statistics): the stored rows of parts 1 and 2 -> results/sdn-ap-mixed-screening/table.json and README.md.
// Counting, ordering and resampling only.
//   node experiments/sdn-ap-mixed-screening/table.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, store, results, args, readJsonl, sha256 } from './common.mjs';

const B = config.statistics.bootstrap;
const NAMES = { sdnap: 'SDN-AP', sgp4xp: 'SGP4-XP', sgp4: 'SGP4', forecast: 'Operator forecast', ffm: 'FFM', sdnapTruth: 'SDN-AP fitted to the truth' };
const REF = { sdnap: 'SDN-AP', ffm: 'FFM' };
const quantile = (values, q) => { const a = values.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return null; const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };
const medianSorted = (a) => { const pos = (a.length - 1) / 2, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };
function generator(label) { // xorshift128+ (23, 17, 26), seeded by SHA-256 of the label; the high 32 bits as a float in [0, 1)
  const d = crypto.createHash('sha256').update(label).digest();
  let [ah, al, bh, bl] = [d.readUInt32BE(0), d.readUInt32BE(4), d.readUInt32BE(8), d.readUInt32BE(12)];
  if (!(ah | al | bh | bl)) al = 1;
  return () => {
    let xh = ah, xl = al; const yh = bh, yl = bl;
    ah = yh; al = yl;
    xh = (xh ^ ((xh << 23) | (xl >>> 9))) >>> 0; xl = (xl ^ (xl << 23)) >>> 0;
    const x17l = ((xl >>> 17) | (xh << 15)) >>> 0, x17h = xh >>> 17, y26l = ((yl >>> 26) | (yh << 6)) >>> 0, y26h = yh >>> 26;
    bh = (xh ^ yh ^ x17h ^ y26h) >>> 0; bl = (xl ^ yl ^ x17l ^ y26l) >>> 0;
    const lo = bl + yl, carry = lo >= 4294967296 ? 1 : 0;
    return ((bh + yh + carry) >>> 0) / 4294967296;
  };
}
function interval(items, label, clustered) {
  if (items.length < 2) return null;
  const next = generator(label), medians = [];
  for (let r = 0; r < B.resamples; r += 1) {
    const draw = [];
    for (let i = 0; i < items.length; i += 1) { const pick = items[Math.floor(next() * items.length)]; if (clustered) draw.push(...pick); else draw.push(pick); }
    draw.sort((x, y) => x - y);
    medians.push(medianSorted(draw));
  }
  const tail = (1 - B.level) / 2;
  return [quantile(medians, tail), quantile(medians, 1 - tail)];
}
function spread(items, label) { // items: [{ object, value }]
  const ok = items.filter((x) => Number.isFinite(x.value));
  if (!ok.length) return { n: 0 };
  const byObject = new Map();
  for (const x of ok) { if (!byObject.has(x.object)) byObject.set(x.object, []); byObject.get(x.object).push(x.value); }
  const v = ok.map((x) => x.value);
  return { n: v.length, objects: byObject.size, median: quantile(v, 0.5), p10: quantile(v, 0.1), p90: quantile(v, 0.9), ci95Windows: interval(v, `${label}|windows`, false), ci95Objects: byObject.size >= B.objectMinimum ? interval([...byObject.values()], `${label}|objects`, true) : null };
}

/** Scoring's paired form against the reference arm `ref`: per other arm and bin, on the windows both scored, the share where `ref` is closer
 *  and the median per-window ratio other / ref with its bootstrap interval over windows (seed B2|<row>|<other>/<ref>|<bin>|windows). */
function pairedWith(windows, ref, others, bins, label) {
  return Object.fromEntries(others.map((other) => [other, Object.fromEntries(bins.map((b) => {
    const pairs = windows.map((w) => [w.arms?.[ref]?.ok ? w.arms[ref].bins?.[b]?.rmsKm : undefined, w.arms?.[other]?.ok ? w.arms[other].bins?.[b]?.rmsKm : undefined]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x > 0);
    if (!pairs.length) return [b, { n: 0 }];
    const ratios = pairs.map(([x, y]) => y / x);
    return [b, { n: pairs.length, [`${ref}Closer`]: pairs.filter(([x, y]) => x < y).length / pairs.length, medianRatio: quantile(ratios, 0.5), ci95Windows: interval(ratios, `B2|${label}|${other}/${ref}|${b}|windows`, false) }];
  }))]));
}

/** One table row: windows [{ object, arms: { arm: { ok, bins } } }], the arms, the bins; `paired` the others paired with SDN-AP (registered),
 *  `pairedWithFfm` the others paired with FFM (amendment A5). */
function tableRow(id, label, note, windows, arms, bins, { paired = arms.filter((x) => x !== 'sdnap'), pairedWithFfm = null } = {}) {
  const row = { id, row: label, note, windows: windows.length, objects: new Set(windows.map((w) => w.object)).size, arms: {}, paired: {}, closest: {} };
  for (const arm of arms) {
    const attempted = windows.filter((w) => w.arms?.[arm]).length;
    row.arms[arm] = { attempted, scored: windows.filter((w) => w.arms?.[arm]?.ok).length, bins: Object.fromEntries(bins.map((b) => [b, spread(windows.map((w) => ({ object: w.object, value: w.arms?.[arm]?.ok ? w.arms[arm].bins?.[b]?.rmsKm : undefined })), `B2|${label}|${arm}|${b}`)])) };
  }
  row.paired = pairedWith(windows, 'sdnap', paired, bins, label);
  if (pairedWithFfm) row.pairedWithFfm = pairedWith(windows, 'ffm', pairedWithFfm, bins, label);
  for (const b of bins) {
    const c = arms.filter((x) => x !== 'sdnapTruth' && row.arms[x].bins[b].n > 0).map((x) => [x, row.arms[x].bins[b].median]);
    const best = c.length ? Math.min(...c.map(([, m]) => m)) : null;
    row.closest[b] = c.length ? c.filter(([, m]) => m === best).map(([x]) => x) : null;
  }
  return row;
}

const rows = (prefix) => { const dir = path.join(store, 'rows'); return (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort() : []).flatMap((f) => readJsonl(path.join(dir, f))); };

const tally = (values) => Object.fromEntries([...values.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
/** The latest score pass of part 1a (A5 point 6): the rows of the newest --through cycle present. */
function latestPass() {
  const dir = path.join(store, 'rows');
  const passes = fs.existsSync(dir) ? [...new Set(fs.readdirSync(dir).map((f) => /^starlink-score\.(.+)\.s\d+\.jsonl$/.exec(f)?.[1]).filter(Boolean))].sort() : [];
  return passes.length ? { through: passes.at(-1), rows: rows(`starlink-score.${passes.at(-1)}.`) } : { through: null, rows: [] };
}
/** Part 1a's counts (PLAN.md part 1a, A3, A5): satellites, exclusions, fits, the late-start proof, the reader, the bins, maneuvers, the sample. */
function starlinkCounts(st, fit, ffm, through) {
  const scored = st.filter((r) => r.arms);
  const outcome = (rs, arm) => tally(rs.map((r) => (r.excluded ? `excluded: ${r.excluded.replace(/\d+ epochs$/, 'below 90 % of its epochs')}` : r[arm]?.ok ? 'fitted' : r[arm]?.converged === false ? 'not converged' : `refused: ${String(r[arm]?.error ?? '').replace(/\d+(\.\d+)?/g, '#').slice(0, 90)}`)));
  const sample = JSON.parse(fs.readFileSync(path.join(store, 'forecast-sample.json'), 'utf8')).sample;
  return {
    through, binsComplete: st[0]?.binsComplete ?? [], forecastCycleSatellites: fit.length,
    sgp4xpFit: outcome(fit, 'sgp4xp'), ffmFit: outcome(ffm, 'ffm'),
    trackProof: { fitRows: fit.filter((r) => r.track).length, shaDiffers: fit.filter((r) => r.track && r.track.sha !== r.track.shaAllCycles).length },
    readerDroppedStates: { track: fit.reduce((n, r) => n + (r.track?.dropped ?? 0), 0), truth: st.reduce((n, r) => n + (r.truthDropped ?? 0), 0) },
    gatedStates: { track: fit.reduce((n, r) => n + (r.gated ?? 0), 0), truth: st.reduce((n, r) => n + (r.gated ?? 0), 0) },
    score: tally(st.map((r) => (r.arms ? 'scored' : `excluded: ${r.excluded}`))),
    binsCounted: Object.fromEntries(['1', '2', '3'].map((b) => [b, { complete: (st[0]?.binsComplete ?? []).includes(b), counted: scored.filter((r) => r.bins?.[b]?.counts && r.binsComplete.includes(b)).length, belowCoverage: scored.filter((r) => r.binsComplete.includes(b) && !r.bins?.[b]?.counts).length }])),
    maneuver: { evident: scored.filter((r) => r.maneuverEvident).length, notEvident: scored.filter((r) => !r.maneuverEvident).length, notEvidentWithOverlap: scored.filter((r) => !r.maneuverEvident && r.overlapEpochs > 0).length, notEvidentWithoutOverlap: scored.filter((r) => !r.maneuverEvident && !r.overlapEpochs).length },
    forecastSample: { drawn: sample.length, scored: scored.filter((r) => r.arms.forecast?.ok).length, outcomes: tally(sample.map((nr) => { const r = st.find((x) => x.norad === nr); return !r ? 'not in the forecast cycle' : !r.arms ? `excluded: ${r.excluded}` : r.arms.forecast?.ok ? 'scored' : `no forecast arm: ${r.arms.forecast?.error ?? 'none'}`; })) },
  };
}

export function build() {
  const out = { experiment: config.experiment, plan: 'experiments/sdn-ap-mixed-screening/PLAN.md', modulesCommit: config.modules.commit, sdnapWasmSha256: config.modules.sdnapWasmSha256, units: 'km, 3D RMS of a horizon bin (part 1: hours after E; part 2: days after T); a cell is over windows', inputs: {}, rows: [] };
  const BINS = ['1', '2', '3'];
  // part 1a (A5: SGP4-XP, FFM and SpaceX's forecast; the latest score pass)
  const { through, rows: st } = latestPass();
  out.inputs.starlinkScore = sha256(Buffer.from(JSON.stringify(st)));
  const sw = st.filter((r) => r.arms).map((r) => ({ object: String(r.norad), arms: r.arms, maneuverEvident: r.maneuverEvident }));
  if (st.length) {
    const fit = rows('starlink-fit.'), ffm = rows('starlink-ffm.');
    out.inputs.starlinkFit = sha256(Buffer.from(JSON.stringify(fit)));
    out.inputs.starlinkFfm = sha256(Buffer.from(JSON.stringify(ffm)));
    out.starlink = starlinkCounts(st, fit, ffm, through);
    const interim = out.starlink.binsComplete.length < BINS.length ? `interim: bins ${out.starlink.binsComplete.join(', ')} complete at the capture cycle ${through}` : `final: every bin complete at the capture cycle ${through}`;
    out.rows.push(tableRow('starlink-all', 'Starlink, SpaceX operator track (all satellites)', `${st.length} satellites in the forecast cycle; ${sw.length} scored; ${interim}`, sw, ['sgp4xp', 'ffm'], BINS, { paired: [], pairedWithFfm: ['sgp4xp'] }));
    out.rows.push(tableRow('starlink-quiet', 'Starlink, no maneuver evident', `truth files agree within 1 km where they overlap; ${interim}`, sw.filter((w) => !w.maneuverEvident), ['sgp4xp', 'ffm'], BINS, { paired: [], pairedWithFfm: ['sgp4xp'] }));
    out.rows.push(tableRow('starlink-forecast', 'Starlink, the forecast sample (SpaceX\'s own forecast beside)', `sample satellites whose fetched file is F; ${interim}`, sw.filter((w) => w.arms.forecast?.ok), ['sgp4xp', 'ffm', 'forecast'], BINS, { paired: [], pairedWithFfm: ['sgp4xp', 'forecast'] }));
    out.rows.push(tableRow('starlink-forecast-quiet', 'Starlink, the forecast sample, no maneuver evident', `sample satellites whose fetched file is F and whose truth files agree within 1 km where they overlap; ${interim}`, sw.filter((w) => w.arms.forecast?.ok && !w.maneuverEvident), ['sgp4xp', 'ffm', 'forecast'], BINS, { paired: [], pairedWithFfm: ['sgp4xp', 'forecast'] }));
  }
  // part 1b (the FFM arm by A5, from its own phase's rows)
  const iss = rows('iss.'), issFfm = new Map(rows('iss-ffm.').map((r) => [r.file, r]));
  out.inputs.iss = sha256(Buffer.from(JSON.stringify(iss)));
  if (issFfm.size) out.inputs.issFfm = sha256(Buffer.from(JSON.stringify([...issFfm.values()])));
  const issArms = ['sdnap', 'sgp4xp', 'sgp4', 'forecast', ...(issFfm.size ? ['ffm'] : [])];
  const withFfm = issFfm.size ? { pairedWithFfm: ['sgp4xp', 'sgp4', 'forecast'] } : {};
  const iw = iss.filter((r) => r.arms).map((r) => ({ object: 'ISS', arms: { ...r.arms, ...(issFfm.get(r.file)?.ffm ? { ffm: issFfm.get(r.file).ffm } : {}) } }));
  const ffmNote = issFfm.size ? `; FFM: ${Object.entries(tally(iss.filter((r) => r.arms).map((r) => { const f = issFfm.get(r.file)?.ffm; return !f ? 'not run' : f.ok ? 'fitted' : f.converged === false ? 'not converged' : `refused (${String(f.error).replace(/\d+(\.\d+)?/g, '#').slice(0, 80)})`; }))).map(([k, v]) => `${v} ${k}`).join(', ')}` : '';
  out.rows.push(tableRow('iss', 'ISS, NASA trajectory files 2020 to 2026', `${iss.length} files; ${iss.filter((r) => r.excluded?.startsWith('planned burn')).length} excluded for a planned burn, ${iss.filter((r) => r.excluded && !r.excluded.startsWith('planned burn')).length} without a newer file in the 72 h; ${iw.length} scored${ffmNote}`, iw, issArms, BINS, withFfm));
  out.rows.push(tableRow('iss-forecast', 'ISS, the windows NASA\'s file reaches (forecast beside)', 'windows whose own file holds the truth epochs', iw.filter((w) => w.arms.forecast?.ok), issArms, BINS, withFfm));
  // part 2
  const la = rows('laser.');
  out.inputs.laser = sha256(Buffer.from(JSON.stringify(la)));
  const lw = la.filter((r) => r.arms && !r.arms.error).map((r) => ({ object: r.target, arms: r.arms }));
  out.rows.push(tableRow('laser', 'LEO laser-ranged spheres from ILRS normal points (Starlette, Stella, LARETS, WESTPAC, LARES), 2026-07-16 to 08-30', `${la.length} cutoffs; SDN-AP and SGP4-XP fitted to 24 h of the full force model carried from the normal-point fit (not to the ranges directly)`, lw, ['sdnap', 'sgp4xp', 'ffm', 'sgp4', 'sdnapTruth'], BINS));
  for (const t of config.part2.targets) out.rows.push(tableRow(`laser-${t}`, `Laser, ${t}`, '', lw.filter((w) => w.object === t), ['sdnap', 'sgp4xp', 'ffm', 'sgp4', 'sdnapTruth'], BINS));
  return out;
}

const TABLE = path.join(results, 'table.json');
export const sameAsCommitted = (t) => fs.existsSync(TABLE) && fs.readFileSync(TABLE, 'utf8') === `${JSON.stringify(t, null, 2)}\n`;
const km = (v) => (v == null ? '' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3));
const cell = (s) => (!s?.n ? '-' : `${km(s.median)} (${km(s.p10)} to ${km(s.p90)}) [${s.ci95Windows ? `${km(s.ci95Windows[0])}, ${km(s.ci95Windows[1])}` : '-'}] n ${s.n}`);

const share = (n, d) => (d ? `${n} (${Math.round((100 * n) / d)} %)` : `${n}`);
const listed = (o) => Object.entries(o).map(([k, v]) => `${v} ${k}`).join('; ');
/** Part 1a's counts as prose lines. */
function starlinkMarkdown(c) {
  const fitted = (o) => o.fitted ?? 0;
  return [
    `Counts (part 1a): ${c.forecastCycleSatellites} satellites in the forecast cycle. SGP4-XP fits: ${listed(c.sgp4xpFit)}. FFM fits: ${listed(c.ffmFit)}. Score pass at ${c.through}: ${listed(c.score)}.`, '',
    `Bins counted under the coverage rule: ${['1', '2', '3'].map((b) => `bin ${b} ${c.binsCounted[b].complete ? `${c.binsCounted[b].counted} satellites (${c.binsCounted[b].belowCoverage} below 90 % coverage)` : 'not complete yet'}`).join('; ')}.`, '',
    `Maneuver test: ${share(c.maneuver.evident, c.maneuver.evident + c.maneuver.notEvident)} scored satellites with a maneuver evident; of the ${c.maneuver.notEvident} without one, ${c.maneuver.notEvidentWithoutOverlap} have no epoch where two truth files overlap, so the test had nothing to compare for them.`, '',
    `Late-start proof (A5 point 4): ${c.trackProof.fitRows} fit rows; the track built from the cycles before the forecast cycle and from every cycle present differ for ${c.trackProof.shaDiffers}. Reader (A5 point 5): ${c.readerDroppedStates.track} track and ${c.readerDroppedStates.truth} truth states dropped that the earlier reader kept. Truth gate: ${c.gatedStates.track} track and ${c.gatedStates.truth} truth states dropped.`, '',
    `Forecast sample: ${c.forecastSample.drawn} drawn, ${c.forecastSample.scored} scored; ${listed(c.forecastSample.outcomes)}.`, '',
    `FFM fitted ${fitted(c.ffmFit)} and SGP4-XP ${fitted(c.sgp4xpFit)} of ${c.forecastCycleSatellites}.`, '',
  ];
}

export function markdown(t) {
  const o = ['# B2: operator ephemerides and observations, SGP4-XP, FFM and the operators\' forecasts (parts 1 and 2)', ''];
  o.push(`Generated by \`node experiments/sdn-ap-mixed-screening/table.mjs\` from the stored rows; plan: [PLAN.md](../../experiments/sdn-ap-mixed-screening/PLAN.md) with its amendments A1 to A5. Modules at ${t.modulesCommit.slice(0, 12)}; SGP4-XP (THEORY SGP4XP) and SDN-AP run in propagator/sdn-ap build ${t.sdnapWasmSha256.slice(0, 12)}.`, '');
  o.push('A cell is the median over windows of a bin\'s 3D RMS (km), the 10th and 90th percentiles in parentheses, the 95 % bootstrap interval of the median over windows in brackets, and the windows scored. Part 1 bins are hours after E, (0, 24], (24, 48], (48, 72]; part 2 bins are days after T. SDN-AP in part 2 is fitted to 24 h of the full force model carried from the normal-point fit, not to the ranges directly.', '');
  o.push('Steps. Truth: part 1a the first 8 h of each newer SpaceX file at its 10-min epochs (GCRF); part 1b the first 24 h of each newer NASA file at its 4-min epochs (EME2000); part 2 NSGF orbits thinned to one state per 300 s. FFM: analysis/estimation fit_batch answered by propagator/ffm (gravity 70 x 70, Sun and Moon, radiation pressure, NRLMSISE-00 drag, solid tides, relativity; integrator tolerance 1e-10, steps of at most 120 s), fitted to the 24 h track\'s positions at 10 m per axis (part 1a every 10 min, part 1b every 4 min) and carried by the same model to the truth epochs. SGP4-XP, SDN-AP and SGP4 are analytic, fitted to the same 24 h track and evaluated at the truth epochs. The operator forecast is the operator\'s own file at the truth epochs.', '');
  o.push('Amendment A5 (2026-10-26): SDN-AP is withdrawn from part 1a (the owner withdrew the theory on 2026-10-25, before any part 1a fit or score); part 1b gains the FFM arm, added to windows whose other arms were scored and landed on 2026-10-25. Rows paired with FFM give the share of windows where FFM is closer and the median ratio other / FFM.', '');
  if (!t.rows.some((r) => r.id.startsWith('starlink'))) o.push('Part 1a (Starlink, prospective) is scored bin by bin as the capture cycles complete each bin\'s truth (A5): bin 1 from 2026-10-26 21:01Z, bin 3 from 2026-10-28 21:01Z; its rows are not in this table yet.', '');
  for (const r of t.rows) {
    o.push(`## ${r.row}`, '', r.note ? `${r.note}.` : '', '', '| Arm | Scored / attempted | Bin 1 | Bin 2 | Bin 3 |', '| --- | --: | --- | --- | --- |');
    for (const [arm, a] of Object.entries(r.arms)) o.push(`| ${NAMES[arm]} | ${a.scored} / ${a.attempted} | ${['1', '2', '3'].map((b) => cell(a.bins[b])).join(' | ')} |`);
    o.push('', `Closest by bin: ${['1', '2', '3'].map((b) => `${b}: ${r.closest[b] ? r.closest[b].map((x) => NAMES[x]).join(', ') : '-'}`).join('; ')}.`, '');
    for (const [ref, paired] of [['sdnap', r.paired], ['ffm', r.pairedWithFfm ?? {}]]) {
      const p = Object.entries(paired).filter(([, v]) => Object.values(v).some((x) => x.n));
      if (!p.length) continue;
      o.push(`| Paired with ${REF[ref]} | Bin 1 | Bin 2 | Bin 3 |`, '| --- | --- | --- | --- |');
      for (const [other, v] of p) o.push(`| ${NAMES[other]} | ${['1', '2', '3'].map((b) => (v[b].n ? `${REF[ref]} closer in ${Math.round(100 * v[b][`${ref}Closer`])} %; other / ${REF[ref]} ${km(v[b].medianRatio)}${v[b].ci95Windows ? ` [${km(v[b].ci95Windows[0])}, ${km(v[b].ci95Windows[1])}]` : ''} (n ${v[b].n})` : '-')).join(' | ')} |`);
      o.push('');
    }
    if (r.id === 'starlink-all' && t.starlink) o.push(...starlinkMarkdown(t.starlink));
  }
  return o.join('\n');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const t = build();
  if (args.check) { const same = sameAsCommitted(t); console.error(same ? 'B2 table: PASS (same as committed)' : 'B2 table: differs from committed'); process.exit(same ? 0 : 1); }
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, `${JSON.stringify(t, null, 2)}\n`);
  fs.writeFileSync(path.join(results, 'README.md'), markdown(t));
  console.error(`B2 table: ${t.rows.length} rows`);
}
