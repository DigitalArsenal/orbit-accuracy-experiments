// Amendment A12's fairness arm XP-LN: SGP4-XP fitted by propagator/sdn-ap `fit` (THEORY SGP4XP) to the same operator track as the
// registered SGP4-XP arm, with the drag term's prior LOG_NORMAL ($PCF 1.0.6 prior forms, SDS 1.272.0 pcfPriorForm). The build is the
// one at config.a12.xpln.modulesCommit, run from a snapshot of its committed dist (G1's snapshot rule, by SHA-256); the $PCF is encoded
// with the SDS release that build is made with (its own dependency). The block is the registered arm's (G1's sdngpOem: the fit interval
// declared, GCRF). The build takes no space-weather frame on this path: with the default prior and no FORCES it returns the registered
// arm's set byte for byte (SPEC 15: SGP4XP's own atmosphere), so the prior is the only difference. Bytes only; every orbit number is the module's.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { config, g1Dir } from '../common.mjs';

const X = config.a12.xpln;
const T = (name) => ({ schemaName: `${name}.fbs`, fileIdentifier: `$${name}`, rootTypeName: name, wireFormat: 'flatbuffer' });
const short = (e) => String(e?.message ?? e).slice(0, 200);

/** The XP-LN fitter: { fit(object, lines, stopFit, {control}), states(ommB64, epochsMs, axes), provenance, close }. `modules` is a checkout
 *  of config.a12.xpln.modulesCommit (its propagator/sdn-ap with its own node_modules). `control` fits with the default prior (the
 *  registered arm's configuration), for the byte-identity check. */
export async function openXpln(modules) {
  process.env.SDNAP_MODULES_REPO = modules;
  process.env.SDNAP_MODULES_REF = X.modulesCommit;
  const { openSdngp } = await import(path.join(g1Dir, 'lib/sdngp.mjs'));
  const [B, F, W] = await Promise.all(['lib/baselines.mjs', 'lib/frames.mjs', 'lib/windows.mjs'].map((n) => import(path.join(g1Dir, n))));
  const { openModule } = await import(path.join(g1Dir, 'lib/modules.mjs'));
  const store = path.join(config.store, 'xpln');
  fs.mkdirSync(store, { recursive: true });
  const sd = await openSdngp({ store, pin: null });
  if (sd.provenance.wasmSha256 !== X.sdnapWasmSha256) throw new Error(`XP-LN build ${sd.provenance.wasmSha256} is not the registered ${X.sdnapWasmSha256}`);
  const req = createRequire(path.join(modules, 'propagator/sdn-ap/package.json'));
  const standards = path.dirname(req.resolve('spacedatastandards.org/package.json'));
  const sdsVersion = JSON.parse(fs.readFileSync(path.join(standards, 'package.json'), 'utf8')).version;
  if (sdsVersion !== X.sdsVersion) throw new Error(`XP-LN $PCF bindings are SDS ${sdsVersion}, not ${X.sdsVersion}`);
  const PCF = await import(pathToFileURL(path.join(standards, 'lib/js/PCF/main.js')).href);
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const { MEAN, SIGMA } = X.dragPrior;
  const pcf = (() => {
    const t = new PCF.PCFT();
    t.THEORY = PCF.pcfTheory.SGP4XP;
    t.FIT = Object.assign(new PCF.PCFFitPolicyT(), {
      DRAG_PRIOR: Object.assign(new PCF.PCFGaussianPriorT(), { MEAN, SIGMA, HAS_SIGMA: true }), DRAG_PRIOR_FORM: PCF.pcfPriorForm[X.dragPrior.form],
      SRP_PRIOR: null, SRP_PRIOR_FORM: PCF.pcfPriorForm.GAUSSIAN_SIGNED,
    });
    const b = new fb.Builder(512);
    PCF.PCF.finishPCFBuffer(b, t.pack(b));
    return b.asUint8Array().slice();
  })();
  const pcfDefault = (() => { const t = new PCF.PCFT(); t.THEORY = PCF.pcfTheory.SGP4XP; const b = new fb.Builder(128); PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); })();
  const frames = await openModule(config.a12.modulesLinks, 'foundation/frames');
  return {
    provenance: { ...sd.provenance, modulesCommit: X.modulesCommit, sdsVersion, pcfSha256: (await import('node:crypto')).createHash('sha256').update(pcf).digest('hex') },
    /** propagator/sdn-ap `fit` THEORY SGP4XP with the LOG_NORMAL drag prior on `lines` (km, km/s in object.frame), fit interval up to stopFit. */
    async fit(object, lines, stopFit, { control = false } = {}) {
      const inputs = [{ portId: 'ephemeris', typeRef: T('OEM'), payload: B.sdngpOem(object, lines, stopFit) }, { portId: 'configuration', typeRef: T('PCF'), payload: control ? pcfDefault : pcf }];
      const t0 = performance.now();
      let r;
      try { r = await sd.raw.h.invoke({ methodId: 'fit', inputs }); } catch (error) { return { ok: false, error: short(error) }; }
      const fitMs = performance.now() - t0;
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 160)}`, fitMs };
      const omm = new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload);
      const OMM = await import(pathToFileURL(path.join(standards, 'lib/js/OMM/main.js')).href);
      const OBD = await import(pathToFileURL(path.join(standards, 'lib/js/OBD/main.js')).href);
      const u = OMM.OMM.getRootAsOMM(new fb.ByteBuffer(omm)).unpack();
      const d = OBD.OBD.getRootAsOBD(new fb.ByteBuffer(new Uint8Array(r.outputs.find((o) => o.portId === 'determination').payload))).unpack();
      const m = /fit RMS ([\d.]+) km/.exec(u.COMMENT ?? '');
      return { ok: true, omm: Buffer.from(omm).toString('base64'), epoch: u.EPOCH, theory: u.MEAN_ELEMENT_THEORY ?? null, moduleFitRmsKm: m ? Number(m[1]) : null, bterm: u.BSTAR, agom: u.MEAN_MOTION_DDOT, dragModel: d.BALLISTIC_COEFF_MODEL ?? null, fitMs };
    },
    /** The states of an XP-LN set at epochs (ms) in `axes`: TEME by the same build, then foundation/frames (as lib/fits.mjs statesAt). */
    async states(ommB64, epochsMs, axes) {
      const omm = new Uint8Array(Buffer.from(ommB64, 'base64'));
      const OMM = await import(pathToFileURL(path.join(standards, 'lib/js/OMM/main.js')).href);
      const epochMs = W.ms(OMM.OMM.getRootAsOMM(new fb.ByteBuffer(omm)).EPOCH());
      const st = await sd.states(omm, epochsMs.map((t) => (t - epochMs) / 60000));
      const bad = st.find((x) => x.status !== 0);
      if (bad) throw new Error(`propagator/sdn-ap status ${bad.status}`);
      const out = [];
      for (let i = 0; i < epochsMs.length; i += 1) { const t = await F.transformState(frames, 'TEME', axes, W.iso(epochsMs[i]), [...st[i].r, ...st[i].v]); out.push({ r: t.slice(0, 3), v: t.slice(3, 6) }); }
      return out;
    },
    async close() { await sd.destroy(); await frames.destroy(); },
  };
}
