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
   aggregates are committed, labelled "COMSPOC Spacebook XP (local scoring only)". Terms: no commercial use, no
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
(Orion, JSC best-estimated trajectory, 2026-04-02 to 04-10), LRO (lunar-centred, 2026-03-15 to 06-14), Psyche, Lucy and
Juno (heliocentric), and TDRSS (type 10, derived from two-line elements: not truth, not used). Substitutions are therefore
THEMIS and Chandra for TESS (HEO), Artemis II for Artemis I, and no Danuri or CAPSTONE.

States come from files/orbit-products `read_container` (SPK types 8, 9, 13), epochs from TDB to UTC by foundation/time
`convert_time`, one call each; the J2000 axes are labelled EME2000. Windows (HEO only, where Earth-centred SGP4 and
SGP4-XP apply): THEMIS A, D, E and Chandra (2018-03-01 to 2018-04-30, after the last leap second in the file's span), fit 24 h
(the registered length) and 72 h (the fit-length result), held-out days 1-3, one window every 48 h; Artemis II's first
segment (the high-Earth-orbit checkout before the translunar burn, 20.85 h) as one short arc: fit 8 h, held-out the
remaining 12.85 h scored as day 1 with a 40 percent coverage rule. Not scored, recorded as awaiting SDN-GP: Artemis II after
the burn (cislunar), LRO (lunar-centred), Psyche, Lucy and Juno (heliocentric; JPL navigation kernels are SPK type 1, which
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
