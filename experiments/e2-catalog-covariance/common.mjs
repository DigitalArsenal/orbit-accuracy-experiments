// Shared by E2's steps: configuration, the window guard, inputs and modules.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { loadModule, modulesRoot, sha256 } from '../../harness/modules.mjs';
import { repoRoot } from '../../harness/provenance.mjs';
import { PRW_TYPE, kernelFrame } from '../../harness/prw.mjs';
import { readElementSets, shiftDay } from '../../harness/gp-archive.mjs';
import { estimationCodec } from './estimation-wire.mjs';

export const experimentDir = path.dirname(new URL(import.meta.url).pathname);
export const configPath = path.join(experimentDir, 'config.json');
export const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
export const DAY_MS = 86400000;

// The test window stays locked until PLAN.md and config.json are frozen by a
// commit (PLAN.md section 7): `frozen` must be true and both files must be
// committed and unchanged in this checkout.
export function assertWindowReadable(name) {
  if (name !== 'test') return;
  if (config.frozen !== true) throw new Error('the test window is locked until config.json is frozen (PLAN.md section 7)');
  const files = ['config.json', 'PLAN.md'].map((f) => path.relative(repoRoot, path.join(experimentDir, f)));
  const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
  if (git('status', '--porcelain', '--', ...files)) throw new Error('the test window is locked: PLAN.md or config.json differs from its frozen commit');
  if (!git('log', '-1', '--format=%H', '--', ...files)) throw new Error('the test window is locked: PLAN.md and config.json are not committed');
}

export function cli(extra = {}) {
  const { values } = parseArgs({
    options: {
      window: { type: 'string', default: 'dev' },
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
  return {
    values,
    window: { name: values.window, from: window[0], to: window[1] },
    modules: modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot }),
    archive: path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory),
    reference: path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? config.inputs.reference),
    objects: values.objects ? new Set(values.objects.split(',').map(Number)) : null,
  };
}

// Objects of a regime with reference states: NORAD -> true, from the
// products' index files (the selection string is matched against each
// object's provenance comment, e.g. "SP3 satellite G" for GPS).
export function regimeObjects(referenceDir, regime) {
  const out = new Set();
  for (const product of fs.readdirSync(referenceDir).filter((n) => n.startsWith(regime.productPrefix))) {
    const file = path.join(referenceDir, product, 'index.json');
    if (!fs.existsSync(file)) continue;
    for (const o of JSON.parse(fs.readFileSync(file, 'utf8')).objects) if (o.comment?.includes(regime.select)) out.add(o.norad);
  }
  return out;
}

// Element sets for the window, with margins for fit spans before it and
// consecutive sets after it, cached in runs/cache (element sets never leave
// this machine). Returns {sets, files}.
export function windowSets(archive, window, objects) {
  const from = shiftDay(window.from, -Math.max(...config.products.fitSpansDays) - 1);
  const to = shiftDay(window.to, 8);
  const key = sha256(Buffer.from(JSON.stringify({ from, to, objects: [...objects].sort((a, b) => a - b), e: config.elementSets }))).slice(0, 16);
  const file = path.join(repoRoot, 'runs', 'cache', `e2-sets-${window.name}-${key}.json.gz`);
  if (fs.existsSync(file)) return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const read = readElementSets(archive, from, to, {
    keep: (n) => objects.has(n), theory: config.elementSets.meanElementTheory, ephemerisType: config.elementSets.ephemerisType,
    duplicateEpochSeconds: config.elementSets.duplicateEpochSeconds, lagDays: 3,
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({ sets: read.sets, files: read.files })));
  return { sets: read.sets, files: read.files };
}

// Earth orientation rows from IERS finals2000A through data-source/eop-parser,
// framed as PRW EARTH_ORIENTATION for MJD [from, to].
export async function eopRecords(parser, file) {
  const body = fs.readFileSync(file);
  const response = await parser.invoke('parse_finals2000a', [{ portId: 'body', payload: body, typeRef: { wireFormat: 'aligned-binary', requiredAlignment: 1, byteLength: body.length } }]);
  const out = Buffer.from(response.outputs.find((f) => f.portId === 'records').payload);
  const records = [];
  for (let at = 0; at < out.length;) {
    const n = out.readUInt32LE(at);
    const row = P.EOP.getRootAsEOP(new fb.ByteBuffer(new Uint8Array(out.subarray(at + 4, at + 4 + n)))).unpack();
    records.push({ mjd: row.MJD, row });
    at += 4 + n;
  }
  return { records, sha256: sha256(body) };
}
export function eopFrame(records, fromMjd, toMjd) {
  const rows = records.filter((r) => r.mjd >= fromMjd && r.mjd <= toMjd).map((r) => r.row);
  if (!rows.length) throw new Error(`no EOP rows for MJD ${fromMjd}..${toMjd}`);
  const b = new fb.Builder(1 << 16);
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EARTH_ORIENTATION: Object.assign(new P.PRWEarthOrientationT(), { ROWS: rows }) }).pack(b));
  return { portId: 'earth_orientation', typeRef: PRW_TYPE, payload: b.asUint8Array().slice() };
}
export const mjdOf = (ms) => Math.floor(ms / DAY_MS) + 40587;

// The modules and fixed inputs every product step uses.
export async function productContext(modules, run) {
  const kernelPath = path.join(repoRoot, config.inputs.kernel.path);
  if (!fs.existsSync(kernelPath)) throw new Error(`DE440s kernel missing: fetch ${config.inputs.kernel.url} to ${config.inputs.kernel.path}`);
  const kernelBytes = fs.readFileSync(kernelPath);
  if (sha256(kernelBytes) !== config.inputs.kernel.sha256) throw new Error('DE440s kernel bytes differ from the pinned SHA-256');
  run.addInputs('kernel', { [path.basename(kernelPath)]: config.inputs.kernel.sha256 });
  const names = ['analysis/epoch-state', 'analysis/estimation', 'propagator/hpop', 'data-source/eop-parser'];
  const loaded = {};
  for (const name of names) { loaded[name] = await loadModule(modules, name); run.addModule(loaded[name].provenance); }
  const eop = await eopRecords(loaded['data-source/eop-parser'], config.inputs.eopFinals);
  run.addInputs('eop', { [path.basename(config.inputs.eopFinals)]: eop.sha256 });
  const kernel = kernelFrame(kernelBytes);
  const codec = await estimationCodec(modules, path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  return {
    epochState: loaded['analysis/epoch-state'], estimation: loaded['analysis/estimation'], hpop: loaded['propagator/hpop'],
    codec, eop,
    inputsFor: (fromMs, toMs) => [kernel, eopFrame(eop.records, mjdOf(fromMs) - 2, mjdOf(toMs) + 2)],
    async destroy() { for (const m of Object.values(loaded)) await m.destroy(); },
  };
}
