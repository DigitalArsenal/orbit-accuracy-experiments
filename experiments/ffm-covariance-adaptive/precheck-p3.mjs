// P3 (PLAN.md section 5): the inputs fresh windows need. Names and status only for fresh-period files, never their values.
//   --archives   RSGA, GFZ Ap and Earth-orientation archives: names, last days, statuses.
//   --inert      R3's weather rows are inert: three R3 windows refitted with Ap and F10.7 doubled must be bit-identical (fit state, covariance, errors, terms).
//   --eop        Earth orientation as issued against what the chain uses, on calibration and validation cutoffs: UT1-UTC and the pole from the IERS Bulletin A at or before each cutoff (dated weekly,
//                datacenter.iers.org) and from the IGS ultra-rapid ERP (dated 6-hourly, BKG) against the C04 the reference states were converted with; and, on 12 GNSS windows chosen by the lowest
//                SHA-256 of C3S|p3|<norad>|<E>, the change in forecast error when the fit arc's SP3 is converted with the Bulletin's rows (analysis/reference-states) and FFM reads them too, and when only
//                FFM reads them. FFM: RK78, relative tolerance 1e-10, steps up to 120 s; fit track 600 s; outputs at the six leads and the 600 s noise grid.
//   --receipt    results/ffm-covariance-adaptive/precheck-P3.json from the parts.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, store, args, registered, Opened, writeReceipt, c2Results, root, sha256, grid, DAY, HOUR, iso } from './common.mjs';

registered();
const opened = new Opened();
const A = '/opt/data/sdn-archive';
const part = path.join(store, 'p3');
fs.mkdirSync(part, { recursive: true });
const UA = 'orbit-accuracy-experiments (research; paced)';
const RAD = Math.PI / (180 * 3600);
const quant = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? { n: s.length, median: s[Math.floor(s.length / 2)], p95: s[Math.floor(s.length * 0.95)], max: s.at(-1) } : null; };

if (args.archives) {
  const list = (d) => (fs.existsSync(d) ? fs.readdirSync(d).sort() : []);
  const logOf = (name) => { const f = path.join(A, 'hac', name, 'fetch-log.jsonl'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
  const summarize = (rows, match) => { const x = rows.filter((r) => match.test(r.name ?? '')); const by = {}; for (const r of x) by[r.status] = (by[r.status] ?? 0) + 1; const ok = x.filter((r) => [200, 304].includes(r.status)); return { requests: x.length, byStatus: by, firstOk: ok[0]?.day ?? null, lastOk: ok.at(-1)?.day ?? null }; };
  const swpc = logOf('noaa-swpc'), gfz = logOf('gfz-kp'), iers = logOf('iers-eop');
  const swpcDays = list(path.join(A, 'hac/noaa-swpc/2026')).filter((d) => /^\d{4}-/.test(d));
  const namesOfLastDay = swpcDays.length ? list(path.join(A, 'hac/noaa-swpc/2026', swpcDays.at(-1))).filter((n) => !n.endsWith('.provenance.json')) : [];
  const eopDays = list(path.join(A, 'hac/iers-eop/2026')).filter((d) => /^\d{4}-/.test(d));
  const withDaily = eopDays.filter((d) => fs.existsSync(path.join(A, 'hac/iers-eop/2026', d, 'finals.daily.iau2000.txt')));
  const out = {
    rsga: { warehouse: { first: list(path.join(A, 'hac/noaa-swpc/warehouse/2026/RSGA')).filter((n) => /RSGA\.txt$/.test(n))[0], last: list(path.join(A, 'hac/noaa-swpc/warehouse/2026/RSGA')).filter((n) => /RSGA\.txt$/.test(n)).at(-1) }, dailyDays: { first: swpcDays[0], last: swpcDays.at(-1), count: swpcDays.length }, lastDayNames: namesOfLastDay, fetchLog: summarize(swpc, /RSGA/) },
    gfz: { dirs: list(path.join(A, 'hac/gfz-kp')).filter((d) => !/\.json/.test(d)), fetchLog: summarize(gfz, /Kp_ap/) },
    earthOrientation: { dailyDays: { first: withDaily[0], last: withDaily.at(-1), count: withDaily.length, days: withDaily }, fetchLog: { daily: summarize(iers, /finals\.daily/), all: summarize(iers, /finals\.all/) }, c04LastRow: fs.readFileSync(path.join(A, 'reference-states/products/eopc04.1962-now'), 'utf8').trim().split('\n').at(-1).slice(0, 16) },
    swpcRoutes: {},
  };
  for (const u of ['https://services.swpc.noaa.gov/text/3-day-forecast.txt', 'https://services.swpc.noaa.gov/text/', 'https://www.swpc.noaa.gov/products/3-day-forecast', 'https://kp.gfz-potsdam.de/app/files/Kp_ap_Ap_SN_F107_since_1932.txt', 'https://datacenter.iers.org/data/6/bulletina-xxxix-041.txt', 'https://datacenter.iers.org/data/latestVersion/finals.daily.iau2000.txt', 'https://igs.bkg.bund.de/root_ftp/IGS/products/2438/']) {
    try { const r = await fetch(u, { method: 'HEAD', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(30e3), redirect: 'follow' }); out.swpcRoutes[u] = { status: r.status, lastModified: r.headers.get('last-modified') }; } catch (error) { out.swpcRoutes[u] = { error: String(error.cause?.code ?? error.message) }; }
    await sleep(3000);
  }
  fs.writeFileSync(path.join(part, 'archives.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ ...out, earthOrientation: { ...out.earthOrientation, dailyDays: { ...out.earthOrientation.dailyDays, days: undefined } } }, null, 0));
  process.exit(0);
}

const { openSession } = await import('./run.mjs');
const { windowOf, msOf, arcLines } = await import('./lib/chain.mjs');
const { settingsFor } = await import('./lib/open.mjs');
const { windowTermsRef } = await import('./lib/terms.mjs');
const fitInput = (lines) => ({ points: lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference: { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) } });
const { editPort } = await import('./lib/environment.mjs');
const SPAN = { fromMs: Date.parse('2025-09-20T00:00:00Z'), toMs: Date.parse('2026-06-15T00:00:00Z'), allowedToMs: Date.parse('2026-06-15T00:00:00Z') };

if (args.inert) {
  const S = await openSession(opened, SPAN);
  const out = [];
  for (const [norad, E] of [[22195, '2026-01-11'], [41859, '2026-01-14'], [37869, '2026-03-04'], [53105, '2026-02-02']]) {
    const Ems = Date.parse(`${E}T00:00:00Z`), win = windowOf(norad, S.arcsFor(norad), Ems, { leadToleranceSeconds: 150 });
    const settings = settingsFor('R3', S.seedOf(norad), false, S.B2C), fi = fitInput(win.track);
    const leads = win.leads.map((l) => ({ ...l, ref: null }));
    const run = async (inputsFn) => { const c0 = S.chain.ctxFor(win.tInMs - 24 * HOUR, win.tInMs + 72 * HOUR), ctx = { ...c0, inputs: inputsFn(c0.inputs) }; const f = await S.fitV3(ctx, fi.points, fi.reference, settings); const t = await windowTermsRef(ctx, S.pairs, f, win.tInMs, leads, settings); return { f, t }; };
    const a = await run((x) => x);
    const b = await run((x) => editPort(x, 'space_weather', 'SPACE_WEATHER', (r) => { for (const k of ['F107_OBS', 'F107_ADJ', 'F107_OBS_CENTER81', 'F107_OBS_LAST81', 'F107_ADJ_CENTER81', 'F107_ADJ_LAST81', 'AP_AVG', 'AP1', 'AP2', 'AP3', 'AP4', 'AP5', 'AP6', 'AP7', 'AP8', 'KP_SUM']) if (r[k] > 0) r[k] *= 2; return r; }));
    out.push({ norad, E, state: JSON.stringify(a.f.state) === JSON.stringify(b.f.state), covariance: JSON.stringify(a.f.covariance) === JSON.stringify(b.f.covariance), terms: JSON.stringify(a.t.leads) === JSON.stringify(b.t.leads) });
    console.error(JSON.stringify(out.at(-1)));
  }
  fs.writeFileSync(path.join(part, 'inert.json'), JSON.stringify({ rule: 'Ap and F10.7 doubled on every row of the arc', windows: out, pass: out.every((x) => x.state && x.covariance && x.terms) }, null, 1));
  process.exit(0);
}

const MONTH = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
/** One Bulletin A: { issued (ms, end of its date), rows: Map mjd -> { x, y, ut1 } (arcsec, s) }. */
function parseBulletin(text) {
  const head = /(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})\s+Vol\.\s+[XLVIC]+\s+No\.\s+(\d+)/.exec(text);
  if (!head) return null;
  const issued = Date.UTC(Number(head[3]), MONTH[head[2]] - 1, Number(head[1]) + 1);
  const rows = new Map(), cut = text.indexOf('CELESTIAL POLE OFFSET');
  for (const m of text.slice(0, cut < 0 ? undefined : cut).matchAll(/^\s+(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{5})\s+(-?\d*\.\d+)\s+(?:\.\d+\s+)?(-?\d*\.\d+)\s+(?:\.\d+\s+)?(-?\d*\.\d+)/gm)) rows.set(Number(m[4]), { x: Number(m[5]), y: Number(m[6]), ut1: Number(m[7]) });
  return { issued, number: head[4], rows };
}
async function get(url, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  await sleep(config.network.pacingSeconds * 1000);
  const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120e3) });
  if (r.status !== 200) return null;
  const b = Buffer.from(await r.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, b);
  return b;
}

if (args.eop) {
  // the Bulletins of the cal/val span
  const issues = [];
  for (const [vol, year, a, b] of [['xxxviii', 2025, 32, 53], ['xxxix', 2026, 1, 24]]) for (let n = a; n <= b; n += 1) {
    const name = `bulletina-${vol}-${String(n).padStart(3, '0')}.txt`;
    const bytes = await get(`https://datacenter.iers.org/data/6/${name}`, path.join(store, 'eop/bulletina', name));
    if (!bytes) continue;
    const p = parseBulletin(bytes.toString('utf8'));
    if (p) issues.push({ ...p, name, year });
  }
  issues.sort((x, y) => x.issued - y.issued);
  // what the chain's reference states were converted with: C04; what FFM reads in cal/val: B1's finals rows
  const c04 = new Map();
  for (const l of opened.read(path.join(A, 'reference-states/products/eopc04.1962-now'), 'C04').toString().split('\n')) { if (!l || l.startsWith('#')) continue; const t = l.trim().split(/\s+/); c04.set(Math.round(Number(t[4])), { x: Number(t[5]), y: Number(t[6]), ut1: Number(t[7]) }); }
  const bulletinAt = (E) => { let best = null; for (const i of issues) if (i.issued <= E) best = i; return best; };
  const interp = (table, mjd) => { const a = table.get(Math.floor(mjd)), b = table.get(Math.floor(mjd) + 1); if (!a || !b) return null; const f = mjd - Math.floor(mjd); return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y), ut1: a.ut1 + f * (b.ut1 - a.ut1) }; };
  const mjdOf = (t) => t / DAY + 40587;
  // UT1-UTC as issued minus C04 at the fit epoch, every cal/val cutoff
  const cutoffs = [...grid(config.sets.calibration.from, config.sets.calibration.to, 3), ...grid(config.sets.validation.from, config.sets.validation.to, 3)];
  const series = cutoffs.map((E) => { const i = bulletinAt(E), m = mjdOf(E), q = i && interp(i.rows, m), c = interp(c04, m); return q && c ? { E: iso(E).slice(0, 10), ageDays: (E - i.issued) / DAY + 1, dUt1Ms: (q.ut1 - c.ut1) * 1000, dXmas: (q.x - c.x) * 1000, dYmas: (q.y - c.y) * 1000 } : null; }).filter(Boolean);
  // the IGS ultra-rapid ERP issued just before a cutoff, on the sample's dates
  const S = await openSession(opened, SPAN);
  const pop = [...config.population.judged.glonass.c2, ...config.population.judged.galileo.new];
  const candidates = [];
  for (const norad of pop) for (const E of cutoffs) candidates.push({ norad, E, h: sha256(Buffer.from(`C3S|p3|${norad}|${iso(E)}`)) });
  candidates.sort((a, b) => (a.h < b.h ? -1 : 1));
  const { openConverter } = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/refstates.mjs'));
  const { MODULES } = await import('./lib/modules.mjs');
  const { parseSinex } = await import('./lib/notices.mjs');
  const sinex = parseSinex(fs.readFileSync(path.join(A, 'hac/igs-metadata/20261009/igs_satellite_metadata.snx'), 'utf8'));
  const SRC = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs'));
  const finalsBase = fs.readFileSync(path.join(A, 'hac/iers-eop/20261009/finals.all.iau2000.txt'), 'latin1').split('\n');
  const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))).classes.R3.parameters;
  const { pC2 } = await import('./lib/model.mjs');
  const fmt = (v, w, d) => v.toFixed(d).padStart(w);
  /** A finals text with the Bulletin's x, y, UT1-UTC in the A columns and only the arc's days. */
  const finalsAsIssued = (issue, loMjd, hiMjd) => finalsBase.filter((l) => { const m = Number(l.slice(7, 15)); return m >= loMjd - 40 && m <= hiMjd + 40; }).map((l) => {
    const m = Math.round(Number(l.slice(7, 15))), q = issue.rows.get(m);
    if (!q || m < loMjd || m > hiMjd) return l;
    return `${l.slice(0, 16)}I${l.slice(17, 18)}${fmt(q.x, 9, 6)}${l.slice(27, 37)}${fmt(q.y, 9, 6)}${l.slice(46, 57)}I${fmt(q.ut1, 10, 7)}${l.slice(68)}`;
  }).join('\n');
  const rows = [], picked = [];
  const seenSat = new Map();
  for (const c of candidates) { if ((seenSat.get(c.norad) ?? 0) >= 1 || picked.length >= 12) continue; picked.push(c); seenSat.set(c.norad, 1); }
  for (const c of picked) {
    const { norad, E } = c, Ems = E, win = windowOf(norad, S.arcsFor(norad), Ems, { leadToleranceSeconds: 150 });
    if (win.excluded) { rows.push({ norad, E: iso(E), excluded: win.excluded }); continue; }
    const issue = bulletinAt(Ems);
    const settings = settingsFor('R3', S.seedOf(norad), false, S.B2C);
    const leads = win.leads.filter((l) => l.line).map((l) => ({ ...l, ref: null }));
    const ctx0 = S.chain.ctxFor(win.tInMs - 24 * HOUR, win.tInMs + 72 * HOUR);
    const editEop = (inputs) => editPort(inputs, 'earth_orientation', 'EARTH_ORIENTATION', (r) => { const q = issue.rows.get(r.MJD); if (q) { r.X_POLE_WANDER_RADIANS = q.x * RAD; r.Y_POLE_WANDER_RADIANS = q.y * RAD; r.UT1_MINUS_UTC_SECONDS = q.ut1; } return r; });
    const run = async (track, inputs) => { const fi = fitInput(track), ctx = { ...ctx0, inputs }; const f = await S.fitV3(ctx, fi.points, fi.reference, settings); return { f, t: await windowTermsRef(ctx, S.pairs, f, win.tInMs, leads, settings) }; };
    const base = await run(win.track, ctx0.inputs);
    const ffmOnly = await run(win.track, editEop(ctx0.inputs));
    // the fit arc's SP3 converted with the Bulletin's rows
    const product = win.product, sp3 = zlib.gunzipSync(opened.read(path.join(A, 'reference-states/products', `${product}.SP3.gz`), 'SP3, cal/val'));
    const mjdLo = Math.floor(mjdOf(win.tInMs)) - 2, mjdHi = Math.ceil(mjdOf(win.tInMs)) + 1;
    const fFile = path.join(store, 'eop', 'tmp', `finals-${issue.name}-${mjdLo}.txt`);
    fs.mkdirSync(path.dirname(fFile), { recursive: true }); fs.writeFileSync(fFile, finalsAsIssued(issue, mjdLo, mjdHi), 'latin1');
    const conv = await openConverter(MODULES, { finalsFile: fFile });
    const svn = sinex.svnOfNorad(norad), prn = sinex.prn.find((x) => x.svn === svn && win.tInMs >= x.from && win.tInMs < x.to)?.prn;
    const id = sinex.identifier.get(svn);
    const got = await conv.convert(sp3, { product: `${product}.SP3.gz`, source: 'as-issued test (P3)', satellites: { [prn]: { norad, objectId: id.cospar, name: `${svn} ${id.block}` } } });
    await conv.destroy();
    if (got.error) { rows.push({ norad, E: iso(E), excluded: got.error }); continue; }
    const dirT = path.join(store, 'eop', 'tmp', product); fs.mkdirSync(dirT, { recursive: true });
    const f1 = path.join(dirT, `${norad}.oem`); fs.writeFileSync(f1, got[0].bytes);
    const asLines = new Map(SRC.readReference(f1).lines.map((l) => [l.epoch, l]));
    const track2 = win.track.map((l) => ({ ...l, ...(asLines.get(l.epoch) ? { r: asLines.get(l.epoch).r, v: asLines.get(l.epoch).v } : {}) }));
    const trackShift = track2.map((l, i) => Math.hypot(...l.r.map((x, k) => (x - win.track[i].r[k]) * 1000)));
    const both = await run(track2, editEop(ctx0.inputs));
    const d = (x) => base.t.leads.map((l, i) => { const P = pC2(FZ, l.terms); return { L: l.L, dR: x.t.leads[i].errRtnM[0] - l.errRtnM[0], dT: x.t.leads[i].errRtnM[1] - l.errRtnM[1], dN: x.t.leads[i].errRtnM[2] - l.errRtnM[2], sigmaT: Math.sqrt(P[2]), errT: l.errRtnM[1] }; });
    rows.push({ norad, E: iso(E), issue: issue.name, ageDays: (Ems - issue.issued) / DAY + 1, dUt1Ms: (interp(issue.rows, mjdOf(win.tInMs)).ut1 - interp(c04, mjdOf(win.tInMs)).ut1) * 1000, trackShiftM: quant(trackShift), ffmOnly: d(ffmOnly), both: d(both) });
    console.error(JSON.stringify({ norad, E: iso(E).slice(0, 10), dUt1Ms: rows.at(-1).dUt1Ms, age: rows.at(-1).ageDays, track: rows.at(-1).trackShiftM.median, both72: rows.at(-1).both.at(-1).dT, ffm72: rows.at(-1).ffmOnly.at(-1).dT }));
  }
  fs.writeFileSync(path.join(part, 'eop.json'), JSON.stringify({ issues: issues.length, series, stats: { dUt1Ms: quant(series.map((x) => Math.abs(x.dUt1Ms))), dXmas: quant(series.map((x) => Math.abs(x.dXmas))), dYmas: quant(series.map((x) => Math.abs(x.dYmas))), ageDays: quant(series.map((x) => x.ageDays)) }, rows }, null, 1));
  process.exit(0);
}

if (args.receipt) {
  const read = (n) => (fs.existsSync(path.join(part, n)) ? JSON.parse(fs.readFileSync(path.join(part, n))) : null);
  console.log(writeReceipt('precheck-P3', { plan: 'section 5 P3; coordinator addition A', archives: read('archives.json'), inert: read('inert.json'), eop: read('eop.json') }, opened));
  process.exit(0);
}
