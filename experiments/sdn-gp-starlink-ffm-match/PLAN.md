# G1: how close do analytic element sets get to FFM-propagated Starlink and to precise orbits

Registered 2026-10-23 (task experiments-sdn-gp-starlink-ffm-match-20261023); frozen by the
first commit of this plan and config.json. Owner, verbatim: "we want something that's going
to match the FFM propagated starlink as close as possible, and also do other cool math shit";
"I want to be able to improve it and be able to roll in our version of dynamically calibrated
atmosphere"; "stuff for satellites in every orbital regime even cislunar in there, and
interplanetary". The SDN-GP propagator (modules-sdn-gp-propagator-20261023) is built from
what this experiment measures. This run is phases 1-2: the truth sets and the two baselines.

Clean room (side B): SGP4-XP runs only as a black box, through the modules `propagator/sgp4-xp`
methods `propagate` and `fit`. Nothing else of that library is read.

## Questions

1. Q1. How far from FFM-propagated Starlink (fit RMS, held-out day 1-3 RMS, radial / in-track /
   cross-track split) are SGP4 (`analysis/gp-error-model fit_elements`) and SGP4-XP
   (`propagator/sgp4-xp fit`), by shell and by drag stratum?
2. Q2. The same on precise orbits: GNSS (ESA final SP3), laser-ranged high and low (ILRS), the ISS.
3. Q3. Which RIC component carries the error, so which theory term can buy the most?
4. Q4. Which truth exists, with which span, in every regime the owner named (inventory).

No threshold is tested; the tables are descriptive. A fit that does not converge is a result.

## Truth

**FFM-Starlink.** Population: 200 Starlinks from the 11,143 objects of the latest complete
operator-capture cycle (config.cycle). Strata: mean altitude band (<420, 420-475, 475-520, >=520 km
over the first 8 h) times inclination group (<48, <60, <85, >=85 degrees); seats by square-root
population weight divided by (seats+1), capped at population, lexical ties; inside a stratum,
drag-exposure terciles (-cumulativeDragWorkB1Jkg at 8 h) share seats equally, the remainder going
to the highest tercile; members are drawn in SHA-256(`g1-20261023:<NORAD>`) order. A seat whose
file is missing from the SpaceX manifest, or whose fit does not converge, is replaced by the next
member of the same stratum and tercile; every replacement is reported. Only operator-capture's
derived products are read to choose; they are not republished.

Start state: `analysis/od fit_ffm` (landed by modules-od-ffm-operator-fit-20261023) on the satellite's
current SpaceX MEME file, fetched into memory (serial requests at least 3.2 s apart), never written
to disk. Fit [start, start+48 h), strictly excluding the join; 600 s samples; 12 iterations;
Cr*A/m locked at 0.11 before NORAD 56000, 0.19 after; Cd*A/m seed 0.03; B_eff = (1-kappa)B
is the only drag unknown (kappa is not separated without a physical B prior). A segment cut by a
detected maneuver contributes its longest segment's state only if it covers at least 24 h.

Trajectory: FFM-1 (`propagator/ffm`), the catalog full-force profile of the fit (EGM2008 70x70,
Sun, Moon, Venus, Mars, Jupiter, SRP, drag with NRLMSISE-00 times exp(s), IERS solid tides,
relativity, FES2004 30x30 ocean tides, Knocke Earth radiation), RK78 1e-13, max step 120 s,
from the fitted state and B_eff, 60 s output over 96 h. The drag-makeup thrust is the fit's
kappa*D: B_eff already carries it. The density correction s(t) is the published $DCL record when
one exists for the epoch, otherwise the E13b calibration, otherwise the constant s = 0
(uncorrected NRLMSISE-00), and the table says which. At registration none is published
(the live $DCL starts about 2026-10-24 02:44Z), so s = 0.

SpaceX itself is also scored inside its forecast: the same fit window (24 h) against its own states and
day 1 only (24-48 h, before the join).

**Precise orbits.** Reuse the sgp4-xp measurement's sources: ESA/ESOC ESA0OPSFIN GNSS, ILRS
combined weekly (LAGEOS-1/2, Etalon-1/2), ILRS NSGF 4-day arcs (Ajisai, Starlette, Stella,
LARETS, WESTPAC, LARES, LARES-2), read from /opt/data/sdn-archive/reference-states as GCRF
states made by analysis/reference-states; and the ISS (NASA OEM). Same windows as that
measurement so the baselines are comparable with its published tables.

**Inventory.** For GEO, MEO, HEO, cislunar, lunar, interplanetary and small bodies: what
exists locally, with spans and counts, from the archive only. Nothing is fetched.

## Windows and arms

Fit interval 24 h from a state of the truth; epoch at the first state; held-out day k is
(E + (k-1) d, E + k d], E the end of the fit interval, k = 1, 2, 3 (day 0 is the fit). Held-out
days are counted only where the truth has at least 90 percent of that day's states.

1. SGP4: `fit_elements` (six mean elements and B*), epoch first, scored by `element_residuals`.
2. SGP4-XP: `fit` (six mean elements, BTERM, AGOM); held-out by the module's own
   HELD_OUT_DAYk_RMS_KM.
3. RIC split: both element sets propagated by their modules to the truth epochs; the error vector
   in radial / in-track / cross-track axes is gp-error-model `pair_statistics`.

## Statistics

Per regime (and for Starlink per shell and drag tercile): attempted, fitted, scored windows;
fit RMS and day-1/2/3 RMS (3D, km): median, mean, 90th percentile; RIC RMS split as the
median of the per-window component RMS; paired median ratio XP/SGP4 on windows both fitted;
fit time. Resampling: none in this run (descriptive).

## Boundaries

Physics runs in the modules; JavaScript selects records, calls modules and computes statistics.
Raw operator and Space-Track records are never written; committed results are aggregates and
manifests under results/sdn-gp-starlink-ffm-match/. Start-state and truth records stay local
under the archive (`/opt/data/sdn-archive/sdn-gp-starlink-ffm-match/`, derived only).

One E2E: `node experiments/sdn-gp-starlink-ffm-match/run.mjs --check` replays the frozen windows
from the local records and reproduces the committed tables; without the local records it reports
that visibly and does not pass.

## Amendments

None at registration.

### A1 - 2026-10-23, before any test window is read: the headline table

Owner (relayed by the coordinator), about COMSPOC's full-catalog XP sets: "yes, I want to beat
them". "Beat" is measured in every regime: SDN-GP must beat SGP4-XP at its best, which is
SGP4-XP fitted to the same precise truth on the same windows (arm 2). COMSPOC fits XP to its own
trajectories derived from public element sets, so on expectation it cannot beat XP fitted to
precise truth. The first table of the report has one row per regime: SDN-GP, best-case XP and
SGP4, scored on held-out day 1-3 RMS with the RIC split, fit RMS, and bytes and microseconds
per object. Bytes are the size-prefixed $OMM record the module returns for the set; microseconds are
the module-call time of one `propagate` per propagated state (V8 on a loaded machine) and the fit
time per object. The SDN-GP column stays empty until side B lands the module. No COMSPOC or
Spacebook data (sets, SynCoPate, API) is fetched or used (owner ruling 2026-10-12).

### A2 - 2026-10-23, after the first fits, before any table was read

1. Start states. The coordinator's same-day local capture of 40 SpaceX files
   (operator-ephemerides/daily/2026-10-23/starlink, 48 h, 60 s) is processed first: all 40 are members of the
   registered population, none is a registered seat. The registered seats follow round-robin over the strata, with
   the registered two spares per cell on failure. A fit costs 60-70 CPU seconds on a machine at load 80-100, so the
   truth set is what completed inside the 2-hour box; the report states the stratum coverage.
2. Weather. The space-weather module's rows end where its Kp forecast ends (2026-10-25). The truth runs 96 h, so days
   after the last row are appended from NOAA SWPC's 45-day forecast (daily Ap and F10.7; Kp, the 81-day average and
   the provenance held from the last module row). The extension is recorded in the environment file and the
   manifest. Density correction stays s = 0 (no $DCL is published).
3. RTN split. The held-out radial / in-track / cross-track split is taken on at most one state per 5 minutes; the 3D
   RMS of every day uses all states.
4. ISS. The NASA OEM of 2026-10-07 to 2026-10-22 (local copy) and the same-day file of 2026-10-23.
5. COMSPOC arm (owner "yes", 2026-10-23, relayed by the coordinator; it supersedes the last sentence of A1). The
   COMSPOC Spacebook XP sets and SynCoPate trajectories captured locally at 2026-10-23 20:09Z are scored: the sets are
   propagated through the black-box module and compared with same-day truth, the SynCoPate covariance is scored
   against the same truth. They are never fitted to, never an input or a prior, never copied into the repository; only
   aggregates are committed, labeled "COMSPOC Spacebook XP (local scoring only)". Terms: no commercial use, no
   redistribution, no derivative works.

### A3 - 2026-10-23, before the run, after the baselines were read: fit-length sensitivity (task arm 6)

"Best-case XP" is XP fitted to the same truth on the same windows. To say how much a longer fit would help either
theory, the FFM truth of every fitted Starlink is also fitted over 24, 48 and 72 h and scored on one common interval,
72 to 96 h after the truth start (day 3 of the 24 h fit, day 2 of the 48 h fit, day 1 of the 72 h fit). Same fitters,
same statistics; descriptive; reported beside the registered tables, which keep the 24 h fit.

### A4 - 2026-10-23, before any GEO window was read: a second precise-orbit set found in the archive

The inventory looked only under reference-states. E14's reference set, /opt/data/sdn-archive/e14-covariance-realism/reference,
holds the GFZ multi-GNSS rapid orbits (GFZ0MGXRAP, 5 min, GCRF states made by analysis/reference-states, 363 days from
2025-10-01) with the BeiDou-2 and QZSS-2 satellites in geostationary (names ending G) and inclined geosynchronous
(names ending I) orbits: the GEO truth the first inventory called missing. Added to arms 1-2: every GEO object and every
IGSO object of the first day's file, 20 consecutive days from 2025-10-01, fit 24 h every 48 h, the same statistics and
fitters. The registered sources are unchanged. The numbers are code constants of baselines.mjs (config.json stays frozen).

A3 addendum (same day, after the first rows): the common interval confounds the fit length with the lead behind the
fit end (48, 24 and 0 h). The first day after each fit is scored too, so a fixed lead tells the two apart. The
subset is the first 100 satellites in NORAD order (a cost limit: six fits each).

### A5 - 2026-10-23, second box, before any SPK window was read: spacecraft truth from NAIF

Coordinator, second box: fetch spacecraft SPKs from NAIF (paced, into hac/naif-kernels), build windows, score SGP4 and
SGP4-XP where they apply, record the rest as awaiting SDN-GP. NAIF does not host TESS, CAPSTONE, Artemis I or Danuri;
it does host, and the fetcher (`fetch-kernels.mjs`, the archive's provenance convention, 5 s apart) stored:
THEMIS A, D, E (Earth-orbiting, highly elliptical, 2013-02-08 to 2013-02-24), Chandra (highly elliptical, 64 h), Artemis II
(Orion, JSC best-estimated trajectory, 2026-04-02 to 04-10), LRO (lunar-centered, 2026-03-15 to 06-14), Psyche, Lucy and
Juno (heliocentric), and TDRSS (type 10, derived from two-line elements: not truth, not used). Substitutions are therefore
THEMIS and Chandra for TESS (HEO), Artemis II for Artemis I, and no Danuri or CAPSTONE.

States come from files/orbit-products `read_container` (SPK types 8, 9, 13), epochs from TDB to UTC by foundation/time
`convert_time`, one call each; the J2000 axes are labeled EME2000. Windows (HEO only, where Earth-centered SGP4 and
SGP4-XP apply): THEMIS A, D, E and Chandra (2018-03-01 to 2018-04-30, after the last leap second in the file's span), fit 24 h
(the registered length) and 72 h (the fit-length result), held-out days 1-3, one window every 48 h; Artemis II's first
segment (the high-Earth-orbit checkout before the translunar burn, 20.85 h) as one short arc: fit 8 h, held-out the
remaining 12.85 h scored as day 1 with a 40 percent coverage rule. Not scored, recorded as awaiting SDN-GP: Artemis II after
the burn (cislunar), LRO (lunar-centered), Psyche, Lucy and Juno (heliocentric; JPL navigation kernels are SPK type 1, which
files/orbit-products 0.1.4 cannot read). A GEO search of the archive found no operator ephemerides (operator-capture holds
Starlink only; SES, Intelsat, OneWeb and Kuiper exist as CelesTrak SupGP element sets, not as ephemerides).

### A6 - 2026-10-23, second box, before the refit was read: truth quality

Coordinator, second box: say whether the 52 fits at the B_eff = 0 bound and the 56 fits that hit the iteration limit bias the
FFM-Starlink truth. The registered tables keep the registered 12-iteration truth. Added: (a) the 56 fits that stopped at 12
iterations (all 56 were at the cap, none stalled) are refitted on the same SpaceX file (SHA-256 checked) with a cap of 30, same
method and settings, and the new truth is compared with the registered one (position difference at 24, 48, 72 and 96 h, B_eff,
fit RMS, and the SGP4 / SGP4-XP errors on the new truth); (b) the fit RMS against SpaceX over 0-48 h by group (converged or at
the cap; B_eff at the zero bound, between 0 and 0.5, above 0.5 m2/kg); (c) the headline row of the Starlink truth restricted to
the converged fits with 0 < B_eff <= 0.5 m2/kg ("clean"). The zero bound is a contract of the T1a module (net thrust is not
representable); it is reported there, not worked around here.

A6 addendum (same box, after the first refits were read): only 9 of the 56 cap-limited fits are same-day files that can be
refitted on the registered bytes; SpaceX's server had replaced the file of 43 of the 47 seats. For those seats the registered cap
(12) and the higher cap (30) are both run on the file served now (SHA-256 identical between the two runs) and the two truths are
compared. The fits of the registered run are not replaced. Also added in this box: `newer.mjs` (held out against the first hours
of newer SpaceX files, with the refitted truth scored beside the registered one, `--truth refit30`) and `comspoc-precise.mjs`
(COMSPOC XP sets of GNSS and laser-ranged objects, waiting for products dated after the set epochs).

### A7 - 2026-10-24, third box, before any window of it was read: M1 to M3 of DESIGN.md section 4 (the LEO fit floor)

Coordinator: test the design finding that the floor of the SGP4 and SGP4-XP fits in LEO is mostly omitted tesseral m-daily
gravity (J22 alone 454 m along-track on the 550 km shell), absorbed by the fitted drag, using FFM with full gravity against
zonal-only gravity on the same windows. Predictions fixed here, from DESIGN.md 2d.3 and 2e: the in-track fit floor of best-case XP
is about the RMS of the omitted m-daily set, 384 m (Starlink 550 km), 394 m (ISS), 110 m (LAGEOS-1); with zonal-only gravity the
floor falls to the remainder (about 0.2 km for Starlink); the fitted drag term carries gravity (BTERM far above the true B_eff);
a 21.7 h fit (a zero of j_2 for the J22 period) lowers the J22 share of the day-3 error.

Truths: FFM-1 (`propagator/ffm`, the registered environment, integrator, B_eff and Cr*A/m) re-propagated for 96 h at 60 s from
the registered start states, with the gravity of the field changed only by FFM's own truncation options:
`full` EGM2008 70x70; `zonal` order 0 (all zonals to degree 70); `tess2` zonals plus the tesseral and sectorial terms of degree
2 (the (2,1) and (2,2) terms; MAXIMUM_TESSERAL_DEGREE 2); `tess6` the same to degree 6 (the l <= 6 set of the design estimate);
`order14` order 14 (removes m >= 15, the 15:1 band). A single coefficient such as (2,2) cannot be removed by FFM's options; the
difference `tess2` minus `zonal` isolates degree 2. Populations: the 132 clean Starlinks (converged, 0 < B_eff <= 0.5 m2/kg) at
their registered start states; the ISS from the NASA OEM of 2026-10-21 (state at the file start and every 24 h for eight
windows; Cd*A/m = 0.95 x 1273.21 / 470200 m2/kg and no radiation, from the OEM's header); LAGEOS-1 and LAGEOS-2 from the first
state of eight weekly ILRS orbits each, re-dated to 2026-10-14 so that the registered Earth orientation covers them (drag
off, Cr*A/m = 7.9e-4 m2/kg; an orbit of LAGEOS' size and inclination, not LAGEOS on its date).

Statistics on every truth, by the same code as the registered tables: SGP4 and SGP4-XP fitted over 24 h and, for M2, over
21.7 h; fit RMS, its radial / in-track / cross-track split, held-out days 1-3; the fitted BTERM against the true B_eff (the
sphere has none); and for `tess2`, `tess6` and `order14` against `full`: the along-track difference series by
`pair_statistics`, its quadratic trend removed, and the amplitude and period of the best sinusoid between 8 and 16 h
(JavaScript least squares on module outputs). M3 as written (B fixed at each sphere's physical C_D A/m on the laser-ranged
LEO spheres) needs a fixed-BTERM option that `propagator/sgp4-xp fit` does not have and the spheres' masses and areas are not in
the archive; it is replaced by the BTERM-against-true-B_eff comparison above, which tests the same claim (the fitted drag carries
gravity) on truths whose B is known exactly.

### A7b - 2026-10-24, before any window of A7 was read: corrections to A7, added arms, and the decision rules

Corrections. (1) The ISS source of A7 named the 2026-10-21 daily file but the header values of the registered file. M1 to M3 use
the registered ISS source of A1 (`hac/nasa-iss-oem/20261009`, created 2026-10-07, EME2000, 4 min): the 12 daily windows that
section 3 of A1 registers (start 2026-10-07T12:00 + k days, k = 0 to 11, four days of states after each), start state turned
EME2000 -> GCRF by `foundation/frames`, Cd*A/m = 0.95 x 1273.21 / 470200 = 2.5727e-3 m2/kg and Cr*A/m = 0 (SOLAR_RAD_AREA = 0.00),
both from that header. (2) LAGEOS-1 and LAGEOS-2 are not re-dated. FFM refuses a space-weather input when drag is off, so a
drag-off arc is given none and needs no weather rows; the registered Earth orientation begins 2026-07-15, so the weekly ILRS
orbits used are the six that begin after it (the orbits dated 260725, 260801, 260808, 260815, 260822 and 260829 in the archive,
first state of each, 12 windows in all), Cr*A/m = 7.9e-4 m2/kg, drag off.

Added arms (cheap, registered here so that no window selects them). (a) `order15` (MAXIMUM_ORDER 15): `order15` minus `order14` is
the m = 15 terms alone, the 15:1 resonance of the 53 degree shell. (b) `full-nodrag` and `zonal-nodrag` (drag off, no weather
input, SRP as in the truth) for the Starlinks and the ISS: a truth with no drag at all, so any BTERM the fit returns is the
gravity (and the small SRP) it absorbed. The laser-ranged LEO spheres' physical drag is not in the archive; these two arms and
LAGEOS (drag off in every variant) are the test of the claim that the fitted drag carries tesseral gravity. (c) SGP4 with B*
fixed at the true value, 0, on every drag-free truth (`full-nodrag`, `zonal-nodrag`, and LAGEOS `full` and `zonal`): the
`fit_elements` options `fitBstar: false, bstar: 0` of gp-error-model, 24 h fit, same held-out days. This is the M3 test (B fixed
at the physical value) for SGP4 in place of XP, whose `fit` has no such option. (d) Long arcs for the 15:1 term: the Starlinks'
`full`, `order14` and `order15` propagated for 10 days (to the last space-weather row, 2026-11-02), difference series scanned for
a period of 2 to 12 days.

Reporting. Starlink results are grouped by the stratum's inclination digit (inc0 below 48 degrees, inc1 48 to 60, inc2 60 to 85,
inc3 85 and above) and by the SGP4 fit's mean motion; the predicted floors of DESIGN 2d.3 are compared with the group that
matches them: inc1 with mean motion 15.0 to 15.2 rev/day for the 550 km shell (53.05 degrees), the ISS windows, and LAGEOS-1 (and
LAGEOS-2, reported beside it). The tesseral share of a floor is sqrt(floor(full)^2 - floor(zonal)^2) per window, in-track
component of the 24 h XP fit, then the median over windows. Medians and 90th percentiles over windows, as in the tables.

Decision rules, fixed here. The finding of DESIGN 2d.4 is supported when all three hold. (1) Floor: the median tesseral share
of the XP in-track fit RMS is within 25 % of the predicted 384 m (inc1, 15.0 to 15.2 rev/day), 394 m (ISS) and 110 m (LAGEOS-1)
in the ISS and LAGEOS-1 groups and in the Starlink group (or, if that group has fewer than 6 windows, the whole inc1 stratum with
the prediction scaled by the 2d.3 sin^2 i law only in the text, not in the test). (2) Absorption: on the drag-free truths the
median |BTERM| of XP on `full-nodrag` is at least three times that on `zonal-nodrag`, and SGP4 with B* fixed at 0 has a lower
median day-3 error than SGP4 with B* fitted on `full-nodrag` and on LAGEOS `full`. (3) Fit length: the quadrature difference of
XP's median day-3 error on `tess2` and on `zonal` is at least 25 % lower for the 21.7 h fit than for the 24 h fit in the inc1 and
ISS groups. A rule that fails is reported as failed, with the numbers.

### A7c - 2026-10-24, written after three test windows were read (LAGEOS-1 260725, ISS 2026-10-07T12, Starlink 100011); they stay in the results

The three windows were run to check the step, and a fit-length probe was run on one Starlink truth (degree-2 tesserals only,
fit lengths 20 to 46 h). It showed that SGP4-XP's `fit` returns BTERM = 0 for every fit span of 22 h or less and a non-zero
BTERM from 23 h, so a 21.7 h fit differs from a 24 h fit in two ways at once: the J22 alias (zero of j_2) and the drag term
(off). To separate them the M-runs add the second zero of j_2 for the J22 period, a 34.2 h fit, where the drag term is on:
fit lengths are 21.7 h, 24 h and 34.2 h for SGP4 and SGP4-XP, and the M-run truths are 120 h long (the 34.2 h fit plus three
held-out days is 106.2 h). The decision rules of A7b are unchanged and are evaluated on 21.7 h against 24 h as written; 34.2 h
is reported beside them. The Starlink windows, the ISS windows and the LAGEOS windows of A7 and A7b are unchanged.

### A7d - 2026-10-24, after 40 of the 156 windows were read: raw differences of the long arcs

On the first Starlink windows the sinusoid scanned over 2 to 12 days for the 15th-order difference returned periods at the end of the
scan and amplitudes of several kilometers, which is a quadratic-like drift and not a 6-day oscillation, so the fit is not
informative for the satellites at the resonance. The long arcs (A7b d) are therefore also reported by the raw in-track
difference at 1, 2, 3, 4, 5, 7 and 10 days from the start (median of the absolute value over a group). The rows written before this
addition get the new numbers from a second pass of `m123.mjs --long-only`, which recomputes only the long arcs of every Starlink
window; nothing else about the windows, arms or rules changes.

### A8 - 2026-10-24, before any of its data was read: current GNSS truth, the missing-regime spacecraft, windows prepared for SDN-GP

Coordinator, 2026-10-24: approved, all public data, paced, stored in the archive with source, license and attribution recorded, never
republished, nothing to the console: (1) GFZ rapid GNSS orbits (CC BY 4.0) as current GNSS truth, so that COMSPOC's GPS sets and
our GNSS rows can be scored now; (2) JPL Horizons for CAPSTONE, Artemis I and Danuri and STScI MAST for TESS, as ephemeris truth for
the missing regimes. Then, in order: the fetches and the GNSS and COMSPOC-GPS scoring; the newer-SpaceX pass when the 08:00Z files
appear; lunar, cislunar and heliocentric windows prepared for SDN-GP.

Horizons (`fetch-horizons.mjs`): the documented API, one request at a time, 6 s apart; vector tables (geometric states, ICRF
axes, km and km/s, TDB), each response stored as served under `hac/jpl-horizons/<mission>/<center>/` with a provenance row.
Spans lie inside the "data through" part of each trajectory (object notes of 2026-10-23): Danuri (-155) Moon-centered
2026-08-15 to 2026-10-18 at 1 min; CAPSTONE (-1176) Moon-centered 2025-07-15 to 2026-07-15 at 5 min; Artemis I (-1023) Earth- and
Moon-centered 2022-11-16 08:50 to 2022-12-11 17:15 at 1 min. Epochs are turned TDB -> UTC by `foundation/time`; the ICRF axes are taken
as the J2000 axes of the NAIF packs (the frame bias, about 20 mas or 37 m at lunar distance, is not applied and is recorded).
Truth packs go to `<store>/pack/` in the format of the existing packs. They are scored by SGP4 or SGP4-XP only where those
theories apply (TESS, Earth-centered and highly elliptical); the Moon-centered and Earth-Moon packs wait for SDN-GP.

GNSS truth: the GFZ rapid orbits (GFZ0MGXRAP, GPS, GLONASS, Galileo, BeiDou, QZSS, 5 min) for the newest days published, converted
to GCRF $OEM by `analysis/reference-states` like the ESA finals. Our GNSS rows: two satellites per constellation chosen by the rule
of A1 (evenly from the first day's files), fit 24 h, windows every 48 h that leave three held-out days, scored as section 1. COMSPOC's
XP sets of the GNSS objects (local scoring only, never fitted to or an input) are propagated through the black-box module and
compared with the rapid orbits for the days after each set's epoch, by day since the epoch.

Windows prepared for SDN-GP (`regime-windows.mjs`): for every regime that awaits SDN-GP (lunar: LRO, Danuri; cislunar: Artemis II,
CAPSTONE, Artemis I; heliocentric: the cruise kernels) a truth pack and a window list (fit start, fit span, three held-out days,
state counts, hashes), with a scorer (`score-pack.mjs`) that takes SDN-GP's predicted states for a window as a $OEM and returns the
radial / in-track / cross-track RMS by held-out day in that pack's center and axes. Fit spans per regime follow DESIGN 2h:
Moon-centered 24 h and 72 h, NRHO and DRO segments of 14 days with 7 held-out days, cruise 30 days with 15.

### A8b - 2026-10-24, before the GNSS or TESS data were read: routes taken, products, and the scoring rules

Routes. GFZ's file server (isdc-data.gfz.de, named on the GFZ ISDC GNSS products page) did not answer from this machine for over
20 minutes (DNS resolves; TCP connect times out on 80, 443 and 21; ping 100 % loss), while the ISDC web site (isdc.gfz.de) did. The
approved product, GFZ's rapid orbits, was therefore taken from NASA CDDIS, where it is published under the same names
(gnss/products/<GPS week>/GFZ0OPSRAP_ and GFZ0MGXRAP_ ...), with the owner's Earthdata token read at run time (E14's route; the token is
sent to cddis.nasa.gov only and never printed or stored). `fetch-gnss-rapid.mjs` tries GFZ's server first on every run and falls back;
each file's provenance row says which route it came from. Licenses: GFZ0OPSRAP (GPS, GLONASS, Galileo) is the "GFZ rapid product series for the
IGS", doi:10.5880/GFZ.1.1.2020.003, CC BY 4.0 (DataCite record, fetched 2026-10-24); GFZ0MGXRAP (adds BeiDou and QZSS) is an IGS MGEX product under
the IGS terms, as registered for E14. TESS: STScI MAST, https://archive.stsci.edu/missions/tess/models/ (TESS_EPH_DEF_*.bsp, the
mission's definitive ephemeris; MAST data-use policy: public domain, acknowledgment of the mission and STScI). archive.stsci.edu's chain ends at
the emSign Root CA G1, which Node's bundle lacks; that root, exported from the macOS system roots (SHA-256 40:F6:AF:03:46:A9:9A:A1...), is handed to Node as an extra
trusted root; certificate verification stays on.

Products and conversion. Days 2026-10-11 to 2026-10-22 (the newest rapid day published; doy 284 to 295) of both products. Reference states by
`analysis/reference-states` (`scripts/fetch-reference-products.mjs --products mgex --eop finals`, IERS finals2000A observed rows):
GFZ0OPSRAP for systems G, R, E and GFZ0MGXRAP for C and J, written outside the shared reference-states directories, under `<store>/gnss-rapid/`.
Our GNSS rows: the A1 rule (two satellites per constellation, evenly from the first day's files) for G, E, R and the BeiDou MEO satellites; all BeiDou GEO, BeiDou
IGSO and QZSS satellites as in A4; 24 h fit, windows every 48 h from 2026-10-11, scored as section 1 (`baselines.mjs --source gnss-rapid,mgex-geo-rapid,mgex-igso-rapid`).
COMSPOC GNSS sets (local scoring only): every XP set of a GNSS object, propagated through the black-box module and compared with the rapid orbit in GCRF,
by day since the set's epoch, as `comspoc-precise.mjs` does for the other products; sets whose epoch the rapid days do not follow stay pending.
TESS: the definitive ephemeris files for doy 194 to 260 of 2026 (the newest MAST holds), as an Earth-centered highly elliptical orbit scored by SGP4 and
SGP4-XP like THEMIS and Chandra (windows of A5: fit 24 h and 72 h, stride 48 h, held-out days 1 to 3).

### A8c - 2026-10-24, before the rapid orbits were converted: the Earth orientation of the last rapid days

The archive's IERS collector has stored nothing since 2026-10-21: datacenter.iers.org answers its finals requests with HTTP 400 ("Request
Rejected"; the same for the data/9 and products/eop URLs and for a plain client), so the newest observed finals row is MJD 61333 (2026-10-20). The
converter keeps observed rows only, which would stop the GNSS truth at 2026-10-19, before 27 of the 32 COMSPOC GNSS set epochs (2026-10-19 and 20).
`gnss-rapid-convert.mjs` therefore seeds the converter with the archive's newest finals file in which the Bulletin A prediction rows of
MJD 61334 to 61336 are flagged observed (recorded in the seeded copy's provenance file). The effect on a GNSS position is under 0.15 m
(UT1-UTC 0.08 ms and polar motion 0.4 mas at three days), below the rapid orbit's own uncertainty and 3 orders below the XP errors scored. Rapid days
2026-10-20 to 2026-10-22 are labeled "predicted EOP" wherever they are reported.

### A9 - 2026-10-24, before the data of it were read: heliocentric packs, current SLR truth, the license registry, the SDN-GP arms

Coordinator, 2026-10-24: (1) JPL Horizons for Psyche, Lucy and Juno approved (public NASA/JPL ephemerides, paced, archive only, provenance rows):
build the heliocentric packs from them; no type-1 SPK reader. (2) ILRS products approved from CDDIS with the existing Earthdata token (never
printed or stored), for SLR truth after 2026-10-10: score COMSPOC's laser-ranged sets and our SLR rows. (3) the license registry is merged by this
task after the coordinator extended its claim to data/licenses.json and docs/data-licenses.md. (4) the newer-SpaceX watcher keeps running and is stopped by its own PID when
its pass is done. (5) the SDN-GP arms are added as side B delivers (`fit_sdngp`: kappa and tau now; term (d) next).

Horizons, heliocentric (`fetch-horizons.mjs`, as A8): vector tables, Sun-centered (500@10), ICRF equatorial axes, TDB, 60 min, from the "data
through" parts of the object notes of 2026-10-24. psyche (-255): 2025-08-13 to 2026-07-12 (JPL navigation reconstructions; the Mars flyby of
May 2026 and solar-electric thrust arcs are inside). lucy-rec (-49): 2024-12-20 to 2025-09-07 (fit through 2025-09-08: Donaldjohanson encounter, MEF-1 and
TCM-16 inside); lucy-ref (-49): 2025-09-09 to 2027-03-01 (the flight project's reference trajectory, a planning prediction, labeled so: a
long ballistic arc with MEF-2 on 2026-03-02). juno-cruise (-61): 2012-10-01 to 2013-09-30 (heliocentric cruise between the deep space maneuvers and the Earth
flyby of 2013-10-09). juno-jupiter (-61): Jupiter-centered (500@599) 2024-09-01 to 2026-08-23 at 30 min (33 day orbits after the Io flybys; the reconstruction runs
to 2026-08-24). Windows (PLAN A8 rules extended): heliocentric packs fit 30 d, held-out days 1 to 15, one window every 15 d; Jupiter-centered fit 66 d (two orbits),
held-out days 1 to 33, every 33 d. Packs are written like those of A8 (`horizons-packs.mjs`) and listed by `regime-windows.mjs`.

ILRS from CDDIS (`fetch-slr.mjs`): the NSGF rapid orbits (slr/products/orbits/rapid/<sat>/<yyyy>/<yymmdd>/nsgf.orb.<sat>.<yymmdd>.v000.sp3.gz, daily, to 2026-10-24) of Ajisai,
Starlette, Stella, LARETS, WESTPAC, LARES and LARES-2 for 2026-10-08 to 2026-10-24, and the ILRS combined weekly orbits of LAGEOS-1/2 and Etalon-1/2 (orbits/TRF/<sat>/<yyyy>/<yymmdd>/ilrsa.orb.<sat>.<yymmdd>.v80.sp3.gz),
newest weeks (the CDDIS readme of October 2026 gives the layout). The weekly products end 2026-10-10, before the epochs of COMSPOC's LAGEOS and Etalon sets (2026-10-14 to 10-20), so
those four stay pending. Conversion: the converter's SP3 -> reference-state path (files/orbit-products read_container, analysis/reference-states reference_states, IERS finals
with the Bulletin A rows of A8c extended to 2026-10-25) called by `slr-convert.mjs` with the CDDIS URLs as the recorded source. Our SLR rows: the 4-day NSGF arcs of the LEO
spheres as the registered slr-low rows (one arc per object per 4 days, fit 24 h, held-out days 1 to 3), and the newest four combined weeks for the MEO targets, scored
as section 1. COMSPOC's laser-ranged sets: propagated by the black-box module and compared with the NSGF rapid orbits after each set's epoch, by day since the epoch, local scoring only.

### A9b - 2026-10-24, before any current SLR row, COMSPOC laser-ranged score or SDN-GP row was read: rules of the three

Correction to A9: the ILRS combined weekly orbits of LAGEOS-1/2 and Etalon-1/2 on CDDIS end 2026-10-03T23:58 (the files of week 261003; those of
260926 hold a header and no positions and are skipped), not 2026-10-10. The COMSPOC sets of those four objects (epochs 2026-10-19 and 20) stay pending.

Our current SLR rows (`baselines.mjs --source slr-low-current,slr-high-current`, regimes `leo-slr-current` for the six spheres under 2000 km and
`meo-slr-current` for LARES-2, LAGEOS and Etalon). NSGF: of each sphere's daily files (261012 onward) every fourth (261012, 261016, 261020, 261024) is
one object, its own 4- to 7-day arc, not chained; windows as the registered `slr-low` rule (fit 24 h from the arc's first state, stride 24 h,
held-out days 1 to 3, 90 % per day). Combined weekly orbits: each run of consecutive weeks is one object (260912 and 260919 chain, 2026-09-06 to 09-19;
261003 stands alone, 09-27 to 10-03), windows as the registered `slr-high` rule (stride 3 d, fit 24 h, held-out days 1 to 3).

COMSPOC laser-ranged sets (`comspoc-precise.mjs`): the truth of a sphere is all of its NSGF daily files chained in date order, the later file winning at an
epoch both hold (the stated sigma of a file, 0.08 to 0.27 m, is its own overlap RMS with the next day's arc: three orders under the errors scored). The
set is propagated by the black-box module, compared in GCRF at the NSGF epochs thinned to 5 minutes, by 24 h days since the set's epoch (day 0 is the first 24 h;
a day needs half of its epochs), as for the GNSS sets. Local scoring only, labeled so.

SDN-GP arm (side B's `sdn-gp-propagator` used as built, none of its source read). The windows of the XP and SGP4 arms (start, fit length, held-out days,
coverage rule, truth, axes) are fitted by `fit_sdngp`: the truth's states as a plain $OEM that names its frame, the run's saved space-weather table on
`space_weather_table`, no $DCL and no prior (B_eff free). The fitted set is propagated to the held-out epochs by the module's batch entry
`sdngp_propagate_minutes_soa` (the invoke surface's `propagate` stops one day after the epoch), the TEME states are taken to the truth's axes by
`foundation/frames` and scored by `pair_statistics` like XP (the RIC at one state per 5 minutes). A window whose fit fails is attempted, not fitted.
Side B rebuilds `dist/` in place, so a run first copies the wasm to `<store>/sdngp-snapshot/<SHA-256 prefix>/` and every worker uses that copy; rows are kept per
build (`rows/sdngp/<prefix>/<source>.jsonl`, never merged across builds) with the build's SHA-256, the source commit and the count of uncommitted files.
Sources: the Starlink FFM truths (every fitted satellite, the window of the baselines), SpaceX's forecast (files in the local capture or unchanged on the server), ISS
(both files), ESA final GNSS, GFZ MGEX GEO and IGSO (2025), GFZ rapid GNSS, ILRS (registered and current), HEO (THEMIS, Chandra, TESS, Artemis II), and the newer-file
pass (SDN-GP fitted to the first 24 h of the FFM truth). The tables show the newest build that ran every source, and the Starlink FFM-truth row for every
build run, so the effect of each new term of side B is visible. Lunar, cislunar and heliocentric packs stay awaiting: the module's theory is Earth-centered.

### A9c - 2026-10-24, before any fit-length row of SDN-GP was read: arm 6 (A3) for SDN-GP

The fit-length measurement of A3 (fits of 24, 48 and 72 h to the FFM truth, scored on the common interval 72 to 96 h and on the first day after each fit)
is repeated for SDN-GP on the satellites of the registered `fitlength.jsonl`, on the headline build (`fitlength.mjs --arm sdngp`; rows
`rows/sdngp/<build>/fitlength.s<k>.jsonl`), and section 8 of the tables puts SDN-GP beside XP and SGP4. Reason: side B's fit E2E reports that tau_c and tau_s are
not identified on a one-day arc, so what a longer arc buys is a design question the Starlink truth can answer. The rule of A9b for builds applies (a build's rows
are never mixed with another's).

### A9d - 2026-10-24, before any row of build 2d906c4d90fd was read: the second build, the lowering variants, declared frames

Coordinator, 2026-10-24: side B's build 2d906c4d90fd (side B commit 4229929, clean tree; term (d), m-daily tesserals to degree 12 and the shallow resonance, the density-kernel
fixes, declared-frame reading with refusal, grid propagate) runs every source of A9b and the fit-length rows of A9c with the rules of A9b, and three things are added.
(1) The truth's frame is declared as it is, EME2000 for the ISS, NAIF, MAST and SpaceX states, which the build now reads; the earlier build was given GCRF for these, 23 mas
apart (0.2 m at LEO, 3.5 m at HEO), under every number in the tables. (2) The 19 Starlinks whose FFM fit has B_eff above 0.5 m2/kg are fitted in two named variants besides the
build's default: "rule" (DESIGN 2c.2: a B_eff above 0.5 m2/kg is replaced by tau0, held after the arc) and "free" (B_eff free). Each is set through the build's diagnostic export
`sdngp_fit_diagnostic(limit x 1000, -1)` before the fit, so the result does not depend on the build's default. That export is in neither the manifest nor the README: its declaration
and the comment above it in `src/fit_oem.inc` were read to call it (nothing of the fit's algorithm). Rows `rows/sdngp/<build>/lowering.s<k>.jsonl`; the tables show default, rule
and free beside XP and SGP4 for the 19. (3) The module's own held-out RMS (the COMMENT of its set) is compared with the pair_statistics RMS over the same states, as a check on
the scoring chain. When side B's next build changes the default of the rule (free B_eff), the run repeats on it and the lowering table is scored again. The newer-file pass uses the
newest complete build, as A9b says.

### A9e - 2026-10-24, before any row of build 9da7fad24c9d or of the fit-span windows was read: the third build, and the fit span against COMSPOC

Coordinator, 2026-10-24: side B's build 9da7fad24c9d (side B head 1102cd6, clean tree; odd-degree q = +-1 tesserals, zonals J6 to J20, GNSS solar pressure carried by the tau terms,
48 h as the module's default fit span) re-scores every window of A9b to A9d with the rules of A9b. The 24 h fit of the registered windows is kept: every block declares its
interval through USEABLE_START_TIME, so the module's new default of 48 h does not apply to them, and a different span is a separate measurement (below).

Fit span against COMSPOC (local scoring only). COMSPOC does not state how long a span its XP sets were fitted over, so a 24 h fit of ours is not a fair partner for them. For every
COMSPOC XP set of a laser-ranged object (the 6 LEO spheres and LARES-2) and of a GNSS satellite (the GFZ rapid orbits of A8b) that `comspoc-precise.mjs` scored, SDN-GP, SGP4-XP and
SGP4 are each fitted to the truth over F = 24, 48, 72 and 120 h ending at the epoch of that set and scored on the three 24 h days after it (day k of the tables is days k-1 to k
since the epoch, the days COMSPOC's set is scored on). Only the set's epoch is used, to place the window; nothing of the set enters a fit. Truth: the NSGF daily files chained, the
later file winning (A9b), for the spheres; the GFZ rapid orbits for GNSS. A window needs 90 % of its fit span and of each held-out day in the truth (the scorer's rule);
a window the truth cannot supply is not scored, and the table gives the count per span; the COMSPOC value beside a row is the median over the sets whose window exists at that
span. Groups: LEO spheres, LARES-2, GNSS MEO, IGSO and GEO. Runner `span-windows.mjs` (sources `span-slr` and `span-gnss`; SDN-GP rows per build as before); the headline table
keeps the registered 24 h windows, and a new section of the README shows the spans.

### A9f - 2026-10-24, before any row of build 7ea0ea272bbf was read: the fourth build, its default fit span, and the Moon-centered windows

Coordinator, 2026-10-24: side B's build 7ea0ea272bbf (side B head b663c8c; wasm built 03:41 EDT, three uncommitted files in its tree when copied; Moon-centered SDN-GP with GRGM660PRIM to
degree 100 and the DE440 lunar orientation, and a fit-span rule: the latest 48 h by default, extended to 72 and 120 h while the fit RMS holds) is run with the rules of A9b to A9e.

Earth windows. (1) Every window of A9b to A9e runs again with the explicit 24 h interval (and the explicit spans of A9c and A9e); the rows are compared with build 9da7fad24c9d window by
window, and the table says how many are identical to the last digit and which sources differ, so that "the span rule changed nothing at 24 h" is a count. (2) Default-span rows: for every
source whose truth has states before the fit start, the same windows are fitted again with the block holding the truth from 120 h before the fit end (or the start of the truth)
through the three held-out days and only USEABLE_STOP_TIME declared, so the module chooses the span itself; the chosen span is recorded from the set's COMMENT, the rows are labeled
`<source>+default`, and they are scored on the same held-out days. A window that starts at the start of its truth gets the whole interval, which is its 24 h row. Starlink windows
(FFM and SpaceX; the truth starts at the fit start), the lowering rows and the fit-length rows have no states before the fit start and are not repeated. The COMSPOC-aligned windows of
A9e get a "default" row per group beside 24, 48, 72 and 120 h (fit end at the set's epoch, truth from 120 h before it).

Moon-centered windows. Every window of the LRO pack (NAIF reconstruction, 87: 44 of 24 h and 43 of 72 h) and the Danuri pack (JPL Horizons, 61: 31 and 30) listed in A8 is fitted by
`fit_sdngp` as a $OEM block with CENTER_NAME MOON, the pack's axes declared (J2000 for LRO, ICRF for Danuri) with UTC, the fit span as the useable interval, the three days after it
in the block (held out, scored by the module's own COMMENT as well), no environment and no prior. The set is propagated by `propagate` on a grid block (CENTER_NAME MOON, ICRF axes,
explicit EPOCHs: every fifth pack epoch of the three held-out days) and scored by `score-pack.mjs` (gp-error-model `pair_statistics` in the pack's Moon-centered axes, radial / in-track / cross-track
by day). The LRO pack is in J2000 axes and the module answers in ICRF: the 23 mas between them is 0.2 m at 1,830 km and is not applied. Reported: fit RMS (the module's), the days 1 to 3
medians and maxima by fit length, the five worst windows of each body by day-3 error with their start epochs, and the maneuver check below.

Maneuver check (the truth alone, fixed before any scoring): each pack's states at 5 min go through `foundation/orbits cartesian_to_keplerian` with GM 4902.800118 km3/s2 (DE440); the
osculating semi-major axis is averaged over one orbital period (N = round(T / 300 s) samples, T from the median axis); the step S(t) is the mean over the next period minus the mean over the
previous one; |S| above median(|S|) + 6 x 1.4826 x MAD(|S|) marks a maneuver, clusters less than two periods apart merge, the epoch is the cluster's peak and the indicative delta-v is
n |delta a| / 2 (n = 2 pi / T). A window contains a maneuver when an epoch falls between its start and the end of its third held-out day (inside the fit span or inside the held-out days:
both are given). The list of epochs and delta-a is committed (derived from public truth; no states).

### A9g - 2026-10-24, before any row of build ee5dccaa17a8 was read: the fifth build (lunar v2, the validated span rule)
Side B head e241cef, module build ee5dccaa17a8 (copied to the store snapshot by `sdngp-run.mjs`), run by the coordinator after the lane stopped on the account's
weekly limit. Same windows, scoring and arms as A9f. Earth windows: every job of `sdngp-run.mjs` (24 h registered fits and the module's default span, whose
extension is now validated on a held-out tail of the latest 24 h). Moon-centered: every LRO and Danuri window of A9f through `lunar-windows.mjs`; the module now
segments a fit span at a detected maneuver or refuses it by name (`maneuver-suspected`), so the report gives the medians for windows the module fitted without a
segment, with a segment, and the count refused by name, beside A9f's maneuver list. Cislunar and heliocentric are not exposed by the module's methods in this build
and are not scored.

### A9h - 2026-10-24, before any row of build 54b069014557 was read: the sixth build (segment fits through the methods), the cislunar and heliocentric packs, the lunar rows by treatment

Coordinator, 2026-10-24: side B's dist 54b069014557 (head 7a42ae8; the store snapshot records the HEAD of its tree at the time of the copy) routes blocks to segment fits in `fit_sdngp`: Sun-centered
blocks, Moon-centered blocks whose first state's apocenter lies beyond 10,000 km (or an open orbit) and Earth-centered blocks whose apocenter lies beyond 250,000 km, in ICRF or J2000 axes and
UTC; `propagate` writes such a set on a grid whose CENTER_NAME is absent or the set's own (else grid-center-mismatch). Only the module's manifest and README are used for it; none of its source or tests.
The build is run, named and replayed as in A9b: copied to the store snapshot by `sdngp-run.mjs`, every job on that copy, rows per build. Interface probes (one window each of TESS, CAPSTONE and Psyche, to learn
the call and the output) are fitted before the run; their rows are discarded and the run starts from empty row files.

1. Earth windows. Every job of `sdngp-run.mjs` runs again with the rules of A9b to A9g. The expectation, stated by the coordinator in advance: identical to the previous complete build
(ee5dccaa17a8) except HEO TESS, whose apocenter (about 375,000 km) puts it on the segment side. Reported as counts: the windows both builds ran, how many are identical to the last digit (fit RMS and
every held-out day), for the registered 24 h rows and for the default-span rows separately, and the sources that differ. TESS keeps its windows (24 h and 72 h fits, held-out days 1 to 3, at most one
state per 5 minutes, as XP and SGP4 were scored) and its truth; the held-out states come from `propagate` on a grid block naming the set's own center (EARTH) in ICRF axes, one explicit epoch per scored
state; the fit RMS is the module's own (the COMMENT of the set); a segment set is not propagated backward, so it has no fit-span radial / in-track / cross-track split. The truth is in J2000 axes
and the module answers in ICRF: the 23 mas between them (43 m at 375,000 km) are not applied, as for LRO in A9f.

2. Lunar windows. All 148 LRO and Danuri windows through `lunar-windows.mjs` as in A9g (the grid names MOON). The rows are sorted by what the module did: the whole arc (no
USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS), a segment (that parameter present: the set's epoch was carried past a maneuver) or a refusal (by name). Medians, maxima and counts for each class,
beside the truth-side maneuver list of A9f (`lunar-maneuvers.json`, unchanged), and the rows of the previous complete build window by window.

3. Cislunar and heliocentric packs (175 new windows of the 323 listed in A8 and A9), through `segment-windows.mjs`. Per window: the pack's states of the fit span and of the held-out days as one $OEM
block, CENTER_NAME the pack's center (EARTH, MOON, SUN or JUPITER), the pack's axes declared (ICRF for the Horizons packs, J2000 for the NAIF packs), UTC, USEABLE_START_TIME the first state and
USEABLE_STOP_TIME the end of the fit; `fit_sdngp` with no environment and no prior; `propagate` on a grid block naming the set's own center (EARTH and GCRF axes for a set the module fits on its standard
Earth path), ICRF axes for a segment set, one explicit epoch per pack state of the held-out days: every state, none thinned, none dropped. The packs carry 1 ms time-stamp jitter from the TDB to UTC
conversion, so predicted and truth states are paired by epoch within 5 ms (`score-pack.mjs`), and a row records the held-out states of the pack and the states requested, returned, matched and
unmatched; a window with any shortfall is counted and named in the tables. Score: `score-pack.mjs` (gp-error-model `pair_statistics` in the pack's axes), held-out day k = (fit end + (k-1) d, fit end + k d]:
3D RMS and the radial / in-track / cross-track split. Packs and rules (A8, A9): artemis2-cislunar (Earth, J2000, 3 windows, 24 h fits, days 1 to 3); artemis1-cislunar (Earth, ICRF, 11 windows, 24 h
fits, days 1 to 3); artemis1-lunar (Moon, ICRF, 2 windows, 336 h fits, days 1 to 7); capstone-nrho (Moon, ICRF, 50 windows, 336 h fits, days 1 to 7); psyche-cruise (Sun, 20 windows), lucy-cruise-rec (Sun, 15),
lucy-cruise-ref (Sun, 33) and juno-cruise (Sun, 22): 720 h fits, days 1 to 15; juno-jupiter (Jupiter, ICRF, 19 windows, 1,584 h fits, days 1 to 33): the module documents no Jupiter-centered path, all 19
windows are attempted and the refusal is reported by name. Reported per pack: windows fitted and refused (by name); medians and maxima by held-out day (Artemis 1 / 2 / 3, CAPSTONE 1 to 7, cruise 1 / 3 / 7 / 15);
the fit RMS; the windows by the module's treatment (whole arc; on a segment: USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS present, which the module sets for a maneuver and for a sphere-of-influence
passage; refused); the five worst windows of each pack by the last held-out day with their start epochs. The module's own documented CAPSTONE figures (segmented 1.9 / 9.8 / 48.4 km at days 1 / 3 / 7, whole
arc 20.6 / 37.9 / 67.2, after it found its first scorer had dropped states with 1 ms jitter) are not an input to any choice; this scorer's numbers stand on their own and are compared with them afterward.

4. Spelling. American spelling in all generated text (tables, README, inventory, commit messages); the repository's US-spelling checker is run in report mode over the claimed files and every hit that is not a
proper name in a credit line (GFZ Helmholtz Center, IERS Earth Orientation Center) or a verbatim provider quotation in the registry is rewritten, in a commit of its own that changes spelling only.

5. Report: per regime, days 1 / 2 / 3 (cruise 1 / 3 / 7 / 15), against the rows of ee5dccaa17a8; E2E (`run.mjs --check`) with a segment-window replay added.

### A10 - 2026-10-24, before any row of build 35cd83a2b714 or of the event measurements (M22, M23, M28, M24, M25) was read: the seventh build, maneuvers, the reentry hand-off, ISS and lunar maneuver detection

Coordinator, 2026-10-24: side B fixed the four findings of A9h (segment COMMENTs give the length and the start in the arc; Earth fits above 100 km RMS are refused as fit-implausible; for e > 0.5 the span
defaults to 24 h and extends only on a 30 % better tail, never past a 36 h period; the Earth moves are intended: SRP shares amendment 3's shadow sequence) and added the methods `maneuver`,
`detect_maneuvers`, `reentry` and `launch_set`. Dist 35cd83a2b714 (the coordinator names side B's head c4646ff; the store snapshot records the HEAD of side B's tree at the copy, 9c1d5ee, a later commit; the wasm
is identified by its hash). Only the module's manifest and README are used for the interface, none of its source or tests. Disclosure: the log of side B's tree shows a later commit (c5d23da, work in progress)
whose subject line carries its own events figures, and the README paragraph on DESIGN 5 lists figures from side B's own osculating (Cowell) integration; both were seen before this registration and no choice below
uses a figure of either. The truths of M22, M23 and M28 are FFM-1 (propagator/ffm), not side B's integration, as the coordinator asked. Interface probes (one `maneuver` impulse, one finite burn, one `reentry`, one
`detect_maneuvers` call, on one satellite and one decay, to learn the call and the outputs) are run before the run; their rows are discarded and the run starts from empty row files.

1. Re-score. Every job of `sdngp-run.mjs` runs again on build 35cd83a2b714 with the rules of A9b to A9h (65 jobs, a store snapshot copy, rows in rows/sdngp/35cd83a2b714/). The coordinator expects the HEO default-span
rows to change and everything else to match 54b069014557. Reported as counts: the windows both builds ran; how many are identical to the last digit (fit RMS and every held-out day), registered 24 h rows and
default-span rows separately; the sources that differ with the median and largest change of the day-1 / 2 / 3 error; the fit-implausible refusals (new, by source and name); the HEO default-span rows (span, errors) beside
those of 54b069014557. The cislunar and heliocentric packs and the Moon-centered windows are re-scored as in A9h.

2. M22, the impulse map (DESIGN 5.5). Satellites: the registered Starlink truths in ascending NORAD order, positions 0, 5, 10, ... (239 registered: 48). Truth start t0 is the registered truth's epoch, the fit end
t_b = t0 + 24 h. For every satellite and case FFM-1 runs from the registered truth state at t_b - 60 s (sample 1439 of the registered file) with the satellite's registered ballistic and SRP terms (meta.fit.bEffM2Kg,
meta.fit.crAm), the saved environment (the rows the registered truths used), the registered integrator (tolerance 1e-13, maximum step 120 s) and no other change. Cases: impulses of 1 mm/s, 10 mm/s, 100 mm/s,
1 m/s and 10 m/s along each of U (radial), V (in-track, W x U) and W (along r x v) in FFM-1's RTN axes at t_b, planted as the typed request's IMPULSES (15), and the control (none): 16 per satellite. Samples every 300 s
from t_b + 300 s to t_b + 72 h (864). The control must reproduce the registered truth: the largest position difference over its 864 samples is reported.
SDN-GP: the fit of the G1 rows (the first 24 h of the registered truth at 60 s, declared span, the saved space-weather table, `fit_sdngp`), then `maneuver` with one $MNV (EVENT_START_TIME t_b, DELTA_VEL_U / V / W in km/s,
no duration) and the same space-weather table; the post-burn set's TEME states at the 864 epochs by the batch entry, into GCRF by foundation/frames, as for the rows. The control is the fit itself. Score as the G1 rows:
`pair_statistics` radial / in-track / cross-track (RTN of the truth), days (t_b + (k-1) d, t_b + k d], k = 1, 2, 3, 3D RMS. Second statistic, the response error, which removes the fit error common to both: the RMS over the
day of |(x_SDN,case - x_SDN,control) - (x_FFM,case - x_FFM,control)| in GCRF. Reported per axis and magnitude: the median and maximum over satellites of the day-1 / 2 / 3 RMS; the excess over the control's RMS of the
same satellite (case - control, km): median, 90th percentile, maximum; the response error (median, maximum); the no-maneuver rows of this build (day 1 / 2 / 3 medians of the same satellites) beside the control's; the
counts refused by name. Nothing is thresholded; the coordinator's comparison is "against the no-maneuver rows".

3. M23, finite burns. Satellites: positions 0, 10, 20, ... (24, a subset of M22's; the control is shared). Burns of 1, 5, 15, 30 and 60 min along each of U, V and W with total delta-v 0.1 and 1 m/s (30 cases). Truth
in two stages, because FFM-1 integrates each sample of a burn arc from the arc's initial state: stage 1 from the sample at t_b - 60 s, a constant acceleration of delta-v / D with its direction fixed in the RTN axes
(typed FINITE_BURNS, THRUST_LAW ACCELERATION, RTN_AXES, a specific impulse so large that the mass is constant), from t_b to t_e = t_b + D, one sample at t_e; stage 2 from that state without burn to t_b + 72 h with
samples at t_b + k 300 s for every k with t_b + k 300 s >= t_e. SDN-GP arms: (A) `maneuver` with the finite burn ($MNV EVENT_START_TIME t_b, EVENT_END_TIME t_e, the total delta-v): the module's own map with the
sinc(dL/2) loss; (B) `maneuver` with a centroid impulse ($MNV EVENT_START_TIME t_b + D/2, no duration, the same delta-v): without the loss. Scored as M22 on the samples at or after t_e (states inside the burn are not scored),
days measured from t_b. Reported per duration, axis and delta-v: the excess over the control of A and of B (median, maximum over satellites), the ratio B / A of the excesses, and sinc(dL/2) with dL = n D from the fit's
mean motion (printed beside them, not used).

4. M28, the hand-off. Cells (12): circular orbits at 300 km altitude, B (Cd A / m) 0.005, 0.02 and 0.05 m2/kg x solar level low (F10.7 70, Ap 4, Kp 1.0), moderate (150, 12, 2.7) and high (230, 27, 4.0), constant
daily rows with the 81-day F10.7 averages equal to F10.7 (the three solar levels are the coordinator's); and elliptical orbits with a 250 km perigee, e = 0.05 with B 0.02 and 0.05 and e = 0.15 with B 0.05, all at the
moderate level (left out for their length: e = 0.05 with B 0.005, 759 days; e = 0.15 with B 0.02, 1,027 days, and with B 0.005, over 1,200 days; the calibration with FFM-1 alone, run before this registration, found 3.9 to
191 days for the circular cells, 66 and 181 days for e = 0.05 with B 0.05 and 0.02, 407 days for e = 0.15 with B 0.05, and fixes only the choice of cells). Inclination 53 deg, RAAN, argument of perigee and anomaly 0
(the state at perigee), epoch 2025-10-24T00:00Z, Cr A / m 0.02 m2/kg, FFM-1 full force as the registered truths (NRLMSISE-00 drag under the synthetic weather), one Earth-orientation row, the registered integrator, samples
every 300 s, chunks of 10 days restarted from the last sample, to FFM-1's own stop (it refuses to integrate below 100 km geodetic altitude and names the epoch: T100, the first integration state below 100 km) or the cap.
Nodes: per cell and level of 250, 230, 210, 200, 190, 180, 170, 160, 150, 140, 130 and 120 km, the first sample at which the revolution-mean perigee height (the mean over the previous nodal period of the osculating
a (1 - e) minus 6378.137 km, osculating elements by foundation/orbits) is below the level; a node with less than 6 h of truth before it is dropped and counted. Truth quantities at a node: h_p, e (period means), the change
of the period-mean a over the last period (da_rev, km), eps1 = 2 |da_rev| / H with H the NRLMSISE-00 density scale height of FFM-1's ATMOSPHERE_REQUEST (equator, local solar time 14 h, altitude h_p, the cell's F10.7 and Ap,
H = 2 km / ln(rho(h_p - 1 km) / rho(h_p + 1 km))); the module's own H(h_p) is not exposed, so eps1 is an equivalent), and the module's criteria (README, 18) on them: C1 eps1 > 0.05, C2 h_p < 180 km, C3
|da e_rev| / (a e) > 0.01 with e > 0.01. SDN-GP at a node: `fit_sdngp` on the truth up to the node (GCRF, 300 s states, from 120 h before the node or the start, USEABLE_STOP the node, no declared start: the module
chooses its span) with the cell's synthetic space-weather table; the set's TEME states at 300 s steps to node + 12 h or T100, into GCRF, scored on the truth by `pair_statistics` in blocks (0, 3 h], (3, 6], (6, 9], (9, 12]
after the node: 3D RMS and radial / in-track / cross-track. `reentry` on the same set with the same table: REENTRY_EPOCH (the module integrates to 80 km; FFM-1 stops at 100 km, so the module's epoch is expected later than T100
by the descent between the altitudes; reported, not corrected), REENTRY_EPOCH_UNC, the window, ORBIT_LIFETIME and the epoch of the hand-off INITIAL_STATE; the hand-off state, when it is a TEME state, is also run by
FFM-1 (the cell's true B, the cell's weather) to its own stop, which isolates the hand-off state's error from the set's B_eff. Reported: per cell T100 (days), capped or not, nodes fitted, refused (by name) and dropped; by
level, pooled over the cells, the median, minimum and maximum of eps1, h_p, e, da_rev, the fit RMS and the four block errors, and the share of nodes with C1, C2 and C3 tripped on the truth; per cell, the first level at which each
criterion trips on the truth, the first level at which the block-1 error exceeds 1 km and 10 km, and the level and lead before T100 of the module's hand-off (the epoch of INITIAL_STATE), counting the cells where a criterion
precedes the error; REENTRY_EPOCH - T100 (hours, signed) and whether T100 lies in the window, by lead before T100 (over 48 h, 12 to 48 h, under 12 h).

5. M24, ISS. The operator-ephemeris archive holds two NASA ISS OEM captures (2026-10-12 and 2026-10-23, 15 days each); the first carries an event table of docking, departure and launch events, all with delta-v 0.0, the second
carries none: no reboost. Their states (J2000 in the file, every fifth, 300 s) go to TEME by foundation/frames and `detect_maneuvers` runs on 72 h windows every 24 h inside each file, with the saved weather table. With no
reboost in the files every detection is a false alarm; reported: windows run, detections (epoch, delta-v, Lambda), and false alarms per object-year over the 30 object-days (with the 95 % upper bound for none, 3 / 0.082 per year).
Detections of real reboosts and the errors of delta-v and epoch against the event table (TIG, DV, HA, HP) need an archive of past OEM headers, which the local archive does not hold; fetching the public NASA archive needs the
coordinator's approval and a registry entry, and is asked for in the report. No raw ISS states are committed.

6. M25, LRO and Danuri against the maneuver list. From the rows of this build for the 148 Moon-centered windows (A9h 2) and the committed truth-side list of A9f (`lunar-maneuvers.json`, unchanged): per window the
module's treatment (whole arc, segment, refused by name) against whether the list has a maneuver between the window's fit start and the end of its third held-out day. Reported per body: the detection rate (windows with a
listed maneuver treated as segment or refused), the false-alarm rate (windows without one treated so), the median and largest epoch error of a segment against the nearest listed epoch (the set's epoch minus
USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS, the README's meaning of the parameter, read as it stands), and the medians of the held-out days by treatment. Reading the parameter as an epoch is an interpretation; if most
detections are further than a day from every listed epoch, the epoch error is reported as not an epoch.

7. Rows and runs. Truths of M22, M23 and M28 are generated once, independent of the build, and cached under <store>/events/ (FFM-1 only, no SDN-GP row read to build them). The SDN-GP scoring of each is a job of
`sdngp-run.mjs` (sources m22, m23, m28, m24) with rows per build in rows/sdngp/<build>/m22.s*.jsonl and so on; a run that selects them with --only does not rewrite complete.json. Failures are rows with the refusal by name,
never dropped. COMSPOC data are not involved. No raw operator, ISS or unlicensed states are committed; the committed results are aggregates.

8. Spelling and report. American spelling in all generated text; the repository's US-spelling checker runs in report mode over the claimed files at the end and spelling changes are committed on their own. Report in 12 lines or fewer,
measured numbers only: the re-score identity counts and the HEO default-span change; M22 (excess over the control, by magnitude and axis, days 1 / 2 / 3, against the no-maneuver rows); M23 (A against B by duration);
M28 (criteria against error by level, the hand-off lead, the reentry epoch error); M24 and M25 as measured, or what is missing. E2E: `run.mjs --check` with an events replay (one M22 case, one M23 case, one M28 node on the pinned
build against the stored rows).

### A10b - 2026-10-24, before any row of build 35cd83a2b714 was read and before any events row of it was scored: corrections found by the interface probes

The interface probes of A10 were run: one satellite through `maneuver` (the first of M22's list, NORAD 44949), one decay cell through `reentry` (c-B0.005-low, the longest circular decay), the ISS windows through `detect_maneuvers`.
Their rows were read to learn the calls and the outputs and then deleted; the run recomputes the same cases, so the numbers of that satellite and that cell come out again as they were (deterministic). The Earth rows of the re-score
were not read before this entry. What the probes changed:

1. Environment ports. The build's own manifest (dist/plugin-manifest.json, the copy made with the wasm) declares no environment port for `maneuver` (inputs omm, maneuvers, grid) or `detect_maneuvers` (ephemeris); the package's newer
manifest at side B's later HEAD adds them and is not this build. The weather table is therefore not passed to either (A10 2 said it was for `maneuver`); `reentry` takes it, as planned. A `$MNV` is sent as a plain record: a size-prefixed one is refused as not verifiable.
2. The round trip of the map. On the first satellite a zero delta-v through `maneuver` leaves the day-3 RMS 0.18 km above the control (day 2 0.03 km, day 1 0.005 km), and so do impulses of 1 mm/s on any axis. A zero delta-v is accepted. A case `map0`
(the map applied with a zero delta-v at t_b, scored against the control's truth) is added to M22 for every satellite and reported beside the impulses, as the floor of the map.
3. Finite-burn tolerance. FFM-1 answered "Finite-burn tolerance cannot be met at minStep" for 5 of the 30 burn arcs of that satellite at the registered tolerance (1e-13). The burn stage retries at 1e-12, 1e-11 and 1e-10 until FFM-1
accepts it, and the tolerance used is recorded in the truth index; the post-burn stage keeps the registered tolerance. The first M23 truth files were made before this correction, were deleted and made again.
4. ISS step. The files hold a state every 240 s (A10 5 said every fifth at 300 s): every state is used, none dropped; a 72 h window holds about 1,080 states; 26 windows (13 per file).
5. M25. The rows of the previous build show what USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS is: the distance from the arc's start to the start of the segment (a 72 h arc whose listed maneuver lies 45.5 h after its start carries 172,800 s: the
segment starts 48 h in); it is not an epoch. The epoch error of A10 6 is replaced by the lag: the segment's start (arc start plus the parameter) minus the last listed maneuver inside the fit span (positive: the segment starts after
it). Reported per body: the treatment (whole arc, segment, refusal) of the windows with a listed maneuver in the fit span, only in the held-out days, and none; the lag (median, minimum, maximum); the segments that start after and before the last
maneuver; the day-3 medians by treatment. The detection and false-alarm counts of A10 6 are the first rows of that table.
6. M28. The hand-off state's reference frame is read from the RDM (TEME in the probe) and converted by foundation/frames before FFM-1 runs it; a `reentry` refusal (the last node of the probe cell was refused as "reentry-not-reached", with a fit RMS
of 12.8 km) is a row, not a gap. The node scan begins at the first sample with two periods of history and drops the nodes with less than 6 h of truth, as A10 said.
7. Jobs. The events jobs are sources m22, m23, m28 and m24 of `sdngp-run.mjs`; they run with --only and do not rewrite complete.json, which the 65 jobs of the re-score wrote.

### A10c - 2026-10-24, before any row of the burn-free control of M24 was scored: the detector on burn-free FFM-1 arcs

The M24 rows of A10 5 were read once the M28 and M24 jobs finished (and before the M22 and M23 rows were scored): 13 of the 26 ISS windows reported a burn on files that hold none. To separate the detector from the data, the same `detect_maneuvers`
runs on arcs that are burn-free by construction: the 48 registered Starlink truths of M22 (one FFM-1 integration from one state), 72 h windows starting at 0 h and at 24 h of the 96 h truth, every fifth state (300 s), TEME by foundation/frames, the call as
for the ISS windows (96 windows, 4 distinct days per satellite, 192 object-days). Reported: windows run, windows with a detection, the detections (delta-v and Lambda) and the distinct detection epochs per object-year over the 192 object-days. Source `m24c`,
rows `m24c.s*.jsonl` in rows/sdngp/<build>/, a job of `sdngp-run.mjs` run with --only. Nothing else in A10 changes.

### A10d - 2026-10-24, after the E2E replay of one ISS window differed from its recorded row, before any row of the corrected M24 and M24c was scored: the environment of the detector

A10b 1 said the weather table is not passed to `detect_maneuvers` because the build's manifest declares no port for it. The build has the method `load_environment` (its manifest: "Replaces the SDN-GP environment with SDS records as FFM reads
them"), and an instance keeps the environment it holds between calls. The M24 and M24c jobs never fit, so their instances held none and the detector ran on the module's default environment, while A10 5 said "with the saved weather table".
The E2E replay ran in an instance that had fitted before and returned another Lambda for the same ISS window. A test on that window (2026-10-08T12:00Z, file of 2026-10-12) in three instances: fresh, Lambda 2,007.03; after `load_environment` with the saved
table, 8,395.94; after a `fit_sdngp` given the same table, 8,395.94. The first rows (13 of 26 ISS windows and 59 of 96 FFM-1 windows with a detection) are kept as `m24-noenv` and `m24c-noenv` and reported as "no environment loaded". M24 and M24c are
scored again with `load_environment` called with the saved weather table at the start of the job, as A10 5 and A10c said; those are the rows of M24 and M24c. M22 and M23 call `maneuver` after the satellite's own `fit_sdngp` in the same instance, so
the environment in force was the saved table, and the replay reproduced them; M28's `reentry` is given the table as an input. No other rule changes.

### A11 - 2026-10-24, before any row of the ISS archive windows was read: the name SDN-AP, the fetch of NASA's archive, M24 on its headers

Coordinator, 2026-10-24: approved the fetch of NASA's public ISS OEM archive for M24 and asked for A11 on build 35cd83a2b714: M24 on the archive, M29 (real reentries), and M30 and M31 as far as the interfaces of the
build cover them. M26 and M27 wait for side B's recalibrated detector, M32 and M33 for the batch-joint fit and the slope test; side B's next dist is scored on every source when the coordinator sends it. M29 to M31 are
registered in amendments of their own before any of their rows is read; this one holds the name, the fetch and M24.

Name. Owner, 2026-10-24, verbatim: "Also we should call it SDN-AP for advanced propagator". From this amendment on the theory is SDN-AP in everything written here (generated results text, README, new amendments); the frozen
text of A1 to A10d keeps SDN-GP, DESIGN.md is not edited here (its owner renames it), and the paths rows/sdngp/<build>/, the experiment directory and the graph task id keep their names (they are keys of the `run.mjs --check`
replay). Side B renames the module itself: the package becomes sdn-ap-propagator, `fit_sdngp` becomes `fit_sdnap`, USER_DEFINED_SDNGP_* becomes USER_DEFINED_SDNAP_*. Its next dist is scored on the new names: `lib/sdngp.mjs`
chooses the method and export names by what the build carries (`fit_sdnap` in its embedded manifest, `sdnap_*` among its exports; the other methods keep their names), finds the package under either name (SDNAP_MODULE_ROOT
overrides) and reads the SDNAP_* parameters back under the historical SDNGP_* keys, so one row schema serves every build. This was written from the coordinator's description and tested on 35cd83a2b714, whose names it keeps (the
fit RMS of a probe satellite is equal to the digit); it is untested on a renamed dist until one arrives, and the amendment that scores that dist says what it found.

The fetch. NASA public data (a U.S. Government work), https://nasa-public-data.s3.amazonaws.com/iss-coords/, used for local results. The bucket's listing (ListObjectsV2, 15 pages of 1,000 keys, 15,000 keys) names 748 dated
folders with an OEM text file, ISS.OEM_J2K_EPH.txt, from 2020-09-10 to 2026-10-21 (109 to 150 a year in 2021 to 2025, 89 in 2026 so far; gaps of more than 20 days only between 2020-09 and 2021-01). The sightings files of the folders were not fetched. One request at a time,
2 s apart, no credentials; each file's size was checked against the listing; 539 MB as served, under <archive>/hac/nasa-iss-oem-archive/<date>/ with a provenance record beside each file (URL, retrieval time 2026-10-24,
SHA-256, size, terms); nothing of it is in git. The first pass of the fetch read the listing with a pattern that skipped the entries carrying checksum fields (the last 3,620 keys) and so fetched 568 files; the listing was
re-read field by field and the 180 files it had missed were fetched. The registry entry nasa-iss-oem (data/licenses.json, docs/data-licenses.md) now covers the archive. The headers' burn list and the window list (no state
vectors) are committed (results/sdn-gp-starlink-ffm-match/iss-burns.json).

Headers and burns. The comment lines TRAJECTORY EVENT SUMMARY give, per event, a name, TIG (GMT day of the year), the delta-v (m/s) and HA and HP (km) of the trajectory in the file. A burn is an event whose delta-v is above zero
(reboosts, deboosts, debris-avoidance maneuvers, visiting-vehicle reboosts; docking, undocking, launch and relocation events carry 0.0). The 748 files list 99 distinct burns (TIGs within 12 h taken as one; 0.1 to 2.8 m/s,
53 of them above 1.0 m/s; 1 in 2020, 14 in 2021, 18 in 2022, 19 in 2023, 20 in 2024, 16 in 2025, 11 in 2026); 60 files list no event. TIG, delta-v, HA and HP are NASA's planned values of the trajectory in the file. A later
file's revision of a burn is a revision of the plan, not a measurement of the executed burn, and nothing below measures what the station did.

Truth (my choice). The file's own ephemeris: one continuous numerical trajectory in which NASA applied the burns of its header at their TIG. Checked on one burn (the reboost of 2021-03-12, 0.3 m/s), a file made before it and one
made after it both show the orbit-averaged osculating semi-major axis rising across TIG (foundation/orbits; by about 0.7 km against the 0.5 km of 2 dv / n). Files are not stitched: the seam of two files is a prediction error of
kilometers and would act as a burn, so the option of joining the files' leading parts was not taken. A window's truth is the TIG and delta-v of the header of the file it is cut from.

Windows (72 h, every state of the file inside it, 240 s steps; TEME by foundation/frames at each state's epoch; UTC; one $OEM block). Burn windows, for each distinct burn: pre, the latest-created file listing it whose states start
at least 24 h before TIG and end at least 24 h after (for a burn planned at short notice, when no file has that: 6 h and 12 h, flagged short), cut TIG +- 36 h and shifted to stay inside the file; post, the earliest-created file made at
least an hour after TIG that starts 12 h before it (3 h, short). That gives 99 pre windows (5 short, 6 holding another burn) and 6 post windows (4 short); no burn is left out. Burn-free windows: the leading 72 h of every file whose header
lists no burn from one hour before the window to one hour after it: 651 windows covering 4.37 object-years of distinct time (1,598 days; the files overlap).

Detector. `detect_maneuvers` of build 35cd83a2b714, one call per window, with the daily space weather of the years loaded by `load_environment` (A10d). The saved environment holds 51 daily rows (2026-09-13 to 2026-11-02) and the
data-source/space-weather module refuses a past day, so the rows before 2026-09-13 are made from the GFZ file Kp_ap_Ap_SN_F107_since_1932.txt of the local archive (CC BY 4.0) with the module's row semantics read off its own rows
(Kp x 10 rounded, ap and Ap, F10.7 observed and adjusted, the centered mean of the observed flux over 40 days either side as F107_OBS_CENTER81, the mean over the 80 days before and the day as F107_OBS_LAST81), checked against the
module's rows on the 26 days where they overlap (569 of 572 fields equal; the three differences are on the file's last day, whose values were preliminary); 9 days without F10.7 in the file are left out (the module keeps the values
in force for a day no row covers). The table is 2,703 rows, 2019-06-01 to 2026-11-02 (lib/spw-history.mjs, cached in the store with its provenance). The module's fourth source, NOAA's three-hour Kp forecast, was fetched once on
2026-10-24 (public domain) to run its parser; the table holds none of it.

Scoring (no threshold is set). A window yields at most one detection (the module's output). In a burn window a detection with an epoch within 92 min (one orbit) of TIG is a hit; its epoch error is the detected epoch less TIG;
its delta-v is compared as |delta-v| over the planned delta-v (the header gives a scalar) and as the share of the in-track (V) component. A detection elsewhere in a burn window is counted as detection elsewhere, no detection as a miss.
Reported for pre and post windows separately: hits, detections elsewhere, misses, the median [10th, 90th percentile] of the epoch error and of the delta-v ratio, the median |delta-v| error, the V share, the Lambda, and the hits by
planned delta-v (0.1 to 0.3, 0.4 to 0.6, 0.7 to 1.0, above 1.0 m/s). Burn-free windows: windows with a detection, and false alarms per object-year, the distinct detection epochs (detections within 6 h of the previous one merged
across windows) over the distinct time covered. DESIGN 5.5 quotes the modules' detector (22 of 25 held out, one false alarm per object-year); analysis/maneuver-detection is not in the modules checkout of this task, so that figure is
quoted, not reproduced. Rows: source m24a (rows/sdngp/<build>/m24a.s*.jsonl, a job of `sdngp-run.mjs`, four shards); no state vector is committed.

Spelling and report as in A10: American spelling in all generated text; the report states what the planned values are.

### A11b - 2026-10-24, before any row of M29 was read: real reentries

Inputs (DESIGN 5.2.5 and 5.5, M29), what the local archive holds and what it does not.
Held and used. (1) Space-Track decay and TIP messages: the archiver's daily snapshots (each the last 7 days) of 2026-10-11 to 2026-10-24. They list 50 objects with a TIP series; 41 of them (35 Starlinks, PEGASUS R/B, PSLV R/B,
YAOGAN-35 02B, COSMOS 2572, SDX01 and SDX02) have a last message before the last snapshot (2026-10-24T12:00Z) and a decay message: sample T. The window of the last message is 1 min for 32 of them, 2 min for 5, 25, 31 and 60 min for four.
(2) The GP element-set histories of the local gp_history (creation dates 2022-11-20 to 2026-10-24), cut for the objects of both samples by `m29-extract.mjs` and `m29-extract-cords.mjs` (read from files; the sets stay in the archive).
(3) The CORDS reentry history spreadsheet (the file the closed-modules `aerospace-reentry-provider` reads), fetched once on 2026-10-24 (HTTP 200, 391,875 bytes, SHA-256 d6fabdbd279f1d3590638edd8738865fb6f6934548b76b0a1bd00d58162f5f24; registry
entry aerospace-cords): 3,313 rows, one per object, 103 with an observed reentry time; each row gives the epoch of the element set Aerospace's prediction used, the prediction and its stated uncertainty (the 20 % rule, +- hours). Of the 103,
17 have an observed time of day (not midnight), an Aerospace element set after 2022-11-27 (the local history starts 2022-11-20) and a time to go at that element set from -3 h to 14 d: sample C (7 Starlinks and 10 others; reentries
from 2023-03-18 to 2025-11-08).
Not held, named. The CORDS listing page: https://aerospace.org/reentries answers a script with a bot challenge (HTTP 403); it was not read and no way around the challenge was tried. Any spreadsheet newer than 2026-05-22 (its link is on that
page), so Aerospace's predictions for the 2026-10 reentries are missing. Space-Track decay and TIP before 2026-10-04: the archiver's queries are fixed at the last 7 days, so older reentries and the TIP comparator for them need a backfill
option in the archiver (outside this claim). This experiment makes no request to Space-Track.

Truth. Sample C: the observed reentry time of the spreadsheet (a sighting or a recovery; minute precision). Sample T: the DECAY_EPOCH of the object's last TIP message, Space-Track's settled reentry time, not an observation.

Predictions. For every object and every element-set epoch t_k from 14 days before the reentry (and not before the sixth day of the local history) to 30 min before it, at least 4 h apart, and for sample C also the epoch of the set Aerospace used:
the pseudo-observations of the element-set history up to t_k are the states of the SGP4 module's `propagate_ephemeris` with `element_set_blocks` (one block per set), taking from each set the interval (epoch of the set before, its own epoch],
every 300 s, TEME, for the last 120 h before t_k (at least 48 states); `fit_sdngp` (UTC stop t_k, no declared start: the module chooses its span) and then `reentry` on the set, both with the daily space weather of the years (2019-06 to 2026-11,
lib/spw-history.mjs). One prediction is a REENTRY_EPOCH (the module integrates to 80 km) with REENTRY_EPOCH_UNC (hours, 68.27 %).

Scoring (no threshold is set). Time to go tau = T* - t_k; error = REENTRY_EPOCH - T* (hours); sigma = REENTRY_EPOCH_UNC; the 2-sigma window is twice that. Bins of tau: over 7 d, 3 to 7 d, 1 to 3 d, 12 to 24 h, 6 to 12 h, 3 to 6 h, under 3 h.
Reported per sample and bin: predictions and objects; the median error, the median and the 90th percentile of |error| (hours) and the median of |error| / tau; the share of predictions within sigma and within 2 sigma (nominal 68 % and 95 %); the median
sigma / tau. The 20 % rule: the share with |error| <= 0.2 (REENTRY_EPOCH - t_k), and the equal-coverage comparison: the multiple k of sigma whose share in the bin equals the rule's share, and the median of k sigma / (0.2 (REENTRY_EPOCH - t_k)),
below 1 for a window narrower than the rule's at equal coverage (the prediction M29 tests). Comparators: Aerospace at its own element-set epoch (sample C): its error, whether T* lies inside its stated +-, beside SDN-AP's error and sigma coverage at the
same epoch; Space-Track's TIP at the same t_k (sample T): the latest message before t_k, its error and whether T* lies inside DECAY_EPOCH +- WINDOW. Fits and reentries that are refused are counted by name per bin.
Rows: m29 (rows/sdngp/<build>/m29.s*.jsonl, six shards); the committed results hold times, errors and window widths only: no element set, no TIP message and no spreadsheet row.

### A11c - 2026-10-24, before any row of M30 or M31 was read: what the interfaces of build 35cd83a2b714 cover

M30, controlled deorbits (DESIGN 5.2.2 and 5.5: theory plus residual inside the operator's span, tau0 lowering beyond it; below G1's lowering rows at day 3). Not covered by the build. Its methods are ingest_omm, propagate, fit, fit_sdngp,
load_environment, maneuver, detect_maneuvers, reentry and launch_set: there is no residual series (2g) and `reentry` knows no lowering burns beyond what the fit's tau0 rule (2c.2) puts in the set. What is covered and run: (a) the lowering rows of A9d
(the 19 Starlinks with B_eff above 0.5 m2/kg; the build's default, "rule" and "free"), reported at days 1, 2 and 3 beside SGP4-XP; (b) `reentry` on the set fitted to the first 24 h of each of the 19 in the three variants, the prediction
frozen now (rows m30, dated), to be scored against the TIP and decay messages the archiver collects in the coming days (none of the 19 has a TIP message in the snapshot of 2026-10-24): the error of REENTRY_EPOCH against the last TIP
message's DECAY_EPOCH and the share inside sigma and 2 sigma, by variant. What M30 needs: the residual-series method (2g) with the Chebyshev residual of the operator's span, a lowering-burn model with its stop epoch in `fit_sdnap`, and the
decay and TIP truth of those objects.

M31, first sets (DESIGN 5.3.1, 5.3.2 and 5.5: first SpaceX files of new batches, initialized from the first state, fitted on 6, 12 and 24 h, scored on newer files at days 1 to 3; B_eff identifiable from 6 h). The method is covered:
`launch_set` makes the first set from a $LAM insertion orbit (osculating a, e, i, RAAN, argument of latitude; B_eff and AGOM priors) and `fit_sdngp` takes an early $OEM with the set as `prior`. The data are not: the capture cycles keep derived
products of each file (10-minute mean elements, energy, altitude; the raw file is not persisted), so the cycle of 2026-10-24T05:01Z, in which a new batch first appeared (27 satellites with provisional ids 799501701 to 799501727, first file created
01:02Z), holds no first state; the SpaceX server serves only a satellite's current file; and raw operator ephemerides are not stored by these experiments (registry note on spacex-starlink). What is done now to start the clock: the 27 current files
are fetched into memory, one request at a time, and processed as the registered Starlinks are (`satellite()` of truth.mjs: the fit by analysis/od, FFM-1 for 96 h; the derived trajectory and the fit under <store>/m31/, never the file); they are
the "first available files" of the batch (about 16 h after the first one). The fits of 6, 12 and 24 h (with the `launch_set` set as prior), and their scoring on the first three hours (every ten minutes) of the files served about 24, 48 and 72 h
after the fit end, are a later step: they cannot be run before 2026-10-25 to 2026-10-28, and this amendment registers them (rows m31) without running them. What M31 needs from the build side: nothing beyond what it has; from the capture: the first state
(only) of every new id kept at first sight, with the file's hash.

Spelling and report as in A10: American spelling in all generated text.

### A11d - 2026-10-24, before any row of M29 was read: the pseudo-observations by set, one set per call

The first M29 run stopped before any row was read: the SGP4 module's `propagate_ephemeris` with `element_set_blocks` refuses the whole request when one set cannot be propagated across its neighbors' epochs ("SGP4 fails for NORAD 40108
at 2025-04-30T03:03:17Z"). A11b is amended in that one respect. Each set is propagated alone, in a fresh module, by `propagate_ephemeris` over the interval (epoch of the set before, its own epoch], at most 48 h back (the first set: 6 h),
every 300 s, TEME; a set the module cannot propagate gives no states, is dropped and is counted in the row of every prediction whose history holds it (failedSets). The pseudo-observation series up to t_k, the 120 h, the 48-state floor and
everything else in A11b stand. The partial rows of the first run (10) were moved aside unread and the job started again from empty row files.

### A11e - 2026-10-24, after the rows of M24 on the archive were read, before any row of this check was scored: the detector on planted burns, the pipeline check

The rows of M24 on the archive were read once the job finished: in the pre-burn windows 2 of 98 detections lie within 92 min of TIG and 96 elsewhere, 97 % of them in the first tenth of the 72 h window; in the burn-free windows 342 of 651 report a
burn (A11). Before the misses are put down to the detector or to NASA's ephemerides, the same chain (the conversion to TEME by foundation/frames, the environment loaded by `load_environment`, `detect_maneuvers`) is run on arcs whose burn is
known exactly. A first look, made before this registration, ran six cases on the first 8 satellites of M22's list and printed the detected epoch and delta-v (in-track 1 m/s: 3 of 8 within 92 min of the burn; radial 1 m/s: 7 of 8; cross-track
1 m/s: 6 of 8 within 92 min, some with 0.4 of the delta-v; burn-free: 3 of 8 reported a burn); those 8 satellites are in the sample below. Registered: the 48 satellites of M22; an arc of 60 h, the registered truth from its start to t_b (24 h, every fifth
state) followed by the first 36 h after t_b (every 300 s) of an M22 case, so that the burn is at 24 h of the arc; cases: the control (no burn), in-track (V) impulses of 0.1, 1 and 10 m/s, radial (U) and cross-track (W) impulses of 1 m/s. A detection
within 92 min of t_b is a hit. Reported per case: hits, detections elsewhere, no detection, the median [10th, 90th percentile] of the epoch error of the hits, the median |delta-v| over the planted delta-v and the V share of the hits, and the share of
detections in the first tenth of the arc. Rows: source m24p (rows/sdngp/<build>/m24p.s*.jsonl, four shards). This is a check of the pipeline, not one of M22 to M33.

### A12 - 2026-10-24, before any row of build 04f7c2d1d50f or of its new measurements was read: the eighth build (detector from the theory's own transition, joint segment fit, launch_set with $BOV, launch_batch)

Coordinator, 2026-10-24: side B's dist 04f7c2d1d50f (1,385,409 bytes; closed-modules task branch 65c1c6c, package sdn-ap-propagator, no uncommitted file at the copy). The detector's burn signature now comes from the theory's own
transition with weights of one sample per revolution; a joint segment fit estimates y0, delta-v and t_b over the whole arc; SGP4XP gains amendment 5 and the cross-track drag terms; new methods `launch_batch` and a $BOV input to
`launch_set`. The coordinator asks for the re-score on every source, as A10 did, with the M24 control (the 96 burn-free Starlink windows) and the ISS windows on the new detector first, then M22, M23, M25 and M28 on the new
build, and M31 and M32 on `launch_set` and `launch_batch`; the held-out discipline stands (no row of side B's E2E is read). The rename map is the one A11 registered (package sdn-ap-propagator, fit_sdnap, SDNAP_*; the rows keep the
historical keys), and this is the first dist that carries it: the adapters are tested on it by the probes below.

Disclosure. The coordinator's message carries side B's own figures on its own burn-free FFM-1 arcs (no false alarm on 48 arcs of 72 h; delta-v error U 9.8 %, W 9.8 %, V 11.5 %; epochs within 0.9 min) and on its own batch
(the batch fit 2.12 / 10.4 / 26.0 km against 1.08 / 5.2 / 12.8 km for per-object fits, days 1 / 2 / 3), and the subject line of the head commit 65c1c6c, which printed with the path, carries calibration counts on burn-free FFM-1
arcs (48 arcs of 72 h and 24 of 48 h, none; threshold 20 at 0.35 and 0.005 per object-year). All were seen before this registration; no choice below uses a figure of either. The interface is read from the module's JSON manifest
(methods, ports, descriptions) and its build provenance record (version, SHA-256) only; none of the module's source, README, tests or E2E rows was opened. The head-commit subject of the clean-room specification worktree also printed with
a directory listing; nothing of it was opened. Probes, run before this registration (outputs not kept except as stated): the manifest's methods and ports; the adapter on the new dist (one `fit_sdnap` of the first 24 h of the captured
satellite 799501704, which printed its fit statistics: fit RMS 0.099 km, maximum 0.227 km, 14 iterations, span 24 h; the comment and the parameter names parse as before, the new parameter SDNAP_ARC_END_MIN is read as SDNGP_ARC_END_MIN;
the batch entry returns states, and the lowering switch answers); `launch_set` with a burnout vector in km (accepted) and in m (refused: "its radius is not an Earth orbit's"); `launch_batch` without a parent state (refused: it takes the
parent state as a 'launch' $LAM or a 'burnout' $BOV).

What the manifest says about the changed interfaces, and the adapter rule that follows. `detect_maneuvers`, `maneuver` and `launch_batch` now declare `space_weather_table`, `space_weather` and `density_correction` ports; build 35cd83a2b714
had none on the first two and read the instance's environment (`load_environment`, A10d). For this build the adapters send the environment in force as the `space_weather_table` port with every call that declares one (the saved table
for M22, M23, M24, M24c and M24p; the 2,703-row table of the years for the ISS archive) and make no `load_environment` call: nothing is left in the instance between calls. `detect_maneuvers` returns, without a burn, the burn-free set,
and with one the pre-burn set, the post-burn set by the impulse map and a $MNV (still at most one burn per call). An earlier snapshot without a manifest file keeps the old path.

1. Re-score. Every job of `sdngp-run.mjs` runs again on build 04f7c2d1d50f with the rules of A9b to A11e: the G1 rows of every source (baselines, SPK and pack windows, Starlink, fit length, lowering, the default-span rows, the Moon-centered
windows, the cislunar and heliocentric segment windows) and the events sources m22, m23, m28, m24, m24c, m24a, m24p, m29 and m30; one store snapshot copy, rows in rows/sdngp/04f7c2d1d50f/. Reported as counts, as A10 did: the windows both
builds ran; how many are identical to the last digit (fit RMS and every held-out day), 24 h rows and default-span rows separately; the sources that differ, with the median and largest change of the day-1 / 2 / 3 error; the
fit-implausible refusals (new, by source and name). The coordinator names SGP4XP amendment 5 and the cross-track drag terms as changes; the identity counts show where they reach the rows.

2. The detector (the measurement the coordinator ranks first), with the windows, scoring and reading of A10c, A10d, A11 and A11e unchanged. M24c: the 96 burn-free FFM-1 Starlink windows of 72 h (48 satellites, 192 object-days): windows with a detection and
false alarms per object-year over distinct epochs, beside the 64 of 96 of 35cd83a2b714. M24 on the ISS: the 26 windows of the two NASA files with no reboost (17 of 26 reported a burn before). M24 on the ISS archive (m24a): the 98 pre-burn,
6 post-burn and 651 burn-free windows (one pre-burn window was refused before): hits within 92 min of TIG (2 of 98 pre-burn before), the epoch error, |delta-v| over the planned value and the in-track share of the hits, and the false
alarms per object-year over the 4.37 object-years (76.6 per object-year before). The planted-impulse arcs (m24p): hits by case, the control's detections, and the share of detections in the first tenth of the arc. The planned values of the
headers stay planned values. Nothing is thresholded; the numbers go beside those of 35cd83a2b714 in one table per measurement.

3. M22, M23, M25, M28 as registered in A10 (items 2, 3, 6 and 4; sample, cases, FFM-1 truths and scoring unchanged; the truths are cached and independent of the build), with `maneuver` and `reentry` receiving the saved weather table as
their port. Reported beside 35cd83a2b714: the excess over the control by magnitude and axis (M22), A against B by duration (M23), the treatment of the Moon-centered windows against the lists (M25), and the hand-off criteria against
the error by level and the reentry epoch error (M28).

4. M29 and M30 on the new build: the same predictions as A11b and A11c (the same element-set epochs and pseudo-observations; the 19 lowering Starlinks of M30). The M30 predictions of this build are issued when its job runs; both builds'
predictions are scored later against the same TIP and decay messages, and the issue times are in the rows.

5. M31 and M32. What the two methods take is in the probes above. The captured batch (the 27 satellites first seen 2026-10-24T05:01Z, provisional ids 799501701 to 799501727) holds each satellite's states from 2026-10-24T08:48Z to 09:22Z on
(8 h after separation), derived and without a parent state at the separation epoch; the batch-joint model (all objects at the parent's position at t0, separated by their own delta-v) has no data to be fitted to there. The protocol is
registered in A12b, before any row of it is generated or read, in two parts: the per-object fits of 6, 12 and 24 h on the captured trajectories (with SGP4 and SGP4-XP beside), and a synthetic FFM-1 batch with a known parent state for
`launch_set` and `launch_batch`.

6. Not run, and why. M26 needs the per-file states of the Starlinks (the raw files are not kept) for the agreement with file-to-file differences; M27 needs the notices (QZSS NAQU, BeiDou, GPS NANUs), which the local archive does not hold
(fetching them needs the coordinator's approval and a registry entry); M33 needs files of an orbit raise, which the batch has not begun. The detector's counts on the GEO and IGSO precise orbits are not a measurement against notices and are
not reported as M27.

7. Rows and runs. `node experiments/sdn-gp-starlink-ffm-match/sdngp-run.mjs --workers 10 --pin 04f7c2d1d50f` (the snapshot was taken at 14:11 local time and is identified by its hash); failures are rows with the refusal by name, never
dropped; a rerun after a failure repeats only the failed jobs. No raw operator, ISS, Space-Track or unlicensed data are committed; the committed results are aggregates. American spelling in all generated text.

8. Report: the identity counts and the sources that differ; the four detector measurements beside 35cd83a2b714; M22, M23, M25 and M28 beside it; M29 and M30; M31 and M32 as registered in A12b; what is missing. E2E: `run.mjs --check` with the replays
of A10 and A11 (an impulse, a finite burn, a decay node, an ISS window, two archive windows, a planted-impulse arc, a reentry prediction and a lowering reentry) on the pinned new build against its stored rows.

### A12b - 2026-10-24, before any row of M31 or M32 was generated or scored: per-object fits of the captured batch, and synthetic FFM-1 batches with a known parent state for `launch_set` and `launch_batch`

Probes, run before this registration (structure only; nothing of their numbers is used except the three checks stated). (a) `launch_set` accepts a $LAM INSERTION orbit (osculating elements in GCRF at the set's epoch; a circular orbit of 6,630 km at 70 degrees)
and its set reproduces the parent state at that epoch to 2 m and 1 mm/s, which checks the frame label, the units and the argument of latitude (for a circular orbit it is the mean argument of latitude, so no anomaly conversion is made in JavaScript);
a $BOV is read in km and km/s in Earth-fixed axes (a burnout vector in m was refused), which this experiment cannot make without Earth-orientation rows for foundation/frames, so burnout vectors are not used. (b) `launch_batch` reads TEME $OEM blocks only (a block in
GCRF was refused), takes the parent state as 'launch' or 'burnout' (refused without), and returns one set per input block in input order, each carrying the block's object name and NORAD ID, at the parent's epoch, with B_EFF, KAPPA, TAU0, TAUC,
TAUS and ARC_END_MIN; the probe batch was three FFM-1 objects of 7 h and no accuracy was read. (c) FFM-1 ignores an impulse planted at the start epoch of its arc (a 0.5 m/s in-track impulse there left every sample unchanged to the meter,
while the same impulse 60 s after the start moved the samples by 259 m at 10 min and 6.87 km at 1 h), so the separations below are planted 60 s after the start epoch.

1. Why two parts. The captured batch holds each satellite's states from 08:48 to 09:22 UTC on 2026-10-24, 8 h after separation, and no parent state: `launch_batch` cannot be fitted to it (the joint model puts every object at the parent's position at the release epoch), and
`launch_set` cannot be initialized from the launch provider's insertion orbit. The accuracy of the first set and of the batch-joint fit is therefore measured on synthetic batches whose parent state is known and whose truth is FFM-1; the captured batch gets the
per-object fits of the same lengths, and the scoring on newer files registered in A11c stays for 2026-10-25 to 2026-10-28.

2. Part 1, M31 on the captured batch (rows m31: 27 satellites x 3 fit lengths). From the first state of each satellite's file (the start of its registered-form FFM-1 trajectory, 96 h at 60 s), fits of 6, 12 and 24 h by SDN-AP (`fit_sdnap`, declared span, the saved space-weather
table), SGP4 and SGP4-XP, held-out days 1 to 3 after the fit end inside the trajectory, scored as the G1 rows. Reported per fit length: the median and 90th percentile of the 3D RMS by day and arm; the SDN-AP fit RMS; the SDN-AP B_eff (median, range), its
median sigma, and the 6 h and 12 h values over the 24 h value (median, 10th and 90th percentiles), which is the DESIGN's "B_eff identifiable from 6 h".

3. Part 2, M31 and M32 on synthetic batches (rows m32). Four batches of 27 objects (the size of the captured one) with seeds 11, 12, 21 and 22. Parent: circular, a = 6,630 km (about 250 km altitude, the captured batch's regime), inclination 70 degrees, node and
argument of latitude uniform in [0, 360) degrees (one decimal) from the seed (mulberry32), epoch EPOCH0 = 2026-10-24T00:00:00Z. Object k: separation delta-v in FFM-1's RTN axes (U radial, V in-track, W along r x v) at EPOCH0 + 60 s, each axis N(0, sigma^2) with
sigma = 1.0 m/s for batches 11 and 12 (the module's stated prior) and 0.25 m/s for 21 and 22 (a quarter of it, outside the prior); Cd A/m the 27 fitted B_eff of the captured batch (0.0136 to 0.0152 m2/kg), shuffled by the seed; Cr A/m 0.19 as the captured fits. Truth:
FFM-1 (propagator/ffm, full force as the registered truths: the registered integrator, tolerance 1e-13 and maximum step 120 s, the saved environment) from the parent state at EPOCH0 with the object's impulse, samples every 60 s from EPOCH0 + 1 h (the first file's
start) to EPOCH0 + 98 h, GCRF; `m32-truth.mjs` makes them, independent of the build. The parent state given to the module is exact (a $LAM, GCRF osculating elements at EPOCH0, which is 60 s before the separation): the best case for the joint fit; a real
parent carries the provider's sigmas. For each fit length L = 6, 12 and 24 h (fit interval: first file start to start + L; days 1 to 3 after the fit end, scored as the G1 rows): (A) per-object SDN-AP, `fit_sdnap` with the declared span and the saved table; (B) the
same with the `launch_set` set as `prior`; (C) `launch_set` alone (independent of L): the parent's set for every object, days 1 to 3 after the first file's start; (D) `launch_batch` on the 27 TEME blocks of the L hours with the $LAM as 'launch' and the saved table, one set per object
(matched to its object by the block's name, which the set carries), days 1 to 3 after the fit end; (E) per-object SGP4-XP and SGP4. Reported per separation sigma (the two batches of each pooled, 54 objects): the median and 90th percentile of the 3D RMS by arm, fit length and day;
the paired difference (D - A) per object and day (median; the number of objects where D is lower); the median relative B_eff error of A, B and D (|B_est / B_true - 1|); `launch_set` alone (C); the refusals by name. Nothing is thresholded. Side B's own figures for its batch
(2.12 / 10.4 / 26.0 km against 1.08 / 5.2 / 12.8 km) are not used in any choice here.

4. Jobs. Sources m31 (3 shards) and m32 (4 shards) in `sdngp-run.mjs` (`--only m31,m32`); the truths first (`m32-truth.mjs`). A batch whose truth FFM-1 cannot integrate is reported by name. The association with catalog sets (the `catalog` port) and the thrust-onset test
(M33) need the later catalog assignment and files of an orbit raise, which the captured batch has not reached; they are not run here.

### A12c - 2026-10-24, after the rows of M24 on the archive, M24c and the planted arcs of build 04f7c2d1d50f were read, before any row of this diagnostic was scored: where the new detector reports the burns of the ISS archive

Observations that prompt it (read from the rows of 04f7c2d1d50f, nothing else of the build). The planted impulses of A11e are found (48 of 48 arcs at 1 m/s along each axis, epoch error 0.2 min median, |delta-v| over planted 1.00; 40 of 48 at 10 m/s, 0 of 48 at 0.1 m/s;
the control reports a burn in 1 of 48 arcs), the burn-free FFM-1 Starlink arcs report a burn in 5 of 96 windows (64 of 96 before) and the burn-free ISS windows (leading 72 h of the files) in 8 of 651 (342 before). In the pre-burn ISS windows, 93 of 98 detections lie
away from the planned TIG: at 32 h before it (the median), 5 % into the 72 h window, with |delta-v| 7 times the planned value and Lambda about 2.5e8. Depth into the file does not explain it (the pre-burn windows start a median 18 h after the file's start, 54 of 99 within
24 h, as the burn-free ones at 0 h). Three readings can be separated by the detector itself on the same states, with the same weather and the same rules: (a) the detection belongs to the stretch before the burn (some feature of those files, or the search's first
allowed epoch); (b) it belongs to the burn being in the window; (c) it moves when the burn is nearer the window's start. Registered diagnostic, for each of the 99 distinct planned burns (the file of its pre-burn window, A11): m24b-before, the states from max(file start, TIG - 36 h) to TIG - 2 h
(no planned burn of any cluster inside or within an hour of it; skipped, with the reason, when it holds fewer than 48 states); m24b-across, the states from max(file start, TIG - 12 h) to min(file stop, TIG + 36 h) (a window of 48 h with the burn at 12 h; skipped when it holds a second cluster's burn). Reported: for
before-windows, the windows with a detection, its position in the window and |delta-v|; for across-windows the hits within 92 min of TIG, the detections elsewhere (their offset from TIG) and none, and the |delta-v| over the planned value of the hits. Both builds (35cd83a2b714 and 04f7c2d1d50f) run it. The rows are m24b
(`events-sdngp.mjs --source m24b`, one shard). This is a diagnostic of the pre-burn windows, not a new measurement against the design's M24; the numbers of A12 item 2 stand as measured.

### A12d - 2026-10-24, after the rows of the diagnostic of A12c were read, before any row of this extension was scored: the stretch after the burn, and a window that leaves the detector no early epoch

Read from the rows of A12c (both builds). Build 04f7c2d1d50f: the stretch before the burn, with no burn in it, reports a burn in 1 of 96 windows (35cd83a2b714: 12 of 96); the 48 h windows with the burn at 12 h report a burn in all 96, at the planned TIG (within 92 min) in 9 and
elsewhere in 87, at a median 8.1 h before TIG, that is 3.9 h after the window's start; the delta-v of the hits over the planned value has a median of 1.07 (35cd83a2b714: hits 4, elsewhere 92, median 9.4 h before TIG, 1.38). So the early report follows the window's start (the first epoch
the detector allows, 48 states of 240 s = 3.2 h, plus the fit), not the burn, and appears only when the burn is inside the window. Two further windows on the same states, same weather, same rules, for the same 99 planned burns (skipped, with the reason, when the file does not hold 48 states of
them or another cluster's burn lies in or within an hour of them): m24b-after, from TIG + 2 h to min(file stop, TIG + 38 h) (the stretch after the burn); m24b-tight, from TIG - 4 h to min(file stop, TIG + 24 h) (the window's first allowed epoch is then 0.8 h before TIG, so the early epoch of the 12 h and 36 h
windows is not available). Reported as for A12c: for after-windows the windows with a detection, its position and |delta-v|; for tight-windows the hits within 92 min of TIG, the detections elsewhere (offset from TIG) and none, and the |delta-v| over the planned value of the hits. Both builds. Rows m24b.

### A13 - 2026-10-24, before any row of build 61d4ec4e6a12 was read: the ninth build (aligned integrator nodes, smooth resonance weights, the zero-delta-v and cross-track finite-burn fixes, reentry continuation, per-object offsets in launch_batch)

Coordinator, 2026-10-24: score side B's newer dist 61d4ec4e6a12 (1,395,863 bytes; closed-modules task branch 03388d3, package sdn-ap-propagator) instead of 04f7c2d1d50f, and, since A12 had registered 04f7c2d1d50f, add it as an amendment without discarding the earlier build.
Side B's account of what changed since 04f7c2d1d50f: integrator nodes aligned to the drag's 3-hourly kinks, the 0 UT weather jumps and the arc end; resonant terms weighted smoothly by the current elements; the zero-delta-v map fix; the cross-track finite-burn fix; reentry continuation
with minute steps below 150 km; per-object element offsets and tau in `launch_batch`; amendment 6 in SGP4XP. Side B claims burn-free FFM-1 arcs at 0.086 / 0.128 / 0.150 km for days 1 to 3 against 0.090 / 0.163 / 0.232 km before. That is its claim; this registration stands ahead of every row of the build.

Disclosure. The wasm in the module's tree at 15:27 local time on 2026-10-24 has the SHA-256 prefix 61d4ec4e6a12 and the size the coordinator names, and agrees with the build-provenance record of the tree (version, SHA-256); it was copied to the store at once and every job runs that copy. The snapshot
records the tree's HEAD, f0ea4b4 (a later commit than 03388d3; the head subject is a documentation commit), with one untracked file in the tree; the build is identified by its hash. The subject lines of the three newest commits printed with the check of the dist; those of 03388d3 and of the commit before it carry figures of side B (finite-burn
excess over the control in km, "joint beats per-object fits at 12 h, ties at 24 h", E2E spans): seen before this registration, used in no choice below. The module's JSON manifest is identical to that of 04f7c2d1d50f (the two files compare equal after parsing: the same methods, ports and descriptions), so the adapters of A12 apply
unchanged. No call was made on this build before the registration.

1. The runs. Everything A12 registered is run again on 61d4ec4e6a12 with the same rules, windows, samples, truths and scoring: item 1 (every job of `sdngp-run.mjs`: the G1 rows of every source and the events sources m22, m23, m28, m24, m24c, m24a, m24p, m29, m30), item 2 (the detector), item 3 (M22, M23, M25, M28), item 4 (M29 and M30; the M30 predictions of this build are issued
when its job runs), A12b (M31 on the captured batch and M31 and M32 on the four synthetic batches) and A12c and A12d (the diagnostic of the ISS pre-burn windows). Rows in rows/sdngp/61d4ec4e6a12/, from one `sdngp-run.mjs --workers 12 --pin 61d4ec4e6a12` (its job list now includes m31, m32 and m24b); the PLAN is committed before each start, because a job that starts
while it is edited and uncommitted stops at the frozen-plan check (19 baseline jobs of 04f7c2d1d50f did, and were rerun whole).

2. One extension of the diagnostic, informed by the rows of 04f7c2d1d50f and registered ahead of every row of 61d4ec4e6a12. A12d found that a window with 4 h before the burn gives the planned burn in 95 of 95 windows while one with 12 h before it gives an early report in 87 of 96. To place where that changes, three more windows
on the same states and rules, for the same planned burns: m24b-p6, from TIG - 6 h to min(file stop, TIG + 24 h); m24b-p8, from TIG - 8 h to the same end; m24b-p24, from TIG - 24 h to the same end. Reported as the tight window of A12d, for all three builds (35cd83a2b714 and 04f7c2d1d50f with `--only m24b`, 61d4ec4e6a12 in its run).

3. What is read, and how. The three builds side by side in one table for the detector (A12 item 2 and the diagnostic); for M22, M23, M25, M28, M29 and M30 the previous complete build beside this one (04f7c2d1d50f -> 61d4ec4e6a12), with the identity counts of A12 item 1 against 04f7c2d1d50f. Because side B names changes to the zero-delta-v map (M22's map0 case), the
cross-track finite burns (M23's W cases), the reentry continuation (the refusals by name of M28, M29, M30) and `launch_batch` (M32), those rows are named in the report; nothing is thresholded. If the build changes a fit, the headline tables and the E2E replays follow the newest complete build.

### A14 - 2026-10-24, before any row of M27 was scored: the public GNSS notices (GPS NANUs, QZSS NAQUs) and M27 on GPS and QZSS

Coordinator, 2026-10-24: M27 is approved: fetch the public GPS NANUs and the QZSS and BeiDou notices, one request at a time, add registry entries and license lines, use them for results only, no credentials. The registry has two new entries, navcen-gps-nanu and
qzss-naqu (with docs/data-licenses.md regenerated). The fetch (`fetch-gnss-notices.mjs`), 5 s apart on each host: NAVCEN's documented scripted access, https://www.navcen.uscg.gov/sites/default/files/gps/nanu/2026/2026NNN.nnu for NNN = 001 to 097 (097 is the last; 098 answers 404), 97 files, and the pages
that describe the archive (robots.txt, the instructions PDF, the NANU page and its abbreviations page; the apex name navcen.uscg.gov that those pages redirect to failed its name lookup on most attempts from this host, so the pages came through after retries); the QZSS operational information site's NAQU page
(https://sys.qzss.go.jp/dod/en/naqu.html: the year's 261 messages, each in a hidden field), its format page and the website's terms of use (https://qzss.go.jp/en/policy/rule.html: free use, commercial use permitted, source citation required, edited content to be stated as such). The QZSS Web API is not used: its page limits the
API to not-for-profit tools and services. BeiDou: the notices of the CSNO test and assessment center (www.csno-tarc.cn, the announcement page the BeiDou site links) did not answer from this host (connection timeouts or failed requests in eight attempts on 2026-10-24, the last two recorded in `hac/gnss-notices/beidou-attempts.json`; no workaround was
tried), and the BeiDou site en.beidou.gov.cn carries only advisories of satellite upgrade and maintenance outages of a few hours (six in April 2026), which are not orbit notices; nothing of BeiDou is used, and M27 is not run for BeiDou. Before this registration the NAQU page, the first NANUs and the structure of
both were read (counts of notices by type and the delta-V outages below); no orbit state of any window below was read, and no detection was scored.

1. What is scored. The detector's reports on the GPS satellites and the QZSS satellites against the forecast delta-V outages of the notices. Orbits: the archive's reference states (GCRF, 5 min), GPS from the ESA/ESOC final orbits (ESA0OPSFIN), days 2026-001 to 2026-266 (34 GPS satellites with 7 to 252 daily files each), and QZSS from the GFZ multi-GNSS rapid orbits (GFZ0MGXRAP), days 2026-004 to 2026-273 (J002 and J004 inclined geosynchronous, J005 QZS-1R and J003 geostationary). QZS-6 (SVN 007, PRN 200), which has 14 of the 33 QZSS outages, is not in the product: those 14 are not scored.
Windows: 72 h every 24 h from the first state of each satellite's series, TEME by foundation/frames, every 300 s state, `detect_maneuvers` with the daily space-weather table of the years sent as for every other detection (these orbits are far above the drag regime); a window with fewer than 48 states or a gap of more than 15 min is
skipped and counted. Rows m27 (`events-sdngp.mjs --source m27`, 12 shards), on builds 61d4ec4e6a12 and 04f7c2d1d50f (the two builds whose detector is registered: A12, A13).

2. The notices. A delta-V outage is a forecast delta-V notice (NANU or NAQU type FCSTDV) that no cancellation (FCSTCANC) references, with the times of a rescheduling notice (FCSTRESCD) where one references it; its actual interval is that of the summary notice (FCSTSUMM) that references it (the outage the maneuver and its settling
needed, inside the forecast window). The 24 GPS outages of 2026 are 12 h forecast windows (one of 24 h; 22 with a summary of 4 to 8 h; 19 end before 2026-09-23, the end of the orbits) and the 33 QZSS outages 3 to 4 days (32 with a summary of 0.7 to 2 days; of the four satellites with orbits, 16 end before 2026-09-30, 12 of them for the geostationary J003). `m27-events.mjs` writes the windows (satellite, times, notice numbers, the other outage
notices FCSTMX and UNUSABLE as windows) to results/sdn-gp-starlink-ffm-match/gnss-notice-events.json; no notice text is committed.

3. Scoring, fixed here. Per satellite the distinct detections (the epochs of all its windows' detections, merged when within 6 h of the previous one). An outage is scoreable when its forecast window plus 6 h either side lies inside the answered windows of its satellite. It is detected when a distinct detection lies inside its forecast window
plus or minus 6 h (the primary statistic) and, separately, inside its actual interval plus or minus 6 h (when it has one). Reported: outages in the notices, with and without an orbit series, scoreable, detected by each rule; for the detections inside an actual interval the offset from its start (hours: median, 10th and 90th percentile);
the chance level, the share of a satellite's covered time inside its forecast windows plus or minus 6 h, which is the hit probability of a detection at a random epoch (median over the satellites with outages); false alarms: distinct detections outside every forecast window of their satellite plus or minus 6 h, in total, per object-year over the
covered time, and how many of them lie inside another outage notice's window (FCSTMX or UNUSABLE, plus or minus 6 h); the delta-v of the detections (median, maximum). For QZSS the geostationary satellite's outages are reported on their own, the DESIGN's prediction being that the station-keeping trims of geostationary satellites lie below
the detectors' floors (the modules' detector found 4 of 11). The daily solutions are joined in each window; the jump at a file boundary (23:59:42 UTC) is part of what is measured: false alarms within 2 h of a file boundary are counted too. Nothing is thresholded.

4. E2E. `run.mjs --check` replays one GPS and one QZSS window on the pinned build against the stored rows. American spelling in all generated text.
