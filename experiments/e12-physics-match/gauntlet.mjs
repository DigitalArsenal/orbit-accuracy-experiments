// The physics-match gauntlet (PLAN.md section 5): a tournament of hypotheses
// on one maneuver-free segment. The incumbent starts as HPOP's full force on
// the file's labels (or a classifier's proposal); axis by axis, from the
// largest signature to the smallest, every admissible level challenges it,
// and a challenger replaces it only when its second-half closure is better by
// the stated margin without a worse first-half fit (BIC). Passes repeat until
// one changes nothing; the last pass gives each axis's margin (how much worse
// the best other level closes), which is the identification's confidence.
import { AXES, WEATHER_MODELS, label, validate } from './hypothesis.mjs';
import { scoreHypothesis } from './fit.mjs';

// The search order; DRAG is the joint (atmosphere, spaceWeather) axis.
export const ORDER = ['frame', 'timeScale', 'eop', 'gravityModel', 'degree', 'thirdBodies', 'solidTides', 'oceanTides', 'relativity', 'srp', 'earthRadiation', 'DRAG'];

// Admissible levels of an axis for the segment and the incumbent.
function levels(axis, h, segment) {
  if (axis === 'frame') return segment.label.frame === 'ITRF' ? ['ITRF'] : AXES.frame.filter((f) => f !== 'ITRF');
  if (axis === 'gravityModel') return h.degree > 2 ? AXES.gravityModel : ['EGM2008'];
  if (axis === 'degree') return h.gravityModel === 'EGM96' ? AXES.degree.filter((d) => d > 2) : AXES.degree;
  if (axis === 'ephemeris') return h.thirdBodies === 'NONE' ? [h.ephemeris] : AXES.ephemeris;
  if (axis === 'earthRadiation') return h.srp === 'NONE' ? [false] : AXES.earthRadiation;
  if (axis === 'DRAG') {
    // A static model's level carries FORECAST, which it never reads.
    if (!segment.drag) return [['NONE', 'FORECAST']];
    const out = [['NONE', 'FORECAST']];
    for (const a of AXES.atmosphere.filter((x) => x !== 'NONE')) {
      if (!WEATHER_MODELS.has(a)) { out.push([a, 'FORECAST']); continue; }
      for (const w of AXES.spaceWeather) if (!(a === 'JB2008' && w === 'CONSTANT') && !(w === 'OBSERVED' && !segment.observedWeather)) out.push([a, w]);
    }
    return out;
  }
  return AXES[axis];
}
const setAxis = (h, axis, level) => {
  if (axis === 'DRAG') return { ...h, atmosphere: level[0], spaceWeather: level[1] };
  const out = { ...h, [axis]: level };
  if (axis === 'srp' && level === 'NONE') out.earthRadiation = false;
  if (axis === 'gravityModel' && level === 'EGM96' && out.degree <= 2) out.degree = 4;
  return out;
};
const levelOf = (h, axis) => (axis === 'DRAG' ? [h.atmosphere, WEATHER_MODELS.has(h.atmosphere) ? h.spaceWeather : 'FORECAST'] : h[axis]);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// segment: {id, label, points (published), cutoffMs, drag, observedWeather};
// settings: config.fit + config.gauntlet; proposals: optional {axis: [levels by
// probability]} from the classifier, which restricts each axis to its top
// `settings.proposalTopK` levels plus the incumbent's.
export async function runGauntlet(env, segment, start, settings, { proposals = null, presets = null, log = () => {} } = {}) {
  const g = settings.gauntlet;
  const converted = new Map(), scores = new Map();
  const pointsFor = async (h) => {
    const key = `${h.frame}/${h.timeScale}/${h.eop}`;
    if (!converted.has(key)) converted.set(key, await env.toGcrf(segment.points, segment.label, h));
    return converted.get(key);
  };
  const evaluate = async (h, warm) => {
    const key = label(h);
    if (scores.has(key)) return scores.get(key);
    let s;
    try {
      validate(h);
      s = await scoreHypothesis(env, h, segment, await pointsFor(h), settings, { start: warm ?? {} });
    } catch (error) { s = { error: String(error.message ?? error).slice(0, 200) }; }
    scores.set(key, s);
    log(`${key}: ${s.error ? `error ${s.error}` : `fit ${s.fitRms.toExponential(2)} closure ${s.closureRms.toExponential(2)} max ${s.closureMax.toExponential(2)} m`}`);
    return s;
  };
  const beats = (c, i) => !c.error && (i.error || (i.closureRms > g.floorM && c.closureRms < (1 - g.closureMargin) * i.closureRms && c.bic <= i.bic + g.bicSlack));

  let incumbent = start, best = await evaluate(incumbent);
  if (best.error) throw new Error(`the starting hypothesis fails: ${best.error}`);
  // Whole-stack presets (config.presets: e.g. GMAT's defaults, a SPICE-based
  // stack) challenge the start once, as one hypothesis each.
  const presetScores = {};
  for (const [name, overrides] of Object.entries(presets ?? {})) {
    const h = { ...start, ...overrides, ...(segment.label.frame === 'ITRF' ? { frame: 'ITRF' } : {}), ...(segment.drag ? {} : { atmosphere: 'NONE' }) };
    const s = await evaluate(h, best.start);
    presetScores[name] = s.error ? { error: s.error } : { label: label(h), closureRms: s.closureRms, closureMax: s.closureMax, bic: s.bic };
    if (beats(s, best)) { incumbent = h; best = s; presetScores[name].adopted = true; }
  }
  const passes = [];
  for (let pass = 1; pass <= g.maximumPasses; ++pass) {
    let changed = false;
    const margins = {};
    for (const axis of ORDER) {
      let candidates = levels(axis, incumbent, segment);
      if (proposals?.[axis]) {
        const ranked = proposals[axis].filter((l) => candidates.some((c) => same(c, l)));
        candidates = [...new Map([...ranked.slice(0, g.proposalTopK), levelOf(incumbent, axis)].map((l) => [JSON.stringify(l), l])).values()];
      }
      const tried = [];
      for (const level of candidates) {
        if (same(level, levelOf(incumbent, axis))) continue;
        const h = setAxis(incumbent, axis, level);
        tried.push({ level, score: await evaluate(h, best.start) });
      }
      const ok = tried.filter((t) => !t.score.error).sort((a, b) => a.score.closureRms - b.score.closureRms);
      const runnerUp = ok[0];
      if (runnerUp && beats(runnerUp.score, best)) {
        incumbent = setAxis(incumbent, axis, runnerUp.level);
        best = runnerUp.score;
        changed = true;
        margins[axis] = { changed: true, level: runnerUp.level };
      } else {
        margins[axis] = { level: levelOf(incumbent, axis), runnerUp: runnerUp?.level ?? null, ratio: runnerUp ? runnerUp.score.closureRms / best.closureRms : null, deltaBic: runnerUp ? runnerUp.score.bic - best.bic : null, tested: tried.length };
      }
    }
    passes.push({ pass, incumbent: label(incumbent), closureRms: best.closureRms, changed, margins });
    if (!changed) break;
  }
  const last = passes.at(-1).margins;
  const confidence = Object.fromEntries(ORDER.map((axis) => {
    const m = last[axis];
    if (!m || m.changed || m.ratio === null) return [axis, 'untested'];
    if (best.closureRms <= g.floorM && m.ratio * best.closureRms <= g.floorM) return [axis, 'unresolved'];
    return [axis, m.ratio >= g.strongRatio && m.deltaBic >= g.strongDeltaBic ? 'strong' : m.ratio >= 1 / (1 - g.closureMargin) ? 'moderate' : 'weak'];
  }));
  return { hypothesis: incumbent, label: label(incumbent), score: { ...best, start: undefined }, start: best.start, presets: presetScores, passes, confidence, evaluations: scores.size, converged: !passes.at(-1).changed };
}
