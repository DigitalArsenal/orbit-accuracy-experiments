# AP J3-J5 first-order and J2 second-order short-period terms: size, design and harness prototype (report only)

Record modules-sdn-ap-j2-j5-short-period-design-20261106 (SDN-AP 2026-11-06, after the zonal design landed at experiments 8212b6da).
Registered and committed before any row is flown or read. Report only: nothing in propagator/sdn-ap changes here; no site file changes.
The prototype lives in this harness as a measurement instrument (the experiments repository is the one place the no-JS-physics law allows
it: it produces no state, it corrects the module's output states by an analytic displacement and is read against an independent
reference); a module change, if these numbers warrant one, is its own registered version. Separate from the half-day lunisolar record
(HALF-DAY-RESONANCE.md: a different regime and a different suspected term); nothing of it is read here.

## Ground
ZONAL-SHORT-PERIOD.md Amendment 2 (results/ap-truth/zonal-short-period/table.json, experiments ea67368c): the J6-J20 first-order zonal
short-period prototype removed its own reference content 24x to 112x (V1 validated in all six low regimes) and moved the module's m = 0
share nowhere beyond the spread; the V1 arm E5 (FFM EGM96 degree 5 order 0 against the module at caps 0 / 5, both sides J2 to J5 and
nothing above) carries the same forward m = 0 share as the full cell in every regime (E5 / cell, m: Starlette 4.10 / 3.55, Ajisai 3.57 /
3.36, LARES 3.76 / 4.19, Jason-3 3.89 / 4.04, Sentinel-3 2.73 / 3.13, CryoSat-2 5.46 / 5.95), with the (0,2) family largest (Starlette
5.71, Ajisai 4.94, LARES 4.45, Jason-3 4.99, Sentinel-3 2.99 m; CryoSat-2 (0,1) 7.07 and (0,3) 2.54 m). The module's explicit zonal
short-periodics are SPEC 8's J2 first-order terms (modules 93cb5a058, propagator/sdn-ap/src/xp_theory.inc 14 and 41; SPEC 2 carries the
J2-J5 rates). So the 3-6 m low-orbit m = 0 short-period gap is in the J2-J5 short-period theory: the J3, J4, J5 first-order short-period
terms and the J2 second-order short-period terms the module does not carry. The same record measured the constant members: a constant
cross-track offset N0 of -4.18 (Starlette), -3.93 (Ajisai), -7.41 (LARES), -7.54 (Jason-3), +4.98 (Sentinel-3), +0.85 m (CryoSat-2)
and a radial bias at fixed mean motion R0 of -0.66, 0.32, 1.96, 1.25, 7.24, 9.50 m, which the J6+ constant members did not explain.

Frame, reference, arcs, sampling, bounds, estimator and intervals are the all-regimes record's (TESSERAL-ALL-REGIMES.md, Amendments 1 to
7, through tesseral-all-regimes.mjs: attribute, threeWay, bounds, rtnOf, gridSeconds, arcDays, ARMS, REGIMES); Amendment 7 fixes the
estimator: no method changes here, and a cell on which it fails reads "withheld (estimator)". The Hill-response construction, the force
harmonics, the response table and the constant-member predictions are the zonal record's (zonal-short-period.mjs: forceHarmonics,
responseTable), applied to degrees 3 to 5 instead of 6 to L; nothing in that file changes.

Pins. Modules root /Users/tj/software/private/coordinator-d9/space-data-network-modules-covm at 93cb5a0584fa728864e4426cc9ceb368936589f9
(read only: the harness propagator/sdn-ap/test/lib/heo-model-truth.mjs and ocm.mjs, the node_modules, propagator/ffm 2.2.1 dist SHA-256
a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4, the coefficient file propagator/ffm/lib/egm96_data.h SHA-256
4d5c80b3d673696affffe9d2d17df94ecca730b1f61e0483b1bb9d6606e6a6f4). The module flown is propagator/sdn-ap 0.6.4 as the site pins it: the
signed dist, whole-file SHA-256 e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d, SDK canonical module hash
fd1ef4682edc68836d27fdb1f606a45b22bb3605354c55312287f87771a804b5, copied read-only from the -pin clone to this lane's scratch
(/Users/tj/software/terrain-work/body-look/j25/sdn-ap-0.6.4/module.wasm; both hashes checked before any row). Cache: this lane's scratch
(/Users/tj/software/terrain-work/body-look/j25/heo-cache), never another lane's. No file is installed into any modules checkout.

## 1. The size, first (written before any row; from the landed accuracy table the site cites)
Source: results/ap-truth/compare/cells.json at experiments c7a6cce9 (SHA-256 04546d7168d83767175ad014f3cec3d80cbad8671a1691d4b7369eed45a48ede),
the precise-orbit rows (`reference` truth) per satellite, the AP column (`propagator/sdn-ap@aa3ed22aa61a`, 0.6.3; 0.6.4 changes the
tesseral class rule only, SPEC 16.11), the 72-hour fit (the harness's 3-day arc), leads 24, 72 and 168 hours past the fit's end: the
median 3D forecast error in m, with the number of windows. The share is the landed forward m = 0 share of the secondary e 0.001 cell
(results/ap-truth/zonal-short-period/table.json, reproduced to 0.00 m from the 0.6.3 rows). Two readings per cell: the linear bound
share / median (the fraction the terms could move if their whole content added coherently to the error at the day: at best) and the
quadrature expectation share^2 / (2 median^2) (a periodic term uncorrelated with the rest of the error moves the total by that much).

| Regime (satellite) | Share (m) | Day 1 median (n) | Day 3 median (n) | Day 7 median (n) | Linear bound day 1 / 3 / 7 | Quadrature day 1 / 3 / 7 |
| --- | --: | --: | --: | --: | --- | --- |
| Starlette (STARLETTE) | 3.55 | 25.6 (12) | 49.4 (10) | 191.2 (12) | 13.9 % / 7.2 % / 1.9 % | 0.96 % / 0.26 % / 0.02 % |
| Ajisai (AJISAI) | 3.36 | 16.5 (12) | 47.5 (10) | 208.2 (11) | 20.4 % / 7.1 % / 1.6 % | 2.07 % / 0.25 % / 0.01 % |
| LARES (LARES) | 4.19 | 18.2 (12) | 28.1 (10) | 58.1 (11) | 23.0 % / 14.9 % / 7.2 % | 2.65 % / 1.11 % / 0.26 % |
| Jason-3 (JASON 3) | 4.04 | 29.6 (15) | 77.4 (11) | 522.2 (10) | 13.6 % / 5.2 % / 0.8 % | 0.93 % / 0.14 % / 0.00 % |
| Sentinel-3 (SENTINEL 3A; 3B beside: 85.8 / 920.7 / 4411) | 3.13 | 89.6 (15) | 713.9 (15) | 4443 (15) | 3.5 % / 0.4 % / 0.1 % | 0.06 % / 0.00 % / 0.00 % |
| CryoSat-2 (CRYOSAT 2) | 5.95 | 63.1 (15) | 404.5 (15) | 3184 (15) | 9.4 % / 1.5 % / 0.2 % | 0.44 % / 0.01 % / 0.00 % |

Registered reading of the size. Floor: 5 per cent of the day-3 median on the linear bound. If the linear bound at day 3 were below the
floor in every regime, the verdict "not worth the bytes and fit time" would be reachable without a module record. It is not: LARES
(14.9 %), Starlette (7.2 %), Ajisai (7.1 %) and Jason-3 (5.2 %) are above it at day 3 (and every regime but Sentinel-3 at day 1), so
the prototype decides. The reading also states, before the rows, that the quadrature expectation is below 1.2 per cent at day 3
everywhere: a term of this size cannot move a day-3 median visibly unless the rest of the error is small, which the end-to-end arm
(item 5) measures on the FFM reference where it is. On the real windows the day-3 and day-7 errors are drag and maneuvers (the FFM
losses study), not this term; this record claims nothing about them beyond the table above. The runner's --size recomputes this table
from cells.json and --check holds it to these figures.

## 2. The terms
2a. J3, J4, J5 first-order short-period, small-e form. Source and construction: ZONAL-SHORT-PERIOD.md items 1 and 2 word for word
(Kaula 1966 eq. 3.70 at m = 0, q = 0, G_lp0 = 1 + O(e^2); the force on the circular orbit f_R = (l + 1) K_l P_l(s), f_T = -K_l P_l'(s)
sin i cos u, f_N = -K_l P_l'(s) cos i with K_l = mu J_l R^l / a^(l+2), s = sin i sin u; the harmonics by the exact 128-point discrete
Fourier transform; the forced Hill-Clohessy-Wiltshire solution per harmonic j >= 2: X = (F_R - 2 i F_T / j) / (n^2 (1 - j^2)),
Y = 2 i X / j - F_T / (j^2 n^2), Z = F_N / (n^2 (1 - j^2))), with the degree range 3 <= l <= 5 (zonal-short-period.mjs forceHarmonics(J,
3, 5, a, i) and responseTable). Coefficients: J_l = -sqrt(2 l + 1) C_l0, l = 3, 4, 5, from the pinned egm96_data.h after its SHA-256 check
(C30 9.57254173792e-7, C40 5.39873863789e-7, C50 6.8532347563e-8, read from the pinned file before this registration; the runner
records the values it read and --check holds them). The
harmonics present by parity: J3 and J5 at j = 1, 3 (and 5), J4 at j = 0, 2, 4. Elements: the position in RTN (radial, transverse,
normal) at the module's own true argument of latitude u, inclination i at the epoch and the fitted a, n, as the zonal record's item 5.
Truncation in e: the circular force and G_lp0 = 1; the omitted q = +-1 sidebands are of relative size (l + 2) e / 2: below 0.004 at
e 0.001, 0.035 at e 0.01, 0.175 at e 0.05 and 0.35 at e 0.1 for l = 5; the e grid is flown with the expectation written here that the
correction's effect degrades at e 0.05 and 0.1.
2b. The members of 2a not applied as a displacement, and read separately (item 4): j = 1 (resonant in the circular form; the odd-degree
eccentricity-vector member, which the module carries as its J3-J5 long-period rates), j = 0: the odd-degree constant normal force gives
the constant cross-track offset N0_pred = -f_N0 / n^2 (module minus reference; f_N0 the j = 0 harmonic of f_N summed over l = 3, 5) and
the even-degree constant radial force gives the radial bias at fixed mean motion R0_pred = +f_R0 / (3 n^2) (l = 4), both read against the
measured trend constants. Written before the rows, the N0 prediction evaluated by hand from the formula for l = 3 alone: Starlette -5.4,
Ajisai -4.8, LARES -6.7, Jason-3 -7.3, Sentinel-3 +4.1, CryoSat-2 +1.0 m, against the measured -4.18 [-5.73, -2.62], -3.93 [-4.64,
-3.22], -7.41 [-8.10, -6.71], -7.54 [-7.93, -7.16], 4.98 [3.48, 6.47], 0.85 [-0.82, 2.53] m: the J3 constant normal member is the
stated candidate for N0, and the row's exact prediction (l = 3 and 5 from the pinned coefficients) decides per regime by the interval.
2c. J2 second-order short-period. The analytic term is Kozai's (Astronomical Journal 67, 1962, 446-461, the second-order short-period
terms of the J2 (A2) theory in the elements, eqs. of section 4 under "short-periodic perturbations of the second order"), on top of
Brouwer's first-order short-periodics (Astronomical Journal 64, 1959, 378-397, eqs. 3.1-3.6 as the module's SPEC 8 carries them). The
pinned coefficient is J2 = -sqrt(5) C20 = 1.0826267e-3 from the same file. Its position amplitude scale is J2^2 (R / a)^4 a: 5 to 6 m in
these orbits, the size of the (0,2) family, with the inclination dependence of the second-order coefficients. THIS RECORD DOES NOT
TRANSCRIBE KOZAI'S COEFFICIENTS (no source text is available to this lane, and a coefficient list typed from memory is not a derivation):
the prototype of 2c is the empirical upper bound of what the analytic term could remove, defined in item 3 (P2), identified on an
independent arm and labeled as such in every table. A module record for 2c needs the transcription from the source with its own
validation; this record sizes it.

## 3. The prototype (harness side; the module unchanged; no double counting)
P1 (analytic, J3-J5 first order): the displacement of item 2a summed over l = 3..5 and j = 2..5, added to the module's output position in
RTN at every epoch (the RTN of the reference state, rtnOf; the module's own axes differ by the error angle, second order). No double
counting: first-order theory is linear in the coefficients and the module's explicit short-periodics are J2's alone (SPEC 8), so the
module's J2 first-order content is untouched; the module's J3-J5 rates are the j = 0 and j = 1 members P1 leaves out (item 2b). P1N: the
constant normal member N0_pred of item 2b applied as a constant cross-track displacement (a j = 0 member in position, a j = 1 member of i
and Omega in the elements, which SPEC 8 does not carry); reported as its own step so the share table shows P1 alone and P1 + P1N.
P2 (empirical, the J2 second-order bound): on the arm Z2 of each e 0.001 cell (reference FFM EGM96 degree 2 order 0 with the DE440 Sun
and Moon; the module at caps MAXIMUM_TESSERAL_DEGREE 0, MAXIMUM_DEGREE 2: both sides J2 and nothing else), the forward-day RTN error E2
is fitted by least squares on [1, cos j u, sin j u], j = 1..4, at the module's own u (one fit per RTN axis); the j = 2..4 coefficients
form the table P2 (18 floats), applied as a displacement at the cell's own u. E2 holds the J2 second-order short-period error and whatever
first-order misstatement SPEC 8 carries at e 0.001, and nothing of J3-J5 or the tesserals, so P2 is an upper bound for the analytic term
2c and not a theory; its j = 0 and j = 1 coefficients are reported, not applied. P2 is identified on arm Z2 and applied to the cell's
flight (a different field, the same fitted orbit) and to the end-to-end windows (item 5; different RAAN and phase from the Z2 arm, so
out of sample for the table's phase, in sample for the regime's a and i). The order of application and reporting per cell: before; P1;
P1 + P1N; P1 + P1N + P2.
Validation V1 (reference side, per e 0.001 cell, the zonal record's Amendment 1 construction on different arms): arms Z5 and Z2 as above
(both drift-free by the fit); S = E5 - E2 carries the J3-J5 content the module lacks (the fits' mean elements differ at second order).
P1 + P1N at the Z5 flight's own angles is added to S (+Delta) and subtracted (-Delta); the j >= 2 zonal amplitude of S and its constant
normal component are reported before and after each. Validated: the +Delta ratio (before / after) of the j >= 2 zonal amplitude is 3 or
more and the -Delta ratio is below 1. A cell whose V1 fails marks P1 "not validated" there: its module reading is reported but not
counted. P2 has no reference-side validation by construction (it is identified on the reference); its out-of-sample reading is item 5.

## 4. The targets, each read separately (forward day; before and after each step; intervals as registered)
(a) The m = 0 share of attribute() (RMS, with the Amendment 6 delete-one-block jackknife, point +-2 SE, lower bound clipped at 0); the
arm difference D_s = Z_before - Z_after with interval D_s +- 2 sqrt(SE_b^2 + SE_a^2); the (0, j) families before and after; tesseral and
secular shares before and after (a move beyond 2 (SE_before + SE_after) is reported as leakage). (b) N0: the trend constant of the normal
axis (least-squares line over the forward day, delete-one-revolution jackknife, +-2 SE), measured before and after P1N; N0_pred inside
the before interval reads "explained by the J3/J5 constant member", else "not explained" (the record says so plainly). (c) R0: the
radial trend constant likewise; R0_pred (l = 4) inside its interval reads "explained", else "not explained"; the Z2 arm's own R0 is
reported beside it (an R0 that persists with J2 alone is J2 second order or the mean-element convention, and is named as such, not
explained by this record). The in-arc leg is reported for the share only.

## 5. The end-to-end arm against FFM truth (never a reference built from the module's own term lists)
Per regime, six windows: the registered elements at e 0.001 with RAAN and mean anomaly both at k x 60 degrees, k = 0..5 (window 0 is
the cell's own geometry), 3-day fit, the secondary arm's field and caps (FFM EGM96 20x20 with the DE440 Sun and Moon against caps 20 /
20), 7 forecast days, the module's flight and the FFM reference at the all-regimes grid (64 samples a revolution). The reference is the
FFM integrator (propagator/ffm 2.2.1 at the harness's settings), independent of the module's term lists; the windows match the accuracy
table's leads (24, 72, 168 h past the fit's end) and fit length (72 h), not its real objects: drag and solar pressure are absent on both
sides, so these errors are the module's theory error alone. Stated plainly: these are the harness's synthetic windows on the regimes'
orbits, not the precise-orbit windows of cells.json; the fraction against the real error is item 1's table. Measure: the 3D error at the
sample nearest to 24, 72 and 168 h, before and after P1 + P1N and after P1 + P1N + P2; per regime the median over the six windows with
the order-statistic interval [2nd, 5th] (coverage 78 per cent of the median), and the paired difference before - after per window: its
median, [min, max], and "moved" when all six have the same sign (two-sided sign test p = 0.031), "not moved" otherwise. The 7-day RMS
of the 3D error is reported beside. Each window's fitted set, the FFM reference's kernel hash and the module's flown states' count are in
the row.

## 6. The cells
The six low regimes at e 0.001 (Starlette 13.82 rev/day 49.8 deg, Ajisai 12.44 / 50.0, LARES 12.55 / 69.5, Jason-3 12.81 / 66.0,
Sentinel-3 14.27 / 98.6, CryoSat-2 14.52 / 92.0; RAAN 0, argument of perigee 0, mean anomaly 0, 3-day arc), the secondary arm (FFM
EGM96 20x20 against caps 20 / 20), each with arms Z2 and Z5 and V1; then the secondary arm on the e grid 0.01, 0.05, 0.1 (perigee floor
200 km: Sentinel-3 and CryoSat-2 are below it at 0.1 and read "below the perigee floor"); then the end-to-end windows of item 5. A cell
not reached is "unmeasured", never filled. Hold-outs are not touched: no Swarm, GRACE-FO, Galileo, Starlink or operator data enters this
record (the reference is synthetic).

## 7. The cost (measured in the harness; an upper bound for a module implementation)
- Terms: P1 sums 3 Kaula (l, p) terms at l = 3, 4, 5 with j >= 2 (l = 3: j 3; l = 4: j 2, 4; l = 5: j 3, 5) and stores 3 floats per
  harmonic j = 2..5: 12 floats, 48 bytes; P1N 1 float, 4 bytes; P2 18 floats, 72 bytes (the analytic 2c would store 3 x 3 floats for
  j = 2, 4 and the constant: 36 bytes); against the module's own 272-byte narrow zonal-tail table (SECULAR-ZONAL-SHARES.md cost item).
- Time per object: the table build (P1 + P1N: the Legendre sums over three degrees, three 128-point transforms, the response), median
  of 50 builds; per epoch: one sincos and the recurrence over j = 2..5 plus P2's three harmonics; a flight of 65 epochs = build + 65 x per
  epoch; ms in this harness's language on this machine. Budget (THEMIS-RIPPLE-FIX.md Amendment 16): cold median 100 ms per object, warm
  40 ms per record per worker; "within" when the flight of 65 epochs is below 10 ms and the bytes are below 272; "over" otherwise. The
  fit time: the terms sit at the output step and add nothing to the fit's iterations beyond the per-epoch cost; the warm refresh: the
  table is rebuilt when the mean i or a moves, at the build cost.

## 8. The reading rule, pass chances and the three-way verdict (written before the rows)
Per cell (forward leg, each step against before):
- "reduced": D_s's lower bound is above 0 on the RMS. "inside": threeWay(after, floors RMS 1 m and maximum 5 m, [rms, max]) reads pass.
  "not reduced": D_s's interval includes 0. "worsened": D_s's upper bound is below 0. "withheld (estimator)": either attribution is not
  conditioned. A reduced cell that is not inside names its largest remaining m = 0 family.
- N0 "explained" / "not explained" and R0 "explained" / "not explained" as item 4.
- End-to-end per regime and lead: "moved by <median difference> m" when all six paired differences share the sign, else "not moved".
Pass chances on the cells' noise (landed SE, forward RMS: Starlette 0.35, Ajisai 0.17, LARES 0.40, Jason-3 0.27, Sentinel-3 0.42,
CryoSat-2 0.94 m): "reduced" resolves a true reduction above 2 sqrt(2) SE: 0.99, 0.48, 1.13, 0.76, 1.19 and 2.66 m; a correction that
removes the (0,2) and (0,3) families (4-6 m) reads reduced with high probability in every regime but CryoSat-2 (whose share is the (0,1)
member, outside P1's terms); a correction that removes nothing has a nominal 2.3 per cent chance of a false "reduced" per cell. "inside"
at the 1 m floor needs the after share below 1 - 2 SE_after; SE_after is measured. N0 is resolved at +-0.4 to 1.6 m (the landed
intervals), so a 4-7 m prediction is decided cleanly.
The verdict, on the six e 0.001 secondary cells whose V1 validated (the others reported, not counted), read on the step P1 + P1N (the
analytic terms) first and on P1 + P1N + P2 second:
- "worth a module record, with the stated gain": every counted cell reads reduced on P1 + P1N, at least four of six read inside or the
  end-to-end day-1 error moved in at least four regimes, and the cost is within; the gain stated is the per-regime share before -> after
  and the end-to-end medians before -> after. P2's step adds to the stated gain only as "the J2 second-order bound", never as a measured
  module term.
- "not worth the bytes and fit time": fewer than half of the counted cells read reduced on P1 + P1N + P2 (the best case), or every
  reduced cell's end-to-end day-1 and day-3 errors read not moved.
- "undecided": otherwise; what blocks each clause is stated.
N0 and R0 are findings beside the verdict: if N0 reads explained in four regimes or more, the J3 constant normal member is the named
cause of the constant cross-track offset and belongs in the module record's terms whatever the verdict on the shares; if R0 reads not
explained everywhere, the record says so and names the Z2 arm's reading. If a module record is warranted, its title, terms, the measured
gain and the e >= 0.05 identity questions are stated in the table's summary for the coordinator to file.

## Amendment 1 (2026-11-06, this lane, on the SDN-AP session's review through the coordinator; committed before any row)
1. Fit absorption (the serious one). The prototype of item 3 adds the terms to output states after a fit that had none of them; a module
   carrying the terms fits with them, and a fitted mean set absorbs modeled-term errors (the 11-06 trap), so a "not reduced" from the
   post-fit arm is confounded, and the constant normal member especially can land in the fitted inclination and node. Added arms P1F and
   P1F + P1N (pre-fit): the displacement of items 2a and 2b, built at the fixture's mean motion and the reference arc's own inclination
   (a and n from the registered n; the difference from the fitted n is second order), is subtracted from the reference arc's states
   BEFORE the fit (position and velocity, RTN to GCRF at each arc state; the velocity carries the displacement's rate and the frame's
   rotation), the module fits that arc (the same fit call, configuration and weather frames the harness uses: public inputs only), the
   fitted set flies to the same epochs against the unchanged reference, and the displacement at the flight's own angles is added back:
   what a module with these terms does to first order. The share table reports before / post-fit (P1, P1 + P1N) / pre-fit (P1F, P1F +
   P1N) side by side, and P1F + P1N + P2 (P2 stays an output-step bound). If the post-fit and pre-fit readings differ, the pre-fit
   reading is the one a module record may cite and the difference is the measured absorption. The fitted inclination and node of the
   pre-fit set against the standard fit's are reported as a sin i dOmega and a di in m (from the two flights' first states, the fit's
   end), per cell: whether a module carrying the constant normal member changes the fitted plane. Applied to the six e 0.001 cells and
   to the end-to-end windows (item 5: before / P1 + P1N / P1F + P1N / P1F + P1N + P2). The verdict's clauses read the pre-fit step
   P1F + P1N where item 8 says P1 + P1N, and P1F + P1N + P2 where it says P1 + P1N + P2.
2. Real-window arm 5b, report only: on the accuracy table's already-read precise-orbit windows for LARES, Starlette, Ajisai and Jason-3
   (nothing barred: no Swarm, GRACE-FO, Galileo, Starlink or operator data), the same 72 h fit with and without the pre-fit correction,
   the same forward flight, the 3D error at 24, 72 and 168 h against the precise orbit, paired per window: median, interval, share of
   windows improved; with 10 to 15 windows the two-sided sign test resolves only a unanimous or near-unanimous sign (p = 0.002 at 10 of
   10, 0.021 at 10 of 11, 0.039 at 11 of 13, 0.035 at 13 of 15), so a split of 8 of 12 reads nothing. Order: LARES first (the largest
   fraction), then Starlette, Ajisai, Jason-3; a regime the box does not reach is reported "unmeasured", never filled. 5b decides nothing
   in item 8; it is the report line a module record would cite beside the synthetic end-to-end arm.
3. Multiplicity in item 8: the end-to-end reading is 6 regimes x 3 leads x 2 steps = 36 sign tests at p = 0.031 each, so about 1.1
   false "moved" are expected when nothing moves; a single "moved" is read with that and the table states the count expected by chance
   beside the count observed; with six windows 0.031 is the smallest p available, so the test resolves nothing finer than all six
   agreeing.
4. N0 has its own line in the verdict, not folded into the share: the J3 hand prediction of item 2b lands inside or next to the measured
   interval in all six regimes with the right sign, written before the rows; if the exact l = 3 and 5 prediction holds (item 4 (b)) it
   is the first explained term in this chain and costs 4 bytes; the line states per regime explained / not explained, the pre-fit arm's
   fitted-plane change, and the N0 that remains after P1N. P2 stays empirical and labeled an upper bound (Kozai 1962 is not barred; a
   later module record may fetch it; this one need not).
5. Wording of item 5: the harness seeds every flight at the argument of latitude equal to the argument of perigee (heo-model-truth.mjs
   state_of_elements at u = argp), so the window phase k x 60 degrees is set as RAAN and the initial argument of latitude (argp), not
   the mean anomaly; at e 0.001 the two are the same phase. Nothing else changes.

## Amendment 2 (2026-11-06, this lane; committed before any row of the table; the first-pass rows disclosed)
The first flight of the runner (Starlette e 0.001, 14:40:44Z, after Amendment 1; its rows are kept apart in
results/ap-truth/j2-j5-short-period/first-pass/attempt-1/rows-0.jsonl and enter no table) found two things:
1. Arm Z2 is not J2-only. With the module at caps MAXIMUM_TESSERAL_DEGREE 0, MAXIMUM_DEGREE 2 against the FFM degree-2 reference, the
   module's forward RTN error is 1,156 m RMS with a (0,1) family of 1,614 m: the module's J2-J5 zonal content (SPEC 2's J2-J5 rates
   and SGP4's J3 long-period eccentricity-vector terms) sits below the zonal cap and is not removed by MAXIMUM_DEGREE 2, while the
   reference carries no J3 (the J3 forced eccentricity, (J3 / 2 J2) (R / a) sin i, is kilometers). So E2 holds the module's J3-J5
   content against a reference without it, not the J2 second-order error, and nothing of item 3's P2 or V1 can be read on it. Arm Z2
   stays flown and reported as this finding (a $PCF MAXIMUM_DEGREE below 5 does not give a J2-only module); item 4 (c)'s J2-only R0
   reading is "not available in this harness" and arm Z5's R0 (J2-J5 both sides) is reported in its place.
2. The sign of the constant normal member in the runner's first attempt: N0_pred is the predicted module-minus-reference offset, so the
   truth's displacement the correction adds is -N0_pred; attempt 1 added +N0_pred (N0 after P1N -9.2 m against -4.2 before) and was
   corrected before any row of the table. Attempt 1 also wrote an empty forward leg (a runner defect, fixed); it read nothing of the
   shares.
Changes, before any row of the table (no estimator change; no reading-rule change):
- P2 is identified on arm Z5's forward day after P1 + P1N (the E5 residual at the module's own u: the J2 second-order short-period
  content and any misstatement of P1; j = 2..4 applied, j = 0 and 1 reported), not on arm Z2. It remains the labeled empirical upper
  bound of item 2c, identified on a field without tesserals and without J6+ and applied to the cell and the windows.
- V1 is read on E5 alone: P1 + P1N at the Z5 flight's own angles added (+Delta) and subtracted (-Delta); validated when the amplitude
  of the odd families (0,3) + (0,5), which only the J3 and J5 first-order terms produce at e 0.001 (the J2 second-order terms are even
  in u at e -> 0), falls by 3 or more under +Delta and does not fall under -Delta (ratio below 1); the even families (0,2) + (0,4)
  (J4 first order together with the J2 second-order terms) and E5's m = 0 share and constant normal component are reported before and
  after each sign, not read for the validation.
- The first-pass rows of attempt 1 (arms Z2, Z5 and the cell, with the defects above) and of attempt 2 (the corrected runner on the same
  cell, flown to confirm the fix before the table) stay in first-pass/ and enter no table; --check asserts this amendment's commit
  precedes the first row of the table.

## Amendment 3 (2026-11-06, this lane; written after the cells and the first flight of the windows, before the table; disclosure)
1. The end-to-end measure. Item 5's "3D error at the sample nearest to 24, 72 and 168 h" is one sample of a series whose short-period
   content is the very thing under test, and the first flight of the 36 windows (rows kept in first-pass/windows-attempt-1/, entering
   no table; the console lines were read, for instance LARES window 1: 24 h 3.12 -> 4.02 m, 168 h 7.24 -> 12.87 m, and LARES window 5:
   24 h 13.25 -> 5.89 m) shows it moving either way by the phase of the sample. The accuracy table's own figure is the RMS of the 3D
   error over the day's bin (all-regimes.mjs score: the states with t in ((k - 1) days, k days] past the fit's end). The windows are
   flown again with both: the day-bin RMS at days 1, 3 and 7 is the measure item 5's medians, paired differences, sign tests and item
   8's end-to-end clauses read; the single-sample figure stays in the rows and the table as registered, reported, not read. The rows of
   the first flight are kept and disclosed; nothing of the cells changes.
2. The best case. Item 8's "best case" step P1F + P1N + P2 presumed P2 removes content; the cells show P2 (the E5 residual table)
   adding share in every regime (Starlette 1.88 -> 3.09 m), so the best case per cell is the better of P1F + P1N and P1F + P1N + P2
   (the smaller after share), and "reduced on the best case" reads that step. P2's own column stays as measured: the empirical J2
   second-order bound is void in this construction and the record says so; the J2 second-order term needs the Kozai transcription.
3. The arm rows (Z2, Z5) are written by every shard that needs them (a memo per process), so a regime's arm row appears up to four
   times with identical content; the table reads one row per id.

## Amendment 4 (2026-11-06, this lane, on the SDN-AP rulings through the coordinator after the progress notice; committed before any real-window row and before the table)
1. Post-read amendments are labeled post-read. Amendment 3 was written after the synthetic cells and the first flight of the windows
   had been read (the console lines quoted there); it is allowed as a disclosed second reading only: the registered single-sample
   figure of item 5 stays the record's end-to-end measure by the letter (item 8's end-to-end clauses, the sign tests and the
   multiplicity count read it), and the RMS-over-day-bin reading sits beside it in every table, marked "chosen after the first
   reading". Amendment 2 was likewise written after the first-pass rows of attempt 1 had been read (arms Z2 and Z5 and the Starlette
   cell): "before any row of the table" means before the table's rows, not before anything was seen; the first-pass rows stay apart
   in first-pass/attempt-1, first-pass/attempt-2 and first-pass/windows-attempt-1 and are named in the table.
2. V1 stands as registered: the cells below the 3x ratio (Starlette 2.4x, Ajisai 2.6x, Jason-3 2.9x on the first rows) read "not
   validated" and are not counted; P1's (0,3) term is NOT tuned in this record to remove the overshoot of about 30 per cent seen
   there; the overshoot gets its own named line in the verdict (per regime: E5's (0,3) + (0,5) amplitude before, after +Delta and
   after -Delta) for a module record to explain. The counted reductions are stated by validated cells (on the first rows: LARES and
   Sentinel-3 reduced, CryoSat-2 not), never as "reduced in five" alone; the not-counted cells' readings are reported beside, labeled.
3. N0 is written as five decisive matches plus CryoSat-2, whose measured interval also contains zero so its match cannot discriminate.
   R0 is not explained by the J4 constant member and the record says so plainly; the polar radial bias of 7 to 9 m (Sentinel-3,
   CryoSat-2) stays open (arm Z5's R0 says whether it persists with J2 to J5 alone).
4. 5b's measure, registered here before any real-window row: on sdn-ap 0.6.3 (aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e
   at modules 93cb5a0584fa728864e4426cc9ceb368936589f9, the accuracy table's build, through lib/ap.mjs standalone at that build), the
   accuracy table's own measure: the RMS of the 3D error over the day bin ((k - 1, k] days past the fit's end, all-regimes.mjs score)
   at days 1, 3 and 7, paired per window; two arms, P1F alone and P1F + P1N (the displacement, built at the window's own a, n and i
   from the arc's first state, subtracted from the thinned 72 h arc before the fit and added back to the flight at its own angles), no
   P2; the same windows, truth, grid, coverage rule, weather and fit configuration as all-regimes.mjs (LS group laser files for LARES,
   Starlette and Ajisai, the DO group's Jason-3 file, cutoffs every 5 days 2025-10-10 to 2025-12-21, 72 h arc). Since P1 is not
   validated for Starlette, Ajisai or Jason-3 (item 2 above), their windows are flown and FLAGGED "P1 not validated in this regime";
   LARES is the counted regime. Per regime and lead: the medians before and after each arm, the paired difference's median and
   [min, max], the share of windows improved, the two-sided sign test's p and its power at that count (Amendment 1.2), and the expected
   size beside the result (item 1's linear bound and quadrature expectation for that regime and lead). 5b decides nothing in item 8;
   it is the report line a module record would cite. The $PCF zonal-cap finding of Amendment 2 is filed as its own record; nothing
   about caps changes here.

## Outputs and check
`SDN_MODULES_ROOT=<the pinned -covm root> SDNAP_064_WASM=<this lane's copy of the signed 0.6.4 dist> SDN_AP_HEO_CACHE=<this lane's scratch>
node experiments/operator-theory/j2-j5-short-period.mjs --run [--shard k/n]` (at most 4 shards, cells by position) writes
results/ap-truth/j2-j5-short-period/rows-<shard>.jsonl: one row per cell (the fitted set, the before and after attributions of each step
on both legs with intervals and families, the arms Z2 and Z5 as rows of their own, V1, the P2 table, the constants against their
predictions, the cost), one row per end-to-end window, each with the SHA-256 of both dists (the 0.6.4 whole-file and canonical hashes), the
modules commit and the runner's SHA-256, createdUtc. `--size` writes the item 1 table from cells.json. `--table` writes table.json and
README.md from the rows (per regime: the size fractions; the share, N0, R0 before and after each step with intervals and readings; V1;
the end-to-end medians before and after with intervals; the cost line; the verdict and, when warranted, the module record). `--check`
asserts that this registration's commit precedes the first row, that every row is on the pinned dists and modules commit, that every
registered cell and window carries a row (flown with its measures or withheld with its error, or below the perigee floor, or unmeasured
and listed), that the size table reproduces from cells.json and equals item 1's figures, that every regime carries its cost line, that
the table reproduces byte for byte, that the verdict is one of the three, and exits 0 only then.
