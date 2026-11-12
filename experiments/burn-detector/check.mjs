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
// D. the piece closures a list carries (the weight of the object's reference), written by burns.mjs from D.closureFieldsOf: each flown piece's end
// and closure, and their summary. A list is made here from 40 pieces and read as a cutoff reads it; a list with pieces flown that carries none fails
{
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const T0 = Date.parse('2026-01-01T00:00:00Z'), cf = D.closureFieldsOf(Array.from({ length: 40 }, (_, k) => ({ end: new Date(T0 + (k + 1) * 3 * D.HOUR).toISOString(), posM: k < 20 ? 100 : 1000 })), 10);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-')), put = (name, o) => { fs.mkdirSync(path.join(dir, 'WA'), { recursive: true }); fs.writeFileSync(path.join(dir, 'WA', `${name}.burns.json`), JSON.stringify(o)); };
  put('Made', { name: 'Made', flown: 40, ...cf }); put('Old', { name: 'Old', flown: 40, positionClosure: cf.positionClosure });
  const at = (h) => D.A.objectSigmaM(dir, 'WA', 'Made', T0 + h * 3600e3);
  ok(cf.pieceClosures.length === 40 && cf.positionClosure.pieces === 40 && at(24) === 10 && at(48) === 100 && at(120) === 550, `D: the sigma of a list made here, at 24, 48 and 120 h: ${at(24)}, ${at(48)}, ${at(120)} (the floor under ${D.A.SIGMA_MIN_PIECES} pieces by the cutoff, then the median of the pieces that end by it)`);
  ok(JSON.stringify(D.A.listsLackingClosure(dir).map((x) => x.name)) === '["Old"]' && D.A.objectSigmaM(dir, 'WA', 'Old', T0 + 120 * 3600e3) === 10, 'D: a list with pieces flown and no per-piece closures is named, and weighs its object at the floor');
  fs.rmSync(dir, { recursive: true, force: true });
}
const pc = D.positionClosureOf([1, 5, 2, 8, 3].map((x, i) => ({ posM: x * 10, judged: i > 2, thr: 100 + i })), 10);
ok(pc.pieces === 5 && pc.medianM === 30 && pc.madM === 20 && pc.p90M === 80 && pc.floorM === 10 && pc.thresholdM === 104, `D: the piece closure of five pieces: ${JSON.stringify(pc)}`);
ok(D.positionClosureOf([], 10).medianM === null && D.positionClosureOf([{ posM: NaN }], 10).pieces === 0, 'D: no flown piece, no median (the floor weighs the object)');
// E. the break test as a cutoff sees it (lib/arms.mjs breakEventsAsOf): arcs of 24 h at a 12 h stride, closing at 1.5; one step at hour 30 fails the
// arcs [12,36] and [24,48]; only arcs that end at or before the cutoff are read
const H0 = Date.parse('2026-01-01T00:00:00Z'), isoH = (h) => new Date(H0 + h * 3600e3).toISOString();
const arcsOf = (fail) => Array.from({ length: 8 }, (_, k) => ({ start: isoH(12 * k), end: isoH(12 * k + 24), wrms: fail.includes(12 * k) ? 20 : 1 }));
const doc = { strideH: 12, closeWeightedRms: 1.5, maxRun: 3, arcs: arcsOf([12, 24]) };
const evAt = (h, d = doc) => D.A.breakEventsAsOf(d, H0 + h * 3600e3);
ok(evAt(35).length === 0 && evAt(36).length === 1 && evAt(36)[0].open && evAt(36)[0].reportTime === isoH(36) && evAt(36)[0].extentFrom === isoH(24) && evAt(36)[0].extentTo === isoH(36), `E: the event is known at the end of the first failing arc, open, between ${evAt(36)[0]?.extentFrom} and ${evAt(36)[0]?.extentTo}`);
ok(evAt(48)[0].open && evAt(48)[0].extentFrom === isoH(24) && evAt(60)[0].open === false && evAt(60)[0].extentTo === isoH(36) && evAt(96)[0].extentFrom === isoH(24), 'E: a closing arc after the run, read only once it ends, closes the event; later arcs change nothing');
ok(D.A.breakEventsAsOf({ ...doc, arcs: arcsOf([0, 12]) }, H0 + 96 * 3600e3).length === 0, 'E: a run with no closing arc before it is no event');
ok(D.A.breakEventsAsOf({ ...doc, arcs: arcsOf([12, 24, 36, 48]) }, H0 + 96 * 3600e3).length === 0, 'E: a run of more than maxRun arcs is a drift, no event');
ok(D.A.breakEventsAsOf({ ...doc, arcs: arcsOf([12, 24, 36, 48]) }, H0 + 60 * 3600e3).length === 1 && D.A.breakEventsAsOf({ ...doc, arcs: arcsOf([12, 24, 36, 48]) }, H0 + 72 * 3600e3).length === 0, 'E: as read at a cutoff the first three failing arcs are an event until the fourth ends, then a drift');
const withFail = arcsOf([12, 24]); withFail[1].wrms = null;
ok(D.A.breakEventsAsOf({ ...doc, arcs: withFail }, H0 + 96 * 3600e3).length === 0, 'E: an arc whose fit failed is no failing arc, and no arc that closed');
await ffm.close();
const failed = results.filter((x) => !x.ok);
console.log(failed.length ? `BURN DETECTOR CHECK: FAIL (${failed.map((x) => x.what).join('; ')})` : `BURN DETECTOR CHECK: PASS (${results.map((x) => x.what).join('; ')})`);
process.exit(failed.length ? 1 : 0);
