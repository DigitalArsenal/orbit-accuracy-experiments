// XA aggregation (PLAN.md, Statistics and The verdict): the stored window rows -> results/xp-atmosphere-ablation/table.json and
// README.md. Every number in the committed table is computed here from the rows; nothing is typed. Counting, ordering and
// resampling only. The reading (reading.md, the analyst's words on the numbers) is appended to the README as written.
//   node experiments/xp-atmosphere-ablation/table.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { config, build as buildJson, store, results, args, readJsonl, root, dir } from './common.mjs';

const DAYS = ['1', '2', '3'];
const B = config.statistics.bootstrap;
const ARMS = ['A0', 'A1M', 'A1O', 'A2M', 'A2O', 'A3M', 'A3O', 'P'];
const VARIANTS = Object.keys(config.diagnostic.variants);
const NAMES = {
  A0: 'A0 XP as is', A1M: 'A1 Jacchia 1970, measured weather (M)', A1O: 'A1 Jacchia 1970, operational weather (O)', A2M: 'A2 NRLMSISE-00 (M)', A2O: 'A2 NRLMSISE-00 (O)',
  A3M: 'A3 NRLMSISE-00 x open DCA (M)', A3O: 'A3 NRLMSISE-00 x open DCA (O)', P: 'P public element set (SGP4)',
};

const quantile = (values, q) => {
  const a = values.filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!a.length) return null;
  const pos = (a.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
};
const medianSorted = (a) => { const pos = (a.length - 1) / 2, lo = Math.floor(pos), hi = Math.ceil(pos); return a[lo] + (a[hi] - a[lo]) * (pos - lo); };

/** xorshift128+ seeded by SHA-256 of `label` (B1 table.mjs). */
function generator(label) {
  const d = crypto.createHash('sha256').update(label).digest();
  let [ah, al, bh, bl] = [d.readUInt32BE(0), d.readUInt32BE(4), d.readUInt32BE(8), d.readUInt32BE(12)];
  if (!(ah | al | bh | bl)) al = 1;
  return () => {
    let xh = ah, xl = al; const yh = bh, yl = bl;
    ah = yh; al = yl;
    xh = (xh ^ ((xh << 23) | (xl >>> 9))) >>> 0; xl = (xl ^ (xl << 23)) >>> 0;
    const x17l = ((xl >>> 17) | (xh << 15)) >>> 0, x17h = xh >>> 17;
    const y26l = ((yl >>> 26) | (yh << 6)) >>> 0, y26h = yh >>> 26;
    bh = (xh ^ yh ^ x17h ^ y26h) >>> 0; bl = (xl ^ yl ^ x17l ^ y26l) >>> 0;
    const lo = bl + yl, carry = lo >= 4294967296 ? 1 : 0;
    return ((bh + yh + carry) >>> 0) / 4294967296;
  };
}

/** Percentile-bootstrap 95 % interval of the median: items are values, or (clustered) arrays of values, one per cluster. */
function interval(items, label, clustered) {
  if (items.length < 2) return null;
  const next = generator(label);
  const medians = new Float64Array(B.resamples);
  for (let r = 0; r < B.resamples; r += 1) {
    const picks = [];
    let total = 0;
    for (let i = 0; i < items.length; i += 1) { const pick = items[Math.floor(next() * items.length)]; picks.push(pick); total += clustered ? pick.length : 1; }
    const draw = new Float64Array(total);  // a typed array sorts numerically
    let at = 0;
    for (const pick of picks) { if (clustered) { draw.set(pick, at); at += pick.length; } else draw[at++] = pick; }
    draw.sort();
    medians[r] = medianSorted(draw);
  }
  const tail = (1 - B.level) / 2, all = Array.from(medians);
  return [quantile(all, tail), quantile(all, 1 - tail)];
}

/** The median, p10, p90 and both intervals of per-window values [{v, cluster}]. */
function summary(items, label) {
  const values = items.map((x) => x.v);
  const byCluster = new Map();
  for (const x of items) { if (!byCluster.has(x.cluster)) byCluster.set(x.cluster, []); byCluster.get(x.cluster).push(x.v); }
  return { n: values.length, clusters: byCluster.size, median: quantile(values, 0.5), p10: quantile(values, 0.1), p90: quantile(values, 0.9),
    ciWindows: interval(values, `${label}|windows`, false), ciClusters: interval([...byCluster.values()], `${label}|clusters`, true) };
}

const condOf = (arm) => (/[MO]$/.test(arm) && arm !== 'P' ? arm.slice(-1) : '-');
const armOf = (arm) => (condOf(arm) === '-' ? arm : arm.slice(0, -1));

/** Per window values of `get(row)` at day d, the rows where it is finite. */
const valuesAt = (rows, get, d) => rows.map((r) => ({ v: get(r)?.days?.[d]?.rmsKm, cluster: r.cluster })).filter((x) => Number.isFinite(x.v));
/** Paired per-window ratios get(row)/base(row) at day d. */
function paired(rows, get, base, d, label) {
  const items = rows.map((r) => { const a = get(r)?.days?.[d]?.rmsKm, b = base(r)?.days?.[d]?.rmsKm; return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? { v: a / b, cluster: r.cluster } : null; }).filter(Boolean);
  if (!items.length) return { n: 0 };
  return { ...summary(items, label), closerShare: items.filter((x) => x.v < 1).length / items.length };
}

const loadRows = () => {
  const d = path.join(store, 'rows');
  const all = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.jsonl')).flatMap((f) => readJsonl(path.join(d, f))) : [];
  const byKey = new Map(all.map((r) => [r.key, r]));  // a re-run's row replaces an earlier one of the same window
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
};

export function build() {
  const rows = loadRows();
  const out = { experiment: config.experiment, id: config.id, task: config.task, build: { modulesCommit: buildJson.modulesCommit, sdnapWasmSha256: buildJson.wasmSha256['propagator/sdn-ap'] }, groups: {} };
  const registration = execFileSync('git', ['log', '--reverse', '--format=%H %cI', '--', 'experiments/xp-atmosphere-ablation/PLAN.md'], { cwd: root }).toString().trim().split('\n')[0].split(' ');
  out.registration = { commit: registration[0], time: registration[1] };
  for (const g of ['L1', 'L2', 'I', 'N']) {
    const all = rows.filter((r) => r.group === g);
    const ok = all.filter((r) => !r.error && !r.excluded);
    const G = { name: config.groups[g].name, source: config.groups[g].source, fitInput: config.groups[g].fitInput, registered: config.groups[g].windows ?? Object.values(config.groups[g].regimes).reduce((a, b) => a + b, 0),
      rows: all.length, errors: all.filter((r) => r.error).length, excluded: all.filter((r) => r.excluded).map((r) => ({ key: r.key, why: r.excluded })),
      spacing: { fitSpanHours: 24, fitSpacingSeconds: quantile(ok.map((r) => r.fitSpacingSeconds), 0.5), truthSpacingSeconds: quantile(ok.map((r) => r.truthSpacingSeconds), 0.5) },
      arms: {}, paired: {}, verdict: {}, a0VsP: {}, fit: {} };
    for (const a of ARMS) {
      const get = (r) => r.arms?.[a];
      const scored = ok.filter((r) => get(r)?.ok);
      G.arms[a] = { attempted: ok.length, fitted: scored.length, notRun: ok.filter((r) => get(r)?.notRun).length, failed: ok.filter((r) => get(r) && !get(r).ok && !get(r).notRun).length, days: {} };
      for (const d of DAYS) G.arms[a].days[d] = summary(valuesAt(scored, get, d), `XA|${g}|${armOf(a)}|${condOf(a)}|${d}|median`);
      const bt = scored.map((r) => get(r).bterm).filter(Number.isFinite);
      G.fit[a] = { moduleFitRmsKmMedian: quantile(scored.map((r) => get(r).moduleFitRmsKm), 0.5), scoredFitRmsKmMedian: quantile(scored.map((r) => get(r).fitRmsKm), 0.5),
        btermNonPositiveShare: bt.length ? bt.filter((v) => !(v > 0)).length / bt.length : null, btermMedian: quantile(bt, 0.5), agomMedian: quantile(scored.map((r) => get(r).agom), 0.5) };
      if (a === 'A0' || a === 'P') continue;
      G.paired[a] = {};
      for (const d of DAYS) G.paired[a][d] = paired(ok, get, (r) => r.arms?.A0, d, `XA|${g}|${armOf(a)}|${condOf(a)}|${d}|paired`);
      if (config.verdict.groups.includes(g)) {
        const d3 = G.paired[a]['3']?.ciClusters, d1 = G.paired[a]['1']?.ciClusters;
        G.verdict[a] = d3 && d1 && d3[1] < 1 && !(d1[0] > 1) ? 'improves accuracy' : 'no demonstrated improvement';
      }
    }
    for (const d of DAYS) G.a0VsP[d] = paired(ok, (r) => r.arms?.A0, (r) => r.arms?.P, d, `XA|${g}|A0|P|${d}|paired`);
    if (g === 'N') {
      // the negative control: every arm equal to A0 within 1e-9 relative, the same fitted elements
      const ctl = {};
      for (const a of ['A1M', 'A1O', 'A2M', 'A2O', 'A3M', 'A3O']) {
        let compared = 0, maxRel = 0, elementsDiffer = 0;
        for (const r of ok) {
          const x = r.arms?.[a], y = r.arms?.A0;
          if (!x?.ok || !y?.ok) continue;
          compared += 1;
          if (x.epoch !== y.epoch || x.bterm !== y.bterm || x.agom !== y.agom || x.moduleFitRmsKm !== y.moduleFitRmsKm) elementsDiffer += 1;
          for (const d of DAYS) { const p = x.days?.[d]?.rmsKm, q = y.days?.[d]?.rmsKm; if (Number.isFinite(p) && Number.isFinite(q)) maxRel = Math.max(maxRel, Math.abs(p / q - 1)); }
        }
        ctl[a] = { compared, maxRelative: maxRel, setsDiffer: elementsDiffer, agree: compared > 0 ? maxRel <= config.groups.N.agreementRelative && elementsDiffer === 0 : null };
      }
      G.negativeControl = ctl;
    }
    if (config.diagnostic.groups.includes(g)) {
      G.diag = {};
      for (const v of VARIANTS) {
        const get = v === 'D0' ? (r) => r.arms?.A0 : (r) => r.diag?.[v];
        const scored = ok.filter((r) => get(r)?.ok);
        const notRun = ok.filter((r) => get(r)?.notRun).map((r) => get(r).notRun);
        const D = { attempted: ok.filter((r) => get(r)).length, fitted: scored.length, notRun: notRun.length, notRunReason: notRun[0] ?? null, failed: ok.filter((r) => get(r) && !get(r).ok && !get(r).notRun).length, days: {}, vsP: {}, vsD0: {} };
        for (const d of DAYS) {
          D.days[d] = summary(valuesAt(scored, get, d), `XA|${g}|${v}|-|${d}|median`);
          D.vsP[d] = paired(ok, get, (r) => r.arms?.P, d, `XA|${g}|${v}|P|${d}|paired`);
          D.vsD0[d] = paired(ok, get, (r) => r.arms?.A0, d, `XA|${g}|${v}|D0|${d}|paired`);
        }
        const covs = scored.map((r) => get(r).cov).filter(Boolean);
        const med = (k) => quantile(covs.map((c) => c[k]), 0.5);
        const bt = scored.map((r) => get(r).bterm).filter(Number.isFinite);
        D.fit = { moduleFitRmsKmMedian: quantile(scored.map((r) => get(r).moduleFitRmsKm), 0.5), scoredFitRmsKmMedian: quantile(scored.map((r) => get(r).fitRmsKm), 0.5),
          sigmaBtermMedian: med('sigmaBterm'), sigmaAgomMedian: med('sigmaAgom'), rhoBtermAgomMedian: med('rhoBtermAgom'), multipleCorrBtermStateMedian: med('multipleCorrBtermState'), multipleCorrAgomStateMedian: med('multipleCorrAgomState'),
          btermNonPositiveShare: bt.length ? bt.filter((x) => !(x > 0)).length / bt.length : null, btermMedian: quantile(bt, 0.5), agomMedian: quantile(scored.map((r) => get(r).agom), 0.5) };
        G.diag[v] = D;
      }
      // D0 itself, for the table
      const a0 = ok.filter((r) => r.arms?.A0?.ok);
      const covs = a0.map((r) => r.arms.A0.cov).filter(Boolean);
      const med = (k) => quantile(covs.map((c) => c[k]), 0.5);
      G.diag.D0 = { fitted: a0.length, days: G.arms.A0.days, vsP: G.a0VsP, fit: { ...G.fit.A0, sigmaBtermMedian: med('sigmaBterm'), sigmaAgomMedian: med('sigmaAgom'), rhoBtermAgomMedian: med('rhoBtermAgom'), multipleCorrBtermStateMedian: med('multipleCorrBtermState'), multipleCorrAgomStateMedian: med('multipleCorrAgomState') } };
    }
    // post hoc, not registered (labelled so in the README): the windows split by the sign of A0's fitted BTERM (SGP4XP applies
    // no drag at BTERM <= 0, and the fit's drag column is zero there), and each arm's paired ratio where both fits keep drag
    const pos = ok.filter((r) => r.arms?.A0?.ok && r.arms.A0.bterm > 0), neg = ok.filter((r) => r.arms?.A0?.ok && !(r.arms.A0.bterm > 0));
    const split = (set, lab) => ({ windows: set.length, A0: Object.fromEntries(DAYS.map((d) => [d, quantile(set.map((r) => r.arms.A0.days?.[d]?.rmsKm), 0.5)])),
      P: Object.fromEntries(DAYS.map((d) => [d, quantile(set.map((r) => r.arms.P?.days?.[d]?.rmsKm), 0.5)])), a0VsP: Object.fromEntries(DAYS.map((d) => [d, paired(set, (r) => r.arms.A0, (r) => r.arms.P, d, `XA|${g}|post-hoc|${lab}|${d}`)])) });
    G.postHoc = { btermPositive: split(pos, 'positive'), btermNonPositive: split(neg, 'non-positive'), dragKept: {} };
    for (const a of ['A1M', 'A1O', 'A2M', 'A2O', 'A3M', 'A3O']) {
      const both = ok.filter((r) => r.arms?.A0?.bterm > 0 && r.arms?.[a]?.bterm > 0);
      G.postHoc.dragKept[a] = Object.fromEntries(DAYS.map((d) => [d, paired(both, (r) => r.arms[a], (r) => r.arms.A0, d, `XA|${g}|post-hoc|${a}|${d}`)]));
    }
    // the open DCA's availability
    G.dca = Object.fromEntries(['M', 'O'].map((c) => [c, { issued: ok.filter((r) => r.dca?.[c]?.ok).length, refused: ok.filter((r) => r.dca && !r.dca[c]?.ok).length }]));
    out.groups[g] = G;
  }
  return out;
}

// ---- README ---------------------------------------------------------------------------------------------------------
const km = (v) => (v == null ? '-' : v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v.toFixed(3));
const r3 = (v) => (v == null ? '-' : v.toFixed(3));
const ci = (c, f = km) => (c ? `[${f(c[0])}, ${f(c[1])}]` : '');
const cell = (s) => (s?.n ? `${km(s.median)} (${km(s.p10)} to ${km(s.p90)}) ${ci(s.ciClusters)} n ${s.n}` : '-');
const pcell = (p) => (p?.n ? `${r3(p.median)} ${ci(p.ciClusters, r3)} (windows ${ci(p.ciWindows, r3)}), closer in ${Math.round(100 * p.closerShare)} %, n ${p.n}` : '-');

function readme(t) {
  const L = [];
  L.push('# XA: an XP with a better atmosphere, on real truth; and why our XP fit is weak', '');
  L.push(`Generated by \`node experiments/xp-atmosphere-ablation/table.mjs\` from the stored rows; plan: [PLAN.md](../../experiments/xp-atmosphere-ablation/PLAN.md), registered at ${t.registration.time} (commit ${t.registration.commit.slice(0, 10)}). Modules ${t.build.modulesCommit.slice(0, 12)}, propagator/sdn-ap ${t.build.sdnapWasmSha256.slice(0, 12)}.`, '');
  L.push('A cell is the median over windows of a day\'s 3D RMS (km), the 10th and 90th percentiles in parentheses, the 95 % bootstrap interval of the median over clusters (objects; the ISS: calendar months) in brackets, and the windows scored. A paired cell is the median of the per-window ratio arm / A0 with its cluster interval (the window interval beside it) and the share of windows where the arm is closer. Conditions: M measured space weather (and a $DCL issued at E + 78 h), O operational (what is known at the arc end E). XP is analytic: it is evaluated at the truth epochs only.', '');
  for (const [g, G] of Object.entries(t.groups)) {
    L.push(`## ${g}: ${G.name}`, '');
    L.push(`Source ${G.source}; fit input ${G.fitInput}. Fit span 24 h; fit-input spacing ${G.spacing.fitSpacingSeconds} s; truth epochs every ${G.spacing.truthSpacingSeconds} s (G1's thinning toward one per 300 s). ${G.rows} of ${G.registered} registered windows ran${G.errors ? `, ${G.errors} failed` : ''}${G.excluded.length ? `, ${G.excluded.length} excluded (${[...new Set(G.excluded.map((e) => e.why))].join('; ')})` : ''}. Open-DCA $DCL issued: M ${G.dca.M.issued}, O ${G.dca.O.issued} windows (A3 runs on those).`, '');
    L.push(`| Arm | Fitted / attempted | Day 1 | Day 2 | Day 3 | Fit RMS (module, km) | BTERM <= 0 |`, '| --- | --: | --- | --- | --- | --: | --: |');
    for (const a of ARMS) { const A = G.arms[a]; L.push(`| ${NAMES[a]} | ${A.fitted} / ${A.attempted} | ${cell(A.days['1'])} | ${cell(A.days['2'])} | ${cell(A.days['3'])} | ${km(G.fit[a].moduleFitRmsKmMedian)} | ${G.fit[a].btermNonPositiveShare == null ? '-' : `${Math.round(100 * G.fit[a].btermNonPositiveShare)} %`} |`); }
    L.push('');
    L.push('| Paired with A0 | Day 1 | Day 2 | Day 3 | Verdict |', '| --- | --- | --- | --- | --- |');
    for (const a of ARMS.filter((x) => x !== 'A0' && x !== 'P')) L.push(`| ${NAMES[a]} | ${pcell(G.paired[a]['1'])} | ${pcell(G.paired[a]['2'])} | ${pcell(G.paired[a]['3'])} | ${G.verdict[a] ?? 'control (no verdict)'} |`);
    L.push(`| A0 against the public set (A0 / P) | ${pcell(G.a0VsP['1'])} | ${pcell(G.a0VsP['2'])} | ${pcell(G.a0VsP['3'])} | |`, '');
    if (G.negativeControl) {
      L.push('Negative control: every arm against A0 on the windows both fitted.', '', '| Arm | Windows | Largest relative difference | Sets differing | Agree |', '| --- | --: | --: | --: | --- |');
      for (const [a, c] of Object.entries(G.negativeControl)) L.push(`| ${NAMES[a]} | ${c.compared} | ${c.maxRelative.toExponential(2)} | ${c.setsDiffer} | ${c.agree == null ? 'not run' : c.agree ? 'yes' : 'NO'} |`);
      L.push('');
    }
    {
      const H = G.postHoc;
      L.push(`Post hoc, not registered: SGP4XP applies no drag when BTERM <= 0, and the fit's drag column is then zero. A0 ended with BTERM > 0 in ${H.btermPositive.windows} windows and BTERM <= 0 in ${H.btermNonPositive.windows}.`, '');
      L.push('| A0 windows | Windows | A0 day 1 / 2 / 3 | P day 1 / 2 / 3 | A0 / P day 1 | A0 / P day 3 |', '| --- | --: | --- | --- | --- | --- |');
      for (const [lab, x] of [['BTERM > 0', H.btermPositive], ['BTERM <= 0', H.btermNonPositive]]) L.push(`| ${lab} | ${x.windows} | ${DAYS.map((d) => km(x.A0[d])).join(' / ')} | ${DAYS.map((d) => km(x.P[d])).join(' / ')} | ${x.a0VsP['1'].n ? `${r3(x.a0VsP['1'].median)} ${ci(x.a0VsP['1'].ciClusters, r3)}` : '-'} | ${x.a0VsP['3'].n ? `${r3(x.a0VsP['3'].median)} ${ci(x.a0VsP['3'].ciClusters, r3)}` : '-'} |`);
      L.push('', '| Arm / A0 where both keep drag (BTERM > 0) | Day 1 | Day 2 | Day 3 |', '| --- | --- | --- | --- |');
      for (const [a, x] of Object.entries(H.dragKept)) L.push(`| ${NAMES[a]} | ${pcell(x['1'])} | ${pcell(x['2'])} | ${pcell(x['3'])} |`);
      L.push('');
    }
    if (G.diag) {
      L.push(`### ${g}, Part D: the fit-design diagnostic (A0 only, outside the verdict)`, '');
      L.push(`Each variant changes one factor from D0 = A0 (24 h, BTERM and AGOM estimated, dense input, epoch at the arc start, the analytic Jacobian, ${g === 'L1' ? 'FFM-carried input' : 'NASA input'}); truth epochs as above.`, '');
      L.push('| Variant | Fitted | Day 1 | Day 2 | Day 3 | / P day 1 | / P day 2 | / P day 3 | / D0 day 3 | Fit RMS module / scored (km) | sigma BTERM, AGOM (m^2/kg) | rho(BTERM, AGOM) | R(BTERM, state), R(AGOM, state) | BTERM <= 0 |', '| --- | --: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --: | --- | --: |');
      for (const v of ['D0', ...VARIANTS]) {
        const D = G.diag[v];
        if (!D) continue;
        const f = D.fit ?? {};
        const exp = (x) => (x == null ? '-' : Math.abs(x) < 1e-3 ? x.toExponential(1) : x.toPrecision(2));
        const rp = (x) => (x?.n ? `${r3(x.median)} ${ci(x.ciClusters, r3)}` : '-');
        L.push(`| ${v} | ${D.fitted}${D.notRun ? ` (${D.notRun} not run: ${D.notRunReason})` : ''} | ${cell(D.days?.['1'])} | ${cell(D.days?.['2'])} | ${cell(D.days?.['3'])} | ${rp(D.vsP?.['1'])} | ${rp(D.vsP?.['2'])} | ${rp(D.vsP?.['3'])} | ${rp(D.vsD0?.['3'])} | ${km(f.moduleFitRmsKmMedian)} / ${km(f.scoredFitRmsKmMedian)} | ${exp(f.sigmaBtermMedian)}, ${exp(f.sigmaAgomMedian)} | ${f.rhoBtermAgomMedian == null ? '-' : f.rhoBtermAgomMedian.toFixed(2)} | ${f.multipleCorrBtermStateMedian == null ? '-' : `${f.multipleCorrBtermStateMedian.toFixed(2)}, ${f.multipleCorrAgomStateMedian.toFixed(2)}`} | ${f.btermNonPositiveShare == null ? '-' : `${Math.round(100 * f.btermNonPositiveShare)} %`} |`);
      }
      L.push('');
    }
  }
  L.push('## Data and terms', '');
  L.push('Results use every dataset the run read; only aggregates are published. GFZ Kp, ap, Ap and F10.7: CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001 (F10.7 compared with NOAA SWPC daily solar data, public domain). The open-DCA $DCL: a derived aggregate of Planet Labs PBC ephemerides, https://ephemerides.planet-labs.com/, CC BY-NC 4.0 (Planet states and arcs stay local). ILRS data and products (Pearlman et al. 2019, J Geod 93:2161-2180, doi:10.1007/s00190-019-01241-1), from the EUROLAS Data Center, DGFI-TUM; NSGF orbits. NASA ISS trajectory files (public). Space-Track element sets and the precise orbits of B1 (G1\'s sources) stay in the local store.', '');
  const reading = path.join(dir, 'reading.md');
  if (fs.existsSync(reading)) L.push(fs.readFileSync(reading, 'utf8').trim(), '');
  return `${L.join('\n')}\n`;
}

const tableFile = path.join(results, 'table.json');
export const sameAsCommitted = (t) => {
  try { return execFileSync('git', ['show', 'HEAD:results/xp-atmosphere-ablation/table.json'], { cwd: root }).toString() === `${JSON.stringify(t, null, 1)}\n`; } catch { return false; }
};

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const t = build();
  if (args.check) { const same = sameAsCommitted(t); console.error(same ? 'XA table: same as committed' : 'XA table: differs from committed'); process.exit(same ? 0 : 1); }
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(tableFile, `${JSON.stringify(t, null, 1)}\n`);
  fs.writeFileSync(path.join(results, 'README.md'), readme(t));
  console.error(`XA table: ${Object.entries(t.groups).map(([g, G]) => `${g} ${G.rows}`).join(', ')} rows`);
}
