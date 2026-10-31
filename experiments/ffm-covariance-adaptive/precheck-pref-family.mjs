// C3-A8 point 1: what lay under P-REF's first stop, by family, axis and lead, calibration and validation apart: rms of forecast minus truth, reference minus truth and forecast minus reference, their correlation, and the variance
// of forecast minus reference over forecast minus truth, pooled over the family's primary samples. Stored rows only; statistics only; no FFM. The stop's interval in precheck-P-REF.json is the two-way bootstrap of the mean
// standardized product, which is why its bounds pass +/-1; the rule does not change.
//   node experiments/ffm-covariance-adaptive/precheck-pref-family.mjs
import { config, registered, Opened, writeReceipt } from './common.mjs';
import { loadClass, samplesOf, constellationOf } from './lib/windows.mjs';

registered();
const opened = new Opened();
const mean = (v) => v.reduce((p, q) => p + q, 0) / v.length;
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let c = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i += 1) { c += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return c / Math.sqrt(sa * sb); };
const rms = (v) => Math.sqrt(mean(v.map((x) => x * x)));
const out = { plan: 'C3-A8 point 1', intervalNote: "The interval in precheck-P-REF.json is the two-way bootstrap of the mean standardized product, which is why its bounds pass +/-1. The rule does not change.", varianceRatio: 'mean square of forecast minus reference over mean square of forecast minus truth, pooled', classes: {} };
const familyOf = (s) => { const c = constellationOf(s.w.norad); if (c === 'sphere') return 'spheres'; if (c === 'Galileo') return 'Galileo'; return s.w.cluster === 'GLO-P2' ? 'GLONASS plane 2' : 'GLONASS other'; };
for (const cls of ['R3', 'R2-M', 'R2-O']) {
  const D = loadClass(cls, { opened });
  const families = cls === 'R3' ? ['Galileo', 'GLONASS other', 'GLONASS plane 2', 'spheres'] : ['spheres'];
  out.classes[cls] = {};
  for (const set of ['calibration', 'validation']) {
    const all = samplesOf(D, set).filter((s) => s.primary && s.l.ref?.minusTruthRtnM), rows = [];
    for (const family of families) for (const L of config.leads_h) for (let k = 0; k < 3; k += 1) {
      const x = all.filter((s) => s.l.L === L && familyOf(s) === family);
      if (x.length < 20) { rows.push({ family, L, axis: 'RTN'[k], n: x.length }); continue; }
      const a = x.map((s) => s.l.err[k]), b = x.map((s) => s.l.ref.minusTruthRtnM[k]), f = x.map((s) => s.l.ref.errRtnM[k]);
      rows.push({ family, L, axis: 'RTN'[k], n: x.length, r: corr(a, b), rmsForecastTruthM: rms(a), rmsReferenceTruthM: rms(b), rmsForecastReferenceM: rms(f), varianceRatio: mean(f.map((q) => q * q)) / mean(a.map((q) => q * q)) });
    }
    out.classes[cls][set] = rows;
  }
}
console.log(writeReceipt('precheck-P-REF-family', out, opened));
const pick = (family, L, axis) => out.classes.R3.calibration.filter((r) => r.family.startsWith(family) && (!L || L.includes(r.L)) && r.axis === axis).map((r) => `${r.family} ${r.L} ${r.axis} ${r.varianceRatio?.toFixed(3)}`);
console.log(pick('GLONASS', [1, 6, 12], 'N').join(' | '));
console.log(pick('', [1, 6], 'R').join(' | '));
console.log(pick('', [1, 6], 'T').join(' | '));
console.log(pick('', [12, 24, 48, 72], 'T').join(' | '));
process.exit(0);
