// Amendment A11, M29: real reentries. For each object of the two samples (the CORDS observed reentries of lib/cords.mjs, whose truth is the observed time; the objects whose last TIP message lies before
// the archive's last snapshot, whose truth is that message's DECAY_EPOCH), at each of its element-set epochs t_k in the last 14 days before the reentry (spaced 4 h or more apart, and the epoch of the
// set Aerospace's prediction used), the pseudo-observations of its element-set history up to t_k (lib/gp-pseudo.mjs) go to the module's fit method (the module chooses its span from up to 120 h) and the set to
// `reentry`, with the daily space weather of the years (lib/spw-history.mjs). The inputs are local only (Space-Track element sets and messages, the CORDS spreadsheet stay in the archive); the rows hold
// times, errors and window widths.
import fs from 'node:fs';
import path from 'node:path';
import { store } from '../common.mjs';
import { oemBytes } from './sds.mjs';
import { reentry as sdngpReentry } from './sdngp-events.mjs';
import { openGpPseudo, uniqueSets } from './gp-pseudo.mjs';
import { modulesRoot } from './modules.mjs';
import { iso } from './windows.mjs';
import { spaceWeatherHistory } from './spw-history.mjs';

export const M29_FIRST_EPOCH = Date.parse('2022-11-27T00:00:00Z'); // the local GP history starts with creation date 2022-11-20; a set needs days of history behind it
export const M29_DAYS = 14, M29_SPACING_H = 4, M29_HISTORY_H = 120, M29_MIN_STATES = 48;
const STEP = 300;
const rdm = (r) => ({ epoch: r.REENTRY_EPOCH, uncHours: r.REENTRY_EPOCH_UNC, windowStart: r.REENTRY_WINDOW_START, windowEnd: r.REENTRY_WINDOW_END, orbitLifetimeDays: r.ORBIT_LIFETIME, lifetimeWindowDays: [r.ORBIT_LIFETIME_WINDOW_START, r.ORBIT_LIFETIME_WINDOW_END], ballisticCoeff: r.BALLISTIC_COEFF, comment: r.COMMENT ?? null, handoffEpoch: r.INITIAL_STATE?.EPOCH ?? null });
const utc = (s) => Date.parse(`${String(s).replace(/Z?$/, 'Z')}`);

export function m29Objects() {
  const dir = path.join(store, 'm29/sets');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).map((n) => n.replace('.json', '')).sort((a, c) => Number(a) - Number(c)) : [];
}

/** The truth of an object's file: the CORDS observed time, or the last TIP message's DECAY_EPOCH (Space-Track's settled reentry time, a window of a minute or so). */
export function truthOf(data) {
  if (data.truth) return { source: data.truth.source, ms: data.truth.ms, windowMin: null };
  const last = data.tips.at(-1);
  return { source: 'tip-final', ms: last.decayMs, windowMin: last.windowMin };
}

/** The prediction epochs of an object: set epochs in [T* - 14 d, T* - 30 min] after the first epoch, at least 4 h apart; for a CORDS object also the epoch of the set Aerospace used. */
export function predictionEpochs(sets, truthMs, aerospaceEpochMs = null) {
  const out = [];
  for (const [j, s] of sets.entries()) {
    const t = Date.parse(`${s.EPOCH}Z`);
    const isAerospace = aerospaceEpochMs !== null && Math.abs(t - aerospaceEpochMs) < 1500;
    if (!isAerospace && (t < Math.max(truthMs - M29_DAYS * 86400e3, M29_FIRST_EPOCH + 5 * 86400e3) || t > truthMs - 30 * 60e3)) continue;
    if (!isAerospace && out.length && t - out.at(-1).t < M29_SPACING_H * 3600e3) continue;
    out.push({ j, t, aerospace: isAerospace });
  }
  return out.sort((a, c) => a.t - c.t);
}

/** `only`: NORAD ids (strings) to score; `at`: ISO prediction epochs to score (default all). */
export async function scoreReentries({ b, sink, only = null, at = null }) {
  const modules = modulesRoot();
  const g = await openGpPseudo(modules);
  const weather = spaceWeatherHistory(b.weatherTable).payload;
  try {
    for (const norad of m29Objects()) {
      if (!sink.mine()) continue;
      if (only && !only.includes(norad)) continue;
      const data = JSON.parse(fs.readFileSync(path.join(store, 'm29/sets', `${norad}.json`), 'utf8'));
      const truth = truthOf(data), truthMs = truth.ms;
      const aerospaceMs = data.aerospace ? Date.parse(data.aerospace.tleEpochUtc) : null;
      const sets = uniqueSets(data.sets).filter((s) => Date.parse(`${s.EPOCH}Z`) < truthMs);
      if (sets.length < 2) { sink.append({ source: 'm29', id: `${norad} ${data.name} (no sets)`, norad, name: data.name, startUtc: iso(truthMs), fitSeconds: 0, skipped: `${sets.length} element sets before the reentry`, truthSource: truth.source }); continue; }
      const intervals = await g.intervals(sets, { stepSeconds: STEP });
      for (const { j, t, aerospace } of predictionEpochs(sets, truthMs, aerospaceMs)) {
        if (at && !at.includes(iso(t))) continue;
        const id = `${norad} ${data.name} ${iso(t)}`;
        if (sink.has(`m29|${id}|${iso(t)}|0`)) continue;
        const states = intervals.slice(0, j + 1).flatMap((x) => x.states).filter((s) => s.ms > t - M29_HISTORY_H * 3600e3 && s.ms <= t + 1);
        const failedSets = intervals.slice(0, j + 1).filter((x) => x.failed && x.epochMs > t - M29_HISTORY_H * 3600e3).length;
        const tip = data.tips ? [...data.tips].reverse().find((x) => x.msgMs <= t) ?? null : null;
        const row = { source: 'm29', id, norad, name: data.name, rcs: data.rcs, startUtc: iso(t), fitSeconds: 0, truthSource: truth.source, truthUtc: iso(truthMs), truthWindowMin: truth.windowMin, tauHours: (truthMs - t) / 3600e3, states: states.length, setEpochs: j + 1, failedSets,
          tip: tip ? { msgUtc: iso(tip.msgMs), decayUtc: iso(tip.decayMs), windowMin: tip.windowMin, errHours: (tip.decayMs - truthMs) / 3600e3 } : null,
          aerospace: aerospace ? { predictionUtc: data.aerospace.predictionUtc, uncertaintyHours: data.aerospace.uncertaintyHours, errHours: (Date.parse(data.aerospace.predictionUtc) - truthMs) / 3600e3, inWindow: Math.abs(Date.parse(data.aerospace.predictionUtc) - truthMs) <= data.aerospace.uncertaintyHours * 3600e3 } : null,
          build: b.sdngp.provenance.wasmSha256.slice(0, 12) };
        if (states.length < M29_MIN_STATES) { sink.append({ ...row, skipped: `fewer than ${M29_MIN_STATES} pseudo-observation states` }); continue; }
        const lines = states.map((s) => ({ epoch: iso(s.ms), r: s.r, v: s.v }));
        const bytes = oemBytes({ originator: 'G1 M29', block: { frame: 'TEMEOFDATE', frameName: 'TEME', timeSystem: 'UTC', object: { name: data.name, id: '', norad: Number(norad) }, lines, start: lines[0].epoch, stop: lines.at(-1).epoch, useableStop: iso(t) }, sizePrefixed: false });
        const fit = await b.sdngp.fit(bytes, { weatherTable: weather });
        if (!fit.ok) { sink.append({ ...row, fit: { ok: false, error: fit.error } }); continue; }
        row.fit = { ok: true, fitRmsKm: fit.fitRmsKm, bEff: Number(fit.params.SDNGP_B_EFF), spanHours: /span ([\d.]+) h/.exec(fit.comment ?? '')?.[1] ?? null, eccentricity: fit.unpacked.ECCENTRICITY, meanMotion: fit.unpacked.MEAN_MOTION };
        const re = await sdngpReentry(b.sdngp, { omm: fit.omm, weatherTable: weather });
        if (!re.ok) { sink.append({ ...row, reentry: { ok: false, error: re.error } }); continue; }
        const r = rdm(re.rdm);
        const pred = utc(r.epoch);
        sink.append({ ...row, reentry: { ok: true, ...r, errHours: (pred - truthMs) / 3600e3, leadHours: (pred - t) / 3600e3, inWindow: r.windowStart && r.windowEnd ? truthMs >= utc(r.windowStart) && truthMs <= utc(r.windowEnd) : null } });
      }
    }
  } finally { await g.destroy(); }
}
