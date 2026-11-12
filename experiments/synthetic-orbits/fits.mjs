// Ways of making AP's record for the synthetic orbits (stack #504). How a record is made is free; the goal is what the theory does
// from it. run.mjs names one with --fit <name>; each is FITS[name] = { truthStartH, after, text, fit(ctx) -> { ocm, note } }, and
// its record is scored exactly as AP's 72 h fit is: D over 0 to 120 h after the cutoff against the truth. `after` marks a way that
// fits states after the cutoff; `text` is the sentence the report prints for the way.
//
// ctx (run.mjs): lines (every truth state, 300 s), D0 (the cutoff, ms), drag (the truth has drag), radiation (the truth has radiation
// pressure), wx (the weather known at the cutoff), terms (the case's true drag and radiation terms, m^2/kg), label and fitPcf (the
// slot's $PCF for the case: AP's forces as the truth's, but where the truth has no drag its settings name its own Jacchia 1970
// atmosphere and solve a drag term under the default prior),
// oemOf(fromMs, toMs) (the truth's states over that span as an $OEM, its usable span the same), fitOf(oem, pcf, spw) (the module's fit),
// and S, A (headline-loop lib/arms.mjs), APL (operator-theory lib/ap.mjs).
//
// The ways:
// - cutoff72: the 72 h arc before the cutoff, AP's $PCF (the default arc72 of run.mjs, without the SGP4-XP flight, so it can be scored on
//   the truth of any --truth-start-h);
// - arc24, arc120, arc168: the arc of that many hours before the cutoff, AP's $PCF;
// - held-terms: the 72 h arc before the cutoff with the drag and radiation terms held at the truth's own values (FIT.DRAG_PRIOR and
//   FIT.SRP_PRIOR at the true term, sigma 1e-6 of ln B and 1e-9 m^2/kg), the state solved; AP only (run.mjs refuses it with --xp
//   and with --rung xp);
// - forecast-span: the numerical propagator's forecast from the cutoff to 5 days (0 to 120 h), AP's $PCF: the state, BTERM and AGOM
//   solved with AP's default priors (where the truth has no drag the drag term is solved under the default prior, the settings
//   naming Jacchia 1970);
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
 *  1e-6, where the truth has drag; FIT.SRP_PRIOR GAUSSIAN_SIGNED at the true term, sigma 1e-9 m^2/kg, where it has radiation (ctx.radiation;
 *  where it has none the $PCF keeps its radiation term held at 0). FORCES is packed with its defaults written, as the table packs it. */
const held = (ctx) => {
  const P = ctx.S.PCF, x = P.PCF.getRootAsPCF(new ctx.S.flatbuffers.ByteBuffer(ctx.fitPcf)).unpack();
  const prior = (mean, sigma) => Object.assign(new P.PCFGaussianPriorT(), { MEAN: mean, SIGMA: sigma, HAS_SIGMA: true });
  const radiation = ctx.radiation === true;
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
  'held-terms': { truthStartH: 72, after: false, apOnly: true, text: 'AP is fitted to the truth\'s states over the 72 h before the cutoff with its drag and radiation terms held at the truth\'s own values (the state solved) and flown.', fit: span(-72, 0, held) },
  'forecast-span': { truthStartH: 0, after: true, text: after('from the cutoff to 120 h after it'), fit: span(0, 120) },
  'forecast-span-ladder': { truthStartH: 0, after: true, text: after('from the cutoff to 120 h after it, or, where the module refuses that span as one set, the longest of 96, 72, 48 and 24 h from the cutoff it fits (the row\'s fitNote names it)'), fit: ladder },
  'arc-plus-forecast': { truthStartH: 72, after: true, text: after('from 72 h before the cutoff to 120 h after it'), fit: span(-72, 120) },
  'forecast-7d': { truthStartH: 0, after: true, text: after('from the cutoff to 168 h after it'), fit: span(0, 168) },
};
/** The report's sentence for arc72, run.mjs's default (not a FITS way). */
export const ARC72_TEXT = 'AP and SGP4-XP (THEORY SGP4XP, the same module) are fitted to the truth\'s states over the 72 h before the cutoff and flown.';
/** The sentence for SGP4-XP flown beside AP on a way (run.mjs --xp): its own record, no space weather, fitted over the way's span. */
export const xpTextOf = (way) => `SGP4-XP (THEORY SGP4XP, the same module) is fitted to the same states with its own record and no space weather, and flown beside AP.${FITS[way]?.after ? ' On a made-up case this, too, is a fit to the flight it is scored on.' : ''}${way === 'forecast-span-ladder' ? ' Each theory walks its own ladder of spans, so the two may be fitted on different spans; each theory\'s row names its span (fitNote).' : ''}`;
/** Where SGP4-XP is flown: what each side's drag flies. */
export const XP_WEATHER_TEXT = 'The truth\'s drag flies NRLMSISE-00 on the weather known at the cutoff; SGP4-XP flies its own Jacchia 1970 atmosphere on its own flux model, with no space weather.';
export const NO_XP_TEXT = 'SGP4-XP is not flown on this way.';

/**
 * The perigee scan (run.mjs --perigee-scan, dense.mjs --perigees; stack #550): which cases are scanned, and how. The passages are
 * the radius minima of the record's flight at coarseS over the scored span, refined by a parabola to the second; each is flown at
 * stepS for halfS either side. Two measures, each a distance off the record's own curve (not a distance to the truth):
 * - the passage curve: the 8-point (degree-7) Lagrange curve through the passage's states at refS from it; every state within coreS
 *   of the passage is measured from it, so for a block near the passage the figure is the state's own displacement;
 * - the neighbors' curve: each state measured from the 8-point curve through its own neighbors 1 to `neighbors` steps either side,
 *   over the whole window but its first and last `neighbors` states, so a sharp-edged block anywhere in the window is caught (its
 *   figure is set by the block's edge, not its displacement).
 * A scan reads a failure when either measure's largest value is above failM. A scan whose flight is refused or comes back short could
 * not run: it is counted apart, with its reason, and never as a reading.
 * Where a block's edge (the neighbors' curve above failM) lies beyond coreS less `neighbors` steps from the passage it may reach the
 * states the passage curve is drawn through, and that passage's curve figure is marked as not a displacement (curveReliable false).
 * A block wholly outside the window (more than halfS from the passage) is not measured.
 * The window is clipped at the scored span's start (clipAtSpanStart: the cutoff, where a record made at the cutoff begins, so no state
 * before it is asked of the record): a passage within halfS of the cutoff is flown from the cutoff on, its neighbors' curve taken over
 * the states flown and its passage curve, whose reference states the clip removes, not taken (curveM null, clippedS the seconds cut).
 * `v` numbers the measures' definition: the digest of SCAN's settings keys the rows (run.mjs), so rows of another definition are
 * neither read as done nor reported as this one's.
 */
export const SCAN = { v: 3, coarseS: 20, halfS: 120, stepS: 1, refS: [-120, -110, -100, -90, 90, 100, 110, 120], coreS: 80, neighbors: 4, failM: 100, clipAtSpanStart: true,
  text: 'Perigee scan: every case at e 0.3 and above and every named case at e 0.1 and above has each perigee passage over the scored span flown at 1 s for 120 s either side, and two distances off the record\'s own curve (not distances to the truth) taken: each state within 80 s of the passage from the 8-point curve through the states 90, 100, 110 and 120 s either side of the passage (for a block near the passage, its own displacement), and each state from the 8-point curve through its own neighbors 1 to 4 s either side, over the whole window (a sharp-edged block anywhere in it; its figure is set by the block\'s edge, not its displacement). Where a block reaches the states the passage curve is drawn through, that figure is marked as not a displacement; a block wholly more than 120 s from the passage is not measured. No state before the cutoff is flown: a passage within 120 s after the cutoff is flown from the cutoff on, and only its neighbors\' curve is taken. The 300 s grid catches a displaced block of a few seconds only when an epoch falls inside it, so a case within the bar on the grid whose scan finds a state more than 100 m off by either measure is counted as failing ("over in the perigee scan"), with both figures; one whose scan could not run (its flight refused or short) is counted as failing too, apart and with its reason ("scan could not run"); a case with no perigee passage in the scored span is counted as the grid counts it.' };
/** The scan's case rule at its default (e 0.3; named cases from 0.1); run.mjs --scan-min-e widens it, and the rows' digest then names it. */
export const SCAN_MIN_E = 0.3;
export const scanned = (c, minE = SCAN_MIN_E) => c.e >= minE || (c.kind === 'edge' && c.e >= 0.1);
const lagrange = (ts, ps, at) => { const o = [0, 0, 0]; for (let i = 0; i < ts.length; i += 1) { let w = 1; for (let j = 0; j < ts.length; j += 1) if (j !== i) w *= (at - ts[j]) / (ts[i] - ts[j]); for (let q = 0; q < 3; q += 1) o[q] += w * ps[i][q]; } return o; };
/** One passage's two measures (SCAN): rs, its positions (km) at stepS from halfS before the passage to halfS after it, less its first
 *  `lead` states where the window is clipped at the span's start. Returns each measure's largest distance (m) and the offset (s) from
 *  the passage where it falls; a clipped passage has no passage curve (curveM null) and states the seconds cut (clippedS). */
export function measurePassage(rs, lead = 0) {
  const per = (2 * SCAN.halfS) / SCAN.stepS + 1, mid = SCAN.halfS / SCAN.stepS, nb = SCAN.neighbors;
  if (rs.length + lead !== per) throw new Error(`a passage holds ${rs.length} states and ${lead} clipped, not ${per}`);
  const st = (j) => rs[j - lead];
  const ix = SCAN.refS.map((s) => mid + s / SCAN.stepS), core = SCAN.coreS / SCAN.stepS, curveTaken = ix.every((x) => x >= lead);
  const nbOffsets = Array.from({ length: 2 * nb }, (_, q) => (q < nb ? q - nb : q - nb + 1));
  const off = (j, at, pts) => { const q = lagrange(at, pts, j), p = st(j); return 1000 * Math.hypot(...[0, 1, 2].map((x) => p[x] - q[x])); };
  let curve = { m: -1, j: null }, near = { m: -1, j: null };
  if (curveTaken) { const ps = ix.map(st); for (let j = mid - core; j <= mid + core; j += 1) { const d = off(j, ix, ps); if (d > curve.m) curve = { m: d, j }; } }
  for (let j = lead + nb; j + nb < per; j += 1) { const at = nbOffsets.map((o) => j + o), d = off(j, at, at.map(st)); if (d > near.m) near = { m: d, j }; }
  // a block edge (the neighbors' curve above failM) beyond the core may reach the states the passage curve is drawn through: the
  // passage curve's figure is then not a displacement (curveReliable false)
  const nearOffsetS = (near.j - mid) * SCAN.stepS;
  return { curveM: curveTaken ? +curve.m.toPrecision(4) : null, curveOffsetS: curveTaken ? (curve.j - mid) * SCAN.stepS : null, neighborsM: +near.m.toPrecision(4), neighborsOffsetS: nearOffsetS,
    curveReliable: curveTaken ? !(near.m > SCAN.failM && Math.abs(nearOffsetS) > SCAN.coreS - nb * SCAN.stepS) : null, ...(lead ? { clippedS: lead * SCAN.stepS } : {}) };
}

/**
 * AP's headline $PCF for a synthetic case (the slot without a rung): the solid tide, NRLMSISE-00 where the truth has drag, the radiation
 * term fitted where the truth has radiation and held at 0 where it has none, tesseral degree 31 and the zonal degree the rule of the real low
 * rows (ZONAL70_GROUPS) gives the case's orbit (headline-loop lib/arms.mjs syntheticZonalDegree: 70 from sdn-ap 0.6.42 where e is at or below
 * 0.05 and the perigee under 2,500 km, else 20). Off the class it is the previous code's $PCF (lib/arms.mjs PCF.AP_TIDES, AP_VACUUM_TIDES).
 * A version that is absent or does not parse is refused by name (syntheticZonalDegree throws): no $PCF is built without it.
 * A, APL: headline-loop lib/arms.mjs and operator-theory lib/ap.mjs.
 */
export const headlinePcf = ({ A, APL, c, version, drag, radiation }) => {
  const zonal = A.syntheticZonalDegree(c, version), held = { srpPrior: { mean: 0, sigma: 1e-12, form: 'GAUSSIAN_SIGNED' } };
  if (zonal === 70) return APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal, atmosphere: radiation ? drag : false }), SOLID_TIDES: 1 }, fit: radiation ? null : held });
  return radiation ? A.PCF[drag ? 'AP_TIDES' : 'AP_VACUUM_TIDES'] : APL.fitPcf({ forces: { ...APL.apForces({ tesseral: 31, zonal, atmosphere: false }), SOLID_TIDES: 1 }, fit: held });
};

/**
 * The rungs between SGP4-XP's record and AP's headline record (run.mjs --rung; stack #547): what the slot flies, each rung's rows keyed
 * apart. Each rung is described by its record's settings: the THEORY field the module writes, the tesseral and zonal degrees
 * (MAXIMUM_TESSERAL_DEGREE, MAXIMUM_DEGREE), the solid tide and the atmosphere. Each row records the THEORY field and the forces read
 * from the $PCF actually sent (run.mjs).
 */
const ATMOSPHERE_TEXT = 'NRLMSISE-00 on the issued weather where the truth has drag; where it has none, Jacchia 1970 on the theory\'s flux model with a drag term solved under the default prior';
export const RUNGS = {
  xp: { degrees: null, text: 'THEORY SGP4XP: SGP4-XP\'s own record, fitted the same way with no space weather.' },
  'ap-d0-z0': { degrees: [0, 0], text: `Tesseral degree 0, zonal degree 0, no solid tide (the module flies the solid tide only with gravity terms and refuses it at degrees 0 and 0), ${ATMOSPHERE_TEXT}. Where the truth has drag the record is THEORY AP. Where it has none, the record the module writes is THEORY SGP4XP, the same record as rung xp but for its stated zero degrees, so the step from this rung to ap-d0-z5 changes the THEORY field, the solid tide and the zonal degree together.` },
  'ap-d0-z5': { degrees: [0, 5], text: `THEORY AP: tesseral degree 0, zonal degree 5 (no zonal tail), the solid tide, ${ATMOSPHERE_TEXT}.` },
  'ap-d0-z20': { degrees: [0, 20], text: `THEORY AP: tesseral degree 0, zonal degree 20, the solid tide, ${ATMOSPHERE_TEXT}.` },
  'ap-d4-z20': { degrees: [4, 20], text: `THEORY AP: tesseral degree 4, zonal degree 20, the solid tide, ${ATMOSPHERE_TEXT}.` },
  'ap-d12-z20': { degrees: [12, 20], text: `THEORY AP: tesseral degree 12, zonal degree 20, the solid tide, ${ATMOSPHERE_TEXT}.` },
  'ap-d31-z20': { degrees: [31, 20], text: `THEORY AP: tesseral degree 31, zonal degree 20 (the headline degrees before the zonal rule of headlinePcf; the slot's degrees off the low table's class), the solid tide, ${ATMOSPHERE_TEXT}.` },
  'ap-d31-z70': { degrees: [31, 70], text: `THEORY AP: tesseral degree 31, zonal degree 70, the solid tide, ${ATMOSPHERE_TEXT}.` },
  'ap-d70-z70': { degrees: [70, 70], text: `THEORY AP: tesseral degree 70, zonal degree 70, the solid tide, ${ATMOSPHERE_TEXT}.` },
};
