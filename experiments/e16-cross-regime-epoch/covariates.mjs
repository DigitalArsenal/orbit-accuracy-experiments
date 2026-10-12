// E16's covariates (PLAN.md 5.2), groups O and W: element-set fields and space weather as released at the OMM's
// creation. Group G is E1's geometry (module-computed, E1 geometry.mjs); group F, the fleet nowcast, is formed from
// the samples' errors in the fit step (fleet.mjs). Bookkeeping on fields and published indices only.
import { releasedSpwRows } from '../../harness/cutoff-environment.mjs';
import { DAY_MS, HOUR_MS, config } from './common.mjs';

const RAD = Math.PI / 180;

// O: fields of the set and of the object's previous set (sets sorted by epoch; index i).
export function orbitCovariates(sets, i) {
  const s = sets[i], e = s.elements;
  const u = (e.ARG_OF_PERICENTER + e.MEAN_ANOMALY) * RAD;
  const prev = i > 0 ? sets[i - 1] : null;
  const gapDays = prev ? (s.epochMs - prev.epochMs) / DAY_MS : Infinity;
  const near = gapDays > 0 && gapDays <= config.q1.previousOmmWithinDays;
  return {
    sinU: Math.sin(u), cosU: Math.cos(u), sin2U: Math.sin(2 * u), cos2U: Math.cos(2 * u),
    ecc: e.ECCENTRICITY, cosI: Math.cos(e.INCLINATION * RAD), lnN: Math.log(e.MEAN_MOTION),
    latencyHours: (s.createdMs - s.epochMs) / HOUR_MS,
    gapHours: near ? gapDays * 24 : 0,
    dnPerDay: near ? (e.MEAN_MOTION - prev.elements.MEAN_MOTION) / gapDays : 0,
    noPrevious: near ? 0 : 1,
  };
}

// W (LEO): B* (clipped), released Ap means over the 24 h and the 24-72 h before the cutoff, the previous day's F10.7
// and the cutoff day's 81-day mean, and B* times each. `spw`: {gfz, rsga} (harness readers). Cached by RSGA issue.
export function weatherCovariates(set, spw, cache) {
  const cutoff = set.createdMs;
  const issue = spw.rsga.reports.filter((r) => r.issuedMs <= cutoff).at(-1);
  if (!issue) throw new Error(`no RSGA issued by ${new Date(cutoff).toISOString()}`);
  const key = issue.issuedMs;
  if (!cache.has(key)) {
    const { rows } = releasedSpwRows(spw.gfz, spw.rsga, cutoff, cutoff - 5 * DAY_MS, cutoff + DAY_MS);
    cache.set(key, new Map(rows.map((r) => [r.DATE, r])));
  }
  const rows = cache.get(key);
  const apAt = (ms) => { const r = rows.get(new Date(ms).toISOString().slice(0, 10)); if (!r) return null; return r[`AP${1 + Math.floor(((ms % DAY_MS) + DAY_MS) % DAY_MS / (3 * HOUR_MS))}`]; };
  const mean = (lo, hi) => { const xs = []; for (let t = lo; t < hi; t += 3 * HOUR_MS) { const a = apAt(t); if (a !== null && a !== undefined) xs.push(a); } return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const ap24 = mean(cutoff - 24 * HOUR_MS, cutoff), ap72 = mean(cutoff - 72 * HOUR_MS, cutoff - 24 * HOUR_MS);
  const today = rows.get(new Date(cutoff).toISOString().slice(0, 10));
  const yesterday = rows.get(new Date(cutoff - DAY_MS).toISOString().slice(0, 10));
  const [lo, hi] = config.q1.bstarClip;
  const b = Math.min(hi, Math.max(lo, set.elements.BSTAR));
  const w = { bstar: b, ap24, ap72, f107: yesterday?.F107_OBS ?? null, f81: today?.F107_OBS_CENTER81 ?? null };
  if (Object.values(w).some((v) => v === null || !Number.isFinite(v))) return null;
  return { ...w, bAp24: b * w.ap24, bAp72: b * w.ap72, bF107: b * w.f107, bF81: b * w.f81, rsgaIssue: new Date(key).toISOString() };
}
