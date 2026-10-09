// Shared by E2b's steps: configuration, the window guard, inputs, the module
// and run outputs. Orbit computation happens only in analysis/gp-error-model.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { loadModule, modulesRoot, sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { ReferenceIndex } from '../../harness/reference.mjs';
import { readElementSets, shiftDay, epochMs } from '../../harness/gp-archive.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const DAY_MS = 86400000;
export const REGIMES = Object.keys(config.regimes);

// The test window stays locked until PLAN.md and config.json are frozen by a
// commit (PLAN.md section 8): `frozen` must be true and both files committed
// and unchanged in this checkout (E2's guard).
export function assertWindowReadable(name) {
  if (name !== 'test') return;
  if (config.frozen !== true) throw new Error('the test window is locked until config.json is frozen (PLAN.md section 8)');
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error('the test window is locked: PLAN.md or config.json differs from its frozen commit');
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error('the test window is locked: PLAN.md and config.json are not committed');
}

export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'train' },
      regime: { type: 'string' },
      modules: { type: 'string' },
      archive: { type: 'string' },
      reference: { type: 'string' },
      objects: { type: 'string' },
      ...extra,
    },
  });
  const window = config.windows[values.window];
  if (!window) throw new Error(`unknown window ${values.window}; one of ${Object.keys(config.windows).join(', ')}`);
  assertWindowReadable(values.window);
  const regimes = values.regime ? values.regime.split(',') : REGIMES;
  for (const r of regimes) if (!config.regimes[r]) throw new Error(`unknown regime ${r}`);
  return {
    values,
    regimes,
    window: { name: values.window, from: window[0], to: window[1],
      lo: Date.parse(`${window[0]}T00:00:00Z`), hi: Date.parse(`${window[1]}T00:00:00Z`) + DAY_MS },
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    reference: path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference),
    objects: values.objects ? new Set(values.objects.split(',').map(Number)) : null,
  };
}

// The regime's objects: the configured list, or (GPS) every object whose
// index entry in the regime's products names the selection (E2's rule).
export function regimeObjects(referenceDir, name) {
  const regime = config.regimes[name];
  if (regime.objects) return [...regime.objects];
  const out = new Set();
  for (const product of fs.readdirSync(referenceDir).filter((n) => regime.products.some((p) => n.startsWith(p)))) {
    const file = path.join(referenceDir, product, 'index.json');
    if (!fs.existsSync(file)) continue;
    for (const o of JSON.parse(fs.readFileSync(file, 'utf8')).objects) if (o.comment?.includes(regime.select)) out.add(o.norad);
  }
  return [...out].sort((a, b) => a - b);
}

// The regime's precise orbits: its products, plus the fallback products' days
// where the primary has none (never both for one object and time; E2).
// Each span's sampling interval is the product name's (ESA, IGS) or, when
// the name carries none (Swarm, Sentinel-1, SLR arcs: 10 s to 15 min), the
// span's own: (stop - start) / (epochs - 1) from its index entry.
export function regimeReference(referenceDir, name) {
  const regime = config.regimes[name];
  const index = new ReferenceIndex(referenceDir, regime.products);
  if (regime.fallbackProducts) {
    const fallback = new ReferenceIndex(referenceDir, regime.fallbackProducts);
    for (const [norad, spans] of fallback.byObject) {
      const own = index.byObject.get(norad) ?? [];
      const extra = spans.filter((s) => !own.some((o) => o.start < s.stop && s.start < o.stop));
      if (extra.length) index.byObject.set(norad, [...own, ...extra].sort((a, b) => a.start - b.start));
    }
    index.products.push(...fallback.products);
  }
  const steps = new Map();
  for (const product of new Set([...index.byObject.values()].flat().filter((s) => !s.stepSeconds).map((s) => s.product))) {
    for (const o of JSON.parse(fs.readFileSync(path.join(referenceDir, product, 'index.json'), 'utf8')).objects)
      if (o.epochs > 1) steps.set(path.join(product, o.file), Math.round((Date.parse(o.stop) - Date.parse(o.start)) / 1000 / (o.epochs - 1)));
  }
  for (const spans of index.byObject.values()) for (const s of spans) if (!s.stepSeconds) s.stepSeconds = steps.get(s.file) ?? null;
  return index;
}

// Every E2b object, all regimes.
export function allObjects(referenceDir) {
  return [...new Set(REGIMES.flatMap((r) => regimeObjects(referenceDir, r)))].sort((a, b) => a - b);
}

// Element sets with epochs in [from - 30 d, to + 2 d] for every E2b object,
// read once per window and cached in runs/cache (element sets never leave
// this machine; steps/05-sets.mjs builds the cache before parallel runs),
// returned for the requested objects. Each set carries its epoch text,
// creation date, and epoch and creation in ms.
export const SET_LEAD_DAYS = 30;
export function windowSets(archive, referenceDir, window, objects) {
  const every = allObjects(referenceDir);
  const from = shiftDay(window.from, -SET_LEAD_DAYS), to = shiftDay(window.to, 2);
  const key = sha256(Buffer.from(JSON.stringify({ from, to, objects: every, e: config.elementSets }))).slice(0, 16);
  const file = path.join(repoRoot, 'runs', 'cache', `e2b-sets-${window.name}-${key}.json.gz`);
  let read;
  if (fs.existsSync(file)) read = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  else {
    const set = new Set(every);
    read = readElementSets(archive, from, to, {
      keep: (n) => set.has(n), theory: config.elementSets.meanElementTheory, ephemerisType: config.elementSets.ephemerisType,
      duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds, lagDays: config.elementSets.lagDays,
    });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, zlib.gzipSync(JSON.stringify({ sets: read.sets, files: read.files })));
    fs.renameSync(tmp, file);
  }
  const wanted = new Set(objects);
  const byObject = new Map();
  for (const s of read.sets) {
    if (!wanted.has(s.norad)) continue;
    const t = { ...s, ms: epochMs(s.epoch), createdMs: epochMs(s.creationDate) };
    if (!byObject.has(s.norad)) byObject.set(s.norad, []);
    byObject.get(s.norad).push(t);
  }
  for (const list of byObject.values()) list.sort((a, b) => a.ms - b.ms);
  return { byObject, files: read.files };
}

// ISO 8601 UTC without a zone, millisecond precision (the module parses it).
export const isoMs = (ms) => new Date(ms).toISOString().replace('Z', '');

// analysis/gp-error-model, refused unless it is the artifact config.json pins.
export async function loadGp(modules, run) {
  const gp = await loadModule(modules, 'analysis/gp-error-model');
  const pin = config.modules['analysis/gp-error-model'].wasmSha256;
  if (gp.provenance.wasmSha256 !== pin) throw new Error(`analysis/gp-error-model wasm ${gp.provenance.wasmSha256} is not the pinned ${pin}`);
  run.addModule(gp.provenance);
  return gp;
}

// JSON lines, gzipped, under a run directory.
export function jsonlWriter(file) {
  const gz = zlib.createGzip();
  const out = fs.createWriteStream(file);
  gz.pipe(out);
  let rows = 0;
  return {
    write(row) { gz.write(`${JSON.stringify(row)}\n`); ++rows; },
    async close() {
      gz.end();
      await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
      return rows;
    },
  };
}
export async function* readJsonl(file) {
  const lines = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) if (line) yield JSON.parse(line);
}
// The rows of a step's runs: runs/<id>/<name>.jsonl.gz for each id.
export async function readRuns(ids, name, filter = () => true) {
  const rows = [];
  for (const id of ids) for await (const row of readJsonl(path.join(repoRoot, 'runs', id, `${name}.jsonl.gz`))) if (filter(row)) rows.push(row);
  return rows;
}
// Ten significant digits: sub-millimetre for kilometre errors.
export const trim = (xs) => xs.map((x) => Number(x.toPrecision(10)));
