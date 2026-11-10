// The two propagators the table compares. AP: the theory alone, fitted to the truth arc with the published $PCF and flown in the module's
// own GCRF output (stack #386: the module's TEME turned to GCRF by foundation/frames is the GMST06 TEME, not the module's). FFM: a named
// setting (lib/settings.mjs), fitted to the same arc by analysis/estimation and flown. Module calls only; JavaScript moves bytes.
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO, MODULES_ROOT } from './env.mjs';
import { root, XP2F, iso, byDay } from './windows.mjs';
import { SETTINGS, openFfm } from './ffm.mjs';

const OT = path.join(REPO, 'experiments/operator-theory');
const APL = await import(path.join(OT, 'lib/ap.mjs'));
const { openAxes } = await import(path.join(OT, 'lib/host.mjs'));
export const S = await import(path.join(root, XP2F.xm.dir, 'lib/sds.mjs'));
const { openModules } = await import(path.join(root, XP2F.xm.dir, 'lib/modules.mjs'));

export const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
export const STORE_ROOT = process.env.HEADLINE_LOOP_STORE ?? '/opt/data/sdn-archive/headline-loop';
// the store folder holding the numerical arms' rows (named after the AP build of the run that first flew them, sdn-ap 0.6.5)
export const NUMERICAL_STORE = 'f0b8352a43f3';

// PCF_AP / PCF_AP_VACUUM of all-regimes.mjs (ap-truth.mjs's fit for the XM groups is the same: FORCES 31, 20, NRLMSISE-00 on the as-issued rows,
// FIT unset); "vacuum" is the theory's own Jacchia 1970. XP: FORCES and FIT unset, which the module fits and flies as THEORY SGP4XP (our
// clean-room SGP4-XP, the same module and the same fit call as AP), with no space weather
export const PCF = {
  AP: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20 }), fit: null }),
  AP_VACUUM: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: null }),
  XP: APL.fitPcf({ forces: {}, fit: null }),
};

/** The arms: { axes, ffmProvenance, ap() (when apWasm is given), ffm(), close() }. */
export async function openArms({ apWasm = null } = {}) {
  const m = await openModules();
  const F = await openFfm();
  const axes = await openAxes();
  let ap = null, invoke = null;
  if (apWasm) {
    const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
    const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
    ap = await createStandaloneHarness('browser', apWasm, { surface: 'direct' });
    invoke = async (methodId, inputs) => {
      const r = await ap.invoke({ methodId, inputs });
      if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      return r;
    };
  }
  const gcrfFlightPcf = (epochs) => {
    const t = new S.PCF.PCFT();
    t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs });
    const b = new S.flatbuffers.Builder(1 << 12);
    S.PCF.PCF.finishPCFBuffer(b, t.pack(b));
    return b.asUint8Array().slice();
  };
  const flyAp = async (ocm, epochs) => {
    const r = await invoke('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: gcrfFlightPcf(epochs) }]);
    const lines = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
    if (lines.length !== epochs.length) throw new Error(`propagate returned ${lines.length} of ${epochs.length}`);
    return lines.map((l) => ({ r: l.r, v: l.v }));
  };
  const fitAp = async (oem, pcf, spw) => {
    const r = await invoke('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])]);
    return new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
  };
  return {
    axes,
    ffmProvenance: F.provenance,
    /** AP: fitted to the truth arc (GCRF states), the record flown on the scored epochs in GCRF: { ok, rms (km), fit, days, s }. */
    async ap({ object, thin, D0, pcf, spw, sc }) {
      const t0 = performance.now();
      const ocm = await fitAp(S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) }), pcf, spw);
      const info = APL.readOcm(ocm);
      const states = await flyAp(ocm, sc.epochs);
      // held: the hold rule's outcome as the record states it in OD COMMENT (SPEC 12.1: "prior-limited: BTERM held at its prior ...")
      const odComment = [].concat(info.o.ORBIT_DETERMINATION?.COMMENT ?? []).join(' ');
      const fit = { b: info.bterm, s: info.agom, sigmaLnB: info.sigmaLnB, iterations: info.iterations, converged: info.o.ORBIT_DETERMINATION?.FIT_STATISTICS?.CONVERGED ?? null,
        held: { drag: /BTERM held at its prior/.test(odComment), srp: /AGOM held at its prior/.test(odComment) } };
      return { ok: true, rms: info.fitRmsKm, fit, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), s: (performance.now() - t0) / 1000 };
    },
    /** One FFM setting: fitted to the arc, flown on the scored epochs: { arm, product, termination, fitOk, weightedRms, iterations, days, s }. */
    async ffm({ arm, thin, D0, rows, sc }) {
      const t0 = performance.now(), settings = SETTINGS[arm];
      const f = await F.fit(thin, settings, D0, rows);
      const product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
      const scored = await F.forecast(product, sc.epochs, settings, rows);
      const days = byDay(await m.rtn(scored, sc.truth), sc.entered, sc.sizes);
      return { arm, product, termination: f.termination, fitOk: f.ok, weightedRms: f.weightedRms, iterations: f.iterations, days, s: (performance.now() - t0) / 1000 };
    },
    async close() { await axes.close(); await F.close(); await m.close(); await ap?.destroy?.(); },
  };
}
