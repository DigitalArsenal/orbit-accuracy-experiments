// Q1's corrections for any OMM of a LEO object (PLAN.md 6.2, S-corr and A-corr): M* of the tier O fold that holds
// the object out, applied to the OMM's covariates — E1's geometry (modules), the element-set fields, space weather as
// released at its creation, and the fleet nowcast from the other folds' released truth. Bookkeeping and the fitted
// regression only; the corrected OMMs are scored by the modules.
import { geometry } from '../e1-gps-epoch/geometry.mjs';
import { config } from './common.mjs';
import { orbitCovariates, weatherCovariates } from './covariates.mjs';
import { Fleet, correctionOf, fleetSample } from './q1lib.mjs';

// models: q1-models.json's LEO group; fleetRows: kept epoch samples (step 20) of the windows the fleet may read;
// meta: inventory objects by NORAD number; spw: {gfz, rsga}.
export function makeCorrector({ ctx, models, fleetRows, meta, spw }) {
  const weatherCache = new Map();
  const fleets = new Map();
  const fleetOf = (fold) => {
    if (!fleets.has(fold)) fleets.set(fold, new Fleet(fleetRows.filter((r) => meta.get(r.norad)?.tiers.O !== fold).map(fleetSample)));
    return fleets.get(fold);
  };
  // objectSets: every set of the object in epoch order; list: the sets to correct. -> Map(gpId -> dt seconds).
  return async function corrections(norad, objectSets, list) {
    const fold = meta.get(norad).tiers.O;
    const model = models.tiers[`O:${fold}`];
    const spec = models.spec;
    const out = new Map();
    if (!list.length) return out;
    const geo = await geometry(ctx.frames, ctx['epoch-state'], list);
    list.forEach((s, k) => {
      const W = weatherCovariates(s, spw, weatherCache);
      if (!W) return;
      const row = { norad, createdMs: s.createdMs, meanMotion: s.elements.MEAN_MOTION, G: geo[k], O: orbitCovariates(objectSets, objectSets.indexOf(s)), W };
      row.fleet = spec.family === 'C2' || spec.family === 'C3' ? fleetOf(fold).value(row, spec.L, spec.dn, config.q1.groups.LEO.families.C2.minimumContributors) : null;
      out.set(s.gpId, correctionOf({ candidate: spec, standardizer: model.standardizer, fit: model.fit }, row, models.scales));
    });
    return out;
  };
}
