// Typed transport only; dynamics, covariance propagation and scoring are WASM.
import assert from 'node:assert/strict';
import * as fb from 'flatbuffers';
import { TIM, TIMT, TIMInstantT, TIMConversionRequestT, timingStandard, timEpochRepresentation, timConversionStatus } from 'spacedatastandards.org/lib/js/TIM/main.js';
import { jd } from '../v1c-console-ffm-path/modules.mjs';

export async function catalogSeedEpoch(time, ms) {
  const source = Object.assign(new TIMInstantT(), { TIME_SYSTEM: timingStandard.UTC, EPOCH_FORMAT: timEpochRepresentation.JULIAN_DATE, JULIAN_DATE: jd(ms) });
  const request = Object.assign(new TIMConversionRequestT(), { SOURCE: source, TARGET_TIME_SYSTEM: timingStandard.UTC, TARGET_EPOCH_FORMAT: timEpochRepresentation.ISO8601 });
  const message = Object.assign(new TIMT(), { CONVERSION_REQUEST: request });
  const builder = new fb.Builder(512); TIM.finishTIMBuffer(builder, message.pack(builder));
  const response = await time.invoke('convert_time', [{ portId: 'request', typeRef: { schemaName: 'TIM.fbs', fileIdentifier: '$TIM', rootTypeName: 'TIM' }, payload: builder.asUint8Array() }]);
  const result = TIM.getRootAsTIM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).CONVERSION_RESULT();
  assert.equal(result.STATUS(), timConversionStatus.OK);
  return result.TARGET().ISO8601();
}

export function validMatrix(p, tolerance) {
  assert.equal(p.length, 36); assert(p.every(Number.isFinite));
  const scale = Math.max(...p.map(Math.abs)); assert(scale > 0);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++)
    assert(Math.abs(p[i * 6 + j] - p[j * 6 + i]) <= tolerance * scale, 'asymmetric covariance');
}

export async function covarianceResident(h, b, configuration, environment, seed, p0, bstar) {
  const { catalog: c, table, frame } = b, instanceId = 'v1c2';
  const instance = table('PRWInstance', { MODULE_ID: c.MODULE_ID, INSTANCE_ID: instanceId, GENERATION: 1n });
  const cdAm = h.instance.exports.plugin_drag_area_over_mass_from_bstar(bstar, .01);
  const response = await h.invoke({ methodId: 'ingest_state', inputs: [frame('state', 'RESIDENT_STATE', c.residentState({
    instanceId, handle: 1, epoch: seed.epoch, state: seed.state, cdAm, crAm: .02, covariance: p0,
  })), configuration, ...environment] });
  assert.equal(response.statusCode, 0, response.errorMessage);
  return async ms => {
    const response = await h.invoke({ methodId: 'propagate_state', inputs: [frame('request', 'RESIDENT_REQUEST', table('PRWResidentRequest', {
      INSTANCE: instance, ENTITY_HANDLES: [1], TARGET_COORDINATE_SYSTEM: c.gcrf(),
      // The zero-time check must reuse the exact seed epoch representation;
      // UTC Julian-date rounding otherwise introduces a tiny propagation span.
      TARGET_EPOCH: ms === seed.ms ? c.instant(seed.epoch) : table('TIMInstant', { TIME_SYSTEM: c.prw.timingStandard.UTC, EPOCH_FORMAT: c.prw.timEpochRepresentation.JULIAN_DATE, JULIAN_DATE: jd(ms) }),
    }))] });
    assert.equal(response.statusCode, 0, response.errorMessage);
    const s = c.prw.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).unpack().RESIDENT_STATE;
    assert(s?.VALID && s.COVARIANCE?.DIMENSION === 6, 'resident covariance missing');
    assert.equal(s.PROCESS_NOISE, null, 'process noise must be absent');
    return { state: ['POSITION', 'VELOCITY'].flatMap(k => ['X', 'Y', 'Z'].map(a => s.STATE[k][a])), covariance: Array.from(s.COVARIANCE.VALUES) };
  };
}

export async function score(gp, codec, state, covariance, truth) {
  const response = await gp.invoke('pair_statistics', [codec.frame('pairs', 'pairs', { axesFrom: 'truth', pairs: [{ id: 'sample',
    predicted: { position: state.slice(0, 3), velocity: state.slice(3), covariance, covarianceAxes: 'INERTIAL' },
    truth: { position: truth.slice(0, 3), velocity: truth.slice(3) },
  }] })]);
  const result = codec.decode(response.outputs[0].payload).pairs[0];
  assert(!result.missing, result.missing);
  return { d2: result.d2Predicted, errorRtn: result.errorRtn };
}
