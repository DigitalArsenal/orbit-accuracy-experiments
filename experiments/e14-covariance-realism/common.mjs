// Shared by E14's steps: configuration and windows (windows.mjs), modules, element sets, truth, run outputs.
// Orbit computation happens only in modules; this file moves records and bookkeeping.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { loadModule, modulesRoot, sha256, json } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { ReferenceIndex } from '../../harness/reference.mjs';
import { gateOemFrame } from '../../harness/truth-gate.mjs';
import { readElementSets, shiftDay, epochMs } from '../../harness/gp-archive.mjs';
import { decodeOemStream } from '../../harness/records.mjs';
import { config, configPath, experimentDir, assertWindowReadable, assertSpanReadable, windowSpanMs } from './windows.mjs';

export { config, configPath, experimentDir, json, epochMs };
export const DAY_MS = 86400000;
export const HOUR_MS = 3600000;
export const REGIMES = config.regimes.map((r) => r.id);
export const storeDir = config.inputs.store;

// ISO 8601 UTC without a zone, millisecond precision (the modules parse it).
export const isoMs = (ms) => new Date(ms).toISOString().replace('Z', '');
export const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// A long window by name: {name, from, to, lo, hi} (ms, [lo, hi)). Readability is checked by the caller's cli().
export function windowOf(name) {
  const [lo, hi] = windowSpanMs(name);
  return { name, from: config.windows[name][0], to: config.windows[name][1], lo, hi };
}

export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'devFit' },
      regime: { type: 'string' },
      objects: { type: 'string' },
      modules: { type: 'string' },
      archive: { type: 'string' },
      ...extra,
    },
  });
  assertWindowReadable(values.window);
  return {
    values,
    window: config.windows[values.window] ? windowOf(values.window) : { name: values.window },
    regimes: values.regime ? values.regime.split(',') : REGIMES,
    objects: values.objects ? new Set(values.objects.split(',').map(Number)) : null,
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
  };
}

// A module, pinned when config.json pins it (at the freeze); its provenance goes into the run.
export async function moduleOf(modules, relative, run) {
  const m = await loadModule(modules, relative);
  const pin = config.modules?.[relative]?.wasmSha256;
  if (pin && m.provenance.wasmSha256 !== pin) throw new Error(`${relative} wasm ${m.provenance.wasmSha256} is not the pinned ${pin}`);
  run?.addModule(m.provenance);
  return m;
}
// JSON in, JSON out (first output frame, or the named port).
export async function callJson(module, methodId, inputs, outPort = null) {
  const r = await module.invoke(methodId, inputs);
  const frame = outPort ? r.outputs.find((o) => o.portId === outPort) : r.outputs[0];
  return JSON.parse(Buffer.from(frame.payload).toString('utf8'));
}

// ── truth: every product under every configured reference root, per object ──
// Each span's sampling interval: the product name's, else (stop - start) / (epochs - 1) from its index entry.
// The stated sigma (m, per axis) of a product, when its index states one.
export class Truth {
  constructor(roots = config.inputs.reference) {
    this.roots = roots.filter((r) => fs.existsSync(r));
    this.byObject = new Map();
    this.products = [];
    this.indices = [];
    for (const root of this.roots) {
      const products = fs.readdirSync(root).filter((n) => fs.existsSync(path.join(root, n, 'index.json')));
      const index = new ReferenceIndex(root, ['']);  // every product directory with an index.json
      this.indices.push(index);
      for (const p of index.products) this.products.push({ root, ...p });
      const meta = new Map();
      for (const product of products) {
        const raw = JSON.parse(fs.readFileSync(path.join(root, product, 'index.json'), 'utf8'));
        for (const o of raw.objects) meta.set(path.join(product, o.file), { epochs: o.epochs, start: o.start, stop: o.stop, sigma: raw.statedSigmaM ?? null });
      }
      for (const [norad, spans] of index.byObject) {
        for (const s of spans) {
          const m = meta.get(s.file);
          const step = s.stepSeconds ?? (m && m.epochs > 1 ? Math.round((Date.parse(m.stop) - Date.parse(m.start)) / 1000 / (m.epochs - 1)) : null);
          const list = this.byObject.get(norad) ?? [];
          list.push({ ...s, root, index, stepSeconds: step, statedSigmaM: m?.sigma ?? null });
          this.byObject.set(norad, list);
        }
      }
    }
    for (const list of this.byObject.values()) list.sort((a, b) => a.start - b.start);
    this.read = {};
  }
  objects() { return [...this.byObject.keys()].sort((a, b) => a - b); }
  spans(norad, fromMs, toMs) { return (this.byObject.get(norad) ?? []).filter((s) => s.stop >= fromMs && s.start <= toMs); }
  stepAt(norad, ms) { return (this.byObject.get(norad) ?? []).find((s) => s.start <= ms && ms <= s.stop)?.stepSeconds ?? null; }
  sigmaAt(norad, ms) { return (this.byObject.get(norad) ?? []).find((s) => s.start <= ms && ms <= s.stop)?.statedSigmaM ?? null; }
  // $OEM frames on `reference` for [fromMs, toMs]: the guard is asked first (a span in a test window needs the freeze); the states pass the
  // truth gate (harness/truth-gate.mjs), and the SHA-256 recorded is of the file as read.
  frames(norad, fromMs, toMs) {
    assertSpanReadable(fromMs, toMs);
    return this.spans(norad, fromMs, toMs).map((s) => {
      const file = path.join(s.root, s.file);
      const bytes = fs.readFileSync(file);
      this.read[path.relative('/', file)] = sha256(bytes);
      return { portId: 'reference', typeRef: { schemaName: 'OEM.fbs', fileIdentifier: '$OEM', rootTypeName: 'OEM', wireFormat: 'flatbuffer' }, payload: gateOemFrame(bytes, { product: s.product }).bytes };
    });
  }
  // Epochs whose radius departs from the mean of its neighbours' by more than limitKm (E2b's screen; read only).
  defects(norad, fromMs, toMs, limitKm = config.truth.radiusScreenKm) {
    const out = new Set();
    for (const span of this.spans(norad, fromMs, toMs)) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(span.root, span.file)));
      for (const oem of decodeOemStream(bytes)) for (const block of oem.EPHEMERIS_DATA_BLOCK ?? []) {
        const lines = (block.EPHEMERIS_DATA_LINES ?? []).map((l) => ({ t: Date.parse(/Z$/.test(l.EPOCH) ? l.EPOCH : `${l.EPOCH}Z`), epoch: l.EPOCH, r: Math.hypot(l.X, l.Y, l.Z) }))
          .sort((a, b) => a.t - b.t).filter((l, k, all) => k === 0 || l.t - all[k - 1].t > 1);
        const step = (span.stepSeconds ?? 60) * 1000 * 3;
        lines.forEach((l, k) => {
          let expected = null;
          const a = lines[k - 1], b = lines[k + 1], c = lines[k + 2], d = lines[k - 2];
          if (a && b && l.t - a.t <= step && b.t - l.t <= step) expected = (a.r + b.r) / 2;
          else if (b && c && b.t - l.t <= step && c.t - b.t <= step) expected = 2 * b.r - c.r;
          else if (a && d && l.t - a.t <= step && a.t - d.t <= step) expected = 2 * a.r - d.r;
          if (expected !== null && Math.abs(l.r - expected) > limitKm) out.add(l.epoch);
        });
      }
    }
    return out;
  }
}

// The truth objects: config.truth.objects (GPS: every object the ESA/IGS GPS products identify).
export function truthObjects(truth) {
  const out = new Set();
  for (const list of Object.values(config.truth.objects)) for (const o of list) {
    if (o === 'GPS') {
      for (const idx of truth.indices) for (const p of idx.products.filter((x) => /^(ESA0OPSFIN|IGS0OPSFIN)/.test(x.product))) {
        const raw = JSON.parse(fs.readFileSync(path.join(idx.dir, p.product, 'index.json'), 'utf8'));
        for (const ob of raw.objects) if (/SP3 satellite G\d/.test(ob.comment ?? '')) out.add(ob.norad);
      }
    } else if (o === 'MGEX') for (const n of mgexObjects(truth)) out.add(n);
    else out.add(o);
  }
  return [...out].sort((a, b) => a - b);
}

// The satellites of the MGEX product (config.truth.mgex), from its indices.
const mgexCache = new WeakMap();
export function mgexObjects(truth) {
  if (!config.truth.mgex) return new Set();
  if (mgexCache.has(truth)) return mgexCache.get(truth);
  const out = new Set();
  for (const idx of truth.indices) for (const p of idx.products.filter((x) => x.product.startsWith(config.truth.mgex.productPrefix))) {
    const raw = JSON.parse(fs.readFileSync(path.join(idx.dir, p.product, 'index.json'), 'utf8'));
    for (const ob of raw.objects) if (new RegExp(`SP3 satellite [${config.truth.mgex.systems.join('')}]\\d`).test(ob.comment ?? '')) out.add(ob.norad);
  }
  mgexCache.set(truth, out);
  return out;
}

// Element sets of the objects with epochs in [fromDay - leadDays, toDay + 2], cached under runs/cache (they never
// leave this machine). Each set: {norad, epoch, creationDate, gpId, elements, ms, createdMs}.
export function elementSets(archive, fromDay, toDay, objects) {
  const from = shiftDay(fromDay, -config.elementSets.leadDays), to = shiftDay(toDay, 2);
  const every = [...objects].sort((a, b) => a - b);
  const key = sha256(Buffer.from(JSON.stringify({ from, to, every, e: config.elementSets }))).slice(0, 16);
  const file = path.join(repoRoot, 'runs', 'cache', `e14-sets-${key}.json.gz`);
  let read;
  if (fs.existsSync(file)) read = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  else {
    const set = new Set(every);
    read = readElementSets(archive, from, to, { keep: (n) => set.has(n), theory: config.elementSets.meanElementTheory, ephemerisType: config.elementSets.ephemerisType,
      duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds, lagDays: config.elementSets.lagDays });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify({ sets: read.sets, files: read.files })));
    fs.renameSync(tmp, file);
  }
  const byObject = new Map();
  for (const s of read.sets) {
    const t = { ...s, ms: epochMs(s.epoch), createdMs: epochMs(s.creationDate) };
    if (!byObject.has(s.norad)) byObject.set(s.norad, []);
    byObject.get(s.norad).push(t);
  }
  for (const list of byObject.values()) list.sort((a, b) => a.ms - b.ms);
  return { byObject, files: read.files };
}

// ── run outputs: gzipped JSON lines ──
export function jsonlWriter(file) {
  const gz = zlib.createGzip();
  const out = fs.createWriteStream(file);
  gz.pipe(out);
  let rows = 0;
  return {
    write(row) { gz.write(`${JSON.stringify(row)}\n`); ++rows; },
    // Everything written so far, compressed and on its way to the file (a crash then loses at most the rows after it).
    flush() { return new Promise((resolve) => gz.flush(resolve)); },
    async close() { gz.end(); await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); }); return rows; },
  };
}
export async function* readJsonl(file) {
  const lines = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) yield JSON.parse(line);
}
export async function readRuns(ids, name, filter = () => true) {
  const rows = [];
  for (const id of ids) for await (const row of readJsonl(path.join(repoRoot, 'runs', id, `${name}.jsonl.gz`))) if (filter(row)) rows.push(row);
  return rows;
}
export const trim = (xs) => xs.map((x) => Number(x.toPrecision(10)));
export const resultsDir = (...parts) => { const d = path.join(repoRoot, 'results', 'e14', ...parts); fs.mkdirSync(d, { recursive: true }); return d; };
export const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 1)}\n`); };

// Wait while the machine is loaded (PLAN.md section 12): 1-minute load average above `limit`.
export async function waitForLoad(limit = Number(process.env.E14_LOAD_LIMIT ?? 40), log = console.log) {
  const os = await import('node:os');
  let warned = false;
  while (os.loadavg()[0] > limit) {
    if (!warned) { log(`load ${os.loadavg()[0].toFixed(1)} > ${limit}: waiting`); warned = true; }
    await new Promise((r) => setTimeout(r, 60000));
  }
}
