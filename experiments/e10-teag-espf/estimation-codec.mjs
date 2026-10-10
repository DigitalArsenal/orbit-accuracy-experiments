// $EST framing for analysis/estimation (module-local Estimation.fbs, extension
// v3): the generated object API, so every double crosses the wire exactly (the
// module refuses an answer whose seed differs in any bit). The bindings are
// generated at load time by flatc from the modules checkout's schema and the
// SDK's, as the module's own tests/wire.mjs does. Representation only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Builder, ByteBuffer } from 'flatbuffers';
import createFlatc from 'flatc-wasm/module';

export const EST_TYPE = { schemaName: 'Estimation.fbs', fileIdentifier: '$EST', rootTypeName: 'EstimationEnvelope' };
const here = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = path.resolve(here, '../../node_modules');

export async function estimationCodec(modulesDir) {
  const flatc = await createFlatc({ print: () => {}, printErr: () => {} });
  flatc.FS.mkdir('/schema');
  flatc.FS.mkdir('/out');
  const sdkSchemas = path.join(nodeModules, 'space-data-module-sdk/schemas/orbpro');
  for (const name of fs.readdirSync(sdkSchemas).filter((n) => n.endsWith('.fbs'))) flatc.FS.writeFile(`/schema/${name}`, fs.readFileSync(path.join(sdkSchemas, name)));
  const schema = fs.readFileSync(path.join(modulesDir, 'analysis/estimation/schemas/Estimation.fbs'));
  flatc.FS.writeFile('/schema/Estimation.fbs', schema);
  const rc = flatc.callMain(['--no-warnings', '-I', '/schema', '-o', '/out', '--ts', '--gen-object-api', '--gen-all', '/schema/Estimation.fbs']);
  if (rc !== 0) throw new Error(`flatc --ts failed (${rc})`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'e10-est-codec-'));
  let api;
  try {
    const copy = (dir, out) => {
      fs.mkdirSync(out, { recursive: true });
      for (const name of flatc.FS.readdir(dir)) {
        if (name === '.' || name === '..') continue;
        const source = `${dir}/${name}`;
        if (flatc.FS.isDir(flatc.FS.stat(source).mode)) copy(source, path.join(out, name));
        else if (name.endsWith('.ts')) fs.writeFileSync(path.join(out, name), flatc.FS.readFile(source));
      }
    };
    copy('/out', temp);
    const dir = path.join(temp, 'orbpro/estimation');
    fs.writeFileSync(path.join(temp, 'all.ts'), fs.readdirSync(dir).filter((n) => n.endsWith('.ts')).map((n) => `export * from './orbpro/estimation/${n.slice(0, -3)}';`).join('\n'));
    const result = await build({ entryPoints: [path.join(temp, 'all.ts')], bundle: true, write: false, format: 'esm', platform: 'node', nodePaths: [nodeModules] });
    api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  const T = (name, fields = {}) => Object.assign(new api[`${name}T`](), fields);
  return {
    api, T,
    schemaSha256: (await import('node:crypto')).createHash('sha256').update(schema).digest('hex'),
    unpack: (bytes) => api.EstimationEnvelope.getRootAsEstimationEnvelope(new ByteBuffer(new Uint8Array(bytes))).unpack(),
    pack: (object) => { const b = new Builder(1 << 16); b.finish(object.pack(b), '$EST'); return b.asUint8Array().slice(); },
    frame: (portId, bytes) => ({ portId, typeRef: EST_TYPE, payload: bytes }),
  };
}

// Epoch labels: {jdDay, seconds} with seconds in [0, 86400) from a UTC instant
// (ms). The estimator treats them as labels; the propagator port reads them
// as UTC (hpop.mjs).
export function epochOf(ms) {
  const jd = ms / 86400000 + 2440587.5;
  const day = Math.floor(jd - 0.5) + 0.5;
  return { jdDay: day, seconds: (ms - (day - 2440587.5) * 86400000) / 1000 };
}
export const msOfEpoch = (e) => (e.jdDay - 2440587.5) * 86400000 + e.seconds * 1000;
