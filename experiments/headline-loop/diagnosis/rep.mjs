// #316 (exploratory): per window, FFM fitted to the published arc and flown; AP 0.6.5 fitted to the truth arc (as published), to the truth arc
// with FFM's coefficients held, and to FFM's own trajectory (representation and carrier fits), each scored against truth and against FFM.
//   SDN_MODULES_ROOT=... node experiments/headline-loop/diagnosis/rep.mjs --group HX --set pub --arms AP,K,R7,R3 --out <dir>
//     [--names "THEMIS A"] [--shard k/n] [--arc 72]
// Arms (comma list); a name is <kind><days>[-option...]:
//   F       FFM, the published settings, fitted to the truth arc and flown (always run)
//   Q       FFM variant fitted to the truth arc and flown: options t<d> (tesserals and sectorials to degree d; zonals stay), nd (no drag)
//   AP      AP fitted to the truth arc, the published $PCF (module priors)
//   K       AP fitted to the truth arc, B and S held at FFM's estimates (FFM's fixed S for low orbits)
//   R<d>    AP fitted to FFM's trajectory over [arc start, cutoff + d days] (R0: the arc alone), module priors
// AP options: w (wide priors), k (B and S held at FFM's), v (no drag: B held at 0), c<d>.<z> (tesseral and zonal caps), a0/a1 (NRLMSISE-00
// off/on; off is the theory's own Jacchia 1970 when caps are set), e1/e2 (fitted epoch at the middle / last state: sdnap_fit_epoch_diagnostic),
// j (finite-difference Jacobian always), f<h> (FFM trajectory from cutoff - h hours), s<min> (sampled every <min> minutes), g<variant>
// (the trajectory of FFM variant Q-<variant>, e.g. gt4)
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const GROUP = args.group, SET = args.set ?? 'pub', OUT = args.out;
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const ARMS = (args.arms ?? 'AP,K,R7').split(',').filter((a) => a !== 'F');
const NAMES = args.names ? args.names.split(',') : null;
const ARC_H = Number(args.arc ?? (GROUP === 'HX' ? 72 : 24));
const TAG = args.tag ?? '';
const LEADS = [1, 2, 3, 5, 7];
const { HOUR, DAY, ms, iso } = L;
if (!GROUP || !OUT) throw new Error('--group and --out');
fs.mkdirSync(path.join(OUT, 'ffm-cache'), { recursive: true });
const outFile = path.join(OUT, `rows-${GROUP}-${SET}${TAG}-${SHARD}.jsonl`);
const doneKeys = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error || r.error === 'coverage' || r.error === 'no lead bin').map((r) => `${r.key}|${r.arcH}`) : []);

const env = await L.openAll({ ffm: true });
const { A, m, F, axes } = env;
const ex = A.ex();
const objs = await L.objectsOf(GROUP, { names: NAMES, set: SET, axes });
// --every k: every k-th cutoff of each object (a subsample of the set, the same for every arm)
if (args.every) for (const o of objs) o.cutoffs = o.cutoffs.filter((_, i) => i % Number(args.every) === 0);

function parseArm(name) {
  const [kind, ...opts] = name.split('-');
  const o = { name, kind: kind.replace(/\d+$/, ''), days: /\d+$/.test(kind) ? Number(/\d+$/.exec(kind)[0]) : null, variant: '' };
  for (const x of opts) {
    if (o.kind === 'Q') { o.variant = o.variant ? `${o.variant}-${x}` : x; continue; }
    if (x === 'w') o.wide = true;
    else if (x === 'k') o.held = true;
    else if (x === 'v') o.vacuum = true;
    else if (x === 'j') o.jac = true;
    else if (/^c\d+\.\d+$/.test(x)) o.caps = x.slice(1).split('.').map(Number);
    else if (/^a[01]$/.test(x)) o.atm = x === 'a1';
    else if (/^e[012]$/.test(x)) o.epoch = Number(x[1]);
    else if (/^f\d+$/.test(x)) o.fromH = Number(x.slice(1));
    else if (/^s\d+$/.test(x)) o.sampleMin = Number(x.slice(1));
    else if (/^o\d+$/.test(x)) o.outMin = Number(x.slice(1));
    else if (/^g[\w.]+$/.test(x)) o.traj = x.slice(1).replace(/\./g, '-');
    else if (x === 'z') o.series = true;
    else throw new Error(`option ${x} of ${name}`);
  }
  return o;
}
const SPECS = ARMS.map(parseArm);

const gcrfOf = async (st, epochs) => m.toAxes(st, epochs, 'GCRF');
const errOf = async (pred, ref) => m.rtn(pred, ref);
function variantSettings(base, variant) {
  const s = JSON.parse(JSON.stringify(base));
  for (const x of (variant || '').split('-').filter(Boolean)) {
    if (/^t\d+$/.test(x)) s.forces.tesseral = Number(x.slice(1));
    else if (x === 's0') { s.forces.srp = false; s.parameters = s.parameters.filter((p) => p.kind !== 'SRP_AREA_OVER_MASS'); delete s.fixed.agom; }
    else if (x === 'm0') s.forces.thirdBodies = [10];
    else if (x === 'b0') s.forces.thirdBodies = [];
    else if (x === 'nt') s.forces.solidTides = false;
    else if (x === 'nd') { s.forces.drag = false; s.parameters = s.parameters.filter((p) => p.kind !== 'DRAG_AREA_OVER_MASS'); if (!s.parameters.length) { s.parameters = [{ kind: 'SRP_AREA_OVER_MASS', value: s.fixed.agom ?? 0.02 }]; s.fixed = {}; } }
    else throw new Error(`FFM variant ${x}`);
  }
  s.apriori = base.apriori.length === (6 + s.parameters.length) ** 2 ? base.apriori : Array.from({ length: (6 + s.parameters.length) ** 2 }, (_, j) => { const n = 6 + s.parameters.length; const i = j % n; return Math.floor(j / n) === i ? (i < 3 ? 1e10 : i < 6 ? 100 : 0.04) : 0; });
  return s;
}

for (const o of objs) {
  for (const D0 of o.cutoffs) {
    const key = L.windowKey(GROUP, o.name, D0);
    if (!L.inShard(key, SHARD, SHARDS)) continue;
    if (doneKeys.has(`${key}|${ARC_H}`)) continue;
    const row = { key, group: GROUP, set: SET, name: o.name, cutoff: iso(D0), arcH: ARC_H, arms: {} };
    const t0 = Date.now();
    try {
      const all = await o.series(D0 - Math.max(ARC_H, 72) * HOUR - HOUR, D0 + 7 * DAY + HOUR);
      const raw = all.filter((l) => { const t = ms(l.epoch); return t >= D0 - ARC_H * HOUR && t <= D0; });
      const thin = L.arcOf(raw, ARC_H);
      if (!thin) throw new Error('coverage');
      const sc = L.scoredOf(all.filter((l) => ms(l.epoch) > D0), D0, LEADS);
      if (!sc.entered.length) throw new Error('no lead bin');
      const high = Math.hypot(...sc.truth[0].r) >= 8400;
      row.high = high;
      const wx = o.vacuum ? null : L.weatherAt(D0, D0 + 7 * DAY);
      const base = high ? L.ffmHigh() : L.ffmLow();
      const arcStart = ms(thin[0].epoch);
      const arcEp = thin.map((l) => l.epoch), arcTruth = thin.map((l) => ({ r: l.r, v: l.v }));
      const stepMin = Math.min(5, ...SPECS.filter((s) => s.kind === 'R').map((s) => Math.min(s.sampleMin ?? 5, s.outMin ?? 5)));
      const fromMin = Math.min(arcStart, ...SPECS.filter((s) => s.kind === 'R' && s.fromH !== undefined).map((s) => D0 - s.fromH * HOUR));
      // FFM and its variants: fitted to the arc (cached by window), flown on the scored epochs, on the arc, and (lazily) on the carrier grid
      const ffms = new Map();
      async function ffm(variant = '') {
        if (ffms.has(variant)) return ffms.get(variant);
        const settings = variantSettings(base, variant);
        const cacheFile = path.join(OUT, 'ffm-cache', `${key.replace(/[|\s]/g, '_')}-${ARC_H}${variant ? `-${variant}` : ''}.json`);
        let ff = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : null;
        if (!ff) {
          const t1 = Date.now();
          const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, wx?.ffm, D0);
          if (!f.state) throw new Error(`FFM${variant} fit: ${f.error ?? f.termination}`);
          ff = { epoch: f.epoch, state: f.state, parameters: f.parameters, termination: f.termination, ok: !!f.ok, fitS: (Date.now() - t1) / 1000 };
          fs.writeFileSync(cacheFile, JSON.stringify(ff));
        }
        const product = { epoch: ff.epoch, state: ff.state, parameters: ff.parameters };
        const v = { ff, settings, product,
          B: ff.parameters.find((p) => p.kind === 'DRAG_AREA_OVER_MASS')?.value ?? null,
          S: ff.parameters.find((p) => p.kind === 'SRP_AREA_OVER_MASS')?.value ?? settings.fixed?.agom ?? null,
          scored: await F.forecast(product, sc.epochs, settings, wx?.ffm),
          arc: await F.forecast(product, arcEp, settings, wx?.ffm),
          traj: null };
        v.trajectory = async () => {
          if (!v.traj) {
            // propagator/ffm takes at most 10,000 samples a call: chunks, each flown from the product's epoch
            const ep = L.gridEpochs(fromMin, D0 + 7 * DAY, stepMin * 60000), st = [];
            for (let i = 0; i < ep.length; i += 9000) st.push(...(await F.forecast(product, ep.slice(i, i + 9000), settings, wx?.ffm)));
            v.traj = ep.map((e, i) => ({ epoch: e, r: st[i].r, v: st[i].v }));
          }
          return v.traj;
        };
        ffms.set(variant, v);
        return v;
      }
      const F0 = await ffm('');
      row.ffm = { termination: F0.ff.termination, ok: F0.ff.ok, B: F0.B, S: F0.S, fitS: F0.ff.fitS, settings: high ? 'high' : 'low' };
      row.arms.F = { ok: true, days: L.byDay(await errOf(F0.scored, sc.truth), sc.entered, sc.sizes), arc: L.overall(await errOf(F0.arc, arcTruth)) };

      for (const s of SPECS) {
        const a = { ok: false };
        const t1 = Date.now();
        try {
          if (s.kind === 'Q') {
            const V = await ffm(s.variant);
            Object.assign(a, { termination: V.ff.termination, B: V.B, S: V.S });
            a.days = L.byDay(await errOf(V.scored, sc.truth), sc.entered, sc.sizes);
            a.vsF = L.byDay(await errOf(V.scored, F0.scored), sc.entered, sc.sizes);
            a.arc = L.overall(await errOf(V.arc, arcTruth));
            a.ok = true;
            a.s = (Date.now() - t1) / 1000;
            row.arms[s.name] = a;
            continue;
          }
          const atm = s.atm ?? !o.vacuum;
          const caps = s.caps ?? [31, 20];
          const forces = L.apForces({ tesseral: caps[0], zonal: caps[1], atmosphere: atm });
          const V = s.traj ? await ffm(s.traj) : F0;
          let fit = null;
          if (s.wide) fit = { dragPrior: { form: 'LOG_NORMAL', mean: 0.01, sigma: 10 * Math.log(10) }, srpPrior: { form: 'GAUSSIAN_SIGNED', mean: 0.0, sigma: 10 } };
          if (s.held || s.kind === 'K') {
            fit = { srpPrior: { form: 'GAUSSIAN_SIGNED', mean: V.S ?? 0, sigma: 1e-9 }, ...(V.B > 0 ? { dragPrior: { form: 'LOG_NORMAL', mean: V.B, sigma: 1e-6 } } : {}) };
            a.heldB = V.B; a.heldS = V.S;
          }
          if (s.vacuum) fit = { ...(fit ?? {}), dragPrior: { form: 'GAUSSIAN_SIGNED', mean: 0, sigma: 1e-12 } };
          let lines, start, stop;
          if (s.kind === 'AP' || s.kind === 'K') { lines = thin; start = thin[0].epoch; stop = iso(D0); }
          else {
            const from = s.fromH !== undefined ? D0 - s.fromH * HOUR : arcStart;
            const to = D0 + s.days * DAY;
            const every = (s.sampleMin ?? 5) * 60000;
            lines = (await V.trajectory()).filter((l) => { const t = ms(l.epoch); return t >= from && t <= to && (t - from) % every === 0; });
            start = lines[0].epoch; stop = lines.at(-1).epoch;
          }
          const prevE = s.epoch !== undefined ? ex.sdnap_fit_epoch_diagnostic(s.epoch) : null;
          const prevJ = s.jac ? ex.sdnap_fit_jacobian_diagnostic(1) : null;
          let f;
          try { f = await A.fit(L.oemOf(o, lines, start, stop), L.pcf({ forces, fit }), atm ? wx?.spw : undefined); }
          finally { if (prevE !== null) ex.sdnap_fit_epoch_diagnostic(prevE); if (prevJ !== null) ex.sdnap_fit_jacobian_diagnostic(prevJ); }
          if (!f.ok) throw new Error(f.error);
          const info = L.readOcm(f.ocm);
          Object.assign(a, { rms: info.fitRmsKm, bterm: info.bterm, agom: info.agom, iterations: info.iterations, epoch: info.epoch, states: lines.length, converged: info.o?.ORBIT_DETERMINATION?.FIT_STATISTICS?.CONVERGED });
          const st = await gcrfOf(await A.propagate(f.ocm, sc.epochs), sc.epochs);
          a.days = L.byDay(await errOf(st, sc.truth), sc.entered, sc.sizes);
          a.vsF = L.byDay(await errOf(st, V.scored), sc.entered, sc.sizes);
          const sa = await gcrfOf(await A.propagate(f.ocm, arcEp), arcEp);
          a.arc = L.overall(await errOf(sa, arcTruth));
          a.arcVsF = L.overall(await errOf(sa, V.arc));
          const me = info.o?.MEAN_ELEMENTS;
          a.meanMotion = me?.MEAN_MOTION; a.ecc = me?.ECCENTRICITY; a.inc = me?.INCLINATION;
          if (s.series) {
            // the carrier residual AP - FFM on the FFM trajectory's grid (arc start to cutoff + 7 d): RTN in FFM's axes, and FFM's states
            const tr = await V.trajectory();
            const ep = tr.map((l) => l.epoch);
            const stAll = await gcrfOf(await A.propagate(f.ocm, ep), ep);
            const res = await errOf(stAll, tr.map((l) => ({ r: l.r, v: l.v })));
            const r6 = (x) => Math.round(x * 1e6) / 1e6;
            fs.mkdirSync(path.join(OUT, 'series'), { recursive: true });
            const sf = path.join(OUT, 'series', `${key.replace(/[|\s]/g, '_')}-${ARC_H}-${s.name}.json`);
            fs.writeFileSync(sf, JSON.stringify({ key, arm: s.name, arcH: ARC_H, cutoff: iso(D0), fitFrom: start, fitTo: stop, meanMotion: a.meanMotion, ecc: a.ecc, inc: a.inc,
              ffmTruthDays: row.arms.F.days, tMin: ep.map((e) => (ms(e) - D0) / 60000), res: res.map((q) => q.map(r6)), r: tr.map((l) => l.r.map(r6)), v: tr.map((l) => l.v.map((x) => Math.round(x * 1e9) / 1e9)) }));
            a.seriesFile = path.basename(sf);
          }
          a.ok = true;
        } catch (e) { a.error = String(e?.message ?? e).slice(0, 200); }
        a.s = (Date.now() - t1) / 1000;
        row.arms[s.name] = a;
      }
    } catch (e) { row.error = String(e?.message ?? e).slice(0, 200); }
    row.wallS = (Date.now() - t0) / 1000;
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
    const brief = Object.entries(row.arms).map(([k, a]) => `${k} ${a.ok === false ? 'X' : (a.days?.['1']?.e ?? NaN).toFixed(3)}`).join(' ');
    console.error(`${key} ${row.error ?? ''} ${brief} ${row.wallS.toFixed(0)} s`);
  }
}
await env.close();
process.exit(0);
