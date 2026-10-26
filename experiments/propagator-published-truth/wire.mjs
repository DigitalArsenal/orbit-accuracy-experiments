// Typed framing and unit conversion only. Physics remains in the modules.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
export async function wire(modules) {
  const req = createRequire(path.join(modules, 'propagator/sdn-ap/package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const base = path.dirname(req.resolve('spacedatastandards.org/package.json'));
  const load = code => import(pathToFileURL(path.join(base, 'lib/js', code, 'main.js')).href);
  const [OEM, OMM, PCF, RFM, SPW, PRW, CQR] = await Promise.all(['OEM', 'OMM', 'PCF', 'RFM', 'SPW', 'PRW', 'CQR'].map(load));
  const type = code => ({ schemaName: `${code}.fbs`, fileIdentifier: `$${code}`, rootTypeName: code, wireFormat: 'flatbuffer' });
  const encode = (mod, code, value, prefix = false) => { const b = new fb.Builder(1 << 16); b[prefix ? 'finishSizePrefixed' : 'finish'](value.pack(b), `$${code}`); return b.asUint8Array().slice(); };
  const unpack = (mod, code, bytes) => { const u = new Uint8Array(bytes), prefixed = String.fromCharCode(...u.slice(8, 12)) === `$${code}`; return mod[code][prefixed ? `getSizePrefixedRootAs${code}` : `getRootAs${code}`](new fb.ByteBuffer(u)).unpack(); };
  const frame = (portId, code, payload) => ({ portId, typeRef: type(code), payload });
  const rfm = name => Object.assign(new RFM.RFMT(RFM.RFMUnion.CelestialFrameWrapper, new RFM.CelestialFrameWrapperT(RFM.CelestialFrame[name === 'TEME' ? 'TEMEOFDATE' : name])), { NAME: name });
  const covKeys = ['CX_X','CY_X','CY_Y','CZ_X','CZ_Y','CZ_Z','CX_DOT_X','CX_DOT_Y','CX_DOT_Z','CX_DOT_X_DOT','CY_DOT_X','CY_DOT_Y','CY_DOT_Z','CY_DOT_X_DOT','CY_DOT_Y_DOT','CZ_DOT_X','CZ_DOT_Y','CZ_DOT_Z','CZ_DOT_X_DOT','CZ_DOT_Y_DOT','CZ_DOT_Z_DOT'];
  const covariance = c => {
    if (!c) return null;
    const lower = covKeys.map(k => c[k]), full = Array(36).fill(0);
    let n = 0; for (let i = 0; i < 6; i++) for (let j = 0; j <= i; j++) full[i * 6 + j] = full[j * 6 + i] = lower[n++];
    return full;
  };
  const lines = block => {
    // CCSDS UTC fields may omit Z; never let the host timezone interpret them.
    const utc = s => /(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? s : `${s}Z`;
    const cov = new Map((block.COVARIANCE_MATRIX_LINES || []).map(c => [Date.parse(utc(c.EPOCH)), covariance(c)]));
    return block.EPHEMERIS_DATA_LINES.map(l => ({ epoch: utc(l.EPOCH), ms: Date.parse(utc(l.EPOCH)), r: [l.X,l.Y,l.Z], v: [l.X_DOT,l.Y_DOT,l.Z_DOT], covariance: cov.get(Date.parse(utc(l.EPOCH))) || null }));
  };
  const oem = (list, norad, axes = 'GCRF') => {
    const block = Object.assign(new OEM.ephemerisDataBlockT(), { OBJECT: Object.assign(new OEM.CATT(), { NORAD_CAT_ID: norad, OBJECT_NAME: String(norad) }), CENTER_NAME: 'EARTH', REFERENCE_FRAME: rfm(axes), TIME_SYSTEM: OEM.timingStandard.UTC,
      START_TIME: list[0].epoch, STOP_TIME: list.at(-1).epoch, USEABLE_START_TIME: list[0].epoch, USEABLE_STOP_TIME: list.at(-1).epoch,
      EPHEMERIS_DATA_LINES: list.map(l => Object.assign(new OEM.ephemerisDataLineT(), { EPOCH: l.epoch, X:l.r?.[0] || 0,Y:l.r?.[1] || 0,Z:l.r?.[2] || 0,X_DOT:l.v?.[0] || 0,Y_DOT:l.v?.[1] || 0,Z_DOT:l.v?.[2] || 0 })) });
    return encode(OEM, 'OEM', Object.assign(new OEM.OEMT(), { CCSDS_OEM_VERS:2, ORIGINATOR:'Published-reference benchmark', EPHEMERIS_DATA_BLOCK:[block] }));
  };
  const pcf = msis => {
    const p = Object.assign(new PCF.PCFT(), { THEORY: PCF.pcfTheory.SGP4XP });
    if (msis) p.FORCES = Object.assign(new PCF.PCFForceModelT(), { EPHEMERIS_SOURCE:'', ENABLE_DRAG:true, ATMOSPHERE_MODEL:PCF.pcfAtmosphereFamily.NRLMSISE00, WEATHER_SOURCE:PCF.pcfWeatherSource.RECORDS, WEATHER_EXTENSION:PCF.pcfWeatherExtension.HOLD_LAST });
    return encode(PCF, 'PCF', p);
  };
  const spw = rows => {
    const parts = rows.map(r => encode(SPW, 'SPW', Object.assign(new SPW.SPWT(), { DATE:r.date,F107_OBS:r.f107,F107_OBS_CENTER81:r.c81,AP_AVG:r.ap,F107_DATA_TYPE:SPW.F107DataType.OBS }), true));
    return new Uint8Array(Buffer.concat(parts));
  };
  return { req,fb,OEM,OMM,PCF,PRW,CQR,type,encode,unpack,frame,lines,oem,pcf,spw };
}
