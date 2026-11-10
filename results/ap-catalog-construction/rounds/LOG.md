# Rounds log (stack issue 312): exploratory

Exploratory results: twenty development rounds, on development data only, that produced the construction registered in
`experiments/ap-catalog-construction/PLAN.md`. Class-level and family-level figures only; per-set rows stayed on the machine.

Module `propagator/sdn-ap` 0.6.5 (`f0b8352a43f3`), weather forecaster `68cb063ab364`. The development runner (not committed; built on
`experiments/ap-from-public-sets/run.mjs` at `05ce6610`, whose registered files were not touched) is ported, for the arms it kept, to
`experiments/ap-catalog-construction/`. Head-to-head tables against the provider's XP sets were computed locally (statistics only); they
are left out here and await the owner's decision on publication (stack issue 288).

**Corrections after adversarial review 0 (2026-11-10), findings C4-1 to C4-5.**
- C4-1. The rounds' head to head has one set per satellite from one capture. Under 6 satellites (mid low orbit: 2; the two eccentric
  Galileo satellites: 2) no 95 % interval exists, and the inclined-geosynchronous figure's order-statistic interval spans 1. Only two
  statements stand: navigation satellites at MEO with a GNSS rapid orbit as input (105 satellites), and high low orbit from public sets
  (6 satellites of one day, all 6 closer). Their figures stay local with the tables.
- C4-2. "GEO" and "HEO" below are the plan's classes by orbit. In these data GEO is six to eight navigation satellites in inclined
  geosynchronous orbits (QZSS, BeiDou IGSO; no geostationary satellite), HEO is Galileo 5 and 6, and MEO is navigation satellites plus
  LAGEOS and Etalon. The largest gains (rounds 1 to 3) are mostly the input, a GNSS analysis-centre orbit, rather than the propagator.
  The dry run dev-H fits the XP theory to the same rapid-orbit states (`XPsame`) to separate the two; its figures stay local.
- C4-3. The rounds' head to head was scored from the provider's set epoch, an instant at which no user had that set. The registered
  protocol scores from the capture time (dry run dev-H of the registered runner on the same capture); from the capture time the
  public-set-only record at MEO is further behind the provider than the rounds' figure said. Both figures stay local.
- C4-4. Mid low orbit from public sets is about half the set's error over both development periods (0.51, 0.26 to 0.71; 10
  satellites, 17 weeks; the ratio by week ranges 0.28 to 0.86). The two-satellite head-to-head figure is not quoted anywhere.
- C4-5. The rows of rounds 4, 6, 7, 8, 13 and 14 were deleted for disk; they are regenerated from their variant files and the selection test over every variant is reported in the next revision of this log.

Periods by set epoch: A = 2026-09-05 to 10-28 (history from 08-15), B = 2026-06-01 to 08-10 (history from 06-01: the runner refuses any
set before 06-01, so B's first week has no history arm, unlike the registered run, which read sets back to 05-24). Truth: the registered
families (PLAN.md) with amendment A1's count. Ratios: the plan's paired ratio to the set on SGP4 (median of logs, 95 % interval from
resampling satellites, `lib.mjs`). "Served" is the record the catalog would serve; the registered rule is D5, else B3, else the set.

## Round 0: scoreboard and reproduction

**Source check.** Scout's `sources-quick.md` read. Archive listing, inputs the registered construction does not use: ESA ultra-rapid
GNSS (`reference-states/products/ESA0OPSULT_*`, 260 files, GPS + GLONASS, starts 2026-08-01 to 10-04, 4 a day; IGS0OPSULT 27 files,
GPS only, 09-08 to 09-14); ILRS CPF predictions for CryoSat-2, Sentinel-6A, Starlette, Swarm A (`hac/ilrs-edc/cpf_predicts_v2`, 2025-10-01
to 2026-10-09) and for 31 Galileo satellites (`release-archive/main-data-e4-cpf`, issued 09-09 to 09-15); WAAS MT9 GEO broadcast
(`hac/cddis-sbas/2026`, doy 241 to 307: period A only, and no GEO truth to score it against except itself); GFZ multi-GNSS rapid
(`hac/gfz-gnss-rapid`, doy 284 to 295, after the fact); SpaceMapper AOE element sets (`hac/spacemapper-aoe`, 10-11 to 11-10: period A's
last 18 days only); Metop-SG predicted orbits (no truth for Metop-SG); Planet ephemerides (no truth). The `operator-theory/vendors` store
holds result rows, not products. No raw operator ephemeris is kept (`operator-ephemerides` README).

**Reproduction (period B).** The runner selects the same 2,223 sets of 142 satellites as the registered part 1 (A1). For the 1,894 sets
with t0 on or after 06-09, whose 8-day look-back does not reach May, 1,887 rows are identical to the registered rows and 7 differ by at
most 1.7e-8 relative (floating point); the class table restricted to those sets is the same to every printed digit. The 214 sets of
06-01 to 06-08 lose their history arm here (the reserved-span refusal) and fall back to B3, which moves the full-period table by 0.01 to
0.02 (MEO 0.97 here against 0.96 registered, GEO 0.84 against 0.82, HIGH_LEO 0.29 against 0.28, MID_LEO 0.50 both).

**Scoreboard, round 0 (served = D5, else B3).** 72 h error, median km; ratio to the set on SGP4.

| Class | A: sats / sets | A: set km | A: served km | A: ratio | B: sats / sets | B: set km | B: served km | B: ratio |
| --- | --: | --: | --: | --- | --: | --: | --: | --- |
| LOW_LEO | 0 / 0 | | | | 1 / 23 | 1.611 | 1.555 | 0.87 FEW |
| MID_LEO | 8 / 40 | 0.685 | 0.527 | 0.65 (0.33-0.88) | 10 / 94 | 0.673 | 0.331 | 0.50 (0.20-0.75) |
| HIGH_LEO | 8 / 59 | 0.598 | 0.112 | 0.22 (0.18-0.49) | 14 / 284 | 0.592 | 0.136 | 0.29 (0.23-0.41) |
| MEO (navigation satellites, LAGEOS, Etalon) | 106 / 1330 | 1.233 | 1.200 | 0.97 (0.96-0.98) | 107 / 1557 | 1.250 | 1.201 | 0.97 (0.96-0.98) |
| GEO (navigation satellites, inclined geosynchronous) | 8 / 110 | 2.626 | 1.891 | 0.80 (0.72-0.95) | 8 / 100 | 2.777 | 2.248 | 0.84 (0.74-0.98) |
| HEO (Galileo 5 and 6) | 2 / 18 | 1.618 | 1.480 | 0.96 FEW | 2 / 28 | 1.720 | 1.640 | 0.95 FEW |

**Head to head against the provider's XP sets (capture of 2026-10-23).** Computed locally, statistics only; the tables exist locally
and await the owner's decision on publication.

**Diagnostic that steers the next rounds (period A, every 6th day per satellite, no fit).** The public set flown on SGP4, error by time
from its own epoch (median km): MEO 0.75 at -3 d, 0.95 at its epoch, 1.34 at +3 d; GEO 1.9 to 2.1 from -0.5 to +1 d, 3.0 at -4 d and
+3 d; MID_LEO 0.53 at the epoch, symmetric; HIGH_LEO flat 0.5 to 0.6. A public MEO set is best about three days BEFORE its epoch, so
the registered history (each set flown forward from its epoch) uses each MEO set where it is worst.

## Round 1: ESA ultra-rapid GNSS orbits for GPS and GLONASS (target: MEO)

**Source check.** Scout's `sources-quick.md` (ranks GNSS ultra-rapid second, "Galileo, BeiDou and QZSS are not yet fed"). Archive: the
260 ESA0OPSULT files in `reference-states/products` (GPS 32 + GLONASS 21 satellites each; starts 08-01 to 10-04). Converted once to
GCRF by the modules that made the truth (files/orbit-products, data-source/eop-parser on the IERS file of 10-09,
analysis/reference-states). Check: against ESA final truth at the same instants, 1 to 7 cm on the observed half, 6 to 9 cm on the
predicted half (4 satellites).

**Hypothesis.** Where an precise predicted orbit exists, AP fitted to it beats anything made from public sets.

**Change.** New served arm for MEO, `U2`: AP fitted to the newest ESA ultra-rapid file that could have been had at t0 (its start at
least 26 h before t0, the operator-theory VENDORS.md rule; at most 32 h), all 48 h of it (24 h solved, 24 h predicted), plus the solved
first 24 h of the two files started 1 and 2 days earlier: a 4-day arc at 300 s ending 16 to 22 h after t0. Record epoch at the last
state. Served rule MEO: U2, else D5, else B3. Also tried: `U0` (the newest file alone) and `U4` (4 earlier days).

**Before and after (period A; paired on the 392 GPS/GLONASS sets of 53 satellites where the file exists).** 72 h median: set 1.364 km,
D5 1.344, U0 0.0237, **U2 0.0149** (GPS 0.019, GLONASS 0.011), U4 0.0210. Ratio to the set: U2 0.011 (0.01 to 0.01). By day: 0.007,
0.014 (72 h), 0.021 day 3, 0.031 day 5, 0.049 day 7 (km, on the day's own sets). AP's fit residual to the file 6.3 m median.
Class MEO, served: 0.97 (0.96-0.98) -> 0.90 (0.86-0.92), 1.200 -> 0.758 km (414 of 1,330 MEO sets get a file; the rest are Galileo,
BeiDou, LAGEOS, Etalon or after 10-04).

**Period B.** Not testable: the archive's ultra-rapid files start 08-01, and the ESA final truth of period B ends about 08-02, so no B
set has both. No B class changes (the arm does not exist there).

**Decision: KEPT, confirmed on period A only.** The plan's rule asks for both periods; B cannot carry this source at all, and no B
class moves. The effect is 70 times, with a tight interval, on 53 satellites. Plainly: this one rests on period A. For the registered
confirmation (sets of 2026-03 to 05) the archive holds no ultra-rapid file, so the source needs a back-fill (needs-collection.md).

## Round 2: ILRS CPF predictions (targets: Galileo at MEO, and the low satellites that have them)

**Source check.** Scout's list ranks ILRS CPF sixth (133 targets at EDC on 11-08, about 77 GNSS). Archive: EDC copies for CryoSat-2
(ESA), Sentinel-6A (EUMETSAT), Starlette (several centres), Swarm A (ESA), 2025-10-01 to 2026-10-09; 31 Galileo targets issued 09-09 to
09-15 (`release-archive/main-data-e4-cpf`, with the retrieval time in the name). Read by data-source/cpf-source (`emit`), carried to GCRF
by analysis/reference-states.

**Hypothesis.** As round 1: a laser-ranging prediction issued before t0 is a far better input than the public sets.

**Change.** New served arm `P13`, every class: AP fitted to the newest CPF file produced at or before t0 (H1 production date and hour;
for Galileo also the archive's retrieval time), the file's states from t0 - 1 d to t0 + 3 d at 300 s, record epoch at the last state.
Served rule: P13, else U2, else D5, else B3. Also tried `P0x` (t0 to the file's end) and `P1x` (t0 - 1 d to the end): within 5 % of P13.
A file reaching into the reserved span (issued 05-31) is not read (two B sets of 06-01 were refused by the runner, as designed).

**Before and after, paired on the sets that have a file.**

| Period | Satellites with a file | Sats / sets | Set km | D5 km | P13 km | P13 / set |
| --- | --- | --: | --: | --: | --: | --- |
| A | navigation (MEO) | 21 / 37 | 1.168 | 1.188 | 0.0105 | 0.009 (0.01-0.01) |
| A | low (MID_LEO and HIGH_LEO) | 2 / 15 | 0.648 | 0.175 | 0.0312 | 0.046 (0.034-0.049) |
| B | low (MID_LEO and HIGH_LEO) | 3 / 57 | 0.467 | 0.133 | 0.0184 | 0.041 (0.031-0.098) |

Served by class: A MID_LEO 0.65 -> 0.59, HIGH_LEO 0.22 -> 0.20, MEO 0.90 -> 0.88 (0.702 km); B MID_LEO 0.50 -> 0.41, HIGH_LEO 0.29 ->
0.26. No class worse. The one satellite with a file and no truth family is not scored.

**Decision: KEPT.** Improves its targets on both periods (the low satellites in A and B; the navigation satellites in A, where their
files are). The class figures move little because only 4 low satellites have files in the archive; the scout's listing of the ILRS
archive has about 15 at 750 to 2,000 km and 6 at 500 to 750 km (needs-collection.md).

## Round 3: GFZ rapid multi-GNSS orbits, issued before t0 (targets: MEO, GEO and HEO)

**Source check.** Scout's `sources.md` (full version now there) lists GFZ rapid only as GEO truth. Archive: `hac/gfz-gnss-rapid`
holds 12 GFZ0MGXRAP files (days 2026-10-11 to 10-22; 115 to 117 satellites each: GPS, GLONASS, Galileo, BeiDou incl. IGSO, QZSS),
each with the CDDIS Last-Modified time in its provenance (12 to 38 h after the day's end). After the fact, but issued before many
t0: an input. Converted to GCRF by the same modules; against ESA final truth 0.5 to 1.3 m (the two products and their EOP files
differ; far below what matters here).

A first attempt at this round (public-set history flown backward, see round 8) was stopped after 163 rows: too slow to explore on the
full period, and its early signal was 2 %.

**Hypothesis.** A precise orbit that ends a day or two before t0 still beats the public sets by an order of magnitude after AP
carries it 4 to 5 days.

**Change.** New served arm `R3`: AP fitted to the newest 3 daily rapid files whose Last-Modified is at or before t0 (newest file
ending at most 3 days before t0), 300 s, record epoch at the last state. Served rule: P13, else U2, else R3, else D5, else B3.
Tried `R1` (1 day) and `R5` (5 days): worse than R3. `R3T` (tesseral terms kept on up to e 0.2 for the quasi-zenith orbits at e 0.075
and the two eccentric navigation satellites): GEO 0.058 against 0.054 km, HEO 0.067 against 0.079 (4 sets); not taken. `T5` (the same for D5 on public sets): identical to D5
(1.9006 against 1.9007 km on 107 GEO sets): the tesseral switch is not what holds GEO back on public sets.

**Before and after (period A, paired on the sets with rapid files, t0 10-12 to 10-26).**

| Class | Sats / sets | Set km | D5 km | R3 km | R3 / set | R3 by day 1 / 3 / 5 / 7 (km) |
| --- | --: | --: | --: | --: | --- | --- |
| MEO (navigation satellites, LAGEOS, Etalon) | 96 / 305 | 1.265 | 1.239 | 0.0341 | 0.028 (0.02-0.04) | 0.021 / 0.047 / 0.084 / 0.128 |
| GEO (QZSS, BeiDou IGSO) | 7 / 23 | 2.185 | 1.219 | 0.0544 | 0.026 (0.00-0.04) | 0.025 / 0.078 / 0.143 / 0.258 |
| HEO (two navigation satellites, e 0.16) | 2 / 4 | 1.901 | 1.924 | 0.0790 | 0.049 | 0.056 / 0.103 / 0.173 / 0.299 |

**Head to head.** This was the first round whose input reached the October provider capture; the table exists locally and awaits the
owner's decision on publication.

**Period B.** No rapid file in the archive for June to August: the arm does not exist there; no B class moves.

**Decision: KEPT, confirmed on period A only** (same reason as round 1). Served ratio to the set on A: MEO 0.88 -> 0.07 (0.702 ->
0.058 km: with U2, R3 and P13 more than half of A's MEO sets now have an orbit-product input (CPF prediction, GNSS ultra-rapid or rapid orbit)), GEO 0.80 -> 0.73 (1.891 -> 1.538 km),
HEO 0.86 -> 0.11 (FEW).

**Fit-parameter finding that sets up round 4.** AGOM (radiation area-to-mass) fitted to precise inputs is tight: MEO median 0.023
m2/kg (p10 0.016, p90 0.031), GEO 0.021 (0.021 to 0.024). Fitted to public-set flights it is not: D5 median 0.019 with p10 at 0, B3
median exactly 0. SGP4 has no radiation pressure, so its flights carry none, and the fit cannot find it.

## Round 4: a radiation-pressure prior for public-set fits (target: MEO and GEO without a precise input)

**Source check.** Nothing new in the scout's files since round 3. Archive: the Vimpel GEO/HEO orbits (`vimpel-e3/`, 09-07, 09-21,
10-12) are for debris with no truth; TerraSAR-X RSO (`hac/gfz-isdc-rso/RSO/L13`, to 07-13) is truth, not an input. Nothing usable.

**Hypothesis.** Round 3's finding: public-set fits leave AGOM near 0 because SGP4 flights carry no radiation pressure. A prior at the
value precise fits find (0.023 m2/kg for navigation satellites) would put the force back and improve the extrapolation.

**Change.** `D5S`: D5 with FIT.SRP_PRIOR log-normal, median 0.023 m2/kg, sigma of the log 0.25. Also `D5G` (Gaussian, 0.023 +- 0.005)
and `B3S` (B3 with the log-normal prior). MEO, GEO, HEO; period A.

**Result (period A, paired on 1,258 MEO, 107 GEO, 16 HEO sets).** D5S / D5: MEO 0.999, GEO 0.999, HEO 1.001 at 72 h; 0.996 on day 7
for MEO. D5G: 1.000. B3S / B3: 0.998 MEO. The fitted AGOM moves to the prior; the trajectory barely moves: over 8 days the elements
absorb what the radiation term would do.

**Decision: DROPPED** (no effect; not run on B). Rows deleted, aggregates kept here.

### Decision rule from round 5 on (public-set changes)

A median of ratios to the set is not additive: a change that beats the old record on most sets can still move the class's served
ratio by a hundredth either way. So a change is kept when (1) its paired ratio to the old served record (lib.mjs statistic, on the
sets where both exist) is below 1 on both periods, (2) the interval of that ratio pooled over A and B (each period's satellites resampled
as separate units) lies below 1, and (3) no class's served ratio to the set worsens by more than 0.02 on
either period. Rounds 1 to 3 (inputs that exist on A only) are marked as such.

## Round 5: forecast span by class, GEO and HEO (target: GEO, the weakest class against the set after MEO's public-only sets)

**Source check.** Nothing new from the scout. Archive: SpaceMapper AOE element sets are stored as rendered pages (`orbits-KY/*.html.gz`,
records in the page state), cover 10-11 to 11-10 only (none in B), no licence; a second SGP4-type source of the same order of error.
Not used; noted.

**Hypothesis.** The round-0 diagnostic: a GEO-class public set holds its error near 2 km from -0.5 to +1 d and grows slowly; the
registered 3-day forecast stops too early for a 72 h score that weighs days 2 and 3.

**Change.** GEO and HEO serve `H5F5` (5 days of history as D5, 5 days of the current set's forecast, one fit) in D5's place. Grid run
on A for every class (`H3F3`, `H8F3`, `H5F1`, `H5F2`, `H5F5`, `H8F5`, `H5F7`), the promising ones on B.

**Rows (paired ratio to D5; pooled interval).** GEO: A 0.892 (0.852-1.000), B 0.952 (0.879-1.009), pooled **0.917 (0.869-0.999)**.
HEO: A 0.863, B 0.918, pooled 0.908 (0.863-0.923) (2 satellites). MEO, same change: A 0.989, B 0.972, pooled 0.981 (0.959-1.003):
not taken for MEO. Longer still (`H5F7`) is worse for GEO on B (1.13). Served ratio to the set: GEO A 0.73 -> 0.71, B 0.84 -> 0.85;
HEO A 0.11 (served mostly R3), B 0.95 -> 0.86. No other class moves.

**Decision: KEPT for GEO and HEO.**

## Round 6: history length, HIGH_LEO (750 to 2,000 km)

**Source check.** As round 5 (same session): nothing new.

**Hypothesis.** From the grid of round 5: in HIGH_LEO, where drag is weak and SGP4's error is flat (0.5 to 0.6 km from -5 d to +3 d),
more history averages more sets.

**Change.** HIGH_LEO serves `H8F3` (8 days of history, 3 of forecast) in D5's place (D5 when H8F3 refuses: 4 of 248 B sets had fit
failures or implausible fits on the 11-day arc).

**Rows.** Paired H8F3 / D5: A 0.933 (0.911-0.949), B 0.948 (0.926-0.972), pooled **0.947 (0.928-0.963)**. Served ratio to the set:
A 0.20 -> 0.19, B 0.26 -> 0.26 (0.129 -> 0.125 km). MID_LEO with the same change: pooled 0.992: not taken.

**Decision: KEPT for HIGH_LEO.**

## Round 7: forecast span, MID_LEO (500 to 750 km)

**Source check.** As round 5.

**Hypothesis.** Drag makes a MID_LEO set's forecast degrade fast (round 0: 0.53 km at the epoch, 1.2 at +3 d); a 2-day forecast
should weigh the good part.

**Change.** MID_LEO serves `H5F2` in D5's place.

**Rows.** Paired H5F2 / D5: A 0.967 (0.857-1.073), B 0.924 (0.873-1.025), pooled 0.938 (0.889-1.029). Served ratio to the set: A
0.59 -> 0.60, B 0.41 -> 0.40.

**Decision: DROPPED** (the pooled interval spans 1; 10 satellites, several with maneuvers).

## Round 8: MEO history flown where each set is good, backward from its epoch (target: MEO on public sets, ratio 0.97)

**Source check.** Nothing new from the scout. Archive: nothing that covers period B's navigation satellites (no ultra-rapid,
rapid or CPF product of June to August; noted for collection).

**Hypothesis.** Round 0's diagnostic: a MEO public set is best about 3 days before its epoch (0.75 km) and worst after it (1.34 km
at +3 d). The registered history flies each set forward from its epoch, where it is worst. Fly every set of the window backward over
the days before its epoch instead, interleaved (each set on its own offset grid, so no instant is flown twice and no positions are
averaged), and keep the current set's forecast.

**Change.** MEO serves `K10` in D5's place: every set with epoch in the 8 days before t0, the current one included, flown over
[its epoch - 6 d, its epoch] inside [t0 - 8 d, t0), each at 3,600 s on a grid offset by its rank; plus the current set's flight over
[t0, t0 + 5 d] at 300 s; one fit, record epoch at the first state. Exists when the history holds at least 80 % of an 8-day grid at
3,600 s and the window holds 3 sets.

**Rows (half of A first, then all of A and B).** On half of A: backward history with the 3-day forecast `K1` 0.986, `K7` (1,800 s)
0.984; with 5 days `K8` 0.943; the mean of the last three forecasts `M3` 1.000; a denser forecast `D5d` (150 s) 0.997; forward history
with 5 days `H5F5` 1.002. Full: K8 / D5 pooled 0.930 (0.914-0.950); **K10 / D5 A 0.926 (0.893-0.962), B 0.910 (0.883-0.946),
pooled 0.918 (0.895-0.945)**; K10 / K8 pooled 0.991 (0.986-0.997). Served MEO ratio to the set: B 0.97 (0.96-0.98) -> **0.88
(0.86-0.91)**, 1.201 -> 1.126 km; A 0.07 -> 0.07 (most A sets are on a precise input; 0.0584 -> 0.0569 km). No other class served
differently.

**Decision: KEPT for MEO.** Exploration rows (K1, K7, M3, D5d) deleted.

Rounds 9 to 11 test round 8's idea in the other classes, one class and one change per round; they were computed in one run (both
periods), and each decision stands on its own rows.

## Round 9: GEO history flown backward (target: GEO, now 0.71 on A and 0.85 on B)

**Source check.** Nothing new from the scout. Archive: no GEO-class input covers June to August (the rapid files are October only).

**Hypothesis.** GEO-class sets (QZSS, BeiDou IGSO) are best from -0.5 to +1 d; flying the window's sets either around their epochs
(`KG5`: each over [epoch - 1.5 d, epoch + 1.5 d], 5 days, 1,800 s) or backward over 6 days as MEO does (`KG8`) should beat the
forward-flown history of H5F5.

**Change.** GEO serves `KG8` in H5F5's place: K10's history (8 days, each set over [epoch - 6 d, epoch], 3,600 s, interleaved) and a
5-day forecast.

**Rows.** KG8 / H5F5: A 0.935 (0.900-0.981), B 0.912 (0.744-1.002), pooled **0.928 (0.859-0.983)**. KG5 / H5F5: pooled 0.994
(0.945-1.006). HEO with KG8: pooled 0.979 (0.942-1.022), not taken. Served GEO ratio to the set: A 0.71 -> **0.61 (0.47-0.78)**,
1.526 -> 1.261 km; B 0.85 -> **0.74 (0.60-0.87)**, 2.311 -> 2.087 km.

**Decision: KEPT for GEO** (HEO stays on H5F5).

## Round 10: HIGH_LEO history interleaved around each set's epoch

**Source check.** As round 9.

**Hypothesis.** At 750 to 2,000 km a set's error is flat; flying every set of 8 days around its own epoch ([epoch - 1 d, epoch + 1 d],
1,800 s, interleaved; about 24 sets) averages their independent parts better than the piecewise history of H8F3.

**Change.** HIGH_LEO serves `KH8` (that history, 3-day forecast) in H8F3's place.

**Rows.** KH8 / H8F3: A 0.947 (0.932-0.954), B 0.969 (0.953-0.984), pooled **0.962 (0.950-0.979)**. Served HIGH_LEO ratio: A 0.19
-> 0.18 (0.110 -> 0.106 km), B 0.26 -> 0.24 (0.125 -> 0.117 km).

**Decision: KEPT for HIGH_LEO.**

## Round 11: MID_LEO history interleaved around each set's epoch

**Source check.** As round 9.

**Hypothesis.** Round 7 failed on the forecast span; at 500 to 750 km a set is best at its epoch and degrades both ways within a day
(drag), so a history of every set flown only half a day either side of its epoch should help where the piecewise history does not.

**Change.** MID_LEO serves `KM5` (5 days of sets, each over [epoch - 0.5 d, epoch + 0.5 d], 900 s, interleaved; 3-day forecast) in
D5's place. LOW_LEO (one satellite, B only): KM5 / D5 0.992, not taken.

**Rows.** KM5 / D5: A 0.940 (0.933-0.993), B 0.946 (0.909-0.980), pooled **0.945 (0.919-0.978)**. Served MID_LEO ratio: A 0.59 ->
0.55 (0.435 -> 0.393 km), B 0.41 -> 0.39 (0.262 -> 0.253 km).

**Decision: KEPT for MID_LEO.**

## Round 12: drop history across a maneuver (target: GEO, whose QZSS and BeiDou IGSO satellites keep station)

**Source check.** Nothing new from the scout. Archive: no maneuver history for these satellites (the only maneuver file is Metop-SG's
AUX_MHF, a satellite without truth).

**Hypothesis.** A long history (8 days for KG8) crosses station-keeping burns; history from before a burn pulls the fit off. A burn
shows as a jump between consecutive public sets.

**Change.** A jump: the earlier set's SGP4 position at the later set's epoch farther than a class threshold from the later set's own
position (no truth). Thresholds from the jump percentiles of both periods (p95 / p99 in km: GEO 2.6 / 20 to 29,
MEO 1.4-1.8 / 4.2-5.3, MID_LEO 0.6 / 1.6, HIGH_LEO 0.3-0.4 / 0.7): GEO 10 km, MEO 8, MID_LEO 3, HIGH_LEO 2. The history keeps only the
sets from the last jump on; with fewer than 3 left the history arm does not exist and the class serves B3 (not the uncut fallbacks).
GEO serves `KG8c`, else B3.

**Rows (paired on the sets the cut changes).** GEO: A 19 sets, cut / old 0.594 (0.303-0.683); B 23 sets, 0.889 (0.215-0.924). MEO: A 30
sets 0.990 (0.924-1.000), B 110 sets 1.000: not taken. HIGH_LEO, MID_LEO: 1.000 (no jump above the threshold changes a fit). Served
GEO ratio to the set: A 0.61 -> **0.56 (0.41-0.76)**, 1.261 -> 0.999 km, closer 86 % -> 94 %; B 0.74 -> **0.72 (0.53-0.87)**, 2.087 ->
1.438 km, closer 83 % -> 94 %.

**Decision: KEPT for GEO** (served chain: precise inputs, KG8c, B3).

## Round 13: where the record's epoch sits (fit setting)

**Source check.** Nothing new from the scout (its `sources.md` unchanged since round 3). Archive: listing unchanged.

**Hypothesis.** The kept constructions put the record's epoch at the first fitted state, 8 days before t0 for MEO and GEO; an epoch
at the middle (`sdnap_fit_epoch_diagnostic(1)`) or the last state might condition the fit better for the forecast.

**Change.** Placement 1 (middle) for K10, KG8, KH8, KM5; placement 2 (last) for K10.

**Rows.** Paired to the same construction at placement 0: 1.000 (1.000-1.000) for every class on both periods (HIGH_LEO 0.999 on B,
1.001 on A).

**Decision: DROPPED** (no effect: the fit converges to the same trajectory). Rows deleted.

## Round 14: forecast span, HEO (two navigation satellites, e 0.16)

**Source check.** Scout files unchanged since 09:10; no new archive folder or product since round 0 (listing of `hac/` and
`reference-states/products` by date).

**Hypothesis.** Round 5's grid had HEO improving steadily with forecast length (H5F7 / D5 0.72 on A).

**Change.** HEO serves `H5F7` (5 days of history, 7 days of forecast) in H5F5's place. No new run: both are in round 5's rows.

**Rows.** H5F7 / H5F5: A 0.844 (0.835-0.889), B 0.952 (0.926-0.991), pooled 0.934 (0.844-0.979). Served HEO ratio: A 0.11 -> 0.11
(mostly precise inputs), B 0.86 -> **0.78 (0.77-0.82)**. GEO with the same change: pooled 1.137 (worse), not taken.

**Decision: KEPT for HEO.** Plainly: two satellites, so the interval is resampling two units per period and means little; the class
stays FEW under the plan.

## Round 15: choose the served record per set without truth (back-check), MEO

**Source check.** Scout files unchanged; archive unchanged.

**Hypothesis.** Which construction wins varies by satellite and week. A truth-free signal: build each candidate at the previous public
set (at least 12 h before t0, from what was out then), fly it over t0 +- 6 h, and compare with the current set's own SGP4 flight there;
serve the candidate with the smallest difference.

**Change.** MEO candidates K10, K8, D5, B3 (`dev.mjs --select`, `board.mjs` rule `backcheck`); also the pair K10, D5.

**Rows (period A, 1,303 sets).** Picks: B3 699, D5 363, K10 146, K8 135. Served / K10: **1.037 (1.006-1.069)** (worse); with the pair
K10, D5: 1.000. The back-check rewards whichever candidate tracks the newest set over half a day, which is B3, and that is not what
predicts best over three days.

**Decision: DROPPED on A** (period B's run was stopped once A had decided it; rows deleted).

Rounds 16 to 19 tune the kept constructions, one class and one parameter each, from one run (both periods).

## Round 16: MEO history length, 8 -> 12 days

**Source check.** Scout files unchanged; archive unchanged.

**Hypothesis.** MEO sets come about once a day; a longer backward-flown history averages more of them.

**Change.** MEO serves `K12` (12 days; each set over [epoch - 8 d, epoch]; 3,600 s; 5-day forecast) in K10's place, K10 behind it.
Also tried: K10 with a 7-day forecast (`K10f7`).

**Rows.** K12 / K10: A 0.989 (0.987-0.991), B 0.987 (0.984-0.989), pooled **0.988 (0.986-0.989)**. K10f7 / K10 pooled 0.985
(0.962-1.007): not taken. Served MEO ratio: B 0.88 -> **0.86 (0.84-0.90)**, 1.126 -> 1.112 km; A 0.07 unchanged.

**Decision: KEPT for MEO** (a 1 % gain, but on 2,700 sets and inside a tight interval).

## Round 17: GEO forecast span with the kept history (KG8c)

**Hypothesis.** With the backward history and the maneuver cut, the best forecast span may have moved from 5 days.

**Change tried.** 3 days (`KG8c3`) and 7 days (`KG8c7`).

**Rows.** KG8c3 / KG8c pooled 1.147 (1.087-1.289); KG8c7 / KG8c pooled 1.188 (0.978-1.404). Both worse.

**Decision: DROPPED** (5 days stays).

## Round 18: MID_LEO maneuver cut at 1.5 km

**Hypothesis.** Round 12's cut at 3 km changed no MID_LEO fit; the jump percentiles (p99 1.6 to 1.7 km) say real maneuvers at 500 to
750 km (Sentinel-1, COSMIC-2) sit lower.

**Change tried.** `KM5c`: KM5 with history cut at a 1.5 km jump; B3 when fewer than 3 sets remain.

**Rows.** On the sets the cut changes: A 6 sets 0.720 (0.305-0.761), B 16 sets 0.815 (0.396-1.069), pooled 22 sets 0.762
(0.396-0.991). But the class: served MID_LEO ratio A 0.55 -> 0.52 (0.393 -> 0.352 km), B **0.39 -> 0.41** (0.253 -> 0.282 km): on B
twice as many sets fall back to B3 (7 -> 15) and the class median gets worse.

**Decision: DROPPED** (the class-level guard; a rule that falls back to the uncut history instead of B3 is the next thing to try).

## Round 19: HIGH_LEO history length, 8 -> 12 days

**Change tried.** `KH12` (KH8's history over 12 days).

**Rows.** KH12 / KH8: A 0.978 (0.947-1.008), B 0.994 (0.952-1.001), pooled 0.990 (0.955-1.000).

**Decision: DROPPED** (the pooled interval reaches 1). KM8 for MID_LEO (8 days) likewise: pooled 0.993 (0.940-1.027).

## Round 20: the final construction, end to end

**Source check.** Scout files unchanged since 09:10; archive listing unchanged (newest products in `reference-states/products` are
truth for after 10-28). Nothing new to try; the gaps are in needs-collection.md.

**Change.** None to the arms. The kept rounds assembled into one served rule (`final-construction.json`) and run once more, also
in the head to head with every arm it needs, and in an information-matched variant (everything out at the capture time).

**Rows.** Full tables in `scoreboard.md`. Served ratio to the set, round 0 -> final:

| Class | A | B |
| --- | --- | --- |
| MID_LEO | 0.65 -> 0.55 | 0.50 -> 0.39 |
| HIGH_LEO | 0.22 -> 0.18 | 0.29 -> 0.24 |
| MEO (navigation satellites, LAGEOS, Etalon) | 0.97 -> 0.07 (public sets only 0.89) | 0.97 -> 0.86 |
| GEO (navigation satellites, inclined geosynchronous) | 0.80 -> 0.56 (public only 0.63) | 0.84 -> 0.72 |
| HEO (FEW) | 0.96 -> 0.11 (public only 0.81) | 0.95 -> 0.78 |
| LOW_LEO (FEW) | no set | 0.87 -> 0.87 |

The head-to-head tables (round 0 and final, with and without orbit-product inputs (CPF predictions, GNSS ultra-rapid and rapid orbits), and information matched) exist locally and await
the owner's decision on publication.

**Decision.** The construction stands as written in `final-construction.json`, registered as `experiments/ap-catalog-construction`.

## Summary of the 20 rounds

Kept: 1 (ultra-rapid GNSS, A only), 2 (CPF), 3 (rapid GNSS, A only), 5 (GEO/HEO 5-day forecast, later superseded for GEO), 6 (HIGH_LEO
8-day history, now behind KH8), 8 (MEO backward-flown history), 9 (GEO backward-flown history), 10 (HIGH_LEO interleaved history), 11
(MID_LEO interleaved history), 12 (GEO maneuver cut), 14 (HEO 7-day forecast), 16 (MEO 12-day history). Dropped: 4, 7, 13, 15, 17, 18, 19.
Round 0 is the scoreboard; round 20 the assembly.
