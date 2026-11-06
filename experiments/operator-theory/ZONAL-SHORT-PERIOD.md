# AP zonal short-period terms above J5: design and harness prototype (report only)

Record modules-sdn-ap-zonal-short-period-design-20261106 (SDN-AP 2026-11-06). Registered and committed before any row is flown or
read. Report only: nothing in propagator/sdn-ap changes here; the prototype lives in this harness as a measurement instrument (the
experiments repository is the one place the no-JS-physics law allows it: it produces no state, it corrects the module's output states by
an analytic displacement and is read against an independent reference); a module change, if these numbers warrant one, is its own
registered version.

## Ground
The secular/zonal shares record (SECULAR-ZONAL-SHARES.md; results/ap-truth/secular-zonal-shares) found that raising the zonal cap as rates
moves nothing beyond the spread, while AP's own m = 0 short-period share persists at 20x20 in every low regime (forward day, e 0.001:
Starlette 3.55 m [2.85, 4.25], Ajisai 3.36 [3.02, 3.70], LARES 4.19 [3.39, 4.98], Jason-3 4.04 [3.50, 4.58], Sentinel-3 3.13 [2.29,
3.96], CryoSat-2 5.95 [4.07, 7.84]; the primary arm adds CryoSat-2's 10.26 m J21-J31 tail). The source fact behind it (modules
93cb5a058, propagator/sdn-ap/src/tesseral.inc 528 to 536 and 559 to 601, src/xp_theory.inc 14 and 41): the module's explicit zonal
short-periodics are SGP4XP's (SPEC 8, J2; SPEC 2 carries the J2-J5 rates), and its zonal tail for 6 <= l <= MAXIMUM_DEGREE is first
order in the rates only (the secular terms of even l, the long-period terms of odd l); no zonal short-period term of any degree above 5
exists in the module. The half-day record (HALF-DAY-RESONANCE.md) rules the small-e half-day miss out of this record's scope (lunisolar
is the leading suspect there); this record is the LOW-orbit m = 0 short-period gap above J5, 3 to 6 m.

Frame, reference, arcs, sampling, bounds, estimator and intervals are the all-regimes record's (TESSERAL-ALL-REGIMES.md, Amendments 1 to
7) through its exports (tesseral-all-regimes.mjs: attribute, threeWay, bounds, rtnOf, gridSeconds, arcDays, ARMS, REGIMES); Amendment 7
fixes the estimator: no method changes here, and a cell on which it fails reads "withheld (estimator)". The landed secondary (20x20 both
sides) and primary (FFM 31x31 against caps 31 / 20) arms are the two arms; the landed rows carry shares and not the series, so every
cell is flown again here (deterministic; the re-flight's shares are reported beside the landed 0.6.3 shares and their difference is a
reproduction figure, which also carries the 0.6.3 to 0.6.4 change: 0.6.4 changes the tesseral class rule only, SPEC 16.11).

Pins. Modules root /Users/tj/software/private/coordinator-d9/space-data-network-modules-covm at 93cb5a0584fa728864e4426cc9ceb368936589f9
(read only: the harness propagator/sdn-ap/test/lib/heo-model-truth.mjs and ocm.mjs, the node_modules, propagator/ffm 2.2.1 dist SHA-256
a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4, the coefficient file propagator/ffm/lib/egm96_data.h SHA-256
4d5c80b3d673696affffe9d2d17df94ecca730b1f61e0483b1bb9d6606e6a6f4: the same EGM96 the module's build pins, GRAVITY_PIN). The module flown
is propagator/sdn-ap 0.6.4 as the site pins it: the signed dist, whole-file SHA-256 e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d,
SDK canonical module hash (sds.* custom sections stripped, the signed identity) fd1ef4682edc68836d27fdb1f606a45b22bb3605354c55312287f87771a804b5,
copied read-only from the -pin clone (modules cfd750eb8) to this lane's scratch; the runner checks both hashes before any row (the
canonical one with the SDK's own stripWasmCustomSections) and refuses otherwise. The -pin clone's heo-model-truth.mjs is byte-equal to the
pinned root's (measured before this registration). Every state here comes from those two dists through that harness; this record's
runner moves bytes and does arithmetic (Legendre polynomials, a discrete Fourier transform of a trigonometric polynomial, the Hill
response per harmonic, least squares through the exported attribute, RMS). Its cache is this lane's scratch
(/Users/tj/software/terrain-work/body-look/zonal/heo-cache), never another lane's. No file is installed into any modules checkout.

## The terms (first-order zonal short-period perturbations, J6 to J_L, small-e form, analytic in the argument of latitude)
Source: Kaula, Theory of Satellite Geodesy (1966), eq. 3.70 (the disturbing function expanded in the inclination functions F_lmp and
the eccentricity functions G_lpq; at m = 0, q = 0 the argument is psi = (l - 2p) u with u = omega + M, and G_lp0(e) = 1 + O(e^2)), with
the near-circular position form taken from the linearized relative-motion (Hill 1878; Clohessy and Wiltshire 1960) equations about the
circular reference orbit, as Rosborough and Tapley (Celestial Mechanics 40, 1987, 409-421) do for the radial, transverse and normal
perturbations of near-circular orbits. The coefficients: unnormalized J_l = -sqrt(2 l + 1) C_l0 from the pinned egm96_data.h (read after
checking its SHA-256), l = 6 to L; R = 6378.135 km, mu = 398600.4418 km^3/s^2 (the harness's constants).

1. The degree-l zonal disturbing potential on the circular orbit of radius a, inclination i, at argument of latitude u:
   R_l = -(mu J_l R^l / a^(l+1)) P_l(s), s = sin i sin u. Its force per unit mass at the orbit, in radial (R), transverse (T) and
   normal (N) components (xi the cross-track angle; ds/dxi = cos i):
   f_R = dR_l/dr = (l + 1) (mu J_l R^l / a^(l+2)) P_l(s)
   f_T = (1/a) dR_l/du = -(mu J_l R^l / a^(l+2)) P_l'(s) sin i cos u
   f_N = (1/a) dR_l/dxi = -(mu J_l R^l / a^(l+2)) P_l'(s) cos i.
   Each is a trigonometric polynomial of degree l in u; its harmonics f_X = sum over j = 0..l of (a_Xj cos j u + b_Xj sin j u) are
   Kaula's F_l0p(i) at j = l - 2p and are computed exactly by the discrete Fourier transform on 128 points (exact for a polynomial of
   degree at most 63). By parity each (X, j) has one nonzero coefficient: f_R cos (j even) or sin (j odd); f_T sin (j even) or cos (j odd);
   f_N sin (j odd) or cos (j even). The harmonics are summed over l = 6..L before the response.
2. The first-order displacement (x radial, y along-track, z cross-track; u = u0 + n t):
   x'' - 2 n y' - 3 n^2 x = f_R;  y'' + 2 n x' = f_T;  z'' + n^2 z = f_N.
   The forced (zero-mean) solution of the harmonic j >= 2, with f_X = Re[F_X e^(i j u)], F_X = a_Xj - i b_Xj:
   X = (F_R - 2 i F_T / j) / (n^2 (1 - j^2));  Y = 2 i X / j - F_T / (j^2 n^2);  Z = F_N / (n^2 (1 - j^2));  x = Re[X e^(i j u)], y, z likewise.
   These are the m = 0, q = 0 short-period members (0, j), j >= 2, of the all-regimes attribution.
3. The members not applied, stated: j = 1 (once per revolution) is resonant in the circular form (denominator 1 - j^2 = 0): it is the
   eccentricity-vector and orbit-plane member whose physical response carries the J2 apsidal and nodal rates in its denominator (the
   odd-l long-period theory), which the module carries as the odd-l rates of its tail (w = +-1); the prototype adds nothing at j = 1 and
   the (0, 1) family's amplitude is reported before and after (equal by construction). j = 0 (the constant members) are the secular
   members: the even-l constant radial force f_R0 is the fit-absorbed radial bias at fixed mean motion, predicted as
   R0_pred = +f_R0 / (3 n^2) (module minus reference: the reference's circular radius at the module's mean motion sits at -f_R0 / (3 n^2);
   the module carries the even-l secular rates and no radial term for l >= 6), and the odd-l constant normal force gives N0_pred =
   -f_N0 / n^2 (module minus reference); both are compared with the trend constants R0 and N0 of the secular record's item 1 (measured
   here on the same flight), read beside, not deciding.
4. Truncation in e: G_lp0 = 1 and the circular force; the omitted terms are the q = +-1 sidebands of relative size O((l + 2) e / 2):
   below 0.017 at e 0.001 for l 31, 0.17 at e 0.01, 0.8 at e 0.05 and 1.6 at e 0.1. The e grid is therefore flown with the expectation
   written here that the correction loses its effect, or worsens the share, at e 0.05 and 0.1 for the high degrees; those cells are the
   measured failure mode of the truncation and feed the e >= 0.05 questions of a module record, not this record's verdict.
5. Evaluation: u is the true argument of latitude of the module's output state (the position angle from the ascending node in the
   module's own orbit plane), i the module's inclination at the epoch, a and n from the fitted mean motion (a = (mu / n^2)^(1/3)); the
   difference from the true mean semi-major axis is O(J2), (l + 2) x 1.3e-3 at most 4 per cent of the l 31 term, second order here.

## The prototype (harness side; the module unchanged)
The displacement (x, y, z) of item 2, summed over l = 6..L and j = 2..L, is added to the module's output position in RTN at every
epoch: the corrected RTN error is the module's RTN error against the reference plus (x, y, z) (RTN at the reference state, the
all-regimes rtnOf; the module's own RTN axes differ from the reference's by the error angle, below 1e-6 rad, second order). L is the
arm's reference zonal degree: 20 for the secondary arm (FFM 20x20 against caps 20 / 20) and 31 for the primary arm (FFM 31x31 against
caps 31 / 20: the module carries no zonal short-period above 5 at any cap, so J6 to J31 are all missing and the correction carries the
tail's short-period content too). No double counting: the correction sums degrees 6 and above only; first-order theory is linear in the
coefficients, so the module's own J2 short-periodics and J2-J5 rates (the degrees below 6) are untouched, and the module's J6+ rates are
the j = 0 and j = 1 members the correction leaves out (item 3). The correction is applied to positions only (the shares are position
statistics).

Reference-side validation V1 (per e 0.001 cell, written before any row; the rows confirm or refute the derivation independently of the
module): D = Ref[20, 0] - Ref[5, 0], the FFM reference in vacuum with EGM96 zonals to degree 20 against the same integrator with zonals
to degree 5 (both with the DE440 Sun and Moon, from the same initial state, over the forward day, in RTN at Ref[20, 0]). Its content is
the exact J6-J20 zonal effect; attribute() gives its m = 0 share and (0, j) families; the prototype at L = 20 (u, i from Ref[20, 0]'s
own states, a and n from the cell's fitted mean motion) is subtracted and the attribution repeated. Prediction: the (0, j) families with
j >= 2 fall by a factor of 5 or more (the residual is second order: O(J2 x J_l) and the O(e) sidebands) and the m = 0 share of D minus
the prototype is below the module's own m = 0 share. A V1 cell that fails this prediction marks the prototype "not validated" in that
regime and the module reading there is reported but not counted toward the verdict.

## The cells
The six low regimes of the secular/zonal record at e 0.001 (Starlette 13.82 rev/day 49.8 deg, Ajisai 12.44 / 50.0, LARES 12.55 / 69.5,
Jason-3 12.81 / 66.0, Sentinel-3 14.27 / 98.6, CryoSat-2 14.52 / 92.0; RAAN 0, argument of perigee 0, mean anomaly 0, 3-day arc), both
arms (secondary and primary), and the secondary arm on the e grid where it exists (the secular record's grid: e 0.01, 0.05 and 0.1,
perigee floor 200 km: Starlette, Ajisai, LARES and Jason-3 at all three, Sentinel-3 and CryoSat-2 at 0.01 and 0.05). Order of flight:
(1) e 0.001 secondary with V1, every regime; (2) e 0.001 primary; (3) the e grid 0.01, 0.05, 0.1. A cell not reached is "unmeasured",
never filled. Hold-outs are not touched: no Swarm, GRACE-FO, Galileo, Starlink or operator data enters this record (the reference is
synthetic).

## The measure
Per cell and leg (forward day: 64 samples a revolution, blocks of one revolution; in-arc: the arc's 30-minute samples, blocks of one
day): the m = 0 (zonal) share of attribute() on the raw RTN error (before) and on the corrected one (after): RMS, maximum, roughness,
each with the Amendment 6 delete-one-block jackknife interval (point +- 2 SE, lower bound clipped at 0); the (0, j) families' amplitudes
before and after; the tesseral and secular shares before and after (the correction must leave them within their intervals: a move
beyond 2 (SE_before + SE_after) in either is reported as leakage). The arm difference of the shares is D_s = Z_before - Z_after with the
interval D_s +- 2 sqrt(SE_before^2 + SE_after^2) (the two series share every flight; the interval treats them as independent, which is
conservative). The landed e 0.001 shares (0.6.3) are shown beside the re-flight's.

Bounds. The all-regimes orbit-scaled bounds b_rms = max(1 m, 0.02 A), b_max = max(5 m, 0.10 A) are met by every low cell's m = 0 share
before the prototype (landed secondary rows, e 0.001: A 334 to 922 m, b_rms 6.7 to 18.4 m against shares 3.1 to 6.0 m; b_max 33 to 92 m
against 5.2 to 11.4 m), so the A-scaled reading cannot separate and is reported only. The reading that decides uses the bounds' floors
(the ripple registration's absolute bounds, what the orbit-scaled bounds are for a regime with no tesseral field): RMS 1 m and maximum
5 m, three-way by the exported threeWay on the forward leg's m = 0 share after the prototype (pass: upper bound within both; fail: lower
bound over either; else undecided); roughness is reported and not read (the share's roughness floor 0.1 m is below the sampling's own
label resolution in low orbit, Amendment 2).

## Reading rule per cell (written before the rows)
- "reduced": D_s's lower bound is above 0 on the forward leg's RMS.
- "inside": threeWay(after, floors, [rms, max]) reads pass on the forward leg.
- "not reduced": D_s's interval includes 0 or is negative.
- "withheld (estimator)": either attribution is not conditioned.
A reduced cell that is not inside names its residual: the largest remaining m = 0 family after the prototype with its amplitude, and
whether it is the j = 1 member (outside this record's terms by item 3) or a j >= 2 member (a first-order term the prototype misstates, or
second order).

## The cost (measured in the harness; an upper bound for a module implementation)
- Terms: Kaula (l, p) terms summed, j >= 2: sum over l = 6..L of (floor(l / 2) + 1) minus the j < 2 members: counted and stated for L 20
  and 31; stored per object after the sum over l: one float per (component, j), 3 (L - 1) floats: 57 floats, 228 bytes at L 20; 90
  floats, 360 bytes at L 31 (float32), against the module's own 272-byte narrow zonal-tail table (SECULAR-ZONAL-SHARES.md cost item).
- Time per object: the table build (the Legendre sums, three 128-point transforms, the response) at the fitted i, a, n, median of 50
  builds; time per epoch: the application (one sincos per epoch and the recurrence over j), median over the forward day's samples; time
  per flight of 65 epochs = build + 65 x per epoch; all in ms, in this harness's language on this machine, stated as upper bounds for a
  compiled implementation. Budget (THEMIS-RIPPLE-FIX.md Amendment 16): cold median 100 ms per object, warm 40 ms per record per worker,
  512 MB per worker; "within" when build + 65 epochs is below 10 ms (a tenth of the cold target, so the term adds nothing visible to the
  budget) and the bytes are below the module's own tail table; "over" otherwise.

## The three-way verdict (written before the rows)
On the six e 0.001 secondary cells whose V1 validated (the others reported, not counted):
- "a module record is warranted": every counted cell reads reduced, every counted cell reads inside, and the cost is within.
- "the finding stands, residual named": at least half of the counted cells read reduced but not every one reads inside (or the cost is
  over): the module's m = 0 gap above J5 is partly first-order zonal short-period; the named residual per cell is the finding.
- "the gap is not first-order zonal short-period": fewer than half of the counted cells read reduced.
The primary arm and the e grid are reported with the same per-cell readings and do not decide. If a module record is warranted, its
title, terms and the e >= 0.05 questions are stated in the table's summary for the coordinator to file.

## Pass chances on the cells' noise (from the landed secondary rows, forward RMS SE = (hi - lo) / 4)
SE: Starlette 0.35 m, Ajisai 0.17, LARES 0.40, Jason-3 0.27, Sentinel-3 0.42, CryoSat-2 0.94. "reduced" resolves a true reduction above
2 sqrt(2) SE: 0.99, 0.48, 1.13, 0.76, 1.19 and 2.66 m; the j >= 2 families the prototype addresses are 4.9 / 1.3 / 0.5 m (Starlette
(0,2) / (0,3) / (0,4)), 4.6 / 1.1 (Ajisai), 4.6 / 1.7 (LARES), 5.2 / 1.6 (Jason-3), 3.6 / 2.5 (Sentinel-3), 2.8 / 1.4 (CryoSat-2, whose
(0,1) member is 7.8 m), so a correction that removes half of them or more reads reduced with high probability in every regime, and a
correction that removes nothing has a nominal 2.3 per cent chance of a false "reduced" per cell (one-sided, 2 SE). "inside" at the 1 m
RMS floor needs the after share's point below 1 - 2 SE: 0.30, 0.66, 0.20, 0.46, 0.16 m, and cannot read in CryoSat-2 at its spread (SE
0.94: 1 - 2 SE < 0): CryoSat-2 is read on "reduced" and its residual, and "inside" is reported there as undecided at best, which the
verdict's first clause then cannot meet; it is stated as the reason when that is what blocks it. The after share's SE is not known
before the rows; it is measured and the realized thresholds are stated in the table.

## Amendment 1 (2026-11-06 14:08Z, this lane; committed before any row of the table)
The first flight (Starlette secondary e 0.001 at 14:02:55Z, after the registration; its row is kept apart in
results/ap-truth/zonal-short-period/first-pass/rows-0.jsonl and enters no table) showed the registered V1 unreadable, the same failure
the half-day record's arm Z met (HALF-DAY-RESONANCE.md Amendment 1): D = Ref[20, 0] - Ref[5, 0] from one osculating state diverges
(forward-day RMS 987 m, secular share 906 m, unexplained 389 m, every (m, j) group 14 to 26 m from the leak), so nothing at the
prototype's size (its correction RMS 0.71 m in that cell) is readable in D. The module items of that flight read as registered (m = 0
forward 3.55 [2.85, 4.25] -> 3.99 [3.21, 4.77] m, the landed share reproduced to 0.00 m) and are stated here as the disclosure; the
cell is flown again under this amendment. No estimator change; V1 changes construction:
1. V1 is read in the fit frame, on two more fitted arms per e 0.001 cell, both drift-free by the fit: arm Z5 (reference FFM EGM96
   degree 5 order 0 with the Sun and Moon; the module at caps MAXIMUM_TESSERAL_DEGREE 0, MAXIMUM_DEGREE 5: both sides J2 to J5 and
   nothing above) and arm Z20 (reference degree 20 order 0; caps 0 / 20). E5 and E20 are the forward RTN errors of the two fitted
   flights at the same epochs (same n, same grid). S = E20 - E5 carries the J6-J20 zonal short-period content the module lacks (the two
   fits' mean elements differ at second order, so the J2-J5 parts cancel to that order). The prototype at L = 20, at the Z20 flight's own
   angles, is added to S (+Delta) and, as a sign diagnostic, subtracted (-Delta); the j >= 2 zonal amplitude of S before and after each
   is reported. Validated: the +Delta ratio (before / after) is 3 or more and the -Delta ratio is below 1. E5's own m = 0 share (the
   module's zonal short-period error with nothing above J5 in play: the J2 second-order and J3-J5 first-order short-periodics the module
   does not carry, SPEC 8 being J2 only) is reported beside the cell's m = 0 share: if the two agree within their intervals the gap is
   below J6, whatever the prototype does above it.
2. The V1 arms' own fitted sets, forward shares and intervals are rows of their own (type `arm`), on the pinned dists, after this
   amendment.
3. --check adds: this amendment's commit precedes the first row of the table; the first-pass row stays in its folder.

## Outputs and check
`SDN_MODULES_ROOT=<the pinned -covm root> SDNAP_064_WASM=<this lane's copy of the signed 0.6.4 dist> SDN_AP_HEO_CACHE=<this lane's scratch>
node experiments/operator-theory/zonal-short-period.mjs --run [--shard k/n]` (at most 4 shards, cells by position) writes
results/ap-truth/zonal-short-period/rows-<shard>.jsonl: one row per cell with the fitted set, the before and after attributions of
both legs (shares with intervals, families), the V1 item where registered, the constant members' predictions against the trend
constants, the landed 0.6.3 shares, the SHA-256 of both dists (the 0.6.4 whole-file and canonical hashes), the modules commit and the
runner's SHA-256, createdUtc; one cost row per regime. `--table` writes table.json and README.md from the rows (per regime and cell the
share before and after with intervals, the reading, the residual, V1, the constants, the cost line, the verdict and, when warranted, the
module record's title, terms and e >= 0.05 questions). `--check` asserts that this registration's commit precedes the first row, that
every row is on the pinned dists and modules commit, that every registered cell carries a row (flown with both legs' before and after
shares with intervals or "no interval", or withheld with its error), that every regime carries its cost line, that the table reproduces
byte for byte, that the verdict is one of the three, and exits 0 only then.
