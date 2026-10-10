// Known-answer checks, run before any real data. The expected values do not come from this pass:
// they are the fitter's own reference fixture (tests/fit-reference.json of the gp-error-model
// checkout), written by python-sgp4, pyerfa and scipy.
//
//   1. Fit and score through the pass's own code (evaluate): the elements that generated a
//      python-sgp4 ephemeris come back, CelesTrak's-set slot filled by those elements passes the gate,
//      and every guard holds.
//   2. The wrong element set is refused: another object's elements fail the gate, and a mismatched
//      set is caught by the guard before the module is called.
//   3. NASA's ISS ephemeris and CelesTrak's ISS-E Segment 01 set of 2026-07-13: the per-coordinate RMS
//      on the 6-hour window is the python-sgp4 value of the fixture (the convention of CelesTrak's rms files).
import fs from 'node:fs';
import path from 'node:path';
import * as flatbuffers from 'flatbuffers';
import * as OEMs from 'spacedatastandards.org/lib/js/OEM/main.js';
import { PATHS } from './config.mjs';
import { evaluate, windowOf } from './lib/score.mjs';
import { Guard, GuardError } from './lib/guards.mjs';
import { OEM_TYPE, decodeOmmStream, ommFrame, summarizeOem } from './lib/records.mjs';

const { OEM, OEMT, CATT, RFMT, ephemerisDataBlockT, ephemerisDataLineT, timingStandard } = OEMs;
const DEG = Math.PI / 180;

function block(norad, frame, spec) {
  const b = new ephemerisDataBlockT();
  Object.assign(b, { CENTER_NAME: 'EARTH', TIME_SYSTEM: timingStandard.UTC });
  b.OBJECT = Object.assign(new CATT(), { NORAD_CAT_ID: norad });
  b.REFERENCE_FRAME = Object.assign(new RFMT(), { NAME: frame });
  if (spec.lines) {
    b.EPHEMERIS_DATA_LINES = spec.lines.map(([epoch, x]) => {
      const l = new ephemerisDataLineT();
      l.EPOCH = epoch;
      [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT] = x.length === 6 ? x : [...x, 0, 0, 0];
      return l;
    });
  } else {
    Object.assign(b, { START_TIME: spec.start, STEP_SIZE: spec.step, STATE_VECTOR_SIZE: spec.size, EPHEMERIS_DATA: spec.data });
  }
  return b;
}
function ephemeris(...blocks) {
  const fb = new flatbuffers.Builder(1 << 20);
  OEM.finishSizePrefixedOEMBuffer(fb, Object.assign(new OEMT(), { EPHEMERIS_DATA_BLOCK: blocks }).pack(fb));
  return { portId: 'ephemeris', payload: Buffer.from(fb.asUint8Array()), typeRef: OEM_TYPE };
}
const equinoctial = (el) => {
  const varpi = (el[4] + el[3]) * DEG, t = Math.tan((el[2] * DEG) / 2);
  return [el[0] * 2 * Math.PI / 1440, el[1] * Math.cos(varpi), el[1] * Math.sin(varpi), t * Math.sin(el[3] * DEG), t * Math.cos(el[3] * DEG), (el[5] + el[4] + el[3]) * DEG, el[6]];
};
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ELS = ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'];
const setOf = (truth) => Object.fromEntries(ELS.map((k, i) => [k, truth[i]]));

export async function knownAnswers(fitter, { fitModules = PATHS.fitModules } = {}) {
  const fixturePath = path.join(fitModules, 'analysis/gp-error-model/tests/fit-reference.json');
  if (!fs.existsSync(fixturePath)) throw new Error(`known-answer fixture missing: ${fixturePath}`);
  const ref = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const report = [];
  const check = (name, ok, detail) => { report.push({ name, ok: !!ok, detail }); if (!ok) throw new Error(`known-answer failed: ${name}: ${detail}`); };

  // 1. python-sgp4 ephemerides of known elements, through evaluate().
  for (const c of ref.synthetic.filter((x) => ['leo-starlink', 'leo-high', 'leo-position-only', 'geo'].includes(x.name))) {
    const e = ephemeris(block(40000, c.frame, { start: c.start, step: c.stepSeconds, size: c.stateVectorSize, data: c.data }));
    const summary = summarizeOem(e.payload);
    const row = { group: 'kat', norad: 40000, epoch: c.epoch, elements: setOf(c.truth), publishedRmsKm: 0 };
    const hours = (summary.lastMs - Date.parse(`${c.epoch}Z`)) / 3600e3 + 0.001;
    const out = await evaluate(fitter, { row, ephemeris: e, summary, hours, fit: true });
    check(`${c.name}: the generating set scores zero on its own ephemeris`, out.supgp.rms3dKm < 2e-6 && out.gate.pass, `rms3d ${out.supgp.rms3dKm} km`);
    check(`${c.name}: fit converged on every state`, out.ours?.converged && out.ours.rms.n === c.count && out.ours.rms.max3dKm < 2e-6, `n ${out.ours?.rms?.n}/${c.count}, max ${out.ours?.rms?.max3dKm} km`);
    const got = equinoctial(ELS.map((k) => out.ours.elements[k]));
    const want = equinoctial(c.truth);
    const tol = [1e-12, 1e-9, 1e-9, 1e-9, 1e-9, 1e-9, c.fitBstar ? 1e-8 : 1e-12];
    const worst = got.map((g, k) => Math.abs(k === 5 ? wrapPi(g - want[k]) : g - want[k]) / (tol[k] || 1));
    check(`${c.name}: the generating elements come back`, worst.every((w, k) => w <= 1 || (!c.fitBstar && k === 6)), `worst parameter/tolerance ${Math.max(...worst).toExponential(2)}`);
    check(`${c.name}: the guards held`, ['set-identity', 'echo:supgp', 'fit-points', 'fit-omm', 'echo:ours', 'ours-rescored'].every((g) => out.guards.includes(g)), out.guards.join(','));
    if (c.name === 'leo-starlink') {
      // The window evidence: with the window set to half the ephemeris, the fits on windows 0.5, 0.75, 1, 1.5 and 2 times as long
      // take the states of those windows (the grid is regular) and, the ephemeris being exact SGP4, reach zero on each.
      const half = (summary.lastMs - Date.parse(`${c.epoch}Z`)) / 7200e3 + 0.0005;
      const wide = await evaluate(fitter, { row, ephemeris: e, summary, hours: half, fit: true, windowFits: true });
      const n = Object.fromEntries(Object.entries(wide.windowFits ?? {}).map(([f, r]) => [f, r.n]));
      const grid = (f) => Math.floor((f * half * 3600) / c.stepSeconds) + 1;
      check(`${c.name}: the fits on the other windows take those windows' states and reach zero`, ['0.5', '0.75', '1', '1.5', '2'].every((f) => n[f] && Math.abs(n[f] - grid(Number(f))) <= 1 && wide.windowFits[f].rmsPerCoordinateKm < 2e-6) && wide.guards.includes('window-fit:x2'), `n ${JSON.stringify(n)}, states ${c.count}`);
    }
  }

  // 2. The wrong set. Another object's elements: the gate refuses; a mismatched frame is caught by the guard.
  {
    const c = ref.synthetic.find((x) => x.name === 'leo-starlink');
    const other = ref.synthetic.find((x) => x.name === 'leo-low');
    const e = ephemeris(block(40000, c.frame, { start: c.start, step: c.stepSeconds, size: c.stateVectorSize, data: c.data }));
    const summary = summarizeOem(e.payload);
    const wrong = { group: 'kat', norad: 40000, epoch: c.epoch, elements: setOf(other.truth), publishedRmsKm: 0.2 };
    const out = await evaluate(fitter, { row: wrong, ephemeris: e, summary, hours: 6, fit: true });
    check('another object\'s elements fail the gate', out.gate.pass === false && out.ours === null, `recomputed ${out.gate.recomputedRmsKm} km against published 0.2`);
    const guard = new Guard('kat');
    const sent = decodeOmmStream(ommFrame([{ norad: 40000, epoch: c.epoch, elements: setOf(other.truth) }]).payload);
    let caught = null;
    try { guard.supgpSetSent({ norad: 40000, epoch: c.epoch, elements: setOf(c.truth) }, sent); } catch (e2) { caught = e2; }
    check('a set other than the intended one trips the set guard', caught instanceof GuardError && caught.guard === 'set-elements', String(caught?.message));
    const window = windowOf({ epoch: c.epoch, hours: 6, summary });
    let caught2 = null;
    try { new Guard('kat').scoreEcho({ res: { kind: 'element-residuals', counts: { elementSets: 2 }, results: [{}] }, norad: 40000, set: 'x', label: 'y', window, who: 'supgp' }); } catch (e3) { caught2 = e3; }
    check('two element sets in one call trip the echo guard', caught2 instanceof GuardError, String(caught2?.message));
  }

  // 3. NASA ISS ephemeris (trimmed) and CelesTrak's ISS-E Segment 01 of 2026-07-13, scored by python-sgp4 in the fixture.
  {
    const iss = ref.iss;
    const csv = path.join(fitModules, iss.supgp.csv);
    if (!fs.existsSync(csv)) {
      report.push({ name: 'ISS-E Segment 01 (python-sgp4 oracle)', ok: null, detail: `skipped: ${iss.supgp.csv} is absent` });
    } else {
      const [head, ...rows] = fs.readFileSync(csv, 'utf8').trim().split(/\r?\n/).map((l) => l.split(','));
      const r = Object.fromEntries(head.map((k, i) => [k, rows[iss.supgp.row][i]]));
      const e = ephemeris(block(25544, iss.frame, { lines: iss.states.map(([t, ...x]) => [t.endsWith('Z') ? t : `${t}Z`, x]) }));
      const summary = summarizeOem(e.payload);
      const row = { group: 'kat', norad: 25544, epoch: r.EPOCH, elements: Object.fromEntries(ELS.map((k) => [k, Number(r[k])])), publishedRmsKm: iss.supgp.window6h.rmsPerCoordinateKm };
      const out = await evaluate(fitter, { row, ephemeris: e, summary, hours: 6, fit: true });
      const want = iss.supgp.window6h;
      check('ISS-E Segment 01: window of 91 states', out.supgp.n === want.n, `n ${out.supgp.n}, python-sgp4 ${want.n}`);
      check('ISS-E Segment 01: per-coordinate RMS equals python-sgp4\'s', Math.abs(out.supgp.rmsPerCoordinateKm - want.rmsPerCoordinateKm) < 1e-6, `${out.supgp.rmsPerCoordinateKm} vs ${want.rmsPerCoordinateKm} km`);
      check('ISS-E Segment 01: ours is not worse on the same points', out.ours?.converged && out.ours.rms.rmsPerCoordinateKm <= out.supgp.rmsPerCoordinateKm + 1e-9, `ours ${out.ours?.rms?.rmsPerCoordinateKm}`);
    }
  }
  return report;
}
