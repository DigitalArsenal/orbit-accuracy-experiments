// Standard record bindings for conversion; no archive, module checkout or environment lookup.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
export const flatbuffers = require('flatbuffers');
async function bindings(schema, names) {
  const out = {};
  for (const name of names) Object.assign(out, await import(pathToFileURL(require.resolve(`spacedatastandards.org/lib/js/${schema}/${name}.js`)).href));
  return out;
}
export const OCM = await bindings('OCM', ['OCM', 'Header', 'Metadata', 'OCMMeanElements', 'Perturbations', 'RFM', 'RFMUnion', 'CustomFrameWrapper', 'CustomFrame', 'CelestialFrameWrapper', 'CelestialFrame', 'ATM', 'AtmosphericModelFamily', 'OCMDynamicParameter', 'OrbitDetermination', 'ocmMessageStatus', 'ocmTrajectoryBasis', 'trajectoryType', 'OCMIntegrator', 'PVN', 'pvnSourceKind', 'OCMSeedSet']);
export const PCF = await bindings('PCF', ['PCF', 'PCFOutput', 'pcfOutputFrame', 'pcfWeatherSource']);
const { OEM } = await bindings('OEM', ['OEM']);
export const TYPE = (code) => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
export function oemLines(bytes) {
  const blk = OEM.getRootAsOEM(new flatbuffers.ByteBuffer(bytes)).unpack().EPHEMERIS_DATA_BLOCK[0];
  if (blk.EPHEMERIS_DATA_LINES?.length) return blk.EPHEMERIS_DATA_LINES.map((l) => ({ r: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] }));
  const d = blk.EPHEMERIS_DATA, size = blk.STATE_VECTOR_SIZE || 6;
  return Array.from({ length: d.length / size }, (_, k) => ({ r: d.slice(k * size, k * size + 3), v: d.slice(k * size + 3, k * size + 6) }));
}
