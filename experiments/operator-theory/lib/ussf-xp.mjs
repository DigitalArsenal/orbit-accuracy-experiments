// The Space Force's SGP4-XP: propagator/sgp4-xp at the pinned build (lib/build.mjs PIN, 0.2.1), whose library is the unmodified US Space Force Sgp4Prop 9.1.1.0 XP
// build, through that module's fit (one $OCM per block), ingest_omm and propagate (an $OCM on its grid). A black box here: nothing reads the library's source.
// The library has no fitter; the module's fit is ours, and every evaluation in it runs the library. Our whiteroom XP is the AP module with the theory's own forces.
import { TYPE, oemLines, gridBytes, OMM, flatbuffers } from '../../xp-atmosphere-merit/lib/sds.mjs';
import { standalone } from './ap.mjs';
import { PIN, USSF_011 } from './build.mjs';

const short = (e) => String(e?.message ?? e).slice(0, 240);
export async function openUssfXp() {
  const h = await standalone('propagator/sgp4-xp');
  return {
    build: { modulesCommit: PIN.modulesCommit, version: PIN.versions['propagator/sgp4-xp'], wasmSha256: PIN.wasmSha256['propagator/sgp4-xp'] },
    async fit(oem) {
      let r;
      try { r = await h.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: oem }] }); } catch (error) { return { ok: false, error: short(error) }; }
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    /** A foreign two-line or $OMM set as the $OCM the module flies (its one $OMM boundary). */
    async ingest(omm) {
      const r = await h.invoke({ methodId: 'ingest_omm', inputs: [{ portId: 'omm', typeRef: TYPE('OMM'), payload: omm }] });
      if (r.statusCode !== 0) throw new Error(`ingest_omm: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      return new Uint8Array(r.outputs.find((o) => o.portId === 'ocm').payload);
    },
    /** One $OCM at explicit epochs (ISO UTC) on the module's grid template, TEME: [{epoch, r, v}]. */
    async propagate(ocm, epochs, count) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'grid', typeRef: TYPE('OEM'), payload: gridBytes(epochs) }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
      if (lines.length !== count) throw new Error(`propagate returned ${lines.length} of ${count} states`);
      return lines;
    },
  };
}

/** A fitted size-prefixed $OMM without its free-form USER_DEFINED_PARAMETERS (the fit's own notes), which 0.2.1's ingest_omm refuses; every typed field as fitted. */
export function typedOmm(bytes) {
  const t = OMM.OMM.getSizePrefixedRootAsOMM(new flatbuffers.ByteBuffer(bytes)).unpack();
  t.USER_DEFINED_PARAMETERS = [];
  const b = new flatbuffers.Builder(1024);
  b.finishSizePrefixed(t.pack(b), '$OMM');
  return b.asUint8Array();
}

/** propagator/sgp4-xp 0.1.1 (lib/build.mjs USSF_011), for XP-ARM-0-2-1.md's attribution only: its fit emits an $OMM, which its propagate flies on a grid. */
export async function openUssfXp011() {
  const h = await standalone('propagator/sgp4-xp', USSF_011);
  return {
    build: { modulesCommit: USSF_011.modulesCommit, version: USSF_011.version, wasmSha256: USSF_011.wasmSha256 },
    async fit(oem) {
      let r;
      try { r = await h.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: oem }] }); } catch (error) { return { ok: false, error: short(error) }; }
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, omm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    async propagate(omm, epochs, count) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'omm', typeRef: TYPE('OMM'), payload: omm }, { portId: 'grid', typeRef: TYPE('OEM'), payload: gridBytes(epochs) }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
      if (lines.length !== count) throw new Error(`propagate returned ${lines.length} of ${count} states`);
      return lines;
    },
  };
}
