// Part H (PLAN.md): the provider's XP sets flown through propagator/sgp4-xp 0.2.1 as a black box (ingest_omm, propagate). The module's
// bytes come from the modules repository at the commit the plan names, SHA-256 checked, and are held in memory; nothing else of the
// module is opened. A set's values pass from the capture to the module and nowhere else: none is printed, written or fitted.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CONFIG, MODULES, utcMs } from './engine.mjs';

const X = CONFIG.xp;
const gitShow = (p) => execFileSync('git', ['-C', MODULES, 'show', `${X.modulesCommit}:${p}`], { maxBuffer: 1 << 28 });
const req = createRequire(path.join(MODULES, 'propagator/sdn-ap/package.json'));
const standards = path.dirname(req.resolve('spacedatastandards.org/package.json'));
const flatbuffers = await import(pathToFileURL(req.resolve('flatbuffers')).href);
const [OEM, OMM, OCM, RFM] = await Promise.all(['OEM', 'OMM', 'OCM', 'RFM'].map((c) => import(pathToFileURL(path.join(standards, `lib/js/${c}/main.js`)).href)));
const TYPE = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });

/** A grid of explicit epochs as a size-prefixed GCRF $OEM (the module's propagate takes its instants from it). */
function gridBytes(isoEpochs) {
  const t = Object.assign(new OEM.OEMT(), { CCSDS_OEM_VERS: 2.0, CREATION_DATE: '', ORIGINATOR: 'local' });
  const b = new OEM.ephemerisDataBlockT();
  b.OBJECT = Object.assign(new OEM.CATT(), { OBJECT_NAME: '', OBJECT_ID: '', NORAD_CAT_ID: 0 });
  b.CENTER_NAME = 'EARTH';
  b.REFERENCE_FRAME = Object.assign(new RFM.RFMT(RFM.RFMUnion.CelestialFrameWrapper, new RFM.CelestialFrameWrapperT(RFM.CelestialFrame.GCRF)), { NAME: 'GCRF' });
  b.TIME_SYSTEM = OEM.timingStandard.UTC;
  b.START_TIME = isoEpochs[0]; b.STOP_TIME = isoEpochs.at(-1);
  b.EPHEMERIS_DATA_LINES = isoEpochs.map((epoch) => Object.assign(new OEM.ephemerisDataLineT(), { EPOCH: epoch, X: 0, Y: 0, Z: 0, X_DOT: 0, Y_DOT: 0, Z_DOT: 0 }));
  t.EPHEMERIS_DATA_BLOCK = [b];
  const builder = new flatbuffers.Builder(1 << 16);
  OEM.OEM.finishSizePrefixedOEMBuffer(builder, t.pack(builder));
  return builder.asUint8Array().slice();
}
/** A two-line set's fields (G1 lib/tle.mjs setOf) as the SGP4XP $OMM the module ingests (BTERM in BSTAR, AGOM in MEAN_MOTION_DDOT). */
function xpOmmBytes(s) {
  const t = Object.assign(new OMM.OMMT(), {
    CCSDS_OMM_VERS: 3.0, CREATION_DATE: '', ORIGINATOR: 'local', OBJECT_NAME: '', OBJECT_ID: '', CENTER_NAME: 'EARTH', TIME_SYSTEM: OMM.timingStandard.UTC,
    MEAN_ELEMENT_THEORY: OMM.meanElementSource.SGP4XP, EPOCH: s.epoch, MEAN_MOTION: s.meanMotion, ECCENTRICITY: s.eccentricity, INCLINATION: s.inclination,
    RA_OF_ASC_NODE: s.raan, ARG_OF_PERICENTER: s.argPerigee, MEAN_ANOMALY: s.meanAnomaly, NORAD_CAT_ID: s.norad, BSTAR: s.bstar, MEAN_MOTION_DDOT: s.agom });
  const b = new flatbuffers.Builder(512);
  OMM.OMM.finishSizePrefixedOMMBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}
/** The XP module, hosted by the SDK of its own package. flyXp(set, msList) -> GCRF positions (km), and whether ingest kept the set's
 *  epoch, BTERM and AGOM unchanged. */
export async function openXp() {
  const bytes = gitShow(`${X.module}/dist/isomorphic/module.wasm`);
  const got = crypto.createHash('sha256').update(bytes).digest('hex');
  if (got !== X.wasmSha256) throw new Error(`${X.module} at ${X.modulesCommit} is ${got}, the plan names ${X.wasmSha256}`);
  const manifest = JSON.parse(gitShow(`${X.module}/plugin-manifest.json`).toString('utf8'));
  const entry = createRequire(path.join(MODULES, X.module, 'package.json')).resolve('space-data-module-sdk/host/browser-module');
  const { createBrowserModuleHarness } = await import(pathToFileURL(entry).href);
  const h = await createBrowserModuleHarness({ wasmSource: bytes, manifest, surface: 'direct' });
  const call = async (methodId, inputs) => {
    const r = await h.invoke({ methodId, inputs });
    if (r.statusCode !== 0) throw new Error(`${X.module} ${methodId}: ${r.errorCode ?? r.statusCode}`);
    return Object.fromEntries(r.outputs.map((o) => [o.portId, Buffer.from(o.payload)]));
  };
  return {
    async flyXp(s, msList) {
      const ocm = (await call('ingest_omm', [{ portId: 'omm', typeRef: TYPE('OMM'), payload: Buffer.from(xpOmmBytes(s)) }])).ocm;
      const u = new Uint8Array(ocm), prefixed = String.fromCharCode(...u.slice(8, 12)) === '$OCM';
      const me = (prefixed ? OCM.OCM.getSizePrefixedRootAsOCM(new flatbuffers.ByteBuffer(u)) : OCM.OCM.getRootAsOCM(new flatbuffers.ByteBuffer(u))).unpack().MEAN_ELEMENTS;
      const ingestKept = Math.abs(utcMs(me.EPOCH) - s.epochMs) < 1 && me.BTERM === s.bstar && me.AGOM === s.agom;
      const eph = (await call('propagate', [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'grid', typeRef: TYPE('OEM'), payload: Buffer.from(gridBytes(msList.map((t) => new Date(t).toISOString()))) }])).ephemeris;
      const e = new Uint8Array(eph);
      const blk = (String.fromCharCode(...e.slice(8, 12)) === '$OEM' ? OEM.OEM.getSizePrefixedRootAsOEM(new flatbuffers.ByteBuffer(e)) : OEM.OEM.getRootAsOEM(new flatbuffers.ByteBuffer(e))).EPHEMERIS_DATA_BLOCK(0);
      if (blk.ephemerisDataLinesLength() !== msList.length) throw new Error(`${X.module} propagate returned ${blk.ephemerisDataLinesLength()} of ${msList.length}`);
      const r = [];
      for (let i = 0; i < msList.length; i += 1) { const l = blk.EPHEMERIS_DATA_LINES(i); r.push([l.X(), l.Y(), l.Z()]); }
      return { r, ingestKept };
    },
    destroy: () => h.destroy(),
  };
}

/** The capture's sets: NORAD id -> the set's fields (G1 lib/tle.mjs), read in memory, never written. */
export async function captureSets(file) {
  const TLE = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname), '../../sdn-gp-starlink-ffm-match/lib/tle.mjs')).href);
  const zlib = await import('node:zlib');
  const map = TLE.readSets(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  return new Map([...map].map(([norad, pair]) => [norad, TLE.setOf(...pair)]));
}
