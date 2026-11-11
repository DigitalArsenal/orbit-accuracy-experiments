// The burn detector's check, end to end on the module: a truth flown by the full numerical setting (propagator/ffm), with
//   A. a seam planted in it: from a time on, the truth is a second solution, 220 m and 1.8 mm/s off the first there (the size of the largest
//      seam of TESS's definitive ephemeris): seamOf must call it a seam;
//   B. a 5 mm/s along-track impulse planted in it, the position continuous: the refine must hold, find its size within 2 % and seamOf must
//      not call it a seam;
//   C. nothing planted: the refine's size must stay under 0.01 mm/s.
// Each is refined over a 10 min extent around the planted time, as burns.mjs refines a candidate.
//   node experiments/burn-detector/check.mjs
const D = await import('./lib/detector.mjs');
const settings = D.SETTINGS.Ffull, ffm = await D.F.openFfm();
const ctx = { ffm, settings, terms: [], termsDays: D.TERMS_DAYS };
const t0 = Date.parse('2026-08-20T00:00:00Z'), step = 300e3, end = t0 + 12 * D.HOUR, tj = t0 + 6 * D.HOUR;
const epochs = []; for (let t = t0; t <= end; t += step) epochs.push(t);
const rows = settings.forces.drag ? D.weatherAsOf(end) : null, params = D.termsAsOf([], settings, end);
const fly = async (from, ts) => (await ffm.forecast({ epoch: D.iso(from.t), state: [...from.r, ...from.v].map((x) => x * 1000), parameters: params }, ts.map(D.iso), settings, rows)).map((s, i) => ({ t: ts[i], epoch: D.iso(ts[i]), r: s.r, v: s.v }));
// a high orbit (100,000 km, circular), where a small step matters most and no atmosphere is flown
const r = 100000, S0 = { t: t0, r: [r, 0, 0], v: [0, Math.sqrt(398600.4418 / r) * Math.cos(0.3), Math.sqrt(398600.4418 / r) * Math.sin(0.3)] };
const first = await fly(S0, epochs.slice(1)); const one = [{ ...S0, epoch: D.iso(t0) }, ...first];
const at = one.find((s) => s.t === tj), after = epochs.filter((t) => t > tj);
const unit = (a) => { const m = Math.hypot(...a); return a.map((x) => x / m); };
const along = unit(at.v), radial = unit(at.r);
const planted = async (dr, dv) => {
  const S = { t: tj, r: at.r.map((x, i) => x + dr[i]), v: at.v.map((x, i) => x + dv[i]) };
  return D.indexTruth([...one.filter((s) => s.t < tj), { ...S, epoch: D.iso(tj) }, ...(await fly(S, after))]);
};
const refine = (T) => D.refineAsOf(ctx, T, tj - step, tj + step, end);
const results = [];
const ok = (cond, what) => { results.push({ ok: !!cond, what }); console.error(`${cond ? 'ok  ' : 'FAIL'} ${what}`); };
// A. a seam: 220 m (radial and along-track) and 1.8 mm/s
const A = await refine(await planted(radial.map((x, i) => x * 0.15 + along[i] * 0.16), along.map((x) => x * 1.8e-6)));
ok(D.seamOf(A), `A: a planted seam of 220 m and 1.8 mm/s is a seam (mismatch ${A.positionMismatchM} m, ratio ${D.seamOf(A)?.ratio})`);
// B. a 5 mm/s along-track impulse, the position continuous
const B = await refine(await planted([0, 0, 0], along.map((x) => x * 5e-6)));
ok(B.consistent && !D.seamOf(B) && Math.abs(B.sizeMmS - 5) < 0.1, `B: a planted 5 mm/s impulse holds as a burn (size ${B.sizeMmS} mm/s, mismatch ${B.positionMismatchM} m, spread ${B.spread})`);
// C. nothing planted
const C = await refine(D.indexTruth(one));
ok(C.sizeMmS < 0.01 && !D.seamOf(C), `C: an unplanted truth refines to ${C.sizeMmS} mm/s and no seam`);
await ffm.close();
const failed = results.filter((x) => !x.ok);
console.log(failed.length ? `BURN DETECTOR CHECK: FAIL (${failed.map((x) => x.what).join('; ')})` : `BURN DETECTOR CHECK: PASS (${results.map((x) => x.what).join('; ')})`);
process.exit(failed.length ? 1 : 0);
