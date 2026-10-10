// The classifiers' proposals for a segment (PLAN.md section 6): for each axis,
// its levels ranked by the probability step 20's model gives the default
// fit's fingerprint. The gauntlet's joint DRAG axis gets the product of the
// atmosphere and space-weather probabilities. Statistics only.
import fs from 'node:fs';
import { predict } from '../../harness/boosting.mjs';

export function loadModels(file) {
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { file, axes: m.axes };
}

export function propose(models, vector, { drag }) {
  const out = {}, probs = {};
  for (const [axis, a] of Object.entries(models.axes)) {
    if (!a.model) continue;
    const p = predict(a.model, vector);
    probs[axis] = a.classes.map((c, k) => [c, p[k]]).sort((x, y) => y[1] - x[1]);
    out[axis] = probs[axis].map(([c]) => c);
  }
  if (drag && probs.atmosphere) {
    const sw = probs.spaceWeather ?? [['FORECAST', 1]];
    out.DRAG = probs.atmosphere.flatMap(([a, pa]) => (['NRLMSISE00', 'JB2008', 'JACCHIA_ROBERTS'].includes(a) ? sw.map(([w, pw]) => [[a, w], pa * pw]) : [[[a, 'FORECAST'], pa]]))
      .sort((x, y) => y[1] - x[1]).map(([l]) => l);
  }
  delete out.atmosphere; delete out.spaceWeather;
  return { proposals: out, probabilities: probs };
}
