// One operator file through every arm. The owner's list (2026-11-01): our SupGP recipe, XP and XP2 fits, against FFM-propagated states, scored against the
// operator's own later states here and against newer files or truth by score.mjs. Every arm fits operator states; none starts from an SGP4 set or from a state SGP4
// made. Arms and their fits:
//   S     SGP4 fitted by analysis/gp-error-model on CelesTrak's window (Starlink [start, +12 h], ISS [start, +6 h]), flown by propagator/sgp4
//   X0    SGP4-XP with its built-in atmosphere, propagator/sdn-ap fit, flown by the module
//   X2    SGP4-XP with NRLMSISE-00 on the weather in force (XP2), propagator/sdn-ap fit, flown by the module
//   F     propagator/ffm fitted by analysis/estimation fit_batch, one per atmosphere asked for
//   RFa12 XP2's front-page recipe: drag from an FFM fit of the arc's last 12 h, elements from its last 17 h with that drag held, flown by the module
// Operator bytes stay in memory. What is written: statistics, each arm's fitted product and its cost. Times are wall clock of one call on one thread, with the step
// sizes in the row, so they can be read as a cost.
//   node experiments/operator-theory/arms.mjs --source starlink --count 12 --arcs 12,24,48 --out <dir> [--shard k/n]
//   node experiments/operator-theory/arms.mjs --source iss --arcs 6,24,48,72 --out <dir>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { openFfmHost, openAxes, apriori, isoMs } from './lib/host.mjs';
import { weatherRows } from './lib/weather.mjs';
import { vendorFiles } from './lib/vendors.mjs';
import { openSgp4Fit } from '../xp2-fit-design/lib/sgp4fit.mjs';
import { openModules } from '../xp-atmosphere-merit/lib/modules.mjs';
import * as S from '../xp-atmosphere-merit/lib/sds.mjs';
import { config as XMC } from '../xp-atmosphere-merit/common.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HOUR = 3600000;
const SOURCE = args.source ?? 'starlink';
const ARCS = (args.arcs ?? '12,24').split(',').map(Number);
const THIN_MS = 300000;
const OUT = args.out;
if (!OUT) throw new Error('--out <dir>');
fs.mkdirSync(path.join(OUT, 'products'), { recursive: true });
const UA = { 'User-Agent': 'sdn-operator-theory/1.0' };
const short = (e) => String(e?.message ?? e).slice(0, 240);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- sources: bytes in memory, states out: [{ epoch ISO, r km, v km/s }], frame EME2000
const BASE_STARLINK = 'https://api.starlink.com/public-files/ephemerides/';
const dayOfYear = (s) => {
  const y = Number(s.slice(0, 4)), doy = Number(s.slice(4, 7)), hh = Number(s.slice(7, 9)), mm = Number(s.slice(9, 11)), ss = Number(s.slice(11));
  return Date.UTC(y, 0, doy, hh, mm, 0) + ss * 1000;
};
function parseMeme(text) {
  const lines = [], meta = {};
  for (const line of text.split('\n')) {
    if (line.startsWith('created:')) meta.created = line.slice(8).trim();
    else if (line.startsWith('ephemeris_source:')) meta.ephemerisSource = line.slice(17).trim();
    else if (/^\d{13}\.\d+ /.test(line)) {
      const t = line.trim().split(/\s+/);
      lines.push({ epoch: isoMs(Math.round(dayOfYear(t[0]))), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) });
    }
  }
  return { lines, meta };
}
async function starlinkFiles() {
  const manifest = (await (await fetch(`${BASE_STARLINK}MANIFEST.txt`, { headers: UA })).text()).split('\n').map((l) => l.trim()).filter((l) => l.startsWith('MEME_'));
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  // A fixed draw, by name without the version: SHA-256 order of the object, so a later cycle draws the same satellites.
  const object = (name) => name.split('_').slice(1, 3).join('_');
  const chosen = [...manifest].sort((a, b) => sha(`operator-theory-20261101:${object(a)}`).localeCompare(sha(`operator-theory-20261101:${object(b)}`))).slice(0, Number(args.count ?? 12));
  return chosen.filter((_, i) => i % n === k).map((name) => ({ name, norad: Number(name.split('_')[1]), object: name.split('_')[2], async read() {
    const r = await fetch(`${BASE_STARLINK}${name}`, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parseMeme(await r.text());
  } }));
}
async function issFiles() {
  return [{ name: 'ISS.OEM_J2K_EPH', norad: 25544, object: 'ISS', async read() {
    const text = await (await fetch('https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt', { headers: UA })).text();
    const lines = [];
    for (const line of text.split('\n')) {
      const t = line.trim().split(/\s+/);
      if (t.length === 7 && /^\d{4}-\d\d-\d\dT/.test(t[0])) lines.push({ epoch: isoMs(Date.parse(`${t[0]}Z`)), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) });
    }
    const num = (name) => Number(new RegExp(`COMMENT ${name}=([0-9.]+)`).exec(text)[1]);
    return { lines, meta: { created: /CREATION_DATE\s*=\s*(\S+)/.exec(text)?.[1], statedB: num('DRAG_COEFF') * num('DRAG_AREA') / num('MASS') } };
  } }];
}
/** A CCSDS OEM in KVN: its states and its header's frame, time system and comments, to the end of the first data run or a covariance block. */
function parseKvn(text) {
  const lines = [], comments = [];
  let frame = null, timeSystem = null, created = null, inCovariance = false;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('COVARIANCE_START')) inCovariance = true;
    if (t.startsWith('COVARIANCE_STOP')) inCovariance = false;
    if (inCovariance) continue;
    if (t.startsWith('REF_FRAME')) frame ??= t.split('=')[1].trim();
    else if (t.startsWith('TIME_SYSTEM')) timeSystem ??= t.split('=')[1].trim();
    else if (t.startsWith('CREATION_DATE')) created ??= t.split('=')[1].trim();
    else if (t.startsWith('COMMENT')) comments.push(t.slice(8));
    const c = t.split(/\s+/);
    if (c.length >= 7 && /^\d{4}-\d{2}-\d{2}T/.test(c[0])) lines.push({ epoch: isoMs(Date.parse(`${c[0].replace(/Z$/, '')}Z`)), r: c.slice(1, 4).map(Number), v: c.slice(4, 7).map(Number) });
  }
  if (frame && !['EME2000', 'J2000'].includes(frame)) throw new Error(`frame ${frame} is not read here`);
  if (timeSystem && timeSystem !== 'UTC') throw new Error(`time system ${timeSystem} is not read here`);
  return { lines, meta: { created, frame, timeSystem, lastObservation: comments.map((c) => /TIME_LAST_OBSERVATION = (\S+)/.exec(c)?.[1]).find(Boolean) ?? null, comments: comments.slice(0, 20) } };
}
const PLANET = 'https://ephemerides.planet-labs.com/';
async function planetFiles() {
  const tle = (await (await fetch(`${PLANET}planet_mc.tle`, { headers: UA })).text()).split(/\r?\n/);
  const sats = [];
  for (let i = 0; i + 1 < tle.length; i += 1) if (tle[i].startsWith('0 ') && tle[i + 1].startsWith('1 ')) sats.push({ norad: Number(tle[i + 1].slice(2, 7)), hw: tle[i].trim().split(/\s+/).at(-1).toLowerCase() });
  const chosen = sats.sort((a, b) => sha(`operator-theory-20261101:${a.hw}`).localeCompare(sha(`operator-theory-20261101:${b.hw}`))).slice(0, Number(args.count ?? 12));
  return chosen.map((x) => ({ name: `${x.hw}_oem.txt`, norad: x.norad, object: x.hw, async read() {
    const r = await fetch(`${PLANET}${x.hw}_oem.txt`, { headers: UA });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return parseKvn(await r.text());
  } }));
}
async function cssFiles() {
  const { firstZipMember } = await import('../supgp-omm/lib/readers/container.mjs');
  const INDEX = 'https://www.cmse.gov.cn/gfgg/zgkjzgdcs/';
  // This host answers curl and times out on Node's fetch connect; the bytes still stay in memory.
  const curl = (url) => execFileSync('curl', ['-s', '--retry', '4', '--retry-all-errors', '--retry-delay', '20', '--max-time', '120', '-A', UA['User-Agent'], url], { maxBuffer: 1 << 28 });
  const page = curl(INDEX).toString('utf8');
  const link = /\.\/(\d{6}\/W\d+\.zip)/.exec(page)?.[1];
  if (!link) throw new Error('CMSE index: no ZIP link');
  const url = new URL(link, INDEX).href;
  return [{ name: url.split('/').at(-1), norad: 48274, object: 'CSS', async read() {
    const zip = curl(url);
    return parseKvn(Buffer.from(firstZipMember(zip).bytes).toString('utf8'));
  } }];
}
// The forward test's four sources (PLAN.md), or a vendor added by VENDORS.md. Nothing below changes for the four.
const VENDOR = !['starlink', 'iss', 'planet', 'css'].includes(SOURCE);
const FILES = SOURCE === 'iss' ? await issFiles() : SOURCE === 'planet' ? await planetFiles() : SOURCE === 'css' ? await cssFiles() : VENDOR ? await vendorFiles(SOURCE, args) : await starlinkFiles();
const SUPGP_WINDOW_H = { iss: 6, css: 6, planet: 24 }[SOURCE] ?? (VENDOR ? 24 : 12);
const BINS = { iss: [[0, 6], [6, 12], [12, 24], [24, 48], [48, 72], [72, 120], [120, 168], [168, 240], [240, 360]],
  css: [[0, 6], [6, 12], [12, 24], [24, 48], [48, 72], [72, 120], [120, 168]],
  planet: [[0, 12], [12, 24], [24, 48], [48, 72], [72, 96], [96, 120]] }[SOURCE] ?? (VENDOR ? [[0, 12], [12, 24], [24, 48], [48, 72], [72, 120], [120, 168], [168, 336]] : null) ?? [[0, 6], [6, 12], [12, 24], [24, 36], [36, 48], [48, 60], [60, 72]];

// ---- weather in force today, as issued
const today = args.weather ?? new Date(Date.now() - 12 * HOUR).toISOString().slice(0, 10);
const weather = weatherRows(today, '2026-07-15', '2026-12-14');
const spw = S.spwBytes(weather.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG })));
const FIT = { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior };
const PCF = { X0: S.pcfBytes({ forces: XMC.arms.X0.forces, fit: FIT }), X2: S.pcfBytes({ forces: XMC.arms.X2.forces, fit: FIT }) };
const EXTRA = { X0: undefined, X2: { rows: spw } };
// --variants: JSON [{ name, atmosphere, gravity, degree, order, srp, agom, thirdBodies, ... }]: extra FFM candidates beside the atmospheres.
const FFM_VARIANTS = [...(args.atmospheres ?? 'NRLMSISE00').split(',').filter(Boolean).map((atmosphere) => ({ name: atmosphere, atmosphere })), ...(args.variants ? JSON.parse(args.variants) : [])];
const integrator = { tolerance: 1e-10, maxStep: 120, minStep: 1e-4 };
const COST_NOTE = { ffm: { integrator: 'RK78', tolerance: integrator.tolerance, maxStepSeconds: integrator.maxStep, gravity: '70x70', outputSeconds: THIN_MS / 1000 }, xp: 'the theory\'s own grid; output at 300 s', sgp4: 'analytic; output at 300 s' };

const M = await openModules();
const G = await openSgp4Fit();
const F = await openFfmHost();
const axes = await openAxes();
const rmsOf = (e) => Math.sqrt(e.reduce((s, x) => s + x * x, 0) / e.length);

for (const file of FILES) {
  const started = Date.now();
  const row = { source: SOURCE, norad: file.norad, object: file.object, name: file.name, fetchedAt: isoMs(started), arms: {}, weatherObservedThrough: weather.observedThrough, costNote: COST_NOTE };
  try {
    const { lines: raw, meta, frame: rawFrame } = await file.read();
    row.meta = meta;
    row.norad = file.norad;
    const leo = Math.hypot(...raw[0].r) < 8400;
    const label = file.label ?? (VENDOR ? `${SOURCE}-${leo ? 'leo' : 'high'}` : SOURCE);
    row.source = label;
    const t0 = Date.parse(raw[0].epoch), tEnd = Date.parse(raw.at(-1).epoch);
    row.states = raw.length; row.start = raw[0].epoch; row.stop = raw.at(-1).epoch;
    // The scoring and fit grid: every 300 s from the file's first state.
    let lastKept = -Infinity;
    const thin = VENDOR ? raw.filter((l) => { const t = Date.parse(l.epoch); if (t - lastKept < 200000) return false; lastKept = t; return true; }) : raw.filter((l) => (Date.parse(l.epoch) - t0) % THIN_MS === 0);
    const gcrf = rawFrame === 'GCRF' ? thin : await axes.convert(thin, 'EME2000', 'GCRF');
    const epochs = gcrf.map((l) => l.epoch), epochsMs = epochs.map((e) => Date.parse(e)), truth = gcrf.map((l) => ({ r: l.r, v: l.v }));
    const hours = epochsMs.map((t) => (t - t0) / HOUR);
    const score = async (states) => {
      const e = await M.rtn(states, truth);
      const bins = {};
      for (const [a, b] of BINS) {
        const v = e.filter((_, i) => hours[i] > a && hours[i] <= b);
        if (v.length) bins[`${a}-${b}`] = { km: Number(Math.hypot(rmsOf(v.map((x) => x[0])), rmsOf(v.map((x) => x[1])), rmsOf(v.map((x) => x[2]))).toFixed(4)), r: Number(rmsOf(v.map((x) => x[0])).toFixed(4)), t: Number(rmsOf(v.map((x) => x[1])).toFixed(4)), n: Number(rmsOf(v.map((x) => x[2])).toFixed(4)) };
      }
      return bins;
    };
    // The operator's own forecast, kept as a compact SDS $OEM at 300 s in GCRF (owner 2026-10-23 for SpaceX's forecasts: compact SDS copies, never the raw text), so a newer file can score it.
    row.forecastOem = Buffer.from(S.oemBytes({ frame: 'GCRF', object: { name: file.object, id: '', norad: file.norad }, lines: gcrf, useableStart: epochs[0], useableStop: epochs.at(-1), originator: 'operator-theory' })).toString('base64');
    const object = { name: file.object, id: '', norad: file.norad };
    const block = (hoursEnd) => {
      const end = t0 + hoursEnd * HOUR, arc = gcrf.filter((l) => Date.parse(l.epoch) <= end);
      return { arc, oem: S.oemBytes({ frame: 'GCRF', object, lines: arc, useableStart: arc[0].epoch, useableStop: arc.at(-1).epoch, originator: 'operator-theory' }) };
    };

    // S: our SupGP recipe, CelesTrak's window
    {
      const { oem } = block(SUPGP_WINDOW_H);
      const a = { fitHours: SUPGP_WINDOW_H };
      try {
        const t1 = performance.now();
        const { fr, el, bstar } = await G.fit(oem, { from: raw[0].epoch, to: isoMs(t0 + SUPGP_WINDOW_H * HOUR), epoch: 'first', fitBstar: true }, { name: file.object, objectId: '' });
        a.fitMs = performance.now() - t1;
        const t2 = performance.now();
        const flown = await M.propagateSgp4(el, file.norad, epochsMs, VENDOR ? (epochsMs[1] - epochsMs[0]) / 1000 : THIN_MS / 1000);
        a.flyMs = performance.now() - t2;
        const missing = flown.filter((x) => !x).length;
        if (missing) throw new Error(`${missing} states absent`);
        const inGcrf = await M.toAxes(flown, epochs, 'GCRF');
        a.ok = true; a.bstar = bstar; a.reportedRmsKm = fr.rms3d ?? fr.rms ?? null; a.bins = await score(inGcrf); a.product = el;
      } catch (error) { a.ok = false; a.error = short(error); }
      row.arms[`S${SUPGP_WINDOW_H}`] = a;
    }
    const ffmSettings = (overrides = {}, variantAgom) => {
      if (VENDOR && !leo) return {
        forces: { gravity: 'SPHERICAL_HARMONICS', degree: 70, order: 70, thirdBodies: [10, 301], srp: true, drag: false, solidTides: true, relativity: 'IERS_2010' },
        integrator, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
        parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
      };
      const seedB = meta.statedB ?? (SOURCE === 'planet' || VENDOR ? 0.01 : 0.03);
      const agom = variantAgom ?? (SOURCE === 'iss' || SOURCE === 'css' ? 0 : SOURCE === 'planet' || VENDOR ? 0.02 : (file.norad < 56000 ? 0.11 : 0.19));
      return {
        forces: { gravity: 'SPHERICAL_HARMONICS', degree: 70, order: 70, thirdBodies: [10, 301], srp: !['iss', 'css'].includes(SOURCE), drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: 'IERS_2010', ...overrides },
        integrator, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
        parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: seedB }], fixed: { agom }, apriori: apriori([seedB * 10]),
      };
    };
    for (const arc of ARCS) {
      if ((SOURCE === 'starlink' || VENDOR) && arc >= 48 && Date.parse(epochs.at(-1)) - t0 < arc * HOUR) continue;
      if (VENDOR && Date.parse(epochs.at(-1)) - t0 < arc * HOUR) continue;
      // Never across SpaceX's 48 h join: the fit's last state is before it.
      const { arc: states, oem } = block(SOURCE === 'starlink' && arc >= 48 ? 47.9 : arc);
      for (const name of ['X0', 'X2']) {
        const a = { fitHours: arc, states: states.length };
        const t1 = performance.now();
        const f = await M.fit(oem, PCF[name], EXTRA[name]);
        a.fitMs = performance.now() - t1;
        if (!f.ok) { a.ok = false; a.error = f.error; row.arms[`${name}@${arc}`] = a; continue; }
        const info = S.readFitOmm(f.omm);
        a.bterm = info.bterm; a.agom = info.agom; a.iterations = info.iterations; a.reportedRmsKm = info.fitRmsKm;
        try {
          const t2 = performance.now();
          const flown = await M.propagate(f.omm, S.gridBytes(epochs), PCF[name], EXTRA[name], epochs.length);
          a.flyMs = performance.now() - t2;
          a.ok = true; a.bins = await score(await M.toAxes(flown, epochs, 'GCRF')); a.product = Buffer.from(f.omm).toString('base64');
        } catch (error) { a.ok = false; a.error = short(error); }
        row.arms[`${name}@${arc}`] = a;
      }
      for (const variant of (VENDOR && !leo ? [{ name: 'NO-DRAG' }] : FFM_VARIANTS)) {
        const a = { fitHours: arc, states: states.length };
        const { name: variantName, agom: variantAgom, ...overrides } = variant;
        const settings = ffmSettings(overrides, variantAgom);
        const t1 = performance.now();
        try {
          const f = await F.fit(states, [...states[0].r, ...states[0].v], settings, weather.rows, Date.parse(states.at(-1).epoch));
          a.fitMs = performance.now() - t1;
          a.termination = f.termination; a.iterations = f.iterations; a.ffmCalls = f.ffmCalls;
          if (!f.state) throw new Error(f.error ?? f.termination);
          a.b = f.parameters?.[0]?.value;
          const t2 = performance.now();
          const flown = await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, settings, weather.rows);
          a.flyMs = performance.now() - t2;
          a.ok = !!f.ok; a.bins = await score(flown); a.product = { epoch: f.epoch, state: f.state, parameters: f.parameters, forces: settings.forces, fixed: settings.fixed };
        } catch (error) { a.ok = false; a.error = short(error); }
        row.arms[`F-${variantName}@${arc}`] = a;
      }
      // RFa12: XP2's front-page recipe (experiments/xp2-fit-design): drag from an FFM fit of the arc's last 12 h, elements from its last 17 h with that drag held.
      if (!VENDOR || leo) {
        const a = { fitHours: arc };
        const end = t0 + (SOURCE === 'starlink' && arc >= 48 ? 47.9 : arc) * HOUR;
        const last = (h) => gcrf.filter((l) => { const t = Date.parse(l.epoch); return t >= end - h * HOUR && t <= end; });
        try {
          const settings = ffmSettings();
          const drag = last(12), elements = last(17);
          const t1 = performance.now();
          const g = await F.fit(drag, [...drag[0].r, ...drag[0].v], settings, weather.rows, end);
          a.dragFitMs = performance.now() - t1;
          a.termination = g.termination;
          const b = g.parameters?.[0]?.value;
          a.bHeld = b;
          if (!g.state) throw new Error(g.error ?? g.termination);
          if (!(b > 0)) throw new Error('no positive drag from the 12 h fit');
          const pcf = S.pcfBytes({ forces: XMC.arms.X2.forces, fit: { dragPrior: { form: 'LOG_NORMAL', mean: b, sigma: 1e-6 }, srpPrior: FIT.srpPrior } });
          const t2 = performance.now();
          const f = await M.fit(S.oemBytes({ frame: 'GCRF', object, lines: elements, useableStart: elements[0].epoch, useableStop: elements.at(-1).epoch, originator: 'operator-theory' }), pcf, EXTRA.X2);
          a.fitMs = performance.now() - t2;
          if (!f.ok) throw new Error(f.error);
          const t3 = performance.now();
          const flown = await M.propagate(f.omm, S.gridBytes(epochs), pcf, EXTRA.X2, epochs.length);
          a.flyMs = performance.now() - t3;
          a.ok = true; a.bins = await score(await M.toAxes(flown, epochs, 'GCRF')); a.product = { omm: Buffer.from(f.omm).toString('base64'), b };
        } catch (error) { a.ok = false; a.error = short(error); }
        row.arms[`RFa12@${arc}`] = a;
      }
    }
  } catch (error) { row.error = short(error); }
  row.wallSeconds = (Date.now() - started) / 1000;
  const products = Object.fromEntries(Object.entries(row.arms).filter(([, a]) => a.product).map(([k, a]) => [k, a.product]));
  fs.writeFileSync(path.join(OUT, 'products', `${SOURCE}-${file.norad}-${started}.json`), JSON.stringify({ name: file.name, norad: file.norad, object: file.object, source: row.source, fetchedAt: row.fetchedAt, start: row.start, stop: row.stop, weatherDay: today, forecastOem: row.forecastOem ?? null, products }));
  delete row.forecastOem;
  for (const a of Object.values(row.arms)) delete a.product;
  fs.appendFileSync(path.join(OUT, `arms-${SOURCE}.jsonl`), `${JSON.stringify(row)}\n`);
  console.error(`${file.object} ${row.error ?? 'ok'} ${row.wallSeconds.toFixed(0)} s`);
  await nap(500);
}
await F.close(); await axes.close(); await M.close();
process.exit(0);
