// COMPARE.md: the worked examples behind the site's globe: one real forecast for each provider and regime (next-prediction) and for each satellite (truth), every arm flown over the
// whole span, written as positions the page draws. The example is not picked by eye: of the forecasts with every arm present, the one whose AP error at the rule's lead is nearest AP's
// median for that cell, ties broken by key. Lead: 72 h on next-prediction pairs, day 3 on precise-orbit windows. Module calls only; interpolation of a 300 s table is a data step, as in score.mjs.
//   node experiments/operator-theory/compare-examples.mjs --mode next --out <dir>
//   node experiments/operator-theory/compare-examples.mjs --mode truth --out <dir>          (XP2F_CONTROL=1 and --mode truth2 for AP2.md's windows)
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const MODE = args.mode, OUT = args.out;
if (!MODE || !OUT) throw new Error('--mode and --out');
fs.mkdirSync(OUT, { recursive: true });
const STORE = '/opt/data/sdn-archive/operator-theory', AP = path.join(STORE, 'ap'), NEW = path.join(AP, 'b040');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const HOUR = 3600000, DAY = 86400000, MU = 398600.4418;
const int32 = (positions) => Buffer.from(Int32Array.from(positions.flatMap((p) => p.map((x) => Math.round(x * 1000)))).buffer);
const TRACKS = ['reference', 'AP', 'XP', 'SGP4', 'FFM'];
const meanMotion = (s) => { const r = Math.hypot(...s.r), v = Math.hypot(...s.v), a = 1 / (2 / r - (v * v) / MU); return 86400 / (2 * Math.PI * Math.sqrt((a * a * a) / MU)); };
// <id>.json describes the example; <id>.bin holds its positions, Int32 meters, little endian, in TRACKS order.
const write = (doc) => {
  fs.writeFileSync(path.join(OUT, `${doc.id}.bin`), Buffer.concat(TRACKS.map((k) => doc.tracks[k])));
  fs.writeFileSync(path.join(OUT, `${doc.id}.json`), `${JSON.stringify({ ...doc, tracks: TRACKS })}\n`);
  console.error(`${doc.id}: ${doc.count} states, ${Math.round(fs.statSync(path.join(OUT, `${doc.id}.bin`)).size / 1024)} KB`);
};
const nearestMedian = (list, value) => { const v = list.map(value).filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return []; const m = v[Math.floor((v.length - 1) / 2)]; return [...list].filter((r) => Number.isFinite(value(r))).sort((a, b) => Math.abs(value(a) - m) - Math.abs(value(b) - m) || String(a.key).localeCompare(String(b.key))); };

if (MODE === 'next') {
  const { isoMs, openFfmHost } = await import('./lib/host.mjs');
  const { binOf } = await import('./lib/compare.mjs');
  const { weatherRows } = await import('./lib/weather.mjs');
  const { openAp } = await import('./lib/ap.mjs');
  const { openModules } = await import('../xp-atmosphere-merit/lib/modules.mjs');
  const { openSgp4Fit } = await import('../xp2-fit-design/lib/sgp4fit.mjs');
  const S = await import('../xp-atmosphere-merit/lib/sds.mjs');
  const { config: XMC } = await import('../xp-atmosphere-merit/common.mjs');
  const FIT = { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior };
  const M = await openModules(), G = await openSgp4Fit(), F = await openFfmHost();
  const A040 = await openAp(path.join(NEW, 'module.wasm')), A030 = await openAp(path.join(AP, 'module.wasm'));
  const key = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
  const rows = rowsIn(path.join(NEW, 'laser', 'forward')).filter((r) => binOf(r.leadHours) === 72);
  const stores = ['laser-sgp4', 'laser-sgp4-high'].map((d) => new Map(rowsIn(path.join(NEW, d)).map((r) => [key(r), r])));
  const sgp = (r) => stores.map((s) => s.get(key(r))?.arms['S@48']?.km).find(Number.isFinite);
  const ffmRows = new Map(rowsIn(path.join(STORE, 'cheaper', 'forward')).map((r) => [key(r), r]));
  const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
  const regimeOf = (r) => (r.source.endsWith('-leo') ? 'Low orbit' : NAV.test(r.object) ? 'Navigation' : 'Geodetic');
  const cells = new Map();
  for (const r of rows) { const k = `${regimeOf(r)}|${r.source.split('-')[1]}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(r); }
  const findProduct = (root, source, norad, start) => {
    for (const c of fs.readdirSync(root).filter((d) => /^c\d{8}T\d{4}$/.test(d))) {
      const dir = path.join(root, c, 'products');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((n) => n.includes(`-${norad}-`))) {
        const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (p.source === source && p.start === start) return p;
      }
    }
    return null;
  };
  const lines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
  function interpolate(table, t) {
    const ts = table.map((l) => Date.parse(l.epoch));
    const i = ts.findIndex((x) => x >= t);
    if (i < 0 || t < ts[0]) return null;
    const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
    const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
    const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(table[a])[c], 0));
    return { r: mix((l) => l.r), v: mix((l) => l.v) };
  }
  for (const [cell, list] of cells) {
    const [regime, provider] = cell.split('|');
    const leo = regime === 'Low orbit';
    const ffmName = leo ? 'F-M40@48' : 'F-H20@48';
    const ranked = nearestMedian(list.filter((r) => Number.isFinite(sgp(r)) && Number.isFinite(ffmRows.get(key(r))?.arms[ffmName]?.km)), (r) => r.arms['A-APn@48']?.km);
    const id = `next-${provider}-${regime.toLowerCase().replace(/\s+/g, '-')}`;
    if (!ranked.length) { console.error(`${id}: no forecast has every arm`); continue; }
    const pick = ranked[0];
    const apP = findProduct(path.join(NEW, 'laser'), pick.source, pick.norad, pick.olderStart);
    const xpP = findProduct(path.join(AP, 'laser'), pick.source, pick.norad, pick.olderStart);
    const ffP = findProduct(path.join(STORE, 'cheaper'), pick.source, pick.norad, pick.olderStart);
    const newer = findProduct(path.join(NEW, 'laser'), pick.source, pick.norad, pick.newerStart);
    if (!apP || !xpP || !ffP || !newer) { console.error(`${id}: a stored product is missing`); continue; }
    const older = lines(apP.forecastOem), next = lines(newer.forecastOem);
    const t0 = Date.parse(older[0].epoch), tn = Date.parse(next[0].epoch), step = (leo ? 120 : 300) * 1000, end = tn + 3 * HOUR;
    const ms = []; for (let t = t0 + step; t <= end; t += step) ms.push(t);
    const reference = ms.map((t) => (t < tn ? interpolate(older, t) : interpolate(next, t)));
    const keep = ms.map((_, i) => !!reference[i]);
    const epochsMs = ms.filter((_, i) => keep[i]), epochs = epochsMs.map(isoMs), refs = reference.filter(Boolean);
    const w = weatherRows(apP.weatherDay, '2026-02-20', '2026-12-14');
    const spw = S.spwBytes(w.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG })));
    const tracks = { reference: refs.map((s) => s.r) };
    const a = apP.products['A-APn@48'], x = xpP.products['A-XP@48'], f = ffP.products[ffmName];
    tracks.AP = (await M.toAxes(await A040.propagate(Buffer.from(a.omm, 'base64'), S.gridBytes(epochs), S.pcfBytes({ forces: a.forces, fit: FIT }), { rows: spw }, epochs.length), epochs, 'GCRF')).map((s) => s.r);
    tracks.XP = (await M.toAxes(await A030.propagate(Buffer.from(x.omm, 'base64'), S.gridBytes(epochs), S.pcfBytes({ forces: x.forces, fit: FIT }), undefined, epochs.length), epochs, 'GCRF')).map((s) => s.r);
    const seg = older.filter((l) => Date.parse(l.epoch) <= t0 + 48 * HOUR);
    const { el } = await G.fit(S.oemBytes({ frame: 'GCRF', object: { name: pick.object, id: '', norad: pick.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' }), { from: seg[0].epoch, to: isoMs(t0 + 48 * HOUR), epoch: 'first', fitBstar: true }, { name: pick.object, objectId: '' });
    const flown = await M.propagateSgp4(el, pick.norad, epochsMs, step / 1000);
    if (flown.some((s) => !s)) { console.error(`${id}: SGP4 returned no state at some epochs`); continue; }
    tracks.SGP4 = (await M.toAxes(flown, epochs, 'GCRF')).map((s) => s.r);
    tracks.FFM = (await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, { forces: f.forces, fixed: f.fixed, integrator: f.integrator }, w.rows)).map((s) => s.r);
    write({ id, reference: 'next', regime, provider, satellite: pick.object, fitHours: 48, leadHours: pick.leadHours, start: isoMs(t0), fitEndMs: t0 + 48 * HOUR, scoreFromMs: tn, scoreToMs: end, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion(refs[0]), count: epochs.length, ffm: leo ? 'FFM 40×40' : 'FFM 20×20', tracks: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, int32(v)])) });
  }
  await F.close(); await M.close();
} else if (MODE === 'providers') {
  // Every provider whose terms let its positions be redrawn here, on the site table's 24 h fit: of its pairs with every arm present and a target at least 6 h past the fit where it has any, the one whose AP error is nearest AP's median. Planet's are not redrawn: its terms are non-commercial.
  const FIT_H = 24;
  const ISS = args.only === 'iss';
  const { isoMs, openFfmHost, openAxes, apriori } = await import('./lib/host.mjs');
  const { weatherRows } = await import('./lib/weather.mjs');
  const { openAp, apForces } = await import('./lib/ap.mjs');
  const { openModules } = await import('../xp-atmosphere-merit/lib/modules.mjs');
  const { openSgp4Fit } = await import('../xp2-fit-design/lib/sgp4fit.mjs');
  const S = await import('../xp-atmosphere-merit/lib/sds.mjs');
  const { config: XMC } = await import('../xp-atmosphere-merit/common.mjs');
  const W = ISS ? await import('../xp-atmosphere-merit/lib/weather.mjs') : null;
  const { driverRows } = ISS ? await import('../ffm-atmosphere-xm3/lib/ffm.mjs') : {};
  const M = await openModules(), G = await openSgp4Fit(), F = await openFfmHost(), A = await openAp(path.join(NEW, 'module.wasm'));
  const axes = ISS ? await openAxes() : null;
  const PCF_AP = S.pcfBytes({ forces: apForces(XMC.arms.X2.forces, { tesseral: 31, zonal: 20 }), fit: null }), PCF_XP = S.pcfBytes({ forces: {}, fit: null });
  const LABEL = { starlink: ['SpaceX', 'Low orbit, maneuvering'], iss: ['NASA ISS', 'Low orbit, crewed'], gps: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], glonass: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], intelsat: ['Intelsat', 'Geostationary, station-kept'], ses: ['SES', 'Geostationary, station-kept'] };
  const rows = fs.readdirSync(path.join(NEW, 'providers')).filter((f) => /^rows(-iss)?-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(NEW, 'providers', f))).filter((r) => !r.error);
  const lines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
  const roots = [STORE, path.join(STORE, 'vendors')];
  const findStored = (source, norad, start) => {
    for (const root of roots) for (const c of fs.readdirSync(root).filter((d) => /^c\d{8}T\d{4}$/.test(d))) {
      const dir = path.join(root, c, 'products');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((n) => n.startsWith(`${source}-`) && n.includes(`-${norad}-`))) { const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (p.start === start && p.forecastOem) return p; }
    }
    return null;
  };
  const ISS_ARCHIVE = '/opt/data/sdn-archive/hac/nasa-iss-oem-archive';
  const issFile = async (start) => {
    for (const d of fs.readdirSync(ISS_ARCHIVE).filter((n) => /^2026-0[1-5]-\d\d$/.test(n)).sort()) {
      const file = path.join(ISS_ARCHIVE, d, 'ISS.OEM_J2K_EPH.txt');
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      const first = /^(\d{4}-\d{2}-\d{2}T[\d:.]+)\s/m.exec(text.slice(0, 20000))?.[1];
      if (first && isoMs(Date.parse(`${first}Z`)) === start) {
        const raw = [];
        for (const line of text.split('\n')) { const t = line.trim().split(/\s+/); if (t.length === 7 && /^\d{4}-\d\d-\d\dT/.test(t[0])) raw.push({ epoch: isoMs(Date.parse(`${t[0]}Z`)), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) }); }
        const num = (name) => Number(new RegExp(`COMMENT ${name}=([0-9.]+)`).exec(text)?.[1]);
        const gcrf = await axes.convert(raw, 'EME2000', 'GCRF');
        gcrf.statedB = (num('DRAG_COEFF') * num('DRAG_AREA')) / num('MASS');
        return gcrf;
      }
    }
    return null;
  };
  function interpolate(table, t) {
    const ts = table.map((l) => Date.parse(l.epoch));
    const i = ts.findIndex((x) => x >= t);
    if (i < 0 || t < ts[0]) return null;
    const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
    const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
    const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(table[a])[c], 0));
    return { r: mix((l) => l.r), v: mix((l) => l.v) };
  }
  for (const source of Object.keys(LABEL).filter((k) => (ISS ? k === 'iss' : k !== 'iss'))) {
    const [provider, regime] = LABEL[source];
    const usable = rows.filter((r) => r.source === source && Number.isFinite(r.arms[`S@${FIT_H}`]?.km) && Number.isFinite(r.arms[`A-XP@${FIT_H}`]?.km));
    const past = usable.filter((r) => r.leadHours >= FIT_H + 6);
    const ranked = nearestMedian(past.length ? past : usable, (r) => r.arms[`A-APn@${FIT_H}`]?.km);
    const id = `next-${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${source}`;
    let done = false;
    for (const pick of ranked.slice(0, 8)) {
      try {
        const oldP = ISS ? null : findStored(source, pick.norad, pick.olderStart);
        const newP = ISS ? null : findStored(source, pick.norad, pick.newerStart);
        const older = ISS ? await issFile(pick.olderStart) : oldP && lines(oldP.forecastOem);
        const next = ISS ? await issFile(pick.newerStart) : newP && lines(newP.forecastOem);
        if (!older || !next) continue;
        const t0 = Date.parse(older[0].epoch), tn = Date.parse(next[0].epoch), leo = Math.hypot(...older[0].r) < 8400;
        const step = (leo ? 120 : 300) * 1000, end = tn + 3 * HOUR;
        const ms = []; for (let t = t0 + step; t <= end; t += step) ms.push(t);
        const refs = ms.map((t) => (t < tn ? interpolate(older, t) : interpolate(next, t)));
        const epochsMs = ms.filter((_, i) => refs[i]), epochs = epochsMs.map(isoMs), reference = refs.filter(Boolean), gridB = S.gridBytes(epochs);
        let extra, spw;
        if (ISS) {
          const O = W.rowsO(t0 - 72 * HOUR - XMC.conditions.rowsMarginDays * DAY, t0);
          if (O.excluded) continue;
          extra = { rows: S.spwBytes(O.rows) };
          spw = driverRows(O.rows, t0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
        } else {
          const w = weatherRows(oldP.weatherDay, '2026-07-15', '2026-12-14');
          spw = w.rows;
          extra = { rows: S.spwBytes(w.rows.map((r) => ({ date: r.DATE, f107: r.F107_OBS, c81: r.F107_OBS_CENTER81, ap: r.AP_AVG }))) };
        }
        const seg = older.filter((l) => Date.parse(l.epoch) <= t0 + FIT_H * HOUR);
        const oem = S.oemBytes({ frame: 'GCRF', object: { name: pick.object, id: '', norad: pick.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
        const fa = await A.fit(oem, PCF_AP, extra); if (!fa.ok) continue;
        const fx = await A.fit(oem, PCF_XP, undefined); if (!fx.ok) continue;
        const { el } = await G.fit(oem, { from: seg[0].epoch, to: seg.at(-1).epoch, epoch: 'first', fitBstar: true }, { name: pick.object, objectId: '' });
        const sg = await M.propagateSgp4(el, pick.norad, epochsMs, step / 1000);
        if (sg.some((x) => !x)) continue;
        const seed = older.statedB ?? 0.01;
        const settings = leo
          ? { forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: !ISS, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined }, integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: seed }], fixed: { agom: ISS ? 0 : 0.02 }, apriori: apriori([seed * 10]) }
          : { forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined }, integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) };
        const ff = await F.fit(seg, [...seg[0].r, ...seg[0].v], settings, spw, Date.parse(seg.at(-1).epoch));
        if (!ff.state) continue;
        const tracks = {
          reference: reference.map((x) => x.r),
          AP: (await M.toAxes(await A.propagate(fa.omm, gridB, PCF_AP, extra, epochs.length), epochs, 'GCRF')).map((x) => x.r),
          XP: (await M.toAxes(await A.propagate(fx.omm, gridB, PCF_XP, undefined, epochs.length), epochs, 'GCRF')).map((x) => x.r),
          SGP4: (await M.toAxes(sg, epochs, 'GCRF')).map((x) => x.r),
          FFM: (await F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, epochs, settings, spw)).map((x) => x.r),
        };
        write({ id, reference: 'next', regime, provider, satellite: pick.object, fitHours: FIT_H, leadHours: pick.leadHours, start: isoMs(t0), fitEndMs: t0 + FIT_H * HOUR, scoreFromMs: tn, scoreToMs: end, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion(reference[0]), count: epochs.length, ffm: leo ? 'FFM 40×40' : 'FFM 20×20', tracks: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, int32(v)])) });
        done = true;
        break;
      } catch (error) { console.error(`${id} ${pick.key}: ${String(error?.message ?? error).slice(0, 140)}`); }
    }
    if (!done) console.error(`${id}: none of the nearest forecasts had every arm`);
  }
  await F.close();
} else if (MODE === 'regimes') {
  // AP6.md's regimes: for each satellite named, the 72 h forecast whose AP error on day 3 is nearest AP's median for that satellite. Data E's orbits are not republished, so that group has no example.
  const { config, root, iso, ms, XM } = await import('../xp2-fit-design/common.mjs');
  const { pathToFileURL } = await import('node:url');
  const { openSgp4Fit } = await import('../xp2-fit-design/lib/sgp4fit.mjs');
  const { driverRows } = await import('../ffm-atmosphere-xm3/lib/ffm.mjs');
  const { openAp, apForces } = await import('./lib/ap.mjs');
  const { openFfmHost, openAxes, apriori } = await import('./lib/host.mjs');
  const { STATIC, TESS, GROUPS } = await import('./lib/regimes.mjs');
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const m = await openModules(), A = await openAp(path.join(NEW, 'module.wasm')), G = await openSgp4Fit(), F = await openFfmHost();
  const ATM = XM.config.arms.X2.forces, GRID = XM.config.scoring.gridSeconds * 1000;
  const PCF_XP = S.pcfBytes({ forces: {}, fit: null });
  const ffmSettings = (high) => (high ? {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
  } : {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
  });
  const rows = rowsIn(path.join(NEW, 'regimes')).filter((r) => !r.error);
  const NAMED = { LS: ['AJISAI', 'STARLETTE', 'LARES'], GD: ['LAGEOS 2', 'ETALON 1', 'LARES-2'] };
  const picks = [];
  for (const group of ['LS', 'GD', 'IG', 'GE', 'HE']) {
    const names = [...new Set(rows.filter((r) => r.group === group).map((r) => r.name))];
    const chosen = NAMED[group] ? names.filter((n) => NAMED[group].includes(n)) : names.slice(0, group === 'HE' ? 1 : 2);
    for (const name of chosen) picks.push([group, name]);
  }
  const seriesOf = async (group, name) => {
    if (group === 'HE') {
      const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
      const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
      const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
      const axes = await openAxes();
      const norm = s.lines.map((l) => ({ ...l, epoch: new Date(Math.round(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`) / 1000) * 1000).toISOString() }));
      const first = ms(norm[0].epoch);
      const lines = await axes.convert(norm.filter((l) => (ms(l.epoch) - first) % GRID === 0), 'EME2000', 'GCRF');
      await axes.close();
      return { norad: TESS.norad, objectId: TESS.objectId, lines };
    }
    if (group === 'IG' || group === 'GE') {
      const o = SRC.mgex({ klass: group === 'IG' ? 'igso' : 'geo' }).find((x) => x.name === name);
      return { norad: o.norad, objectId: o.objectId ?? '', lines: o.lines };
    }
    for (const o of STATIC.filter((x) => x.group === group)) { const s = SRC.chain(o.files()); if ((s.name || o.name) === name) return { norad: s.norad, objectId: s.objectId ?? '', lines: s.lines }; }
    throw new Error(`no series for ${name}`);
  };
  for (const [group, name] of picks) {
    const id = `truth-${GROUPS[group].label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const vacuum = group === 'HE', arc = 72, D3 = '3';
    const ranked = nearestMedian(rows.filter((r) => r.group === group && r.name === name), (r) => r.arms.AP72?.days?.[D3]?.e);
    const o = await seriesOf(group, name);
    const times = o.lines.map((l) => ms(l.epoch));
    const between = (a, b) => o.lines.filter((_, i) => times[i] >= a && times[i] <= b);
    const stepNative = times[1] - times[0];
    let done = false;
    for (const pick of ranked.slice(0, 8)) {
      try {
        const D0 = Date.parse(pick.cutoff.length === 10 ? `${pick.cutoff}T00:00:00Z` : pick.cutoff);
        const from = D0 - arc * HOUR, to = D0 + 7 * DAY;
        const raw = between(from, D0);
        const thin = T.thinned(raw).chosen;
        const high = Math.hypot(...thin[0].r) >= 8400;
        const want = (high ? 300 : 120) * 1000, step = Math.max(want, Math.ceil(want / stepNative) * stepNative);
        const whole = between(from, to), t0 = ms(whole[0].epoch);
        const grid = whole.filter((l) => (ms(l.epoch) - t0) % step === 0 && ms(l.epoch) > t0);
        const epochs = grid.map((l) => l.epoch), epochsMs = epochs.map(ms), gridB = S.gridBytes(epochs);
        let ex, spw;
        if (!vacuum) {
          const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
          if (R.excluded) continue;
          ex = { rows: S.spwBytes(R.rows) };
          spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
        }
        const pcfAp = S.pcfBytes({ forces: apForces(ATM, { tesseral: 31, zonal: 20, atmosphere: !vacuum }), fit: null });
        const oem = S.oemBytes({ frame: 'GCRF', object: { name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
        const fa = await A.fit(oem, pcfAp, ex); if (!fa.ok) continue;
        const fx = await A.fit(oem, PCF_XP, undefined); if (!fx.ok) continue;
        const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name, objectId: o.objectId });
        const settings = ffmSettings(high);
        const ff = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0); if (!ff.state) continue;
        const sg = await m.propagateSgp4(el, o.norad, epochsMs, step / 1000);
        if (sg.some((s) => !s)) continue;
        if (epochsMs.some((t) => t <= Date.parse(ff.epoch))) continue;
        const tracks = {
          reference: grid.map((l) => l.r),
          AP: (await m.toAxes(await A.propagate(fa.omm, gridB, pcfAp, ex, epochs.length), epochs, 'GCRF')).map((s) => s.r),
          XP: (await m.toAxes(await A.propagate(fx.omm, gridB, PCF_XP, undefined, epochs.length), epochs, 'GCRF')).map((s) => s.r),
          SGP4: (await m.toAxes(sg, epochs, 'GCRF')).map((s) => s.r),
          FFM: (await F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, epochs, settings, spw)).map((s) => s.r),
        };
        write({ id, reference: 'truth', regime: GROUPS[group].label, provider: GROUPS[group].provider, satellite: name, fitHours: arc, cutoff: iso(D0), start: iso(t0), fitEndMs: D0, scoreFromMs: D0, scoreToMs: to, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion({ r: grid[0].r, v: grid[0].v }), count: epochs.length, ffm: high ? 'FFM 20×20' : 'FFM 40×40', tracks: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, int32(v)])) });
        done = true;
        break;
      } catch (error) { console.error(`${id} ${pick.key}: ${String(error?.message ?? error).slice(0, 140)}`); }
    }
    if (!done) console.error(`${id}: none of the nearest forecasts had every arm`);
  }
  await F.close();
} else {
  const ON_XM = MODE === 'truth2';
  const { config, root, iso, ms, XM, windows } = await import('../xp2-fit-design/common.mjs');
  const { openSgp4Fit } = await import('../xp2-fit-design/lib/sgp4fit.mjs');
  const { driverRows } = await import('../ffm-atmosphere-xm3/lib/ffm.mjs');
  const { openAp, apForces } = await import('./lib/ap.mjs');
  const { openFfmHost, apriori } = await import('./lib/host.mjs');
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const m = await openModules(), A = await openAp(path.join(NEW, 'module.wasm')), G = await openSgp4Fit(), F = await openFfmHost();
  const ATM = XM.config.arms.X2.forces, PCF_AP = S.pcfBytes({ forces: apForces(ATM, { tesseral: 31, zonal: 20 }), fit: null }), PCF_XP = S.pcfBytes({ forces: {}, fit: null });
  const MIN_COV = XM.config.fit.minimumCoverage;
  const ffmSettings = (high) => (high ? {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
  } : {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
  });
  const rows = rowsIn(path.join(NEW, ON_XM ? 'truth2' : 'truth')).filter((r) => !r.error);
  const allWindows = ON_XM ? Object.entries(XM.config.groups).flatMap(([group, g]) => g.objects.flatMap((o) => XM.daysOf(XM.config.period.from, XM.config.period.to).map((t) => ({ group, o, cutoffMs: t, key: `${group}|${o.norad}|${XM.dateOf(t)}` })))) : Object.keys(config.spans).flatMap((s) => windows(s));
  const byKey = new Map(allWindows.map((w) => [w.key, w]));
  const CUTS = ON_XM ? [{ group: 'S1', regime: 'Near 700 km', provider: 'Copernicus', arc: 72 }, { group: 'GN', regime: 'Medium Earth orbit', provider: 'ESA navigation', arc: 72 }, { group: 'P', regime: 'Strong drag, 2026', provider: 'ESA', arc: 24, only: /^Swarm/ }] : [{ group: undefined, regime: 'Strong drag, 2025', provider: 'ESA', arc: 24, only: /^Swarm/ }];
  for (const cut of CUTS) {
    const inCut = rows.filter((r) => (ON_XM ? r.group === cut.group : true) && (!cut.only || cut.only.test(r.name)));
    for (const name of [...new Set(inCut.map((r) => r.name))]) {
      const arm = `AP${cut.arc}`;
      const ranked = nearestMedian(inCut.filter((r) => r.name === name), (r) => r.arms[arm]?.days?.['3']?.e);
      const id = `truth-${cut.regime.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      let done = false;
      for (const pick of ranked.slice(0, 12)) {
        const w = byKey.get(pick.key);
        if (!w) continue;
        try {
          const { o, cutoffMs: D0 } = w;
          const from = D0 - cut.arc * HOUR, to = D0 + 7 * DAY;
          const raw = T.series(o, from, D0).lines;
          const coverage = raw.length > 1 ? raw.length / ((cut.arc * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
          if (coverage < MIN_COV) continue;
          const thin = T.thinned(raw).chosen;
          const high = Math.hypot(...thin[0].r) >= 8400, step = (high ? 300 : 120) * 1000;
          const whole = [...raw, ...T.series(o, D0 + 1, to).lines];
          const t0 = ms(whole[0].epoch);
          const grid = whole.filter((l) => (ms(l.epoch) - t0) % step === 0 && ms(l.epoch) > t0);
          if (grid.length < 100) continue;
          const epochs = grid.map((l) => l.epoch), epochsMs = epochs.map(ms), gridB = S.gridBytes(epochs);
          const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
          if (O.excluded) continue;
          const ex = { rows: S.spwBytes(O.rows) };
          const spw = driverRows(O.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
          const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
          const fa = await A.fit(oem, PCF_AP, ex); if (!fa.ok) continue;
          const fx = await A.fit(oem, PCF_XP, undefined); if (!fx.ok) continue;
          const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: o.name, objectId: o.objectId ?? '' });
          const settings = ffmSettings(high);
          const ff = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0); if (!ff.state) continue;
          const sg = await m.propagateSgp4(el, o.norad, epochsMs, step / 1000);
          if (sg.some((s) => !s)) continue;
          const ffmFrom = Date.parse(ff.epoch), inFfm = epochs.map((_, i) => epochsMs[i] > ffmFrom);
          if (inFfm.some((b) => !b)) continue;
          const tracks = {
            reference: grid.map((l) => l.r),
            AP: (await m.toAxes(await A.propagate(fa.omm, gridB, PCF_AP, ex, epochs.length), epochs, 'GCRF')).map((s) => s.r),
            XP: (await m.toAxes(await A.propagate(fx.omm, gridB, PCF_XP, undefined, epochs.length), epochs, 'GCRF')).map((s) => s.r),
            SGP4: (await m.toAxes(sg, epochs, 'GCRF')).map((s) => s.r),
            FFM: (await F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, epochs, settings, spw)).map((s) => s.r),
          };
          const publicName = name;
          write({ id, reference: 'truth', regime: cut.regime, provider: cut.provider, satellite: publicName, fitHours: cut.arc, cutoff: iso(D0), start: iso(t0), fitEndMs: D0, scoreFromMs: D0, scoreToMs: to, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion({ r: grid[0].r, v: grid[0].v }), count: epochs.length, ffm: high ? 'FFM 20×20' : 'FFM 40×40', tracks: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, int32(v)])) });
          done = true;
          break;
        } catch (error) { console.error(`${id} ${pick.key}: ${String(error?.message ?? error).slice(0, 140)}`); }
      }
      if (!done) console.error(`${id}: none of the nearest forecasts had every arm`);
    }
  }
  await F.close();
}
process.exit(0);
