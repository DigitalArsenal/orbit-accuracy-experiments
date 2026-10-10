// Shared by E5's steps: configuration, the test-window guard, the modules,
// and the drivers (SET JB2008 indices, GFZ daily space weather) as records.
// Reading and re-framing only; every density and orbit is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitState, loadModule, modulesRoot, sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const DAY_MS = 86400000;
export const mjdOfMs = (ms) => ms / DAY_MS + 40587;
export const msOfMjd = (mjd) => (mjd - 40587) * DAY_MS;
export const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// The test windows stay locked until PLAN.md and config.json are frozen by a
// commit: `frozen` must be true and both files committed and unchanged here.
export function assertWindowReadable(name) {
  if (name === 'validation') return;
  if (config.frozen !== true) throw new Error(`the ${name} window is locked until config.json is frozen (PLAN.md)`);
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error(`the ${name} window is locked: PLAN.md or config.json differs from its frozen commit`);
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error(`the ${name} window is locked: PLAN.md and config.json are not committed`);
}

// Issue days of a named window: [{from, to}] spans, each inclusive.
export function windowSpans(name) {
  assertWindowReadable(name);
  const w = config.windows[name];
  if (!w) throw new Error(`unknown window ${name}`);
  return (Array.isArray(w[0]) ? w : [w]).map(([from, to]) => ({ from, to }));
}
export function issueDays(spans) {
  const out = [];
  for (const s of spans) for (let t = dayMs(s.from); t <= dayMs(s.to); t += DAY_MS) out.push(t);
  return out;
}

// Modules: hpop, eop-parser and density-calibration from the modules
// checkout; estimation (fit_batch) from its own checkout when configured.
export const modulesDir = (flag) => modulesRoot({ flag, configured: config.inputs.modules, repoRoot });
export async function loadModules(run, names, { modules: flag } = {}) {
  const root = modulesDir(flag);
  const estimationRoot = config.inputs.estimationModules && fs.existsSync(config.inputs.estimationModules) ? config.inputs.estimationModules : root;
  const loaded = {};
  for (const name of names) {
    const from = name === 'analysis/estimation' ? estimationRoot : root;
    loaded[name] = await loadModule(from, name);
    run.addModule({ ...loaded[name].provenance, checkout: from, ...(from !== root ? { checkoutState: gitState(from) } : {}) });
  }
  return { root, estimationRoot, loaded };
}

// Calls a JSON method of a module and parses its single JSON output.
export async function callJson(module, method, port, value) {
  const response = await module.invoke(method, [{ portId: port, payload: Buffer.from(JSON.stringify(value)), typeRef: { schemaName: 'application/json' } }]);
  return JSON.parse(Buffer.from(response.outputs[0].payload).toString('utf8'));
}

// ── JB2008 drivers: SET SOLFSMY.TXT and DTCFILE.TXT as PRW JB2008_INDICES rows ──
let setCache = null;
export function setIndices() {
  if (setCache) return setCache;
  const solText = fs.readFileSync(config.inputs.solfsmy, 'latin1'), dtcText = fs.readFileSync(config.inputs.dtcfile, 'latin1');
  const iso = (y, doy) => new Date(Date.UTC(y, 0, doy)).toISOString().slice(0, 10);
  const sol = new Map(), dtc = new Map();
  for (const line of solText.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t.length < 12 || line.trim().startsWith('#') || !/^\d{4}$/.test(t[0])) continue;
    sol.set(iso(+t[0], +t[1]), { F10: +t[3], F10_CENTRED_81: +t[4], S10: +t[5], S10_CENTRED_81: +t[6], M10: +t[7], M10_CENTRED_81: +t[8], Y10: +t[9], Y10_CENTRED_81: +t[10], SOURCE_FLAGS: t[11] });
  }
  for (const line of dtcText.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/);
    if (t[0] !== 'DTC' || t.length < 27) continue;
    dtc.set(iso(+t[1], +t[2]), t.slice(3, 27).map(Number));
  }
  setCache = { sol, dtc, sha256: { solfsmy: sha256(Buffer.from(solText, 'latin1')), dtcfile: sha256(Buffer.from(dtcText, 'latin1')) } };
  return setCache;
}
// Rows for every day from..to (ISO dates, inclusive); DTC_HOURLY_K edited by
// add(dayIso, hour) when given (D2: the calibrated correction).
export function jb2008Rows(from, to, add = null) {
  const { sol, dtc } = setIndices();
  const rows = [];
  for (let t = dayMs(from); t <= dayMs(to); t += DAY_MS) {
    const date = isoDay(t);
    if (!sol.has(date) || !dtc.has(date)) throw new Error(`no SOLFSMY or DTCFILE row for ${date}`);
    const hourly = dtc.get(date).map((v, h) => (add ? v + add(t + h * 3600000) : v));
    rows.push({ DATE: date, ...sol.get(date), DTC_HOURLY_K: hourly });
  }
  return rows;
}

// ── Daily space weather for NRLMSISE-00 from GFZ's Kp/ap/Ap/F10.7 file ──
// $SPW rows as CSSI lays them out: Kp x10, ap, daily Ap, observed F10.7 and
// its 81-day centred mean (the mean of the observed daily values centred on
// the day, as CSSI's F10.7_OBS_CENTER81, over the days GFZ reports: at
// least 75 of the 81). A day GFZ reports without F10.7 (-1) takes the mean of
// the nearest reported days before and after it.
let kpCache = null;
export function gfzDays() {
  if (kpCache) return kpCache;
  const text = fs.readFileSync(config.inputs.kp, 'latin1');
  const days = new Map();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const t = line.trim().split(/\s+/);
    const date = `${t[0]}-${t[1].padStart(2, '0')}-${t[2].padStart(2, '0')}`;
    days.set(date, { kp: t.slice(7, 15).map(Number), ap: t.slice(15, 23).map(Number), Ap: +t[23], f107obs: +t[25], f107adj: +t[26] });
  }
  kpCache = { days, sha256: sha256(Buffer.from(text, 'latin1')) };
  return kpCache;
}
function f107Filled(t) {
  const { days } = gfzDays();
  const d = days.get(isoDay(t));
  if (d && d.f107obs > 0) return { obs: d.f107obs, adj: d.f107adj };
  const near = (step) => { for (let k = 1; k <= 10; ++k) { const e = days.get(isoDay(t + step * k * DAY_MS)); if (e && e.f107obs > 0) return e; } return null; };
  const a = near(-1), b = near(1);
  if (!a || !b) throw new Error(`no F10.7 near ${isoDay(t)}`);
  return { obs: (a.f107obs + b.f107obs) / 2, adj: (a.f107adj + b.f107adj) / 2 };
}
export function spwRows(from, to) {
  const { days } = gfzDays();
  const rows = [];
  for (let t = dayMs(from); t <= dayMs(to); t += DAY_MS) {
    const date = isoDay(t), d = days.get(date);
    if (!d) throw new Error(`no GFZ row for ${date}`);
    const window = [];
    for (let k = -40; k <= 40; ++k) {
      const e = days.get(isoDay(t + k * DAY_MS));
      if (e && e.f107obs > 0) window.push(e.f107obs);
    }
    if (window.length < 75) throw new Error(`81-day F10.7 window has ${window.length} days around ${date}`);
    const kp10 = d.kp.map((k) => Math.round(k * 10));
    const f = f107Filled(t);
    rows.push({
      DATE: date, KP1: kp10[0], KP2: kp10[1], KP3: kp10[2], KP4: kp10[3], KP5: kp10[4], KP6: kp10[5], KP7: kp10[6], KP8: kp10[7],
      KP_SUM: kp10.reduce((a, b) => a + b, 0), AP1: d.ap[0], AP2: d.ap[1], AP3: d.ap[2], AP4: d.ap[3], AP5: d.ap[4], AP6: d.ap[5], AP7: d.ap[6], AP8: d.ap[7],
      AP_AVG: d.Ap, F107_OBS: f.obs, F107_ADJ: f.adj, F107_DATA_TYPE: 0,
      F107_OBS_CENTER81: window.reduce((a, b) => a + b, 0) / window.length,
    });
  }
  return rows;
}
// The largest 3-hour Kp in [fromMs, toMs).
export function maxKp(fromMs, toMs) {
  const { days } = gfzDays();
  let m = 0;
  for (let t = Math.floor(fromMs / 10800000) * 10800000; t < toMs; t += 10800000) {
    const d = days.get(isoDay(t));
    if (d) m = Math.max(m, d.kp[Math.floor((t % DAY_MS) / 10800000)]);
  }
  return m;
}
export const regimeOf = (kp) => config.regimes.bins.find(([, lo, hi]) => kp >= lo && kp < hi)[0];
