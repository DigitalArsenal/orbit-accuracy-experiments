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
