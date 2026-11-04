// The Space Force's SGP4-XP: propagator/sgp4-xp, whose library is the unmodified US Space Force Sgp4Prop 9.1.1.0 XP build, through that module's fit (one $OCM per block), ingest_omm and propagate (an $OCM on its grid). A black box here: nothing
// reads the library's source. The library has no fitter; the module's fit is ours, and every evaluation in it runs the library. Our whiteroom XP is the AP module with FORCES and FIT unset.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { modulesRoot } from '../../xp-atmosphere-merit/common.mjs';
import { TYPE, oemLines } from '../../xp-atmosphere-merit/lib/sds.mjs';

const short = (e) => String(e?.message ?? e).slice(0, 240);
export async function openUssfXp() {
  const file = path.join(modulesRoot(), 'propagator/sgp4-xp/dist/isomorphic/module.wasm');
  const entry = createRequire(path.join(modulesRoot(), 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const h = await createStandaloneHarness('browser', file, { surface: 'direct' });
  return {
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
    async propagate(ocm, grid, count) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'grid', typeRef: TYPE('OEM'), payload: grid }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
      if (lines.length !== count) throw new Error(`propagate returned ${lines.length} of ${count} states`);
      return lines;
    },
  };
}
