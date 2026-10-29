// One fetched file to its stored products: the registered E13b record and the covariance sidecar (amendment A4). No files, no scheduling.
import { registeredHead, retainedPoints } from './meme.mjs';
import { registeredRecord } from './products.mjs';
import { ocmSidecar } from './sidecar.mjs';
import { selectTruth } from './registration.mjs';

/** The registered record of a fetched prefix. Only the prefix's first 262,144 bytes enter it. */
export async function registeredProducts({ file, physics, weatherRows, weatherSha256, reg }) {
  const head = registeredHead(file), derived = await physics.derive(head, weatherRows);
  const truth = selectTruth(reg, head.source.norad, derived.native, derived.samples);
  return { head, derived, truth, record: registeredRecord({ head, derived, truth, reg, weatherSha256 }) };
}

/** The sidecar: the ten-minute GCRF states of the first 16 hours (the first 49 are the registered samples' states, the rest come from the
 *  frames module) with the operator's UVW covariance at each epoch. Returns the FlatBuffer bytes. */
export async function sidecarProducts({ file, head, derived, physics, producer }) {
  const points = retainedPoints(file);
  const states = derived.samples.map(p => ({ ms: p.ms, stateM: p.stateM }));
  for (const p of points.slice(states.length)) states.push(await physics.normalize(p));
  return ocmSidecar({ file, head, states, points, producer });
}
