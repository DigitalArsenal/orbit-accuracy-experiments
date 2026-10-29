// B2 aggregation (PLAN.md, Scoring and statistics): the stored rows of parts 1 and 2 -> results/sdn-ap-mixed-screening/table.json and README.md.
// Counting, ordering and resampling only.
//   node experiments/sdn-ap-mixed-screening/table.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, store, results, args, readJsonl, sha256 } from './common.mjs';
import { ffm3Merged } from './lib/a12-arms.mjs';

const B = config.statistics.bootstrap;
const NAMES = { sdnap: 'SDN-AP', sgp4xp: 'SGP4-XP', sgp4: 'SGP4', forecast: 'Operator forecast', ffm: 'FFM', sdnapTruth: 'SDN-AP fitted to the truth',
  ffm3: 'FFM, fit_batch version 3 (A12)', xpln: 'SGP4-XP, log-normal drag prior (XP-LN, A12)', ffmRound1: 'FFM (A3), round-1 products at 100 x sigma (descriptive)' };
const REF = { sdnap: 'SDN-AP', ffm: 'FFM', ffm3: 'FFM v3', sgp4xp: 'SGP4-XP' };
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
export function interval(items, label, clustered) {
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
function tableRow(id, label, note, windows, arms, bins, { paired = arms.filter((x) => x !== 'sdnap'), pairedWithFfm = null, pairedWithRef = null } = {}) {
  const row = { id, row: label, note, windows: windows.length, objects: new Set(windows.map((w) => w.object)).size, arms: {}, paired: {}, closest: {} };
  for (const arm of arms) {
    const attempted = windows.filter((w) => w.arms?.[arm]).length;
    row.arms[arm] = { attempted, scored: windows.filter((w) => w.arms?.[arm]?.ok).length, bins: Object.fromEntries(bins.map((b) => [b, spread(windows.map((w) => ({ object: w.object, value: w.arms?.[arm]?.ok ? w.arms[arm].bins?.[b]?.rmsKm : undefined })), `B2|${label}|${arm}|${b}`)])) };
  }
  row.paired = pairedWith(windows, 'sdnap', paired, bins, label);
  if (pairedWithFfm) row.pairedWithFfm = pairedWith(windows, 'ffm', pairedWithFfm, bins, label);
  if (pairedWithRef) row.pairedWithRef = Object.fromEntries(Object.entries(pairedWithRef).map(([ref, others]) => [ref, pairedWith(windows, ref, others, bins, label)])); // A12
  for (const b of bins) {
    const c = arms.filter((x) => x !== 'sdnapTruth' && row.arms[x].bins[b].n > 0).map((x) => [x, row.arms[x].bins[b].median]);
    const best = c.length ? Math.min(...c.map(([, m]) => m)) : null;
    row.closest[b] = c.length ? c.filter(([, m]) => m === best).map(([x]) => x) : null;
  }
  return row;
}

const rows = (prefix) => { const dir = path.join(store, 'rows'); return (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort() : []).flatMap((f) => readJsonl(path.join(dir, f))); };

const refusal = (e) => /invoke: ([a-z]+(?:-[a-z]+)+)/.exec(String(e))?.[1] ?? String(e).replace(/\d+(\.\d+)?/g, '#').slice(0, 80);
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
    headline: { satellites: fit.length, ffmFitted: ffm.filter((r) => r.ffm?.ok).length, ffmRefused: ffm.filter((r) => r.ffm && !r.ffm.ok && r.ffm.converged !== false).length, ffmNotConverged: ffm.filter((r) => r.ffm?.converged === false).length },
    exploratory: exploratoryRefusals(st, fit, ffm),
  };
}

/** A10 point 2, exploratory: FFM's refusals by shell (the track's mean distance from Earth's center), by the maneuver flag and by SGP4-XP's
 *  fit RMS on the same track; and how much of FFM's reduced chi-square tail (above its 90th percentile) is maneuver-evident. */
function exploratoryRefusals(st, fit, ffm) {
  const score = new Map(st.map((r) => [r.norad, r])), xp = new Map(fit.map((r) => [r.norad, r]));
  const sats = ffm.filter((r) => r.ffm).map((r) => ({ norad: r.norad, state: r.ffm.ok ? 'fitted' : r.ffm.converged === false ? 'not converged' : 'refused', chi2: r.ffm.ok ? r.ffm.reducedChiSquare : null, radius: score.get(r.norad)?.trackMeanRadiusKm ?? null, maneuver: score.get(r.norad)?.maneuverEvident ?? null, xpRms: xp.get(r.norad)?.sgp4xp?.moduleFitRmsKm ?? null }));
  const share = (list) => ({ satellites: list.length, refused: list.filter((x) => x.state === 'refused').length, refusedShare: list.length ? list.filter((x) => x.state === 'refused').length / list.length : null });
  const shells = new Map();
  for (const x of sats.filter((y) => Number.isFinite(y.radius))) { const lo = Math.floor(x.radius / 10) * 10; if (!shells.has(lo)) shells.set(lo, []); shells.get(lo).push(x); }
  const rms = sats.filter((x) => Number.isFinite(x.xpRms)).map((x) => x.xpRms).sort((a, b) => a - b), q = (p) => rms[Math.floor(p * (rms.length - 1))];
  const edges = [0, q(0.25), q(0.5), q(0.75), Infinity];
  const fitted = sats.filter((x) => x.state === 'fitted' && Number.isFinite(x.chi2)), chi = fitted.map((x) => x.chi2).sort((a, b) => a - b), p90 = chi[Math.floor(0.9 * (chi.length - 1))];
  const tail = fitted.filter((x) => x.chi2 > p90 && x.maneuver !== null), body = fitted.filter((x) => x.chi2 <= p90 && x.maneuver !== null);
  return {
    note: 'exploratory, not registered as a test (A10 point 2)',
    byShellKm: [...shells.entries()].sort((a, b) => a[0] - b[0]).map(([lo, list]) => ({ meanRadiusKm: [lo, lo + 10], ...share(list) })),
    byManeuver: { evident: share(sats.filter((x) => x.maneuver === true)), notEvident: share(sats.filter((x) => x.maneuver === false)), unknown: share(sats.filter((x) => x.maneuver === null)) },
    bySgp4xpFitRmsKm: edges.slice(0, -1).map((lo, i) => ({ fitRmsKm: [lo, edges[i + 1]], ...share(sats.filter((x) => Number.isFinite(x.xpRms) && x.xpRms >= lo && x.xpRms < edges[i + 1])) })),
    chi2Tail: { p90, tail: tail.length, tailManeuverShare: tail.length ? tail.filter((x) => x.maneuver).length / tail.length : null, bodyManeuverShare: body.length ? body.filter((x) => x.maneuver).length / body.length : null },
  };
}

export function build() {
  const out = { experiment: config.experiment, plan: 'experiments/sdn-ap-mixed-screening/PLAN.md', modulesCommit: config.modules.commit, sdnapWasmSha256: config.modules.sdnapWasmSha256, units: 'km, 3D RMS of a horizon bin (part 1: hours after E; part 2: days after T); a cell is over windows', inputs: {}, rows: [] };
  const BINS = ['1', '2', '3'];
  // part 1a (A5: SGP4-XP, FFM and SpaceX's forecast; the latest score pass)
  const { through, rows: st } = latestPass();
  out.inputs.starlinkScore = sha256(Buffer.from(JSON.stringify(st)));
  // A12 point 2: A3's round-2-refused satellites (the round-1 product kept, stoppedBy set) count as failed; their products only as a labeled descriptive arm
  const roundOne = new Set(rows('starlink-ffm.').filter((r) => r.ffm?.ok && r.ffm.stoppedBy).map((r) => r.norad));
  const relabel = (r) => (roundOne.has(r.norad) && r.arms.ffm ? { ...r.arms, ffm: { ok: false, error: 'A3 round 2 refused (counted failed, A12 point 2)' }, ffmRound1: r.arms.ffm } : r.arms);
  const sw = st.filter((r) => r.arms).map((r) => ({ object: String(r.norad), arms: relabel(r), maneuverEvident: r.maneuverEvident }));
  if (st.length) {
    const fit = rows('starlink-fit.'), ffm = rows('starlink-ffm.');
    out.inputs.starlinkFit = sha256(Buffer.from(JSON.stringify(fit)));
    out.inputs.starlinkFfm = sha256(Buffer.from(JSON.stringify(ffm)));
    out.starlink = starlinkCounts(st, fit, ffm, through);
    const interim = out.starlink.binsComplete.length < BINS.length ? `interim: bins ${out.starlink.binsComplete.join(', ')} complete at the capture cycle ${through}` : `final: every bin complete at the capture cycle ${through}`;
    // A10 point 2: the primary FFM-against-SGP4-XP rows are on the satellites both arms fitted and scored; SGP4-XP alone on the others is descriptive
    const both = (w) => w.arms.sgp4xp?.ok && w.arms.ffm?.ok, xpOnly = (w) => ({ ...w, arms: { sgp4xp: w.arms.sgp4xp } });
    const forecastAll = (w) => both(w) && w.arms.forecast?.ok;
    out.rows.push(tableRow('starlink-both', 'Starlink, satellites both SGP4-XP and FFM fitted and scored (the primary comparison)', `${sw.filter(both).length} of ${st.length} satellites in the forecast cycle; ${interim}`, sw.filter(both), ['sgp4xp', 'ffm'], BINS, { paired: [], pairedWithFfm: ['sgp4xp'] }));
    out.rows.push(tableRow('starlink-both-quiet', 'Starlink, both arms fitted, no maneuver evident', `truth files agree within 1 km where they overlap; ${interim}`, sw.filter((w) => both(w) && !w.maneuverEvident), ['sgp4xp', 'ffm'], BINS, { paired: [], pairedWithFfm: ['sgp4xp'] }));
    out.rows.push(tableRow('starlink-xp-refused', 'Starlink, SGP4-XP on the satellites FFM did not fit (descriptive: the selection FFM\'s refusals make)', `${sw.filter((w) => w.arms.sgp4xp?.ok && !w.arms.ffm?.ok).length} satellites; ${interim}`, sw.filter((w) => w.arms.sgp4xp?.ok && !w.arms.ffm?.ok).map(xpOnly), ['sgp4xp'], BINS, { paired: [] }));
    out.rows.push(tableRow('starlink-xp-all', 'Starlink, SGP4-XP on every scored satellite (descriptive)', `${sw.filter((w) => w.arms.sgp4xp?.ok).length} satellites; ${interim}`, sw.map(xpOnly), ['sgp4xp'], BINS, { paired: [] }));
    out.rows.push(tableRow('starlink-forecast', 'Starlink, the forecast sample with all three arms scored (SpaceX\'s own forecast beside)', `sample satellites whose fetched file is F (A10) and both fits scored; ${interim}`, sw.filter(forecastAll), ['sgp4xp', 'ffm', 'forecast'], BINS, { paired: [], pairedWithFfm: ['sgp4xp', 'forecast'] }));
    // A12: the new arms. ffm3 is the FFM arm of record (point 12); A3 stays reported as registered above.
    const ffm3 = ffm3Merged(rows), xpln = rows('starlink-xpln.');
    out.inputs.starlinkFfm3 = sha256(Buffer.from(JSON.stringify(ffm3)));
    out.inputs.starlinkXpln = sha256(Buffer.from(JSON.stringify(xpln)));
    out.starlink.a12 = {
      profile: config.a12.selected?.profile ?? null, gateFailed: config.a12.selected?.gateFailed ?? null,
      ffm3Fit: tally(ffm3.map((r) => (r.ffm3?.ok ? 'fitted (CONVERGED)' : `failed: ${r.ffm3?.termination ?? String(r.ffm3?.error ?? '').replace(/\d+(\.\d+)?/g, '#').slice(0, 90)}`))),
      ffm3Refused: ffm3.filter((r) => r.ffm3?.refusedTrials > 0 || r.ffm3?.refusedRounds > 0).length,
      xplnFit: tally(xpln.map((r) => (r.xpln?.ok ? 'fitted' : `refused: ${String(r.xpln?.error ?? '').slice(0, 90)}`))),
      a3: { tracks: ffm.length, refusedAnyRound: ffm.filter((r) => !r.ffm?.ok && r.ffm?.converged !== false).length + roundOne.size, refusedRoundOne: ffm.filter((r) => !r.ffm?.ok && r.ffm?.converged !== false).length, roundTwoRefusedCountedFailed: roundOne.size, notConverged: ffm.filter((r) => r.ffm?.converged === false).length, fullWeight: ffm.filter((r) => r.ffm?.ok && !r.ffm.stoppedBy).length, note65202: 'NORAD 65202: a full-weight A3 fit with B = -1.86e-6 m^2/kg, which propagator/ffm refuses at prediction' },
    };
    const v3both = (w) => w.arms.sgp4xp?.ok && w.arms.ffm3?.ok;
    out.rows.push(tableRow('starlink-ffm3-both', 'Starlink, FFM v3 (A12, the FFM arm of record) against SGP4-XP on the satellites both fitted and scored (A10\'s primary form)', `${sw.filter(v3both).length} of ${st.length} satellites; ${interim}`, sw.filter(v3both), ['sgp4xp', 'ffm3'], BINS, { paired: [], pairedWithRef: { ffm3: ['sgp4xp'] } }));
    out.rows.push(tableRow('starlink-ffm3-both-quiet', 'Starlink, FFM v3 and SGP4-XP both fitted, no maneuver evident', `truth files agree within 1 km where they overlap; ${interim}`, sw.filter((w) => v3both(w) && !w.maneuverEvident), ['sgp4xp', 'ffm3'], BINS, { paired: [], pairedWithRef: { ffm3: ['sgp4xp'] } }));
    out.rows.push(tableRow('starlink-ffm3-a3', 'Starlink, FFM v3 against A3 on A3\'s full-weight satellites both scored', `${sw.filter((w) => w.arms.ffm?.ok && w.arms.ffm3?.ok).length} satellites; ${interim}`, sw.filter((w) => w.arms.ffm?.ok && w.arms.ffm3?.ok), ['ffm', 'ffm3'], BINS, { paired: [], pairedWithRef: { ffm3: ['ffm'] } }));
    out.rows.push(tableRow('starlink-xpln', 'Starlink, XP-LN (fairness arm, A12) beside SGP4-XP and FFM v3, on the satellites all three fitted and scored', `${sw.filter((w) => v3both(w) && w.arms.xpln?.ok).length} satellites; ${interim}`, sw.filter((w) => v3both(w) && w.arms.xpln?.ok), ['sgp4xp', 'xpln', 'ffm3'], BINS, { paired: [], pairedWithRef: { ffm3: ['sgp4xp', 'xpln'], sgp4xp: ['xpln'] } }));
    out.rows.push(tableRow('starlink-ffm3-forecast', 'Starlink, the forecast sample with SGP4-XP, FFM v3 and SpaceX\'s forecast all scored', `sample satellites whose fetched file is F; ${interim}`, sw.filter((w) => v3both(w) && w.arms.forecast?.ok), ['sgp4xp', 'ffm3', 'forecast'], BINS, { paired: [], pairedWithRef: { ffm3: ['sgp4xp', 'forecast'] } }));
    // post-score, exploratory (coordinator ruling 2026-10-29): bins 2 and 3 under the E′ windows' registered relaxed rule (A12 point 7), one row
    const ex = rows(`starlink-score-explore.${through}.`).filter((r) => r.arms);
    if (ex.length || rows(`starlink-score-explore.${through}.`).length) {
      const all = rows(`starlink-score-explore.${through}.`);
      out.inputs.starlinkScoreExplore = sha256(Buffer.from(JSON.stringify(all)));
      out.starlink.binsTwoThreeExploratory = { rule: 'post-score, exploratory: the E′ windows\' relaxed rule (at least 60 % of the bin\'s coverable epochs, no gap over 8 h, states within its first and last 2 h)', satellites: all.length, counted: Object.fromEntries(['2', '3'].map((b) => [b, all.filter((r) => (r.relaxedCounted ?? []).includes(b)).length])) };
      const xw = ex.map((r) => ({ object: String(r.norad), arms: r.arms, maneuverEvident: r.maneuverEvident })).filter((w) => w.arms.sgp4xp?.ok && w.arms.ffm3?.ok);
      out.rows.push(tableRow('starlink-explore', 'Starlink, bins 2 and 3 under the E′ windows\' relaxed coverage rule (post-score, exploratory; not a registered result)', `${xw.length} satellites with SGP4-XP and FFM v3 scored; bin 2 counted for ${out.starlink.binsTwoThreeExploratory.counted['2']}, bin 3 for ${out.starlink.binsTwoThreeExploratory.counted['3']} of ${all.length}`, xw, ['sgp4xp', 'ffm3', 'xpln'], BINS, { paired: [], pairedWithRef: { ffm3: ['sgp4xp', 'xpln'] } }));
    }
    out.rows.push(tableRow('starlink-a3-round1', 'Starlink, A3\'s round-1 products on its 3,048 round-2-refused satellites (descriptive, labeled; counted as failed fits)', `${sw.filter((w) => w.arms.ffmRound1?.ok).length} satellites; never pooled with full fits; ${interim}`, sw.filter((w) => w.arms.ffmRound1).map((w) => ({ ...w, arms: { ffmRound1: w.arms.ffmRound1 } })), ['ffmRound1'], BINS, { paired: [] }));
    out.rows.push(tableRow('starlink-forecast-quiet', 'Starlink, the forecast sample with all three arms, no maneuver evident', `as above, truth files agreeing within 1 km where they overlap; ${interim}`, sw.filter((w) => forecastAll(w) && !w.maneuverEvident), ['sgp4xp', 'ffm', 'forecast'], BINS, { paired: [], pairedWithFfm: ['sgp4xp', 'forecast'] }));
  }
  // part 1b (the FFM arm by A5, from its own phase's rows)
  const iss = rows('iss.'), issFfm = new Map(rows('iss-ffm.').map((r) => [r.file, r]));
  out.inputs.iss = sha256(Buffer.from(JSON.stringify(iss)));
  if (issFfm.size) out.inputs.issFfm = sha256(Buffer.from(JSON.stringify([...issFfm.values()])));
  const issArms = ['sdnap', 'sgp4xp', 'sgp4', 'forecast', ...(issFfm.size ? ['ffm'] : [])];
  const withFfm = issFfm.size ? { pairedWithFfm: ['sgp4xp', 'sgp4', 'forecast'] } : {};
  const iw = iss.filter((r) => r.arms).map((r) => ({ object: 'ISS', arms: { ...r.arms, ...(issFfm.get(r.file)?.ffm ? { ffm: issFfm.get(r.file).ffm } : {}) } }));
  const ffmNote = issFfm.size ? `; FFM: ${Object.entries(tally(iss.filter((r) => r.arms).map((r) => { const f = issFfm.get(r.file)?.ffm; return !f ? 'not run' : f.ok ? 'fitted' : f.converged === false ? 'not converged' : `refused by propagator/ffm at the ${/^score:/.test(f.error) ? 'prediction' : 'fit'} (${refusal(f.error)})`; }))).map(([k, v]) => `${v} ${k}`).join(', ')}${[...issFfm.values()].some((r) => /space-weather-out-of-range/.test(r.ffm?.error ?? '')) ? ' (space-weather-out-of-range: the registered environment, B1\'s, drops 10 days of space weather, and propagator/ffm refuses an arc that spans one)' : ''}` : '';
  out.rows.push(tableRow('iss', 'ISS, NASA trajectory files 2020 to 2026', `${iss.length} files; ${iss.filter((r) => r.excluded?.startsWith('planned burn')).length} excluded for a planned burn, ${iss.filter((r) => r.excluded && !r.excluded.startsWith('planned burn')).length} without a newer file in the 72 h; ${iw.length} scored${ffmNote}`, iw, issArms, BINS, withFfm));
  out.rows.push(tableRow('iss-forecast', 'ISS, the windows NASA\'s file reaches (forecast beside)', 'windows whose own file holds the truth epochs', iw.filter((w) => w.arms.forecast?.ok), issArms, BINS, withFfm));
  // part 2
  const la = rows('laser.');
  out.inputs.laser = sha256(Buffer.from(JSON.stringify(la)));
  const lw = la.filter((r) => r.arms && !r.arms.error).map((r) => ({ object: r.target, arms: r.arms }));
  out.rows.push(tableRow('laser', 'LEO laser-ranged spheres from ILRS normal points (Starlette, Stella, LARETS, WESTPAC, LARES), 2026-07-16 to 08-30', `${la.length} cutoffs; SDN-AP and SGP4-XP fitted to 24 h of the full force model carried from the normal-point fit (not to the ranges directly)`, lw, ['sdnap', 'sgp4xp', 'ffm', 'sgp4', 'sdnapTruth'], BINS));
  for (const t of config.part2.targets) out.rows.push(tableRow(`laser-${t}`, `Laser, ${t}`, '', lw.filter((w) => w.object === t), ['sdnap', 'sgp4xp', 'ffm', 'sgp4', 'sdnapTruth'], BINS));
  // parts 3 and 4 (A4, A5, A6): each group's summary, written by part4-ca.mjs
  const ca = ['iss', 'laser', 'starlink', 'starlink.ffm3'].map((g) => path.join(store, 'rows', `ca.${g}.json`)).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  if (ca.length) out.ca = Object.fromEntries(ca.map((c) => [c.ffmArm && c.ffmArm !== 'ffm' ? `${c.group}.${c.ffmArm}` : c.group, c])); // A12: ffm3 in the FFM slot, the FFM arm of record
  const part5 = path.join(store, 'rows', 'ca.part5.json');
  if (fs.existsSync(part5)) out.part5 = JSON.parse(fs.readFileSync(part5, 'utf8'));
  const part5v3 = path.join(store, 'rows', 'ca.part5.ffm3.json');
  if (fs.existsSync(part5v3)) out.part5ffm3 = JSON.parse(fs.readFileSync(part5v3, 'utf8'));
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
    ...exploratoryMarkdown(c.exploratory),
  ];
}
/** A10's exploratory breakdown of FFM's refusals, labeled as such. */
function exploratoryMarkdown(x) {
  if (!x) return [];
  const sh = (v) => `${v.refused} of ${v.satellites} refused (${v.refusedShare == null ? '-' : (100 * v.refusedShare).toFixed(1)} %)`;
  return [
    'Exploratory (A10 point 2, not a registered test): FFM\'s refusals', '',
    `- by the track's mean distance from Earth's center: ${x.byShellKm.map((b) => `${b.meanRadiusKm[0]} to ${b.meanRadiusKm[1]} km: ${sh(b)}`).join('; ')};`,
    `- by the maneuver flag: evident ${sh(x.byManeuver.evident)}; not evident ${sh(x.byManeuver.notEvident)}${x.byManeuver.unknown.satellites ? `; no score row ${sh(x.byManeuver.unknown)}` : ''};`,
    `- by SGP4-XP's fit RMS on the same track (quartiles): ${x.bySgp4xpFitRmsKm.map((b) => `${num(b.fitRmsKm[0])} to ${Number.isFinite(b.fitRmsKm[1]) ? num(b.fitRmsKm[1]) : 'max'} km: ${sh(b)}`).join('; ')};`,
    `- FFM's reduced chi-square above its 90th percentile (${num(x.chi2Tail.p90)}): ${x.chi2Tail.tail} fits, ${x.chi2Tail.tailManeuverShare == null ? '-' : (100 * x.chi2Tail.tailManeuverShare).toFixed(1)} % of them maneuver-evident, against ${x.chi2Tail.bodyManeuverShare == null ? '-' : (100 * x.chi2Tail.bodyManeuverShare).toFixed(1)} % of the fits below it.`, '',
  ];
}

export function markdown(t) {
  const o = ['# B2: operator ephemerides and observations, SGP4-XP, FFM and the operators\' forecasts (parts 1 and 2)', ''];
  o.push(`Generated by \`node experiments/sdn-ap-mixed-screening/table.mjs\` from the stored rows; plan: [PLAN.md](../../experiments/sdn-ap-mixed-screening/PLAN.md) with its amendments A1 to A12. Modules at ${t.modulesCommit.slice(0, 12)}; SGP4-XP (THEORY SGP4XP) and SDN-AP run in propagator/sdn-ap build ${t.sdnapWasmSha256.slice(0, 12)}.`, '');
  o.push('A cell is the median over windows of a bin\'s 3D RMS (km), the 10th and 90th percentiles in parentheses, the 95 % bootstrap interval of the median over windows in brackets, and the windows scored. Part 1 bins are hours after E, (0, 24], (24, 48], (48, 72]; part 2 bins are days after T. SDN-AP in part 2 is fitted to 24 h of the full force model carried from the normal-point fit, not to the ranges directly.', '');
  o.push('Steps. Truth: part 1a the first 8 h of each newer SpaceX file at its 10-min epochs (GCRF); part 1b the first 24 h of each newer NASA file at its 4-min epochs (EME2000); part 2 NSGF orbits thinned to one state per 300 s. FFM: analysis/estimation fit_batch answered by propagator/ffm (gravity 70 x 70, Sun and Moon, radiation pressure, NRLMSISE-00 drag, solid tides, relativity; integrator tolerance 1e-10, steps of at most 120 s), fitted to the 24 h track\'s positions at 10 m per axis (part 1a every 10 min, part 1b every 4 min) and carried by the same model to the truth epochs. SGP4-XP and SDN-AP (propagator/sdn-ap, THEORY SGP4XP and SDNAP) are analytic theories fitted to the same 24 h track (in part 2, the 24 h the full force model carries back from the normal-point fit) and evaluated at the truth epochs; SGP4 is analysis/gp-error-model fit_elements on the track in part 1b and the newest public element set in part 2. The operator forecast is the operator\'s own file at the truth epochs.', '');
  o.push('Amendment A5 (2026-10-26): SDN-AP is withdrawn from part 1a (the owner withdrew the theory on 2026-10-25, before any part 1a fit or score); part 1b gains the FFM arm, added to windows whose other arms were scored and landed on 2026-10-25. Rows paired with FFM give the share of windows where FFM is closer and the median ratio other / FFM.', '');
  if (!t.rows.some((r) => r.id.startsWith('starlink'))) o.push('Part 1a (Starlink, prospective) is scored bin by bin as the capture cycles complete each bin\'s truth (A5): bin 1 from 2026-10-26 21:01Z, bin 3 from 2026-10-28 21:01Z; its rows are not in this table yet.', '');
  if (t.starlink) {
    const h = t.starlink.headline;
    o.push(`**Part 1a headline (A10): FFM fitted ${h.ffmFitted} of ${h.satellites} Starlink tracks; propagator/ffm refused ${h.ffmRefused} (${(100 * h.ffmRefused / h.satellites).toFixed(1)} %) when fit_batch stepped B or AGOM out of range in A3's first round, and ${h.ffmNotConverged} did not converge (defect modules-ffm-fit-batch-round1-out-of-range-20261026, not fixed here). FFM against SGP4-XP is compared on the satellites both arms fitted; SGP4-XP on the others is descriptive.**`, '');
    const bc = t.starlink.binsCounted;
    if (bc?.['2']?.complete && !bc['2'].counted && !bc['3'].counted) o.push(`**Bins 2 and 3 are empty under the registered rule: the capture reads each SpaceX file's first 8 h once per 8 h cycle, which leaves a gap of about 7 h in every day of truth, so no satellite holds 90 % of a bin's coverable epochs after bin 1 (bin 2 below coverage for ${bc['2'].belowCoverage}, bin 3 for ${bc['3'].belowCoverage}). Bin 1, (0, 24] h, is the only primary result.${t.starlink.binsTwoThreeExploratory ? ` A secondary row, labeled post-score and exploratory, applies the E′ windows' registered relaxed rule to bins 2 and 3 (counted for ${t.starlink.binsTwoThreeExploratory.counted['2']} and ${t.starlink.binsTwoThreeExploratory.counted['3']} satellites).` : ''}**`, '');
    const a = t.starlink.a12;
    if (a) {
      const fitted = a.ffm3Fit['fitted (CONVERGED)'] ?? 0, n = Object.values(a.ffm3Fit).reduce((x, y) => x + y, 0);
      o.push(`**A12 headline: A3 refused in any round ${a.a3.refusedAnyRound} of ${a.a3.tracks} (${(100 * a.a3.refusedAnyRound / a.a3.tracks).toFixed(1)} %; round 1 alone ${a.a3.refusedRoundOne}, ${(100 * a.a3.refusedRoundOne / a.a3.tracks).toFixed(1)} %), its ${a.a3.roundTwoRefusedCountedFailed} round-2-refused satellites counted failed and their round-1 products shown only as a labeled descriptive row; ${a.a3.note65202}. FFM v3 (fit_batch version 3, profile ${a.profile}${a.gateFailed ? ', gate failed' : ''}) fitted ${fitted} of ${n} (${n ? (100 * (n - fitted) / n).toFixed(1) : '-'} % failed, ${a.ffm3Refused} with a refused trial); XP-LN fitted ${a.xplnFit.fitted ?? 0}. FFM v3 is the FFM arm of record for the conjunction contrast and part 5; A3 is reported as registered.**`, '');
    }
  }
  for (const r of t.rows) {
    o.push(`## ${r.row}`, '', r.note ? `${r.note}.` : '', '', '| Arm | Scored / attempted | Bin 1 | Bin 2 | Bin 3 |', '| --- | --: | --- | --- | --- |');
    for (const [arm, a] of Object.entries(r.arms)) o.push(`| ${NAMES[arm]} | ${a.scored} / ${a.attempted} | ${['1', '2', '3'].map((b) => cell(a.bins[b])).join(' | ')} |`);
    o.push('', `Closest by bin: ${['1', '2', '3'].map((b) => `${b}: ${r.closest[b] ? r.closest[b].map((x) => NAMES[x]).join(', ') : '-'}`).join('; ')}.`, '');
    for (const [ref, paired] of [['sdnap', r.paired], ['ffm', r.pairedWithFfm ?? {}], ...Object.entries(r.pairedWithRef ?? {})]) {
      const p = Object.entries(paired).filter(([, v]) => Object.values(v).some((x) => x.n));
      if (!p.length) continue;
      o.push(`| Paired with ${REF[ref]} | Bin 1 | Bin 2 | Bin 3 |`, '| --- | --- | --- | --- |');
      for (const [other, v] of p) o.push(`| ${NAMES[other]} | ${['1', '2', '3'].map((b) => (v[b].n ? `${REF[ref]} closer in ${Math.round(100 * v[b][`${ref}Closer`])} %; other / ${REF[ref]} ${km(v[b].medianRatio)}${v[b].ci95Windows ? ` [${km(v[b].ci95Windows[0])}, ${km(v[b].ci95Windows[1])}]` : ''} (n ${v[b].n})` : '-')).join(' | ')} |`);
      o.push('');
    }
    if (r.id === 'starlink-both' && t.starlink) o.push(...starlinkMarkdown(t.starlink));
  }
  if (t.ca) o.push(...caMarkdown(t.ca));
  if (t.part5ffm3) o.push(...partFiveMarkdown(t.part5ffm3, 'FFM v3 of A12 (the FFM arm of record)'));
  if (t.part5) o.push(...partFiveMarkdown(t.part5, 'FFM as A3 registered'));
  return o.join('\n');
}

const pct = (x) => (x == null ? '-' : `${(100 * x).toFixed(x !== 0 && Math.abs(x) < 0.001 ? 3 : 1)} %`);
const ci = (c) => (c ? ` [${pct(c[0])}, ${pct(c[1])}]` : '');
const rate = (x) => (x ? `${pct(x.value)}${ci(x.ci95Encounters)}${x.ci95Objects ? `, objects${ci(x.ci95Objects)}` : ''}` : '-');
const GROUP = { iss: 'ISS (part 1b)', laser: 'Laser spheres (part 2)', starlink: 'Starlink (part 1a), FFM as A3 registered', 'starlink.ffm3': 'Starlink (part 1a), FFM v3 of A12 in the FFM slot (the FFM arm of record)' };
const COV = { ffm: 'FFM', sgp4xp: 'SGP4-XP', v1c5: 'V1c5 frozen (public set, SGP4)', uncalibrated: 'uncalibrated (public set, SGP4)', v1c4: 'V1c4 best (public set, SGP4)' };
/** Parts 3 and 4 as prose and tables. */
function caMarkdown(ca) {
  const o = ['## Conjunction contrast: FFM against SGP4-XP, with Pc calls (parts 3 and 4; A4, A5, A6)', ''];
  o.push('Steps. Each window\'s arms are predicted at the truth epoch nearest each lead time (1, 6, 12, 24, 48 and 72 h after E or T): FFM with fit_batch\'s formal covariance times max(1, reduced chi-square) carried by propagator/ffm (no process noise); SGP4-XP with the module\'s fit covariance carried by sdnap_covariance_at; the public element set by SGP4 with V1c5\'s frozen covariance (and, for part 3, the uncalibrated and V1c4 covariances) in V1c5\'s runtime. pair_statistics gives each error and covariance in the truth\'s RTN axes and d². Encounters are synthetic with real errors: 20,000 per group and class, a relative speed of 10 km/s at a crossing angle uniform in [10, 170] degrees, a true miss log-uniform in [10 m, 10 km] in the encounter plane; the GP class pairs the primary with a public-set secondary, the precise class with another object predicted by the same arm. Pc is analysis/conjunction-assessment compute_pc (Foster, 20 m combined hard-body radius). Calls: red Pc >= 1e-4, yellow 1e-7 <= Pc < 1e-4, green Pc < 1e-7. Intervals are 95 % bootstrap intervals over encounters and, where marked, over primary objects.', '');
  for (const [g, c] of Object.entries(ca)) {
    o.push(`### ${GROUP[g] ?? g}`, '', `${c.leadRows} windows with lead records over ${c.objects} object(s); public-set records: ${listed(c.gpExcluded)}.`, '');
    o.push('Part 3, covariance realism (mean d²/3 [95 % object-cluster interval]; 95 % coverage; samples / objects; V1c5\'s rule: mean in [0.8, 1.25], coverage in [0.93, 0.97], at least 30 samples from 3 objects).', '');
    o.push(`| Covariance | ${LEAD_COLS.map((L) => `${L} h`).join(' | ')} |`, `| --- | ${LEAD_COLS.map(() => '---').join(' | ')} |`);
    for (const [label, cells] of Object.entries(c.realism)) o.push(`| ${COV[label] ?? label} | ${LEAD_COLS.map((L) => { const x = cells[L]; return !x?.n ? '-' : `${num(x.meanD2Over3)}${x.ci95Objects ? ` [${num(x.ci95Objects[0])}, ${num(x.ci95Objects[1])}]` : ''}; ${pct(x.coverage95)}; ${x.n} / ${x.objects}; ${x.decision.toLowerCase()}`; }).join(' | ')} |`);
    o.push('');
    for (const [cls, s] of Object.entries(c.classes)) {
      o.push(`Part 4, ${cls === 'gp' ? 'GP secondary (public set, V1c5 frozen covariance)' : 'precise secondary (another object, the same arm)'}: ${s.encounters} encounters over ${s.objects} primary object(s) (${s.counts.noPrimary} draws without a primary, ${s.counts.noSecondary} without a secondary).`, '');
      o.push('| Arm | Missed alert (Pc < 1e-7, true miss < 200 m) | False alert (Pc >= 1e-4, true miss > 5 km) | Recall | Precision | Miss-distance error, m (p10 to p90) |', '| --- | --- | --- | --- | --- | --- |');
      for (const [arm, x] of Object.entries(s.arms)) o.push(`| ${NAMES[arm]} | ${rate(x.missedAlert)} | ${rate(x.falseAlert)} | ${rate(x.recall)} | ${rate(x.precision)} | ${num(x.missErrorM.median)} (${num(x.missErrorM.p10)} to ${num(x.missErrorM.p90)}) |`);
      for (const [pair, x] of Object.entries(s.paired)) o.push(`| ${pair.split('-').map((a) => NAMES[a]).join(' - ')} | ${rate(x.missedAlert)} | ${rate(x.falseAlert)} | ${rate(x.recall)} | ${rate(x.precision)} | |`);
      o.push('', `Verdict: ${s.verdict}${s.verdictReason ? ` (${s.verdictReason})` : ''}.`, '');
      o.push('Pc calls by lead time (counts by true miss: under 200 m / 200 m to 5 km / above 5 km; red calls with true miss above 5 km; true misses under 200 m called green).', '');
      o.push('| Lead | Arm | Red | Yellow | Green | Red, true miss > 5 km | Under 200 m, called green |', '| --- | --- | --- | --- | --- | --- | --- |');
      for (const [L, arms] of Object.entries(s.calls)) for (const [arm, x] of Object.entries(arms)) o.push(`| ${L} h | ${NAMES[arm]} | ${['red', 'yellow', 'green'].map((k) => ['under 200 m', '200 m to 5 km', 'above 5 km'].map((tc) => x.matrix[k]?.[tc] ?? 0).join(' / ')).join(' | ')} | ${rate(x.redFar)} | ${rate(x.hitGreen)} |`);
      o.push('');
    }
  }
  return o;
}
const LEAD_COLS = [1, 6, 12, 24, 48, 72];
/** Part 5 (A4, A8): real Starlink close approaches, per class. */
function partFiveMarkdown(p, ffmLabel = 'FFM') {
  const o = [`## Real Starlink close approaches: FFM against SGP4-XP, with Pc calls (part 5; A4, A5, A8); FFM: ${ffmLabel}`, ''];
  o.push(`Steps. The part 1a satellites both SGP4-XP and FFM fitted; in 1 h windows from the earliest E to the latest E + 72 h, the truth (the newer SpaceX files at their 10-min epochs) and FFM's and SGP4-XP's predictions at the same epochs are each screened all-vs-all by analysis/conjunction-assessment (explicit OEM samples, 5 km threshold, its range sampled every 5 s), a satellite entering a window only where its truth covers it. Events of a pair within 10 min are one encounter; it enters when any set's miss is under 5 km. Each entering encounter is assessed by assess_conjunction over 20 min: the truth's closest approach, and each arm's TCA, miss and Pc (Foster, 20 m combined) from its ephemeris at 60 s steps with its covariance (FFM: fit_batch's formal covariance times max(1, reduced chi-square) carried by propagator/ffm; SGP4-XP: the module's). Screens through the capture cycle ${p.through}.`, '');
  o.push(`${p.encounters} encounters, ${p.entering} entering; ${p.setAside} set aside (a truth gap at the encounter); ${p.truthFailed} whose truth assessment failed. Screens: ${Object.entries(p.screens.bySet).map(([set, x]) => `${NAMES[set] ?? 'truth'}: ${x.windows} windows, ${x.events} events, ${x.pairsScreened} pair-windows, ${x.meanCovered.toFixed(0)} satellites covered per window`).join('; ')}.`, '');
  for (const [cls, s] of Object.entries(p.classes)) {
    o.push(`### ${cls === 'unmaneuvered' ? 'Pairs with no maneuver evident' : 'Pairs with a maneuver evident (either satellite)'}`, '');
    if (!s.encounters) { o.push('No encounter in this class.', ''); continue; }
    o.push(`${s.encounters} encounters over ${s.objects} primary object(s)${s.encounters < 30 ? ' (a small count: intervals are wide or absent)' : ''}; ${s.counts.leftOut} left out where an arm's Pc could not be evaluated (A7).`, '');
    o.push('| Arm | Missed alert (Pc < 1e-7, true miss < 200 m) | False alert (Pc >= 1e-4, true miss > 5 km) | Recall | Precision | Miss-distance error, m (p10 to p90) |', '| --- | --- | --- | --- | --- | --- |');
    for (const [arm, x] of Object.entries(s.arms)) if (x.missedAlert) o.push(`| ${NAMES[arm]} | ${rate(x.missedAlert)} | ${rate(x.falseAlert)} | ${rate(x.recall)} | ${rate(x.precision)} | ${num(x.missErrorM.median)} (${num(x.missErrorM.p10)} to ${num(x.missErrorM.p90)}) |`);
    for (const [pair, x] of Object.entries(s.paired)) o.push(`| ${pair.split('-').map((a) => NAMES[a]).join(' - ')} | ${rate(x.missedAlert)} | ${rate(x.falseAlert)} | ${rate(x.recall)} | ${rate(x.precision)} | |`);
    o.push('', `Verdict: ${s.verdict}${s.verdictReason ? ` (${s.verdictReason})` : ''}.`, '');
    o.push('| Arm | Red | Yellow | Green | Red, true miss > 5 km | Under 200 m, called green |', '| --- | --- | --- | --- | --- | --- |');
    for (const [arm, x] of Object.entries(s.calls.all ?? {})) o.push(`| ${NAMES[arm]} | ${['red', 'yellow', 'green'].map((q) => ['under 200 m', '200 m to 5 km', 'above 5 km'].map((tc) => x.matrix[q]?.[tc] ?? 0).join(' / ')).join(' | ')} | ${rate(x.redFar)} | ${rate(x.hitGreen)} |`);
    o.push('');
  }
  return o;
}
const num = (v) => (v == null ? '-' : Math.abs(v) >= 1000 ? v.toExponential(2) : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const t = build();
  if (args.check) { const same = sameAsCommitted(t); console.error(same ? 'B2 table: PASS (same as committed)' : 'B2 table: differs from committed'); process.exit(same ? 0 : 1); }
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(TABLE, `${JSON.stringify(t, null, 2)}\n`);
  fs.writeFileSync(path.join(results, 'README.md'), markdown(t));
  console.error(`B2 table: ${t.rows.length} rows`);
}
