// The $PCF configuration record that build b9bc708baa50 on takes on a required `configuration` port (amendment A15): SDS 1.264.0's PCF, encoded with that version's bindings (the aliased dependency
// spacedatastandards-1264; every other record of the experiment stays on the SDS version the landed modules are built against). Only THEORY is set: the module reads fields left unset at the documented defaults.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import * as flatbuffers from 'flatbuffers';

const require = createRequire(import.meta.url);
const PCF = await import(pathToFileURL(path.join(path.dirname(require.resolve('spacedatastandards-1264/package.json')), 'lib/js/PCF/main.js')));
export const PCF_TYPE = { schemaName: 'PCF.fbs', fileIdentifier: '$PCF', rootTypeName: 'PCF', wireFormat: 'flatbuffer' };

/** A plain $PCF with THEORY set to `theory` (SDNAP, SGP4XP, ...): bytes. */
export function pcfBytes({ theory = 'SDNAP' } = {}) {
  const t = Object.assign(new PCF.PCFT(), { THEORY: PCF.pcfTheory[theory] });
  const b = new flatbuffers.Builder(128);
  PCF.PCF.finishPCFBuffer(b, t.pack(b));
  return b.asUint8Array().slice();
}
