// The pinned harness (ffm-fit-v3, ffm-execution; C3 pins their bytes) has one signed constant-acceleration slot, T. This adapter moves that slot onto ECOM2's Y0 in the FFM request (coordinator's ruling Q1): the fit
// carries Y0 as parameter or as settings.fixed.t, and FFM sees FORCES.ECOM2.Y0_M_S2 and DYNAMIC_PARAMETERS ECOM2_Y0. fit_batch's parameter kinds are opaque to the estimator and both domains are signed. With no T in
// the request the frame passes through unchanged, so the base path is the harness's own. Encoding only: every orbit computation is FFM's.
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';

export function slotToY0(frame) {
  const root = P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(frame.payload))).unpack();
  const q = root.EXECUTION_REQUEST;
  if (!q?.FORCES?.HAS_IN_TRACK_ACCELERATION_M_S2) return frame;
  const e = new P.PRWEcom2T();
  e.Y0_M_S2 = q.FORCES.IN_TRACK_ACCELERATION_M_S2;
  q.FORCES.ECOM2 = e;
  q.FORCES.HAS_IN_TRACK_ACCELERATION_M_S2 = false;
  q.FORCES.IN_TRACK_ACCELERATION_M_S2 = 0;
  q.DYNAMIC_PARAMETERS = q.DYNAMIC_PARAMETERS.map((k) => (k === P.prwDynamicParameter.IN_TRACK_ACCELERATION ? P.prwDynamicParameter.ECOM2_Y0 : k));
  const b = new flatbuffers.Builder(1 << 16);
  P.PRW.finishSizePrefixedPRWBuffer(b, root.pack(b));
  return { ...frame, payload: b.asUint8Array().slice() };
}
/** A fit context whose FFM requests go through the adapter. */
export const withY0 = (ctx) => ({ ...ctx, ffm: { invoke: (method, inputs) => ctx.ffm.invoke(method, [slotToY0(inputs[0]), ...inputs.slice(1)]) } });
