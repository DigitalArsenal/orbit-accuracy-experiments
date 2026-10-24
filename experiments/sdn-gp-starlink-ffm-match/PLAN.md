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
