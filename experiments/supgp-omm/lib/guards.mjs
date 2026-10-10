// Guards: every reported RMS must come from the intended element set on the
// intended window. A guard that trips is a defect of the harness (or of the
// data's identity), never a result: it throws, the row is recorded as a guard
// failure, and the pass exits non-zero.
const ELEMENTS = ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'];
const utcMs = (t) => Date.parse(/[zZ]$/.test(t) ? t : `${t}Z`);
const bare = (t) => String(t).replace(/Z$/, '');

export class GuardError extends Error {
  constructor(who, id, message) {
    super(`guard ${id} (${who}): ${message}`);
    this.guard = id;
    this.who = who;
  }
}

export class Guard {
  constructor(who) { this.who = who; this.checks = []; }

  must(id, ok, message) {
    if (!ok) throw new GuardError(this.who, id, message);
    if (!this.checks.includes(id)) this.checks.push(id);
  }

  // The OMM stream sent for CelesTrak's set is one record, and it is that row.
  supgpSetSent(row, decoded) {
    this.must('set-count', decoded.length === 1, `${decoded.length} element sets sent, expected exactly 1`);
    const d = decoded[0];
    this.must('set-identity', d.NORAD_CAT_ID === row.norad && d.EPOCH === row.epoch, `sent ${d.NORAD_CAT_ID} ${d.EPOCH}, intended ${row.norad} ${row.epoch}`);
    for (const k of ELEMENTS) this.must('set-elements', Object.is(d[k], row.elements[k]), `${k}: sent ${d[k]}, snapshot ${row.elements[k]}`);
  }

  // element_residuals answered for the one set and the one window that was asked.
  scoreEcho({ res, norad, set, label, window, who }) {
    const id = `echo:${who}`;
    this.must(id, res.kind === 'element-residuals' && Array.isArray(res.results) && res.results.length === 1, 'not exactly one result');
    this.must(id, res.counts?.elementSets === 1, `${res.counts?.elementSets} element sets loaded by the module, expected 1`);
    const r = res.results[0];
    this.must(id, !r.error, `module error: ${r.error}`);
    this.must(id, r.norad === norad && r.set === set && r.label === label, `answered for ${r.norad} ${r.set} ${r.label}, asked ${norad} ${set} ${label}`);
    this.must(id, r.windows?.length === 1, `${r.windows?.length} windows answered, asked 1`);
    const w = r.windows[0];
    this.must(id, w.label === 'window' && w.from === window.from && w.to === window.to, `window ${w.from}..${w.to}, asked ${window.from}..${window.to}`);
    this.must(id, w.failures === 0, `${w.failures} propagation failures`);
    if (w.n > 0) {
      this.must(id, utcMs(w.span[0]) >= window.fromMs - 1 && utcMs(w.span[1]) <= window.toMs + 1, `points ${w.span.join('..')} outside the window ${window.from}..${window.to}`);
    }
  }

  // fit_elements fitted what was asked, on the same points CelesTrak's set was scored on.
  fitReport({ report, norad, window, scoredSupgp, fit, apriori = 0 }) {
    this.must('fit-report', report.kind === 'element-fit' && report.fits?.length === 1 && report.fits[0].norad === norad, 'report is not exactly the one requested fit');
    this.must('fit-report', report.counts?.aprioriSets === apriori, `${report.counts?.aprioriSets} a priori sets loaded by the module, expected ${apriori}`);
    if (!fit.converged) return;
    this.must('fit-points', fit.rms.n === scoredSupgp.n, `ours scored ${fit.rms.n} points, CelesTrak's set ${scoredSupgp.n}`);
    this.must('fit-points', fit.rms.span?.[0] === scoredSupgp.span?.[0] && fit.rms.span?.[1] === scoredSupgp.span?.[1], `ours ${fit.rms.span} vs CelesTrak's ${scoredSupgp.span}`);
    this.must('fit-points', fit.states.inSpan === fit.rms.n && fit.states.rejected === 0, `states in span ${fit.states.inSpan}, scored ${fit.rms.n}, rejected ${fit.states.rejected}`);
    this.must('fit-epoch', fit.epochRequest === 'first' || bare(fit.epoch) === bare(`${fit.epochRequest}`), `fit epoch ${fit.epoch}, requested ${fit.epochRequest}`);
    this.must('fit-window', utcMs(fit.rms.span[0]) >= window.fromMs - 1 && utcMs(fit.rms.span[1]) <= window.toMs + 1, `fit points ${fit.rms.span} outside ${window.from}..${window.to}`);
  }

  // The OMM that is persisted is the one that was fitted.
  fitOmm({ ommBytes, norad, fit, decode }) {
    const recs = decode(ommBytes);
    this.must('fit-omm', recs.length === 1, `${recs.length} OMM records returned, expected 1`);
    const o = recs[0];
    this.must('fit-omm', o.NORAD_CAT_ID === norad && bare(o.EPOCH) === bare(fit.epoch), `OMM ${o.NORAD_CAT_ID} ${o.EPOCH}, fit ${norad} ${fit.epoch}`);
    for (const k of ELEMENTS) this.must('fit-omm', Object.is(o[k], fit.elements[k]), `${k}: OMM ${o[k]}, report ${fit.elements[k]}`);
  }

  // The OMM record, scored alone through element_residuals on the same window, gives the fit's own statistics.
  oursRescored({ fit, again }) {
    this.must('ours-rescored', again.n === fit.rms.n && again.span?.[0] === fit.rms.span[0] && again.span?.[1] === fit.rms.span[1], `rescored ${again.n} ${again.span} vs fit ${fit.rms.n} ${fit.rms.span}`);
    this.must('ours-rescored', Math.abs(again.rms3dKm - fit.rms.rms3dKm) <= 1e-9, `rescored 3D RMS ${again.rms3dKm} vs fit ${fit.rms.rms3dKm}`);
  }
}
