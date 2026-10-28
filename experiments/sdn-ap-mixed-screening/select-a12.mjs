// Amendment A12 (PLAN.md A12 points 6-10): the profile selection on pre-F data only. Phase `fit` fits P0, P1 and P3 (fit_batch version 3)
// and, on A3's full-weight satellites, A3's registered configuration, on the three datasets of the 2,000-satellite sample, and scores
// each on its held-out span; phase `select` applies the rule and the gate and writes the receipt. Every capture path the fit phase opens
// is logged (lib/prefit.mjs: cycles before the forecast cycle only, no file starting at or after F).
//   node experiments/sdn-ap-mixed-screening/select-a12.mjs --phase fit [--shard k/n] [--limit n]
//   node experiments/sdn-ap-mixed-screening/select-a12.mjs --phase select
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, args, frozen, readJsonl, g1Dir, root, write, sha256, paced } from './common.mjs';
import { prefitReader } from './lib/prefit.mjs';
import { track, cycleMs } from './lib/capture.mjs';
import { selectionSample, profileSettings, openV3, fitInput, rms3dM, brief } from './lib/a12.mjs';

frozen();
const A = config.a12, S = config.part1.starlink, D = A.selection.datasets;
const H = 3600e3;
const dir = path.join(store, 'a12-selection');
const a3Rows = () => fs.readdirSync(path.join(store, 'rows')).filter((f) => /^starlink-ffm\.s\d+\.jsonl$/.test(f)).sort().flatMap((f) => readJsonl(path.join(store, 'rows', f)));
const iso = (t) => new Date(t).toISOString();
const fullWeight = (r) => r.ffm?.ok && r.ffm.rounds === 2 && !r.ffm.stoppedBy;

/** E' fit track rule (A12 point 7): at least 60 % of 145 epochs, no gap over 8 h, states in the first and the last 2 h. */
function eprimeOk(lines, from, to) {
  const t = lines.map((l) => Date.parse(l.epoch));
  if (t.length < D.eprime.minimumCoverage * (S.trackHours * 60 / S.stepMinutes + 1)) return `fit track ${t.length} epochs`;
  if (!(t[0] <= from + D.eprime.edgeHours * H) || !(t.at(-1) >= to - D.eprime.edgeHours * H)) return 'fit track misses its first or last 2 h';
  for (let i = 1; i < t.length; i += 1) if (t[i] - t[i - 1] > D.eprime.maximumGapHours * H) return 'fit track gap over 8 h';
  return null;
}

/** The three windows of one satellite: [{ dataset, fit, held, E (end of fit), skipped }]. */
function windowsOf(row, R) {
  const E = Date.parse(row.E), out = [];
  const t = R.trackOf(row).lines, t0 = Date.parse(t[0].epoch);
  for (const name of ['split12', 'split18']) {
    const cut = t0 + D[name].fitHours * H;
    out.push({ dataset: name, fit: t.filter((l) => Date.parse(l.epoch) <= cut), held: t.filter((l) => Date.parse(l.epoch) > cut), E });
  }
  const Ep = E - D.eprime.shiftHours * H, Fs = Date.parse(row.F.startUtc);
  const files = R.olderFiles(row.norad, Fs);
  const fit = track(files.filter((f) => f.start < Ep), Ep - S.trackHours * H, Ep, false).lines;
  const truthFiles = R.olderFiles(row.norad, Fs, D.eprime.truthCycles).filter((f) => f.start > Ep && f.start < Fs);
  const held = track(truthFiles, Ep, E, true).lines; // first 8 h of each file (config.part1.starlink.segmentHours), the newest file at each epoch
  const skipped = eprimeOk(fit, Ep - S.trackHours * H, Ep) ?? (held.length ? null : 'no truth epoch in (E\', E]');
  out.push({ dataset: 'eprime', fit, held, E: Ep, skipped });
  return out;
}

const phase = args.phase ?? 'fit';
if (phase === 'fit') {
  if (D.eprime.truthSegmentHours !== S.segmentHours) throw new Error('E\' truth segment hours differ from the track rule');
  const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `fits.s${k}.jsonl`), log = path.join(dir, `opened.s${k}.txt`);
  const done = new Set(readJsonl(out).map((r) => r.norad));
  const rows = new Map(a3Rows().map((r) => [r.norad, r]));
  const sample = selectionSample([...rows.keys()].sort((a, b) => a - b));
  const R = prefitReader(A.forecastCycle, (p) => fs.appendFileSync(log, `${p}\n`));
  const { fitV3, propagateV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
  const v3 = await openV3();
  const { modulesRoot } = await import(path.join(g1Dir, 'lib/modules.mjs'));
  const a3 = await (await import('./lib/ffm-fit.mjs')).openFfmFit(modulesRoot());
  const experiments = (await import('node:child_process')).execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  let count = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const norad = sample[i];
    if (i % n !== k || done.has(norad)) continue;
    if (args.limit && count >= Number(args.limit)) break;
    if (count % 10 === 0) await paced(Number(process.env.B2_LOAD_MAX ?? 26));
    const row = rows.get(norad);
    const rec = { norad, E: row.E, fullWeight: fullWeight(row), provenance: count === 0 ? { ...v3.provenance, a3: a3.provenance, experiments } : undefined, windows: {} };
    for (const w of windowsOf(row, R)) {
      const o = rec.windows[w.dataset] = { fitStates: w.fit.length, heldStates: w.held.length, fitEnd: iso(w.E), skipped: w.skipped ?? null };
      if (w.skipped) continue;
      const heldEpochs = w.held.map((l) => l.epoch), { points, reference } = fitInput(w.fit);
      const ctx = v3.ctxFor(Date.parse(w.fit[0].epoch), w.E + 72 * H);
      o.candidates = {};
      for (const profile of ['P0', 'P1', 'P3']) {
        const settings = profileSettings(norad, profile);
        const t0 = Date.now();
        const f = await fitV3(ctx, points, reference, settings);
        const c = o.candidates[profile] = { ...brief(f), seconds: (Date.now() - t0) / 1000 };
        if (f.ok) {
          try { c.rmsM = rms3dM(await propagateV3(ctx, f, heldEpochs, settings), w.held); } catch (error) { c.predictError = String(error.message).slice(0, 200); }
        }
      }
      if (rec.fullWeight) {
        const t0 = Date.now();
        const f = await a3.fit(norad, w.fit, w.E);
        const c = o.candidates.A3 = { ok: f.ok, error: f.error ?? null, rounds: f.rounds ?? null, stoppedBy: f.stoppedBy ?? null, parameters: f.parameters ?? null, seconds: (Date.now() - t0) / 1000 };
        if (f.ok) {
          try { const p = await a3.predict(f, norad, heldEpochs.map((e) => Date.parse(e)), w.E); c.rmsM = Math.sqrt(w.held.reduce((s, l, j) => s + l.r.reduce((a, x, q) => a + ((x - p[j].r[q]) * 1000) ** 2, 0), 0) / w.held.length); } catch (error) { c.predictError = String(error.message).slice(0, 200); }
        }
      }
    }
    fs.appendFileSync(out, `${JSON.stringify(rec)}\n`);
    count += 1;
    console.error(`a12 select fit shard ${k}/${n}: ${count} (${norad})`);
  }
  await v3.close(); await a3.close();
  process.exit(0);
}

if (phase === 'select') {
  const { interval } = await import('./table.mjs');
  const recs = fs.readdirSync(dir).filter((f) => /^fits\.s\d+\.jsonl$/.test(f)).sort().flatMap((f) => readJsonl(path.join(dir, f)));
  const quantile = (v, q) => { const a = [...v].sort((x, y) => x - y); if (!a.length) return null; const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); };
  const names = Object.keys(A.candidates);
  // a candidate's result on one window: P2(c) is P0's fit, or P3's where P0's B exceeds c
  const resultOf = (w, name) => {
    const c = A.candidates[name];
    if (!c.base) return w.candidates?.[name];
    const p0 = w.candidates?.P0;
    const b = p0?.parameters?.find((p) => p.kind === 'DRAG_AREA_OVER_MASS')?.value;
    return p0?.ok && b > c.ceiling ? { ...w.candidates.P3, released: true } : p0;
  };
  const datasets = Object.keys(A.selection.datasets);
  const sample = new Set(recs.map((r) => r.norad));
  const per = {};
  for (const name of names) {
    let fits = 0, converged = 0, refusals = 0, failed = 0, outOfDomain = 0, released = 0;
    const byDataset = {};
    for (const ds of datasets) {
      let dsFits = 0, dsConverged = 0;
      for (const r of recs) {
        const w = r.windows[ds];
        if (!w || w.skipped) continue;
        const x = resultOf(w, name);
        if (name.startsWith('P2') && x?.released) released += 1;
        fits += 1; dsFits += 1;
        if (x?.refusedTrials > 0 || x?.refusedRounds > 0) refusals += 1;
        if (!x?.termination) failed += 1;
        if (x?.ok) { converged += 1; dsConverged += 1; }
        if ((x?.parameters ?? []).some((p) => p.kind !== 'IN_TRACK_ACCELERATION' && !(p.value >= 0))) outOfDomain += 1;
      }
      byDataset[ds] = { fits: dsFits, converged: dsConverged };
    }
    per[name] = { fits, converged, convergedShare: fits ? converged / fits : 0, refusals, fitFailed: failed, outOfDomain, ...(name.startsWith('P2') ? { releasedT: released } : {}), byDataset };
    per[name].eligible = refusals === 0 && failed === 0 && per[name].convergedShare >= A.selection.eligibility.minimumConverged && outOfDomain === 0;
  }
  const eligible = names.filter((x) => per[x].eligible);
  const value = (r, ds, name) => { const w = r.windows[ds]; const x = w && !w.skipped ? resultOf(w, name) : null; return x?.ok && Number.isFinite(x.rmsM) ? x.rmsM : null; };
  const common = recs.filter((r) => eligible.every((x) => value(r, 'eprime', x) !== null));
  for (const x of names) {
    const v = recs.map((r) => value(r, 'eprime', x)).filter((y) => y !== null), vc = common.map((r) => value(r, 'eprime', x)).filter((y) => y !== null);
    Object.assign(per[x], { eprimeMedianM: quantile(v, 0.5), eprimeScored: v.length, eprimeCommonMedianM: vc.length === common.length && common.length ? quantile(vc, 0.5) : null });
    for (const ds of datasets) { const vd = recs.map((r) => value(r, ds, x)).filter((y) => y !== null); per[x].byDataset[ds].medianM = quantile(vd, 0.5); per[x].byDataset[ds].p90M = quantile(vd, 0.9); }
  }
  const rank = [...eligible].sort((a, b) => per[a].eprimeCommonMedianM - per[b].eprimeCommonMedianM || A.tieOrder.indexOf(a) - A.tieOrder.indexOf(b));
  const lowest = rank[0] ?? null;
  const ties = {};
  for (const x of rank.slice(1)) {
    const ratios = common.map((r) => value(r, 'eprime', x) / value(r, 'eprime', lowest));
    const ci = interval(ratios, A.selection.tieSeed.replace('<candidate>', x).replace('<lowest>', lowest), false);
    ties[x] = { medianRatio: quantile(ratios, 0.5), ci95: ci, tie: ci[0] <= 1 && ci[1] >= 1 };
  }
  const tied = [lowest, ...rank.slice(1).filter((x) => ties[x].tie)];
  const winner = lowest ? [...tied].sort((a, b) => A.candidates[a].freeParameters - A.candidates[b].freeParameters || A.tieOrder.indexOf(a) - A.tieOrder.indexOf(b))[0] : null;
  const gateOf = (name) => {
    const out = {};
    for (const ds of datasets) {
      const ratios = recs.filter((r) => r.fullWeight).map((r) => { const w = r.windows[ds]; const a3 = w && !w.skipped ? w.candidates?.A3 : null; const c = value(r, ds, name); return a3?.ok && Number.isFinite(a3.rmsM) && a3.rmsM > 0 && c !== null ? c / a3.rmsM : null; }).filter((y) => y !== null);
      const ci = interval(ratios, A.gate.seed.replace('<candidate>', name).replace('<dataset>', ds), false);
      const m = quantile(ratios, 0.5), p90 = quantile(ratios, 0.9);
      out[ds] = { n: ratios.length, medianRatio: m, upper95: ci?.[1] ?? null, p90, pass: m <= A.gate.maximumMedianRatio && ci?.[1] <= A.gate.maximumUpper95 && p90 <= A.gate.maximumP90 };
    }
    return { datasets: out, pass: Object.values(out).every((x) => x.pass) };
  };
  const gates = Object.fromEntries(names.map((x) => [x, gateOf(x)]));
  const order = winner ? [winner, ...rank.filter((x) => x !== winner)] : [];
  const chosen = order.find((x) => gates[x].pass) ?? null;
  const receipt = {
    amendment: 'A12 part 2', rule: 'PLAN.md A12 points 6-10', sampleSize: sample.size, sampleSeed: A.selection.sampleSeed, fullWeightInSample: recs.filter((r) => r.fullWeight).length,
    windows: Object.fromEntries(datasets.map((ds) => [ds, { fitted: recs.filter((r) => r.windows[ds] && !r.windows[ds].skipped).length, skipped: Object.entries(recs.reduce((m, r) => { const s = r.windows[ds]?.skipped; if (s) m[s.replace(/\d+ epochs/, '# epochs')] = (m[s.replace(/\d+ epochs/, '# epochs')] ?? 0) + 1; return m; }, {})) }])),
    candidates: per, eligible, commonSatellites: common.length, rank, lowest, ties, tied, ruleChoice: winner, gates, chosen: chosen ?? 'P0', gateFailed: !chosen,
    provenance: recs.find((r) => r.provenance)?.provenance ?? null,
    opened: Object.fromEntries(fs.readdirSync(dir).filter((f) => /^opened\.s\d+\.txt$/.test(f)).sort().map((f) => { const t = fs.readFileSync(path.join(dir, f)); return [f, { paths: t.toString().split('\n').filter(Boolean).length, sha256: sha256(t) }]; })),
  };
  // integrity: every opened path lies in a cycle before the forecast cycle
  const bad = fs.readdirSync(dir).filter((f) => /^opened\.s\d+\.txt$/.test(f)).flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)).filter((p) => !(cycleMs(path.basename(path.dirname(p))) < cycleMs(A.forecastCycle)));
  if (bad.length) throw new Error(`A12 selection: ${bad.length} opened paths are not before the forecast cycle`);
  receipt.openedAllBeforeForecastCycle = true;
  write(path.join(results, 'a12-selection.json'), receipt);
  console.log(JSON.stringify({ chosen: receipt.chosen, gateFailed: receipt.gateFailed, ruleChoice: winner, rank, eligible }, null, 1));
  process.exit(0);
}
if (phase === 'fitgate') {
  // A12 point 11: the fit-only gate of the ffm3 fit phase over all tracks (and XP-LN's counts), committed before any score
  const tally = (v) => Object.fromEntries([...v.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
  const suffix = A.selected?.contingency ? '-60' : '';
  const rowsOf = (prefix) => fs.readdirSync(path.join(store, 'rows')).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(store, 'rows', f)));
  const f3 = rowsOf(`starlink-ffm3${suffix}.`), xp = rowsOf('starlink-xpln.'), a3 = a3Rows();
  const converged = f3.filter((r) => r.ffm3?.termination === 'CONVERGED' && r.ffm3.ok).length;
  const refused = f3.filter((r) => r.ffm3?.refusedTrials > 0 || r.ffm3?.refusedRounds > 0).length;
  const outOfDomain = f3.filter((r) => (r.ffm3?.parameters ?? []).some((q) => q.kind !== 'IN_TRACK_ACCELERATION' && !(q.value >= 0))).length;
  const opened = (arm) => { const d = path.join(store, 'a12-receipts'); const files = fs.readdirSync(d).filter((f) => f.startsWith(`${arm}.opened.`)).sort(); const all = files.flatMap((f) => fs.readFileSync(path.join(d, f), 'utf8').split('\n').filter(Boolean)); return { files: files.length, paths: all.length, sha256: sha256(Buffer.from(all.join('\n'))), allBeforeForecastCycle: all.every((q) => cycleMs(path.basename(path.dirname(q))) < cycleMs(A.forecastCycle)) }; };
  const shaMatch = (rows) => { const a = new Map(a3.map((r) => [r.norad, r.track.sha])); return rows.filter((r) => a.get(r.norad) === r.track.sha).length; };
  const g = {
    amendment: 'A12 point 11', profile: A.selected.profile, maximumIterations: suffix ? A.fit.contingencyMaximumIterations : A.fit.maximumIterations, tracks: a3.length,
    ffm3: { rows: f3.length, converged, convergedShare: f3.length ? converged / f3.length : 0, refused, outOfDomain, terminations: tally(f3.map((r) => r.ffm3?.termination ?? `fit-failed: ${String(r.ffm3?.error ?? '').replace(/\d+(\.\d+)?/g, '#').slice(0, 80)}`)), releasedT: f3.filter((r) => r.ffm3?.released).length, trackShaMatchesA3: shaMatch(f3), opened: opened(`ffm3${suffix}`), provenance: f3[0]?.provenance ?? null },
    xpln: { rows: xp.length, fitted: xp.filter((r) => r.xpln?.ok).length, refusals: tally(xp.filter((r) => !r.xpln?.ok).map((r) => String(r.xpln?.error ?? '').slice(0, 80))), trackShaMatchesA3: shaMatch(xp), opened: opened('xpln'), provenance: xp[0]?.provenance ?? null },
  };
  g.pass = g.ffm3.rows === a3.length && g.ffm3.convergedShare >= A.selection.eligibility.minimumConverged && refused === 0 && outOfDomain === 0;
  write(path.join(results, `a12-fit-gate${suffix}.json`), g);
  console.log(JSON.stringify({ pass: g.pass, ffm3: { rows: g.ffm3.rows, converged, refused, outOfDomain, terminations: g.ffm3.terminations, releasedT: g.ffm3.releasedT }, xpln: { rows: g.xpln.rows, fitted: g.xpln.fitted } }, null, 1));
  process.exit(0);
}
throw new Error(`unknown phase ${phase}`);
