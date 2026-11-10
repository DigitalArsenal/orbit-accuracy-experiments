// stack #386 / #389: which TEME-to-GCRF is right. One TEME state turned to GCRF by (a) sdn-ap's own rotation (sdnap_frame_probe
// TEME_TO_GCRF, the matrix its fit and its GCRF output use) and (b) foundation/frames (the path the published harness used for every TEME
// flight), against (c) independent references: the AIAA 2006-6753 sec. V published example (Vallado's chain) and pyerfa's GCRF of the
// SGP4-VER epochs (analysis/epoch-state/tests/vallado-verification.json: TEME = Rz(ee06a) pnm06a, the GMST06 TEME). Then (a) against (b)
// at the windows' dates. Angles in milliarcseconds. Exploratory; rotations run in the modules, JavaScript compares the answers.
//   node experiments/headline-loop/frames/frame-oracle.mjs [sdn-ap module.wasm]     output: frame-oracle.txt beside this file
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const E = await import('../lib/env.mjs'); E.usePackages();
const W = await import('../lib/windows.mjs');
const { openModules } = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/modules.mjs'));
const m = await openModules();
const wasm = process.argv[2] ?? path.join(E.MODULES_ROOT, 'propagator/sdn-ap/dist/isomorphic/module.wasm');
const entry = createRequire(path.join(E.MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const h = await createStandaloneHarness('browser', wasm, { surface: 'direct' });
const x = h.instance.exports;
if (typeof x.sdnap_frame_probe !== 'function') throw new Error('this build has no sdnap_frame_probe');
const jd = (iso) => { const t = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`), d = Math.floor(t / 86400000), sub = (/\.(\d+)/.exec(iso)?.[1] ?? '').padEnd(9, '0'); return { whole: d + 2440587.5, frac: (Math.floor((t - d * 86400000) / 1000) + Number(`0.${sub}`)) / 86400 }; };
const probe = (iso, s) => { const { whole, frac } = jd(iso); const pin = x.sdnap_alloc(48), pout = x.sdnap_alloc(48); new Float64Array(h.memory.buffer, pin, 6).set(s); const st = x.sdnap_frame_probe(whole, frac, pin, pout, 1); const out = Array.from(new Float64Array(h.memory.buffer, pout, 6)); x.sdnap_free(pin); x.sdnap_free(pout); if (st < 0) throw new Error(`probe ${st}`); return out; };
const frames = async (iso, s) => { const [t] = await m.toAxes([{ r: s.slice(0, 3), v: s.slice(3) }], [iso.endsWith('Z') ? iso : `${iso}Z`], 'GCRF'); return [...t.r, ...t.v]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
const MAS = 206264806.2;
const mas = (a, b) => (dist(a, b) / 1000 / Math.hypot(...b.slice(0, 3))) * MAS;
const zAngle = (a, b) => Math.atan2(b[0] * a[1] - b[1] * a[0], b[0] * a[0] + b[1] * a[1]) * MAS; // about the pole, b to a
const out = [`sdn-ap ${path.relative(E.MODULES_ROOT, wasm)}; foundation/frames as XM's openModules() hosts it`];
{
  const iso = '2004-04-06T07:51:28.386009', s = [5094.18016210, 6127.64465950, 6380.34453270, -4.746131487, 0.785818041, 5.531931288], pub = [5102.508958, 6123.011401, 6378.136928];
  const a = probe(iso, s), b = await frames(iso, s);
  out.push(`AIAA 2006-6753 example ${iso}: sdn-ap ${dist(a, pub).toFixed(4)} m from the published GCRF; foundation/frames ${dist(b, pub).toFixed(4)} m; sdn-ap vs frames ${dist(a, b).toFixed(4)} m (${mas(a, b).toFixed(2)} mas, about the pole ${zAngle(a, b).toFixed(2)} mas)`);
}
const ref = JSON.parse(fs.readFileSync(path.join(E.MODULES_ROOT, 'analysis/epoch-state/tests/vallado-verification.json'), 'utf8'));
for (const c of ref.cases) {
  const s = [...c.temeR, ...c.temeV], a = probe(c.epochIso.replace('Z', ''), s), b = await frames(c.epochIso, s);
  out.push(`pyerfa GMST06 TEME ${c.epochIso}: sdn-ap ${dist(a, c.gcrfR).toFixed(3)} m (${mas(a, c.gcrfR).toFixed(2)} mas, about the pole ${zAngle(a, c.gcrfR).toFixed(2)}); foundation/frames ${dist(b, c.gcrfR).toFixed(3)} m (${mas(b, c.gcrfR).toFixed(2)} mas)`);
}
for (const iso of ['2013-02-15T00:00:00', '2025-10-08T00:00:00', '2025-11-14T00:00:00', '2026-01-09T00:00:00', '2026-09-22T00:00:00']) {
  const s = [42164, 0, 0, 0, 3.0747, 0], s2 = [0, 42164, 0, -3.0747, 0, 0];
  const a = probe(iso, s), b = await frames(iso, s), a2 = probe(iso, s2), b2 = await frames(iso, s2);
  out.push(`${iso}: a geosynchronous TEME state, sdn-ap vs foundation/frames ${dist(a, b).toFixed(3)} m (on the x axis), ${dist(a2, b2).toFixed(3)} m (on the y axis); about the pole ${zAngle(a, b).toFixed(2)} mas; out of the equator ${(((a[2] - b[2]) / 42164) * MAS).toFixed(2)}, ${(((a2[2] - b2[2]) / 42164) * MAS).toFixed(2)} mas`);
}
fs.writeFileSync(path.join(HERE, 'frame-oracle.txt'), `${out.join('\n')}\n`);
console.log(out.join('\n'));
process.exit(0);
