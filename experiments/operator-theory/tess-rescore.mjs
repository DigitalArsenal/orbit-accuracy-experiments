// TESS-RESCORE.md: the stored TESS windows re-scored on the kernels' ten-minute nodes beside the chord-filled figures, every arm on its cells build; the
// fit/scoring split, AP's terms and builds, the solution switches and the velocity steps for the day-3/7 worsening. Module calls only: states from the
// propagators, frames by foundation/frames, RTN errors by analysis/gp-error-model, kernels by files/orbit-products, epochs by foundation/time; the
// script selects records, bins and takes statistics.
//   SDN_MODULES_ROOT=<modules root> SDN_MODULES_GIT=<clone with every commit> nice -n 10 node experiments/operator-theory/tess-rescore.mjs --run [--parts main,ablate,steps] [--shard k/n]
//   node experiments/operator-theory/tess-rescore.mjs --table [--verdict <file>]   (rows to results/ap-truth/tess-rescore/table.json and README.md)
//   node experiments/operator-theory/tess-rescore.mjs --check                      (re-derives the table from the rows; the control; zero interpolated epochs)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const STORE = process.env.TESS_RESCORE_STORE ?? '/opt/data/sdn-archive/operator-theory/tess-rescore';
const OUT = path.join(REPO, 'results/ap-truth/tess-rescore');
const STORED = path.join(REPO, 'results/ap-truth/tess-nodes-20261105.json'), CELLS = path.join(REPO, 'results/ap-truth/compare/cells.json');
const HOUR = 3600000, DAY = 86400000, NODE_S = 600, DAYS = ['1', '2', '3', '7'];
const FOUR = ['2026-07-27', '2026-08-10', '2026-08-24', '2026-09-07'];
// Columns of cells.json and the stored before/after file, by the arm codes of the rows.
const COLUMNS = [['SGP4', 'S'], ['XP', 'XP'], ['XPU', 'U'], ['AP', 'AP'], ['FFM20', 'F']];
const SCORES = ['CC', 'CN', 'NN', 'NS'];
/** propagator/sdn-ap builds of the ablations: version, modules commit, dist SHA-256, record path. */
const BUILDS = Object.fromEntries([
  ['0.4.14', '5e9f42619b753ffcd5e422538dad8b77bbdeedc5', '525d57599048b7d7c178dbb9c01c7ebc1ff47936ab2e7833b6f2228eb8e44646'],
  ['0.4.15', 'd50689f1e6ac5f272a63a31fdbd15d3ca9d92a5d', '2cdec7f54d7b7fa985ea8070b777b36ef71fae200c0106b17a3e5bc8ba6ade79'],
  ['0.5.1', 'ea824356587f54149f876cd3b2b5d8134af682d3', 'd29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb'],
  ['0.6.1', '3b59e95b3', '05dd4a6600fb4c65d5841e1f49dc26df64fca7c14f1084644cafcfa875fe0a87'],
].map(([version, commit, sha256]) => [version, { version, commit, sha256, api: /^0\.4\./.test(version) ? 'omm' : 'ocm' }]));
/** The ablation arms (72 h fit): label, fit build, flight build, tesseral cap, zonal cap. */
const ABLATIONS = [
  ...[[0, 20], [4, 20], [12, 20], [31, 0], [0, 0]].map(([d, z]) => ['0.5.1', '0.5.1', d, z]),
  ['0.6.1', '0.6.1', 31, 20], ['0.6.1', '0.6.1', 0, 20], ['0.5.1', '0.6.1', 31, 20], ['0.6.1', '0.5.1', 31, 20],
  ['0.4.14', '0.4.14', 31, 20], ['0.4.15', '0.4.15', 31, 20],
].map(([fit, fly, d, z]) => ({ arm: `AP(${d},${z})@${fit}${fly !== fit ? `>${fly}` : ''}`, fit, fly, d, z }));

const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const asc = (a, b) => a - b;
const pct = (s, p) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
const round = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsOf = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f))) : []);
const keyDate = (key) => key.split('|')[2];

// ---------------------------------------------------------------- table ----------------------------------------------------------------
function table(rows) {
  const main = rows.filter((r) => r.part === 'main');
  const stored = JSON.parse(fs.readFileSync(STORED, 'utf8'));
  const storedBy = new Map(stored.windows.map((w) => [w.key, w.arms]));
  const published = JSON.parse(fs.readFileSync(CELLS, 'utf8')).rows.filter((r) => r.regime === 'Highly elliptical' && r.reference === 'truth' && r.level === 'regime');
  const e = (r, score, day) => r?.scores?.[score]?.days?.[day]?.e;
  const fits = [...new Set(main.map((r) => r.fit))].sort(asc);
  // Control: CC per window equals the stored before value, NN the stored after value, rounded as stored.
  const control = { compared: 0, misses: [] };
  for (const r of main) {
    const column = COLUMNS.find(([, c]) => c === r.arm)?.[0], want = storedBy.get(r.key)?.[`${column}${r.fit}`];
    for (const d of DAYS) {
      if (!want?.[d]) continue;
      for (const [score, at] of [['CC', 0], ['NN', 1]]) {
        control.compared += 1;
        if (round(e(r, score, d)) !== want[d][at]) control.misses.push(`${r.key} ${column}${r.fit} day ${d} ${score}: ${round(e(r, score, d))} against ${want[d][at]}`);
      }
    }
  }
  const cellOf = (list, arm, fit, day, score) => {
    const v = list.filter((r) => r.arm === arm && r.fit === fit).map((r) => e(r, score, day)).filter(Number.isFinite).sort(asc);
    return v.length ? [round(pctCompare(v, 0.5)), round(pctCompare(v, 0.95)), v.length] : null;
  };
  // cells.json's TESS rows from CC: the medians and 95th percentiles as compare-cells.mjs computes them (lib/compare.mjs pct).
  const cellsMisses = [];
  for (const row of published) for (const [column, code] of COLUMNS) {
    const v = main.filter((r) => r.arm === code && r.fit === row.fit).map((r) => e(r, 'CC', String(row.lead / 24))).filter(Number.isFinite).sort(asc);
    const mine = v.length ? [round(pctCompare(v, 0.5)), round(pctCompare(v, 0.95)), v.length] : null;
    if (JSON.stringify(mine) !== JSON.stringify(row.arms[column] ?? null)) cellsMisses.push(`fit ${row.fit} lead ${row.lead} ${column}: ${JSON.stringify(mine)} against ${JSON.stringify(row.arms[column])}`);
  }
  const cells = fits.flatMap((fit) => DAYS.map((day) => ({
    fit, lead: Number(day) * 24,
    arms: Object.fromEntries(COLUMNS.map(([column, code]) => [column, Object.fromEntries(SCORES.map((s) => [s, cellOf(main, code, fit, day, s)]))])),
  })));
  // Per arm, the 72 h worsening on the four windows: NN - CC, CN - CC, median over the four.
  const four = (list, arm, fit, day, f) => median(list.filter((r) => r.arm === arm && r.fit === fit && FOUR.includes(keyDate(r.key))).map(f).filter(Number.isFinite));
  const worsening = (list, arm, fit = 72) => Object.fromEntries(['3', '7'].map((d) => [d, {
    cc: four(list, arm, fit, d, (r) => e(r, 'CC', d)), cn: four(list, arm, fit, d, (r) => e(r, 'CN', d)), nn: four(list, arm, fit, d, (r) => e(r, 'NN', d)), ns: four(list, arm, fit, d, (r) => e(r, 'NS', d)),
    delta: four(list, arm, fit, d, (r) => e(r, 'NN', d) - e(r, 'CC', d)), fitPart: four(list, arm, fit, d, (r) => e(r, 'NN', d) - e(r, 'CN', d)), scorePart: four(list, arm, fit, d, (r) => e(r, 'CN', d) - e(r, 'CC', d)),
  }]));
  const mainWorse = Object.fromEntries(COLUMNS.map(([column, code]) => [column, worsening(main, code)]));
  const ablate = rows.filter((r) => r.part === 'ablate');
  const ablations = [...new Set(ablate.map((r) => r.arm))].map((arm) => ({ arm, windows: ablate.filter((r) => r.arm === arm && r.ok).length, sha256: ablate.find((r) => r.arm === arm)?.sha256 ?? null, worse: worsening(ablate, arm),
    all: Object.fromEntries(['1', '3', '7'].map((d) => [d, { cc: median(ablate.filter((r) => r.arm === arm).map((r) => e(r, 'CC', d))), nn: median(ablate.filter((r) => r.arm === arm).map((r) => e(r, 'NN', d))) }])) }));
  const stepRows = rows.filter((r) => r.part === 'steps');
  const windows = [...new Set(main.map((r) => r.key))].sort().map((key) => {
    const s = stepRows.find((r) => r.key === key);
    const at = (arm, d, score) => e(main.find((r) => r.key === key && r.arm === arm && r.fit === 72), score, d);
    return { key, four: FOUR.includes(keyDate(key)), steps: s?.steps ?? [], switches: s?.switches ?? null, effect: s?.effect ?? null,
      errors: Object.fromEntries(['AP', 'XP', 'F'].map((a) => [a, Object.fromEntries(['3', '7'].map((d) => [d, { cc: round(at(a, d, 'CC')), cn: round(at(a, d, 'CN')), nn: round(at(a, d, 'NN')), ns: round(at(a, d, 'NS')) }]))])) };
  });
  const nodes = { scored: main.reduce((s, r) => s + (r.scores?.NN?.epochs ?? 0), 0), offNode: main.reduce((s, r) => s + (r.scores?.NN?.offNode ?? 0) + (r.scores?.CN?.offNode ?? 0), 0), interpolated: 0, nearest: main.reduce((s, r) => s + (r.scores?.NN?.nearest ?? 0), 0), leadsOnNode: main.every((r) => r.scores?.NN?.leadsOnNode !== false) };
  return { control: { ...control, cellsMisses }, nodes, cells, mainWorse, ablations, windows };
}
// lib/compare.mjs's percentile, as compare-cells.mjs takes it.
let pctCompare = pct;

const f = (x, k = 2) => (x === null || x === undefined || !Number.isFinite(x) ? '-' : x.toFixed(k));
function verdict(t) {
  const big = (w) => ['3', '7'].some((d) => w[d].cc && w[d].nn > 1.1 * w[d].cc);
  // the worsening on all 7 windows' medians (the registered definition) for AP, XP and FFM at the 72 h fit
  const allMed = (column, d) => { const c = t.cells.find((x) => x.fit === 72 && x.lead === Number(d) * 24)?.arms[column]; return c && c.CC && c.NN ? { cc: c.CC[0], nn: c.NN[0] } : null; };
  const worse = ['AP', 'XP', 'FFM20'].filter((column) => ['3', '7'].some((d) => { const m = allMed(column, d); return m && m.nn > 1.1 * m.cc; }));
  const share = (column, d) => { const w = t.mainWorse[column][d]; return w.delta ? w.fitPart / w.delta : null; };
  const apDelta = t.mainWorse.AP;
  const moves = t.ablations.map((a) => ({ arm: a.arm, d3: a.worse['3'].delta, d7: a.worse['7'].delta, m3: apDelta['3'].delta ? a.worse['3'].delta / apDelta['3'].delta - 1 : null, m7: apDelta['7'].delta ? a.worse['7'].delta / apDelta['7'].delta - 1 : null }));
  const involved = moves.filter((x) => Math.abs(x.m3 ?? 0) > 0.25 || Math.abs(x.m7 ?? 0) > 0.25);
  const wide = involved.some((x) => x.arm === 'AP(0,20)@0.5.1') || (() => { const a = t.ablations.find((x) => x.arm === 'AP(31,20)@0.4.14'), b = t.ablations.find((x) => x.arm === 'AP(31,20)@0.4.15'); return a && b && ['3', '7'].some((d) => b.worse[d].delta && Math.abs(a.worse[d].delta / b.worse[d].delta - 1) > 0.25); })();
  const alike = ['XP', 'FFM20'].every((c) => ['3', '7'].some((d) => t.mainWorse[c][d].delta > 0.5 * apDelta[d].delta));
  // a step explains: its module effect at least half the NN error at days 3 and 7 on each of the four windows (AP, XP and FFM)
  const stepOk = t.windows.filter((w) => w.four).every((w) => w.effect && ['AP', 'XP', 'F'].every((a) => ['3', '7'].every((d) => w.effect[d] >= 0.5 * w.errors[a][d].nn)));
  const fitSide = ['AP', 'XP', 'FFM20'].every((c) => ['3', '7'].some((d) => (share(c, d) ?? 0) >= 0.5));
  // an ablation that returns NN within 25 % of CC (medians over the four windows, days 3 and 7)
  const returns = t.ablations.filter((a) => ['3', '7'].every((d) => apDelta[d].cc && Math.abs(a.worse[d].nn / apDelta[d].cc - 1) <= 0.25)).map((a) => a.arm);
  return { worse, gone: !worse.length, fitSide, involved: involved.map((x) => x.arm), wide: wide && !alike, alike, stepOk, returns, moves, explained: !worse.length || (fitSide && (stepOk || returns.length > 0)) };
}

function readme(doc) {
  const v = doc.rule;
  const cell = (x) => (x ? `${x[0]} (${x[1]})` : '-');
  const lines = [];
  lines.push('# TESS re-scored on the ten-minute nodes', '');
  lines.push(`Registration: experiments/operator-theory/TESS-RESCORE.md. 7 windows (cutoffs 2026-07-27 to 09-07, weekly), fits of 72 h and 336 h, vacuum; every arm on its cells.json build. Report only.`);
  lines.push(`CC: fit and scored on the chord-filled series (300 s; cells.json's figures). NN: fit and scored on the kernels' ten-minute nodes only. CN: the chord fit scored on the nodes.`);
  lines.push(`NS: the NN fit scored on one kernel only (the newest file that covers the whole forecast; no solution switch inside). Median km (95th percentile km) over the windows of each lead day's 3D RMS.`, '');
  lines.push(`Control: ${doc.control.compared - doc.control.misses.length} of ${doc.control.compared} window values equal the stored before (CC) and after (NN) values of results/ap-truth/tess-nodes-20261105.json; cells.json's TESS cells from CC: ${doc.control.cellsMisses.length ? `${doc.control.cellsMisses.length} differ` : 'equal'}.`);
  lines.push(`Nodes: ${doc.nodes.scored} NN epochs scored, ${doc.nodes.offNode} off the node lattice, ${doc.nodes.nearest} at a nearest node, ${doc.nodes.interpolated} interpolated. The lead ends (24, 48, 72, 168 h, 00:00 UTC) land exactly on nodes: ${doc.nodes.leadsOnNode ? 'yes, every window' : 'no'}.`, '');
  lines.push('| Fit h | Lead h | Arm | CC | CN | NN | NS | NN - CC (median) |', '|---:|---:|---|---|---|---|---|---:|');
  for (const c of doc.cells) for (const [column] of COLUMNS) { const a = c.arms[column]; lines.push(`| ${c.fit} | ${c.lead} | ${column} | ${cell(a.CC)} | ${cell(a.CN)} | ${cell(a.NN)} | ${cell(a.NS)} | ${a.CC && a.NN ? round(a.NN[0] - a.CC[0]) : '-'} |`); }
  lines.push('', '## The day-3/7 worsening (72 h fit; the four windows 07-27, 08-10, 08-24, 09-07; medians over the four, km)', '');
  lines.push('| Arm | Day | CC | CN | NN | NS | NN - CC | of it, the fit (NN - CN) | of it, the scoring (CN - CC) |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [column] of COLUMNS) for (const d of ['3', '7']) { const w = doc.mainWorse[column][d]; lines.push(`| ${column} | ${d} | ${f(w.cc)} | ${f(w.cn)} | ${f(w.nn)} | ${f(w.ns)} | ${f(w.delta)} | ${f(w.fitPart)} | ${f(w.scorePart)} |`); }
  lines.push('', '## AP ablations (72 h fit; NN - CC median over the four windows, and the medians over all 7)', '');
  lines.push('| Arm | Windows | build SHA-256 | Day 3 NN - CC | Day 7 NN - CC | Day 1 CC / NN (7) | Day 3 CC / NN (7) | Day 7 CC / NN (7) |', '|---|---:|---|---:|---:|---|---|---|');
  for (const a of doc.ablations) lines.push(`| ${a.arm} | ${a.windows} | ${a.sha256 ? a.sha256.split(',').map((x) => x.slice(0, 12)).join(' > ') : '-'} | ${f(a.worse['3'].delta)} | ${f(a.worse['7'].delta)} | ${f(a.all['1'].cc)} / ${f(a.all['1'].nn)} | ${f(a.all['3'].cc)} / ${f(a.all['3'].nn)} | ${f(a.all['7'].cc)} / ${f(a.all['7'].nn)} |`);
  lines.push('', '## Windows: switches, velocity steps and their effect (72 h fit)', '');
  lines.push('| Cutoff | Four | Switches in arc / forecast | Velocity steps (epoch, radius km, |dv| mm/s, where) | Step effect day 3 / 7 (km) | AP CC / CN / NN day 3 | AP day 7 | XP day 7 | FFM day 3 | FFM day 7 |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const w of doc.windows) {
    const st = w.steps.map((s) => `${s.epoch.slice(5, 16)} ${Math.round(s.radiusKm)} ${f(s.dvMmS, 1)} ${s.where}`).join('; ') || 'none';
    const tri = (x) => `${f(x.cc)} / ${f(x.cn)} / ${f(x.nn)}`;
    lines.push(`| ${keyDate(w.key)} | ${w.four ? 'yes' : ''} | ${w.switches ? `${w.switches.arc} / ${w.switches.forecast}` : '-'} | ${st} | ${w.effect ? `${f(w.effect['3'])} / ${f(w.effect['7'])}` : '-'} | ${tri(w.errors.AP['3'])} | ${tri(w.errors.AP['7'])} | ${tri(w.errors.XP['7'])} | ${tri(w.errors.F['3'])} | ${tri(w.errors.F['7'])} |`);
  }
  lines.push('', '## Verdict', '');
  if (doc.verdict) lines.push(doc.verdict, '');
  lines.push(`Rule: worsening (NN above CC by more than 10 % at day 3 or 7, 72 h fit, 7-window median) in ${v.worse.length ? v.worse.join(', ') : 'no arm'}; fit side (NN - CN at least half of NN - CC for AP, XP and FFM): ${v.fitSide ? 'yes' : 'no'};`);
  lines.push(`ablations moving AP's worsening by more than 25 %: ${v.involved.length ? v.involved.join(', ') : 'none'}; XP and FFM worsen alike: ${v.alike ? 'yes' : 'no'}; wide tesseral series involved: ${v.wide ? 'yes' : 'no'};`);
  lines.push(`a step's module effect at least half the NN error at days 3 and 7 on each of the four windows: ${v.stepOk ? 'yes' : 'no'}; an ablation returning NN within 25 % of CC: ${v.returns.length ? v.returns.join(', ') : 'none'}.`);
  lines.push(`Condition 1, clean re-score: ${doc.clean ? 'holds' : 'does not hold'}. Condition 2, worsening explained: ${v.explained ? 'holds' : 'does not hold'}. TESS: ${doc.clean && v.explained ? 'a site record may restore it' : 'stays withheld'}.`);
  return `${lines.join('\n')}\n`;
}

if (args.check || args.table) {
  pctCompare = (await import('./lib/compare.mjs')).pct;
  const rows = rowsOf(STORE);
  const t = table(rows);
  const rule = verdict(t);
  const clean = t.control.misses.length === 0 && t.control.cellsMisses.length === 0 && t.nodes.offNode === 0 && t.nodes.interpolated === 0 && t.nodes.leadsOnNode && t.cells.every((c) => COLUMNS.every(([col]) => c.arms[col].NN));
  const fails = [];
  if (!t.control.compared) fails.push('no control rows');
  if (t.control.misses.length) fails.push(`control: ${t.control.misses.length} of ${t.control.compared} off (${t.control.misses.slice(0, 3).join('; ')})`);
  if (t.control.cellsMisses.length) fails.push(`cells.json: ${t.control.cellsMisses.slice(0, 3).join('; ')}`);
  if (t.nodes.offNode || t.nodes.interpolated) fails.push(`${t.nodes.offNode} NN epochs off the nodes, ${t.nodes.interpolated} interpolated`);
  if (args.table) {
    fs.mkdirSync(OUT, { recursive: true });
    const doc = { registration: 'experiments/operator-theory/TESS-RESCORE.md', rows: rows.length, ...t, rule, clean, verdict: args.verdict ? fs.readFileSync(args.verdict, 'utf8').trim() : null };
    fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);
    fs.writeFileSync(path.join(OUT, 'README.md'), readme(doc));
    console.log('table.json written');
  } else {
    const have = JSON.parse(fs.readFileSync(path.join(OUT, 'table.json'), 'utf8'));
    for (const k of ['control', 'nodes', 'cells', 'mainWorse', 'ablations', 'windows', 'rule']) if (JSON.stringify(have[k]) !== JSON.stringify(k === 'rule' ? rule : t[k])) fails.push(`table.json ${k} differs from the rows`);
    if (fs.readFileSync(path.join(OUT, 'README.md'), 'utf8') !== readme({ ...have, ...t, rule, clean })) fails.push('README.md differs from the rows');
  }
  const c = (col, d) => t.cells.find((x) => x.fit === 72 && x.lead === d * 24)?.arms[col];
  const fig = (col) => [1, 3, 7].map((d) => `day ${d} ${c(col, d)?.NN?.[0]} (chord ${c(col, d)?.CC?.[0]})`).join(', ');
  const line = `72 h fit, NN median km: AP ${fig('AP')}; FFM ${fig('FFM20')}; control ${t.control.compared - t.control.misses.length}/${t.control.compared}; ${t.nodes.scored} node epochs, ${t.nodes.interpolated} interpolated; clean ${clean ? 'yes' : 'no'}, explained ${rule.explained ? 'yes' : 'no'}`;
  if (fails.length) { console.log(`TESS RESCORE CHECK FAIL: ${fails.join('; ')}; ${line}`); process.exit(1); }
  console.log(`TESS RESCORE CHECK PASS: ${line}`);
  process.exit(0);
}

if (!args.run) throw new Error('--run, --table or --check');
// ---------------------------------------------------------------- flight ----------------------------------------------------------------
const { pathToFileURL } = await import('node:url');
const { execFileSync } = await import('node:child_process');
const { config, root, iso, ms, rms, XM } = await import('./lib/xp2.mjs');
const { openSgp4Fit } = await import('./lib/xp2.mjs');
const { apForces, openAp, fitPcf, standalone } = await import('./lib/ap.mjs');
const { openUssfXp } = await import('./lib/ussf-xp.mjs');
const { openFfmHost, openAxes, apriori } = await import('./lib/host.mjs');
const { TESS, windowKey } = await import('./lib/regimes.mjs');
const { modulesRoot } = await import('../xp-atmosphere-merit/common.mjs');
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const SPK = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
const { openContainers, readSpk } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/containers.mjs')).href);
const { openTime, convertAll } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/timeconv.mjs')).href);
const { withT } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/windows.mjs')).href);
const { gate } = await import(pathToFileURL(path.join(root, 'harness/truth-gate.mjs')).href);
const PARTS = (args.parts ?? 'main,ablate,steps').split(',');
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage, LEADS = XM.config.scoring.leadDays;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

/** spkObjectSeries (spk-sources.mjs) with `nodes` false: every record of each segment (the reader cells.json read), else each segment's nodes. Selection only. */
async function seriesOf(files, nodes, containers, time) {
  const parse = (text) => Date.parse(`${/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)/.exec(text)[1]}Z`);
  const byKey = new Map();
  for (const file of files) {
    const read = await readSpk(containers, file);
    if (read.error) throw new Error(`${path.basename(file)}: ${read.error}`);
    for (const block of read.oem.EPHEMERIS_DATA_BLOCK) {
      if (block.EPHEMERIS_DATA?.length) throw new Error(`${path.basename(file)}: a binary segment; this script reads record lines only`);
      const all = (block.EPHEMERIS_DATA_LINES ?? []).map((l) => ({ tdb: l.EPOCH, r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] }));
      for (const row of nodes ? SPK.nodeRows(all) : all) {
        const t = parse(row.tdb);
        if (t + 130000 < Date.parse(TESS.from) || t - 130000 > Date.parse(TESS.to)) continue;
        byKey.set(Math.round(t / 1000), row);
      }
    }
  }
  const rows = [...byKey.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  const utc = await convertAll(time, rows.map((x) => x.tdb));
  const lines = rows.map((x, i) => ({ epoch: utc[i], r: x.r, v: x.v })).filter((l) => Date.parse(l.epoch) >= Date.parse(TESS.from) && Date.parse(l.epoch) <= Date.parse(TESS.to));
  lines.sort((a, b) => Date.parse(a.epoch) - Date.parse(b.epoch));
  const unique = [];
  for (const l of lines) if (!unique.length || Date.parse(l.epoch) - Date.parse(unique.at(-1).epoch) >= 500) unique.push(l);
  return withT({ source: 'ap6-heo', id: 'TESS (-95)', norad: TESS.norad, name: TESS.name, objectId: '', originator: 'NAIF SPK', creation: '', frame: 'EME2000', timeSystem: 'UTC', lines: gate(unique, { product: 'ap6-heo', norad: TESS.norad }).kept });
}
/** all-regimes.mjs spkOnGrid: whole seconds on the 300 s grid from the first state, EME2000 to GCRF by foundation/frames. */
async function onGrid(lines, axes) {
  const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  return axes.convert(norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() })), 'EME2000', 'GCRF');
}
/** A series' window: the forecast grid and bins, all-regimes.mjs's rule, and its fit arcs. */
function windowOf(lines, D0) {
  const times = lines.map((l) => ms(l.epoch));
  const stepMs = times[1] - times[0], gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs), minBin = Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
  const between = (a, b) => { const out = []; for (let i = 0; i < times.length; i += 1) if (times[i] >= a && times[i] <= b) out.push(lines[i]); return out; };
  const after = between(D0 + 1, D0 + 7 * DAY), first = ms(after[0].epoch);
  const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
  const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
  const entered = LEADS.filter((k) => bins[k].length >= minBin);
  const scored = entered.flatMap((k) => bins[k]);
  const arc = (hours) => { const raw = between(D0 - hours * HOUR, D0); const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
  return { gridMs, entered, sizes: entered.map((k) => bins[k].length), epochs: scored.map((l) => l.epoch), truth: scored.map((l) => ({ r: l.r, v: l.v })), arc };
}

const m = await openModules();
const A = await openAp(), G = await openSgp4Fit(), F = await openFfmHost(), U = await openUssfXp();
const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: null }), PCF_XP = fitPcf({ forces: {}, fit: null });
const ffmHigh = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
});

/** A grid's score: per entered lead bin the RTN 3D RMS (km), the bin's epochs, whether they sit on nodes, and the error at the lead end. */
async function score(states, w, frame) {
  const ric = await m.rtn(frame === 'GCRF' ? states : await m.toAxes(states, w.epochs, 'GCRF'), w.truth);
  const days = {}, leadEnd = {};
  let i = 0;
  w.entered.forEach((k, j) => {
    const s = ric.slice(i, i + w.sizes[j]);
    const axis = [0, 1, 2].map((c) => rms(s.map((q) => q[c])));
    days[k] = { e: Math.hypot(...axis), r: axis[0], t: axis[1], n: axis[2], samples: w.sizes[j] };
    const endIdx = i + w.sizes[j] - 1;
    if (w.epochs[endIdx] && ms(w.epochs[endIdx]) === Date.parse(w.cutoffIso) + k * DAY) leadEnd[k] = Math.hypot(...ric[endIdx]);
    i += w.sizes[j];
  });
  const offNode = w.epochs.filter((e) => (ms(e) / 1000) % NODE_S !== 0).length;
  return { days, leadEnd, epochs: w.epochs.length, offNode, leadsOnNode: w.entered.every((k) => Number.isFinite(leadEnd[k])) };
}
/** One arm on one arc: fit, then a flight per grid asked. Returns { fit report, fly(w) -> score }. */
async function armOn(arm, thin, D0) {
  const oem = S.oemBytes({ frame: 'GCRF', object: { name: TESS.name, id: TESS.objectId, norad: TESS.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
  if (arm === 'AP' || arm === 'XP') {
    const f = await A.fit(oem, arm === 'AP' ? PCF_AP : PCF_XP, undefined);
    if (!f.ok) throw new Error(f.error);
    return async (w) => score(await A.propagate(f.ocm, w.epochs, w.epochs.length), w, 'TEME');
  }
  if (arm === 'U') {
    const f = await U.fit(oem);
    if (!f.ok) throw new Error(f.error);
    return async (w) => score(await U.propagate(f.ocm, w.epochs, w.epochs.length), w, 'TEME');
  }
  if (arm === 'S') {
    const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: TESS.name, objectId: TESS.objectId });
    return async (w) => {
      const flown = await m.propagateSgp4(el, TESS.norad, w.epochs.map(ms), w.gridMs / 1000);
      if (flown.filter(Boolean).length !== flown.length) throw new Error('SGP4 returned a gap');
      return score(flown, w, 'TEME');
    };
  }
  if (arm === 'F') {
    const settings = ffmHigh();
    const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, undefined, D0);
    if (!f.state) throw new Error(f.error ?? f.termination);
    return async (w) => score(await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, w.epochs, settings, undefined), w, 'GCRF');
  }
  throw new Error(`arm ${arm}`);
}

// propagator/sdn-ap by build (ablations): the $OCM path from 0.5.0, the $OMM path before (themis-roughness.mjs).
const harnesses = new Map();
async function apBuild(version) {
  if (harnesses.has(version)) return harnesses.get(version);
  const b = BUILDS[version];
  const h = await standalone('propagator/sdn-ap', { modulesCommit: b.commit, wasmSha256: b.sha256 });
  const call = async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r.outputs; };
  const port = (outs, id) => new Uint8Array(outs.find((o) => o.portId === id).payload);
  const api = {
    pcf: (d, z) => (b.api === 'ocm' ? fitPcf({ forces: apForces({ tesseral: d, zonal: z, atmosphere: false }), fit: null }) : S.pcfBytes({ forces: apForces({ tesseral: d, zonal: z, atmosphere: false }), fit: null })),
    fit: async (oem, pcf) => port(await call('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }]), 'elements'),
    fly: b.api === 'ocm'
      ? async (set, epochs) => S.oemLines(port(await call('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }]), 'ephemeris'))
      : async (set, epochs, pcf) => S.oemLines(port(await call('propagate', [{ portId: 'omm', typeRef: S.TYPE('OMM'), payload: set }, { portId: 'grid', typeRef: S.TYPE('OEM'), payload: S.gridBytes(epochs) }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }]), 'ephemeris')),
  };
  harnesses.set(version, api);
  return api;
}
async function ablationOn(a, thin, D0) {
  const oem = S.oemBytes({ frame: 'GCRF', object: { name: TESS.name, id: TESS.objectId, norad: TESS.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
  const Fb = await apBuild(a.fit), Pb = await apBuild(a.fly);
  if (BUILDS[a.fit].api !== BUILDS[a.fly].api) throw new Error('fit and flight on different record paths');
  const pcf = Fb.pcf(a.d, a.z), set = await Fb.fit(oem, pcf);
  return async (w) => { const st = await Pb.fly(set, w.epochs, pcf); if (st.length !== w.epochs.length) throw new Error(`flight returned ${st.length} of ${w.epochs.length}`); return score(st, w, 'TEME'); };
}

// ---- the series ----
const files = fs.readdirSync(TESS.dir).filter((x) => /^TESS_EPH_DEF_.*\.bsp$/.test(x)).sort().map((x) => path.join(TESS.dir, x));
const containers = await openContainers(process.env.SDN_MODULES_ROOT), time = await openTime(process.env.SDN_MODULES_ROOT), axes = await openAxes();
const nodeSeries = await seriesOf(files, true, containers, time), chordSeries = await seriesOf(files, false, containers, time);
const reader = await SPK.spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1, containers, time });
if (JSON.stringify(reader.lines) !== JSON.stringify(nodeSeries.lines)) throw new Error('the N series differs from spkObjectSeries');
const N = await onGrid(nodeSeries.lines, axes), C = await onGrid(chordSeries.lines, axes);
// Each file's first state (UTC): the solution switches, and each file's own span for the single-kernel truth.
const spans = [];
for (const file of files) { const r = await readSpk(containers, file); const b = r.oem.EPHEMERIS_DATA_BLOCK; spans.push({ file, start: b[0].START_TIME, stop: b.at(-1).STOP_TIME }); }
const conv = await convertAll(time, spans.flatMap((s) => [s.start, s.stop]));
spans.forEach((s, i) => { s.startMs = ms(conv[2 * i]); s.stopMs = ms(conv[2 * i + 1]); });
const switches = spans.slice(1).map((s) => s.startMs);
const singles = new Map();
async function singleFor(D0) { // the newest file that covers (D0, D0 + 7 d], nodes only, on the grid
  const s = [...spans].reverse().find((x) => x.startMs <= D0 && x.stopMs >= D0 + 7 * DAY);
  if (!s) return null;
  if (!singles.has(s.file)) singles.set(s.file, { file: path.basename(s.file), lines: await onGrid((await seriesOf([s.file], true, containers, time)).lines, axes) });
  return singles.get(s.file);
}

fs.mkdirSync(STORE, { recursive: true });
const outFile = path.join(STORE, `rows-${SHARD}.jsonl`);
const done = new Set(rowsOf(STORE).map((r) => `${r.part}#${r.key}#${r.arm}#${r.fit}`));
const inShard = (key) => (!args.only || key === args.only) && parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
const emit = (row) => { fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`); done.add(`${row.part}#${row.key}#${row.arm}#${row.fit}`); };

for (const D0 of TESS.cutoffs) {
  const key = windowKey('HE', TESS.name, D0);
  if (!inShard(key)) continue;
  const wC = { ...windowOf(C, D0), cutoffIso: iso(D0) }, wN = { ...windowOf(N, D0), cutoffIso: iso(D0) };
  const single = await singleFor(D0), wS = single ? { ...windowOf(single.lines, D0), cutoffIso: iso(D0) } : null;
  const flyAll = async (makeC, makeN) => {
    const scores = {};
    const errors = {};
    try { const flyC = await makeC(); scores.CC = await flyC(wC); scores.CN = await flyC(wN); } catch (error) { errors.C = String(error?.message ?? error).slice(0, 200); }
    try { const flyN = await makeN(); scores.NN = await flyN(wN); if (wS) scores.NS = await flyN(wS); } catch (error) { errors.N = String(error?.message ?? error).slice(0, 200); }
    return { scores, errors };
  };
  if (PARTS.includes('main')) for (const fit of TESS.arcs) for (const arm of (args.arms ?? 'AP,XP,S,F,U').split(',')) {
    if (done.has(`main#${key}#${arm}#${fit}`)) continue;
    const t0 = Date.now(), thinC = wC.arc(fit), thinN = wN.arc(fit);
    const { scores, errors } = await flyAll(async () => armOn(arm, thinC ?? (() => { throw new Error('coverage'); })(), D0), async () => armOn(arm, thinN ?? (() => { throw new Error('coverage'); })(), D0));
    emit({ part: 'main', key, cutoff: iso(D0), arm, fit, arcStates: { C: thinC?.length ?? 0, N: thinN?.length ?? 0 }, single: single?.file ?? null, ok: !!scores.CC && !!scores.NN, scores, errors, seconds: (Date.now() - t0) / 1000 });
    console.error(`${key} ${arm}${fit}: day 7 CC ${scores.CC?.days?.[7]?.e?.toFixed(3)} NN ${scores.NN?.days?.[7]?.e?.toFixed(3)} (${((Date.now() - t0) / 1000).toFixed(0)} s)${Object.keys(errors).length ? ` ${JSON.stringify(errors)}` : ''}`);
  }
  if (PARTS.includes('ablate')) for (const a of ABLATIONS) {
    if (done.has(`ablate#${key}#${a.arm}#72`)) continue;
    const t0 = Date.now(), thinC = wC.arc(72), thinN = wN.arc(72);
    const { scores, errors } = await flyAll(async () => ablationOn(a, thinC, D0), async () => ablationOn(a, thinN, D0));
    emit({ part: 'ablate', key, cutoff: iso(D0), arm: a.arm, fit: 72, sha256: [...new Set([BUILDS[a.fit].sha256, BUILDS[a.fly].sha256])].join(','), ok: !!scores.CC && !!scores.NN, scores, errors, seconds: (Date.now() - t0) / 1000 });
    console.error(`${key} ${a.arm}: day 7 CC ${scores.CC?.days?.[7]?.e?.toFixed(3)} NN ${scores.NN?.days?.[7]?.e?.toFixed(3)}${Object.keys(errors).length ? ` ${JSON.stringify(errors)}` : ''}`);
  }
  if (PARTS.includes('steps') && !done.has(`steps#${key}#steps#72`)) {
    // Velocity steps on the node series: TRUTH-SERIES.md's residual above 0.5 m, away from a switch; |dv| about 2 x residual / h.
    const t = N.map((l) => ms(l.epoch)), flagged = [];
    for (let i = 1; i + 1 < N.length; i += 1) {
      const h = (t[i] - t[i - 1]) / 1000;
      if (h !== NODE_S || t[i + 1] - t[i] !== NODE_S * 1000) continue;
      if (switches.some((x) => t[i - 1] < x && x <= t[i + 1])) continue;
      const res = 1000 * Math.hypot(...[0, 1, 2].map((k) => N[i + 1].r[k] - 2 * N[i].r[k] + N[i - 1].r[k] - ((N[i + 1].v[k] - N[i - 1].v[k]) * h) / 2));
      if (res > 0.5) flagged.push({ i, res });
    }
    const steps = [];
    for (let j = 0; j < flagged.length; j += 1) { // a step between nodes i and i + 1 flags both: one step per pair
      const a = flagged[j], b = flagged[j + 1];
      if (b && b.i === a.i + 1) { steps.push({ before: a.i, after: b.i, res: Math.max(a.res, b.res) }); j += 1; } else steps.push({ before: a.i, after: a.i, res: a.res });
    }
    const lo = D0 - 72 * HOUR, hi = D0 + 7 * DAY;
    const mine = steps.filter((s) => t[s.after] >= lo && t[s.before] <= hi).map((s) => ({ ...s, epoch: N[s.before].epoch, radiusKm: Math.hypot(...N[s.before].r), dvMmS: (2 * s.res / NODE_S) * 1000,
      where: t[s.after] <= D0 ? `arc, ${((D0 - t[s.before]) / HOUR).toFixed(1)} h before the cutoff` : `forecast, ${((t[s.before] - D0) / HOUR).toFixed(1)} h after the cutoff` }));
    const sw = { arc: switches.filter((x) => x > lo && x <= D0).length, forecast: switches.filter((x) => x > D0 && x <= hi).length };
    // Each step's effect by module: FFM fits on the 24 h of nodes before and after it (none of the window's other steps or a switch inside), both flown on the
    // window's node grid after the step; per lead day, the 3D RMS of one flight against the other over the bin (epochs before the step count 0).
    const effects = [];
    for (const s of mine) {
      const pre = N.filter((l, i) => i <= s.before && t[i] >= t[s.before] - DAY), post = N.filter((l, i) => i >= s.after && t[i] <= t[s.after] + DAY);
      const clean = (list) => !switches.some((x) => ms(list[0].epoch) < x && x <= ms(list.at(-1).epoch)) && !mine.some((o) => o !== s && ms(list[0].epoch) <= ms(N[o.before].epoch) && ms(N[o.after].epoch) <= ms(list.at(-1).epoch));
      const e = { epoch: s.epoch, cleanArcs: clean(pre) && clean(post) };
      try {
        const settings = ffmHigh();
        const fa = await F.fit(pre, [...pre[0].r, ...pre[0].v], settings, undefined, ms(pre.at(-1).epoch));
        const fb = await F.fit(post, [...post[0].r, ...post[0].v], settings, undefined, ms(post.at(-1).epoch));
        if (!fa.state || !fb.state) throw new Error(`fit: ${fa.termination ?? fa.error} / ${fb.termination ?? fb.error}`);
        const later = wN.epochs.filter((x) => ms(x) >= t[s.after]);
        const days = {};
        if (later.length) {
          const A1 = await F.forecast({ epoch: fa.epoch, state: fa.state, parameters: fa.parameters }, later, settings, undefined);
          const B1 = await F.forecast({ epoch: fb.epoch, state: fb.state, parameters: fb.parameters }, later, settings, undefined);
          const diff = await m.rtn(B1, A1.map((x) => ({ r: x.r, v: x.v })));
          const byEpoch = new Map(later.map((x, i) => [x, Math.hypot(...diff[i])]));
          let i = 0;
          wN.entered.forEach((k, j) => { const bin = wN.epochs.slice(i, i + wN.sizes[j]); i += wN.sizes[j]; days[k] = Math.sqrt(bin.reduce((acc, x) => acc + (byEpoch.get(x) ?? 0) ** 2, 0) / bin.length); });
        } else wN.entered.forEach((k) => { days[k] = 0; });
        Object.assign(e, { days, preFitOk: !!fa.ok, postFitOk: !!fb.ok });
      } catch (error) { e.error = String(error?.message ?? error).slice(0, 200); }
      effects.push(e);
    }
    // the window's step effect per day: the root sum square of its steps' effects (each step's own difference flight)
    const effect = Object.fromEntries(['1', '2', '3', '7'].map((k) => [k, Math.sqrt(effects.reduce((acc, x) => acc + (x.days?.[k] ?? 0) ** 2, 0))]));
    emit({ part: 'steps', key, cutoff: iso(D0), arm: 'steps', fit: 72, ok: true, steps: mine.map(({ before, after, ...x }) => x), switches: sw, effects, effect });
    console.error(`${key} steps: ${mine.map((s) => `${s.epoch} ${s.dvMmS.toFixed(1)} mm/s ${s.where}`).join('; ')}; effect day 3 ${effect['3'].toFixed(3)} day 7 ${effect['7'].toFixed(3)} km`);
  }
}
await containers.destroy(); await time.destroy(); await axes.close(); await F?.close(); await m.close?.();
console.error(`shard ${SHARD}/${SHARDS}: done`);
process.exit(0);
