// Time-scale conversion through foundation/time `convert_time` (SDS TIM).
// Framing only; the conversion is the module's.
import * as flatbuffers from 'flatbuffers';
import { TIM, TIMConversionRequestT, TIMInstantT, TIMT, timConversionStatus, timEpochRepresentation, timingStandard } from 'spacedatastandards.org/lib/js/TIM/main.js';

const TIM_TYPE = { schemaName: 'TIM.fbs', fileIdentifier: '$TIM', rootTypeName: 'TIM' };

// ISO 8601 text on scale `from` -> ISO 8601 text on scale `to` (microseconds,
// as the module emits them).
export async function convertIso(timeModule, iso, from, to) {
  const source = new TIMInstantT(timingStandard[from], timEpochRepresentation.ISO8601, 0, 0, iso, 0, null, 0, false, null, null);
  const request = new TIMConversionRequestT(source, timingStandard[to], timEpochRepresentation.ISO8601, 0, false, 0, false, 'orbit-accuracy-experiments');
  const b = new flatbuffers.Builder(512);
  TIM.finishTIMBuffer(b, new TIMT(timingStandard[from], null, request, null).pack(b));
  const response = await timeModule.invoke('convert_time', [{ portId: 'request', typeRef: TIM_TYPE, payload: b.asUint8Array() }]);
  const result = TIM.getRootAsTIM(new flatbuffers.ByteBuffer(new Uint8Array(response.outputs[0].payload))).CONVERSION_RESULT();
  if (result.STATUS() !== timConversionStatus.OK) throw new Error(`foundation/time: ${from} -> ${to} failed for ${iso}`);
  return result.TARGET().ISO8601();
}
