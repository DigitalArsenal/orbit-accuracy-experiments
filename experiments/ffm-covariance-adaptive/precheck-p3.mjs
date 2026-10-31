// P3 (PLAN.md section 5; C3-A1): the inputs fresh windows need. Names and status only for fresh-period weather and truth files, never their values.
//   --archives   RSGA, GFZ Ap and Earth-orientation archives: names, last days, statuses.
//   --measured   Earth orientation: each archived file's flags, the last day it flags measured, and the first file flagged measured through E + 84 h for every later window that can be named today.
//   --table      Report only, no FFM run: UT1 as issued minus measured, median and p95 per lead, from Bulletin A (dated weekly, on cal/val cutoffs, against C04) and finals.daily (daily since 2026-10-10, against
//                the newest archived file's measured rows); in meters at each R3 class's radius, beside C2's along-track sigma per lead (P1).
//   --inert      R3's weather rows are inert: four R3 windows refitted with Ap and F10.7 doubled must be bit-identical (fit state, covariance, errors, terms). FFM: RK78, relative tolerance 1e-10, steps up to 120 s; fit
//                track 600 s; outputs at the six leads and the 600 s noise grid.
//   --receipt    results/ffm-covariance-adaptive/precheck-P3.json from the parts.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, store, args, registered, Opened, writeReceipt, root, grid, DAY, HOUR, iso } from './common.mjs';

registered();
const opened = new Opened();
const A = '/opt/data/sdn-archive';
const part = path.join(store, 'p3');
fs.mkdirSync(part, { recursive: true });
const UA = 'orbit-accuracy-experiments (research; paced)';

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
/** One Bulletin A: { issued (ms, the end of its date), rows: Map mjd -> { ut1 } (s) }. */
function parseBulletin(text) {
  const head = /(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})\s+Vol\.\s+[XLVIC]+\s+No\.\s+(\d+)/.exec(text);
  if (!head) return null;
  const issued = Date.UTC(Number(head[3]), MONTH[head[2]] - 1, Number(head[1]) + 1);
  const rows = new Map(), cut = text.indexOf('CELESTIAL POLE OFFSET');
  for (const m of text.slice(0, cut < 0 ? undefined : cut).matchAll(/^\s+(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{5})\s+(-?\d*\.\d+)\s+(?:\.\d+\s+)?(-?\d*\.\d+)\s+(?:\.\d+\s+)?(-?\d*\.\d+)/gm)) rows.set(Number(m[4]), { ut1: Number(m[7]) });
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
/** A finals2000A text: Map mjd -> { ut1 (A column), measured (pole and UT1 flagged I) }, and the last MJD flagged measured with every earlier row too. */
function parseFinals(text) {
  const rows = new Map();
  let lastMeasured = null, broken = false;
  for (const l of text.split('\n')) {
    if (l.length < 68) continue;
    const mjd = Math.round(Number(l.slice(7, 15))), pole = l[16], ut = l[57], u = Number(l.slice(58, 68));
    if (!Number.isFinite(mjd) || !Number.isFinite(u) || l.slice(58, 68).trim() === '') continue;
    const measured = pole === 'I' && ut === 'I';
    rows.set(mjd, { ut1: u, measured, pole, ut });
    if (measured && !broken) lastMeasured = mjd; else if (!measured) broken = true;
  }
  return { rows, lastMeasured };
}
const mjdOf = (t) => t / DAY + 40587;
const interp = (rows, mjd) => { const a = rows.get(Math.floor(mjd)), b = rows.get(Math.floor(mjd) + 1); if (!a || !b) return null; const f = mjd - Math.floor(mjd); return a.ut1 + f * (b.ut1 - a.ut1); };
const eopRoot = path.join(A, 'hac/iers-eop');
/** The archived files in date order: the file of 2026-10-09 (B1's), then the daily ones; a day's finals.all and finals.daily both count. */
function archived() {
  const out = [{ day: '2026-10-09', name: 'finals.all.iau2000.txt', file: path.join(eopRoot, '20261009/finals.all.iau2000.txt') }];
  for (const d of fs.readdirSync(path.join(eopRoot, '2026')).sort()) for (const name of ['finals.daily.iau2000.txt', 'finals.all.iau2000.txt']) { const f = path.join(eopRoot, '2026', d, name); if (fs.existsSync(f)) out.push({ day: d, name, file: f }); }
  return out;
}

if (args.measured) {
  const files = archived().map((f) => { const p = parseFinals(opened.read(f.file, 'finals').toString('latin1')); const flags = [...p.rows.values()]; return { ...f, file: undefined, rows: p.rows.size, lastMeasuredMjd: p.lastMeasured, lastMeasuredDate: p.lastMeasured ? iso((p.lastMeasured - 40587) * DAY).slice(0, 10) : null, predictedRows: flags.filter((x) => x.pole === 'P' || x.ut === 'P').length, mixed: flags.filter((x) => x.pole !== x.ut).length }; });
  const firstFor = (E) => { const need = Math.ceil(mjdOf(E + 84 * HOUR)); return files.find((f) => f.lastMeasuredMjd !== null && f.lastMeasuredMjd >= need) ?? null; };
  // history-only windows from 06-03 and every fresh cutoff that the archive can name today
  const windows = [];
  for (const E of grid('2026-06-03', '2026-11-30', 3)) { const f = firstFor(E); windows.push({ E: iso(E).slice(0, 10), throughMjd: Math.ceil(mjdOf(E + 84 * HOUR)), file: f ? `${f.day}/${f.name}` : null, waits: !f }); }
  const out = { rule: config.earthOrientation.later, flags: 'finals2000A columns 17 (pole) and 58 (UT1): I measured, P predicted; a parser reads Bulletin A columns only', files, windows, flagsCanShow: files.every((f) => f.lastMeasuredMjd !== null) };
  fs.writeFileSync(path.join(part, 'measured.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ flagsCanShow: out.flagsCanShow, files: files.map((f) => [f.day, f.name.slice(7, 12), f.lastMeasuredDate, f.predictedRows, f.mixed]), windows: windows.filter((w, i) => i % 6 === 0 || w.waits).map((w) => [w.E, w.file, w.waits]) }));
  process.exit(0);
}

if (args.table) {
  const LEADS = config.leads_h;
  // Bulletin A at or before each cal/val cutoff, against C04
  const issues = [];
  for (const [vol, a, b] of [['xxxviii', 32, 53], ['xxxix', 1, 24]]) for (let n = a; n <= b; n += 1) {
    const name = `bulletina-${vol}-${String(n).padStart(3, '0')}.txt`;
    const bytes = await get(`https://datacenter.iers.org/data/6/${name}`, path.join(store, 'eop/bulletina', name));
    if (!bytes) continue;
    const p = parseBulletin(bytes.toString('utf8'));
    if (p) issues.push({ ...p, name });
  }
  issues.sort((x, y) => x.issued - y.issued);
  const c04 = new Map();
  for (const l of opened.read(path.join(A, 'reference-states/products/eopc04.1962-now'), 'C04').toString().split('\n')) { if (!l || l.startsWith('#')) continue; const t = l.trim().split(/\s+/); c04.set(Math.round(Number(t[4])), { ut1: Number(t[7]) }); }
  const cutoffs = [...grid(config.sets.calibration.from, config.sets.calibration.to, 3), ...grid(config.sets.validation.from, config.sets.validation.to, 3)];
  const bulletin = Object.fromEntries(LEADS.map((L) => [L, []]));
  for (const E of cutoffs) { let i = null; for (const q of issues) if (q.issued <= E) i = q; if (!i) continue; for (const L of LEADS) { const m = mjdOf(E + L * HOUR), a = interp(i.rows, m), c = interp(c04, m); if (a !== null && c !== null) bulletin[L].push(Math.abs(a - c) * 1000); } }
  // finals.daily issued on day D (taken at noon UTC of D, the archive's fetch hour), against the newest file's measured rows
  const files = archived().filter((f) => f.name === 'finals.daily.iau2000.txt');
  const newest = parseFinals(opened.read(files.at(-1).file, 'finals').toString('latin1'));
  const daily = Object.fromEntries(LEADS.map((L) => [L, []]));
  for (const f of files) {
    const p = parseFinals(opened.read(f.file, 'finals').toString('latin1')), E = Date.parse(`${f.day}T12:00:00Z`);
    for (const L of LEADS) { const m = mjdOf(E + L * HOUR); if (Math.ceil(m) > newest.lastMeasured) continue; const a = interp(p.rows, m), c = interp(newest.rows, m); if (a !== null && c !== null) daily[L].push(Math.abs(a - c) * 1000); }
  }
  const stat = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? { n: s.length, medianMs: s[Math.floor(s.length / 2)], p95Ms: s[Math.floor(s.length * 0.95)] } : null; };
  // meters: Earth rotation times radius, the class's median radius in cal/val; C2's along-track sigma per lead from P1
  const P1 = JSON.parse(fs.readFileSync(path.join(root, 'results/ffm-covariance-adaptive/precheck-P1.json')));
  const { arcsOf, arcLines } = await import('./lib/chain.mjs');
  const OMEGA = 7.292115e-5;
  const radiusOf = (norad) => { const arcs = arcsOf(norad, { fromMs: Date.parse('2026-01-01T00:00:00Z'), toMs: Date.parse('2026-01-12T00:00:00Z'), allowedToMs: Date.parse('2026-06-15T00:00:00Z'), opened }); return Math.hypot(...arcLines(arcs[0])[0].r) * 1000; };
  const classes = { 'LAGEOS-2': 22195, 'LARES-2': 53105, Etalon: 19751, GLONASS: 40001, Galileo: 41859 };
  const table = {};
  for (const [name, norad] of Object.entries(classes)) {
    const r = radiusOf(norad);
    table[name] = { radiusKm: r / 1000, leads: Object.fromEntries(LEADS.map((L) => { const b = stat(bulletin[L]), d = stat(daily[L]), s = P1.sigmaPerLead?.[name]?.[L]?.[1] ?? null, m = (x) => (x === null || x === undefined ? null : OMEGA * r * x / 1000); return [L, { bulletinMedianM: m(b?.medianMs), bulletinP95M: m(b?.p95Ms), dailyMedianM: m(d?.medianMs), dailyP95M: m(d?.p95Ms), c2AlongTrackSigmaM: s, bulletinP95OverSigma: s && b ? m(b.p95Ms) / s : null, dailyP95OverSigma: s && d ? m(d.p95Ms) / s : null }]; })) };
  }
  const out = { reportOnly: true, noFfmRun: true, sources: { bulletin: `IERS Bulletin A at or before each of ${cutoffs.length} cal/val cutoffs, ${issues.length} issues, against C04`, daily: `finals.daily of ${files.length} days from ${files[0].day} to ${files.at(-1).day}, taken at noon UTC, against ${files.at(-1).day}'s measured rows (through MJD ${newest.lastMeasured})` }, convert: 'meters = 7.292115e-5 rad/s x class radius x |UT1 difference|: the displacement of a point at that radius on the equator; the along-track part is at most this', ut1Ms: { bulletin: Object.fromEntries(LEADS.map((L) => [L, stat(bulletin[L])])), daily: Object.fromEntries(LEADS.map((L) => [L, stat(daily[L])])) }, table };
  fs.writeFileSync(path.join(part, 'table.json'), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out));
  process.exit(0);
}

if (args.receipt) {
  const read = (n) => (fs.existsSync(path.join(part, n)) ? JSON.parse(fs.readFileSync(path.join(part, n))) : null);
  console.log(writeReceipt('precheck-P3', { plan: 'section 5 P3; C3-A1', archives: read('archives.json'), measured: read('measured.json'), inert: read('inert.json'), eopTable: read('table.json') }, opened));
  process.exit(0);
}
