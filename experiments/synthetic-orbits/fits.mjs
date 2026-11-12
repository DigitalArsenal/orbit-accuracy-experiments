// Ways of making AP's record for the synthetic orbits (stack #504). How a record is made is free; the goal is what the theory does
// from it. run.mjs names one with --fit <name>; each is FITS[name] = { truthStartH, after, text, fit(ctx) -> { ocm, note } }, and
// its record is scored exactly as AP's 72 h fit is: D over 0 to 120 h after the cutoff against the truth. `after` marks a way that
// fits states after the cutoff; `text` is the sentence the report prints for the way.
//
// ctx (run.mjs): lines (every truth state, 300 s), D0 (the cutoff, ms), drag (the truth has drag), wx (the weather known at the cutoff),
// terms (the case's true drag and radiation terms, m^2/kg), label and fitPcf (AP's $PCF for the case: its forces as the truth's),
// oemOf(fromMs, toMs) (the truth's states over that span as an $OEM, its usable span the same), fitOf(oem, pcf, spw) (the module's fit),
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
// The forecast ways read the truth after the cutoff. On a real window that span is the numerical propagator's forecast from its own
// fit before the cutoff: the record is made after that forecast exists, and every input to it is data before the cutoff. On a
// made-up case the fit reads the same numerical flight it is then scored on, so D is how well one record can follow that flight
// over the span, not a forecast from data before the cutoff.
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

/** AP's $PCF with the drag and radiation terms held at the truth's values: FIT.DRAG_PRIOR LOG_NORMAL at the true term, sigma of ln B
 *  1e-6, where the truth has drag; FIT.SRP_PRIOR GAUSSIAN_SIGNED at the true term, sigma 1e-9 m^2/kg, where it has radiation. FORCES is
 *  packed with its defaults written, as the table packs it. */
const held = (ctx) => {
  const P = ctx.S.PCF, x = P.PCF.getRootAsPCF(new ctx.S.flatbuffers.ByteBuffer(ctx.fitPcf)).unpack();
  const prior = (mean, sigma) => Object.assign(new P.PCFGaussianPriorT(), { MEAN: mean, SIGMA: sigma, HAS_SIGMA: true });
  const radiation = !/radiation term held at 0/.test(ctx.label);
  x.FIT = Object.assign(x.FIT ?? new P.PCFFitPolicyT(), {
    ...(ctx.drag ? { DRAG_PRIOR: prior(ctx.terms.dragAreaOverMass, 1e-6), DRAG_PRIOR_FORM: P.pcfPriorForm.LOG_NORMAL } : {}),
    ...(radiation ? { SRP_PRIOR: prior(ctx.terms.srpAreaOverMass, 1e-9), SRP_PRIOR_FORM: P.pcfPriorForm.GAUSSIAN_SIGNED } : {}) });
  const f = x.FORCES, pack = f.pack.bind(f);
  f.pack = (b) => {
    const offset = b.addFieldOffset;
    b.addFieldOffset = function (slot, value, d) { if (value !== d) offset.call(this, slot, value, d); };
    b.forceDefaults(true);
    try { return pack(b); } finally { b.forceDefaults(false); b.addFieldOffset = offset; }
  };
  const b = new ctx.S.flatbuffers.Builder(1024);
  P.PCF.finishPCFBuffer(b, x.pack(b));
  return b.asUint8Array().slice();
};

// a way's text speaks of AP; whether SGP4-XP is flown beside it is said by the run (run.mjs --xp, xpTextOf)
const before = (h) => `AP is fitted to the truth's states over the ${h} h before the cutoff and flown.`;
const AFTER = 'On a made-up case this fit reads the same numerical flight it is then scored on, so D is how well one record can follow that flight over the span, not a forecast from data before the cutoff. (On a real window the span after the cutoff is the numerical propagator\'s forecast from its own fit before the cutoff, so every input to the record is data before the cutoff.)';
const after = (what) => `AP is fitted to the truth's states ${what} and flown. ${AFTER}`;
export const FITS = {
  cutoff72: { truthStartH: 72, after: false, text: before(72), fit: span(-72, 0) },
  arc24: { truthStartH: 24, after: false, text: before(24), fit: span(-24, 0) },
  arc120: { truthStartH: 120, after: false, text: before(120), fit: span(-120, 0) },
  arc168: { truthStartH: 168, after: false, text: before(168), fit: span(-168, 0) },
  'held-terms': { truthStartH: 72, after: false, text: 'AP is fitted to the truth\'s states over the 72 h before the cutoff with its drag and radiation terms held at the truth\'s own values (the state solved) and flown.', fit: span(-72, 0, held) },
  'forecast-span': { truthStartH: 0, after: true, text: after('from the cutoff to 120 h after it'), fit: span(0, 120) },
  'forecast-span-ladder': { truthStartH: 0, after: true, text: after('from the cutoff to 120 h after it, or, where the module refuses that span as one set, the longest of 96, 72, 48 and 24 h from the cutoff it fits (the row\'s fitNote names it)'), fit: ladder },
  'arc-plus-forecast': { truthStartH: 72, after: true, text: after('from 72 h before the cutoff to 120 h after it'), fit: span(-72, 120) },
  'forecast-7d': { truthStartH: 0, after: true, text: after('from the cutoff to 168 h after it'), fit: span(0, 168) },
};
/** The report's sentence for arc72, run.mjs's default (not a FITS way). */
export const ARC72_TEXT = 'AP and SGP4-XP (THEORY SGP4XP, the same module) are fitted to the truth\'s states over the 72 h before the cutoff and flown.';
/** The sentence for SGP4-XP flown beside AP on a way (run.mjs --xp): its own record, no space weather, fitted over the way's span. */
export const xpTextOf = (way) => `SGP4-XP (THEORY SGP4XP, the same module) is fitted to the same states with its own record and no space weather, and flown beside AP.${FITS[way]?.after ? ' On a made-up case this, too, is a fit to the flight it is scored on.' : ''}`;
export const NO_XP_TEXT = 'SGP4-XP is not flown on this way.';

/**
 * The rungs of the ladder from SGP4-XP toward AP (run.mjs --rung; stack #547): what AP's slot flies, each rung's rows keyed apart.
 * xp is SGP4-XP's own record (A.PCF.XP, no space weather). Every other rung is AP's settings (its atmosphere where the truth has drag,
 * the solid tide, as the headline setting) at MAXIMUM_TESSERAL_DEGREE d and MAXIMUM_DEGREE z: z below 6 carries no zonal tail, and
 * d = z = 0 is AP's gate shut (the module then flies SGP4-XP's theory with AP's fit settings).
 */
export const RUNGS = {
  xp: { degrees: null, text: 'AP\'s slot holds SGP4-XP\'s own record, fitted the same way with no space weather.' },
  'ap-d0-z0': { degrees: [0, 0], text: 'AP\'s settings at tesseral degree 0 and zonal degree 0, without the solid tide (the module flies AP\'s tide only with its gravity terms and refuses it here).' },
  'ap-d0-z5': { degrees: [0, 5], text: 'AP\'s settings at tesseral degree 0 and zonal degree 5 (no zonal tail).' },
  'ap-d0-z20': { degrees: [0, 20], text: 'AP\'s settings at tesseral degree 0 and zonal degree 20.' },
  'ap-d4-z20': { degrees: [4, 20], text: 'AP\'s settings at tesseral degree 4 and zonal degree 20.' },
  'ap-d12-z20': { degrees: [12, 20], text: 'AP\'s settings at tesseral degree 12 and zonal degree 20.' },
  'ap-d31-z20': { degrees: [31, 20], text: 'AP\'s settings at tesseral degree 31 and zonal degree 20 (the headline degrees, keyed as a rung).' },
};
