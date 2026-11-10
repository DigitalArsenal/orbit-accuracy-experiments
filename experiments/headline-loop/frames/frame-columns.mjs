// stack #386: each published column's path to GCRF, on high windows. Each arm is fitted as experiments/operator-theory/all-regimes.mjs fits it,
// flown over its own fit arc, turned to GCRF as the published harness turns it (foundation/frames for TEME output), and the rotation about
// the pole that best takes those states onto the truth is given (mas, least squares over the arc; the fit cannot absorb a rotation made after
// it), with the in-arc RMS. AP and the whiteroom XP are also flown in sdn-ap's own GCRF output; the Space Force XP's own GCRF output is set
// beside its TEME path. Exploratory; every state is a module's.
//   node experiments/headline-loop/frames/frame-columns.mjs "GE|C006 BDS-2G|2025-10-08" "IG|C005 BDS-2I|2025-10-06"   output: frame-columns.txt
import fs from 'node:fs';
import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const E = await import('../lib/env.mjs'); E.usePackages();
const W = await import('../lib/windows.mjs');
const A = await import('../lib/arms.mjs');
const OT = path.join(E.REPO, 'experiments/operator-theory');
const { openSgp4Fit } = await import(path.join(OT, 'lib/xp2.mjs'));
const { openUssfXp } = await import(path.join(OT, 'lib/ussf-xp.mjs'));
const { standalone } = await import(path.join(OT, 'lib/ap.mjs'));
const S = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/sds.mjs'));
const { openModules } = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/modules.mjs'));
const m = await openModules();
const arms = await A.openArms({ apWasm: path.join(E.MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm') });
const G = await openSgp4Fit(), U = await openUssfXp(), UH = await standalone('propagator/sgp4-xp');
const MAS = 206264806.2;
const zAngle = (fl, tr) => { let s = 0, c = 0; for (let i = 0; i < fl.length; i += 1) { const a = fl[i].r, b = tr[i].r; s += b[0] * a[1] - b[1] * a[0]; c += b[0] * a[0] + b[1] * a[1]; } return Math.atan2(s, c) * MAS; };
const rms3 = (fl, tr) => Math.sqrt(fl.reduce((s, x, i) => s + (x.r[0] - tr[i].r[0]) ** 2 + (x.r[1] - tr[i].r[1]) ** 2 + (x.r[2] - tr[i].r[2]) ** 2, 0) / fl.length) * 1000;
const listed = W.windowsOf(['GE', 'IG', 'GD', 'GN']);
const winOf = new Map([...listed.windows, ...listed.spring].map((x) => [x.key, x]));
const lines = [];
for (const key of process.argv.slice(2)) {
  const w = winOf.get(key), D0 = w.cutoffMs, arc = 72;
  const truth = await W.truthOf(w, D0 - arc * W.HOUR - W.HOUR, D0 + W.HOUR, arms.axes);
  const thin = W.arcOf(truth.lines.filter((l) => W.ms(l.epoch) >= D0 - arc * W.HOUR && W.ms(l.epoch) <= D0), arc);
  const object = { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 };
  const epochs = thin.map((l) => l.epoch), oem = S.oemBytes({ frame: 'GCRF', object, lines: thin, useableStart: thin[0].epoch, useableStop: W.iso(D0) });
  const out = [];
  for (const [label, pcf] of [['AP', A.PCF.AP_VACUUM], ['XP, whiteroom', A.PCF.XP]]) for (const frame of ['TEME', 'GCRF']) {
    const x = await arms.apFitFly({ object, lines: thin, D0, pcf, epochs, frame });
    out.push(`${label}, ${frame === 'TEME' ? 'TEME + foundation/frames (published path)' : 'sdn-ap GCRF output'}: rotation ${zAngle(x.states, thin).toFixed(1)} mas, in-arc RMS ${rms3(x.states, thin).toFixed(2)} m`);
  }
  try {
    const f = await U.fit(oem); if (!f.ok) throw new Error(f.error);
    const st = await m.toAxes(await U.propagate(f.ocm, epochs, epochs.length), epochs, 'GCRF');
    const grid = S.oemBytes({ frame: 'GCRF', lines: epochs.map((e) => ({ epoch: e, r: [0, 0, 0], v: [0, 0, 0] })) });
    const r = await UH.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: f.ocm }, { portId: 'grid', typeRef: S.TYPE('OEM'), payload: grid }] });
    if (r.statusCode !== 0) throw new Error(r.errorMessage);
    const own = S.oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
    const far = Math.max(...own.map((l, i) => Math.hypot(l.r[0] - st[i].r[0], l.r[1] - st[i].r[1], l.r[2] - st[i].r[2]))) * 1000;
    out.push(`XP, Space Force (sgp4-xp 0.2.1), TEME + foundation/frames: rotation ${zAngle(st, thin).toFixed(1)} mas, in-arc RMS ${rms3(st, thin).toFixed(2)} m; its own GCRF output differs from that path by at most ${far.toFixed(4)} m`);
  } catch (e) { out.push(`XP, Space Force: ${String(e.message).slice(0, 100)}`); }
  try {
    const { el } = await G.fit(oem, { from: thin[0].epoch, to: W.iso(D0), epoch: 'first', fitBstar: true }, { name: object.name, objectId: object.id });
    const fl = await m.propagateSgp4(el, object.norad, epochs.map(W.ms), 300);
    if (fl.some((s) => !s)) throw new Error('SGP4 returned a gap');
    const st = await m.toAxes(fl, epochs, 'GCRF');
    out.push(`SGP4 (analysis/gp-error-model fit, propagator/sgp4), TEME + foundation/frames: rotation ${zAngle(st, thin).toFixed(1)} mas, in-arc RMS ${rms3(st, thin).toFixed(2)} m`);
  } catch (e) { out.push(`SGP4: ${String(e.message).slice(0, 100)}`); }
  lines.push(`${key} (72 h arc, ${thin.length} states)`, ...out.map((s) => `  ${s}`));
}
fs.writeFileSync(path.join(HERE, 'frame-columns.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(0);
