// Ways of making AP's record for the synthetic orbits (stack #504; the owner, 2026-11-11: "I do not care HOW the OCMs are created,
// just that once they are created the propagator hits our goals", and 12:25Z: "if we are fitting on FFMs numerical forecast and that
// gives good results, then use that"). run.mjs names one with --fit <name>; each is FITS[name] = { truthStartH, fit(ctx) -> { ocm, note } }
// and its record is scored exactly as AP's 72 h fit is: D over 0 to 120 h after the cutoff against the truth.
//
// ctx (run.mjs): lines (every truth state, 300 s), D0 (the cutoff, ms), drag (the truth has drag), wx (the weather known at the cutoff),
// terms (the case's true drag and radiation terms, m^2/kg), label and fitPcf (AP's $PCF for the case: its forces as the truth's),
// oemOf(fromMs, toMs) (the truth's states over that span as an $OEM, its useable span the same), fitOf(oem, pcf, spw) (the module's fit),
// and S, A (headline-loop lib/arms.mjs), APL (operator-theory lib/ap.mjs).
//
// The ways:
// - cutoff72: the 72 h arc before the cutoff, AP's $PCF (the default arc72 of run.mjs, without the SGP4-XP flight, so it can be scored on
//   the truth of any --truth-start-h);
// - arc24, arc120, arc168: the arc of that many hours before the cutoff, AP's $PCF;
// - held-terms: the 72 h arc before the cutoff with the drag and radiation terms held at the truth's own values (FIT.DRAG_PRIOR and
//   FIT.SRP_PRIOR at the true term, sigma 1e-6 of ln B and 1e-9 m^2/kg), the state solved;
// - forecast-span: the numerical propagator's forecast from the cutoff to 5 days (0 to 120 h), AP's $PCF: the state, BTERM where the
//   truth has drag and AGOM solved, with AP's default priors;
// - arc-plus-forecast: the 72 h arc before the cutoff and the forecast to 5 days (-72 to 120 h), the same terms;
// - forecast-7d: the forecast from the cutoff to 7 days (0 to 168 h), the same terms;
// - forecast-span-ladder: forecast-span, and where the module refuses that span as one set (fit-implausible, a branch limit), the longest
//   of 96, 72, 48 and 24 h from the cutoff it fits.
// The forecast ways read the truth after the cutoff, which on a real window is the numerical propagator's forecast from its own fit
// before the cutoff: the record is made after that forecast exists, and every input to it is data before the cutoff.
const H = 3600e3;

/** The truth's states from fromH to toH hours after the cutoff, fitted with the $PCF pcf(ctx) (default AP's own). */
const span = (fromH, toH, pcf = null) => async (ctx) => {
  const t = performance.now();
  const ocm = await ctx.fitOf(ctx.oemOf(ctx.D0 + fromH * H, ctx.D0 + toH * H), pcf ? pcf(ctx) : ctx.fitPcf, ctx.wx?.spw);
  return { ocm, note: `fit ${fromH} h to ${toH} h after the cutoff; ${((performance.now() - t) / 1000).toFixed(2)} s` };
};

/** The forecast from the cutoff to 5 days; where the module refuses that span as one set, the longest of 96, 72, 48 and 24 h it fits. */
const ladder = async (ctx) => {
  let last;
  for (const h of [120, 96, 72, 48, 24]) {
    try { const made = await span(0, h)(ctx); return h === 120 ? made : { ocm: made.ocm, note: `${made.note}; the module refused the longer spans (${String(last?.message ?? last).slice(0, 80)})` }; } catch (e) { last = e; }
  }
  throw last;
};

/** AP's $PCF with the drag and radiation terms held at the truth's values (headline-loop's carriedPcf, sigmas near zero). */
const held = (ctx) => ctx.A.carriedPcf(ctx.fitPcf, { b: ctx.terms.dragAreaOverMass, sLnB: 1e-6, agom: ctx.terms.srpAreaOverMass, sAgom: 1e-9 }, { drag: ctx.drag, radiation: !/radiation term held at 0/.test(ctx.label) });

export const FITS = {
  cutoff72: { truthStartH: 72, fit: span(-72, 0) },
  arc24: { truthStartH: 24, fit: span(-24, 0) },
  arc120: { truthStartH: 120, fit: span(-120, 0) },
  arc168: { truthStartH: 168, fit: span(-168, 0) },
  'held-terms': { truthStartH: 72, fit: span(-72, 0, held) },
  'forecast-span': { truthStartH: 0, fit: span(0, 120) },
  'forecast-span-ladder': { truthStartH: 0, fit: ladder },
  'arc-plus-forecast': { truthStartH: 72, fit: span(-72, 120) },
  'forecast-7d': { truthStartH: 0, fit: span(0, 168) },
};
