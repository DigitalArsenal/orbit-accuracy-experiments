// GEO-SGP4.md: arm (a), SGP4 refit in one mode (gp-error-model 0.14.0) on the stored GE, IG, WA and part F windows; the node count on those and on HE and HX;
// arm (b), the 2x2 of fitters and libraries on GE and IG. Each window as all-regimes.mjs and geo-truth-files.mjs read it. Module calls only; the node and
// inclination read from module-converted TEME states are classification statistics, no state enters a score.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/geo-sgp4-run.mjs --part a|b|n --out <dir> --shard k/n
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config, root, HOUR, DAY, iso, ms, rms, XM } from '../xp2-fit-design/common.mjs';
import { openAp } from './lib/ap.mjs';
import { openAxes, isoMs } from './lib/host.mjs';
import { HX, MGEX_CUTOFFS, TESS, WA_CUTOFFS, windowKey } from './lib/regimes.mjs';
import { SBAS, series as sbasSeries } from './lib/sbas.mjs';
import { TYPE, oemLines } from '../xp-atmosphere-merit/lib/sds.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const PART = args.part, OUT = args.out;
if (!['a', 'b', 'n'].includes(PART) || !OUT) throw new Error('--part a|b|n and --out');
export const STORE = '/opt/data/sdn-archive/operator-theory/ap/geo-sgp4-one-mode';
const B0411 = '/opt/data/sdn-archive/operator-theory/ap/b0411';
const BUILDS = {
  'analysis/gp-error-model': ['f34c12c0e9d61981a6149c818271b34a5d6e6ff6', 'd57e970b1b46f1c95d392443c4a1bf481c54f1825a50ea33aa32ddd29dd35cfc'],
  'propagator/sdn-ap': ['a0f33bc545d76f47d679c7854c6963fb8efcf799', 'e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610'],
  'propagator/sgp4-xp': ['1b905d16f68fc56e7da66c6392315970f9e7e6d0', 'f61b15c4fd658817e3e43c7818da18c4d08d453ad28e9d704b0cd11b616b7deb'],
};
const MODULES = process.env.SDN_MODULES_ROOT;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
/** A module's wasm and manifest by git show at its registered commit, SHA-256 checked, kept under the store. */
function pin(rel) {
  const [commit, want] = BUILDS[rel], dir = path.join(STORE, 'build', commit, rel), file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha(fs.readFileSync(file)) !== want) {
    const bytes = execFileSync('git', ['-C', MODULES, 'show', `${commit}:${rel}/dist/isomorphic/module.wasm`], { maxBuffer: 1 << 28 });
    if (sha(bytes) !== want) throw new Error(`${rel} at ${commit} is ${sha(bytes)}, registered ${want}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.${process.pid}`, bytes); fs.renameSync(`${file}.${process.pid}`, file);
    fs.writeFileSync(path.join(dir, 'plugin-manifest.json'), execFileSync('git', ['-C', MODULES, 'show', `${commit}:${rel}/plugin-manifest.json`], { maxBuffer: 1 << 26 }));
  }
  const bytes = fs.readFileSync(file);
  if (sha(bytes) !== want) throw new Error(`${file} is not ${want}`);
  return { file, bytes, manifest: JSON.parse(fs.readFileSync(path.join(dir, 'plugin-manifest.json'), 'utf8')) };
}

const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const m = await openModules();

/** S1: the stored S arm's fit (xp2-fit-design/lib/sgp4fit.mjs) on gp-error-model 0.14.0. erm-codec.mjs is unchanged from 0.11.0 to 0.14.0 and is checked against origin/main. */
async function openSgp4FitOneMode() {
  const { bytes, manifest } = pin('analysis/gp-error-model');
  const codec = 'analysis/gp-error-model/scripts/erm-codec.mjs';
  if (sha(fs.readFileSync(path.join(MODULES, codec))) !== sha(execFileSync('git', ['-C', MODULES, 'show', `${BUILDS['analysis/gp-error-model'][0]}:${codec}`]))) throw new Error(`${codec} differs from the registered commit`);
  const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(MODULES, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
  const erm = await import(pathToFileURL(path.join(MODULES, codec)).href);
  return {
    async fit(oem, options, identity) {
      const h = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
      try {
        const r = await h.invoke({ methodId: 'fit_elements', inputs: [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, erm.frame('options', 'fitOptions', { closure: false, ...options })] });
        if (r.statusCode !== 0) throw new Error(`fit_elements: ${r.errorCode ?? r.statusCode}: ${String(r.errorMessage).slice(0, 200)}`);
        const out = {};
        for (const o of r.outputs) out[o.portId] = Buffer.from(o.payload);
        const fr = erm.decode(out.report).fits?.[0];
        if (!fr || !fr.converged) throw new Error(fr?.error ?? 'not converged');
        const u = S.OMM.OMM.getSizePrefixedRootAsOMM(new S.flatbuffers.ByteBuffer(new Uint8Array(out.elements))).unpack();
        return { model: erm.decode(out.report).model, el: { epoch: u.EPOCH, objectName: identity.name, objectId: identity.objectId ?? '', elements: { MEAN_MOTION: u.MEAN_MOTION, ECCENTRICITY: u.ECCENTRICITY, INCLINATION: u.INCLINATION, RA_OF_ASC_NODE: u.RA_OF_ASC_NODE, ARG_OF_PERICENTER: u.ARG_OF_PERICENTER, MEAN_ANOMALY: u.MEAN_ANOMALY, BSTAR: u.BSTAR, MEAN_MOTION_DOT: u.MEAN_MOTION_DOT, MEAN_MOTION_DDOT: u.MEAN_MOTION_DDOT } } };
      } finally { await h.destroy(); }
    },
  };
}
/** The Space Force's SGP4-XP (lib/ussf-xp.mjs) at the stores' build, from its pinned file. */
async function openUssfXpPinned() {
  const { file } = pin('propagator/sgp4-xp');
  const entry = createRequire(path.join(MODULES, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const h = await createStandaloneHarness('browser', file, { surface: 'direct' });
  return {
    async fit(oem) {
      let r;
      try { r = await h.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: oem }] }); } catch (error) { return { ok: false, error: String(error?.message ?? error).slice(0, 240) }; }
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, omm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    async propagate(omm, grid, count) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'omm', typeRef: TYPE('OMM'), payload: omm }, { portId: 'grid', typeRef: TYPE('OEM'), payload: grid }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
      if (lines.length !== count) throw new Error(`propagate returned ${lines.length} of ${count} states`);
      return lines;
    },
  };
}

const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
const PCF_XP = S.pcfBytes({ forces: {}, fit: null });
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
const jsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const storedKeys = (dir, re = /^rows(-\d+)?\.jsonl$/) => new Map(fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => jsonl(path.join(dir, f))).map((r) => [r.key, r]));
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, `rows-${SHARD}.jsonl`);
const done = new Set(jsonl(outFile).map((r) => r.key));
const write = (row) => fs.appendFileSync(outFile, `${JSON.stringify({ ...row, ranAt: new Date().toISOString() })}\n`);

/** Hourly osculating TEME node and inclination (degrees) of GCRF states: the first state of each UTC hour. */
const axes = await openAxes();
async function nodes(lines) {
  const seen = new Set(), pick = [];
  for (const l of lines) { const h = Math.floor(ms(l.epoch) / HOUR); if (!seen.has(h)) { seen.add(h); pick.push(l); } }
  const teme = await axes.convert(pick, 'GCRF', 'TEME');
  return teme.map((s) => {
    const [x, y, z] = s.r, [u, v, w] = s.v, h = [y * w - z * v, z * u - x * w, x * v - y * u], hn = Math.hypot(...h);
    return { node: ((Math.atan2(h[0], -h[1]) * 180) / Math.PI + 360) % 360, inc: (Math.acos(h[2] / hn) * 180) / Math.PI };
  });
}
function nodeCondition(series) {
  let down = 0, up = 0, nearest = 180;
  for (let i = 0; i < series.length; i += 1) {
    const a = series[i].node;
    nearest = Math.min(nearest, a, 360 - a);
    if (i === 0) continue;
    const p = series[i - 1].node;
    if (p < 90 && a > 270) down += 1;
    if (p > 270 && a < 90) up += 1;
  }
  const inc = series.map((s) => s.inc).sort((a, b) => a - b);
  const crosses = down + up > 0;
  return { samples: series.length, down, up, crosses, near: !crosses && nearest < 5, holds: crosses || nearest < 5, nearestDeg: nearest, incMedianDeg: inc[Math.floor(inc.length / 2)], incMaxDeg: inc.at(-1) };
}

/** AP6's IG, GE, HE and HX objects and part W's, as all-regimes.mjs builds them. */
async function objects(groups) {
  const out = [];
  if (groups.includes('WA')) for (const [prn, sat] of Object.entries(SBAS)) {
    if (!WA_CUTOFFS.some((t) => inShard(windowKey('WA', sat.name, t)))) continue;
    out.push({ group: 'WA', name: sat.name, norad: sat.norad, objectId: '', lines: await sbasSeries(Number(prn), WA_CUTOFFS[0] - 3 * DAY, WA_CUTOFFS.at(-1) + 7 * DAY + DAY), arcs: [24, 72], cutoffs: WA_CUTOFFS });
  }
  for (const [group, klass] of [['IG', 'igso'], ['GE', 'geo']]) {
    if (!groups.includes(group)) continue;
    for (const o of SRC.mgex({ klass })) out.push({ group, name: o.name, norad: o.norad, objectId: o.objectId ?? '', lines: o.lines, arcs: [72], cutoffs: MGEX_CUTOFFS });
  }
  const spkOnGrid = async (lines) => {
    const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
    const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
    const thin = norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
    return axes.convert(thin, 'EME2000', 'GCRF');
  };
  if (groups.includes('HE') && TESS.cutoffs.some((t) => inShard(windowKey('HE', TESS.name, t)))) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
    const s = await spkObjectSeries(MODULES, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
    out.push({ group: 'HE', name: TESS.name, norad: TESS.norad, objectId: TESS.objectId, lines: await spkOnGrid(s.lines), arcs: TESS.arcs, cutoffs: TESS.cutoffs });
  }
  if (groups.includes('HX')) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    for (const h of HX) {
      if (!h.cutoffs.some((t) => inShard(windowKey('HX', h.name, t)))) continue;
      const s = await spkObjectSeries(MODULES, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
      out.push({ group: 'HX', name: h.name, norad: h.norad, objectId: h.objectId, lines: await spkOnGrid(s.lines), arcs: h.arcs, cutoffs: h.cutoffs });
    }
  }
  return out;
}

const G = PART === 'a' ? await openSgp4FitOneMode() : null;
const A = PART === 'b' ? await openAp(pin('propagator/sdn-ap').file) : null;
const U = PART === 'b' ? await openUssfXpPinned() : null;
const stored = new Map([...storedKeys(path.join(B0411, 'regimes')), ...storedKeys(path.join(B0411, 'regimes-wa'))]);
const GROUPS = PART === 'a' ? ['GE', 'IG', 'WA'] : PART === 'b' ? ['GE', 'IG'] : ['GE', 'IG', 'WA', 'HE', 'HX'];

for (const o of await objects(GROUPS)) {
  const times = o.lines.map((l) => ms(l.epoch));
  const stepMs = times.length > 1 ? times[1] - times[0] : GRID;
  const gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs);
  const minBin = Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
  const between = (a, b) => { const out = []; for (let i = 0; i < times.length; i += 1) if (times[i] >= a && times[i] <= b) out.push(o.lines[i]); return out; };
  for (const D0 of o.cutoffs) {
    const key = windowKey(o.group, o.name, D0), was = stored.get(key);
    if (!inShard(key) || done.has(key) || !was || was.error) continue;
    const row = { key, group: o.group, norad: o.norad, name: o.name, cutoff: iso(D0), arms: {} };
    try {
      if (PART === 'n') {
        for (const hours of o.arcs) row.arms[`N${hours}`] = nodeCondition(await nodes(between(D0 - hours * HOUR, D0 + 7 * DAY)));
        write(row);
        continue;
      }
      const after = between(D0 + 1, D0 + 7 * DAY);
      const first = after.length ? ms(after[0].epoch) : 0;
      const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
      const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
      const entered = LEADS.filter((k) => bins[k].length >= minBin);
      if (!entered.length) throw new Error('no lead bin');
      const scored = entered.flatMap((k) => bins[k]);
      const epochs = scored.map((l) => l.epoch), epochsMs = epochs.map(ms), truth = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
      const gridB = S.gridBytes(epochs);
      const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
      const arc = (hours) => { const raw = between(D0 - hours * HOUR, D0); const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
      for (const hours of o.arcs) {
        const thin = arc(hours);
        const run = async (name, fn) => {
          const a = { ok: false };
          try { if (!thin) throw new Error('coverage'); Object.assign(a, await fn()); a.ok = true; } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); }
          row.arms[`${name}-${hours}`] = a;
        };
        const oem = thin ? S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }) : null;
        const fly = async (st) => score(await m.rtn(await m.toAxes(st, epochs, 'GCRF'), truth));
        if (PART === 'a') {
          await run('S1', async () => {
            const { el, model } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: o.name, objectId: o.objectId });
            const flown = await m.propagateSgp4(el, o.norad, epochsMs, gridMs / 1000);
            const present = flown.filter(Boolean).length;
            if (present !== flown.length) throw new Error(`SGP4 returned ${present} of ${flown.length} states`);
            return { model, el, days: await fly(flown) };
          });
          continue;
        }
        // Part b: the two fitters, each set flown on both propagators. The Space Force library's calls keep the stored order (fit, then its own set), then the whiteroom set.
        let wr = null, sf = null;
        await run('WWr', async () => { const f = await A.fit(oem, PCF_XP, undefined); if (!f.ok) throw new Error(f.error); wr = f.omm; return { omm: Buffer.from(f.omm).toString('base64'), days: await fly(await A.propagate(f.omm, gridB, PCF_XP, undefined, epochs.length)) }; });
        await run('SSr', async () => { const f = await U.fit(oem); if (!f.ok) throw new Error(f.error); sf = f.omm; return { omm: Buffer.from(f.omm).toString('base64'), days: await fly(await U.propagate(f.omm, gridB, epochs.length)) }; });
        await run('WS', async () => { if (!wr) throw new Error('no whiteroom set'); return { days: await fly(await U.propagate(wr, gridB, epochs.length)) }; });
        await run('SW', async () => { if (!sf) throw new Error('no Space Force set'); return { days: await fly(await A.propagate(sf, gridB, PCF_XP, undefined, epochs.length)) }; });
      }
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
    write(row);
  }
}

/** geo-truth-files.mjs's interpolation of the operator's 300 s table, a data step, verbatim. */
function interpolate(table, t) {
  const ts = table.map((l) => Date.parse(l.epoch));
  const i = ts.findIndex((x) => x >= t);
  if (i < 0 || t < ts[0]) return null;
  const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
  const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
  const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(table[a])[c], 0));
  return { r: mix((l) => l.r), v: mix((l) => l.v) };
}

// Part F (GEO-TRUTH.md): the stored operator-file rows, S1 as geo-truth-files.mjs fits and flies S, and the node over the file's fit and the seven days after.
if (PART !== 'b' && SHARD === 0) {
  const keys = storedKeys(path.join(B0411, 'geo-files'));
  const VENDORS = '/opt/data/sdn-archive/operator-theory/vendors', PRN = { 46114: 135, 42709: 133 }, MIN_DAY = 168;
  const files = new Map();
  for (const c of fs.readdirSync(VENDORS).filter((d) => /^c\d{8}T\d{4}$/.test(d)).sort()) {
    const dir = path.join(VENDORS, c, 'products');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => /^(intelsat|ses)-/.test(n))) {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!PRN[p.norad] || !p.forecastOem || files.has(`${p.norad}|${p.start}`)) continue;
      files.set(`${p.norad}|${p.start}`, p);
    }
  }
  for (const [rowKey, was] of keys) {
    if (done.has(`GF|${rowKey}`)) continue;
    const p = files.get(rowKey.split('|').slice(0, 2).join('|'));
    const row = { key: `GF|${rowKey}`, group: 'GF', norad: was.norad, name: was.object, start: was.start, fitHours: was.fitHours, arms: {} };
    try {
      if (!p) throw new Error('operator file not found');
      const all = S.oemLines(Buffer.from(p.forecastOem, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)) }));
      const fitEnd = Date.parse(all[0].epoch) + was.fitHours * HOUR;
      const truthAll = await sbasSeries(PRN[p.norad], fitEnd + 1, fitEnd + 7 * DAY);
      // The stored days only: the broadcast has grown since. The operator's own file, interpolated at these epochs as geo-truth-files.mjs does, must score exactly as stored, which shows the truth epochs and states are the stored ones.
      const days = [1, 2, 3, 4, 5, 6, 7].map((k) => truthAll.filter((l) => { const t = Date.parse(l.epoch); return t > fitEnd + (k - 1) * DAY && t <= fitEnd + k * DAY; })).map((s, i) => [i + 1, s]).filter(([k, s]) => s.length >= MIN_DAY && was.days.includes(k));
      if (days.map(([k]) => k).join() !== was.days.join()) throw new Error(`truth days ${days.map(([k]) => k)} differ from the stored ${was.days}`);
      const truth = days.flatMap(([, s]) => s), epochs = truth.map((l) => l.epoch), epochsMs = epochs.map((e) => Date.parse(e)), sizes = days.map(([, s]) => s.length), states = truth.map((l) => ({ r: l.r, v: l.v }));
      const seg = all.filter((l) => Date.parse(l.epoch) <= fitEnd);
      if (PART === 'n') { row.arms.N = nodeCondition(await nodes([...seg, ...truth])); write(row); continue; }
      if (was.arms.operator?.days) {
        const inFile = epochsMs.map((t) => interpolate(all, t));
        if (!inFile.every(Boolean)) throw new Error('operator file does not reach the truth');
        const e = await m.rtn(inFile, states);
        let i = 0;
        row.operatorSame = days.every(([k], j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => Math.sqrt(s.reduce((acc, q) => acc + q[c] * q[c], 0) / s.length)); return Math.hypot(...ric) === was.arms.operator.days[k].e; });
      }
      const oem = S.oemBytes({ frame: 'GCRF', object: { name: p.object, id: '', norad: p.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
      try {
        const { el, model } = await G.fit(oem, { from: seg[0].epoch, to: seg.at(-1).epoch, epoch: 'first', fitBstar: true }, { name: p.object, objectId: '' });
        const flown = await m.propagateSgp4(el, p.norad, epochsMs, 256);
        if (flown.some((x) => !x)) throw new Error('SGP4 returned no state');
        const e = await m.rtn(await m.toAxes(flown, epochs, 'GCRF'), states), out = {};
        let i = 0;
        days.forEach(([k], j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => Math.sqrt(s.reduce((acc, q) => acc + q[c] * q[c], 0) / s.length)); out[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; });
        row.arms['S1'] = { model, el, days: out };
      } catch (error) { row.arms['S1'] = { error: String(error?.message ?? error).slice(0, 160) }; }
    } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
    write(row);
  }
}
console.error(`part ${PART} shard ${SHARD}/${SHARDS}: done`);
await axes.close();
process.exit(0);
