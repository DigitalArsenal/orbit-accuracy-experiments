# THEMIS ripple fix (registered 2026-11-06, before any row)

Record: modules-sdn-ap-tesseral-series-ripple-20261105. Module change: propagator/sdn-ap src/tesseral.inc (SPEC 16.11), sdn-ap 0.6.3 on
the 0.6.2 base (SDS 1.279.0). Read for this registration: THEMIS-ROUGHNESS.md, themis-roughness.mjs, results/ap-truth/themis-roughness
(experiments d124e695), SPEC 16.2 and 16.11, src/tesseral.inc. No row beyond the published roughness rows is read before this commit.

## Observation
The wide first-order tesseral set (0.4.15, above an epoch eccentricity of 0.3: every q to |q| <= 10, |j| <= 33, at output time) leaves
2.82 m of roughness on THEMIS (0.121 m on 0.4.11; 0.127 m with the tesserals off) and, in flight alone, moves THEMIS day 1 from 165.4 to
195.1 m, day 3 from 421.8 to 405.1 m, day 7 from 1,004.0 to 1,004.7 m. The day-1 shift (about 30 m) is ten times the ripple, so the
series also moves the mean track.

## (a) Correctness test of the expansion (SDN-AP condition 1)
Windows: THEMIS D cutoff 2013-02-12 and THEMIS E cutoff 2013-02-16 (72 h arcs, vacuum, read as themis-roughness.mjs reads its windows).
Neither is a scored window; only the AP (31, 20) fit's mean elements (a, e, i, omega, Omega, M at epoch) are read from them, no forecast
error. Both are kept out of every scored cell below.

Harness: one native translation unit that includes the module's src (the table sp_terms and the output-time sum sp_six exactly as the
wasm compiles them) and, independent of the module's inclination and Hansen functions, evaluates each (l, m) term of the same pinned
field (EGM-96 normalized Cbar, Sbar from src/gravity_egm.h; l = 2 to 12, m = 1 to l) directly as
mu/r (Re/r)^l Pbar_lm(sin phi) (Cbar cos m lambda + Sbar sin m lambda) on the Kepler ellipse of the fitted elements, Pbar by the
standard normalized recurrence, on a grid of 1,024 mean anomalies by 64 arguments of perigee at two node phases (beta = Omega - theta
of 0 and pi / (2 m)). Its two-dimensional discrete Fourier transform gives the coefficient of each harmonic psi = w omega + j M + m beta
(w = l - 2p, j = w + q), untruncated to |j| <= 511; finite differences of the same quadrature in e and i (h = 1e-6) give its e and i
derivatives.

Per term the table holds (each (l, m, w, j) of sp_terms with e0 > kWideE, |q| <= kWideQ):
- Potential: the table's A F G S (amplitude and phase, Cbar/Sbar combination, sign) against the quadrature's coefficient;
  F G' and F' G against the quadrature's e and i derivatives.
- Tolerance: relative 1e-4 of the term's amplitude, or 1e-6 of the largest amplitude of that (l, m), whichever is larger (the table
  stores f, df, g0, g1 in single precision). A term outside it in amplitude, a sign flip, a cos/sin exchange or a wrong j is a defect
  and is fixed as one before anything else changes.
Truncation and screen: for every (l, m, w, j) the table does not hold, the quadrature's coefficient through the table's own position
amplitude bound (put()'s mag); the count and the largest of those at or above the 0.5 m keep threshold, per (l, m), and their sum.
Short-period effect: the first-order displacement (Lagrange's equations integrated per harmonic over psi, the same six components
sp_six returns: n, e, i, e varpi, sin i Omega, lambda) of (1) the table through sp_six, (2) the quadrature restricted to the table's
terms, (3) the quadrature over every harmonic with |psi-dot| >= 0.2 n that no resonance class carries, each mapped to position by the
Kepler partials of the mean elements and sampled every 300 s over 7 days from the epoch. (1) against (2): the RMS and largest position
difference over the 7 days, tolerance 1 % of (2)'s RMS (a larger difference is a defect of sp_six). (3) against (1): the RMS position
difference and its roughness (median |second difference|, h = 300 s): what the table's truncation leaves on the track.
Result: pass or defect per term, reported to the coordinator before any module change.

## (b) Measurement set (every stored window with e > 0.3, listed before reading)
- THEMIS A, D, E: cutoffs 2013-02-11, 13, 15, 17 (12 windows; HX of lib/regimes.mjs; NASA NAIF THEMIS_<letter>_2013_039_055.bsp).
- Chandra (HX, held out of the roughness study, never flown there): cutoffs 2018-03-08, 15, 22, 29, 2018-04-05, 12, 19 (7 windows,
  72 h arcs; chandra_merged.bsp).
- TESS (HE): cutoffs 2026-07-27, 2026-08-03, 10, 17, 24, 31, 2026-09-07 (7 windows, 72 h arcs; mast-tess models). Scored and reported in
  the results; withheld from the site until the owner's word.
- Molniya, GTO, other HEO: the archive holds no truth window for them. The heo-gp rows are SGP4 sets (they fly only on SGP4, never
  seed AP); operator captures are hold-outs and are not read. None is flown.
All windows: 72 h fit, vacuum (no drag, no $SPW), FORCES (31, 20), flown at 300 s over (cutoff, cutoff + 7 d], as themis-roughness.mjs.

## (c) Metrics, per object (THEMIS, Chandra, TESS)
Arms, each fitted and flown on its own build: base = 0.6.2 (the wide terms as shipped); without = 0.6.2's source with the wide
first-order tesseral set off (above e 0.3 the q in {-1, 0, 1} set of e <= 0.3; the wide zonal set of 16.11 kept), a scratch build,
SHA-256 recorded; candidate = the 0.6.3 change. Per window: roughness as THEMIS-ROUGHNESS.md defines it (median |e(t+h) - 2 e(t) +
e(t-h)|, RIC error, h = 300 s, consecutive samples); 3D RMS error per lead day 1, 3 and 7. Per object and arm: the median roughness over
its windows; the day 1, 3 and 7 medians with 95 % bootstrap intervals (windows resampled with replacement, 10,000 draws, seed 20261106,
percentile interval).

## (d) Acceptance (Conditions (3), verbatim: "Pass: roughness under 0.2 m, day-3 and day-7 medians not worse on any e > 0.3 object, day
1 explained or restored.")
- Roughness: the candidate's median over the 12 THEMIS windows under 0.2 m; Chandra and TESS medians under 0.2 m.
- Day 3 and day 7: on each object the candidate's median at or below the base's upper bootstrap bound.
- Day 1: on THEMIS the candidate's median within the base's interval or below it, or the shift explained by (a) (a named defect or the
  truncation's own displacement on the track).
- No harm: where e <= 0.3 the change touches nothing. propagator/sdn-ap/test/themis-ripple.e2e.mjs asserts byte-identical propagate
  output of 0.6.3 against 0.6.2 (dist by git show at the 0.6.2 commit) on every stored example set with e <= 0.3 it carries and on
  seeded LEO, Etalon-like, GPS-like, e 0.25 and e 0.3 sets; every coverage or covariance row with e <= 0.3 flown on 0.6.3 equals
  0.6.2's output.

## (e) Candidate changes, in order of preference
1. A defect (a) finds: fixed as a defect.
2. Else the series: re-summed at output time (the truncation's ringing removed: the harmonic set extended to the quadrature's
   convergence, or each (l, m, w) family's tail summed in closed form) or the |q|, |j| set tightened to the terms whose displacement
   on the track is resolved, whichever (a) shows reaches the target with no median moved.
3. Smoothing of the output-time sum: last, and only if it moves no median.

## Scope
Published figures with e > 0.3 re-measured on 0.6.3 (the site moves from 0.6.2 to 0.6.3 in one push, by the site lane): the worked
examples best-highly-elliptical-themis-and-chandra, truth-highly-elliptical-themis-and-chandra-themis-a and
truth-highly-elliptical-themis-and-chandra-chandra, and the HX regime rows; best-highly-elliptical and truth-highly-elliptical-tess are
TESS (scored here, withheld from the site until the owner's word). The cost benchmark's re-measure runs on whichever build ships when
it runs.

## Outputs
results/ap-truth/themis-ripple-fix: the correctness test's per-term table, the arms' rows summarized per object (days 1, 3, 7 with
intervals; roughness), README.md. Rows: /opt/data/sdn-archive/operator-theory/themis-ripple-fix/.

## Amendment 1 (2026-11-06, after the correctness test's result and before any sizing of the extended set)
(a) found no defect: every held term passes; the ripple and a mean-track displacement of about 65 m RMS are the truncation |q| <= 10,
|j| <= 33 (results/ap-truth/themis-ripple-fix/correctness). Candidate 2 is taken: the harmonic set extended to the series' convergence.
Rule (fixed before any count is read; the term count is its consequence): above e 0.3, for each (l, m, p) with l <= 12 (the family's
16.2 cap), q is walked outward from 0 in each direction; each term is kept by 16.2's rules (the 0.5 m position test with G and dG/de
exact at e0, the class, slow-band and m-daily exclusions); the walk in a direction stops at the first term under 0.5 m that lies beyond
the largest term of that family in that direction (the tail of the Hansen series beyond its peak decreases). No |q| or |j| cap other
than the quadrature's own resolution, |j| <= 2047. The harness applies the same rule to the quadrature's coefficients and reports the
term count, the roughness of the displacement and its difference from every harmonic, before the module change.
Cost: wall per propagation step (7 days at 300 s) and per fit, median of 5, on THEMIS D 2013-02-12, THEMIS E 2013-02-16 and TESS cutoff
2026-07-27 (timing only; no error read), before (base) and after (candidate); and the e <= 0.3 path (seeded LEO, GPS-like and e 0.25
sets, propagate) unchanged in cost within the run-to-run spread. A higher cost above e 0.3 is reported as measured.

## Amendment 2 (2026-11-06, before the sizing's output is read; a sizing run had started and its output is unread)
Bounds on the sum, not the per-term screen alone. On the two correctness windows, the candidate set's first-order displacement (the
quadrature's coefficients on the set's terms, through the same Lagrange integration) against the full-field quadrature (every harmonic
of l 2 to 12, m 1 to l, |j| <= 2047, |psi-dot| >= 0.045 n, no class term, not m-daily): RMS <= 1 m, maximum <= 5 m and roughness of the
difference <= 0.1 m over 7 days at 300 s. The screen (keep threshold) and any j or q limit are sized against these bounds from the
quadrature only, never against truth. If Amendment 1's rule at 0.5 m misses a bound, the keep threshold is lowered in the steps 0.2,
0.1, 0.05 m (the rule otherwise unchanged) until both windows meet all three; the first step that meets them is the candidate. The
degree cap l <= 12 (kSpCap) is unchanged; the field above it is outside this record.
Baseline (git history of src/tesseral.inc and SPEC 16.11): 0.4.11 to 0.4.14 hold, at every eccentricity, q in {-1, 0, 1} with
|j| <= l + 1 (G exact at e0 above e 0.03, linear in e), the 0.5 m keep and its bound with |G| <= (l + 1) e0; 0.4.15 (d50689f1e) adds
the wide set above e 0.3 (|q| <= 10, |j| <= 33). 0.4.11's 0.07 to 0.12 m is the smoothness of a set holding only the lowest harmonics,
not a bound on the sum: its displacement against the full-field quadrature is reported on the two windows beside the candidate's.
Cost reference: 0.4.11's wall per propagation step and per fit is the reference point of the cost comparison (0.4.11, base, candidate).

## Amendment 3 (2026-11-06, the coordinator's decision (A); before any sizing of it is run)
Candidate: the closed-form family re-sum. Above e 0.3 the first-order tesseral short-periodics are not a series in harmonics of M.
For each (l, m, p) the sum over q of G_lpq e^{i(w+q)M} is (a/r)^(l+1) e^{iwf} (Hansen's definition), so each family's first-order
displacement (Lagrange's equations integrated over psi = w omega + j M + m beta, each harmonic divided by its psi-dot, lambda also by
psi-dot squared through n) is a periodic function of the anomaly, complete in j. Two implementations:
(A1) per (m, w) family (the l summed), the six-component displacement (n, e, i, e varpi, sin i Omega, lambda) sampled at init on a
uniform grid of N eccentric anomalies from the series complete to the quadrature's resolution, and trigonometrically interpolated in E
at output time, multiplied by e^{i(w omega + m beta)} at the current omega and beta; (A2) integration in the true anomaly, where
(a/r)^(l-1) e^{iwf} is a trigonometric polynomial of degree l - 1 + |w|, with the Earth-rotation phase expanded about the
anomaly's own frequency. A1 is sized first: the E grid absorbs the perigee pulse (the pulse is (1 - e) times narrower in M than in E),
it needs no new expansion, and its error is the interpolation error alone, measured directly against the quadrature.
Sizing (quadrature only, no truth): N in {64, 128, 256, 512} on the two correctness windows against the same full-field quadrature
(every harmonic of l 2 to 12, |j| <= 2047, |psi-dot| >= 0.045 n, no class term, not m-daily); bounds unchanged: RMS <= 1 m, maximum
<= 5 m, roughness of the difference <= 0.1 m; the smallest N meeting all three on both windows is the candidate's grid. Beside it:
the number of families, memory per object (families x 6 x N complex values), init time of the table and wall per output step in the
harness; in the module, after the change, wall per propagation step and per fit against 0.4.11 and the base on THEMIS D 2013-02-12,
THEMIS E 2013-02-16 and TESS cutoff 2026-07-27.
No change at e <= 0.3: the e <= 0.3 branch is untouched; themis-ripple.e2e.mjs asserts byte-identical propagate output and unchanged
cost on the seeded LEO, GPS-like and e 0.25 and 0.3 sets against the base.
Additions (SDN-AP session, before any A1 sizing output is read):
1. Resonance: each family's forcing is built from its individual harmonics, and a harmonic is left out of it by the rules of today's
   table: m-daily (w = j = 0), a term the class carries in the rates (section 6; THEMIS D and E are in the one-day class), and
   |psi-dot| < 0.045 n (the slow band). No divisor below 0.045 n enters a grid, so the periodic solution has no vanishing divisor. A class
   term is counted once, in the mean-element rates; a slow non-class term is carried nowhere, as in 0.4.11 to 0.6.2. The sizing lists,
   per window, the harmonics left out by each rule and checks that no class term appears in any family.
2. Element drift: the grid is built at init from the epoch mean elements and the epoch secular rates. It is rebuilt when the current
   mean elements leave |de| <= de*, |da / a| <= da*, |di| <= di* of the elements it was built from; de*, da*, di* are sized from the
   quadrature (the grid at e0 against the quadrature at e0 + de, and likewise a and i) as the largest steps that keep the RMS at 0.25 m,
   a quarter of the bound. The module reports the re-grids per 7-day flight on the measurement set.
3. Interpolant: Fourier in the eccentric anomaly (trigonometric interpolation on N uniform points in E). The bounds apply to the
   interpolated output at the 300 s epochs (the harness evaluates at each output epoch's E), not to the grid points.
4. Memory and cost: grid bytes in wasm linear memory (families x N x 6 complex doubles), init time and wall per step, before (the base's
   table) and after, on THEMIS D, THEMIS E and TESS; these enter the cost re-measure if 0.6.3 ships.

## Amendment 4 (2026-11-06, after A1's Fourier sizing, before the steps below are run)
A1 in Fourier at N = 128 meets the bounds at 162 us per step in the harness, about 30 times today's sp_six. A local interpolant on the same
uniform E grid is sized as an alternative: the four-point periodic Lagrange cubic, N in {128, 256, 512, 1024}, values stored per family
and component (memory families x 6 x N complex doubles). It replaces Fourier when it meets the same three bounds on both windows at a lower
wall per step; the smallest such N is taken; otherwise Fourier at N = 128 stands.
Re-grid thresholds (Addition 2): the grid built at the window's elements against the full-field quadrature at shifted elements, one
element at a time: de in {1e-4, 3e-4, 1e-3, 3e-3}, da / a in {1e-5, 1e-4, 1e-3}, di in {1e-4, 1e-3} rad; each threshold is the largest
step whose RMS stays at or under 0.25 m on both windows.

## Amendment 5 (2026-11-06, after the Amendment 4 cubic and drift rows, before the steps below)
Read so far: the cubic at N = 128 meets the bounds on both windows (it is taken: Amendment 4's rule); on the drift steps registered, only
da / a = 1e-5 stays at or under 0.25 m: de = 1e-4 and di = 1e-4 rad already exceed it. Added, before they run: (1) smaller steps
de in {1e-5, 3e-5}, di in {1e-5, 3e-5} rad, da / a = 3e-6; (2) a grid linear in the elements as the alternative to re-gridding: the
grid and its first derivatives in e, i and a (central differences of the grid at the same steps h as the quadrature's), evaluated as
grid + sum of derivative x the elements' current offset; its RMS against the quadrature on the Amendment 4 steps, same 0.25 m test;
memory four times the grid's. (3) The mean-element drift a 7-day flight sees, from the AP (31, 20) fits of THEMIS D at cutoffs 2013-02-14
and 2013-02-16 against 2013-02-12 (non-scored cutoffs; elements only, no forecast error), to state the re-grids per flight.

## Amendment 6 (2026-11-06, before any init time is measured)
Init: the module builds each (m, w) family's grid from the family's forcing in closed form (sum over l of A F (Cbar - i Sbar)
(a/r)^(l+1) e^{iwf} and its M, e, i, a derivatives on uniform eccentric anomalies, Lagrange's equations, then
H = e^{-i nu e sin E} IFFT(FFT(R (1 - e cos E) e^{i nu e sin E}) / (i (k - nu))) / mdot, the left-out harmonics subtracted in rate
form); the harness first shows it reproduces the harmonic-sum grid (cubic N = 128 against the quadrature within the bounds).
Choice rule: element-linear grids at N = 128 (12.1 MB per object above e 0.3, about 6 re-grids per 7-day flight) are the default; the
fixed grid (3.0 MB, about 180 re-grids per week at de* = 1e-5) is taken only if, in the module, its total 7-day flight cost (init x
re-grids + steps) is lower and its per-step cost including re-grids stays within 1.5 times the element-linear's per step. Memory budget
the rule allows: one object's grids at a time per worker (12.1 MB element-linear, 3.0 MB fixed), freed after each flight; measured by one
worker flying 100 records above e 0.3 in sequence (the HEO example records, repeated): peak wasm memory must stay at one object's grids.
Init time per object and per fit iteration reported beside it.
Report only: the old series' residual against the quadrature at e 0.29 and 0.30 (the step an object takes when its eccentricity crosses
the switch in flight); it changes nothing unless it exceeds the bounds, and then goes to the coordinator.

## Amendment 7 (2026-11-06, the SDN-AP session's ruling on the switch; before any sizing of it is read)
The e 0.29 / 0.30 residual (21 m RMS, 44 m maximum) exceeds the bounds, so the switch goes by the bound. The single switch parameter
(today kWideE = 0.3) becomes a threshold function e*(n, i), sized offline against the full-field quadrature only, across the catalog
regimes' mean motions and inclinations (the regimes of lib/regimes.mjs and the site's cells: low orbit, altimetry, laser geodetic, MEO,
inclined geosynchronous and quasi-zenith, geostationary, highly elliptical): the narrow set (q in {-1, 0, 1}) is kept only where it meets
the bounds (1 m RMS, 5 m maximum, 0.1 m roughness of the difference, 7 days at 300 s); the grid is used everywhere else. The step at the
threshold is bounded by construction (both sides within the bounds of the field there) and its measured maximum is reported. The method
is chosen once per flight at init from the fitted mean elements, never per step, so an object near e* cannot flip in flight.
No harm: byte-identical output wherever the narrow set is kept. Scope: every published figure whose object moves to the grid, listed by
applying e*(n, i) to each published object's fitted elements before any re-measurement (expected: the quasi-zenith cells, e about 0.075
with a one-day period, and any stored window with 0.05 < e < 0.3); each is re-measured on 0.6.3 and moved in the one site push; TESS
stays withheld.

## Amendment 8 (2026-11-06, the coordinator's ruling; before any row of it is read)
Ruling: the candidate (eca9db70) does not pass: THEMIS day 3 405.1 -> 647.5 m is worse, whatever the bootstrap bound; the flight is
proven (base fit flown on the candidate: 0.072 m, 153.1 / 422.6 / 997.0 m), so the regression is in the fit. Investigation, on the 12
THEMIS windows, fit only plus the same 7-day flight:
Arms (each a scratch build of the same source, SHA-256 recorded): base (0.6.1 dist); C1 each set its own exact grid with in-flight
re-grid (eca9db70's ancestor 43692be6); C2 shared grids with re-grid; C3 shared grids, no re-grid (eca9db70); C4 each set its own exact
grid, no re-grid (the cache's sharing tolerance zero).
Per window and arm: the fit's residual RMS (FIT_RMS_KM), iteration count and convergence, the fitted mean elements' differences from
the base's (n, e, i, Omega, omega, M, BTERM, AGOM), day 1 / 3 / 7 errors. Per arm the medians.
Readings: partials' consistency is read from C3 against C4 (shared element-linear grid against an exact grid per perturbed set) and C2
against C3 (re-grid on against off).
Hypothesis: at e 0.82 the first-order displacement is about 450 m RMS; second-order short-period terms (products of first-order
terms) of tens of meters are absent from both models; the old truncated table's 65 m RMS error happened to cancel part of them in the
fit. Test that would confirm it (next box): the fit residuals' spectrum on the candidate against the base's, power at harmonics of M
above 10 n larger on the candidate, and a second-order displacement estimate from the quadrature (the first-order displacement fed
back into the potential's gradient) of the size of the day-3 change.
Additions (SDN-AP session, before any row of Amendment 8 is read):
1. "Not worse" is a paired test: per window, the ratio candidate / base of the 3D RMS at days 1, 3 and 7; the median ratio with a
   window-cluster bootstrap (10,000 draws, seed 20261106, 95 % percentile interval); non-inferiority margin 1.05 (the upper bound of
   the median ratio at or below 1.05 at each day). If the upper bound cannot clear the margin at 12 windows while the median ratio is
   at or below 1.0, THEMIS windows are added in this order before any is flown: cutoffs 2013-02-12, 14 and 16 for A, D and E (THEMIS D
   2013-02-12 and THEMIS E 2013-02-16 excluded, the correctness windows), then 2013-02-10 and 2013-02-18 if the kernels cover the arc
   and the 7-day flight.
2. The in-flight re-grid is dropped (a re-grid at different moments in a fit's perturbed sets breaks the finite-difference partials'
   continuity); the grid is built once at init and read linearly in the elements' offsets. Recorded with it: the partials' consistency
   between per-set exact grids and the shared grid (C4 against C3: fitted elements and day errors), and the 7-day drift error with no
   re-grid against the quadrature at the drift a flight sees (de up to 3e-3, harness, element-linear grid); the 1 m RMS bound must hold.
3. If the residual spectrum confirms second-order terms, the lane stops and reports: starting any second-order work is the SDN-AP
   session's decision.

## Amendment 9 (2026-11-06, second box; registered before any new row is read)
Read so far: on THEMIS A 2013-02-15, day 3 is 314.1 m on the base and 3,238.9 m on C4 (3,072.3 m on C1); the other 11 windows are within
5 %. Not yet read: the base-fit-on-candidate-flight row of this window (flight3), every per-window fit statistic of it, the published
roughness-study rows of this window on other builds.
Diagnosis, THEMIS A 2013-02-15, arms base and C4 (and C1, C3 rows already stored):
1. Flight or fit: the stored flight3 row (base fit, candidate flight) and a new cross arm (C4 fit, base flight). The fault is the fit's if
   the base fit flies well on the candidate and the C4 fit flies badly on the base.
2. Fit: iteration count and the final residual RMS (FIT_RMS_KM); the final fit's residual record (the fit's `residuals` port, $ODR) per
   state, base against C4, its RMS per 12 h of the arc and its largest residuals' positions (radius, mean anomaly). The module does not
   expose residuals per iteration; that is stated, not inferred.
3. Elements: the fitted mean elements (n, e, i, Omega, omega, M, BTERM, AGOM), base against C4, beside the same differences on the
   other 11 windows.
4. History of this window: the roughness study's stored rows (published, d124e695) of THEMIS A 2013-02-15 on 0.4.11 to 0.6.0, day 3; if
   the base's 314 m is the outlier among builds the candidate is not the cause.
5. Regime: the window's epoch class (one-day band) and its distance from the band edges and from the class's commensurability
   (|psi-dot| of the class terms over n), against the other 11 windows; e* is not reached (e 0.82).
6. Linear range: with C4 every perturbed set has its own exact grid, so the fit's arc has none; the flight's element offsets from the
   epoch elements at day 3 are read from the drift rate (elements at successive cutoffs) and compared with the other windows'.
Outcome rule: a defect found is fixed and the 12 windows rerun; else C4 is not acceptable with a 10x regression on one window, and the
report states the cause found and stops for the coordinator.

## Amendment 10 (2026-11-06, the SDN-AP session's inputs; written after Amendment 9's stored rows of THEMIS A 2013-02-15 were read and
before any of the checks below is run)
Already read (Amendment 9, items 1 to 4 from stored rows): on this window C1, C2 and C4 fit BTERM 4.29 to 4.51 against the base's
0.012 (C3: 0.012), with fit residual RMS 249 to 250 m against 110 m (C3: 105 m); the day errors grow quadratically on those arms; the
base fit flown on the candidate gives day 1 / 3 / 7 126.1 / 440.6 / 857.1 m against 211.7 / 314.1 / 419.9 m; the roughness study's
rows give this window 173.8 / 260.7 / 910.1 m on 0.4.11 to 0.4.14 and 211.7 / 314.1 / 419.9 m on 0.4.15 to 0.6.0.
1. Small divisors: per window (the 12 THEMIS elements as fitted by the base), each grid family's smallest |k - nu| over the kept
   harmonics and its psi-dot / n, and the largest family amplitude (position, m); THEMIS A 2013-02-15 against the others. Before any
   fix: the grid against the full-field quadrature at THEMIS A 2013-02-15's base-fitted elements (resum3.cpp's check): agreement within
   the bounds means the fit is the problem, disagreement means the cut.
2. Re-grid replacement: a re-grid on a fixed schedule in flight time, every k hours from the set's epoch, the same for every set of a
   fit; across each boundary the old and new grids are blended linearly over the last fifth of the interval so no step adds
   roughness; k sized against the quadrature with the measured drift (de 3e-3 per week, linear in time) so that 1 m RMS, 5 m maximum
   and 0.1 m roughness hold over 7 days; k from {6, 12, 24, 48} h, the largest that holds.
3. Init in wasm: target 100 ms per object or less (report-only until met). Measured: 1,000 records above e* flown to one epoch, wall time
   and peak wasm memory, on one worker and on a pool of the console's size (8 workers); the choice of N and of C3 against C4 weighs this
   beside the fit cost.

## Open item (2026-11-06, the coordinator's decision (a); not run in this box)
Decision: C3 is not accepted (day-7 paired upper bound 1.051 against the 1.05 margin); the fit's second solution (BTERM 4.3 to 4.5, 2.3
times the attainable residual) goes to a separate fit-robustness record for fit_oem.inc, with THEMIS A 2013-02-15 and C4's grid as its
test; the E2E and the moved GTO E2E are written on the C4 source.
Open: on THEMIS A 2013-02-15 alone the base fit flown on the candidate is worse against truth (day 3 440.6 against 314.1 m, day 7 857.1
against 419.9 m) although the grid agrees with the quadrature there (0.119 m RMS). Hypotheses: (H1) the truncated table's 65 m RMS error
happened to compensate this window's other model error (for example its drag at the 820 km perigee); (H2) the window's truth is at
fault (a kernel segment boundary or a maneuver inside the arc or the flight). Test that separates them: H2 predicts a discontinuity or a
residual jump in the reference itself, seen by the base and the candidate alike: the fit residual record per state on both builds,
the reference's own second difference at 300 s across the window (a jump in the truth shows as an isolated spike on every build), and
the kernel's segment boundaries; H1 predicts no spike and a smooth day-by-day divergence between the two flights of the same set,
largest where the truncated table's displacement against the quadrature (65 m RMS) is largest, and the same compensation on the
neighboring cutoffs 2013-02-14 and 2013-02-16 of THEMIS A.
Named separating tests (from the coordinator's candidates, before either runs): for H2, the agreement of the THEMIS A truth file with a
second independent ephemeris over the arc and the 7-day flight (a disagreement above the candidate's day-3 change, about 125 m, or a
maneuver or attitude event in the mission's records for the window, confirms H2); for H1, whether the truncated table's error against
the quadrature, along the flown track, lines up with the long-period part of the candidate flight's error against truth on that window
(correlation of the two series after removing harmonics of M above 10 n; a correlation above 0.8 with the table's error of the size of
the difference between the two flights confirms H1).

## Amendment 11 (2026-11-06, before C5 is flown)
Read: the scheduled, blended re-grid holds every bound at k = 48 h (0.085 / 0.081 m RMS, 0.66 m maximum, no roughness added); the
build's speed-up (forcing summed over degree first, the left-out harmonics' G and dG/de by the E-node trapezoid, forward-difference
derivative grids) keeps the module check at 0.119 m RMS, 2.33 m maximum, 3 mm, and k = 48 h at 0.072 m RMS. Arm C5 (modules WIP
714291f99, wasm 908d8eb3): C4 with the 48 h schedule (each node's grid at the set's mean elements there, the same nodes for every set of
a fit, blended over the last fifth) and the faster build. Flown: the 12 THEMIS windows (C5, and the base fit on the C5 flight), the
paired test of Amendment 8 (margin 1.05) against the base; the catalog-scale case of Amendment 10.3 (1,000 records above e*, one worker
and 8 workers). THEMIS A 2013-02-15 is expected to keep the fit's second solution (the fitter is the other record's).

## Amendment 12 (2026-11-06, the e*(n, i) sweep of Amendment 7; registered before any case runs)
Harness estar.cpp: the module's narrow set (sp_terms at e <= 0.3, degree 2 to 12; the near-resonant terms above 12 excluded from the
comparison) through sp_six against the full-field quadrature (l 2 to 12, 1,024 mean anomalies, |j| <= 511) under the table's own
admission rules (low orbits: |psi-dot| < 1e-3 n and the shallow band's q = 0, w = 1, j = 1 terms out; others |psi-dot| < 0.045 n out;
class terms and the half-day tail out), 7 days at 300 s; check: it reproduces the e 0.30 THEMIS-like case (21.42 m RMS, 44.05 m).
Regimes (n rev/day, i deg): Starlette 13.82 / 49.8; Ajisai 12.44 / 50.0; LARES 12.55 / 69.5; Jason-3 12.81 / 66.0; Sentinel-3 14.27 / 98.6;
CryoSat-2 14.52 / 92.0; LAGEOS-1 6.39 / 109.8; LAGEOS-2 6.47 / 52.6; Etalon 2.13 / 64.9; GPS 2.005 / 55.0; Galileo 1.70 / 56.0; GLONASS
2.13 / 64.8; inclined geosynchronous 1.0027 / 55.0; quasi-zenith 1.0027 / 40.0; geostationary 1.0027 / 0.1; Molniya 2.006 / 63.4; GTO
2.40 / 27.0. e in {0.001, 0.003, 0.01, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3}. Angles: Omega 40, omega 30, M 10 deg; epoch
2013-02-09 (the THEMIS D fit's). e*(n, i) for a regime: the smallest e on the grid at which the narrow set fails any bound (1 m RMS,
5 m maximum, 0.1 m roughness of the difference); no failure up to 0.3: e* = 0.3. Where the narrow set fails, the grid is checked
against the quadrature at the same case (verify.cpp) and must hold the bounds; a regime where neither holds is reported, not
switched. The module's e*(n, i) is the table of regimes, each object taking the regime nearest in (n, i).

## Amendment 13 (2026-11-06, before C7 is flown)
Known limit, pending the SDN-AP session's ruling on the e* sweep: kWideE stays 0.3; an object whose eccentricity crosses 0.3 changes
from the narrow set (21.4 m RMS, 44.0 m at most from the field at THEMIS-like elements) to the grid (0.12 m RMS): a step of that size at
the switch. The e* sweep (results/ap-truth/themis-ripple-fix/estar) found the narrow set 1 to 8 m RMS from the field at near-circular
eccentricities in 16 of 17 regimes; nothing is applied from it.
Arm C7: C6's source (the 48 h scheduled, blended re-grid with each set keeping its last two nodes' grids; modules WIP 53fff2c00) with
C3's sharing: a set within the grid's linear range of a cached grid (|de| <= 3e-4, |di| <= 1e-4 rad, |da / a| <= 1e-4) shares it,
element-linear. Flown on the 12 THEMIS windows with the paired test of Amendment 8 (margin 1.05) against the base; beside it, C6 (C4's
exact grid per set with the same schedule) on the same windows, and for both: peak wasm memory and the one-epoch propagate's wall
(memtest.mjs) and the 1,000-record catalog case on 8 workers.

## Amendment 14 (2026-11-06, the catalog line; before any of it is measured)
Read: C7 clears the paired margin (0.948 / 0.990 / 0.999, upper bounds 0.962 / 1.014 / 1.031) with THEMIS A 2013-02-15 on its good
solution; C7 memtest 137 MB per worker, 0.77 to 0.80 s for a one-epoch propagate; C6's 1,000-record 8-worker run 397 s, 3.15 s per
record, 333 MB per worker. Budget: 100 ms of wasm init per object or less.
1. Init profile, one object in wasm (a scratch build of 6f3b82ef3 with timers and an export, outside the shipped source): the one-epoch
   propagate's wall against the base build's on the same record, and inside the grid build the shares of the per-family forcing,
   the left-out harmonics, the FFT integrals, the derivative grids (three more family builds) and allocation; native 53 ms against it.
2. Lazy schedule nodes: the source builds node 0 at init and node j only when a call falls in its span (verified by counting builds in
   the timed build for a one-epoch propagate and for a 7-day flight); measured as is.
3. Retention across refreshes: a variant keeping every idle grid (the cache's idle limit raised to the catalog's size per worker)
   against the source's four; the refresh pass's cost and the peak memory per worker both ways, 1,000 records on 8 workers.
Reported beside C6's: wasm init per object, load and refresh seconds per worker, peak memory per worker; within the budget or the gap.
Catalog budget (SDN-AP session; registered before any C7 catalog number is read; the C7 1,000-record run started at 03:12 and its
output is unread): on the C7 dist with whatever lazy-node or retention design is adopted, all three must hold:
(1) cold: median wasm init at or below 100 ms per object for a one-epoch propagate of a record above e 0.3, one worker, over the 1,000
    records; (2) warm: one catalog refresh, all 1,000 records to a new epoch on the 8-worker pool, at or below 5 s wall; (3) memory: peak
    wasm memory at or below 512 MB per worker under the retention policy used, the eviction rule stated. All three: the grid ships in
    0.6.3 with the fitter fix; any miss: 0.6.3 is the fitter fix alone and the grid waits. The wasm/native gap is profiled before any
    optimization (wasm libm trig and exp in the build, memory.grow count during init, missing SIMD in the inner loops).

## Amendment 15 (2026-11-06, the SDN-AP session's ruling; written AFTER the C7 catalog numbers were read)
Disclosure: written after C7's 1,000-record numbers (618 ms per record with covariance, 77.7 s refresh, 108 MB) and the init split
(614 ms with the record's covariance, 31 ms without; base 4,133 and 230 ms) were read. The registered budget gated the whole covariance
propagate path, whose cost predates the grid (shipped 0.6.1: 4,133 ms per record on that path); applied literally it would keep a
binary 6.7 times costlier and still rippling. The grid ships in 0.6.3 if: (a) records without covariance: cold median at or below 100 ms
per object (one worker, 1,000 records) and a warm refresh of 1,000 records on 8 workers at or below 5 s, both measured; (b) records
with covariance: not worse than the shipped build on the same path (614 against 4,133 ms per record); (c) memory at or below 512 MB per
worker. The covariance path's re-initialization (1 + 2 x 8 sets, each initialized) is a design defect with its own record, which
inherits the original budget; it is not changed here.

## Amendment 16 (2026-11-06, the levers box; registered before any of its numbers exists)
Read: under Amendment 15 C7 holds (b) 618 against 4,133 ms and (c) 130 MB, and misses (a): cold median 183.1 ms per record (one
worker), warm refresh 26.1 s (8 workers); a refresh with every grid held would cost 32.6 to 35.1 ms per record but 125 held grids per
worker at 7.08 MB are 885 MB, over 512 MB. The grid ships as 0.6.4 if, after the levers below, it clears (a) cold and warm and (c)
memory on the same measurement (catalog.mjs, 1,000 distinct records above e 0.3, no covariance, one worker for the cold median and
8 workers for the refresh); else it parks with the numbers. 0.6.3 is the fitter fix alone.
Targets: cold median at or below 100 ms per object; warm refresh at or below 5 s on 8 workers (40 ms per record per worker at 125
records); peak at or below 512 MB per worker.
Memory arithmetic for holding every grid of a worker's share (125 records above e 0.3; 288 families x 6 components x N nodes x 2
floats = 1.77 MB per family set at N = 128): value only 1.77 MB; value with e and i derivatives 5.31 MB; with e, i and a 7.08 MB (now);
derivatives at N = 64: 1.77 + 3 x 0.88 = 4.42 MB; derivatives stored in half precision: 1.77 + 3 x 0.88 = 4.42 MB; both: 1.77 + 3 x 0.44
= 3.10 MB. Held for 125 records plus the 64 MB base heap: at most (512 - 64) / 125 = 3.58 MB per record; so the held-grid route needs
at most 3.58 MB per grid (derivatives at N = 64 in half precision, or the a / a derivative dropped with e and i at N = 64).
Levers, each sized against the full-field quadrature first (themis-ripple.e2e.mjs's verify on THEMIS D and E and the GTO fixture, and
sched.cpp's drift check at 3e-3 per week with the 48 h schedule), kept only if the bounds hold (1 m RMS, 5 m maximum, 0.1 m roughness
of the difference; drift 0.25 m RMS) and C7's paired result is not re-flown unless the math of the value grid changes:
L1 derivative grids at N = 64 (the value grid at 128); L2 derivative grids in half precision; L3 the a / a derivative dropped (the
schedule's 48 h nodes bound the a drift; drift check with da / a at the measured rate); L4 one forcing evaluation shared by the four
family sets (the derivative sets differ only through e, i and n in the forcing's coefficients and divisors: built in one pass where
the math allows); L5 fewer E nodes for the derivative sets (128 against 256). Cold: L4 and L5 (build time); warm: L1 to L3 (held size)
with an idle limit of 128 grids per worker, eviction oldest first. The measured cold, warm and memory of the chosen combination decide.

## Amendment 17 (2026-11-06, box 3 start 03:28Z; before any lever is built or measured)
Added lever L6: the value set itself on 128 E nodes (all four sets at NE = 128; the earlier native check at NE = 128 read 0.13 m RMS,
2.30 m maximum, 0.046 m roughness of the difference on THEMIS D, inside the bounds, and is re-run on the levers' build). L4 is taken in
the form the math allows: the six rate components are linear in five forcing functions (g, its M, e, i and a derivatives), and the
M-derivative's integral follows from g's (H[g'] = g / M-dot + i nu H[g]), so a family needs five transforms instead of seven.
Planned combination, in this order, each quadrature-checked before the next: L6 + L4 (cold), L3 + L1 (held size 1.77 + 2 x 0.88 =
3.54 MB per grid), idle limit 128 with 256 cache slots. Then the Amendment 15 measurement on the same 1,000 distinct records.

## Amendment 18 (2026-11-06, box 3; written AFTER the levers' catalog numbers were read: disclosure)
Changes made beyond Amendment 17's list, each found while measuring: (1) L2 was taken with L1 (derivative grids on 64 nodes in half
precision, 3.10 MB per grid instead of the planned 3.54); (2) a grid is one allocation and the build's double-precision sets are kept
for the module's life; (3) schedule nodes on t's side of the epoch (a flight at the epoch had built a node behind it, two grids per
record, so a refresh found none held); (4) the wide zonal tail's G and dG/de (above e 0.3 only) by the 256-node trapezoid instead of
the 512-point quadrature with a finite-difference derivative: 2.6 ms native for its 210 terms, the largest non-grid init cost. Item (4)
changes the zonal tail's numbers above e 0.3 (two spectral quadratures of the same integrals), so the 12 THEMIS windows are re-flown
on the final build (arm L, modules 6b60710fe, wasm a7771b14) with the paired test before the result is stated, and themis-ripple.e2e.mjs
reruns on it.
Checks the SDN-AP session added (after the re-fly was registered above): (a) the zonal change's accuracy: G and dG/de of the 210 terms
against the previous evaluation, the largest difference relative to the degree's largest term, at THEMIS D's and E's e, 0.72 and 0.31;
and THEMIS D and E flown from the same set on C7 (c3f32102) and on the final build, the RMS and largest position difference over 7
days at 300 s; (b) the e <= 0.3 byte identity re-shown on the final build against 0.6.2's dist (LEO AP, LEO SGP4XP, geostationary AP,
Etalon-like, GPS-like, e 0.25 and 0.3 AP seeds, and a fitted AP set): the published examples' low-eccentricity records are not stored as
sets in the site repository (it holds their flown tracks), so they are not in this check.
Memory margin: the catalog case peaks at 478 to 488 MB per worker against 512 MB with at most 128 idle grids of 3.10 MB; any later
growth of a grid (more families, a higher degree, more nodes) re-measures it.

## Amendment 19 (2026-11-06, the Molniya fixture; registered before its rows are read)
Read: the GTO E2E on the final build gave Molniya with fitted drag 627 m along-track at day 7 (recorded 276.44) and with the drag
coefficient pinned 214 m against that run's 0.4.14 baseline of 159 m; that run's 0.4.14 baseline also read 461 / 260 m against the
recorded 149.82 / 175.90 (the environment has moved since the record). A run of the three Molniya fixtures on the 0.6.1 dist and the
final build was started before this amendment; its output is unread and is superseded by the run below.
Table (molniya.mjs, test/lib/heo-model-truth.mjs, one environment): the fixtures Molniya with fitted drag, with the coefficient pinned at
0.044, and without drag, each fitted and flown on 0.4.14 (git 8fdf5b1af's dist), the shipped 0.6.2 (dist 84d50dca, git c82160de7), C7
(c3f32102) and the final build (a7771b14); day 1, 3 and 7 whole-day RMS along-track and radial, and the fitted coefficient. The grid's
effect is the final build against 0.6.2 in the same environment; the drift is 0.4.14's reading now against its record.
Divisors and the cut at Molniya's elements (n 2 rev/day, e 0.74, i 63.4 deg, Omega 300, omega 270, M 10; the half-day class): each
grid family's smallest |k - nu| (psi-dot over n), the largest family amplitude (lambda x a, m), and the grid against the full-field
quadrature (verify.cpp: RMS, maximum, roughness of the difference over 7 days at 300 s, bounds 1 m, 5 m, 0.1 m).
Byte check source: the 56 published example sets at experiments results/ap-truth/compare/examples/<id>.ocm (main aa2a0a7 or later),
the e <= 0.3 ones flown on the final build and on 0.6.2's dist, ephemerides compared byte for byte.

## Amendment 20 (2026-11-06, a defect; registered before any post-fix row is read)
Found by themis-ripple.e2e.mjs on the final build: the GTO fixture (n 2.4, e 0.72, i 27, omega 270) is 66.0 m RMS, 161.9 m at most from
the full-field quadrature, while THEMIS D and E (one-day class) hold 0.12 / 0.13 m. Defect: the half-day class's resonant tail (class 2;
l 6 to 31, even m, j = m / 2) is carried in the mean rates (SPEC 16.2) and left out of the output-time table by sp_terms' weight_of, but
wide_families did not leave it out of the grid's forcing, so at half-day-class orbits (GTO, Molniya) those harmonics were counted twice.
Fix: wide_families leaves them out by the same per-harmonic subtraction the class terms use (the table's existing rule; not a new
resonant treatment, not a wider band). The native harness references descended from resum.cpp (verify.cpp, the one the module checks
used) had the same omission, which is why the GTO check passed at 0.063 m before; estar.cpp and the E2E's reference had the rule. The
references are corrected to state the same exclusion as the module (m-daily, the class's terms, the half-day tail in class 2,
|psi-dot| < 0.045 n), so reference and module agree by construction only where that rule is shared and stated.
Pre-fix state, reported as such: the four-build Molniya table run already started on the pre-fix final build (a7771b14).
After the fix: the quadrature at the GTO fixture (omega 270 and 300) and at Molniya's elements (verify.cpp and the E2E); the paired
four-build table (0.4.14 / 0.6.2 / C7 / the fixed build) on every GTO and Molniya fixture in one environment with build hashes; the 12
THEMIS windows re-flown (class 1: expected unchanged); the e <= 0.3 byte identity re-run; the GTO E2E's truth pinned.
Added (SDN-AP session): the quadrature references share the grid's exclusion rules by construction, so they are not independent of
them; a regime's acceptance therefore includes an end-to-end comparison against full-force integration with the same field in vacuum
(the pinned FFM model truth of test/lib/heo-model-truth.mjs) beside the grid-against-quadrature numbers, for THEMIS (a fixture at THEMIS
D's fitted elements, no drag), GTO and Molniya: the four builds' day 1, 3 and 7 along-track and radial RMS, one environment. (For the
record: estar.cpp, the e* sweep's harness, carried the half-day rule; verify.cpp did not.) The e* sweep (Amendment 12) is marked
suspect in its results and re-run in the all-regimes record with an independent reference; it stays unpublished. The e 0.3 step is
re-measured with the corrected reference before it is used as a known limit.
