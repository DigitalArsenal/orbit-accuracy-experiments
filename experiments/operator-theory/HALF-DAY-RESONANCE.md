# The half-day class: the mixed (2:1 resonant) share by family (report only)

Record experiments-sdn-ap-half-day-resonance-20261106. Registered and committed before any row is read or flown. Report only:
nothing in propagator/sdn-ap changes here; no design; a module record, if any, is decided on these numbers elsewhere.

## Ground
The landed all-regimes table (experiments-sdn-ap-tesseral-all-regimes-20261106; TESSERAL-ALL-REGIMES.md with Amendments 1 to 7;
results/ap-truth/tesseral-all-regimes/rows-*.jsonl, table.json) and the diagnosis (TESSERAL-DIAGNOSIS.md; results/ap-truth/tesseral-diagnosis)
are the inputs, reused unchanged. Frame, reference, arcs, sampling, bounds, attribution (basis, Amendment 3 conditioning, the Amendment 6
delete-one-block jackknife, intervals point +- 2 SE) and labels are the all-regimes record's through its exports (tesseral-all-regimes.mjs:
attribute, rtnOf, gridSeconds, arcDays, bounds); Amendment 7 fixes the estimator: no method changes here, and a cell on which the
estimator fails reads "withheld (estimator)". Pins: modules 93cb5a0584fa728864e4426cc9ceb368936589f9; propagator/sdn-ap 0.6.3 dist SHA-256
aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e; propagator/ffm 2.2.1 dist SHA-256
a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4. Every state comes from those two dists through the all-regimes
harness's method (propagator/sdn-ap/test/lib/heo-model-truth.mjs, ocm.mjs); this record's runner moves bytes and does arithmetic
(frequencies, least squares through the exported attribute, RMS, differences of series). Its cache is this lane's scratch
(/Users/tj/software/terrain-work/body-look/resonance/heo-cache), never another lane's. Source lines below are the pinned modules commit.

## The cells
From the landed rows: GPS (2.005 rev/day, 55.0 deg), Galileo (1.70, 56.0), GLONASS (2.13, 64.8), Molniya (2.006, 63.4, argument of
perigee 270) at e 0.001, 0.01, 0.05, 0.1, 0.2 (all flown, all above the perigee floor), and GTO (2.40, 27.0, argument of perigee 180) at
e 0.001, 0.1, 0.2 as the half-day comparison far from the commensurability (its landed 0.29 / 0.30 / 0.31 rows are read, not flown).
Etalon (2.13, 64.9) differs from GLONASS by 0.1 deg of inclination and its landed rows equal GLONASS's to 0.01 m in every share: Etalon
is read from the landed rows and not flown again (its families are GLONASS's). Order of flight: e 0.001 every regime, then 0.1, 0.2,
0.01, 0.05; at most 4 shards, cells by position; a cell not reached is "unmeasured", never filled.

## The resonant families, named before any row
A Kaula term (l, m, p, q), j = l - 2p + q, has the frequency f = |j n - m theta| cycles per day (n the fitted mean motion, theta
1.00273781 rev/day; the J2 rates of omega and Omega are below 0.3 % of n in these regimes and are neglected in the label, as the
all-regimes basis does). The half-day class is n near 2 theta; with the slip s = n - 2 theta (cycles per day, from the landed fitted n):
GPS -0.000297, Molniya +0.000304, GLONASS and Etalon +0.124784, Galileo -0.305357, GTO +0.394605.
1. The deep resonant families, the 2:1 class proper: (m, j) = (2, 1), (4, 2), (6, 3), (8, 4): f = j |s|. Periods of (2, 1): GPS 3370
   days, Molniya 3290, GLONASS / Etalon 8.0, Galileo 3.3, GTO 2.5. On the 6-day arc the registered basis keeps a line only at or above
   1.5 / 6 = 0.25 cycles per day: the (2, 1) and (4, 2) lines are resolvable in Galileo and GTO and fold into the trend (the "secular"
   share) in GPS, Molniya, GLONASS and Etalon, on every window this record flies. These families are the ones the class's rate terms
   integrate (below).
2. The even ladders, at k n for k = 1, 2, 3, 4 (the landed "mixed" groups): every (m, j) with m even and |j - m / 2| = k, that is the
   zonal member (0, k), the m-daily member (2k, 0), and the tesseral members (2, k + 1), (4, k + 2), (6, k + 3), (8, k + 4) and
   (2k + 2, 1), (2k + 4, 2), ...; adjacent members differ in frequency by |s|. They are separable by frequency only where |s| is at or
   above the window's 0.25 cycles per day: Galileo and GTO on the 6-day arc; never in GPS, Molniya (5000 days would be needed) or
   GLONASS and Etalon (12 days). In those four regimes the ladder is degenerate by construction and no window the record flies separates
   its members; the separation is made by the arm below, not by frequency. The members' orders in e at small e: the zonal (0, 2) is J2's
   2(M + omega) short-period, O(1); (0, 1) is O(e); (2, 2) at k = 1 is C22 / S22 with w = 2, q = 0, O(1); (4, 4) at k = 2 is C44 / S44
   with w = 4, q = 0, O(1); (2, 3) at k = 2 is O(e) (w = 2, q = 1); the members with |q| >= 2 are O(e^2) and above. The lunisolar
   short-period terms at k u also fall on the zonal member's frequency.
3. The odd ladders, at (k + 1/2) n: the m-odd terms (1, k + 1), (3, k + 2), (5, k + 3), (7, k + 4) and the m-dailies (2k + 1, 0). They hold
   no zonal member, are the landed "tesseral" share (GPS 3.007 cycles per day: (7, 5) = (5, 4) = (3, 3) = (1, 2)), carry the landed
   verdicts and the diagnosis's "set" path, and are not re-attributed here; they are listed so the mixed share is read beside them.

## The theory terms AP carries for the class (read from the pinned source)
- The class: res::band_of (src/resonance.inc lines 183 to 189): half-day for n in [0.0070007636, 0.0105011454] rad/min, 1.6 to 2.4
  rev/day: all six regimes (Galileo at the lower edge, GTO at the upper).
- The class's terms, kTerms_half_day (src/xp_hansen_series.inc line 72): 29 terms (l, m, p, q, k) of degree 2 to 5, orders 2 and 4,
  every one with k = j = m / 2: the deep families (2, 1) and (4, 2) and nothing else; integrated in the averaged rates by res::ap_terms
  and resonance_six at the current e and i (src/xp_theory.inc 1068 to 1077; G from the Maclaurin polynomial below kSeriesE 0.3,
  src/resonance.inc 253 to 270). The SGP4XP native flavor (the same 29 terms at the epoch e0, i0 by the library's functions, res_epoch)
  flies only when the AP tesseral selection is off (src/xp_theory.inc 1559 to 1566).
- The half-day tail (src/tesseral.inc 426 to 525: HalfDayCoef, half_day_terms, half_day_six): every even order m with k = m / 2, degrees
  6 to the tesseral cap (31 here, kShallowCap), F to third order in i and G to third order in e about the epoch by a shared
  eccentric-anomaly quadrature; applied in the rates when the class is 2 and the selection is 6 or more (src/xp_theory.inc 1074 to 1076,
  1500 to 1505). The deep families are therefore carried to degree 31 in the rates: (2, 1), (4, 2), ..., (30, 15).
- The averaged grid step for the class (src/xp_theory.inc 1168 to 1176): the smaller of two revolutions and a 32nd of the resonant
  angle's period 2 pi / |n - 2 omega_E|: two revolutions at GPS and Molniya, about 2.4 to 3.1 hours at Galileo and GTO.
- The even ladders' short-period members (k n, m > 0): the first-order table sp_terms (src/tesseral.inc 248 to 362), degree 2 to
  kSpCap 12, q in {-1, 0, 1}, at output time (src/xp_theory.inc 1279 to 1303). It drops the class's own terms and the tail's (weight_of,
  259 to 263: those are in the rates) and any term with |psi-dot| below kShallowBand n = 0.045 n (276 to 278); the members at k n have
  psi-dot about k n and are kept. G is linear about the epoch e (sp_g, 213 to 236; q = 0: 1 + c2 e^2 below e 0.03, the exact Hansen
  coefficient above; q = +-1: O(e)). Members with |q| >= 2 are not in the table. The m-daily members (2k, 0) are mdaily_terms, even
  degree to kMdailyCap 12, at output time (src/tesseral.inc 122 to 141, src/xp_theory.inc 1285 to 1287). The shallow set is built only
  outside a class (src/xp_theory.inc 1506); the grid of wide_grid_build only above kWideE 0.3 (src/tesseral.inc 42).
- The zonal member: SGP4XP's J2 to J5 short-periodics (SPEC 2) and the zonal tail in the rates only (src/tesseral.inc 528 to 536:
  no zonal short-period term above degree 5).
- The lunisolar terms on the same frequencies: the averaged degree 4 to 10 tail (src/xp_theory.inc 849 to 852, 1103) and the degree 2 to
  10 short-period terms by quadrature at the output time (905 to 912, applied at 1241 to 1246), on whenever a tesseral or zonal selection
  is active, in every arm below.

## How the degenerate group is separated (the arms; same frame, same estimator)
Per cell three series, each attributed with the exported attribute() exactly as the all-regimes record does (in-arc: the 6-day arc's
289 30-minute samples, blocks of one day, quadratic trend; forward: the day after the fit's end, 64 samples a revolution, blocks of one
revolution, no interval with 2 blocks):
- Arm F (full; the landed frame re-flown): reference FFM EGM96 degree and order 31 with DE440 Sun and Moon, module at caps 31 / 20,
  fitted to the arc and flown: E_F(t), the module's error in RTN. Its mixed share against the landed row's is a reproduction figure.
- Arm Z (no tesseral anywhere): reference FFM EGM96 degree 31, ORDER 0 (the harness's field [31, 0]: the FFM request's maxOrder, the
  module's $PCF MAXIMUM_ORDER) with the same Sun and Moon from the same initial state; module at caps 0 / 20 (MAXIMUM_TESSERAL_DEGREE 0:
  no AP tesseral path, the SGP4XP native class terms flying, which are the long-period deep families and touch the trend, not the k n
  lines): E_Z(t). Its content at k n is the m = 0 member's miss: the zonal short-period at SGP4XP's order together with the lunisolar
  short-period model, which this record cannot split further (both are m = 0 at k u).
- D(t) = E_F(t) - E_Z(t) at the same epochs (the two arcs sample the same times): by construction (AP_F - AP_Z) - (Ref_F - Ref_Z), the
  module's tesseral model less the reference's tesseral signal, so its content at every frequency is the m > 0 members' miss, to first
  order (the two fits' mean elements differ by what each absorbed; the J2 and lunisolar parts evaluated at those elements differ at
  second order; the fitted n and e of both arms are reported).
- S(t) = Ref_F - Ref_Z, the reference's own tesseral signal in RTN at Ref_F, attributed the same way: the k n groups of S are what the
  module has to model and |D| / |S| per group is the relative miss on the even ladders' tesseral members.
Shares read per cell and leg: whole = the mixed share of E_F; m0 = the share of E_Z over the groups labeled mixed; tes = the share of D
over the same groups; signal = the share of S over them; each with its jackknife interval where the leg has 3 blocks or more (in-arc),
"no interval" otherwise (forward). Per ladder k = 1 to 4 the group amplitudes of E_F, E_Z, D and S. The deep families: in Galileo and GTO
the kept in-arc group holding (2, 1), and the one holding (4, 2), in E_F: amplitude (the estimator intervals shares, not single groups;
stated as amplitude without interval); in GPS, Molniya, GLONASS and Etalon they are inside E_F's in-arc secular share, reported as such
with that share as their upper bound, "not separable from the trend on 6 days" (a frequency separation would need 12 days for
GLONASS / Etalon and 5000 for GPS / Molniya, and the fit absorbs a 6-day trend in any case).

Reading rule per cell (in-arc leg decides; written before the rows): "m = 0 member dominant" when the upper bound of tes is below the
lower bound of m0; "tesseral members dominant" when the upper bound of m0 is below the lower bound of tes; else "shared (intervals
overlap)"; "withheld (estimator)" when any of the three attributions is not conditioned. The forward leg is reported beside it without
deciding (2 blocks, no interval).

## The reference-side check (the miss is the module's, not the reference's)
The landed convergence figures (the 1e-13 / 150 s reference against the 1e-12 / 300 s one, maximum over the forward day) at e 0.001:
GPS 1.4e-5 m, Galileo 7.4e-6 m, GLONASS 1.3e-6 m, Etalon 1.5e-5 m, Molniya 6.7e-6 m, GTO 4.0e-5 m: five to six orders below the shares.
Here the arm Z reference is checked the same way at e 0.001 per regime (its 1e-13 / 150 s arm; maximum position difference over the
forward day), reported per regime; and S itself is the reference's resonant signal, reported so the miss is read against the signal.

## What a fix would need (registered predictions; the rows confirm or refute)
P1. If m0 carries the whole (tes small against it), the landed "mixed (2:1 resonant)" share is not a miss of the resonant theory
    (resonance.inc, the half-day tail) but of the m = 0 member: SGP4XP's J2 short-periodics at their order and / or the lunisolar
    short-period quadrature (SPEC 16.8). A fix is then outside the tesseral model: no new resonant terms, no grid, no catalog cost of a
    grid; a module record would target the zonal second-order short-periodics or the lunisolar short-period terms, told apart by a
    further arm (a reference without the Sun and Moon is not available to the module, Amendment 1 of the all-regimes record, so that
    split needs its own method).
P2. If tes carries it: the slope of tes against e names the member: a flat slope points at the O(1) members (2, 2), (4, 4) and the
    m-dailies as the first-order table carries them (G linear about the epoch e, F at the epoch i); a slope near 2 points at the
    |q| >= 2 members the table omits; the fix would be those terms in the table (q in {-2 .. 2}: the per-object table grows from
    l (l + 1) x 3 to x 5 entries to degree 12, at most 1,090 SpCoef of 20 bytes, about 22 KB per object, no grid) or the grid below
    0.3 for the class (the switch-by-class record; 3.1 MB per grid).
P3. The deep families: Galileo's and GTO's (2, 1) and (4, 2) amplitudes in E_F against S's: at or below 1 m the class's rate terms and
    the tail are adequate on 6 days; for GPS, Molniya, GLONASS and Etalon the secular share of E_F bounds them from above and no finer
    statement is made.
Expectation written from the landed rows before flying (the rows decide): the 2 n group is e-independent in GPS (9.38 m at e 0.001,
9.74 at 0.01 in-arc), largest in Galileo (14.9 m) whose slip is a thousand times GPS's (a resonant amplification would go the other
way), and its Galileo / GPS ratio 1.59 is near the a^4 ratio 1.54 of the lunisolar short-period scaling; so P1 is expected for the 2 n
group at small e, P2 for the e-growing part.

## Amendment 1 (2026-11-06 13:05Z, this lane; committed before any row of the table)
First pass (23 flown cells, 5 Etalon reads; rows kept apart in results/ap-truth/half-day-resonance/first-pass-two-fits/rows-*.jsonl,
entering no table; first row 13:00:28Z, after the registration): the registered arm Z is not readable. Measured: E_Z's in-arc RMS 46 to
804 m with an unexplained share of 32 to 251 m; S's in-arc secular share 626 to 5,596 m; the mixed share's jackknife SE 11 to 76 m on
E_Z and 11 to 74 m on D; every cell read "shared (intervals overlap)"; E_Z's forward RMS 50 to 2,720 m. Arm F reproduced the landed
mixed shares to 0.00 m in-arc. The cause, read from the numbers and the source: a reference without tesserals lacks the class's resonant
drift (S's secular share is that drift, kilometers over 6 days), while the module at tesseral cap 0 still integrates the SGP4XP class
terms (src/xp_theory.inc 1559 to 1566), so the arm Z fit absorbs a drift the truth does not have into distorted elements, and the
series carry a long-period content the fixed estimator's trend does not hold. No estimator changes; the arms change, as follows.
1. No second fit. AP_F0 is the arm F fitted set flown by the module with MAXIMUM_TESSERAL_DEGREE 0 (the all-regimes A flight, ocm.mjs
   repackOcm) on the arc's and the forward day's epochs; Ref_Z is the zonal-only reference (EGM96 degree 31 order 0, Sun and Moon) from
   the same initial state, as registered. Series, inertial differences projected in RTN at Ref_F: E_F = AP_F - Ref_F (whole);
   T = AP_F - AP_F0 (the module's own tesseral content: its short-period tables and its class and tail rates less the SGP4XP class
   rates); M = AP_F0 - Ref_Z (the m = 0 member's miss: the zonal and lunisolar model at the fitted elements against the zonal-only
   truth, plus the class-rate drift against none); S = Ref_F - Ref_Z (the reference's tesseral signal); D = E_F - M = T - S (the
   tesseral members' miss). E_F = M + D exactly.
2. Legs. (a) The 6-day in-arc leg (289 samples, blocks of one day, quadratic trend) for E_F and T only, both free of the divergence
   (T's long-period content is the AP-less-SGP4XP class-rate difference, reported as its secular share). (b) The first-day leg for
   E_F, M, D, S and T: the arc's first 1.5 days (73 samples at 30 minutes, 3 revolutions in these regimes), blocks of one revolution
   (3 blocks: the registered interval), the estimator's trend for a window under 5 days (constant and linear); there the divergence is
   t^2-small (S's secular share over the window is reported as the measure) and its projection on a k n group is below 3 % of it at
   k = 1 and 1 % at k = 2 (the projection of t^2 on cos 2 pi f t over the window, arithmetic). Self-consistency: E_F's first-day k n
   groups against its 6-day ones, reported per cell. (c) The forward day as registered (2 blocks, no interval).
3. The reading rule is unchanged and read on the first-day leg (m0 = M's mixed share, tes = D's mixed share, intervals from the 3
   revolution blocks); the 6-day leg adds the module-side statement: T's k n group amplitudes beside E_F's.
4. --check adds: this amendment's commit precedes the first row of the table; the first-pass rows stay in their folder and enter no table.

## Outputs and check
`SDN_MODULES_ROOT=<root> node experiments/operator-theory/half-day-resonance.mjs --run [--shard k/n]` (at most 4) writes
results/ap-truth/half-day-resonance/rows-<shard>.jsonl: one row per cell with both arms' fitted elements, the four attributions in-arc and
forward, the ladder groups, the shares with intervals, the landed row's mixed shares (createdUtc and runner of the landed row), the arm Z
convergence figure where measured, the SHA-256 of both dists and of the runner, createdUtc. Etalon's rows are read from the landed rows and
marked so. `--table` writes table.json and README.md from the rows (per cell the families and shares, the reading, the deep families per
regime, P1 to P3 per regime). `--check` asserts that this registration's commit precedes the first row, that every row is on the two
pinned dists, that every flown cell carries the four attributions with the ladder groups and shares (intervals or "no interval" stated)
and a reading, that every Etalon row names the landed row it reads, that the table reproduces byte for byte, and exits 0 only then.
