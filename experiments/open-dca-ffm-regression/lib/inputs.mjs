// XM4's inputs (PLAN.md, Arms; Inputs: as issued, and not). Data preparation only: dates, values and means; no physics.
//   the three row forms of a cutoff: O (XM's rowsO with XM3's driverRows), L (the same daily values with the lane's centered 81-day mean
//   over the as-issued series; the verdict's rows) and H (the same daily values with that mean over GFZ's later file; not causal)
//   the record K2 reads at a cutoff (the newest 00:00 UTC issue not refused, XM's cache), K3's record, and the size-prefixed form the
//   catalog path takes.
import path from 'node:path';
import { config, root, DAY, HOUR, dateOf } from '../common.mjs';

const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const { driverRows, cachedDcl } = await import(path.join(root, config.xm3.dir, 'lib/ffm.mjs'));
export { driverRows, cachedDcl };
const HALF = config.weather.centerHalfDays;
const dayMs = (date) => Date.parse(`${date}T00:00:00Z`);

/** The mean over the day t and HALF days each side of `flux` (a day with no value is skipped): space_weather.cpp's CENTER81. */
function centered(flux, t) {
  let sum = 0, n = 0;
  for (let k = -HALF; k <= HALF; k += 1) {
    const v = flux(t + k * DAY);
    if (Number.isFinite(v) && v > 0) { sum += v; n += 1; }
  }
  if (!(n > 0)) throw new Error(`no F10.7 within ${HALF} days of ${dateOf(t)}`);
  return sum / n;
}

/** The driver rows with the two centered means: { O, L, H }, each [{ date, f107, c81, ap }] through D0 + 8. */
export function rowForms(driver) {
  const { days } = W.gfzDays();
  const byDate = new Map(driver.map((r) => [r.date, r.f107]));
  const first = dayMs(driver[0].date), last = dayMs(driver.at(-1).date), lastFlux = driver.at(-1).f107;
  const asIssued = (t) => (t < first ? days.get(dateOf(t))?.f107 : t > last ? lastFlux : byDate.get(dateOf(t)));
  const later = (t) => days.get(dateOf(t))?.f107;
  return { O: driver, L: driver.map((r) => ({ ...r, c81: centered(asIssued, dayMs(r.date)) })), H: driver.map((r) => ({ ...r, c81: centered(later, dayMs(r.date)) })) };
}

/** The weather of a cutoff: { info, excluded? } and, when the condition holds, { held, filled, forms }. `info` is XM3's stored row.O. */
export function weatherAt(D0) {
  const O = W.rowsO(D0 - 72 * HOUR - config.weather.rowsMarginDays * DAY, D0);
  if (O.excluded) return { excluded: O.excluded, info: { excluded: O.excluded } };
  const info = { rsga: O.rsga, c81: O.c81, lastObserved: O.lastObserved, rows: O.rows.length, first: O.rows[0]?.date, last: O.rows.at(-1)?.date };
  const d = driverRows(O.rows, D0);
  return { info, held: d.held, filled: d.filled, forms: rowForms(d.rows) };
}

const plain = (value) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : ArrayBuffer.isView(v) ? Array.from(v) : v));
const unpack = (bytes) => S.DCL.DCL.getRootAsDCL(new S.flatbuffers.ByteBuffer(new Uint8Array(bytes))).unpack();
function sizePrefixed(value) {
  const b = new S.flatbuffers.Builder(1 << 16);
  S.DCL.DCL.finishSizePrefixedDCLBuffer(b, value.pack(b));
  return b.asUint8Array().slice();
}
/** XM's cached bytes in the published size-prefixed form, every field checked equal after the round trip. */
export function framedRecord(bytes) {
  const out = sizePrefixed(unpack(bytes));
  const back = S.DCL.DCL.getSizePrefixedRootAsDCL(new S.flatbuffers.ByteBuffer(out)).unpack();
  if (plain(back) !== plain(unpack(bytes))) throw new Error('the size-prefixed $DCL differs from the cached record');
  return out;
}

const readCache = new Map();
/** The record the console flies at cutoff D0: the newest 00:00 UTC issue at or before D0 that was not refused.
 *  { issueMs, ageDays, sha256 (the cached bytes), bytes (the cached bytes), framed (size-prefixed) }. */
export function recordAt(D0) {
  if (readCache.has(D0)) return readCache.get(D0);
  for (let t = D0, steps = 0; steps < 30; t -= DAY, steps += 1) {
    const c = cachedDcl(t);
    if (!c.ok) continue;
    const out = { issueMs: t, ageDays: (D0 - t) / DAY, sha256: c.sha256, bytes: c.dcl, framed: framedRecord(c.dcl) };
    readCache.set(D0, out);
    return out;
  }
  throw new Error(`no record within 30 days before ${dateOf(D0)}`);
}

/** A record's cached bytes with its node times moved by `shiftMs`, values unchanged, size-prefixed. */
export function moveRecord(bytes, shiftMs) {
  const value = unpack(bytes), shift = BigInt(shiftMs);
  value.CORRECTION.NODE_TIMES_MS = Array.from(value.CORRECTION.NODE_TIMES_MS, (t) => BigInt(t) + shift);
  return sizePrefixed(value);
}

/** The date whose record K3 borrows: D0 + 20 d when that is in the period, else D0 - 20 d. */
export function nullDate(D0) {
  const end = Date.parse(`${config.period.to}T00:00:00Z`), shift = config.record.moved.days * DAY;
  return D0 + shift <= end ? D0 + shift : D0 - shift;
}

/** K3's record at cutoff D0: the record read at the null date with its node times moved by D0 - Q, values unchanged, size-prefixed.
 *  { fromMs: Q, issueMs, ageDays (at Q), shiftDays, framed }. */
export function movedRecordAt(D0) {
  const Q = nullDate(D0), r = recordAt(Q);
  return { fromMs: Q, issueMs: r.issueMs, ageDays: r.ageDays, shiftDays: (D0 - Q) / DAY, framed: moveRecord(r.bytes, D0 - Q), sha256: r.sha256 };
}
