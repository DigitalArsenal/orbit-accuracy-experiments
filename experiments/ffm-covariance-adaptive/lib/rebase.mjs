// C3-A11: the re-base of the GNSS fits, kept here because other experiments pin the bytes of lib/open.mjs and lib/terms.mjs (ffm-srp-seed-high-beta/build.json). lib/seeds.mjs gives GLONASS the published seed and Galileo FOC its
// fixed Y acceleration. settingsOf puts that acceleration in the signed T slot, and rebased makes every FFM request go through the Y-bias experiment's adapter (experiments/ffm-galileo-y-bias/lib/y0.mjs, pinned in build.json), which
// moves that slot onto FORCES.ECOM2.Y0_M_S2. With no T in a request the adapter passes the frame through unchanged, so Galileo IOV, the spheres and R2 stay on the path they had. Encoding only: every orbit computation is FFM's.
import path from 'node:path';
import { root } from '../common.mjs';
import { settingsFor } from './open.mjs';

const { withY0 } = await import(path.join(root, 'experiments/ffm-galileo-y-bias/lib/y0.mjs'));

/** C2's fit settings for a seed; a seed with y0 fixes it in the T slot. */
export function settingsOf(cls, seed, withB, B2C) {
  const s = settingsFor(cls, seed, withB, B2C);
  return seed.y0 ? { ...s, fixed: { ...s.fixed, t: seed.y0 } } : s;
}
/** A chain whose contexts send FFM's requests through the adapter. */
export const rebased = (chain) => ({ ...chain, ctxFor: (fromMs, toMs) => withY0(chain.ctxFor(fromMs, toMs)) });
