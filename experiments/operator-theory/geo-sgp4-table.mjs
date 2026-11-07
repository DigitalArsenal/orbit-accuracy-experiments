// GEO-SGP4.md: the tables from the stored rows and geo-sgp4-run.mjs's rows. Statistics only; no physics.
//   node experiments/operator-theory/geo-sgp4-table.mjs --out results/operator-theory/geo-sgp4-one-mode --compare results/ap-truth/compare
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rand, pct, asc, median, round } from './lib/compare.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out'), COMPARE = argOf('--compare');
if (!OUT || !COMPARE) throw new Error('--out and --compare');
const here = path.dirname(new URL(import.meta.url).pathname), repo = path.resolve(here, '../..');
export const REGISTRATION = '25a997bc0dc7f424d367e138b04b7294dc57a77b', AMENDMENT1 = 'b67b1bf6fd41567c458522732c5d7cd36062e2a2';
const AP = '/opt/data/sdn-archive/operator-theory/ap', B = path.join(AP, 'b0411'), NEW = path.join(AP, 'geo-sgp4-one-mode');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const filesIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows(-\d+)?\.jsonl$/.test(f)).sort().map((f) => path.join(dir, f));
const rowsIn = (dir) => filesIn(dir).flatMap(jsonl);
const byKey = (dir) => new Map(rowsIn(dir).map((r) => [r.key, r]));
const LEADS = ['1', '2', '3', '7'], DRAWS = 10000, LOW = 0.025, HIGH = 0.975;
const e = (r, arm, k) => r?.arms?.[arm]?.days?.[k]?.e;
const figures = (values) => { const v = values.filter(Number.isFinite).sort(asc); return v.length ? { n: v.length, median: pct(v, 0.5), p95: pct(v, 0.95) } : { n: 0, median: null, p95: null }; };

// The stored rows this reads, with each file's SHA-256: the E2E checks that none has moved.
const STORED = { regimes: path.join(B, 'regimes'), ussfRegimes: path.join(B, 'ussf-regimes'), wa: path.join(B, 'regimes-wa'), ussfWa: path.join(B, 'ussf-regimes-wa'), files: path.join(B, 'geo-files') };
const storedHashes = Object.fromEntries(Object.entries(STORED).flatMap(([, d]) => filesIn(d).map((f) => [f, sha(fs.readFileSync(f))])));
const regimes = byKey(STORED.regimes), uRegimes = byKey(STORED.ussfRegimes), wa = byKey(STORED.wa), uWa = byKey(STORED.ussfWa), gf = byKey(STORED.files);
const a = byKey(path.join(NEW, 'a')), n = byKey(path.join(NEW, 'n')), b = byKey(path.join(NEW, 'b'));
const ranAt = [...a.values(), ...n.values(), ...b.values()].map((r) => r.ranAt).sort();
const c9 = byKey(path.join(NEW, 'c')), ec = byKey(path.join(NEW, 'e')), rf = byKey(path.join(NEW, 'r'));
const ranAt1 = [...c9.values(), ...ec.values(), ...rf.values()].map((r) => r.ranAt).sort();

/** The paired ratio exp(median ln(x / y)) by window, with a satellite-cluster bootstrap interval. */
function ratio(tag, pairs) {
  const q = pairs.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0).map((p) => ({ d: Math.log(p.x / p.y), s: p.s }));
  if (!q.length) return { n: 0 };
  const sats = [...new Set(q.map((p) => p.s))], by = new Map(sats.map((s) => [s, q.filter((p) => p.s === s).map((p) => p.d)]));
  const random = rand(parseInt(sha(`GEO-SGP4|${tag}`).slice(0, 8), 16)), meds = [];
  for (let t = 0; t < DRAWS; t += 1) { const draw = []; for (let i = 0; i < sats.length; i += 1) draw.push(...by.get(sats[Math.floor(random() * sats.length)])); meds.push(median(draw)); }
  meds.sort(asc);
  return { n: q.length, satellites: sats.length, ratio: Math.exp(median(q.map((p) => p.d))), interval: [Math.exp(pct(meds, LOW)), Math.exp(pct(meds, HIGH))] };
}
/** One group's arm (a): stored S beside S1, the shift, the node condition, the moved windows, the ratios against both XP builds. */
function armA(label, list, { s, s1, xp, u, node }) {
  const out = { group: label, windows: list.length, satellites: new Set(list.map((w) => w.name)).size, failed: { S: list.filter((w) => !w.arms[s]?.ok).length, S1: list.filter((w) => !w.arms[s1]?.ok).length, XP: list.filter((w) => !w.arms[xp]?.ok).length, XPU: list.filter((w) => !w.arms[u]?.ok).length }, leads: {}, ratios: {} };
  const cond = list.map((w) => w.node).filter(Boolean);
  out.node = { counted: cond.length, crosses: cond.filter((c) => c.crosses).length, down: cond.filter((c) => c.down > 0).length, up: cond.filter((c) => c.up > 0).length, near: cond.filter((c) => c.near).length, neither: cond.filter((c) => !c.holds).length, holds: cond.filter((c) => c.holds).length, incMedianDeg: median(cond.map((c) => c.incMedianDeg)), belowLyddane: cond.filter((c) => c.incMaxDeg < 11.4592).length };
  const moved = list.filter((w) => LEADS.some((k) => Number.isFinite(w.arms[s]?.days?.[k]?.e) && Number.isFinite(w.arms[s1]?.days?.[k]?.e) && Math.abs(w.arms[s1].days[k].e - w.arms[s].days[k].e) > 0.001));
  out.moved = { withCondition: moved.filter((w) => w.node?.holds).length, withoutCondition: moved.filter((w) => !w.node?.holds).length, keysWithout: moved.filter((w) => !w.node?.holds).map((w) => w.key), detail: moved.map((w) => ({ key: w.key, holds: !!w.node?.holds, truthNodeNearestDeg: w.node?.nearestDeg, s1InclinationDeg: w.arms[s1].el?.elements?.INCLINATION, s1NodeDeg: w.arms[s1].el?.elements?.RA_OF_ASC_NODE, largestShiftKm: Math.max(...LEADS.map((k) => Math.abs((w.arms[s1].days[k]?.e ?? 0) - (w.arms[s].days[k]?.e ?? 0)))) })) };
  for (const k of LEADS) {
    const both = list.filter((w) => Number.isFinite(w.arms[s]?.days?.[k]?.e) && Number.isFinite(w.arms[s1]?.days?.[k]?.e));
    const S = figures(both.map((w) => w.arms[s].days[k].e)), S1 = figures(both.map((w) => w.arms[s1].days[k].e));
    out.leads[k] = { paired: both.length, satellites: new Set(both.map((w) => w.name)).size, S, S1, medianShift: S.n ? S1.median - S.median : null, p95Shift: S.n ? S1.p95 - S.p95 : null, windowShiftMedian: both.length ? median(both.map((w) => w.arms[s1].days[k].e - w.arms[s].days[k].e)) : null };
    const all4 = list.filter((w) => [s, s1, xp, u].every((x) => Number.isFinite(w.arms[x]?.days?.[k]?.e)));
    const p = (x, y) => all4.map((w) => ({ x: w.arms[x].days[k].e, y: w.arms[y].days[k].e, s: w.name }));
    out.ratios[k] = { paired: all4.length, satellites: new Set(all4.map((w) => w.name)).size, XP: figures(all4.map((w) => w.arms[xp].days[k].e)), XPU: figures(all4.map((w) => w.arms[u].days[k].e)), S: figures(all4.map((w) => w.arms[s].days[k].e)), S1: figures(all4.map((w) => w.arms[s1].days[k].e)), 'S/XP': ratio(`${label}|${k}|S/XP`, p(s, xp)), 'S1/XP': ratio(`${label}|${k}|S1/XP`, p(s1, xp)), 'S/XPU': ratio(`${label}|${k}|S/XPU`, p(s, u)), 'S1/XPU': ratio(`${label}|${k}|S1/XPU`, p(s1, u)) };
  }
  return out;
}
/** A window with every arm it is read for, by key: stored arms, U from the Space Force store, S1 and the node from this task's rows. */
const join = (r, u, uArm, arc, nodeArm) => ({ key: r.key, name: r.name, arms: { ...r.arms, ...(u ? { [uArm]: u.arms?.[uArm] } : {}), ...(a.get(r.key)?.arms ?? {}) }, node: n.get(r.key)?.arms?.[nodeArm] });
const doc = { registered: 'experiments/operator-theory/GEO-SGP4.md', registration: REGISTRATION, amendment1: AMENDMENT1, reading: 'report only, a re-measurement', runs: { first: ranAt[0], last: ranAt.at(-1), rows: ranAt.length }, runsAmendment1: { first: ranAt1[0], last: ranAt1.at(-1), rows: ranAt1.length }, storedHashes, armA: [], nodesOnly: [], armB: [], armC: [], eclipse: [] };
for (const g of ['GE', 'IG']) {
  const list = [...regimes.values()].filter((r) => r.group === g && !r.error).map((r) => join(r, uRegimes.get(r.key), 'U72', 72, 'N72'));
  doc.armA.push(armA(g, list, { s: 'S72', s1: 'S1-72', xp: 'XP72', u: 'U72' }));
}
for (const arc of [24, 72]) {
  const list = [...wa.values()].filter((r) => !r.error).map((r) => join(r, uWa.get(r.key), `U${arc}`, arc, `N${arc}`));
  doc.armA.push(armA(`WA ${arc} h`, list, { s: `S${arc}`, s1: `S1-${arc}`, xp: `XP${arc}`, u: `U${arc}` }));
}
for (const fit of [24, 48]) {
  const list = [...gf.values()].filter((r) => r.fitHours === fit).map((r) => ({ key: r.key, name: r.object, arms: { S: r.arms.S?.days ? { ok: true, days: r.arms.S.days } : { ok: false }, XP: r.arms.XP?.days ? { ok: true, days: r.arms.XP.days } : { ok: false }, U: r.arms.U?.days ? { ok: true, days: r.arms.U.days } : { ok: false }, S1: a.get(`GF|${r.key}`)?.arms?.S1?.days ? { ok: true, days: a.get(`GF|${r.key}`).arms.S1.days } : { ok: false } }, node: n.get(`GF|${r.key}`)?.arms?.N, operatorSame: a.get(`GF|${r.key}`)?.operatorSame }));
  const c = armA(`GF ${fit} h`, list, { s: 'S', s1: 'S1', xp: 'XP', u: 'U' });
  c.operatorSame = list.filter((w) => w.operatorSame === true).length;
  doc.armA.push(c);
}
// Amendment 1: the WA and part F windows that moved without the node rule, with both SGP4 fits' in-arc RMS (part r refits; each must reproduce its scores).
for (const c of doc.armA.filter((x) => /^(WA|GF)/.test(x.group))) {
  const arc = c.group.match(/(\d+) h/)[1];
  for (const d of c.moved.detail.filter((x) => !x.holds)) {
    const r = c.group.startsWith('GF') ? rf.get(`GF|${d.key}`) : rf.get(d.key), r0 = c.group.startsWith('GF') ? r?.arms?.R0 : r?.arms?.[`R0-${arc}`], r1 = c.group.startsWith('GF') ? r?.arms?.R1 : r?.arms?.[`R1-${arc}`];
    Object.assign(d, { sRmsKm: r0?.rms3dKm ?? null, s1RmsKm: r1?.rms3dKm ?? null, sInclinationDeg: r0?.inclinationDeg ?? null, s1InclinationDegRefit: r1?.inclinationDeg ?? null, sReproduces: !!r0?.reproduces, s1Reproduces: !!r1?.reproduces, truthAsStored: c.group.startsWith('GF') ? r?.operatorSame === true : true });
  }
}
for (const g of ['HE', 'HX']) for (const sat of ['all', ...new Set([...regimes.values()].filter((r) => r.group === g).map((r) => r.name))]) {
  const list = [...regimes.values()].filter((r) => r.group === g && !r.error && (sat === 'all' || r.name === sat));
  for (const arc of [...new Set(list.flatMap((r) => Object.keys(n.get(r.key)?.arms ?? {})))].sort()) {
    const c = list.map((r) => n.get(r.key)?.arms?.[arc]).filter(Boolean);
    doc.nodesOnly.push({ group: g, satellite: sat, arc, windows: list.length, counted: c.length, crosses: c.filter((x) => x.crosses).length, near: c.filter((x) => x.near).length, holds: c.filter((x) => x.holds).length, incMedianDeg: median(c.map((x) => x.incMedianDeg)), incRangeDeg: [Math.min(...c.map((x) => x.incMedianDeg)), Math.max(...c.map((x) => x.incMedianDeg))], belowLyddane: c.filter((x) => x.incMaxDeg < 11.4592).length });
  }
}
// Arm (b): WW and SS are the stored cells; WS and SW the new flights; WWr and SSr the refits, checked against their stored cells.
for (const g of ['GE', 'IG']) {
  const list = [...regimes.values()].filter((r) => r.group === g && !r.error).map((r) => ({ key: r.key, name: r.name, arms: { WW: r.arms.XP72, SS: uRegimes.get(r.key)?.arms?.U72, WS: b.get(r.key)?.arms?.['WS-72'], SW: b.get(r.key)?.arms?.['SW-72'], WWr: b.get(r.key)?.arms?.['WWr-72'], SSr: b.get(r.key)?.arms?.['SSr-72'] } }));
  const CELLS = ['WW', 'SS', 'WS', 'SW'];
  const out = { group: g, windows: list.length, satellites: new Set(list.map((w) => w.name)).size, failed: Object.fromEntries([...CELLS, 'WWr', 'SSr'].map((c) => [c, list.filter((w) => !w.arms[c]?.ok).length])), errors: Object.fromEntries(['WS', 'SW'].map((c) => [c, [...new Set(list.filter((w) => w.arms[c] && !w.arms[c].ok).map((w) => w.arms[c].error))]])), reproduction: {}, leads: {} };
  for (const [r, s] of [['WWr', 'WW'], ['SSr', 'SS']]) {
    const both = list.filter((w) => w.arms[r]?.ok && w.arms[s]?.ok);
    out.reproduction[r] = { windows: both.length, identical: both.filter((w) => LEADS.every((k) => w.arms[r].days[k]?.e === w.arms[s].days[k]?.e)).length, maxAbsKm: Math.max(0, ...both.flatMap((w) => LEADS.map((k) => Math.abs((w.arms[r].days[k]?.e ?? 0) - (w.arms[s].days[k]?.e ?? 0))))) };
  }
  for (const k of LEADS) {
    const all4 = list.filter((w) => CELLS.every((c) => Number.isFinite(w.arms[c]?.days?.[k]?.e)));
    const p = (x, y) => all4.map((w) => ({ x: w.arms[x].days[k].e, y: w.arms[y].days[k].e, s: w.name }));
    out.leads[k] = { paired: all4.length, satellites: new Set(all4.map((w) => w.name)).size, keys: all4.map((w) => w.key), cells: Object.fromEntries(CELLS.map((c) => [c, figures(all4.map((w) => w.arms[c].days[k].e))])), ratios: Object.fromEntries([['WS', 'WW'], ['WS', 'SS'], ['SW', 'SS'], ['SW', 'WW'], ['SS', 'WW']].map(([x, y]) => [`${x}/${y}`, ratio(`${g}|${k}|${x}/${y}`, p(x, y))])) };
  }
  const d1 = out.leads['1'].ratios, inside = (r) => r.n && r.ratio >= 0.8 && r.ratio <= 1.25;
  out.decision = { libraryCleared: inside(d1['WS/WW']) && d1['WS/SS'].ratio < 0.5, fitConfirmed: inside(d1['SW/SS']) && d1['SW/WW'].ratio > 2 };
  doc.armB.push(out);
}

// Amendment 1, arm (c): each 2x2 set on Sgp4Prop 9.9 through the oracle, beside the same set on the module's 9.1.1.0 and on the whiteroom propagator; the oracle's 9.1.1.0 leg as a check.
for (const g of ['GE', 'IG']) {
  const list = [...regimes.values()].filter((r) => r.group === g && !r.error).map((r) => { const x = b.get(r.key)?.arms ?? {}, y = c9.get(r.key)?.arms ?? {}; return { key: r.key, name: r.name, arms: { WW: r.arms.XP72, WS: x['WS-72'], W9: y['W9-72'], W91o: y['W91o-72'], SS: uRegimes.get(r.key)?.arms?.U72, SW: x['SW-72'], S9: y['S9-72'], S91o: y['S91o-72'] } }; });
  const out = { group: g, windows: list.length, satellites: new Set(list.map((w) => w.name)).size, failed: Object.fromEntries(['W9', 'S9', 'W91o', 'S91o'].map((x) => [x, list.filter((w) => !w.arms[x]?.ok).length])), errors: [...new Set(list.flatMap((w) => ['W9', 'S9'].map((x) => w.arms[x]?.error)).filter(Boolean))], sets: {}, check: {} };
  for (const [set, own, white, nine, leg] of [['whiteroom', 'WS', 'WW', 'W9', 'W91o'], ['spaceForce', 'SS', 'SW', 'S9', 'S91o']]) {
    const leads = {};
    for (const k of LEADS) {
      const ok = list.filter((w) => [own, white, nine].every((x) => Number.isFinite(w.arms[x]?.days?.[k]?.e)));
      const v = (x) => figures(ok.map((w) => w.arms[x].days[k].e)), p = (x, y) => ok.map((w) => ({ x: w.arms[x].days[k].e, y: w.arms[y].days[k].e, s: w.name }));
      leads[k] = { paired: ok.length, satellites: new Set(ok.map((w) => w.name)).size, whiteroom: v(white), v9110: v(own), v99: v(nine), '9.9/whiteroom': ratio(`${g}|${k}|${nine}/${white}`, p(nine, white)), '9.9/9.1.1.0': ratio(`${g}|${k}|${nine}/${own}`, p(nine, own)), medianDiff99MinusWhiteroomKm: ok.length ? median(ok.map((w) => w.arms[nine].days[k].e - w.arms[white].days[k].e)) : null, medianDiff99Minus9110Km: ok.length ? median(ok.map((w) => w.arms[nine].days[k].e - w.arms[own].days[k].e)) : null };
    }
    const d1 = leads['1'], toWhite = Math.abs(d1.v99.median - d1.whiteroom.median), toLib = Math.abs(d1.v99.median - d1.v9110.median);
    out.sets[set] = { leads, day1: { toWhiteroomKm: toWhite, to9110Km: toLib, decision: toWhite <= 0.02 && toLib > 0.02 ? 'the 9.1.1.0 C/WASM build departs from the Space Force\'s own XP on these sets' : toLib <= 0.02 && toWhite > 0.02 ? 'whiteroom XP departs from the USSF theory on real geosynchronous sets' : 'neither: both reported' } };
    const both = (x, y) => list.filter((w) => w.arms[x]?.ok && w.arms[y]?.ok);
    const maxDiff = (x, y) => Math.max(0, ...both(x, y).flatMap((w) => LEADS.map((k) => Math.abs((w.arms[x].days[k]?.e ?? 0) - (w.arms[y].days[k]?.e ?? 0)))));
    out.check[set] = { oracle9110VsModule9110: { windows: both(leg, own).length, maxAbsKm: maxDiff(leg, own) }, oracle9110VsWhiteroom: { windows: both(leg, white).length, maxAbsKm: maxDiff(leg, white) }, oracle99VsWhiteroom: { windows: both(nine, white).length, maxAbsKm: maxDiff(nine, white) } };
  }
  doc.armC.push(out);
  // The eclipse split: per window the flag, and per lead the 9.1.1.0-minus-whiteroom flight difference of each set by flag.
  const flags = list.map((w) => ({ ...w, e: ec.get(w.key)?.arms?.E72 }));
  const split = { group: g, windows: flags.length, counted: flags.filter((w) => w.e).length, eclipsed: flags.filter((w) => w.e?.eclipsed).length, arcEclipsed: flags.filter((w) => w.e?.arcStates > 0).length, flightEclipsed: flags.filter((w) => w.e?.flightStates > 0).length, medianShadowMinutes: median(flags.filter((w) => w.e?.eclipsed).map((w) => w.e.arcMinutes + w.e.flightMinutes)) ?? null, leads: {} };
  for (const k of LEADS) {
    split.leads[k] = {};
    for (const [set, own, white] of [['whiteroom', 'WS', 'WW'], ['spaceForce', 'SS', 'SW']]) for (const flag of [true, false]) {
      const d = flags.filter((w) => w.e && w.e.eclipsed === flag && Number.isFinite(w.arms[own]?.days?.[k]?.e) && Number.isFinite(w.arms[white]?.days?.[k]?.e)).map((w) => w.arms[own].days[k].e - w.arms[white].days[k].e);
      split.leads[k][`${set}|${flag ? 'eclipsed' : 'sunlit'}`] = { n: d.length, medianKm: d.length ? median(d) : null };
    }
  }
  doc.eclipse.push(split);
}

// results/ap-truth/compare: regimes.json and regimes.md, GE and IG SGP4 figures from S1; every other byte as committed before this task.
const BASE = 'b635c6efdd5cfa155dbda4f9ccd5f6a42be56c9c', rel = (f) => `results/ap-truth/compare/${f}`;
const before = (f) => execFileSync('git', ['-C', repo, 'show', `${BASE}:${rel(f)}`]).toString('utf8');
const reg = JSON.parse(before('regimes.json'));
const live = [...regimes.values()].filter((r) => !r.error);
for (const c of reg.cells.filter((x) => x.group === 'GE' || x.group === 'IG')) {
  const list = live.filter((r) => r.group === c.group && (c.satellite === 'all' || r.name === c.satellite));
  const old = Object.fromEntries(LEADS.map((k) => [k, figures(list.map((r) => e(r, `S${c.fitHours}`, k)))]));
  if (JSON.stringify(old) !== JSON.stringify(c.arms.SGP4)) throw new Error(`${c.group} ${c.satellite}: the stored rows do not reproduce the committed SGP4 cell`);
  c.arms.SGP4 = Object.fromEntries(LEADS.map((k) => [k, figures(list.map((r) => e(a.get(r.key), `S1-${c.fitHours}`, k)))]));
}
fs.writeFileSync(path.join(COMPARE, 'regimes.json'), `${JSON.stringify(reg, null, 1)}\n`);
const md = before('regimes.md').split('\n');
for (const g of ['GE', 'IG']) {
  const c = reg.cells.find((x) => x.group === g && x.satellite === 'all');
  const head = md.findIndex((l) => l.startsWith(`## ${c.label}:`)), at = md.findIndex((l, i) => i > head && l.startsWith('| SGP4 |'));
  md[at] = `| SGP4 | ${LEADS.map((k) => (c.arms.SGP4[k].n ? `${round(c.arms.SGP4[k].median, 3)} (${round(c.arms.SGP4[k].p95, 2)})` : '-')).join(' | ')} |`;
}
fs.writeFileSync(path.join(COMPARE, 'regimes.md'), md.join('\n'));
doc.compare = { base: BASE, unchanged: ['table.json', 'table.md', 'cells.json', 'xp-versions.json', 'truth.json'].map((f) => ({ file: f, sha256: sha(fs.readFileSync(path.join(COMPARE, f))), sameAsBase: sha(fs.readFileSync(path.join(COMPARE, f))) === sha(execFileSync('git', ['-C', repo, 'show', `${BASE}:${rel(f)}`], { maxBuffer: 1 << 26 })) })) };

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'results.json'), `${JSON.stringify(doc, null, 1)}\n`);

// README: previous values beside the new.
const f3 = (x) => (x === null || x === undefined ? '-' : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3));
const fr = (r) => (r?.n ? `${f3(r.ratio)} [${f3(r.interval[0])}, ${f3(r.interval[1])}]` : '-');
const lines = ['# The geosynchronous SGP4 baseline in one SGP4 mode; the Space Force XP gap by fitter and library', '',
  `Report only, a re-measurement: \`experiments/operator-theory/GEO-SGP4.md\`, registered at ${REGISTRATION.slice(0, 7)} before any fit (runs ${doc.runs.first} to ${doc.runs.last}, ${doc.runs.rows} rows). \`S\` is the stored SGP4 arm (gp-error-model 0.11.0, improved mode); \`S1\` the same fit on gp-error-model 0.14.0 (AFSPC mode, the mode \`propagator/sgp4\` flies). Median 3D error, km, with the 95th percentile in brackets, on the windows where both scored.`, '',
  '## Arm (a): S beside S1', '', '| Group | Windows | Satellites | Failed S / S1 | Day | Paired | S | S1 | Median shift | 95th shift |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const c of doc.armA) for (const k of LEADS) { const l = c.leads[k]; lines.push(`| ${c.group} | ${c.windows} | ${c.satellites} | ${c.failed.S} / ${c.failed.S1} | ${k} | ${l.paired} | ${f3(l.S.median)} (${f3(l.S.p95)}) | ${f3(l.S1.median)} (${f3(l.S1.p95)}) | ${l.medianShift === null ? '-' : (1000 * l.medianShift).toFixed(1)} m | ${l.p95Shift === null ? '-' : (1000 * l.p95Shift).toFixed(1)} m |`); }
lines.push('', '## Node condition and moved windows', '', 'A window crosses when two successive hourly TEME nodes of its truth lie one in [0, 90) and the other in (270, 360) degrees; near when it does not cross and comes within 5 degrees of 0. A window moves when |S1 - S| exceeds 1 m at any scored day. The modes\' Lyddane branches can part only below 0.2 rad.', '', '| Group | Counted | Crosses (down, up) | Near | Neither | Median inclination, deg | Below 0.2 rad | Moved with condition | Moved without |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const c of doc.armA) lines.push(`| ${c.group} | ${c.node.counted} | ${c.node.crosses} (${c.node.down}, ${c.node.up}) | ${c.node.near} | ${c.node.neither} | ${f3(c.node.incMedianDeg)} | ${c.node.belowLyddane} | ${c.moved.withCondition} | ${c.moved.withoutCondition} |`);
for (const c of doc.nodesOnly) lines.push(`| ${c.group} ${c.satellite} ${c.arc.slice(1)} h (count only) | ${c.counted} | ${c.crosses} | ${c.near} | ${c.counted - c.holds} | ${f3(c.incMedianDeg)} (${f3(c.incRangeDeg[0])} to ${f3(c.incRangeDeg[1])}) | ${c.belowLyddane} | - | - |`);
const movedRows = doc.armA.flatMap((c) => c.moved.detail.map((d) => ({ group: c.group, ...d })));
if (movedRows.length) {
  lines.push('', 'Every moved window (read after the run; no rule rests on it): the fitted S1 set\'s inclination and node at its epoch, and the truth\'s nearest osculating node to 0.', '', '| Group | Window | Condition | Truth node nearest 0, deg | S1 inclination, deg | S1 node, deg | Largest shift, km |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const d of movedRows) lines.push(`| ${d.group} | ${d.key.split('|').slice(1).join(' ')} | ${d.holds ? 'holds' : 'no'} | ${f3(d.truthNodeNearestDeg)} | ${d.s1InclinationDeg === undefined ? '-' : d.s1InclinationDeg.toFixed(4)} | ${d.s1NodeDeg === undefined ? '-' : d.s1NodeDeg.toFixed(1)} | ${f3(d.largestShiftKm)} |`);
}
lines.push('', '## Ratios against both XP builds', '', 'Windows where S, S1, whiteroom XP and Space Force XP all scored that day. Ratio: exp of the median by window of ln(SGP4 / XP), 95 % interval from 10,000 draws of satellites.', '', '| Group | Day | Windows | Satellites | S / whiteroom | S1 / whiteroom | S / Space Force | S1 / Space Force |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const c of doc.armA) for (const k of LEADS) { const r = c.ratios[k]; lines.push(`| ${c.group} | ${k} | ${r.paired} | ${r.satellites} | ${fr(r['S/XP'])} | ${fr(r['S1/XP'])} | ${fr(r['S/XPU'])} | ${fr(r['S1/XPU'])} |`); }
lines.push('', '## Arm (b): fitter by library, GE and IG, 72 h', '', 'WW: whiteroom set on the whiteroom propagator (stored); SS: Space Force set on the Space Force library 9.1.1.0 (stored); WS: whiteroom set on the Space Force library; SW: Space Force set on the whiteroom propagator. Windows where all four scored that day.', '', '| Group | Day | Windows | Satellites | WW | SS | WS | SW | WS / WW | WS / SS | SW / SS | SW / WW |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const c of doc.armB) for (const k of LEADS) { const l = c.leads[k]; lines.push(`| ${c.group} | ${k} | ${l.paired} | ${l.satellites} | ${['WW', 'SS', 'WS', 'SW'].map((x) => `${f3(l.cells[x].median)} (${f3(l.cells[x].p95)})`).join(' | ')} | ${['WS/WW', 'WS/SS', 'SW/SS', 'SW/WW'].map((x) => fr(l.ratios[x])).join(' | ')} |`); }
lines.push('');
for (const c of doc.armB) lines.push(`- ${c.group}: ${c.windows} windows, ${c.satellites} satellites; failed WW ${c.failed.WW}, SS ${c.failed.SS}, WS ${c.failed.WS}, SW ${c.failed.SW}${c.errors.WS.length || c.errors.SW.length ? ` (${[...c.errors.WS, ...c.errors.SW].join('; ')})` : ''}. Refits against the stored cells: whiteroom ${c.reproduction.WWr.identical} of ${c.reproduction.WWr.windows} identical (largest difference ${(1000 * c.reproduction.WWr.maxAbsKm).toFixed(3)} m), Space Force ${c.reproduction.SSr.identical} of ${c.reproduction.SSr.windows} (${(1000 * c.reproduction.SSr.maxAbsKm).toFixed(3)} m). Registered rule at day 1: library cleared ${c.decision.libraryCleared ? 'yes' : 'no'}; fit confirmed ${c.decision.fitConfirmed ? 'yes' : 'no'}.`);
const ge = doc.armA.find((c) => c.group === 'GE'), ig = doc.armA.find((c) => c.group === 'IG'), bGe = doc.armB.find((c) => c.group === 'GE').leads['1'], bIg = doc.armB.find((c) => c.group === 'IG').leads['1'];
const unmoved = (c) => LEADS.every((k) => Math.abs(c.leads[k].windowShiftMedian ?? 0) <= 0.001) && c.moved.withCondition + c.moved.withoutCondition === 0;
lines.push('', '## Reading', '',
  `- GE and IG: ${unmoved(ge) && unmoved(ig) ? 'S1 equals S within 1 m on every window where both scored' : 'S1 differs from S'} (GE ${ge.leads['1'].paired} windows at day 1, IG ${ig.leads['1'].paired}); no GE or IG window meets the node condition. S1 fails ${ge.failed.S1} GE windows against S's ${ge.failed.S}, ${ig.failed.S1} IG against ${ig.failed.S}. The ratios against both XP builds are unchanged by the mode.`,
  `- WA and part F: SGP4 moves on windows the registered node condition does not mark (${doc.armA.filter((c) => c.moved.withoutCondition).map((c) => `${c.group} ${c.moved.withoutCondition}`).join(', ')}); these satellites are station-kept below 0.05 degrees (the part F window's broadcast truth has also grown since the stored run), and the condition reads the truth's osculating node, which at such inclinations need not track the theory's mean node (not tested).`,
  `- The 2x2, day 1: the whiteroom set flown on the Space Force library scores ${f3(bGe.ratios['WS/SS'].ratio)} times the Space Force set there (GE; IG ${f3(bIg.ratios['WS/SS'].ratio)}), and the Space Force set on the whiteroom propagator ${f3(bGe.ratios['SW/WW'].ratio)} times the whiteroom set (GE; IG ${f3(bIg.ratios['SW/WW'].ratio)}): the gap follows the propagator, not the fitter. Neither registered statement (library cleared, fit confirmed) is met.`);
{
  const cg = doc.armC.find((c) => c.group === 'GE'), ci = doc.armC.find((c) => c.group === 'IG'), eg = doc.eclipse.find((c) => c.group === 'GE'), ei = doc.eclipse.find((c) => c.group === 'IG');
  const worst = Math.max(...doc.armC.flatMap((c) => ['whiteroom', 'spaceForce'].map((x) => c.check[x].oracle9110VsWhiteroom.maxAbsKm)));
  lines.push(`- Arm (c), day 1: on 9.9 the whiteroom set scores ${f3(cg.sets.whiteroom.leads['1'].v99.median)} km and the Space Force set ${f3(cg.sets.spaceForce.leads['1'].v99.median)} km at GE (IG ${f3(ci.sets.whiteroom.leads['1'].v99.median)} and ${f3(ci.sets.spaceForce.leads['1'].v99.median)}), equal to their whiteroom flights; the registered decision for every set and group: ${[...new Set(doc.armC.flatMap((c) => Object.values(c.sets).map((x) => x.decision ?? x.day1.decision)))].join('; ')}. The oracle's own 9.1.1.0 leg also flies every set within ${(1000 * worst).toFixed(1)} m of the whiteroom flight, so the 0.1 to 0.24 km departure is the sgp4-xp module's flight of these sets, not 9.1.1.0 as the oracle runs it.`,
    `- Eclipse split: ${eg.eclipsed} of ${eg.counted} GE windows and ${ei.eclipsed} of ${ei.counted} IG windows enter the shadow cylinder; the module's 9.1.1.0-minus-whiteroom difference at day 1 is ${f3(ei.leads['1']['whiteroom|sunlit'].medianKm)} km on IG with no shadow at all, so shadow does not explain it there; on GE it is ${f3(eg.leads['1']['whiteroom|eclipsed'].medianKm)} km on eclipsed windows and ${f3(eg.leads['1']['whiteroom|sunlit'].medianKm)} km on the ${eg.leads['1']['whiteroom|sunlit'].n} sunlit ones.`);
}
lines.push('', '## Amendment 1, arm (c): the same sets on Sgp4Prop 9.9', '', `Amendment 1 (${AMENDMENT1.slice(0, 7)}), written after the first run and before any of these flights (${doc.runsAmendment1.first} to ${doc.runsAmendment1.last}). Each fitter's set, as two-line text, flown on the whiteroom propagator, on the sgp4-xp module's 9.1.1.0, and on 9.9 through the oracle (predictions only). Median km (95th), windows where all three scored.`, '', '| Group | Set | Day | Windows | Satellites | Whiteroom | 9.1.1.0 (module) | 9.9 (oracle) | 9.9 / whiteroom | 9.9 / 9.1.1.0 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const c of doc.armC) for (const [set, label] of [['whiteroom', 'whiteroom fit'], ['spaceForce', 'Space Force fit']]) for (const k of LEADS) { const l = c.sets[set].leads[k]; lines.push(`| ${c.group} | ${label} | ${k} | ${l.paired} | ${l.satellites} | ${f3(l.whiteroom.median)} (${f3(l.whiteroom.p95)}) | ${f3(l.v9110.median)} (${f3(l.v9110.p95)}) | ${f3(l.v99.median)} (${f3(l.v99.p95)}) | ${fr(l['9.9/whiteroom'])} | ${fr(l['9.9/9.1.1.0'])} |`); }
lines.push('');
for (const c of doc.armC) for (const [set, label] of [['whiteroom', 'whiteroom fit'], ['spaceForce', 'Space Force fit']]) { const d = c.sets[set].day1, k = c.check[set]; lines.push(`- ${c.group}, ${label}: day-1 median of 9.9 is ${(1000 * d.toWhiteroomKm).toFixed(1)} m from the whiteroom flight and ${(1000 * d.to9110Km).toFixed(1)} m from the module's 9.1.1.0; registered decision: ${d.decision}. The oracle's own 9.1.1.0 leg against the module's 9.1.1.0 flight: largest difference ${f3(k.oracle9110VsModule9110.maxAbsKm)} km over ${k.oracle9110VsModule9110.windows} windows; against the whiteroom flight ${(1000 * k.oracle9110VsWhiteroom.maxAbsKm).toFixed(3)} m; 9.9 against whiteroom ${(1000 * k.oracle99VsWhiteroom.maxAbsKm).toFixed(3)} m.`); }
lines.push('', '## Amendment 1: eclipse split', '', 'A window is eclipsed when any truth state of its 72 h arc or its seven days after the cutoff lies in the cylinder of radius 6,378.137 km behind the Earth from the Sun (the Sun from foundation/frames, hourly). Median of the 9.1.1.0-minus-whiteroom flight difference, km, by flag (count in brackets).', '', '| Group | Day | Whiteroom set, eclipsed | Whiteroom set, sunlit | Space Force set, eclipsed | Space Force set, sunlit |', '| --- | --- | --- | --- | --- | --- |');
for (const c of doc.eclipse) for (const k of LEADS) { const l = c.leads[k], cell = (x) => `${f3(l[x].medianKm)} (${l[x].n})`; lines.push(`| ${c.group} | ${k} | ${cell('whiteroom|eclipsed')} | ${cell('whiteroom|sunlit')} | ${cell('spaceForce|eclipsed')} | ${cell('spaceForce|sunlit')} |`); }
lines.push('');
for (const c of doc.eclipse) lines.push(`- ${c.group}: ${c.eclipsed} of ${c.counted} windows eclipsed (${c.arcEclipsed} in the arc, ${c.flightEclipsed} in the flight), median ${f3(c.medianShadowMinutes)} minutes in shadow.`);
const listed = doc.armA.filter((c) => /^(WA|GF)/.test(c.group)).flatMap((c) => c.moved.detail.filter((d) => !d.holds).map((d) => ({ group: c.group, ...d })));
lines.push('', '## Amendment 1: WA and part F windows that moved without the node rule (reported, not gated)', '', '| Group | Window | S1 inclination, deg | S in-arc RMS, km | S1 in-arc RMS, km | Largest shift, km | Refits reproduce (S, S1) | Truth as stored |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const d of listed) lines.push(`| ${d.group} | ${d.key.split('|').slice(-3).join(' ')} | ${d.s1InclinationDegRefit === null ? '-' : d.s1InclinationDegRefit.toFixed(4)} | ${f3(d.sRmsKm)} | ${f3(d.s1RmsKm)} | ${f3(d.largestShiftKm)} | ${d.sReproduces ? 'yes' : 'no'}, ${d.s1Reproduces ? 'yes' : 'no'} | ${d.truthAsStored ? 'yes' : 'no: the broadcast has grown since the stored run, so S cannot be reproduced and the shift is not the mode\'s'} |`);
lines.push('', '## What else changed', '', `\`results/ap-truth/compare/regimes.json\` and \`regimes.md\`: the GE and IG cells' SGP4 figures are S1's; every other cell is byte-identical to ${BASE.slice(0, 7)}. Unchanged files, SHA-256 equal to ${BASE.slice(0, 7)}: ${doc.compare.unchanged.map((u) => `\`${u.file}\` ${u.sameAsBase ? 'yes' : 'NO'}`).join(', ')}. \`table.json\` holds no GE, IG, WA or geostationary-provider row. The WA and part F figures (\`results/ap-truth/geo\`) and the site's \`cells.json\` are outside this task's paths; their S1 figures are in \`results.json\` (\`armA\`).`, '');
lines.push('Rebuild: `geo-sgp4-run.mjs --part a|n|b` into `<archive>/operator-theory/ap/geo-sgp4-one-mode/<part>`, then `geo-sgp4-table.mjs --out results/operator-theory/geo-sgp4-one-mode --compare results/ap-truth/compare`.', '');
fs.writeFileSync(path.join(OUT, 'README.md'), lines.join('\n'));
console.log(lines.join('\n'));
