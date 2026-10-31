// P11 (PLAN.md section 5; QS10): what happened on 2026-01-19? C2's largest R3 outliers (GLONASS R743 and Etalon-1, plane 1) fall on a storm day, and the storm rule removes them from the primary cells, so this asks whether the truth was
// at fault. Reads C2's calibration rows around the date (d2/3 with C2's frozen R3 constants, gp-error-model pair_statistics), the notices, the ILRS combination of week 260124 against each analysis center per day (positions in the SP3's own
// frame, arithmetic differences), the Earth orientation (finals' Bulletin A columns against C04, day by day), and ESA against GFZ for R743 and plane 1's other satellites (GCRF states, the same C04). No FFM.
//   node experiments/ffm-covariance-adaptive/precheck-p11.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, store, registered, Opened, writeReceipt, c2RowsOf, c2Results, root, HOUR, DAY, iso } from './common.mjs';
import { parseSinex, loadNotices } from './lib/notices.mjs';
import { pC2 } from './lib/model.mjs';
import { openPairs } from './lib/modules.mjs';

registered();
const opened = new Opened();
const A = '/opt/data/sdn-archive', PRODUCTS = path.join(A, 'reference-states/products');
const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))).classes.R3.parameters;
const SRC = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs'));
const pairs = await openPairs('pin');
const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];
// C2's rows, every R3 object of plane 1 and the spheres, cutoffs 01-13 to 01-25
const rows = c2RowsOf('R3.calibration.s', opened).filter((r) => r.E >= '2026-01-13' && r.E <= '2026-01-25' && r.leads?.length);
const windows = [];
for (const r of rows) {
  const st = await pairs.stats(r.leads.map((l) => ({ predicted: { position: P0, velocity: V0, covarianceTerms: [{ weight: 1, covariance: pC2(FZ, l.terms) }], covarianceAxes: 'RTN' }, truth: { position: P0.map((x, k) => x - l.errRtnM[k]), velocity: V0 } })), 'predicted');
  windows.push({ norad: r.norad, name: r.name, E: r.E.slice(0, 10), screen: r.screen?.rms3dM ?? null, flagged: Boolean(r.screen?.flagged), d2over3: Object.fromEntries(r.leads.map((l, i) => [l.L, (st[i].d2Combined ?? st[i].d2Predicted) / 3])), alongTrack72: r.leads.at(-1).errRtnM[1] });
}
windows.sort((a, b) => (a.E < b.E ? -1 : a.E > b.E ? 1 : a.norad - b.norad));
// notices naming them, issued before the seal
const sinex = parseSinex(opened.read(path.join(A, 'hac/igs-metadata/20261009/igs_satellite_metadata.snx'), 'IGS SINEX').toString());
const N = loadNotices(path.join(store, 'notices'), sinex, config.exclusions.notices.sealFrom, opened);
const span = [Date.parse('2026-01-10T00:00:00Z'), Date.parse('2026-01-28T00:00:00Z')];
const noticeList = N.notices.filter((n) => n.norad && n.from >= span[0] - 40 * DAY && n.from <= span[1] && ([...new Set(windows.map((w) => w.norad))].includes(n.norad))).map((n) => ({ source: n.source, id: n.id, norad: n.norad, svn: n.svn, summary: n.summary, from: iso(n.from), to: n.to ? iso(n.to) : null, issued: iso(n.issued) }));
// the combination against the centers, per day of the week ending 260124
const positions = (file) => { const rows2 = new Map(); let epoch = null; for (const l of zlib.gunzipSync(opened.read(file, 'SP3, cal/val')).toString('latin1').split('\n')) { if (l.startsWith('* ')) epoch = l.slice(3, 22).trim(); else if (l.startsWith('P') && epoch) { const r = [l.slice(4, 18), l.slice(18, 32), l.slice(32, 46)].map(Number); if (r.some((x) => x !== 0)) rows2.set(epoch, r); } } return rows2; };
const centersOf = (sat, week) => {
  const comb = fs.readdirSync(PRODUCTS).find((f) => f.startsWith(`ilrsa.orb.${sat}.${week}.`) && f.endsWith('.gz'));
  if (!comb) return { missing: true };
  const c = positions(path.join(PRODUCTS, comb)), out = {};
  for (const f of fs.readdirSync(PRODUCTS).filter((x) => new RegExp(`^[a-z]+\\.orb\\.${sat}\\.${week}\\.`).test(x) && !x.startsWith('ilrsa') && x.endsWith('.gz'))) {
    const p = positions(path.join(PRODUCTS, f)), byDay = {};
    for (const [e, r] of p) { const q = c.get(e); if (!q) continue; const d = e.slice(0, 10).replaceAll(' ', '0'); (byDay[d] ??= []).push(Math.hypot(...r.map((x, k) => (x - q[k]) * 1000))); }
    out[f.split('.')[0]] = Object.fromEntries(Object.entries(byDay).map(([d, v]) => [d, Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length)]));
  }
  return out;
};
const centers = { etalon1: centersOf('etalon1', '260124'), etalon2: centersOf('etalon2', '260124'), lageos2: centersOf('lageos2', '260124'), etalon1Before: centersOf('etalon1', '260117') };
// Earth orientation: finals' A columns against C04, 01-13 .. 01-25
const c04 = new Map();
for (const l of opened.read(path.join(PRODUCTS, 'eopc04.1962-now'), 'C04').toString().split('\n')) { if (!l || l.startsWith('#')) continue; const t = l.trim().split(/\s+/); c04.set(Math.round(Number(t[4])), { x: Number(t[5]), y: Number(t[6]), ut1: Number(t[7]) }); }
const eop = [];
for (const l of opened.read(path.join(A, 'hac/iers-eop/20261009/finals.all.iau2000.txt'), 'finals').toString('latin1').split('\n')) { if (l.length < 68) continue; const m = Math.round(Number(l.slice(7, 15))); if (m < 61053 || m > 61065) continue; const c = c04.get(m); eop.push({ date: iso((m - 40587) * DAY).slice(0, 10), ut1Ms: (Number(l.slice(58, 68)) - c.ut1) * 1000, xMas: (Number(l.slice(18, 27)) - c.x) * 1000, yMas: (Number(l.slice(37, 46)) - c.y) * 1000, c04Ut1: c.ut1 }); }
// ESA against GFZ per day for plane 1's four and two others, the states as C2's chain reads them
const REF = path.join(A, 'reference-states/reference'), GFZ = config.p1b.gfz.root;
const esaGfz = {};
for (const norad of [37869, 44850, 40001, 54377]) {
  const per = {};
  for (let doy = 13; doy <= 25; doy += 1) {
    const d = String(doy).padStart(3, '0'), a = path.join(REF, `ESA0OPSFIN_2026${d}0000_01D_05M_ORB`, `${norad}.oem`), b = path.join(GFZ, `GFZ0MGXRAP_2026${d}0000_01D_05M_ORB`, `${norad}.oem`);
    if (!fs.existsSync(a) || !fs.existsSync(b)) { per[iso(Date.UTC(2026, 0, doy)).slice(0, 10)] = null; continue; }
    opened.add(a, 'reference $OEM'); opened.add(b, 'GFZ0MGXRAP');
    const la = new Map(SRC.readReference(a).lines.map((l) => [l.epoch, l])), v = [];
    for (const l of SRC.readReference(b).lines) { const q = la.get(l.epoch); if (q) v.push(Math.hypot(...l.r.map((x, k) => (x - q.r[k]) * 1000))); }
    per[iso(Date.UTC(2026, 0, doy)).slice(0, 10)] = v.length ? { rmsM: Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length), maxM: Math.max(...v), n: v.length } : null;
  }
  esaGfz[norad] = per;
}
const stormy = [...new Set(windows.filter((w) => Math.max(...Object.values(w.d2over3)) > 30).map((w) => `${w.name} ${w.E}`))];
console.log(writeReceipt('precheck-P11', { plan: 'section 5 P11', largeWindows: stormy, windows, notices: noticeList, centers, eop, esaGfz }, opened));
console.log(JSON.stringify({ stormy, notices: noticeList.filter((n) => n.norad === 37869 || n.norad === 19751), eop: eop.map((x) => [x.date, +x.ut1Ms.toFixed(3), +x.xMas.toFixed(3), +x.yMas.toFixed(3)]) }));
for (const w of windows.filter((x) => [37869, 19751, 20026, 44850].includes(x.norad))) console.log(w.name, w.E, 'screen', w.screen?.toFixed(2), Object.values(w.d2over3).map((x) => x.toFixed(1)).join(' '), 'T72', w.alongTrack72.toFixed(1));
for (const [s, c] of Object.entries(centers)) { console.log(s); for (const [ac, days] of Object.entries(c)) console.log('  ', ac, Object.entries(days).map(([d, v]) => `${d.slice(5)}:${typeof v === 'number' ? v.toFixed(3) : v}`).join(' ')); }
for (const [n, per] of Object.entries(esaGfz)) console.log(n, Object.entries(per).map(([d, v]) => `${d.slice(5)}:${v ? v.rmsM.toFixed(3) : '-'}`).join(' '));
process.exit(0);
