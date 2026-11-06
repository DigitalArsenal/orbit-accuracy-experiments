# The secular and zonal shares: the J21-J31 zonal tail against AP's own zonal and secular theory (report only)

Record experiments-sdn-ap-secular-zonal-shares-20261106. Registered and committed before any row is read or flown. Report only:
nothing in propagator/sdn-ap changes here; the module decision this record informs (zonals beyond J20 in low orbit) is a separate
registered module record decided on these numbers.

## Ground
The all-regimes record (experiments-sdn-ap-tesseral-all-regimes-20261106; registration TESSERAL-ALL-REGIMES.md with Amendments 1 to 7;
rows results/ap-truth/tesseral-all-regimes/rows-*.jsonl and secondary-20x20/rows-*.jsonl; table.json) is the ground. Its frame, reference,
arcs, sampling, bounds, attribution (basis, conditioning, the delete-one-block jackknife, the three-way reading) and labels are reused
unchanged through the harness's exports (tesseral-all-regimes.mjs: attribute, verdictOf, bounds, rtnOf, gridSeconds, arcDays, cases,
ARMS, PIN); Amendment 7 fixes the estimator: an estimator failure here reads "withheld (estimator)" and no method changes. Pins: modules
93cb5a0584fa728864e4426cc9ceb368936589f9; propagator/sdn-ap 0.6.3 dist SHA-256 aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e;
propagator/ffm 2.2.1 dist SHA-256 a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4. Every state here comes from those two
dists through the all-regimes harness's own method (propagator/sdn-ap/test/lib/heo-model-truth.mjs, ocm.mjs); this record's runner moves
bytes and does arithmetic (least squares, RMS, medians, the two-body conversion of a state vector to osculating elements, which produces no
state). The smoke rows (smoke-no-third-body.jsonl) enter nothing here. The record's own cache is this lane's scratch, never another lane's.

## The arms
- Primary (landed): FFM EGM96 31x31 against the module at caps 31 / 20 (MAXIMUM_TESSERAL_DEGREE 31, MAXIMUM_DEGREE 20): the reference
  carries J21 to J31, the module does not.
- Secondary (landed at e 0.001; flown here on the e grid): FFM EGM96 20x20 against the module at caps 20 / 20: neither side carries them.
- Tail arm (flown here, e 0.001 only): FFM EGM96 31x31 against the module at caps 31 / 31, the same fixture with the set's MAXIMUM_DEGREE
  31. Read from the pinned source before any row: the module's zonal cap is the $PCF's MAXIMUM_DEGREE, accepted 0 to 70 (src/pcf.inc 343,
  src/xp_theory.inc 1491), so the shipped 20 is a configuration of the fit, not a module limit, and this arm is a $OCM cap, not a module
  change. The tail the module carries is first order in the rates only: the secular terms of even l (p = l / 2, q = 0) and the long-period
  terms of odd l (w = +-1), no zonal short-period term of any degree above 5 (src/tesseral.inc 528 to 536, zonal_count; 559 to 601,
  zonal_visit_terms). The registered prediction: this arm moves the secular share and not the m = 0 short-period share.

## The cells
Every regime with a landed primary and a landed secondary row at e 0.001: the 17 regimes (Starlette, Ajisai, LARES, Jason-3, Sentinel-3,
CryoSat-2, LAGEOS-1, LAGEOS-2, Etalon, GPS, Galileo, GLONASS, IGSO, QZSS, GEO, Molniya, GTO). The e grid where both arms exist is e 0.001
alone (the landed secondary arm flew phase 1 only); the secondary arm is flown here on the primary's e grid, e 0.01, 0.1, 0.05 and 0.2 in
that order (the all-regimes order of flight, perigee floor 200 km), as the box allows: a cell not reached is "unmeasured", never filled.
Both e 0.001 arms are flown again here in the same frame for the rate items below (the landed rows carry shares, not the series): the
re-flight's shares are reported beside the landed shares and their difference is a reproduction figure, not a new reading; the share
comparison is read on the landed rows. The order: (1) e 0.001, primary and secondary re-flight, the tail arm and the cost item, every
regime; (2) secondary e 0.01; (3) e 0.1; (4) e 0.05 and 0.2. At most 4 shards, cells assigned by position.

## The comparison per share (forward day and in-arc, on the landed rows)
For each cell, each share s in {zonal, secular} and each window (forward, in-arc): the primary share Z_P with its jackknife interval
[lo, hi] and standard error SE_P, the secondary Z_S likewise, and the arm difference D = Z_P - Z_S with interval D +- 2 sqrt(SE_P^2 +
SE_S^2) (the two arms are separate deterministic flights; the interval is the spread of the estimator, stated as such). A window whose
share carries no interval (the one-day orbits' forward day) reports the point difference and "no interval". A cell whose attribution is
not conditioned on either arm is "withheld" for that window.
The floor of a share is max(0.1 m, the cell's convergence figure) (0.1 m is the record's smallest absolute bound; the convergence figure
is the reference's own resolution).

## Reading rule, zonal (written before the rows)
- "tail present": D's lower bound is above 0 (the primary carries more m = 0 share than the secondary beyond the estimator's spread):
  the J21-J31 zonal tail. Its size is D.
- "vanishes at 20x20": Z_S's upper bound is at or below the floor: the whole zonal share is the tail.
- "own theory persists": Z_S's lower bound is above the floor: AP's own zonal theory, of size Z_S. By the source fact above a persisting
  m = 0 short-period share at 20x20 is the module's zonal short-period theory (SPEC 2's explicit J2-J5 short-periodics) together with the
  J6-J20 zonal short-period terms the module does not carry (its tail is rates only); the two are not separated here.
- "undecided": otherwise (Z_S's interval straddles the floor and D's includes 0).
"tail present" and "own theory persists" can both hold in a cell; both are then stated with their sizes.

## Secular attribution by term (written before the rows)
On every re-flown e 0.001 cell (primary, secondary, tail arm), on the forward day:
1. The trend line. Per RTN axis a least-squares line (constant, slope) on the raw error over the forward day: R0 (m), T1 (m/day), N1
   (m/day), each with a delete-one-revolution jackknife interval (K revolutions, SE sqrt((K - 1) / K sum (theta_i - mean)^2), +- 2 SE;
   no interval below 3 revolutions). The registered secular share (the joint trend of the attribution) is reported beside it.
2. Fit absorption (semi-major axis). A radial offset R0 of the fitted set is a mean-motion mismatch of -(3 / 2) (n / a) R0: the
   along-track slope it explains is T_a = -(3 / 2) n_rad R0 (n_rad the fitted mean motion in rad/day). The remainder
   T_r = T1 - T_a (m/day), with the interval propagated from both jackknives, is the secular rate mismatch the fit's semi-major axis does
   not explain: "fit absorption" when T_r's interval includes 0, else "secular rate mismatch of T_r m/day".
3. Rate differences by element against the reference. From the reference states and the module's flight at the forward day's epochs
   (both GCRF, both from the modules), the osculating elements by the two-body conversion (arithmetic); the series of differences
   module minus reference of the node Omega, the argument of latitude u = omega + M (well defined at e 0.001) and the mean longitude
   lambda = Omega + u; a least-squares slope of each over the forward day: dOmega (rad/day, reported as a sin i dOmega in m/day), du, dlambda
   (reported as a dlambda in m/day), each with the delete-one-revolution jackknife. a dlambda is the element reading of T1 and must agree
   with it to within the two intervals; a disagreement is reported, not resolved.
4. The terms, by signature. Scales (arithmetic on the fitted n, e, i; no state): n_rad; p = a (1 - e^2); k2 = (3 / 2) J2 (R / p)^2 with
   R 6378.135 km and EGM96 J2 1.0826267e-3; the first-order J2 rates Omega-dot = -k2 n cos i, omega-dot = k2 n (2 - 5 / 2 sin^2 i),
   M-dot - n = k2 n eta (1 - 3 / 2 sin^2 i); the J2-squared scale n k2^2; the J4 scale (15 / 32) n |J4| (R / p)^4 with EGM96 J4
   1.6196216e-6 (scales: the order-unity coefficients of the second-order theory are not carried); the J21-J31 tail's secular scale
   sum over even l 22 to 30 of n |J_l| (R / a)^l and its long-period scale sum over odd l 21 to 31 of n |J_l| (R / a)^l e, with
   J_l = -sqrt(2 l + 1) C_l0 from the pinned source's own coefficient header (propagator/sdn-ap/src/gravity_egm.h in modules 93cb5a058;
   if it is not readable the tail scales are "unmeasured" and the tail is read by the arm difference alone). Every scale is reported in
   m/day as a times the rate.
   The reading: (a) the tail's secular share is the arm difference of T_r (primary minus secondary; interval as in the share comparison):
   "tail secular present" when its interval excludes 0, and its size is compared to the tail's secular scale ("of the tail's order" within a
   factor of 3); (b) AP's own secular theory is the secondary arm's T_r when its interval excludes 0, named "of J2-squared order", "of J4
   order", "below both" or "above both" by the nearest scale within a factor of 3 (both named when both are within it); (c) the tail arm's
   T_r against the primary's: "the tail's rates close the gap" when the tail arm's T_r interval includes the secondary's T_r, "partly" when
   it moves toward it beyond both intervals, "not" otherwise.
The in-arc window is reported for the shares only (its 30-minute sampling does not resolve the per-revolution trend items in low orbit).

## The cost measure (written before the rows)
The decision it informs: whether AP should carry zonals beyond J20 in low orbit. Its cost here, per object:
- terms: zonal_count(31, narrow) - zonal_count(20, narrow) = 17 (even l 22 to 30: 1 each; odd l 21 to 31: 2 each) at e 0.3 and below;
  wide (above kWideE 0.3): sum of (l + 1) for l 21 to 31 = 297; read from src/tesseral.inc 533 to 536;
- bytes: 4 floats of 4 bytes per term (src/xp_theory.inc 1494): 272 bytes narrow, 4,752 bytes wide, held per object for the flight;
- time per flight: on every e 0.001 regime the primary cell's fitted set flown by the shipped dist to the 65 epochs of the forward day's
  first hour (the fit's end plus one minute, then every minute) with MAXIMUM_DEGREE 20 (as fitted) and the same bytes repacked with
  MAXIMUM_DEGREE 31, five fresh invokes each on the SDK's command surface (one instantiation plus one flight per invoke, the diagnosis
  record's Amendment 1.1 caveat), medians and their difference in ms; the difference is the tail's cost per flight at this surface, read
  against the catalog budget's cold target (100 ms per object, THEMIS-RIPPLE-FIX.md Amendment 16) as "within" or "over".

## Amendment 1 (2026-11-06 12:21Z, this lane; committed before any row, 657223cc)
The coefficient header named in item 4 (propagator/sdn-ap/src/gravity_egm.h) is generated at build (build.mjs GRAVITY_PIN) and is not in
the checkout; its source is the pinned file propagator/ffm/lib/egm96_data.h (modules 93cb5a058; SHA-256
4d5c80b3d673696affffe9d2d17df94ecca730b1f61e0483b1bb9d6606e6a6f4, the same pin build.mjs asserts), records `{ l, m, C, S }`, fully
normalized. The runner reads C_l0 for l 2 to 31 from that file after checking its SHA-256; J2 and J4 of item 4 are taken from it as well
(C20 -4.84165371736e-4, C40 5.39873863789e-7: J2 1.0826267e-3, J4 -1.6196216e-6, the values item 4 states). The set's zonal cap field is
the $OCM PERTURBATIONS.MAXIMUM_ZONAL_DEGREE (ocm.mjs seedOcm); the cost item repacks that field and reports both values as flown.

## Amendment 2 (2026-11-06 12:24Z, this lane; disclosure, written after the first eight rows of shard 0 and before the table, 45f5c646; the stated times of Amendments 1 and 2 were corrected to their commit times in the following commit)
Item 2's reading rule stands word for word. Its key, seen on the first rows: Sentinel-3 (primary) reads R0 6.98 m with T1 2.37 m/day, so
T_a is -943 m/day and T_r 943 m/day, "secular rate mismatch of 943 m/day". A semi-major-axis error of 7 m would drift at T_a; a 7 m
radial offset with no drift is a radial bias at fixed mean motion (the theory's mean-to-osculating radius, not its rate). So the table
carries beside item 2's label the derived reading "radial bias R0 at fixed mean motion" whenever |T1| < |T_a| / 3 (the along-track slope
is small against the drift the offset would imply), and item 4(b)'s term naming is read on T1 (the measured along-track slope) in that case,
not on T_r, with both figures shown. No row changes; no re-flight. The earliest row of the record (reflight:primary:Starlette) follows
the runner's commit 657223cc.

## Amendment 3 (2026-11-06, this lane; disclosure, written after the first table and before the landed one)
Item 4(c)'s "the tail's rates close the gap" reads true in all 11 regimes with an interval, because T_r's interval carries 1.5 n SE_R0
(hundreds of m/day in low orbit) and so always includes the secondary's T_r: the rule is uninformative as registered and is kept beside
the share-level fact, which decides: the tail arm's forward zonal and secular shares against the primary's, "moved" when the change
exceeds 2 (SE_tail + SE_primary) of the all-regimes jackknife ("no interval" where either arm carries none: the half-day and one-day
orbits' forward day). On the first table the tail arm moved neither share in any regime with an interval (CryoSat-2: zonal 16.21 -> 15.47 m, secular 38.78 -> 38.74 m, against the secondary's 5.95 / 11.51 m). The registered prediction (the tail
arm moves the secular share and not the m = 0 short-period share) is falsified on its first half: the module's first-order zonal rates for
J21 to J31 change the forward error by less than the estimator's spread, and the primary-secondary difference is the reference's J21-J31
content the module's tail does not represent (short-period and long-period effects, not the secular rates). The table's summary carries
both lists ("zonal share moved", "secular share moved"). No row changes; no re-flight.

## Parked
The GEO lunisolar question (the fitted rate against DE440 or the analytic lunisolar theory) needs an arc of a lunar month or more
(TESSERAL-ALL-REGIMES.md Amendment 4) and is not read here; the one-day orbits' trend items are reported as measured with no term reading
beyond item 2.

## Outputs and check
`SDN_MODULES_ROOT=<root> SDN_AP_HEO_CACHE=<this lane's scratch> node experiments/operator-theory/secular-zonal-shares.mjs --run [--shard k/n]`
(at most 4 shards) writes results/ap-truth/secular-zonal-shares/rows-<shard>.jsonl (one row per flight item and per cost item, each with the
SHA-256 of both dists and of the runner and createdUtc). `--table` writes table.json and README.md from the rows and the landed all-regimes
rows (the share comparison, the zonal reading, the secular attribution, the cost line, per regime). `--check` asserts that this
registration's commit precedes the first row, that every row is on the two pinned dists and the pinned modules commit, that every landed
e 0.001 pair carries its share comparison with intervals and its zonal reading, that every re-flown cell carries the trend line, the
absorption reading, the element rates and the term reading, that every regime carries its cost line, that the table reproduces byte for
byte, and exits 0 only then.
