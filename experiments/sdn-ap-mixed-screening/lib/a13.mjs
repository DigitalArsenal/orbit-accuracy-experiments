// Amendment A13: the calibrated covariances of the conjunction contrast (parts 2, 3 and 5). C2's frozen constants (FFM and SGP4-XP, each
// by its receipt's SHA-256), the group's class, and the lead records of the calibrated arms composed as C2 composes them (gp-error-model
// covarianceTerms in the predicted state's RTN axes): FFM's k_e A5 carried by propagator/ffm with PROCESS_NOISE from E (600 s; the
// hand-off at E symmetrized, C2-A5) plus the floor and sigma_delta^2 D_tau; SGP4-XP's k_e A_xp plus the floor. Each calibrated record
// takes the A5 record's error (A13 part 5 point 2). Encoding, routing and record keeping; every covariance and d2 is a module's.
import fs from 'node:fs';
import path from 'node:path';
import { config, root, sha256 } from '../common.mjs';

const C2 = path.join(root, 'results/ffm-covariance-calibration');
const PINS = { ffm: ['frozen-constants.json', '7806980c7e3d655eaf7da31a32a4cb760293be53488a468e99b761b98726c837'], xp: ['sgp4xp/frozen-constants.json', '3f21116ca436d8edb38c47a9ab4661137b618f95e9cce9e52da7523bd9d04992'] };
const load = ([file, sha]) => {
  const b = fs.readFileSync(path.join(C2, file));
  if (sha256(b) !== sha) throw new Error(`${file} is not A13's frozen constants (${sha.slice(0, 12)})`);
  return JSON.parse(b).classes;
};
export const FFM_CONSTANTS = load(PINS.ffm), XP_CONSTANTS = load(PINS.xp);
/** The group's C2 class (A13 part 2): ISS I, laser L, Starlink R1 (weather M, by transfer). Laser's FFM arms reported beside: LP, R2. */
export const CLASS = { iss: 'I', laser: 'L', starlink: 'R1' };
export const LASER_BESIDE = { ffmCalLP: 'LP', ffmCalR2: 'R2' };

const unit = { RR: [1, 0, 0, 0, 0, 0], TT: [0, 0, 1, 0, 0, 0], NN: [0, 0, 0, 0, 0, 1] };
const floorTerms = (p) => [['f_R', unit.RR], ['f_T', unit.TT], ['f_N', unit.NN]].filter(([k]) => p[k]).map(([k, u]) => ({ weight: p[k] ** 2, covariance: u }));
// a synthetic pair whose RTN axes are the inertial axes (C2's d2Of), so stored RTN errors and terms are used as is
const P0 = [7e6, 0, 0], V0 = [0, 7.5e3, 0];

/** The calibration tools: { ffmCal(ctx, fit, E, leadsGcrf, settings, a5, keys), xpCal(a5, cls), close }. */
export async function openA13() {
  const { openPairs } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/pairs.mjs'));
  const { windowTerms, ffmNoiseCovariances } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/products.mjs'));
  const pairs = await openPairs(config.a12.modulesLinks);
  /** Composed records { L: { err (km), cov (packed lower RTN, km^2), d2 } } from per-lead terms (m^2) and the A5 records' errors. */
  const compose = async (a5, termsByL) => {
    const Ls = Object.keys(termsByL).filter((L) => a5[L]?.err);
    if (!Ls.length) return {};
    const st = await pairs.stats(Ls.map((L) => ({ predicted: { position: P0, velocity: V0, covarianceTerms: termsByL[L], covarianceAxes: 'RTN' }, truth: { position: P0.map((x, k) => x - a5[L].err[k] * 1000), velocity: V0 } })), 'predicted');
    return Object.fromEntries(Ls.map((L, i) => [L, { epoch: a5[L].epoch, err: a5[L].err, cov: st[i].predictedRtn.map((x) => Number((x * 1e-6).toPrecision(9))), d2: Number(st[i].d2Predicted.toPrecision(9)) }]));
  };
  return {
    /** FFM's calibrated records for each class key in `keys` ({ arm: classKey }): fit (epoch, state, parameters, covariance, reducedChiSquare),
     *  E (ms), leads [{ L, line: { epoch, r, v } }] (GCRF km), settings { forces, integrator, fixed }, a5 the arm's A5 records. */
    async ffmCal(ctx, fit, E, leads, settings, a5, keys) {
      const use = leads.filter(({ L }) => a5[L]?.err);
      if (!use.length) return Object.fromEntries(Object.keys(keys).map((arm) => [arm, {}]));
      const needD = Object.values(keys).some((c) => FFM_CONSTANTS[c].parameters.s2);
      const terms = needD ? await windowTerms(ctx, pairs, fit, E, use, settings) : null;
      const out = {};
      for (const [arm, c] of Object.entries(keys)) {
        const p = FFM_CONSTANTS[c].parameters;
        const noise = await ffmNoiseCovariances(ctx, pairs, fit, E, use, settings, [p.q_RN ?? 0, p.q_T ?? 0, p.q_RN ?? 0], p.k_e);
        const byL = Object.fromEntries(use.map(({ L }, j) => {
          const t = [{ weight: 1, covariance: noise[j].rtn }, ...floorTerms(p)];
          if (p.s2) t.push({ weight: p.s2, covariance: p.tau === 'inf' ? terms.leads[j].terms.Dinf : terms.leads[j].terms.D1 });
          return [L, t];
        }));
        out[arm] = await compose(a5, byL);
      }
      return out;
    },
    /** SGP4-XP's calibrated records of class `cls` from its A5 records (the module covariance in the truth's RTN axes, km^2). */
    async xpCal(a5, cls) {
      const p = XP_CONSTANTS[cls].parameters;
      const byL = Object.fromEntries(Object.entries(a5).filter(([, r]) => Array.isArray(r?.cov)).map(([L, r]) => [L, [{ weight: p.k_e, covariance: r.cov.map((x) => x * 1e6) }, ...floorTerms(p)]]));
      return compose(a5, byL);
    },
    pairs,
    close: () => pairs.close(),
  };
}

/** foundation/frames' rotation from axes `from` (GCRF or TEME) to the RTN axes of an object whose Earth-centred ICRF state is `stateM`
 *  [m, m/s] at `epoch` (FRAME_ROTATION, ORBITAL_RADIAL_TRANSVERSE_NORMAL, the state on object_state): the 3 x 3 matrix Q (rows), x_RTN = Q x.
 *  For A13 part 5 point 3: the covariance is then taken to RTN as R P R^T, R = blockdiag(Q, Q), in the harness. */
export async function openRtnRotation(frames) {
  const { createRequire } = await import('node:module');
  const { pathToFileURL } = await import('node:url');
  const req = createRequire(path.join(root, 'package.json'));
  const standards = path.dirname(req.resolve('spacedatastandards.org/package.json'));
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [S, R] = await Promise.all(['FRM', 'RFM'].map((c) => import(pathToFileURL(path.join(standards, `lib/js/${c}/main.js`)).href)));
  const TYPE = { schemaName: 'FRM.fbs', fileIdentifier: '$FRM', rootTypeName: 'FRM' };
  const AX = { GCRF: ['GCRF', 'ICRF'], TEME: ['TEME', 'TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE'] };
  const earth = () => new R.RFMOriginT(R.rfmOriginKind.CELESTIAL_BODY, 399);
  const frame = (request) => { const b = new fb.Builder(2048); S.FRM.finishFRMBuffer(b, new S.FRMT(request, null).pack(b)); return b.asUint8Array(); };
  return async (from, epoch, stateM) => {
    const [n, a] = AX[from];
    const sys = (name, axis, origin) => new R.RFMCoordinateSystemT(name, R.rfmAxisType[axis], origin, 399, epoch, 'UTC');
    const object = Object.assign(new R.RFMOriginT(), { KIND: R.rfmOriginKind.SPACE_OBJECT, OBJECT_ID: 'object' });
    const state = new S.FRMStateVectorT(S.frmStateRepresentation.CARTESIAN, [...stateM], new S.FRMVector3T(stateM[0], stateM[1], stateM[2]), new S.FRMVector3T(stateM[3], stateM[4], stateM[5]), 'GCRF', epoch, 'UTC', 3.986004418e14);
    const request = Object.assign(new S.FRMFrameTransformRequestT(), { OPERATION: S.frmOperationCode.FRAME_ROTATION, SOURCE_COORDINATE_SYSTEM: sys(n, a, earth()), TARGET_COORDINATE_SYSTEM: sys('RTN', 'ORBITAL_RADIAL_TRANSVERSE_NORMAL', object), EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC' });
    const objectState = Object.assign(new S.FRMFrameTransformRequestT(), { OPERATION: S.frmOperationCode.STATE_TRANSFORM, SOURCE_COORDINATE_SYSTEM: sys('GCRF', 'ICRF', object), SOURCE_STATE: state, EPOCH: epoch, EPOCH_TIME_SYSTEM: 'UTC' });
    const out = await frames.call('transform_frame_position', [{ portId: 'request', typeRef: TYPE, payload: frame(request) }, { portId: 'object_state', typeRef: TYPE, payload: frame(objectState) }]);
    const r = S.FRM.getRootAsFRM(new fb.ByteBuffer(new Uint8Array(Object.values(out)[0]))).FRAME_TRANSFORM_RESULT();
    if (!r || r.STATUS() !== S.frmResultStatus.OK) throw new Error(`foundation/frames rotation: ${r?.ERROR_MESSAGE() ?? 'no result'}`);
    const m = r.ROTATION_DCM();
    return [[m.M11(), m.M12(), m.M13()], [m.M21(), m.M22(), m.M23()], [m.M31(), m.M32(), m.M33()]];
  };
}
/** R P R^T with R = blockdiag(Q, Q) for a 6 x 6 row-major P (the harness step A13 part 5 point 3 discloses). */
export function rotate6(Q, P) {
  const Rm = Array.from({ length: 6 }, (_, i) => Array.from({ length: 6 }, (_, j) => ((i < 3) === (j < 3) ? Q[i % 3][j % 3] : 0)));
  const at = (i, j) => P[6 * i + j];
  const RP = Rm.map((row) => Array.from({ length: 6 }, (_, j) => row.reduce((s, x, k) => s + x * at(k, j), 0)));
  return RP.flatMap((row) => Array.from({ length: 6 }, (_, j) => row.reduce((s, x, k) => s + x * Rm[j][k], 0)));
}

const unpack6 = (p) => [[p[0], p[1], p[3]], [p[1], p[2], p[4]], [p[3], p[4], p[5]]];
/** Part 5's calibrated covariances at epochs (A13 part 2 point 4, part 5 point 3), each 6 x 6 in the object's RTN axes (km, km/s):
 *  ffm(ctx, fit, E, epochsMs, settings, cls) -> [{ r, v (km, km/s, GCRF), covariance }]: FFM's PROCESS_NOISE run from E (k_e x A5's
 *  covariance carried to E, symmetrized, q per the class), taken to RTN, the floor and sigma_delta^2 D_tau added to the position block;
 *  xp(teme [{ r, v, covariance (TEME, km) }], epochsMs, cls) -> the same for SGP4-XP's module covariance times k_e plus the floor. */
export async function openPart5Cal(cal, frames) {
  const { windowTerms } = await import(path.join(root, 'experiments/ffm-covariance-calibration/lib/products.mjs'));
  const { decodeSamples, executionFrame } = await import(path.join(root, 'harness/ffm-execution.mjs'));
  const F = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/frames.mjs'));
  const rot = await openRtnRotation(frames);
  const iso = (t) => new Date(t).toISOString();
  const addPosition = (P, A, w) => { const M = unpack6(A); for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) P[6 * i + j] += w * M[i][j]; };
  return {
    async ffm(ctx, fit, E, epochsMs, settings, cls) {
      if (epochsMs.some((t) => t <= E)) throw new Error('an assessment epoch at or before E');
      const p = FFM_CONSTANTS[cls].parameters;
      const scale = p.k_e * Math.max(1, fit.reducedChiSquare ?? 1);
      const [atE] = decodeSamples(await ctx.ffm.invoke('invoke', [executionFrame({ epoch: fit.epoch, state: fit.state, samples: [iso(E)], forces: settings.forces, parameters: fit.parameters, fixed: settings.fixed ?? {}, stm: false, covariance: fit.covariance.map((x) => x * scale), noise: null, integrator: settings.integrator }), ...ctx.inputs]));
      const sym = atE.covariance.map((v, idx) => (v + atE.covariance[(idx % atE.n) * atE.n + Math.floor(idx / atE.n)]) / 2);
      const q = [p.q_RN ?? 0, p.q_T ?? 0, p.q_RN ?? 0];
      const out = decodeSamples(await ctx.ffm.invoke('invoke', [executionFrame({ epoch: iso(E), state: atE.state, samples: epochsMs.map(iso), forces: settings.forces, parameters: fit.parameters, fixed: settings.fixed ?? {}, stm: false, covariance: sym, noise: q.some((v) => v > 0) ? { q, intervalSeconds: 600 } : null, integrator: settings.integrator }), ...ctx.inputs]));
      let D = null;
      if (p.s2) {
        const t = await windowTerms(ctx, cal.pairs, fit, E, out.map((s, i) => ({ L: i, line: { epoch: iso(epochsMs[i]), r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000) } })), settings);
        D = t.leads.map((l) => (p.tau === 'inf' ? l.terms.Dinf : l.terms.D1));
      }
      const res = [];
      for (let i = 0; i < out.length; i += 1) {
        const s = out[i], n = s.n, P6 = Array.from({ length: 36 }, (_, k) => s.covariance[n * Math.floor(k / 6) + (k % 6)]);
        const P = rotate6(await rot('GCRF', iso(epochsMs[i]), s.state), P6);
        ['f_R', 'f_T', 'f_N'].forEach((f, a) => { if (p[f]) P[7 * a] += p[f] ** 2; });
        if (D) addPosition(P, D[i], p.s2);
        res.push({ r: s.state.slice(0, 3).map((x) => x / 1000), v: s.state.slice(3, 6).map((x) => x / 1000), covariance: P.map((x) => x * 1e-6) });
      }
      return res;
    },
    async xp(teme, epochsMs, cls) {
      const p = XP_CONSTANTS[cls].parameters;
      const res = [];
      for (let i = 0; i < teme.length; i += 1) {
        const x = teme[i], g = await F.transformState(frames, 'TEME', 'GCRF', iso(epochsMs[i]), [...x.r, ...x.v]);
        const P = rotate6(await rot('TEME', iso(epochsMs[i]), g.map((y) => y * 1000)), x.covariance.map((y) => y * p.k_e));
        ['f_R', 'f_T', 'f_N'].forEach((f, a) => { if (p[f]) P[7 * a] += p[f] ** 2 * 1e-6; });
        res.push({ r: x.r, v: x.v, covariance: P });
      }
      return res;
    },
  };
}
