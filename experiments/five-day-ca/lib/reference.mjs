// The re-measure's forecast phases and the stored old-lead rows each arm is checked against (FIVE-DAY.md, "Amendment 2026-11-04: one $OCM").
import path from 'node:path';
import { config, reference } from '../guard.mjs';
/** Each forecast phase's arms: fits AP, XP and S (re-fitted at the pinned build), ussf U (sgp4-xp 0.2.1), ffm F (the registered rows). */
export const PHASE_ARMS = { fits: ['AP', 'XP', 'S'], ussf: ['U'], ffm: ['F'] };
export const phaseOf = (arm) => Object.keys(PHASE_ARMS).find((p) => PHASE_ARMS[p].includes(arm.replace(/\d+/g, '')));
const B040 = '/opt/data/sdn-archive/operator-theory/ap/b040';
/** Per label, the stored rows of each arm's own build: AP, XP and U from the pinned build's AP5 and AP6 re-measure (`reference`), S and F from
 *  AP 0.4.0's store, whose S and F builds the re-measure keeps: [store, directories, the arms read from them]. */
const OLD = {
  regimes: [[reference, ['regimes', 'regimes-hx', 'ussf-regimes', 'ussf-regimes-hx'], /^(AP|XP|U)\d/], [B040, ['regimes'], /^(S|F)\d/]],
  truth2: [[reference, ['truth2', 'compare-truth2', 'ussf-truth2'], /^(AP|XP|U)\d/], [B040, ['compare-truth2'], /^(S|F)\d/]],
  truth: [[reference, ['truth', 'compare-truth', 'ussf-truth'], /^(AP|XP|U)\d/], [B040, ['compare-truth'], /^(S|F)\d/]],
};
/** A label's old-lead rows by window key ({ ...row, arms }, merged over the stores); read(dir) is the experiment's row reader and filter. */
export function oldLeads(label, read) {
  const out = new Map();
  for (const [base, dirs, arms] of OLD[label]) for (const name of dirs) for (const r of read(path.join(base, name))) {
    if (!out.has(r.key)) out.set(r.key, { ...r, arms: {} });
    for (const [arm, a] of Object.entries(r.arms ?? {})) if (arms.test(arm)) out.get(r.key).arms[arm] = a;
  }
  return out;
}
/** A label's rows in the window order of a registered stage's store (its rows as read from config.store/<stage>/<label>): the order the seeded
 *  encounter draws index (cheap), the week-cluster bootstrap resamples (cheap) and the C3 history sums run in (covariance). The re-measure
 *  processes its rows in it, so a product that did not change reproduces byte for byte; the storage layout never decides a draw. */
const ORDERS = new Map();
export function inRegisteredOrder(rows, stage, label, read) {
  const k = `${stage}|${label}`;
  if (!ORDERS.has(k)) ORDERS.set(k, new Map(read(`${config.store}/${stage}/${label}`).map((r, i) => [r.key, i])));
  const at = (r) => ORDERS.get(k).get(r.key) ?? Number.MAX_SAFE_INTEGER;
  return [...rows].sort((a, b) => at(a) - at(b));
}
