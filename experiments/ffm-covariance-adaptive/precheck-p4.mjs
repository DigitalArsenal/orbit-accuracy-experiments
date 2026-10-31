// P4 (PLAN.md section 5): C3-0 under C2's chain reproduces fit-R*.json, errors and terms, and bridges to the pin.
//   P4a, on C2's exact chain (C2's three wasm by git show, build.json c2): the frozen candidate's cells of fit-R3, fit-R2 and fit-R2-O recomputed from C2's stored rows equal the receipts; 20 windows
//        per class replayed bit for bit, through C2's own lib/products.mjs and through lib/terms.mjs; R2-O's 238 refused calibration windows counted per reason.
//   P4b, the same windows on the pin: R3 state and errors bit-identical, |delta(d2/3)| <= 1e-9; R2 |delta(d2/3)| <= 1e-3 + 1e-3 x d2/3; a class-fit termination may change only to CONVERGED;
//        pair_statistics, noise_responses and dcp_covariance on gp-error-model 0.11.0 bit-identical to 0.10.0 on the same inputs. Any failure is stop and ask; the limits do not move.
// Windows: per class the 20 stored windows of C3's calibration satellites, with a converged fit and stored terms, with the lowest SHA-256 of C3S|p4|<class>|<norad>|<E>, excluding step 0's 16,
// which are replayed under the pin too and reported separately. Fit and terms only (no screen). RK78, relative tolerance 1e-10, steps up to 120 s, outputs at the six leads and the 600 s noise grid.
//   node experiments/ffm-covariance-adaptive/precheck-p4.mjs --cells                    the cell reproduction and the reasons (no FFM)
//   node experiments/ffm-covariance-adaptive/precheck-p4.mjs --replay --shard k/n       the windows; rows under <store>/p4/
//   node experiments/ffm-covariance-adaptive/precheck-p4.mjs --receipt                  results/ffm-covariance-adaptive/precheck-P4.json
import fs from 'node:fs';
import path from 'node:path';
import { config, store, args, registered, Opened, writeReceipt, c2RowsOf, c2Results, root, sha256, readJsonl, HOUR, build } from './common.mjs';
import { openPairs, materialize } from './lib/modules.mjs';
import { openChain, settingsFor } from './lib/open.mjs';
import { openSeeds } from './lib/seeds.mjs';

registered();
const opened = new Opened();
const C2 = path.join(root, 'experiments/ffm-covariance-calibration');
const CLASSES = { R3: { key: 'R3', rows: 'R3', weather: 'M', receipt: 'fit-R3.json' }, 'R2-M': { key: 'R2', rows: 'R2', weather: 'M', receipt: 'fit-R2.json' }, 'R2-O': { key: 'R2-O', rows: 'R2', weather: 'O', receipt: 'fit-R2-O.json' } };
const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json')));
if (sha256(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))) !== config.c2.constantsSha256) throw new Error('C2 constants differ from the registration');
const NSGF_R2 = /^(16908|38077|27944|7646|25398|22824)$/;
const unit = { RR: [1, 0, 0, 0, 0, 0], TT: [0, 0, 1, 0, 0, 0], NN: [0, 0, 0, 0, 0, 1] };
const termsOf = (p, t) => { const a = [{ weight: p.k_e, covariance: t.A }]; if (p.f_R) a.push({ weight: p.f_R ** 2, covariance: unit.RR }); if (p.f_T) a.push({ weight: p.f_T ** 2, covariance: unit.TT }); if (p.f_N) a.push({ weight: p.f_N ** 2, covariance: unit.NN }); if (p.q_T) a.push({ weight: p.q_T, covariance: t.UT }); if (p.q_RN) { a.push({ weight: p.q_RN, covariance: t.UR }); a.push({ weight: p.q_RN, covariance: t.UN }); } if (p.s2) a.push({ weight: p.s2, covariance: p.tau === 'inf' ? t.Dinf : t.D1 }); return a; };
const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];
const pairOf = (p, s) => ({ predicted: { position: P0, velocity: V0, covarianceTerms: termsOf(p, s.terms), covarianceAxes: 'RTN' }, truth: { position: P0.map((x, k) => x - s.err[k]), velocity: V0, ...(s.truthSigma ? { covariance: [1, 0, 1, 0, 0, 1].map((x) => x * s.truthSigma ** 2 / 2), covarianceAxes: 'RTN' } : {}) } });
async function d2Of(pairs, p, list) { const out = []; for (let i = 0; i < list.length; i += 4000) for (const x of await pairs.stats(list.slice(i, i + 4000).map((s) => pairOf(p, s)), 'predicted')) out.push(x.d2Combined ?? x.d2Predicted); return out; }

/** C2's rows of a class and set with the screen rule of score.mjs samples(); condition O takes M's screen. */
function rowsOfClass(c, set) {
  const rows = c2RowsOf(`${c.rows}.${set}.${c.weather === 'O' ? 'O.' : ''}s`, opened);
  if (c.weather !== 'O') return rows;
  const m = new Map(c2RowsOf(`${c.rows}.${set}.s`, opened).map((r) => [`${r.norad}|${r.E}`, r.screen]));
  return rows.map((r) => ({ ...r, screen: m.get(`${r.norad}|${r.E}`) ?? null }));
}
function samplesOf(c, set) {
  const out = [];
  for (const r of rowsOfClass(c, set)) {
    if (r.excluded || !r.fit?.ok || !r.leads?.length || r.screen?.flagged || r.screen?.failed) continue;
    const nsgf = c.rows === 'R2' && r.trackMaxSigmaM > 0 && NSGF_R2.test(String(r.norad));
    for (const l of r.leads) out.push({ L: l.L, err: l.errRtnM, terms: l.terms, truthSigma: nsgf ? l.truthSigmaM : null, cluster: r.cluster, window: `${r.norad}|${r.E}` });
  }
  return out;
}
const BAND = JSON.parse(fs.readFileSync(path.join(C2, 'config.json'))).band, CHI = 7.8147;
const cells = (list, d2) => {
  const by = {};
  list.forEach((s, i) => { (by[s.L] ??= { d2: [], clusters: new Set() }); by[s.L].d2.push(d2[i]); by[s.L].clusters.add(s.cluster); });
  return Object.fromEntries(Object.entries(by).map(([L, c]) => { const n = c.d2.length, mean = c.d2.reduce((x, y) => x + y, 0) / n / 3, cov = c.d2.filter((x) => x <= CHI).length / n, sorted = [...c.d2].sort((x, y) => x - y);
    return [L, { n, clusters: c.clusters.size, meanD2over3: mean, medianD2over3: sorted[Math.floor(n / 2)] / 3, coverage: cov, inBand: mean >= BAND.meanD2over3[0] && mean <= BAND.meanD2over3[1] && cov >= BAND.coverage95[0] && cov <= BAND.coverage95[1], eligible: n >= BAND.minWindows && c.clusters.size >= BAND.minClusters }]; }));
};

if (args.cells) {
  const pairs = await openPairs('c2');
  const report = {};
  for (const [name, c] of Object.entries(CLASSES)) {
    const f = JSON.parse(fs.readFileSync(path.join(c2Results, c.receipt)));
    const chosen = f.candidates[f.chosen];
    if (JSON.stringify(chosen.parameters) !== JSON.stringify(FZ.classes[c.key].parameters)) throw new Error(`${name}: the receipt's chosen parameters are not the frozen constants`);
    const one = {};
    for (const [set, field] of [['calibration', 'calibrationCells'], ['validation', 'validationCells']]) {
      const list = samplesOf(c, set), d2 = await d2Of(pairs, chosen.parameters, list), got = cells(list, d2), want = chosen[field];
      one[set] = { samples: list.length, wantSamples: f.samples[set], identical: JSON.stringify(got) === JSON.stringify(want), differences: Object.keys(want).filter((L) => JSON.stringify(got[L]) !== JSON.stringify(want[L])) };
    }
    report[name] = { chosen: f.chosen, ...one };
  }
  // addition C: R2-O's refused calibration windows, per reason (and every refusal of C3's three classes)
  const reasons = {};
  for (const [name, c] of Object.entries(CLASSES)) for (const set of ['calibration', 'validation']) {
    const count = {}, dates = {}, objects = {};
    for (const r of rowsOfClass(c, set)) { if (!String(r.excluded ?? '').startsWith('refused') && r.fit?.ok !== false) continue; const why = String(r.excluded ?? r.fit?.error ?? '').replace(/^refused: /, '').slice(0, 110); count[why] = (count[why] ?? 0) + 1; (dates[why] ??= new Set()).add(r.E.slice(0, 10)); (objects[why] ??= new Set()).add(r.name); }
    reasons[`${name}.${set}`] = Object.fromEntries(Object.entries(count).map(([why, n]) => [why, { windows: n, cutoffs: dates[why].size, first: [...dates[why]].sort()[0], last: [...dates[why]].sort().at(-1), objects: [...objects[why]].sort() }]));
  }
  fs.mkdirSync(path.join(store, 'p4'), { recursive: true });
  fs.writeFileSync(path.join(store, 'p4', 'cells.json'), JSON.stringify({ report, reasons, gem: pairs.provenance, opened: opened.summary('P4-cells') }, null, 1));
  console.log(JSON.stringify({ report, reasons }, null, 1));
  process.exit(0);
}

/** The windows of a class by the registered rule. */
function pick(name, c) {
  const pop = new Set(c.rows === 'R3' ? config.population.calVal.R3 : config.population.calVal.R2);
  const step0 = new Set(config.p4.excludedStep0.map((w) => `${w.norad}|${w.E}`));
  const rows = [...rowsOfClass(c, 'calibration').map((r) => ({ set: 'calibration', r })), ...rowsOfClass(c, 'validation').map((r) => ({ set: 'validation', r }))];
  const elig = rows.filter(({ r }) => pop.has(r.norad) && !r.excluded && r.fit?.ok && r.leads?.length);
  const ranked = elig.filter(({ r }) => !step0.has(`${r.norad}|${r.E}`)).map((x) => ({ ...x, h: sha256(Buffer.from(`C3S|p4|${name}|${x.r.norad}|${x.r.E}`)) })).sort((a, b) => (a.h < b.h ? -1 : 1));
  return ranked.slice(0, config.p4.windowsPerClass).map(({ set, r }) => ({ cls: name, set, norad: r.norad, E: r.E, group: 'p4', row: r }));
}
const allWindows = () => {
  const out = [];
  for (const [name, c] of Object.entries(CLASSES)) out.push(...pick(name, c));
  const R3 = [...rowsOfClass(CLASSES.R3, 'calibration'), ...rowsOfClass(CLASSES.R3, 'validation')], R2 = [...rowsOfClass(CLASSES['R2-M'], 'calibration'), ...rowsOfClass(CLASSES['R2-M'], 'validation')];
  for (const w of config.p4.excludedStep0) { const row = (w.cls === 'R3' ? R3 : R2).find((r) => r.norad === w.norad && r.E === w.E); out.push({ cls: w.cls === 'R3' ? 'R3' : 'R2-M', set: Date.parse(w.E) >= Date.parse('2026-04-01T00:00:00Z') ? 'validation' : 'calibration', norad: w.norad, E: w.E, group: 'step0', row }); }
  return out;
};

if (args.replay) {
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  const out = path.join(store, 'p4', `rows.s${k}.jsonl`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const done = new Set(readJsonl(out).map((r) => `${r.cls}|${r.norad}|${r.E}`));
  const { truthSeries, windowAt, b2 } = await import(path.join(C2, 'lib/precise.mjs'));
  const { windowTerms } = await import(path.join(C2, 'lib/products.mjs'));
  const { windowTermsRef } = await import('./lib/terms.mjs');
  const { fitInput } = { fitInput: (lines) => ({ points: lines.map((l) => ({ time: l.epoch, position: l.r.map((x) => x * 1000) })), reference: { epoch: lines[0].epoch, state: [...lines[0].r, ...lines[0].v].map((x) => x * 1000) } }) };
  const { fitV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
  const { openWeatherO } = await import('./lib/weather-o.mjs');
  const B2C = JSON.parse(fs.readFileSync(b2('config.json')));
  const c2Config = JSON.parse(fs.readFileSync(path.join(C2, 'config.json')));
  const P9 = JSON.parse(fs.readFileSync(path.join(c2Results, 'precheck-P9.json')));
  const prefixOf = (o) => (o.products.includes('ESA') ? 'ESA0OPSFIN' : o.products.includes('nsgf') ? 'nsgf.orb.' : o.products.includes('ilrsa') ? 'ilrsa.orb.' : o.products[0]);
  const seedOf = openSeeds(opened);
  const WO = await openWeatherO();
  const c2 = await openChain('c2', { opened }), pin = await openChain('pin', { opened });
  // the pin's gp-error-model answers; 0.10.0 answers the same inputs, and any byte that differs is recorded (P4b)
  const gemDiffs = { pair_statistics: 0, noise_responses: 0, dcp_covariance: 0, calls: { pair_statistics: 0, noise_responses: 0, dcp_covariance: 0 } };
  const dual = {
    async stats(list, axes = 'truth') { const [a, b] = [await pin.pairs.statsRaw(list, axes), await c2.pairs.statsRaw(list, axes)]; gemDiffs.calls.pair_statistics += 1; if (!a.equals(b)) gemDiffs.pair_statistics += 1; return pin.pairs.erm.decode(a).pairs; },
    async noise(req) { const [a, b] = [await pin.pairs.noiseRaw(req), await c2.pairs.noiseRaw(req)]; gemDiffs.calls.noise_responses += 1; if (!a.equals(b)) gemDiffs.noise_responses += 1; return pin.pairs.erm.decode(a); },
    async dcp(req) { const [a, b] = [await pin.pairs.dcpRaw(req), await c2.pairs.dcpRaw(req)]; gemDiffs.calls.dcp_covariance += 1; if (!a.equals(b)) gemDiffs.dcp_covariance += 1; return pin.pairs.erm.decode(a); },
  };
  const series = new Map();
  const windows = allWindows();
  for (let i = 0; i < windows.length; i += 1) {
    const w = windows[i];
    if (i % n !== k || done.has(`${w.cls}|${w.norad}|${w.E}`)) continue;
    const c = CLASSES[w.cls], row = w.row;
    const S = c2Config.split[w.set];
    const o0 = P9.perObject.find((o) => o.norad === w.norad);
    const sk = `${w.norad}|${w.set}`;
    if (!series.has(sk)) { if (series.size > 4) series.delete(series.keys().next().value); series.set(sk, truthSeries(w.norad, prefixOf(o0), { opened, from: Date.parse(S.cutoffs.from) - 3 * 24 * HOUR, to: Date.parse(S.cutoffs.to) + 5 * 24 * HOUR })); }
    const E = Date.parse(w.E), win = windowAt(series.get(sk), E, { leadToleranceSeconds: B2C.a5.ca.leadToleranceSeconds.laser });
    const settings = settingsFor(c.rows, seedOf(w.norad), c.rows !== 'R3', B2C);
    const rec = { cls: w.cls, set: w.set, norad: w.norad, name: row.name, E: w.E, group: w.group, chiStored: row.fit.reducedChiSquare };
    const run = async (chain, label, pairs) => {
      let ctx = chain.ctxFor(E - 24 * HOUR, E + 72 * HOUR);
      if (c.weather === 'O') { const o2 = WO.inputsO(ctx.inputs, E, E + 72 * HOUR); if (o2.excluded) throw new Error(o2.excluded); ctx = { ...ctx, inputs: o2.inputs }; }
      const t0 = Date.now();
      const { points, reference } = fitInput(win.track);
      const f = await fitV3(ctx, points, reference, settings);
      const t1 = Date.now();
      const terms = await windowTerms(ctx, pairs, f, E, win.leads, settings);
      return { label, f, terms, ctx, seconds: { fit: (t1 - t0) / 1000, terms: (Date.now() - t1) / 1000 } };
    };
    try {
      const a = await run(c2, 'c2', c2.pairs);
      rec.c2 = { termination: a.f.termination, state: JSON.stringify(a.f.state) === JSON.stringify(row.fit.state), covariance: JSON.stringify(a.f.covariance) === JSON.stringify(row.fit.covariance), parameters: JSON.stringify(a.f.parameters) === JSON.stringify(row.fit.parameters), terms: JSON.stringify(a.terms.leads) === JSON.stringify(row.leads), seconds: a.seconds };
      // lib/terms.mjs against C2's lib/products.mjs, on C2's chain: field for field
      const ext = await windowTermsRef(a.ctx, c2.pairs, a.f, E, win.leads.map((x) => ({ ...x, epochMs: Date.parse(x.line.epoch) })), settings);
      rec.termsLibEqual = JSON.stringify(ext.leads) === JSON.stringify(a.terms.leads);
      const b = await run(pin, 'pin', dual);
      const sample = (leads) => leads.map((l) => ({ L: l.L, err: l.errRtnM, terms: l.terms, truthSigma: c.rows === 'R2' && NSGF_R2.test(String(w.norad)) ? l.truthSigmaM : null }));
      const p = FZ.classes[c.key].parameters, d2a = await d2Of(c2.pairs, p, sample(row.leads)), d2b = await d2Of(c2.pairs, p, sample(b.terms.leads));
      const absDelta = d2a.map((x, q) => Math.abs(x - d2b[q]) / 3);
      const errMax = Math.max(...row.leads.map((l, q) => Math.max(...l.errRtnM.map((x, j) => Math.abs(x - b.terms.leads[q].errRtnM[j])))));
      const stateMax = Math.max(...row.fit.state.map((x, j) => Math.abs(x - b.f.state[j])));
      rec.pin = { termination: b.f.termination, state: JSON.stringify(b.f.state) === JSON.stringify(row.fit.state), stateMaxAbs: stateMax, errorsIdentical: errMax === 0, errMaxAbsM: errMax, d2over3: d2a.map((x) => x / 3), absDeltaD2over3: absDelta, seconds: b.seconds,
        limit: c.rows === 'R3' ? absDelta.map(() => 1e-9) : d2a.map((x) => 1e-3 + 1e-3 * (x / 3)) };
      rec.pin.pass = (c.rows === 'R3' ? rec.pin.state && rec.pin.errorsIdentical : true) && absDelta.every((x, q) => x <= rec.pin.limit[q]) && (b.f.termination === row.fit.termination || b.f.termination === 'CONVERGED');
      rec.c2.pass = rec.c2.state && rec.c2.covariance && rec.c2.parameters && rec.c2.terms && rec.termsLibEqual;
    } catch (error) { rec.error = String(error.message).slice(0, 300); }
    rec.gemDiffs = { ...gemDiffs, calls: { ...gemDiffs.calls } };
    fs.appendFileSync(out, `${JSON.stringify(rec)}\n`);
    console.error(w.cls, w.norad, w.E.slice(0, 10), w.group, rec.error ?? `c2 ${rec.c2.pass} ext ${rec.termsLibEqual} pin ${rec.pin.pass} dd ${Math.max(...rec.pin.absDeltaD2over3).toExponential(2)}`);
  }
  fs.writeFileSync(path.join(store, 'opened', `P4-replay.s${k}.json`), JSON.stringify(opened.list()));
  await c2.close(); await pin.close();
  process.exit(0);
}

if (args.receipt) {
  const cellsReport = JSON.parse(fs.readFileSync(path.join(store, 'p4', 'cells.json')));
  const rows = fs.readdirSync(path.join(store, 'p4')).filter((f) => f.startsWith('rows.s')).sort().flatMap((f) => readJsonl(path.join(store, 'p4', f)));
  const gem = { calls: { pair_statistics: 0, noise_responses: 0, dcp_covariance: 0 }, differ: { pair_statistics: 0, noise_responses: 0, dcp_covariance: 0 } };
  const lastByShard = new Map();
  for (const f of fs.readdirSync(path.join(store, 'p4')).filter((x) => x.startsWith('rows.s')).sort()) { const r = readJsonl(path.join(store, 'p4', f)); if (r.length) lastByShard.set(f, r.at(-1).gemDiffs); }
  for (const g of lastByShard.values()) for (const m of Object.keys(gem.calls)) { gem.calls[m] += g.calls[m]; gem.differ[m] += g[m]; }
  const summarize = (list) => Object.fromEntries(['R3', 'R2-M', 'R2-O'].map((cls) => { const x = list.filter((r) => r.cls === cls), ok = x.filter((r) => !r.error); return [cls, { windows: x.length, errors: x.filter((r) => r.error).map((r) => `${r.norad} ${r.E}: ${r.error}`),
    c2BitForBit: ok.filter((r) => r.c2.pass).length, termsLibEqual: ok.filter((r) => r.termsLibEqual).length, pinPass: ok.filter((r) => r.pin.pass).length, pinFailures: ok.filter((r) => !r.pin.pass).map((r) => ({ norad: r.norad, E: r.E, state: r.pin.state, errMaxAbsM: r.pin.errMaxAbsM, absDelta: Math.max(...r.pin.absDeltaD2over3), termination: r.pin.termination })),
    stateIdentical: ok.filter((r) => r.pin.state).length, errorsIdentical: ok.filter((r) => r.pin.errorsIdentical).length, maxAbsDeltaD2over3: ok.length ? Math.max(...ok.flatMap((r) => r.pin.absDeltaD2over3)) : null, maxErrChangeM: ok.length ? Math.max(...ok.map((r) => r.pin.errMaxAbsM)) : null, maxStateChange: ok.length ? Math.max(...ok.map((r) => r.pin.stateMaxAbs)) : null, terminationsChanged: ok.filter((r) => r.pin.termination !== 'CONVERGED').length }]; }));
  const p4 = rows.filter((r) => r.group === 'p4'), step0 = rows.filter((r) => r.group === 'step0');
  const cellsOk = Object.values(cellsReport.report).every((c) => c.calibration.identical && c.validation.identical);
  const replay = summarize(p4);
  const allPass = Object.values(replay).every((c) => c.windows === config.p4.windowsPerClass && !c.errors.length && c.c2BitForBit === c.windows && c.termsLibEqual === c.windows && c.pinPass === c.windows);
  const gemPass = Object.values(gem.differ).every((x) => x === 0) && gem.calls.noise_responses > 0 && gem.calls.dcp_covariance > 0;
  const receipt = { plan: 'section 5 P4; coordinator rulings 1 and additions B, C of 2026-10-31', limits: config.p4.limits, rule: config.p4.rank, build: { pin: build.pin.commit, c2: 'f54b5107 (estimation), c860a072 (FFM, gp-error-model)' }, cells: cellsReport.report, reasons: cellsReport.reasons, replay, step0Replay: summarize(step0), gem, xm: build.xm, outcome: { cells: cellsOk, replay: allPass, gem: gemPass, pass: cellsOk && allPass && gemPass } };
  console.log(writeReceipt('precheck-P4', receipt, opened));
  console.log(JSON.stringify(receipt.outcome), JSON.stringify(replay), JSON.stringify(gem));
  process.exit(0);
}
