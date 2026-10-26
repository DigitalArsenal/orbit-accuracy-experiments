// The $CQR records part 5 (A4, A8) sends to analysis/conjunction-assessment, in the SDS bindings the module is built against (its own
// node_modules in the modules checkout): OEM explicit-sample sources (GCRF or TEME, optional covariance lines), the all-vs-all catalog request
// and the pair request; and the decoding of their results. Records only; screening, TCA, miss and Pc are the module's.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function openCqr(modules) {
  const nm = path.join(modules, 'analysis/conjunction-assessment/node_modules');
  const C = await import(pathToFileURL(path.join(nm, 'spacedatastandards.org/lib/js/CQR/main.js')));
  const fb = await import(pathToFileURL(path.join(nm, 'flatbuffers/mjs/flatbuffers.js')));
  const { loadModule } = await import(new URL('../../../harness/modules.mjs', import.meta.url));
  const ca = await loadModule(modules, 'analysis/conjunction-assessment');
  const TYPE = { schemaName: 'CQR.fbs', fileIdentifier: '$CQR', rootTypeName: 'CQR', wireFormat: 'flatbuffer' };
  const iso = (t) => new Date(t).toISOString();
  const jd = (t) => t / 86400e3 + 2440587.5;
  const rfm = (name) => new C.RFMT(C.RFMUnion.CelestialFrameWrapper, new C.CelestialFrameWrapperT(C.CelestialFrame[name]));
  const frames = {
    GCRF: () => Object.assign(new C.RFMCoordinateSystemT(), { NAME: 'GCRF', AXIS_TYPE: C.rfmAxisType.ICRF, ORIGIN: Object.assign(new C.RFMOriginT(), { KIND: C.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }) }),
    TEME: () => Object.assign(new C.RFMCoordinateSystemT(), { NAME: 'TEME', AXIS_TYPE: C.rfmAxisType.TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE, ORIGIN: Object.assign(new C.RFMOriginT(), { KIND: C.rfmOriginKind.CELESTIAL_BODY, CELESTIAL_BODY_ID: 399 }) }),
  };
  const sdsFrame = { GCRF: 'GCRF', TEME: 'TEMEOFDATE' };
  const encode = (record) => { const b = new fb.Builder(1 << 20); C.CQR.finishCQRBuffer(b, record.pack(b)); return b.asUint8Array(); };
  const decode = (bytes) => C.CQR.getRootAsCQR(new fb.ByteBuffer(new Uint8Array(bytes))).unpack();
  // a pair request takes no catalog filters: with the dynamic window on, its TCA search stopped at the window's first coarse step
  const controls = ({ startMs, seconds, thresholdM, algorithm = 'ALFANO_MAXIMUM', workers = 1, coarseStepSeconds = 60, filters = true }) => Object.assign(new C.CQRScreeningControlsT(), {
    START_EPOCH: Object.assign(new C.TIMInstantT(), { TIME_SYSTEM: C.timingStandard.UTC, EPOCH_FORMAT: C.timEpochRepresentation.JULIAN_DATE, JULIAN_DATE: jd(startMs) }),
    DURATION_SECONDS: seconds, THRESHOLD_M: thresholdM, REQUESTED_WORKERS: workers, COARSE_STEP_SECONDS: coarseStepSeconds, REFINEMENT_TOLERANCE_SECONDS: 0.001, COMBINED_RADIUS_M: 20,
    USE_KD_TREE: filters, USE_DYNAMIC_WINDOW: filters, USE_PERIGEE_FILTER: filters, ALGORITHM: C.cqrProbabilityAlgorithm[algorithm] });
  /** One object's OEM source: states [{ ms, r (km), v (km/s), covariance? (6 x 6 row-major, km^2 ...) }] in `frame`. */
  const source = (handle, norad, states, frame = 'GCRF') => {
    const b = new C.ephemerisDataBlockT();
    b.CENTER_NAME = 'EARTH'; b.CENTER_NAIF_ID = 399; b.REFERENCE_FRAME = rfm(sdsFrame[frame]); b.TIME_SYSTEM = C.timingStandard.UTC; b.INTERPOLATION = 'HERMITE';
    b.START_TIME = iso(states[0].ms); b.STOP_TIME = iso(states.at(-1).ms);
    b.EPHEMERIS_DATA_LINES = states.map((s) => Object.assign(new C.ephemerisDataLineT(), { EPOCH: iso(s.ms), X: s.r[0], Y: s.r[1], Z: s.r[2], X_DOT: s.v[0], Y_DOT: s.v[1], Z_DOT: s.v[2] }));
    if (states[0].covariance) {
      b.COV_REFERENCE_FRAME = rfm(sdsFrame[frame]);
      const L = ['CX_X', 'CY_X', 'CY_Y', 'CZ_X', 'CZ_Y', 'CZ_Z', 'CX_DOT_X', 'CX_DOT_Y', 'CX_DOT_Z', 'CX_DOT_X_DOT', 'CY_DOT_X', 'CY_DOT_Y', 'CY_DOT_Z', 'CY_DOT_X_DOT', 'CY_DOT_Y_DOT', 'CZ_DOT_X', 'CZ_DOT_Y', 'CZ_DOT_Z', 'CZ_DOT_X_DOT', 'CZ_DOT_Y_DOT', 'CZ_DOT_Z_DOT'];
      const lower = []; for (let i = 0; i < 6; i += 1) for (let j = 0; j <= i; j += 1) lower.push([i, j]);
      b.COVARIANCE_MATRIX_LINES = states.map((s) => Object.assign(new C.covarianceMatrixLineT(), { EPOCH: iso(s.ms), ...Object.fromEntries(L.map((k, q) => [k, s.covariance[lower[q][0] * 6 + lower[q][1]]])) }));
    }
    return Object.assign(new C.CQRObjectSourceT(), { OBJECT_ID: String(norad), OBJECT_NAME: `STARLINK ${norad}`, NORAD_CATALOG_ID: norad, SOURCE_HANDLE: handle, EPHEMERIS: Object.assign(new C.OEMT(), { EPHEMERIS_DATA_BLOCK: [b] }) });
  };
  const events = (list) => (list ?? []).map((e) => ({ a: Number(e.PRIMARY_ID), b: Number(e.SECONDARY_ID), tcaMs: (e.TCA.JULIAN_DATE - 2440587.5) * 86400e3, missM: e.MISS_DISTANCE_M, speedMS: e.RELATIVE_SPEED_M_S, pc: e.PROBABILITY?.PROBABILITY ?? null, pcConverged: e.PROBABILITY?.CONVERGED ?? null }));
  return {
    provenance: ca.provenance,
    /** screen_catalog of primaries (all-vs-all among them) or primaries x secondaries, drained: [events]. */
    async screen(primaries, secondaries, ctl, frame = 'GCRF') {
      const request = Object.assign(new C.CQRCatalogRequestT(), { PRIMARIES: primaries, SECONDARIES: secondaries ?? [], CONTROLS: controls(ctl), EVALUATION_FRAME: frames[frame]() });
      // the object API writes every vector, and the module reads a present ORDERED_CATALOG_INDICES as a catalog ordering: pack what is set
      request.pack = function (bb) {
        const R = C.CQRCatalogRequest;
        const p = R.createPrimariesVector(bb, this.PRIMARIES.map((x) => x.pack(bb))), s = this.SECONDARIES.length ? R.createSecondariesVector(bb, this.SECONDARIES.map((x) => x.pack(bb))) : 0;
        const ct = this.CONTROLS.pack(bb), ef = this.EVALUATION_FRAME.pack(bb);
        R.startCQRCatalogRequest(bb); R.addPrimaries(bb, p); if (s) R.addSecondaries(bb, s); R.addControls(bb, ct); R.addEvaluationFrame(bb, ef);
        return R.endCQRCatalogRequest(bb);
      };
      const payload = encode(Object.assign(new C.CQRT(), { CATALOG_REQUEST: request }));
      const out = [];
      for (let chunk = 0; chunk < 100000; chunk += 1) {
        const r = await ca.invoke('screen_catalog', [{ portId: 'request', typeRef: TYPE, payload }]);
        const res = decode(r.outputs.find((o) => o.portId === 'result').payload).CATALOG_RESULT;
        out.push(...events(res.EVENTS));
        if (res.FINAL_CHUNK) return { events: out, statistics: JSON.parse(JSON.stringify(res.STATISTICS ?? {}, (k, v) => (typeof v === 'bigint' ? Number(v) : v))) };
      }
      throw new Error('screen_catalog did not reach its final chunk');
    },
    /** assess_conjunction of two sources over [startMs, startMs + seconds]: { tcaMs, missM, pc, ... } or { error }. */
    async pair(a, b, ctl, frame = 'GCRF') {
      const request = Object.assign(new C.CQRPairRequestT(), { PRIMARY: a, SECONDARY: b, CONTROLS: controls({ ...ctl, filters: false }), PRIMARY_RADIUS_M: 10, SECONDARY_RADIUS_M: 10, EVALUATION_FRAME: frames[frame]() });
      try {
        const r = await ca.invoke('assess_conjunction', [{ portId: 'request', typeRef: TYPE, payload: encode(Object.assign(new C.CQRT(), { PAIR_REQUEST: request })) }]);
        return events([decode(r.outputs[0].payload).EVENT_RESULT])[0];
      } catch (error) { return { error: String(error.message).replace(/^.*assess_conjunction: /, '').slice(0, 160) }; }
    },
    /** One pair over [startMs, startMs + seconds] by screen_catalog of the two sources (the generic path; A9): its least-miss event
     *  { tcaMs, missM, pc, ... } or { error }. */
    async closest(a, b, ctl, frame = 'GCRF') {
      try {
        const { events: list } = await this.screen([a, b], null, { ...ctl, thresholdM: ctl.thresholdM ?? 1e6 }, frame);
        if (!list.length) return { error: 'no minimum in the window' };
        return list.reduce((x, y) => (y.missM < x.missM ? y : x));
      } catch (error) { return { error: String(error.message).replace(/^.*screen_catalog: /, '').slice(0, 160) }; }
    },
    source,
    close: async () => { await ca.destroy?.(); },
  };
}
