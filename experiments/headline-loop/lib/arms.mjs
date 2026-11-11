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
const { PIN: USSF_PIN } = await import(path.join(OT, 'lib/build.mjs'));
const XP2 = await import(path.join(OT, 'lib/xp2.mjs'));
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
  // AP with FORCES.ECOM2 (empty: Y0 starts at 0): sdn-ap solves the ECOM2 Y0 term on fits of 72 h or more (SPEC 16.13)
  AP_ECOM2: APL.fitPcf({ forces: APL.apForces({ tesseral: 31, zonal: 20, ecom2: true }), fit: null }),
  XP: APL.fitPcf({ forces: {}, fit: null }),
};

// The published rule (2026-11-10): for navigation satellites in medium Earth orbit AP also solves the ECOM2 Y0 term on fits of 72 h or
// more. The gate is the group, the fit arc and the AP build's own version (its package.json at the commit flown, compared by its numeric
// fields, so 0.6.15-rc.1 counts as 0.6.15): from ECOM2_SINCE, GN and GN_GAL fits of ECOM2_MIN_ARC hours or more use PCF.AP_ECOM2, and from
// ECOM2_GEO_SINCE the geostationary (GE) and inclined geosynchronous (IG) fits of that length too; every other
// fit, and every fit by an older build (which refuses FORCES.ECOM2 by name), uses the same $PCF bytes as before.
export const ECOM2_SINCE = '0.6.15';
// the geostationary tail's release, which also solves Y0 on these rows (the number is set when that build is fixed)
export const ECOM2_GEO_SINCE = '0.6.20';
export const ECOM2_RULES = [{ groups: ['GN', 'GN_GAL'], since: ECOM2_SINCE }, { groups: ['GE', 'IG'], since: ECOM2_GEO_SINCE }];
export const ECOM2_MIN_ARC = 72;
const numeric = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v)); return m ? m.slice(1).map(Number) : null; };
export const atLeast = (v, w) => {
  const a = numeric(v), b = numeric(w);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
};
/** AP's $PCF for a fit: { label: 'AP' | 'AP_VACUUM' | 'AP_ECOM2', pcf }. */
export const apPcfFor = (group, version, vacuum, arcH) => {
  const label = vacuum ? 'AP_VACUUM' : arcH >= ECOM2_MIN_ARC && ECOM2_RULES.some((r) => r.groups.includes(group) && atLeast(version, r.since)) ? 'AP_ECOM2' : 'AP';
  return { label, pcf: PCF[label] };
};
/** AP's forces and fitted terms for a $PCF label, in one plain sentence (the table's apForces). */
export const AP_FORCES_TEXT = {
  AP: 'Gravity to degree 20 in the zonal terms and 31 in the tesseral terms; atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff; fitted for the mean elements, the drag coefficient and the radiation coefficient, with the module\'s stated priors.',
  AP_VACUUM: 'Gravity to degree 20 in the zonal terms and 31 in the tesseral terms; atmospheric drag by the theory\'s own Jacchia 1970 atmosphere, with no space weather; fitted for the mean elements, the drag coefficient and the radiation coefficient, with the module\'s stated priors.',
  AP_ECOM2: 'Gravity to degree 20 in the zonal terms and 31 in the tesseral terms; atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff; fitted for the mean elements, the drag coefficient and the radiation coefficient, with the module\'s stated priors, and the ECOM2 Y0 radiation term solved as well.',
};

/** The builds of the two outside theories (table.mjs names them): the Space Force's XP through propagator/sgp4-xp (its library is the
 *  unmodified Sgp4Prop 9.1.1.0 XP build, called as a black box), SGP4 fitted by analysis/gp-error-model and flown by propagator/sgp4. */
// Each theory's rows are kept in a store keyed by its own builds (<store>/outside/<key>/rows.jsonl): they do not depend on AP's build, so
// they are flown once and read by every later table run.
const XMB = (await import(path.join(root, XP2F.xm.dir, 'common.mjs'))).build;
const ussfBuild = { module: 'propagator/sgp4-xp', version: USSF_PIN.versions['propagator/sgp4-xp'], modulesCommit: USSF_PIN.modulesCommit, wasmSha256: USSF_PIN.wasmSha256['propagator/sgp4-xp'] };
const sgp4Builds = [
  { module: 'analysis/gp-error-model', modulesCommit: XP2.build.modulesCommit, wasmSha256: XP2.build.wasmSha256['analysis/gp-error-model'] },
  { module: 'propagator/sgp4', modulesCommit: XMB.modulesCommit, wasmSha256: XMB.wasmSha256['propagator/sgp4'] },
  { module: 'foundation/frames', modulesCommit: XMB.modulesCommit, wasmSha256: XMB.wasmSha256['foundation/frames'] },
];
export const OUTSIDE = {
  USSFXP: { key: `sgp4-xp-${ussfBuild.wasmSha256.slice(0, 12)}`, builds: [ussfBuild] },
  SGP4: { key: `sgp4-${sgp4Builds[0].wasmSha256.slice(0, 12)}-${sgp4Builds[1].wasmSha256.slice(0, 12)}`, builds: sgp4Builds },
};

/** The arms: { axes, ffmProvenance, ap() (when apWasm is given), ussf() and sgp4() (when asked), ffm(), close() }. */
export async function openArms({ apWasm = null, ussf = false, sgp4 = false } = {}) {
  const m = await openModules();
  const F = await openFfm();
  const axes = await openAxes();
  const U = ussf ? await APL.standalone('propagator/sgp4-xp') : null;
  const G = sgp4 ? await XP2.openSgp4Fit() : null;
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
    /** The Space Force's XP: propagator/sgp4-xp's own fit of the truth arc (GCRF states; its fitter searches two-line-element digits, every
     *  evaluation running the library), flown by its propagate in its own GCRF output on the scored epochs: { ok, days, s }. */
    async ussf({ object, thin, D0, sc }) {
      const t0 = performance.now();
      const oem = S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
      const f = await U.invoke({ methodId: 'fit', inputs: [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }] });
      if (f.statusCode !== 0) throw new Error(`sgp4-xp fit: ${f.errorCode}: ${String(f.errorMessage).slice(0, 200)}`);
      const ocm = new Uint8Array(f.outputs.find((o) => o.portId === 'elements').payload);
      const grid = S.oemBytes({ frame: 'GCRF', lines: sc.epochs.map((e) => ({ epoch: e, r: [0, 0, 0], v: [0, 0, 0] })) });
      const r = await U.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'grid', typeRef: S.TYPE('OEM'), payload: grid }] });
      if (r.statusCode !== 0) throw new Error(`sgp4-xp propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const states = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v }));
      if (states.length !== sc.epochs.length) throw new Error(`sgp4-xp propagate returned ${states.length} of ${sc.epochs.length}`);
      return { ok: true, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), s: (performance.now() - t0) / 1000 };
    },
    /** SGP4: analysis/gp-error-model's fit of the truth arc (its own SGP4 in improved mode, the epoch at the arc's first state, B* fitted),
     *  flown by propagator/sgp4 (AFSPC mode) on the scored epochs, its TEME output turned to GCRF by foundation/frames (the path the fit
     *  uses): { ok, days, s }. */
    async sgp4({ object, thin, D0, sc }) {
      const t0 = performance.now();
      const oem = S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
      const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: object.name, objectId: object.id });
      // propagate_ephemeris steps from the first scored epoch: at the scored grid's own step (300 s, or the truth's step times the smallest
      // whole number reaching 300 s), so every scored epoch is one of its steps
      const t = sc.epochs.map((e) => Date.parse(/Z$/.test(e) ? e : `${e}Z`));
      const step = Math.min(...t.slice(1).map((x, i) => x - t[i]).filter((d) => d > 0)) / 1000;
      const fl = await m.propagateSgp4(el, object.norad, t, step);
      if (fl.some((s) => !s)) throw new Error('propagator/sgp4 returned a gap');
      const states = await m.toAxes(fl, sc.epochs, 'GCRF');
      return { ok: true, days: byDay(await m.rtn(states, sc.truth), sc.entered, sc.sizes), s: (performance.now() - t0) / 1000 };
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
    async close() { await axes.close(); await F.close(); await m.close(); await ap?.destroy?.(); await U?.destroy?.(); },
  };
}
