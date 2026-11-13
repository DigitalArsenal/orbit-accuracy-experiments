// Shared by the covariance-coverage steps: the output directory, the stores the window set is drawn from, a window from its line,
// one sdn-ap build's module, and analysis/gp-error-model's pair statistics. Every state, covariance and error comes from a module call.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = fs.realpathSync(path.resolve(HERE, '../..'));
export const HEADLINE_LOOP = path.join(REPO, 'experiments/headline-loop');
export const STORE = process.env.HEADLINE_LOOP_STORE ?? '/opt/data/sdn-archive/headline-loop';
// the window set's sources: the numerical arm's rows (strong drag, the FFMq flight) and the AP table the windows were drawn from
export const NUMERICAL = 'f0b8352a43f3';
export const AP_TABLE = '048ffe19d63e';
export const DAY = 86400000, HOUR = 3600000;
export const VERSION = /^\d+\.\d+\.\d+$/;

/** The real path of p: its nearest existing ancestor resolved through every link, the rest appended. */
function realOf(p) {
  let head = path.resolve(p), tail = [];
  while (!fs.existsSync(head)) { tail.unshift(path.basename(head)); head = path.dirname(head); }
  return path.join(fs.realpathSync(head), ...tail);
}
/** Whether p is this repository or inside it (through links; letter case folded where the file system folds it). */
export function insideRepo(p) {
  const fold = (s) => (process.platform === 'darwin' || process.platform === 'win32' ? s.toLowerCase() : s);
  const rel = path.relative(fold(REPO), fold(realOf(p)));
  return !(rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}
/** The output directory: outside this repository (its rows name real satellites and dates), created if absent. */
export function outDir(arg) {
  if (!arg) throw new Error('the output directory is the first argument');
  const out = path.resolve(arg);
  if (insideRepo(out)) throw new Error(`${out} is inside this repository: its rows name real satellites and dates; give a directory outside it`);
  fs.mkdirSync(out, { recursive: true });
  return out;
}
export const opt = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
/** --caps T,Z: tesseral and zonal degree of every record's fit, or null for the $PCF the build's version gives. */
export function capsArg() {
  const v = opt('--caps');
  if (!v) return null;
  const c = v.split(',').map(Number);
  if (!(c.length === 2 && c.every((x) => Number.isInteger(x) && x >= 2 && x <= 70))) throw new Error('--caps T,Z: two degrees, each 2 to 70');
  return c;
}
export const capsTag = (caps) => (caps ? `-caps${caps[0]}-${caps[1]}` : '');
const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
export const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);

/** The numerical arm's stored strong-drag rows: Map key|arcH -> row (a flown row over an error row). */
export function numericalRows(groups = ['T', 'P']) {
  const dir = path.join(STORE, NUMERICAL), base = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => /^rows-truth-.*\.jsonl$/.test(x))) {
    for (const r of readJsonl(path.join(dir, f))) {
      if (!groups.includes(r.group)) continue;
      const k = `${r.key}|${r.arcH}`;
      if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r);
    }
  }
  return base;
}
/** The AP table's rows in file order (theory AP). */
export const tableRows = () => readJsonl(path.join(STORE, 'table', AP_TABLE, 'rows.jsonl')).filter((r) => (r.theory ?? 'AP') === 'AP');
/** Every strong-drag window and fit arc the numerical arm flew (FFMq), with inTable: AP and the numerical arm both scored at day 5. */
export function strongDragWindows() {
  const base = numericalRows(), ap = new Map(), out = [];
  for (const r of tableRows()) if (r.group === 'T' || r.group === 'P') ap.set(`${r.key}|${r.arcH}`, r);
  for (const [k, b] of base) {
    if (b.error) continue;
    const q = b.arms?.FFMq;
    if (!q?.ok) continue;
    const a = ap.get(k);
    out.push({ key: b.key, group: b.group, name: b.name, norad: Number(b.key.split('|')[1]), arcH: b.arcH, D0: Date.parse(b.cutoff), date: b.cutoff.slice(0, 10),
      inTable: Number.isFinite(a?.days?.['5']?.e) && Number.isFinite(q.days?.['5']?.e) });
  }
  return out.sort((x, y) => x.group.localeCompare(y.group) || x.name.localeCompare(y.name) || x.arcH - y.arcH || x.D0 - y.D0);
}
/** A window from its line: key|arcH (strong drag, looked up in byKey) or key|arcH|group|name. */
export function windowOf(line, byKey) {
  const f = line.split('|');
  if (byKey.has(line)) return byKey.get(line);
  if (f.length !== 6) return null;
  return { key: f.slice(0, 3).join('|'), arcH: Number(f[3]), group: f[4], name: f[5], norad: /^\d+$/.test(f[1]) ? Number(f[1]) : null, D0: Date.parse(`${f[2]}T00:00:00Z`), date: f[2] };
}
/** The window set written by windows.mjs: its lines (shard k of n by line index) and its manifest. */
export function windowSet(out, K = 0, N = 1) {
  const file = path.join(out, 'windows.txt');
  if (!fs.existsSync(file)) throw new Error(`${file}: run windows.mjs first`);
  return { lines: fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).filter((l, i) => i % N === K), manifest: JSON.parse(fs.readFileSync(path.join(out, 'windows.json'), 'utf8')) };
}
export const shardArg = (s) => { const [K, N] = (s ?? '0/1').split('/').map(Number); if (!(Number.isInteger(K) && Number.isInteger(N) && K >= 0 && K < N)) throw new Error(`shard ${s}: k/n`); return [K, N]; };

/** The headline loop's readers and one build's module: { WN, A, S, build, invoke, fitRecord, fly, destroy }. */
export async function openBuild(out, sha12, caps) {
  const WN = await import(path.join(HEADLINE_LOOP, 'lib/windows.mjs'));
  const A = await import(path.join(HEADLINE_LOOP, 'lib/arms.mjs'));
  const { MODULES_ROOT } = await import(path.join(HEADLINE_LOOP, 'lib/env.mjs'));
  const XMC = await import(path.join(REPO, 'experiments/xp-atmosphere-merit/common.mjs'));
  const APL = await import(path.join(REPO, 'experiments/operator-theory/lib/ap.mjs'));
  const S = A.S;
  const dir = path.join(out, 'builds', sha12);
  const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json'), 'utf8'));
  // the version picks the $PCF (apPcfFor's gates): one the gates cannot read would fit every record as the oldest version does
  if (!VERSION.test(build.version)) throw new Error(`${dir}/build.json: version ${JSON.stringify(build.version)} is not X.Y.Z`);
  // --burns <dir of the burn detector's lists>: a 24 h fit reads its object's maneuvering state as the table does; --rules-at <X.Y.Z>: the
  // version the 24 h carry rule is read at, the build's own where absent (the rule changes with the version, lib/arms.mjs carry24Gate)
  const BURNS = opt('--burns') ?? null, ruleVersion = opt('--rules-at') ?? build.version;
  if (!VERSION.test(ruleVersion)) throw new Error(`--rules-at ${ruleVersion} is not X.Y.Z`);
  const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const ap = await createStandaloneHarness('browser', path.join(dir, 'module.wasm'), { surface: 'direct' });
  const invoke = async (methodId, inputs) => { const r = await ap.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r; };
  const modules = XMC.modulesRoot();
  const gemPin = XMC.pinned(modules, 'analysis/gp-error-model');
  const { createBrowserModuleHarness } = await import(pathToFileURL(createRequire(path.join(modules, 'analysis/gp-error-model/package.json')).resolve('space-data-module-sdk/host/browser-module')).href);
  const erm = await import(pathToFileURL(path.join(modules, 'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
  async function pairStats(pairs) {
    const h = await createBrowserModuleHarness({ wasmSource: gemPin.bytes, manifest: gemPin.manifest, surface: 'direct' });
    try {
      const r = await h.invoke({ methodId: 'pair_statistics', inputs: [erm.frame('pairs', 'pairs', { axesFrom: 'truth', pairs })] });
      if (r.statusCode !== 0) throw new Error(`pair_statistics: ${r.errorCode}: ${r.errorMessage}`);
      const o = {}; for (const x of r.outputs) o[x.portId] = Buffer.from(x.payload);
      return erm.decode(o.statistics).pairs;
    } finally { await h.destroy(); }
  }
  // --caps: the record fitted at tesseral T and zonal Z, its other forces the row's own $PCF's (headline-loop bar.mjs capsOf)
  const capsOf = (choice) => (caps ? { label: `${choice.label} at ${caps[0]}/${caps[1]}`, pcf: APL.fitPcf({ forces: {
    ...APL.apForces({ tesseral: caps[0], zonal: caps[1], atmosphere: !choice.label.startsWith('AP_VACUUM'), ecom2: choice.label.startsWith('AP_ECOM2') }),
    ...(choice.label.endsWith('_TIDES') ? { SOLID_TIDES: 1 } : {}) }, fit: null }) } : choice);
  const flightPcf = (epochs) => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs, MAXIMUM_STATES: Math.max(1000, epochs.length + 16) }); const b = new S.flatbuffers.Builder(1 << 14); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
  const LTM = ['CX_X', 'CY_X', 'CY_Y', 'CZ_X', 'CZ_Y', 'CZ_Z', 'CX_DOT_X', 'CX_DOT_Y', 'CX_DOT_Z', 'CX_DOT_X_DOT', 'CY_DOT_X', 'CY_DOT_Y', 'CY_DOT_Z', 'CY_DOT_X_DOT', 'CY_DOT_Y_DOT', 'CZ_DOT_X', 'CZ_DOT_Y', 'CZ_DOT_Z', 'CZ_DOT_X_DOT', 'CZ_DOT_Y_DOT', 'CZ_DOT_Z_DOT'];
  const full6 = (l) => { const v = LTM.map((k) => l[k]); const M = Array.from({ length: 6 }, () => Array(6).fill(0)); let i = 0; for (let r = 0; r < 6; r += 1) for (let c = 0; c <= r; c += 1) { M[r][c] = v[i]; M[c][r] = v[i]; i += 1; } return M.flat(); };
  /** The build's fit of the window by the table's own process: the truth arc thinned as the scoreboard thins it, the $PCF its version (or --caps)
   *  gives, the weather issued at the cutoff; a 24 h fit carries the terms of the window's 72 h fit ending at the same cutoff where the table's rule
   *  says so (lib/arms.mjs carry24Fit, the function table.mjs calls). Returns { ocm (bytes), record (unpacked), pcf (label), fitProcess (what the
   *  fit did), sc (the scored epochs and truth after the cutoff) }. */
  async function fitRecord(w) {
    const D0 = w.D0, arc = w.arcH, G = WN.GROUPS[w.group];
    const carrying = arc === 24 && A.carry24(ruleVersion);
    const truth = await WN.truthOf(w, D0 - (carrying ? 72 : arc) * HOUR - HOUR, D0 + 7 * DAY + HOUR, null);
    const sc = WN.scoredOf(truth.lines.filter((l) => WN.ms(l.epoch) > D0), D0);
    const thin = WN.arcOf(truth.lines.filter((l) => { const t = WN.ms(l.epoch); return t >= D0 - arc * HOUR && t <= D0; }), arc);
    if (!thin) throw new Error('coverage');
    const choice = capsOf(A.apPcfFor(w.group, build.version, !!G.vacuum, arc));
    const wx = G.vacuum ? null : WN.weatherAt(D0);
    const object = { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 };
    const fitBytes = async (lines, pcf) => {
      const fit = await invoke('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: S.oemBytes({ frame: 'GCRF', object, lines, useableStart: lines[0].epoch, useableStop: WN.iso(D0) }) }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(wx ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: wx.spw }] : [])]);
      return new Uint8Array(fit.outputs.find((o) => o.portId === 'elements').payload);
    };
    let ocm = await fitBytes(thin, choice.pcf), fitProcess = 'the full arc';
    if (carrying) {
      const thin72 = WN.arcOf(truth.lines.filter((l) => { const t = WN.ms(l.epoch); return t >= D0 - 72 * HOUR && t <= D0; }), 72);
      const fitOnce = async ({ thin: t = thin, pcf: p, record }) => { const o = await fitBytes(t, p); return record ? { ocm: o } : { ocm: o, fit: { sigmaLnB: A.carriedTerms(o).sLnB } }; };
      // the object's maneuvering state at the cutoff by the burn lists (--burns), as the table reads it (lib/arms.mjs maneuverState)
      const { m } = A.maneuverState({ burns: BURNS, group: w.group, name: w.name, D0, last: truth.lines.filter((l) => WN.ms(l.epoch) <= D0).at(-1), version: ruleVersion });
      const kept = await A.carry24Fit({ x: { ocm, fit: { sigmaLnB: A.carriedTerms(ocm).sLnB } }, fitOnce, thin72, pcf: choice.pcf, pcf72: capsOf(A.apPcfFor(w.group, build.version, !!G.vacuum, 72)).pcf, version: ruleVersion, maneuvering: !!m?.maneuvering });
      ocm = kept.x.ocm; fitProcess = kept.fitProcess;
    }
    return { ocm, record: S.OCM.OCM.getRootAsOCM(new S.flatbuffers.ByteBuffer(ocm)).unpack(), pcf: choice.label, fitProcess, sc };
  }
  /** The record flown with its covariance on the scored epochs (GCRF), each epoch's error and stated R, T, N variances in the truth's axes. */
  async function fly(ocmBytes, sc) {
    const r = await invoke('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocmBytes }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(sc.epochs) }]);
    const bytes = new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload);
    const prefixed = String.fromCharCode(...bytes.slice(8, 12)) === '$OEM';
    const blk = (prefixed ? S.OEM.OEM.getSizePrefixedRootAsOEM(new S.flatbuffers.ByteBuffer(bytes)) : S.OEM.OEM.getRootAsOEM(new S.flatbuffers.ByteBuffer(bytes))).unpack().EPHEMERIS_DATA_BLOCK[0];
    const lines = blk.EPHEMERIS_DATA_LINES, cov = blk.COVARIANCE_MATRIX_LINES ?? [];
    if (lines.length !== sc.epochs.length || cov.length !== lines.length) throw new Error(`propagate: ${lines.length} states, ${cov.length} covariance lines, ${sc.epochs.length} epochs`);
    return (await pairStats(lines.map((l, i) => ({ id: String(i), predicted: { position: [l.X, l.Y, l.Z], velocity: [l.X_DOT, l.Y_DOT, l.Z_DOT], covariance: full6(cov[i]), covarianceAxes: 'INERTIAL' }, truth: { position: sc.truth[i].r, velocity: sc.truth[i].v } })))).map((s) => ({ e: s.errorRtn, v: [s.predictedRtn[0], s.predictedRtn[2], s.predictedRtn[5]] }));
  }
  /** The record with its COV_PROPAGATION edited by fn, packed again. */
  const editRecord = (ocm, fn) => { const o = S.OCM.OCM.getRootAsOCM(new S.flatbuffers.ByteBuffer(ocm)).unpack(); fn(o.COV_PROPAGATION); const b = new S.flatbuffers.Builder(1 << 16); S.OCM.OCM.finishOCMBuffer(b, o.pack(b)); return b.asUint8Array().slice(); };
  // every 30 min of the 5 min scored grid, as seconds after the cutoff
  const kept = (sc, w) => sc.epochs.map((e, i) => i).filter((i) => i % 6 === 5);
  const seconds = (sc, w, keep) => keep.map((i) => Math.round((WN.ms(sc.epochs[i]) - w.D0) / 1000));
  return { WN, A, S, build, invoke, fitRecord, fly, editRecord, kept, seconds, destroy: async () => { await ap.destroy?.(); } };
}
