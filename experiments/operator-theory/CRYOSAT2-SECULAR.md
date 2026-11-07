# CryoSat-2's secular rate mismatch and the fitted forward drift under a better model: registration (report only)

Record experiments-sdn-ap-cryosat2-secular-mismatch-20261106 (SDN-AP 2026-11-06; widened 12:55Z). Registered and committed before any
row is flown or read. Report only: a finding, no design, no module change.

## The two questions
1. The secular/zonal shares record (SECULAR-ZONAL-SHARES.md; results/ap-truth/secular-zonal-shares) found AP's own secular rate mismatch at
   20x20 in CryoSat-2 alone: the forward-day along-track slope T1 -14.22 m/day [-27.64, -0.80] with a radial bias R0 9.50 m at fixed mean
   motion (Amendment 2 reading), while every other low regime with an interval reads fit absorption. Why that regime alone: its near-polar
   92 degree inclination, its repeat-orbit commensurability, or fit absorption on its arc.
2. The 0.6.4 validation (TESSERAL-SWITCH-BY-CLASS.md, Amendment 2; rows on wip/modules-sdn-ap-tesseral-switch-by-class-20261106/switch,
   read, never modified) found four cells where the paired raw forward RMS rose while the tesseral share fell and the fit RMS improved:
   Jason-3 e 0.07 (28.33 -> 29.28 m; secular share 19.1 -> 28.2 m), Jason-3 e 0.1 (51.96 -> 57.62; 43.1 -> 56.6), Ajisai e 0.1
   (44.67 -> 46.09; 6.3 -> 24.7) and Ajisai e 0.15 (86.92 -> 98.70; 42.7 -> 70.6; fit RMS 51 -> 42 m). Why the fitted forward drift moves
   when the model improves: the rate absorbing what the better short-period model no longer leaves in the residual, the arc length, or
   the fitted-rate freedom.

## Ground, frame and estimator (reused unchanged)
The all-regimes frame and code (TESSERAL-ALL-REGIMES.md, Amendments 1 to 7; tesseral-all-regimes.mjs exports attribute, verdictOf,
bounds, rtnOf, gridSeconds, arcDays, ARMS, PIN): the same fixture (osculating perigee seed, ma 0, no drag, Sun and Moon from DE440), the
same reference (propagator/ffm 2.2.1, RK78 rel 1e-12, steps to 300 s), the same fit (3-day arc at 30-minute samples, BTERM and AGOM
priors (0, 1e-10)), the same forward day sampled 64 times a revolution, the same attribution and jackknife. The estimator is the
secular/zonal record's item 1 and 2, word for word: per RTN axis a least-squares line (constant, slope) on the raw forward-day error,
R0 (m), T1 (m/day), with the delete-one-revolution jackknife (K revolutions, SE sqrt((K - 1) / K sum (theta_i - mean)^2), interval
+-2 SE, none below 3 revolutions); T_a = -(3 / 2) n_rad R0, T_r = T1 - T_a, the radial-bias reading when |T1| < |T_a| / 3. The
mismatch of question 1 is T1 at 20x20; the drift of question 2 is T1 on the primary frame (31x31 against caps 31 / 20). Every state
comes from the two dists through propagator/sdn-ap/test/lib/heo-model-truth.mjs and ocm.mjs; this record's runner moves bytes and does
arithmetic (least squares, RMS, the two-body scale a dn).
Pins: modules 93cb5a0584fa728864e4426cc9ceb368936589f9 (the read-only root /Users/tj/software/private/coordinator-d9/space-data-network-modules-covm);
propagator/sdn-ap 0.6.3 dist SHA-256 aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e; propagator/ffm 2.2.1 dist SHA-256
a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4; propagator/sdn-ap 0.6.4 pre-sign dist SHA-256
e245de29ea050b08244dc9d69fd892ad2473699843b92988fd34a47a466b15f8 (the -pin clone's branch tesseral-switch-by-class at 9d12e329a6ae7a150276c85cd6ecb39806c4a698,
read only; its test/lib harness and ffm dist are byte-equal to the pinned root's). Every row carries the SHA-256 of every dist it flew,
the modules commit and the runner's SHA-256. The record's truth cache is this lane's scratch alone.

## Question 1: the cells (the secondary arm, FFM EGM96 20x20 against caps 20 / 20, so the J21-J31 tail is out of the question)
Base: CryoSat-2 as the all-regimes record lists it (n 14.52 rev/day, i 92, e 0.001, raan 0, argp 0), re-flown here (deterministic; its
T1 and R0 must reproduce the landed secondary re-flight within 0.01 m/day and 0.01 m, else the difference is a reproduction figure stated
first). Every candidate cell changes one input of that fixture and nothing else:
- Inclination: i 86 and i 98 (n 14.52 held). 98 is the sun-synchronous inclination at this altitude (Sentinel-3's regime, which reads
  fit absorption at n 14.27); 86 mirrors 92 about the pole.
- Repeat-orbit commensurability: the fixture's fitted mean motion 14.5485 rev/day lies 0.0088 rev/day from the exact two-day repeat
  (29 revolutions in two sidereal days: 14.5 x 1.00273781 = 14.5397 rev/day), and the j = 1 tesseral families of orders 14 and 15 beat
  at +0.51 and -0.49 cycles a day, below the attribution's 1.5 / day Rayleigh limit, so the trend absorbs them. The mean motion is shifted
  both ways by 0.03 rev/day (n 14.49 and 14.55: across the exact 29:2 repeat, orders 14 and 15 still within the limit) and by 0.25 rev/day
  (n 14.27 and 14.77: the order-14 and -15 beats move to 0.26 / -0.74 and 0.76 / -0.24 cycles a day; semi-major axis -80 / +80 km). i 92
  held.
- Fit absorption, through the module's public inputs alone: (a) the arc length, the fit's $OEM useable span (heo-model-truth fitDays):
  2 and 6 days beside the registered 3 (the forward day starts at each arc's end); (b) the fitted-rate freedom, the $PCF FIT.DRAG_PRIOR:
  the frame's (mean 0, sigma 1e-10 m^2/kg, GAUSSIAN_SIGNED; BTERM held at 0, no secular along-track acceleration in the fit) against
  (mean 0, sigma 0.1 m^2/kg, GAUSSIAN_SIGNED) with FIT.SRP_PRIOR held at (0, 1e-10): the fit may then absorb an along-track drift in
  BTERM through the module's Jacchia 1970 atmosphere at F10.7 150 (the reference has no drag; the fitted BTERM is reported as the size of
  the freedom used). No other fit input exists on the command surface that changes the rate's freedom (the mean motion is always
  estimated); the fit's own span policy (USEABLE times absent) is not flown.
Ten cells. Each carries R0 and T1 with their intervals, T_a, T_r, the absorption reading, the forward shares (secular, zonal, tesseral),
the forward RMS, the fitted n, e and BTERM, A and the three-way verdict.

## Question 1: the reading rule (written before the rows)
- For each candidate cell, D = T1_cell - T1_base with SE_D = sqrt(SE_cell^2 + SE_base^2) (two deterministic flights; the interval is the
  estimator's spread, stated as such): "moved" when |D| > 2 SE_D.
- Weak reading beside it: "removed within the spread" when the cell's T1 interval includes 0 and |T1_cell| < |T1_base| / 2 while the base's
  interval excludes 0 (the mismatch is gone in the cell but the move is below the strong rule's resolution); "reversed" when the cell's
  interval excludes 0 with the opposite sign.
- A candidate "carries it" when any of its cells reads moved (the cell, D and its interval named; for commensurability the direction of
  the shift too); "removes it within the spread" when none moved and any reads removed; "does not carry it" otherwise. The record names the
  candidate(s) that carry it with their intervals, or states "not separable" when no candidate carries it (the weak readings then stated).
- R0 (the 9 m radial bias at fixed mean motion) is read beside T1 with the same moved rule and reported; it does not decide.
- No cell is unmeasured silently: a cell that fails to fly reads "withheld (error)" with the message.

## Question 2: the cells (the primary frame, as the four cells were flown)
For each of the four cells (Jason-3 e 0.07 and 0.1, n 12.81, i 66; Ajisai e 0.1 and 0.15, n 12.44, i 50; raan 0, argp 0, arc 3 days):
- fit063: the registered fit and flight on 0.6.3; fit064: the same on 0.6.4 (the two fitted sets A and B; their fitted n, e, BTERM, fit
  RMS; a (n_B - n_A) 2 pi in m/day is the element reading of the rate change).
- The cross-flights: set A flown on 0.6.4 and set B flown on 0.6.3 against the same reference (heo-model-truth's omm input, the set flown
  instead of fitting). The decomposition of the drift change: set effect = T1(B on 0.6.4) - T1(A on 0.6.4); model effect = T1(A on 0.6.4)
  - T1(A on 0.6.3); their sum is T1(B on 0.6.4) - T1(A on 0.6.3), the change the validation saw. The 0.6.4 change is short-period tesseral
  only (SPEC 16.11), so the registered prediction is a model effect within the spread and a set effect carrying the change.
- Arc length: fit and flight with a 6-day arc on both dists (fit063:arc6d, fit064:arc6d).
- Fitted-rate freedom: fit and flight with FIT.DRAG_PRIOR (0, 0.1, GAUSSIAN_SIGNED) and SRP_PRIOR (0, 1e-10) on both dists (fit063:bfree,
  fit064:bfree), the fitted BTERM reported.
Eight flights per cell, 32 in all; every one carries the question-1 items (R0, T1, intervals, T_a, T_r, shares, forward RMS, fitted set).

## Question 2: the reading rule (written before the rows)
Per cell, with "beyond the spread" meaning |x| > 2 sqrt of the sum of the two T1 variances:
- "the rate absorbs" when the set effect is beyond the spread and the model effect is not (the fitted elements, not the flight model,
  carry the drift change); "the model carries it" when the reverse; "both" or "neither (within the spread)" otherwise.
- "arc length" when |T1(arc6d)| < |T1(arc3d)| beyond the spread on 0.6.4 (stated for 0.6.3 too); "fitted-rate freedom" when
  |T1(bfree)| < |T1(fit)| beyond the spread on 0.6.4 (stated for 0.6.3 too). Either can hold beside "the rate absorbs": they say
  whether the absorbed drift is reducible through the public inputs.
- The record's answer per cell is the list of candidates that hold, or "not separable" when none does; the summary counts cells per
  candidate. The sign of T1 on 0.6.4 against 0.6.3 is stated: a drift that grew in magnitude, shrank, or changed sign.

## Operating characteristics of the readings (written before the rows)
- Power. The base T1's SE is 6.71 m/day (K 15 revolutions). With a candidate cell of like spread, the strong rule resolves |D| above
  2 sqrt(2) x 6.71 = 19.0 m/day: a candidate that removes the whole 14.2 m/day mismatch without reversing it reads "not moved" under the
  strong rule and "removed within the spread" under the weak one; the strong rule detects a reversal or a growth beyond about 19 m/day.
  The weak reading has no stated false-positive rate: at the base's own spread, a cell whose true T1 is -14 m/day has a roughly 2 per cent
  chance of an interval including 0 (the interval is +-2 SE), and a further halving is needed; two such readings are stated, never one.
- False "moved": two independent flights at +-2 SE each give the strong rule a nominal 5 per cent rate per cell under the jackknife's
  normal approximation (15 blocks); with 9 candidate cells about 0.4 false "moved" readings are expected over question 1 and about 1.6
  over question 2's 32 flights' pairwise readings; a single "moved" cell is therefore stated with that rate, and a candidate carried by one
  cell alone is named "carries it (one cell)".
- The jackknife's delete-one-revolution blocks treat revolutions as exchangeable; a trend plus the merged sub-Rayleigh families (orders
  14 and 15 at 0.5 cycles a day in CryoSat-2's regime) make the per-revolution slopes correlated, so the stated SE understates the spread
  for exactly the commensurability candidate; a "moved" reading for that candidate is read against the two shifted cells on each side.
- Reproduction: FFM is deterministic; a base re-flight differing from the landed row by more than 0.01 m/day is stated as a reproduction
  figure before any reading.
- The arc-length cells move the forward day in time (days 2-3 and 6-7 instead of 3-4): the lunisolar geometry differs; at e 0.001 and
  700 km that effect is below 1 m over a day (the all-regimes lunisolar share is 0 at this window) and is not separated.
- The BTERM-free cells read a fitted BTERM: a BTERM beyond 1e-4 m^2/kg absorbed into a vacuum arc is itself a finding (the fit's
  rate freedom was used) and is reported with the drift it removed.

## Amendment 1 (2026-11-06, this lane; disclosure, written after the 42 rows and the first table, before landing; no row changes, no rule changes)
- Registration slip, disclosed (SDN-AP review, record experiments-sdn-ap-cryosat2-secular-wording-20261106): the registration calls i 86
  the mirror of 92 about the pole. The mirror of 92 is 88; 86 is 4 degrees on the other side of the pole and lies further from it than 92
  does. The i 86 reading is therefore not a symmetry test; it is a second inclination beside 98. No new cell is flown and the registration
  text above stands as written; the reading below is worded for what the cell is.
- Question 1 as registered: the base reproduces the landed re-flight exactly (T1 -14.22 [-27.64, -0.80], R0 9.50). Inclination carries it
  (one cell): i 86 moves T1 to +8.91 [-4.96, 22.77], D 23.13 m/day [3.83, 42.42]; i 98 reads removed within the spread (-7.01 [-26.11,
  12.09]). The four mean-motion shifts (-12.62, -14.84, -10.63, -7.58) and the two arcs (-12.89 at 2 days, -16.97 [-23.70, -10.24] at
  6 days: a tighter interval, the mismatch still there) do not move it; the DRAG_PRIOR freedom was not used by the fit (BTERM -2.5e-26
  m^2/kg, every figure byte-equal to the base). The one "moved" cell carries the registered 5 per cent nominal per-cell false rate, about
  0.4 false "moved" readings expected over the 9 candidate cells; no mechanism is named: the reading says the inclination input moves T1
  in one of two cells, not why, and nothing here reads as near-polar geometry causing the mismatch. R0 (8.2 to 9.6 m) moved in no cell:
  the radial bias at fixed mean motion is common to every cell of this regime and is not separated by any candidate.
- Question 2 as registered: "not separable" in all four cells, and that stands: the registered strong rule resolves nothing below 19 to
  35 m/day in these cells while the measured changes are 5.6 to 8.3 m/day. Stated beside it, from the same rows and without a rule
  change: the element reading a dn of the two fitted sets (an exact difference, no estimator spread) equals the set effect to 0.1 m/day in
  every cell (Jason-3 0.07: 4.79 against 4.84; Jason-3 0.1: 6.78 against 6.85; Ajisai 0.1: 7.23 against 7.33; Ajisai 0.15: 11.62 against
  11.66). The model effect (set A flown on 0.6.4 against 0.6.3) is 2.01, 0.24 and 0.98 m/day in the first three cells: there the model
  effect is within the spread and small, the drift change is the change of the fitted mean motion between the two fits, as the registered
  prediction stated (the 0.6.4 change is short-period only), and the rate absorbs, read on the element difference, not on the jackknife
  rule. In Ajisai 0.15 the model effect is -6.03 m/day against a set effect of 11.66 and a net change of 5.63: the set effect is the
  larger, the model effect is not negligible, and a short-period change can alias into a one-day slope; that cell reads "set effect the
  larger", not "the fitted mean motion alone". The 6-day arc does not reduce the drift: it raises |T1| in both Jason-3 cells (Jason-3 0.1:
  17.82 -> 52.54 on 0.6.3 and 24.91 -> 52.50 on 0.6.4, beyond the spread) and leaves the Ajisai cells within it; the DRAG_PRIOR freedom is
  used only in Ajisai 0.1 (BTERM 7.4e-4 on 0.6.3, 5.4e-4 m^2/kg on 0.6.4) and raises |T1| there. So, in these vacuum fixtures, on
  noise-free arcs, the forward drift is the fitted mean motion trading against the model's slow error, and neither public input reduces it
  there; the reference carries no drag, so the DRAG_PRIOR arm says nothing about a fit on a real drag arc.

## Outputs and check
`SDN_MODULES_ROOT=<the pinned root> SDNAP_064_WASM=<the -pin clone's 0.6.4 dist> SDN_AP_HEO_CACHE=<this lane's scratch> node
experiments/operator-theory/cryosat2-secular.mjs --run [--shard k/n]` (at most 4 shards; cells assigned by position) writes
results/ap-truth/cryosat2-secular/rows-<shard>.jsonl; `--table` writes table.json and README.md from the rows (the two readings, every
cell, the summary); `--check` asserts that this registration's commit precedes the first row, that every row is on the pinned dists and
modules commit, that the base reproduces or its reproduction figure is stated, that every one of the 42 registered flights carries a row
(flown with its items, or withheld with its error), that the table reproduces byte for byte, and exits 0 only then.
