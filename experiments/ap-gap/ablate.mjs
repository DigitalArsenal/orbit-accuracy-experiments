import { writeAudit } from './audit.mjs';
// AP6.md: AP, XP, SGP4 and FFM on the regimes AP5 did not reach, its truth, grid, coverage rule and as-issued weather. Module calls only.
//   node experiments/operator-theory/all-regimes.mjs --wasm <AP 0.4.0> --out <dir> --groups LS,DO,GD,IG,GE,HE --shard k/n
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, root, HOUR, DAY, iso, ms, rms, XM } from '../xp2-fit-design/common.mjs';
import { openSgp4Fit } from '../xp2-fit-design/lib/sgp4fit.mjs';
import { driverRows } from '../ffm-atmosphere-xm3/lib/ffm.mjs';
import { apForces, openAp } from '../operator-theory/lib/ap.mjs';
import { openUssfXp } from './ussf-xp.mjs';
import { openFfmHost, openAxes, apriori } from '../operator-theory/lib/host.mjs';
import { HX, STATIC, MGEX_CUTOFFS, TESS, WA_CUTOFFS, windowKey } from '../operator-theory/lib/regimes.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const frozen = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url))); if (!frozen.frozen) throw new Error('registration is not frozen');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if (args.wasm === frozen.baselineWasm && hash(args.wasm) !== frozen.baselineSha256) throw new Error('AP build mismatch');
const OUT = args.out, GROUPS = (args.groups ?? 'LS,DO,GD,IG,GE,HE').split(',');
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
// --arms U: the Space Force's SGP4-XP alone, in its own store. Without it, this file's registered arms, unchanged.
const ONLY_U = false; const method = args.method ?? 'ap';
const U = method === 'gn' ? await openUssfXp() : null;
const UF = method === 'gn' && args['ussf-fixed'] ? await openUssfXp(args['ussf-fixed']) : null;
const AF = method === 'gn' && args['ap-fixed'] ? await openAp(args['ap-fixed']) : null;
const m = await openModules(), A = await openAp(args.wasm), F = method === 'ffm' ? await openFfmHost() : null;
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
const ATM = XM.config.arms.X2.forces;
const PCF_AP = S.pcfBytes({ forces: apForces(ATM, { tesseral: 31, zonal: 20 }), fit: null });
const PCF_AP_VACUUM = S.pcfBytes({ forces: apForces(ATM, { tesseral: 31, zonal: 20, atmosphere: false }), fit: null });
const PCF_XP = S.pcfBytes({ forces: {}, fit: null });
const ffmLow = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
});
const ffmHigh = () => ({
  forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
  integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
});
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `manifest-${SHARD}.json`), JSON.stringify({ command: process.argv, created: new Date().toISOString(), wasm: { path: args.wasm, sha256: hash(args.wasm) }, runner: hash(new URL(import.meta.url)), config: hash(new URL('./config.json',import.meta.url)), ffm: F?.provenance },null,2));
process.on('exit', () => writeAudit(OUT, SHARD));
const outFile = path.join(OUT, `rows-${SHARD}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);

/** Every object of the groups asked for: { group, name, norad, objectId, lines, arcs, cutoffs, vacuum }. */
/** A kernel's states on the fit's grid, whole seconds, in GCRF. */
async function spkOnGrid(lines, axes) {
  const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  const thin = norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
  return axes.convert(thin, 'EME2000', 'GCRF');
}

// Reject held objects by filename before opening any OEM bytes.
function safeMgex({ klass }) {
  const held = new Set(frozen.EXCLUDE_NORADS);
  const base = '/opt/data/sdn-archive/e14-covariance-realism/reference';
  const dirs = Array.from({length:20},(_,k)=>`GFZ0MGXRAP_2025${274+k}0000_01D_05M_ORB`).filter(d=>fs.existsSync(path.join(base,d)));
  if (!dirs.length) return [];
  const wanted = klass === 'geo' ? /\dG$/ : /\dI$/;
  return fs.readdirSync(path.join(base,dirs[0])).filter(f=>/^\d+\.oem$/.test(f) && !held.has(Number(f.slice(0,-4))))
    .map(f=>({f,head:SRC.readReference(path.join(base,dirs[0],f))})).filter(x=>wanted.test(x.head.name))
    .map(({f})=>SRC.chain(dirs.map(d=>path.join(base,d,f)).filter(f=>fs.existsSync(f))));
}

async function objects() {
  const out = [];
  if (GROUPS.includes('GN')) {
    const cutoffs=XM.daysOf(XM.config.period.from,XM.config.period.to);
    for (const o of XM.config.groups.GN.objects) {
      if(frozen.EXCLUDE_NORADS.includes(o.norad)) throw new Error('excluded GN object');
      out.push({...o,group:'GN',objectId:'',lines:T.series(o,cutoffs[0]-3*DAY,cutoffs.at(-1)+7*DAY).lines,cutoffs,arcs:method==='gn'?[24]:[72]});
    }
  }
  for (const o of STATIC.filter((x) => GROUPS.includes(x.group)).sort((a,b)=>GROUPS.indexOf(a.group)-GROUPS.indexOf(b.group))) {
    const files = o.files();
    if (!files.length) { console.error(`${o.group} ${o.name}: no product`); continue; }
    const series = SRC.chain(files);
    out.push({ group: o.group, name: series.name || o.name, norad: series.norad, objectId: series.objectId ?? '', lines: series.lines, arcs: o.arcs, cutoffs: o.cutoffs });
  }
  // GEO-TRUTH.md part W: the three WAAS geostationary satellites, truth from the broadcast.
  if (GROUPS.includes('WA')) {
    const { SBAS, series } = await import('../operator-theory/lib/sbas.mjs');
    for (const [prn, sat] of Object.entries(SBAS)) {
      if (!WA_CUTOFFS.some((t) => inShard(windowKey('WA', sat.name, t)))) continue;
      out.push({ group: 'WA', name: sat.name, norad: sat.norad, objectId: '', lines: await series(Number(prn), WA_CUTOFFS[0] - 3 * DAY, WA_CUTOFFS.at(-1) + 7 * DAY + DAY), arcs: [24, 72], cutoffs: WA_CUTOFFS, vacuum: true });
    }
  }
  for (const [group, klass] of [['IG', 'igso'], ['GE', 'geo']]) {
    if (!GROUPS.includes(group)) continue;
    for (const o of safeMgex({ klass })) out.push({ group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', lines: o.lines, arcs: [72], cutoffs: MGEX_CUTOFFS });
  }
  if (GROUPS.includes('HE') && TESS.cutoffs.some((t) => inShard(windowKey('HE', TESS.name, t)))) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
    const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
    const axes = await openAxes();
    out.push({ group: 'HE', name: TESS.name, norad: TESS.norad, objectId: TESS.objectId, lines: await spkOnGrid(s.lines, axes), arcs: TESS.arcs, cutoffs: TESS.cutoffs, vacuum: true });
    await axes.close();
  }
  // Report only, added 2026-11-02 so that highly elliptical orbits do not rest on one satellite: THEMIS and Chandra, from NAIF's public kernels, read as TESS is.
  if (GROUPS.includes('HX')) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const axes = await openAxes();
    for (const h of HX) {
      if (!h.cutoffs.some((t) => inShard(windowKey('HX', h.name, t)))) continue;
      const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
      out.push({ group: 'HX', name: h.name, norad: h.norad, objectId: h.objectId, lines: await spkOnGrid(s.lines, axes), arcs: h.arcs, cutoffs: h.cutoffs, vacuum: true });
    }
    await axes.close();
  }
  for (const o of out) if (frozen.EXCLUDE_NORADS.includes(Number(o.norad)) || /STARLINK/i.test(o.name)) throw new Error('excluded object');
  return out.sort((a,b)=>GROUPS.indexOf(a.group)-GROUPS.indexOf(b.group));
}

for (const o of await objects()) {
  const times = o.lines.map((l) => ms(l.epoch));
  const stepMs = times.length > 1 ? times[1] - times[0] : GRID;
  const gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs);
  // XM's minimum, 260 of the 288 states of a day at 300 s, is 90 % of a day's states; a product on a coarser grid is held to the same share.
  const minBin = Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
  const between = (a, b) => { const out = []; for (let i = 0; i < times.length; i += 1) if (times[i] >= a && times[i] <= b) out.push(o.lines[i]); return out; };
  for (const D0 of o.cutoffs) {
    const key = windowKey(o.group, o.name, D0);
    if (Date.now() >= Date.parse(frozen.deadline)) { await F?.close(); process.exit(0); }
    if (!inShard(key) || done.has(key) || (args.key && key !== args.key)) continue;
    const row = { key, group: o.group, norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
    try {
      const after = between(D0 + 1, D0 + 7 * DAY);
      const first = after.length ? ms(after[0].epoch) : 0;
      const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
      const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
      const entered = LEADS.filter((k) => bins[k].length >= minBin);
      if (!entered.length) throw new Error('no lead bin');
      const scored = entered.flatMap((k) => bins[k]);
      const epochs = scored.map((l) => l.epoch), epochsMs = epochs.map(ms), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
      let ex, spw;
      if (!o.vacuum) {
        const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
        if (R.excluded) throw new Error(R.excluded);
        ex = { rows: S.spwBytes(R.rows) };
        spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
      }
      const gridB = S.gridBytes(epochs);
      const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
      const arc = (hours) => { const raw = between(D0 - hours * HOUR, D0); const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
      const high = Math.hypot(...scored[0].r) >= 8400;
      const pcfAp = o.vacuum ? PCF_AP_VACUUM : PCF_AP;
      for (const hours of o.arcs) {
        const thin = arc(hours);
        const run = async (name, fn) => {
          const a = { ok: false };
          try { if (!thin) throw new Error('coverage'); Object.assign(a, await fn()); a.ok = true; } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
          row.arms[`${name}${hours}`] = a;
        };
        const oem = thin ? S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }) : null;
        if (method === 'gn') {
          for (const name of ['AP','XP','XP_PRIOR','U','AP_FIXED','XP_FIXED','U_FIXED']) await run(name,async()=>{
            const ussf=name.startsWith('U');
            const host=ussf?(name==='U'?U:UF):(name.endsWith('FIXED')?AF:A);
            if(!host) throw new Error('fixed build unavailable');
            const forces=name.startsWith('AP')?apForces(ATM,{tesseral:31,zonal:20}):{};
            const fit=name==='XP_PRIOR'?{dragPrior:{mean:0,sigma:0.05},srpPrior:{mean:0,sigma:0.1}}:null;
            const pcf=S.pcfBytes({forces,fit});
            const extra=name.startsWith('AP')?ex:undefined;
            const f=ussf?await host.fit(oem):await host.fit(oem,pcf,extra);
            if(!f.ok) throw new Error(f.error);
            const st=ussf?await host.propagate(f.omm,gridB,epochs.length):await host.propagate(f.omm,gridB,pcf,extra,epochs.length);
            return {days:score(await m.rtn(await m.toAxes(st,epochs,'GCRF'),truth))};
          });
        } else if (method === 'ap') {
          const specs = args.arm ? args.arm.split(',') : ['AP','J70','T0','T12','Z0'];
          for (const name of specs) await run(name, async () => {
            const degrees = { tesseral: name === 'T0' || name === 'FRAME' ? 0 : name === 'T12' ? 12 : name === 'RESONANCE' ? 1 : 31,
              zonal: name === 'Z0' || name === 'RESONANCE' ? 0 : name === 'FRAME' ? 1 : 20, atmosphere: !o.vacuum && name !== 'J70' };
            const pcf = S.pcfBytes({ forces: apForces(ATM, degrees), fit: null });
            const extra = name === 'J70' ? undefined : ex;
            const f = await A.fit(oem, pcf, extra);
            if (!f.ok) throw new Error(f.error);
            const st = await A.propagate(f.omm, gridB, pcf, extra, epochs.length);
            return { days: score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth)) };
          });
        } else {
          for (const name of (args.arm ? args.arm.split(',') : ['F','NO_SRP','NO_BODIES','NO_TIDES','D20','O12','O31'])) await run(name, async () => {
            const settings = high ? ffmHigh() : ffmLow();
            if (name === 'NO_SRP') { settings.forces.srp = false; if (high) { settings.parameters = []; settings.apriori = apriori([]); } }
            if (name === 'NO_BODIES') settings.forces.thirdBodies = [];
            if (name === 'NO_TIDES') settings.forces.solidTides = false;
            if (name === 'D20') { settings.forces.degree = 20; settings.forces.order = Math.min(20, settings.forces.order); }
            if (name === 'O12') settings.forces.order = 12;
            if (name === 'O31') settings.forces.order = Math.min(31,settings.forces.order);
            const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0);
            if (!f.state) throw new Error(f.error ?? f.termination);
            return { fitOk: !!f.ok, termination: f.termination, days: score(await m.rtn(await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, settings, spw), truth)) };
          });
        }
      }
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`); console.error(key);
  }
}
console.error(`shard ${SHARD}/${SHARDS}: done`);
await F?.close();
process.exit(0);
