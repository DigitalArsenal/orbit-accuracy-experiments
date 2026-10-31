// P2, the freeze gate (PLAN.md section 5): both notice archives give dated entries for every month 2025-09 .. 2026-05 (per month: count, types, issue times; later entries sealed),
// and the unlisted rate: windows of C2's four GLONASS (R3 calibration and validation rows) with a C2-screen flag or d2/3 > 30 at any lead (C2's R3 constants, gp-error-model
// pair_statistics) and no notice naming the satellite over [E - 24 h, E + 84 h]. Reads the fetched notices, the IGS SINEX, C2's cal/val rows and GFZ Ap to 2026-05-31 (date filter
// before parsing, for the storm stratum). Statistics and text parsing only.
//   node experiments/ffm-covariance-adaptive/precheck-p2.mjs [--list]      (--list prints the distinct summaries and types; no receipt)
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, registered, Opened, writeReceipt, c2RowsOf, c2Results, sha256, grid, DAY, HOUR, iso } from './common.mjs';
import { parseSinex, loadNotices, gscSvns } from './lib/notices.mjs';
import { openPairs } from './lib/modules.mjs';

registered();
const opened = new Opened();
const SEAL = config.exclusions.notices.sealFrom;
const base = path.join(store, 'notices');
const months = (() => { const out = []; for (let y = 2025, m = 9; y < 2026 || m <= 5;) { out.push(`${y}-${String(m).padStart(2, '0')}`); m += 1; if (m > 12) { m = 1; y += 1; } } return out; })();
const sinex = parseSinex(opened.read('/opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx', 'IGS SINEX').toString());

const N = loadNotices(base, sinex, SEAL, opened);
const { bulletins, iacList, gscRows, details, notices, texts } = N;
const absentIac = fs.existsSync(path.join(base, 'iac-absent.json')) ? JSON.parse(fs.readFileSync(path.join(base, 'iac-absent.json'))) : [];

if (args.list) {
  const stem = (s) => s.replace(/\d\d\.\d\d\.\d\d\/\d{4}/g, 'T').replace(/-?\d+/g, 'N').replace(/\s+/g, ' ').trim();
  const c = new Map(); for (const l of iacList) { const k = `${l.kind} ${stem(l.summary)}`; c.set(k, (c.get(k) ?? 0) + 1); }
  console.log('IAC stems', [...c.entries()].sort((a, b) => b[1] - a[1]));
  const t = new Map(); for (const x of gscRows.filter((r) => r.published.slice(0, 10) >= '2024-09-01')) { const k = `${x.type} | ${details.get(x.number)?.type}`; t.set(k, (t.get(k) ?? 0) + 1); }
  console.log('GSC types', [...t.entries()].sort((a, b) => b[1] - a[1]));
  process.exit(0);
}

// ---- per month
const perMonth = months.map((m) => {
  const days = [...bulletins.keys()].filter((d) => d.startsWith(m));
  const monthDays = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
  const iac = iacList.filter((l) => l.issuedUtc.startsWith(m));
  const gsc = gscRows.filter((x) => x.published.startsWith(m));
  const count = (list, f) => list.reduce((o, x) => { const k = f(x); o[k] = (o[k] ?? 0) + 1; return o; }, {});
  return { month: m,
    iac: { bulletins: days.length, ofDays: monthDays, notices: iac.length, kinds: count(iac, (l) => l.kind), firstIssued: iac[0]?.issuedUtc ?? null, lastIssued: iac.at(-1)?.issuedUtc ?? null },
    gsc: { rows: gsc.length, types: count(gsc, (x) => x.type), withDetail: gsc.filter((x) => details.has(x.number)).length, firstPublished: gsc[0]?.published ?? null, lastPublished: gsc.at(-1)?.published ?? null } };
});
// a year's NAGU numbers run in sequence, so a hole in the walk would show
const seq = {};
for (const x of gscRows) { const y = x.number.slice(0, 4), n = Number(x.number.slice(4)); (seq[y] ??= []).push(n); }
const gaps = Object.fromEntries(Object.entries(seq).filter(([y]) => y >= '2025').map(([y, v]) => { const s = [...new Set(v)].sort((a, b) => a - b), miss = []; for (let i = 1; i < s.length; i += 1) for (let k = s[i - 1] + 1; k < s[i]; k += 1) miss.push(k); return [y, { first: s[0], last: s[s.length - 1], missing: miss }]; }));
const iacFail = perMonth.filter((m) => m.iac.bulletins < 0.9 * m.iac.ofDays).map((m) => m.month);
const gscFail = perMonth.filter((m) => m.gsc.rows === 0).map((m) => m.month);

const overlap = (norad, E, asOf) => N.overlap(norad, E - 24 * HOUR, E + 84 * HOUR, asOf);

// ---- the unlisted rate on C2's GLONASS windows
const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json')));
if (sha256(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))) !== config.c2.constantsSha256) throw new Error('C2 constants differ from the registration');
const R3 = FZ.classes.R3.parameters;
const unit = { RR: [1, 0, 0, 0, 0, 0], TT: [0, 0, 1, 0, 0, 0], NN: [0, 0, 0, 0, 0, 1] };
const termsOf = (p, t) => { const a = [{ weight: p.k_e, covariance: t.A }]; if (p.f_R) a.push({ weight: p.f_R ** 2, covariance: unit.RR }); if (p.f_T) a.push({ weight: p.f_T ** 2, covariance: unit.TT }); if (p.f_N) a.push({ weight: p.f_N ** 2, covariance: unit.NN }); if (p.q_T) a.push({ weight: p.q_T, covariance: t.UT }); if (p.q_RN) { a.push({ weight: p.q_RN, covariance: t.UR }); a.push({ weight: p.q_RN, covariance: t.UN }); } return a; };
const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];
const pairs = await openPairs('pin');
const GLO = new Set(config.population.judged.glonass.c2);
const rows = [...c2RowsOf('R3.calibration.s', opened), ...c2RowsOf('R3.validation.s', opened)].filter((r) => GLO.has(r.norad));
// storm days to 2026-05-31 only: the date is read before the line is parsed
const storm = new Set();
for (const line of opened.read('/opt/data/sdn-archive/hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt', 'GFZ Ap, lines to 2026-05-31').toString().split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const date = `${line.slice(0, 4)}-${line.slice(5, 7)}-${line.slice(8, 10)}`;
  if (date < '2025-06-01' || date > '2026-05-31') continue;
  const t = line.trim().split(/\s+/);
  if (Number(t[23]) >= 30) storm.add(date);
}
const windows = [];
for (const r of rows) {
  if (r.excluded || !r.fit?.ok || !r.leads?.length) continue;
  const st = await pairs.stats(r.leads.map((l) => ({ predicted: { position: P0, velocity: V0, covarianceTerms: termsOf(R3, l.terms), covarianceAxes: 'RTN' }, truth: { position: P0.map((x, k) => x - l.errRtnM[k]), velocity: V0 } })), 'predicted');
  const d2 = st.map((x) => x.d2Combined ?? x.d2Predicted), E = Date.parse(r.E);
  const flag = Boolean(r.screen?.flagged), large = d2.some((v) => v / 3 > 30);
  const stormDays = new Set(); for (let t = E - DAY; t < E + 3 * DAY; t += DAY) stormDays.add(iso(t).slice(0, 10));
  const inStorm = [...stormDays].some((d) => storm.has(d));
  const hits = overlap(r.norad, E, Date.parse(`${SEAL}T00:00:00Z`));
  windows.push({ norad: r.norad, E: r.E, flag, large, maxD2over3: Math.max(...d2) / 3, inStorm, listed: hits.length > 0, notices: hits.map((n) => `${n.source} ${n.id}`), screenFailed: Boolean(r.screen?.failed) });
}
const flagged = windows.filter((w) => w.flag || w.large), unlisted = flagged.filter((w) => !w.listed);
const clopper = (x, n) => { // 95 % one-sided upper bound
  if (n === 0) return 1;
  if (x === 0) return 1 - 0.05 ** (1 / n);
  let lo = x / n, hi = 1; const cdf = (p) => { let s = 0, t = (1 - p) ** n; for (let k = 0; k <= x; k += 1) { s += t; t *= ((n - k) / (k + 1)) * (p / (1 - p)); } return s; };
  for (let i = 0; i < 80; i += 1) { const m = (lo + hi) / 2; if (cdf(m) > 0.05) lo = m; else hi = m; }
  return hi;
};
// the notice keep on the registered GNSS population over the cal/val grid: windows a notice issued before the seal does not touch
const P = config.population.judged;
const keepOf = (list) => { let total = 0, kept = 0; const per = {}; for (const norad of list) { let a = 0, b = 0; for (const set of ['calibration', 'validation']) for (const E of grid(config.sets[set].from, config.sets[set].to, 3)) { a += 1; if (!overlap(norad, E, Date.parse(`${SEAL}T00:00:00Z`)).length) b += 1; } per[norad] = b / a; total += a; kept += b; } return { windows: total, keep: kept / total, lowest: Object.entries(per).sort((x, y) => x[1] - y[1]).slice(0, 5) }; };
const noticeKeep = { glonass: keepOf([...P.glonass.c2, ...P.glonass.new]), galileo: keepOf([...P.galileo.new, ...P.galileo.c2Six]) };
const noStorm = windows.filter((w) => !w.inStorm), flaggedNoStorm = noStorm.filter((w) => w.flag || w.large), unlistedNoStorm = flaggedNoStorm.filter((w) => !w.listed);
const mapped = { IAC: notices.filter((n) => n.source === 'IAC'), GSC: notices.filter((n) => n.source === 'GSC') };
// IAC numbers its NAGU in sequence within a year: a hole in the span would be a notice no bulletin carried
const iacNumbers = {};
for (const l of iacList) (iacNumbers[`20${l.id.slice(4, 6)}`] ??= []).push(Number(l.id.slice(0, 3)));
const iacNumbering = Object.fromEntries(Object.entries(iacNumbers).map(([y, v]) => { const u = [...new Set(v)].sort((a, c) => a - c), holes = []; for (let i = 1; i < u.length; i += 1) for (let k = u[i - 1] + 1; k < u[i]; k += 1) holes.push(k); return [y, { first: u[0], last: u[u.length - 1], holes }]; }));
const iacHoles = Object.values(iacNumbering).flatMap((x) => x.holes);
const issuedBeforeSpan = iacList.filter((l) => l.issuedUtc.slice(0, 7) < months[0]);
const issuedInSpan = iacList.filter((l) => l.issuedUtc.slice(0, 7) >= months[0]);
// the IAC notices that map to no satellite: the spacecraft each names, through the bulletins' status tables, and whether it is one of the 14
const P14 = new Set([...config.population.judged.glonass.c2, ...config.population.judged.glonass.new]);
const statusOf = (sc) => { for (const b of bulletins.values()) { const r = b.status.find((x) => x.sc === sc); if (r) return r; } return null; };
const cosmos14 = new Set([...sinex.svnOfCosmos.entries()].filter(([, svn]) => P14.has(sinex.noradOfSvn(svn))).map(([c]) => c));
const iacUnmappedDetail = mapped.IAC.filter((n) => !n.norad).map((n) => { const sc = (/\((\d{3})\)/.exec(texts.get(n.id) ?? '') ?? [])[1] ?? null, st = sc ? statusOf(sc) : null; return { id: n.id, summary: n.summary, spacecraft: sc, cosmos: st?.cosmos ?? null, launch: st?.launch ?? null, slot: st ? `${st.plane}/${st.slot}` : null, oneOfThe14: st ? cosmos14.has(st.cosmos) : null, why: st && !sinex.svnOfCosmos.has(st.cosmos) ? `Cosmos ${st.cosmos} has no entry in the IGS SINEX of 2026-10-09` : null }; });
// GSC rows inside the span that map to no satellite, and any population satellite among their names
const popAll = new Set([...P14, ...config.population.judged.galileo.new, ...config.population.judged.galileo.c2Six, ...config.population.reported.alsoReported.galileoEccentric]);
const gscSpan = gscRows.filter((x) => x.published.slice(0, 7) >= months[0]);
const gscUnmappedInSpan = gscSpan.flatMap((x) => { const v = gscSvns(x.satellite); return (v.length ? v.filter((q) => !sinex.noradOfSvn(q)) : [null]).map((q) => ({ number: x.number, named: x.satellite, svn: q, type: x.type })); });
const gscNamesPopulation = gscUnmappedInSpan.filter((u) => gscSvns(u.named).some((q) => popAll.has(sinex.noradOfSvn(q))));
const pop = new Set([...config.population.judged.glonass.c2, ...config.population.judged.glonass.new, ...config.population.judged.galileo.new, ...config.population.judged.galileo.c2Six]);
const receipt = {
  plan: 'section 5 P2', seal: SEAL, months, perMonth,
  archives: { IAC: { bulletins: bulletins.size, absentDays: absentIac, noticesSeen: iacList.length, issuedInSpan: issuedInSpan.length, issuedBeforeSpanAndRepeated: issuedBeforeSpan.map((l) => `${l.id} ${l.issuedUtc.slice(0, 16)}`), numbering: iacNumbering, withFullText: iacList.filter((l) => texts.has(l.id)).length, failedMonths: iacFail },
    GSC: { rows: gscRows.length, rowsFrom: gscRows[0]?.published, numbering: gaps, detailPages: details.size, failedMonths: gscFail } },
  mapping: { iacMapped: mapped.IAC.filter((n) => n.norad).length, iacTotal: mapped.IAC.length, iacUnmapped: iacUnmappedDetail, gscMapped: mapped.GSC.filter((n) => n.norad).length, gscTotal: mapped.GSC.length,
    gscSpan: { rows: gscSpan.length, unmapped: gscUnmappedInSpan.length, unmappedNames: [...new Set(gscUnmappedInSpan.map((u) => u.named))], unmappedRows: gscUnmappedInSpan, namingAPopulationSatellite: gscNamesPopulation.length },
    inPopulationInSpan: notices.filter((n) => pop.has(n.norad) && n.issued >= Date.parse('2025-09-01T00:00:00Z')).length },
  unlisted: { rule: 'C2-screen flag or d2/3 > 30 at any lead, C2 R3 constants, on the four GLONASS of C2 (cal/val); no notice over [E - 24 h, E + 84 h] issued before the seal', windows: windows.length, flagged: flagged.length, unlisted: unlisted.length, upper95: clopper(unlisted.length, windows.length), perWindow: unlisted.length / windows.length,
    nonStorm: { windows: noStorm.length, flagged: flaggedNoStorm.length, unlisted: unlistedNoStorm.length, upper95: clopper(unlistedNoStorm.length, noStorm.length) },
    flaggedWindows: flagged.map((w) => ({ norad: w.norad, E: w.E, flag: w.flag, maxD2over3: w.maxD2over3, inStorm: w.inStorm, listed: w.listed, notices: w.notices })) },
  noticeKeep, stormDaysInSpan: [...storm].filter((d) => d >= '2025-10-02').length,
  crossCheck: { iacStatusMessages: JSON.parse(opened.read(path.join(base, 'iac-news.json'), 'IAC status messages')).length },
  outcome: iacFail.length || gscFail.length || iacHoles.length || gscNamesPopulation.length || iacUnmappedDetail.some((u) => u.oneOfThe14 !== false) ? `FAIL: months ${[...iacFail, ...gscFail].join(', ')}; IAC holes ${iacHoles.join(', ')}; unmapped population ${gscNamesPopulation.length}` : 'pass: both archives give dated entries for every month',
};
console.log(writeReceipt('precheck-P2', receipt, opened));
console.log(JSON.stringify({ outcome: receipt.outcome, unlisted: receipt.unlisted, archives: receipt.archives, mapping: receipt.mapping, noticeKeep }));
process.exit(0);
