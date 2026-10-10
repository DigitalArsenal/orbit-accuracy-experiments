// Method A of E13: one full-force HPOP fit of the first hours (the head) of a
// SpaceX ephemeris file, drag fitted and Cr*A/m locked at the class value. It
// is the starlink-forecast lane's truth-head fit, kept as one function with
// its guards:
//   - the record names the fit it came from (`fitId`), and `checkRecord`
//     recomputes that id and the residual statistics from the stored fit, so
//     an analysis that reads a record can never score numbers from another fit;
//   - `synthetic` makes a head with HPOP at a known Cd*A/m and the same fit
//     must give it back.
// All orbit computation is the modules'; this file frames inputs and counts.
import crypto from 'node:crypto';
import * as lib from './vendor/ephemeris-fit.mjs';
import { convertRepresentation } from './vendor/frames.mjs';
import { H, config, crAreaOverMassFor, isoZ } from './common.mjs';

const S = config.starlink;
export const RECORD_VERSION = 1;
const noZ = (t) => t.replace(/Z$/, '');
const isoUs = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');

// The fit forms. 'drag' is the measurement (Cd*A/m fitted, Cr*A/m locked, no in-track term);
// 'dragThrust' adds a constant along-track acceleration and is run only to characterise a head the first form does not explain.
export const FORMS = {
  drag: (cr) => ({ id: 'drag', fit: { inTrack: false, lockSrp: true }, apriori: { cdAreaOverMass: 0.03, crAreaOverMass: cr } }),
  dragThrust: (cr) => ({ id: 'dragThrust', fit: { inTrack: true, lockSrp: true }, apriori: { cdAreaOverMass: 0.03, crAreaOverMass: cr } }),
};
const settingsFor = (form) => ({ ...lib.SETTINGS, fit: { ...lib.SETTINGS.fit, ...form.fit } });

export const fitId = ({ fileSha256, form, headHours, issuedMs, harness, crAreaOverMass }) =>
  crypto.createHash('sha256').update(JSON.stringify({ fileSha256, form, headHours, issuedMs, harness, crAreaOverMass })).digest('hex').slice(0, 24);

const resid = (stats) => ({ n: stats.n, rms3dM: stats.rms3d, max3dM: stats.max3d, rmsRM: stats.rmsR, rmsTM: stats.rmsT, rmsNM: stats.rmsN, maxRM: stats.maxR, maxTM: stats.maxT, maxNM: stats.maxN });
const dragOf = (fit) => fit.parameters.find((p) => p.kind === 'DRAG_AREA_OVER_MASS').value;

export async function openFitter(envConfig) {
  const env = await lib.ephemerisFitEnv(envConfig);

  async function makeCtx(first, issuedMs, settings, apriori) {
    const setup = await lib.segmentSetup(env, first, settings);
    return { S: settings, regime: setup.regime, integrator: setup.integrator, forces: lib.forcesFor(setup.regime, settings), issuedMs, apriori, keepRows: false, perigeeAltitudeM: setup.perigeeAltitudeM };
  }

  // One HPOP fit of `points` under `form`: {product, fit, ctx, stats (every point), rows}.
  async function hpopFit(points, form, issuedMs) {
    const settings = settingsFor(form);
    const ctx = await makeCtx(points[0], issuedMs, settings, form.apriori);
    const { product, fit } = await lib.fitRun(env, points, ctx);
    const model = (await lib.propagate(env, product, points.map((p) => p.ms), ctx)).map((x) => x.state);
    const rows = await lib.residualRows(env, points, model);
    return { product, fit, ctx, stats: lib.statsOf(rows, points), rows };
  }

  // The head of one file version -> one derived record. `job`: {norad, satName, file (provenance), head, startSigma, fileFacts, fullCheck}.
  async function fitHead(job) {
    const t0 = performance.now();
    const { norad, file, head } = job;
    const points = await lib.normalize(env, { frame: head.frame, timeScale: head.timeScale,
      states: head.epochs.map((e, i) => ({ epoch: e, position: head.states[i].slice(0, 3), velocity: head.states[i].slice(3, 6) })) });
    const issuedMs = Date.parse(file.created);
    const fits = {};
    const cr = job.crAreaOverMass ?? crAreaOverMassFor(norad);   // the locked Cr*A/m: the Starlink class value unless the job states one
    const crLabel = job.crLabel ?? `ASSUMPTION: Starlink class value for NORAD ${norad < 56000 ? '<' : '>='} 56000`;
    for (const name of ['drag', 'dragThrust']) {
      const form = FORMS[name](cr);
      const r = await hpopFit(points, form, issuedMs);
      const jumps = lib.residualJumps(r.rows, points, lib.SETTINGS.jumps).map((j) => ({ atHours: (j.fromMs - points[0].ms) / H, toHours: (j.toMs - points[0].ms) / H, peakMps2: j.peakMps2, component: j.component, samples: j.samples }));
      const byHour = [];
      for (let h = 0; h * H < points.at(-1).ms - points[0].ms; ++h) {
        const idx = points.map((p, i) => i).filter((i) => (points[i].ms - points[0].ms) / H >= h && (points[i].ms - points[0].ms) / H < h + 1);
        if (!idx.length) continue;
        byHour.push({ hour: h, n: idx.length, rms3dM: Math.sqrt(idx.reduce((a, i) => a + r.rows[i].reduce((s, x) => s + x * x, 0), 0) / idx.length), meanTM: idx.reduce((a, i) => a + r.rows[i][1], 0) / idx.length });
      }
      const gate = { limitRms3dM: S.gateRms3dM, pass: r.stats.rms3d <= S.gateRms3dM };
      fits[name] = {
        form: name, fitId: fitId({ fileSha256: file.sha256, form: name, headHours: S.headHours, issuedMs, harness: lib.VERSION, crAreaOverMass: form.apriori.crAreaOverMass }),
        fit: { epoch: r.product.epoch, state: r.product.state, parameters: r.fit.parameters, fixed: r.product.fixed, iterations: r.fit.iterations, converged: r.fit.converged,
          boundStatus: r.fit.boundStatus, reducedChiSquare: r.fit.reducedChiSquare, weightedRms: r.fit.weightedRms, fitPoints: r.fit.fitPoints, hpopCalls: r.fit.hpopCalls },
        dragCdAreaOverMass: dragOf(r.fit),
        srp: { crAreaOverMass: form.apriori.crAreaOverMass, locked: true, label: crLabel },
        residuals: resid(r.stats), byHour, gate, jumps,
        context: { issuedMs, issued: isoZ(issuedMs), regime: r.ctx.regime, integrator: r.ctx.integrator, forces: r.ctx.forces, perigeeAltitudeM: r.ctx.perigeeAltitudeM },
      };
      // The thrust form is run only when the drag form is not enough: it misses the gate or shows a residual jump.
      if (name === 'drag' && fits.drag.gate.pass && !fits.drag.jumps.length) break;
    }
    const record = {
      kind: 'e13-head-fit', version: RECORD_VERSION, provider: job.provider ?? 'starlink', objectId: job.objectId ?? String(norad), norad, satName: job.satName, file, startSigma: job.startSigma, fileFacts: job.fileFacts,
      headHours: S.headHours, headPoints: points.length, primary: 'drag', fits,
      provenance: { fitter: lib.VERSION, ...env.provenance },
      fitSeconds: (performance.now() - t0) / 1000,
    };
    await checkRecord(record, job.fullCheck ? points : null);
    return record;
  }

  // Trajectory of a stored fit at epochs (ms, ascending, none before the fit epoch): GCRF states [m, m/s].
  async function reconstruct(fitRecord, epochsMs) {
    const product = { epoch: fitRecord.fit.epoch, state: fitRecord.fit.state, fixed: fitRecord.fit.fixed, parameters: [] };
    const ctx = { forces: fitRecord.context.forces, integrator: fitRecord.context.integrator, issuedMs: fitRecord.context.issuedMs };
    return (await lib.propagate(env, product, epochsMs, ctx)).map((x) => x.state);
  }

  // GUARD: the record's fit ids are the ids of its own inputs, and the stored fit, propagated again, reproduces the
  // stored 3D RMS of the head at its own points (so a number read from this record belongs to the fit that made it).
  // `points` are the head's points as the fit used them.
  async function checkRecord(record, points = null) {
    for (const [name, f] of Object.entries(record.fits)) {
      const expected = fitId({ fileSha256: record.file.sha256, form: name, headHours: record.headHours, issuedMs: f.context.issuedMs, harness: record.provenance.fitter, crAreaOverMass: f.srp.crAreaOverMass });
      if (f.fitId !== expected) throw new Error(`RECORD GUARD FAILED: ${record.norad} ${name}: fit id ${f.fitId} is not the id of its inputs (${expected})`);
      if (f.form !== name || f.fit.fixed.agom !== f.srp.crAreaOverMass) throw new Error(`RECORD GUARD FAILED: ${record.norad} ${name}: form or locked Cr*A/m differs from the one named in the record`);
      if (Math.abs(f.fit.fixed.b - f.dragCdAreaOverMass) > 1e-15) throw new Error(`RECORD GUARD FAILED: ${record.norad} ${name}: the fixed Cd*A/m ${f.fit.fixed.b} is not the fitted ${f.dragCdAreaOverMass}`);
    }
    if (record.primary !== 'drag' || !record.fits.drag) throw new Error(`RECORD GUARD FAILED: ${record.norad}: no primary drag fit`);
    if (points) {
      const f = record.fits.drag;
      const model = await reconstruct(f, points.map((p) => p.ms));
      const rows = await lib.residualRows(env, points, model);
      const again = lib.statsOf(rows, points).rms3d;
      if (Math.abs(again - f.residuals.rms3dM) > 1e-6 * Math.max(1, f.residuals.rms3dM)) throw new Error(`RECORD GUARD FAILED: ${record.norad}: the stored fit gives ${again} m on its own points, the record says ${f.residuals.rms3dM} m`);
    }
    return true;
  }

  // Synthetic known-answer test: a head made by HPOP at a known Cd*A/m (and Cr*A/m), fitted by the same code.
  async function synthetic({ trueCd, trueCr, lockCr, noiseM = 0, headHours = S.headHours, label }) {
    const t0 = performance.now();
    const startMs = Date.parse('2026-10-09T09:48:42Z');
    const kepler = await convertRepresentation(env.modules['foundation/frames'], isoUs(startMs), 'KEPLERIAN', [6378137 + 480e3 + 1500, 0.0009, 70.09 * Math.PI / 180, 120 * Math.PI / 180, 80 * Math.PI / 180, 10 * Math.PI / 180], 'CARTESIAN');
    const epochs = Array.from({ length: Math.round(headHours * 60) + 1 }, (_, k) => startMs + k * 60000);
    const first = { ms: startMs, state: kepler, hasVelocity: true };
    const truthCtx = await makeCtx(first, startMs, lib.SETTINGS, { cdAreaOverMass: trueCd, crAreaOverMass: trueCr });
    const truthProduct = { epoch: noZ(isoUs(startMs)), state: kepler, fixed: { b: trueCd, agom: trueCr, inTrack: 0 }, parameters: [] };
    const truth = (await lib.propagate(env, truthProduct, epochs, truthCtx)).map((x) => x.state);
    let seed = 12345;
    const rnd = () => { seed = (seed + 0x9e3779b9) >>> 0; let z = seed; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0; return ((z ^ (z >>> 16)) >>> 0) / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-300)) * Math.cos(2 * Math.PI * rnd());
    const points = epochs.map((ms, k) => ({ ms, state: noiseM ? truth[k].map((v, j) => (j < 3 ? v + noiseM * gauss() : v)) : truth[k], hasVelocity: true }));
    const form = { id: 'drag', fit: { inTrack: false, lockSrp: true }, apriori: { cdAreaOverMass: 0.01, crAreaOverMass: lockCr } };
    const r = await hpopFit(points, form, startMs);
    const fitted = dragOf(r.fit);
    return { label, trueCd, trueCr, lockCr, noiseM, headHours, fittedCd: fitted, relativeError: (fitted - trueCd) / trueCd, converged: r.fit.converged, iterations: r.fit.iterations,
      rms3dM: r.stats.rms3d, seconds: (performance.now() - t0) / 1000, harness: lib.VERSION };
  }

  return { env, fitHead, reconstruct, checkRecord, synthetic, destroy: () => env.destroy(), harness: lib.VERSION };
}
