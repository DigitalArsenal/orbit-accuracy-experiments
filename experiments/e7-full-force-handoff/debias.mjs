// Periodic along-track debiasing from an object's own history before the
// cutoff (PLAN.md section 4), after Hallgarten La Casta and Amato (2025,
// arXiv:2412.15793): the OMM's along-track error at epoch, in seconds of
// flight, modelled as a constant plus one sinusoid in the Moon's mean anomaly
// (the anomaly pair of E1's features, from module-computed Moon geometry),
// fitted by ridge regression to the object's OMMs whose precise orbit was
// released before the cutoff, over the latest `windowDays` of them; applied
// as E1 applies a correction (mean anomaly + n dt). Statistics on module
// outputs and edits of element-set fields only.
import { json } from '../../harness/modules.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { geometry } from '../e1-gps-epoch/geometry.mjs';
import { shiftAlongTrack } from '../e1-gps-epoch/methods.mjs';
import { varianceCovariates } from '../e1-gps-epoch/features.mjs';
import { fitRidge } from '../e1-gps-epoch/models.mjs';
import { config, DAY_MS } from './common.mjs';

// When a truth product was public: Sentinel-1 POEORB from the creation time
// in its name; the others at the end of their span plus the configured
// latency of their service.
export function truthReleaseMs(entry) {
  const s1 = /OPOD_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})_/.exec(entry.product);
  if (s1) return Date.UTC(+s1[1], +s1[2] - 1, +s1[3], +s1[4], +s1[5], +s1[6]);
  const rule = Object.entries(config.cutoff.truthLatencyDays).find(([prefix]) => entry.product.startsWith(prefix));
  if (!rule) throw new Error(`no release latency for ${entry.product}`);
  return entry.stop + rule[1] * DAY_MS;
}

// The at-epoch along-track errors and Moon covariates of one object's OMMs,
// computed once per OMM.
export class ObjectHistory {
  constructor(ctx, products, sets, scales) {
    Object.assign(this, { ctx, products, sets, scales });
    this.errors = new Map();      // gpId -> {dtSeconds, releaseMs} | null
    this.covariates = new Map();  // gpId -> [mc, ms]
  }

  async errorOf(set) {
    if (this.errors.has(set.gpId)) return this.errors.get(set.gpId);
    const tol = config.targetToleranceSeconds * 1000, half = config.binHalfWidthSeconds / 86400;
    const s = this.products.firstAtOrAfter(set.norad, set.epochMs, tol);
    let out = null;
    if (s) {
      const age = (s.ms - set.epochMs) / DAY_MS;
      const acc = await this.ctx['gp-error-model'].invokeJson('accumulate', [ommFrame([set]), this.products.frame(s.entry),
        json('options', { ageBinsDays: [[Math.max(0, age - half), age + half]], referenceStepSeconds: 0 })], 'accumulator');
      const one = acc.strata.filter((x) => x.n === 1);
      if (one.length === 1) {
        const speed = Math.hypot(...s.v);  // km/s, the truth state's speed
        out = { dtSeconds: one[0].sum[1] / speed, releaseMs: truthReleaseMs(s.entry) };
      }
    }
    this.errors.set(set.gpId, out);
    return out;
  }

  async covariatesOf(sets) {
    const missing = sets.filter((s) => !this.covariates.has(s.gpId));
    if (missing.length) {
      const g = await geometry(this.ctx.frames, this.ctx['epoch-state'], missing);
      missing.forEach((s, i) => this.covariates.set(s.gpId, varianceCovariates(g[i], this.scales).slice(0, 2)));
    }
    return sets.map((s) => this.covariates.get(s.gpId));
  }

  // The model at a cutoff: {kind: 'periodic' | 'constant', fit, n, from, to}
  // or {kind: 'none', n} when fewer than the minimum OMMs qualify.
  async fit(cutoffMs, windowDays) {
    const d = config.debias;
    const candidates = [];
    for (const s of this.sets) {
      if (s.epochMs > cutoffMs || Date.parse(`${s.creationDate.slice(0, 19)}Z`) > cutoffMs) continue;
      if (s.epochMs < cutoffMs - (windowDays + d.maximumLatencyDays) * DAY_MS) continue;
      const e = await this.errorOf(s);
      if (e && e.releaseMs <= cutoffMs) candidates.push({ s, e });
    }
    if (!candidates.length) return { kind: 'none', n: 0 };
    const latest = Math.max(...candidates.map((c) => c.s.epochMs));
    const used = candidates.filter((c) => c.s.epochMs >= latest - windowDays * DAY_MS);
    const y = used.map((c) => c.e.dtSeconds);
    if (used.length >= d.minimumSamples) {
      const rows = await this.covariatesOf(used.map((c) => c.s));
      return { kind: 'periodic', fit: fitRidge(rows, y, { lambda: d.ridge }), n: used.length, latestMs: latest };
    }
    if (used.length >= d.minimumConstantSamples) return { kind: 'constant', fit: { mean: y.reduce((a, b) => a + b, 0) / y.length }, n: used.length, latestMs: latest };
    return { kind: 'none', n: used.length };
  }

  // Corrected copies of sets under a model (the correction is minus the
  // predicted along-track error in seconds of flight).
  async apply(model, sets) {
    if (model.kind === 'none') return sets.map((s) => ({ ...s, correctionSeconds: 0 }));
    if (model.kind === 'constant') return sets.map((s) => ({ ...shiftAlongTrack(s, -model.fit.mean), epochMs: s.epochMs }));
    const rows = await this.covariatesOf(sets);
    return sets.map((s, i) => ({ ...shiftAlongTrack(s, -(model.fit.intercepts.all + model.fit.beta[0] * rows[i][0] + model.fit.beta[1] * rows[i][1])), epochMs: s.epochMs }));
  }
}
