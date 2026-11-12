// A window's numerical row and, where it has no numerical figure by the rule, the reason: one function, read by table.mjs and bar.mjs, so
// the bar counts a window by reason exactly as the scoreboard does.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as A from './arms.mjs';
import * as W from './windows.mjs';

export const REFIT = 'maneuvering: the arc after its last burn';
// the row whose numerical fits are not properly configured for its truth: an arm only where the arc after the last burn frees its fit
export const NOT_CONFIGURED = new Set(['WA']);
const H = 3600e3;

/** The window's numerical row: the stored one, or under --burns in a regime with refits after a burn (afterBurnGroups), the refit where the
 *  rule moved the arc (with its last burn, its arc in hours and its start), or the stored fit with the decision row's fit process. On the
 *  commercial geostationary row (NOT_CONFIGURED) a window whose arc still holds a known burn has no numerical arm (burnInArc). A window of
 *  such a regime without a decision row has none (null), unless its stored row records an error. */
export function numericalOf({ w, arc, base, afterBurn, afterBurnGroups }) {
  const k = `${w.key}|${arc}`, b = base.get(k);
  if (!b || !afterBurnGroups.has(w.group)) return b;
  const r = afterBurn.get(k);
  if (!r || r.error) return b?.error ? b : null;
  if (NOT_CONFIGURED.has(w.group) && r.burnInArc) return { ...b, arms: {}, fitProcess: r.fitProcess, burnInArc: true };
  if (r.fitProcess === REFIT) return { ...b, env: r.env, arms: { FFMq: r.arms?.FFMq ?? { ok: false } }, fitProcess: r.fitProcess, fitArcHours: r.fitArcHours, lastBurn: r.lastBurn, ...(r.fitArcStart ? { fitArcStart: r.fitArcStart } : {}) };
  return { ...b, fitProcess: r.fitProcess };
}

/** A 72 h window's arc starts (ms), AP's and the numerical arm's, each to the millisecond where it can be told: AP's from the rule on the
 *  lists given (lib/arms.mjs maneuverArc, the row's recorded start where it has one), the full 72 h where its row is on the full arc; the
 *  numerical arm's from its refit's last burn by the rule (numericalArc, with the row's own minimum arc), the full 72 h otherwise. Without
 *  lists AP's start is the cutoff less its fitArcHours. */
export function arcStarts({ w, ap, nr, lists }) {
  const D0 = w.cutoffMs, full = D0 - 72 * H;
  const apStart = ap.fitArcStart ? Date.parse(ap.fitArcStart) : ap.fitArcHours == null ? full
    : lists ? A.maneuverArc(A.arcBreaks(lists, w.group, w.name, D0), D0, ap.perigeeKm ?? Infinity, undefined, A.minHoursOf(w.group)).startMs : D0 - ap.fitArcHours * H;
  const numStart = nr.fitProcess !== REFIT ? full : nr.fitArcStart ? Date.parse(nr.fitArcStart)
    : nr.lastBurn ? A.numericalArc([{ from: nr.lastBurn, to: nr.lastBurn }], D0, Infinity, 72, A.minHoursOf(w.group)).startMs : D0 - nr.fitArcHours * H;
  return { ap: apStart, numerical: numStart };
}

/** Why a window AP scored has no numerical figure, or null where the rule gives it one: noTruthOrCoverage (no numerical row, or one that
 *  records an error), ruleLeavesNoArm (the rule gives no arm: burnInArc), armsOnDifferentArcs (on a 72 h row, a window with an arm whose
 *  arc starts elsewhere than AP's, to the millisecond). A window that has an arm and still no figure is fitFailed (the caller's: it needs
 *  the row's arm). */
export function noArmWhy({ w, arc, ap, nr, lists }) {
  if (!nr || nr.error) return 'noTruthOrCoverage';
  if (nr.burnInArc) return 'ruleLeavesNoArm';
  if (arc === 72 && ap && !ap.error && !ap.apError) {
    const s = arcStarts({ w, ap, nr, lists });
    if (s.ap !== s.numerical) return 'armsOnDifferentArcs';
  }
  return null;
}

// The fit identity of a numerical trajectory (a manifest line of numerical-trajectories, written by trajectories.mjs and refly.mjs --tight)
// and of the numerical row it stands for, and the readings around it, one function each, called alike by bar.mjs and trajectories.mjs:
// the row's arm (rowArmOf), its listed windows (listedOf), the refits after a burn (readAfterBurn), the fit a window's numerical row
// stands for (rowFitOf: the one trajectories.mjs makes and bar.mjs reads), a line's fit (lineFitOf) and whether two are one (sameFit).
// (an instant as the tools write it: ISO text in UTC, with Z, an offset, or no zone, which is read as UTC)
const msOf = (t) => (typeof t === 'number' ? t : typeof t === 'string' ? Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(t) ? t : `${t}Z`) : NaN);
/** An instant as ISO text, or null where it is none (a line that cannot be read has no fit; nothing throws). */
export const isoOf = (t) => { const ms = msOf(t); return Number.isFinite(ms) ? new Date(ms).toISOString() : null; };

/** A refit of a stored fit is that fit where its weighted RMS is within REFIT_RMS_TOLERANCE times the larger of 1 and the stored RMS of it:
 *  within 1e-9 absolute where the stored RMS is at most 1, relative above. A record with no stored RMS has nothing to compare. */
export const REFIT_RMS_TOLERANCE = 1e-9;
export const rmsAgrees = (c) => !c || c.storedWeightedRms == null
  || (Number.isFinite(c.refitWeightedRms) && Math.abs(c.refitWeightedRms - c.storedWeightedRms) <= REFIT_RMS_TOLERANCE * Math.max(1, Math.abs(c.storedWeightedRms)));

/** A line's fit: { setting, process: 'full arc' | 'after burn', arcStart, firstState }, or null. Null for a line with no trajectory (no
 *  truth, or a failed attempt: its fit, if an older line names one, is not a trajectory's), for a line whose trajectory file a later line
 *  wrote again (isLastWriter false), for a refit whose weighted RMS is not the stored fit's (rmsAgrees), and for a line whose instants do
 *  not read. Its own (fit) where it names it; for an older line derived where nothing leaves doubt: the setting and first state are the
 *  line's, the process its source's, the arc start the cutoff less the fit arc (a full-arc source) or the refit's recorded start
 *  (check.arcStart, a refit after the burn; a refit line that records none has no fit, and its window is made again). */
export function lineFitOf(x, isLastWriter) {
  if (!x || x.source === 'none' || x.source === 'failed' || !x.file || !isLastWriter || !rmsAgrees(x.check)) return null;
  const firstState = isoOf(x.fit ? x.fit.firstState : x.from);
  if (!firstState) return null;
  if (x.fit) { const arcStart = isoOf(x.fit.arcStart); return x.fit.setting && x.fit.process && arcStart ? { ...x.fit, arcStart, firstState } : null; }
  if (/after the burn/.test(x.source ?? '')) { const arcStart = isoOf(x.check?.arcStart); return arcStart ? { setting: x.setting, process: 'after burn', arcStart, firstState } : null; }
  const cutoff = msOf(x.cutoff);
  return Number.isFinite(cutoff) ? { setting: x.setting, process: 'full arc', arcStart: new Date(cutoff - x.arcH * H).toISOString(), firstState } : null;
}
/** The fit a failed line tried ({ setting, process, arcStart }), and its failure by kind, so a reader can say why a window has no line. */
export const triedOf = (x) => (x?.source === 'failed' && x.tried ? { ...x.tried, arcStart: isoOf(x.tried.arcStart) } : null);
export const failureOf = (x) => (/the refit is not the stored fit/.test(x?.error ?? '') ? 'refitNotTheStoredFit' : /coverage/.test(x?.error ?? '') ? 'coverage' : 'other');

/** A numerical row's fit: a 1e-13 row by its stored first state; a refit after a burn by its recorded arc start, else the arc the rule gives
 *  from its last burn (with the row's own minimum arc); a stored full-arc fit by its setting and the full arc. A refit row whose recorded
 *  arc start does not read is refused (thrown), never read at the rule's start. */
export function rowFitOf(b, label, D0, a) {
  const arm = label ? b?.arms?.[label] : null;
  if (!arm?.ok) return null;
  if (arm.product?.epoch) return { setting: arm.arm, process: 'full arc', firstState: isoOf(arm.product.epoch) };
  if (b.fitProcess === REFIT && b.fitArcStart != null && !isoOf(b.fitArcStart)) throw new Error(`refused: the refit row ${b.key} ${b.arcH} h records an arc start that does not read (${b.fitArcStart})`);
  if (b.fitProcess === REFIT) return { setting: arm.arm, process: 'after burn', arcStart: isoOf(b.fitArcStart) ?? new Date(A.numericalArc([{ from: b.lastBurn, to: b.lastBurn }], D0, Infinity, a, A.minHoursOf(b.group)).startMs).toISOString() };
  return { setting: arm.arm, process: 'full arc', arcStart: new Date(D0 - a * H).toISOString() };
}
/** Whether a line's fit (f) is the row's (r): the same setting and process, and the same first state, in milliseconds, where the row names
 *  one, else the same arc start in milliseconds. */
export function sameFit(f, r) {
  if (!f || !r || f.setting !== r.setting || f.process !== r.process) return false;
  if (r.firstState) return Number.isFinite(msOf(r.firstState)) && msOf(f.firstState) === msOf(r.firstState);
  return Number.isFinite(msOf(r.arcStart)) && msOf(f.arcStart) === msOf(r.arcStart);
}
/** A fit's short name (10 hex of the sha256 of its setting, process and arc start in ms), so a trajectory file is named by its fit. */
export const fitTag = (f) => crypto.createHash('sha256').update(`${f.setting}|${f.process}|${msOf(f.arcStart)}`).digest('hex').slice(0, 10);

/** A row's numerical arm, as table.mjs and bar.mjs choose it: the fullest stored setting by name (PREFER) that a window of the row has,
 *  over the numerical rows (numericalOf) of every listed window of the row (none where one has no row); none on the commercial geostationary
 *  row without its refits after a burn. */
export const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'];
export const rowArmOf = (g, bs, afterBurnGroups) => (!bs.length || !bs.every(Boolean) || (NOT_CONFIGURED.has(g) && !afterBurnGroups.has(g)) ? null
  : PREFER.find((a) => bs.some((b) => b.arms?.[a]?.ok)) ?? null);
/** The windows each row lists: the first pass, and a regime's second pass once its numerical rows (base) are all in the store. */
export function listedOf(groups, base) {
  const all = W.windowsOf(groups);
  const secondIn = new Set(groups.filter((g) => { const sec = all.second.filter((w) => w.group === g); return sec.length && sec.every((w) => w.arcs.every((a) => base.has(`${w.key}|${a}`))); }));
  return [...all.windows, ...all.second.filter((w) => secondIn.has(w.group))];
}
/** The refits after a burn: with burn lists (burns), from the store folder named (store, else lib/arms.mjs NUMERICAL_AFTER_BURN.store; a
 *  folder name beginning NUMERICAL_STORE-after-burn), which must be in the store; every row's list (burnList) the one the lists give for its
 *  satellite, a row a burn moved or withheld naming one, or the run is refused; of a window-arc's rows the first, or the first without an
 *  error after one that has one. Without lists none is read, and a folder named is refused. A folder that is not in the store is refused
 *  (required, bar.mjs and trajectories.mjs: their numerical arm read with lists and without the refits made on them would stand a stored
 *  fit where the rule moved the arc); table.mjs reads it as none (required false), since its --burns also sets AP's 72 h rule, which runs
 *  where no refit was made, and its file names the folder it read (burnLists.afterBurnStore, null where none). */
export function readAfterBurn({ burns, store, readRows, required = true }) {
  if (!burns) {
    if (store) throw new Error(`refused: --after-burn-store ${store} without --burns (the refits are read with the lists that made them)`);
    return { afterBurn: new Map(), afterBurnGroups: new Set(), abStore: null };
  }
  const abStore = store ?? A.NUMERICAL_AFTER_BURN.store;
  if (!abStore.startsWith(`${A.NUMERICAL_STORE}-after-burn`) || abStore.includes('/')) throw new Error(`--after-burn-store ${abStore}: a folder name beginning ${A.NUMERICAL_STORE}-after-burn`);
  const dir = path.join(A.STORE_ROOT, abStore);
  if (!fs.existsSync(dir)) {
    if (required) throw new Error(`refused: the store holds no ${abStore}, the refits after a burn the lists --burns gives are read from`);
    return { afterBurn: new Map(), afterBurnGroups: new Set(), abStore };
  }
  const afterBurn = new Map(), afterBurnGroups = new Set(), listOf = new Map(), wrong = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^rows-after-burn-.*\.jsonl$/.test(x))) for (const r of readRows(path.join(dir, f))) {
    const s = `${r.group}|${r.name}`;
    if (!listOf.has(s)) listOf.set(s, A.listSha(burns, r.group, r.name));
    if ((r.burnList ?? null) !== listOf.get(s) || ((r.lastBurn || r.burnInArc) && !r.burnList)) { wrong.push(r); continue; }
    const k = `${r.key}|${r.arcH}`;
    if (!afterBurn.has(k) || (afterBurn.get(k).error && !r.error)) afterBurn.set(k, r);
    afterBurnGroups.add(r.group);
  }
  if (wrong.length) throw new Error(`refused: ${wrong.length} rows of ${abStore} were made on burn lists other than --burns gives (${[...new Set(wrong.map((r) => r.group))].join(', ')})`);
  return { afterBurn, afterBurnGroups, abStore };
}
