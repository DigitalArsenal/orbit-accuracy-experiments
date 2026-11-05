# DSST beside SGP4, both XPs, AP and FFM on the operator-theory windows

Registered by lane claude-dsst-d9 for task experiments-dsst-arm-registration-20261105 (parent sdn-ap-case-program-20261105), before any window is fitted. `windows.mjs`, `windows.json` and `run.mjs` beside this file are part of the registration. A measurement: no pass or fail statement. The SDN-AP session reviews this file before the first fit; a change it asks for is a dated amendment at the end, and no row is written before the amended file is on origin/main.

The owner, 2026-11-05, verbatim: "accuracy vs the other semi-analytic theories". SGP4, SGP4-XP and AP are the averaged theories in `results/ap-truth/compare/cells.json`. This adds the Draper Semianalytic Satellite Theory (DSST), through Orekit's implementation, on the same windows, inputs, leads and truth, and measures its cost the way the registered cost benchmark measures the others.

## The arm

Orekit 13.1 (CS GROUP, Apache-2.0; `orekit-13.1.jar`, Implementation-Build f3f53ca1, 2025-07-27) with Hipparchus 4.0.1, on OpenJDK 25.0.2. The same engine, jars, data directory and launch the FFM evidence suite's engine benchmark uses (modules checkout `propagator/ffm/tests/evidence/engines/OrekitBench.java`, `java -cp "<jars>/*" <Source>.java <orekit-data> <work> <out.json> ...`): jars `/Users/tj/software/gmat09-authority/jars`, data `/Users/tj/software/gmat09-authority/orekit-data/orekit-data-main` (`tai-utc.dat`, `finals2000A.all` as issued 2026-08-03, JPL DE440 `lnxp1990.440`). The suite's parity fixture (`tests/orekit_reference.test.mjs`) replays a stored Orekit 13.1 trajectory and is not rerun; the benchmark's live path is reused. No new runtime, dependency or network fetch. The driver is one Java source file beside this one, `DsstArm.java`, written in part 2 and pinned by SHA-256 in every row.

Theory: DSST, the first-order generalized method of averaging in equinoctial elements (a, h, k, p, q, lambda), mean elements integrated numerically, short-periodic terms added back for every osculating state (Danielson et al. 1995; Orekit `DSSTPropagator`). Mean-element integrator: Hipparchus DormandPrince853 with steps between one Keplerian period and 86,400 s, tolerances `DSSTPropagator.tolerances(1 m)`. States in GCRF; the body-fixed frame ITRF (IERS 2010 conventions) on the daily `finals2000A` rows without sub-daily corrections, as the benchmark gives Orekit.

Forces, every regime, no setting chosen on a window:

| Force | Setting |
|---|---|
| Central attraction | `DSSTNewtonianAttraction`, GM 3.986004415e14 m^3/s^2 |
| Zonal | `DSSTZonal`, J2 to J20 of EGM2008 (the FFM-embedded coefficients written by `tests/fixtures/orekit/make-gfc.mjs`, radius 6378136.3 m); short periodics at Orekit's defaults for degree 20 |
| J2 squared | `DSSTJ2SquaredClosedForm` |
| Tesseral | `DSSTTesseral`, the same field to degree and order 20, Earth rotation 7.292115e-5 rad/s; m-dailies, short periodics and the resonant terms the model finds for the orbit, at Orekit's defaults for 20x20 |
| Third bodies | `DSSTThirdBody` Sun and `DSSTThirdBody` Moon from DE440, Orekit's default truncation |
| Radiation pressure | `DSSTSolarRadiationPressure`, cannonball, 1361 W/m^2 at 1 au, Earth shadow of a 6378137 m sphere; coefficient C_R A/m |
| Drag | `DSSTAtmosphericDrag` with Orekit's NRLMSISE-00 (equal to FFM's to 1e-8, `propagator/ffm/README.md`) when the fit's first state has a perigee height below 2,500 km, off above it (FFM's own cutoff); coefficient C_D A/m |

Spacecraft: mass 1 kg and area 1 m^2, so the two coefficients are area-to-mass products in m^2/kg, the units of AP's BTERM and AGOM. Space weather: the window's `$SPW` rows, the ones the AP arm of that window read (`experiments/operator-theory/lib/ap.mjs` `fitWeather` on `lib/weather.mjs` rows for the precise-orbit windows; `harness/cutoff-environment.mjs` `releasedSpwRows` for the vendor pairs), written per window as one CSSI-layout file and read by `CssiSpaceWeatherData`: daily observed F10.7, its 81-day centered mean, daily Ap, the eight 3-hour Kp set from the daily Ap by the Bartels table `cutoff-environment.mjs` carries. For AP: EGM-96 zonal tail to 20 and tesserals to 31 (`propagator/sdn-ap` README, SPEC 16); FFM: 40x40 or 20x20 by altitude (`CHEAPER.md`). DSST's 20x20 EGM2008 is one setting for every regime; it is reported, not tuned.

## Fit method

Orekit `BatchLSEstimator` on a `DSSTPropagatorBuilder` (position scale 1 m; osculating propagation for the measurement model, mean initial state), `DSSTBatchLSModel`, Hipparchus `LevenbergMarquardtOptimizer`, at most 20 iterations and 25 evaluations, parameter convergence threshold 1e-3. Solved for: the six mean equinoctial elements at the arc's end, the cutoff; C_D A/m where drag is on; C_R A/m where drag is off, held at 0.01 m^2/kg where drag is on, so the two never trade. Start values: the arc's last state converted to mean elements (`DSSTPropagator.computeMeanState`), C_D A/m 0.01 and C_R A/m 0.01 m^2/kg, AP's priors (`xp-atmosphere-merit/config.json` `fit`). A fit that does not converge, throws, or returns a non-finite state is a failure row, counted and never dropped; no window is refitted with changed inputs. Each fit reads the arc that ends at the cutoff and nothing after it.

Inputs, by the cells' `input`:

- `precise-orbit`: `PV` measurements at every truth state of the arc on the product's own grid, sigma 1 m and 1 mm/s, weight 1, in GCRF as the harness's truth gate gives them (`experiments/operator-theory/lib/regimes.mjs`, `xp-atmosphere-merit/lib/truth.mjs`), for the fits the cell names (24, 72, 168 or 336 h).
- `operator-file`: the same `PV` measurements from the older file of the pair, the fit hours the cell names from its start (24, 48 or 72 h), the states the arms of `COMPARE.md` and `providers-run.mjs` fitted.
- `laser-normal-points`: two-way `Range` measurements from the ILRS CRD normal points of `ap-observations-2/PLAN.md`'s 206 cutoffs, station coordinates from the weekly ILRS SINEX at or before the cutoff as that plan reads them, Mendes-Pavlis tropospheric delay at the station's recorded meteorology, and the sphere's center-of-mass correction from the ILRS tables held in the archive; a sphere without one is not fitted and its row says so.

No SGP4 set, state or element enters this arm.

## Windows and leads

The windows are the ones behind `results/ap-truth/compare/cells.json`, read as keys from the stores under `/opt/data/sdn-archive/operator-theory` (`windows.mjs`; key fields only, no arm figure): 24,764 windows, SHA-256 of the sorted keys `d42db35f66b1a779578771406c71565b90667e7ca0aa0ee6ebe693f0cd9c3f5e` (`windows.json`). By store:

| Store | Reference | Input | Windows | Registered in |
|---|---|---|---:|---|
| `ap/b051/truth` | truth | precise-orbit | 944 (`P`, strong drag 2025) | `AP5.md` Part T |
| `ap/b051/truth2` | truth | precise-orbit | 1,812 (`P` 755, `S1` 302, `GN` 755) | `AP5.md` Part N |
| `ap/b051/regimes` | truth | precise-orbit | 407 (`LS` 90, `DO` 150, `GD` 55, `IG` 60, `GE` 45, `HE` 7) | `AP6.md` |
| `ap/b051/regimes-hx` | truth | precise-orbit | 19 (`HX`) | `AP6.md` |
| `ap/b051/regimes-wa` | truth | precise-orbit | 84 (`WA`) | `GEO-TRUTH.md` |
| `ap/b0411/laser/forward` | next | operator-file | 19,399 pairs, 20 laser prediction sources | `COMPARE.md` |
| `ap/b0411/providers` | next | operator-file | 1,893 pairs (GPS, GLONASS, ISS, Planet, Intelsat, SES, China Space Station); 357 Starlink rows dropped unread | `providers-run.mjs` |
| `ap/ap-observations-2/rows` | truth | laser-normal-points | 206 cutoffs, five spheres | `ap-observations-2/PLAN.md` |

Fits and leads per cell are `cells.json`'s (`windows.json` `cells`): against truth, a lead counts from the fit's end, 24, 48, 72 and 168 h (336 h fits on TESS; 168 h fits on Chandra); against the next file, a lead counts from the older file's start to the newer file's start, as `COMPARE.md` defines it, 12 to 168 h. The DSST row of a window scores every (fit, lead) its cell has. `run.mjs` recomputes the window set from the stores and refuses a digest other than the registered one.

## Holds

Never read: every Starlink group (dropped on the line, unparsed); the six held Galileo satellites (NORAD 43567, 37847, 41862, 41174, 43055, 41175); Swarm and GRACE-FO truth after 2026-10-31; C2's rows and its hold-out; every operator capture; in the vendor pairs, `VENDORS.md`'s excluded objects. `run.mjs` refuses a key outside `windows.json`'s set and any held key before it writes a row.

## Scoring

Forward error only, never a fit residual. Against truth: `xp-atmosphere-merit/config.json` `scoring` as the other arms were scored: the 3D RMS position error in km over lead day k's truth states on the 300 s grid, a day entering when the truth holds 260 of its 288 grid epochs, the along-track, radial and cross-track RMS beside it; a non-finite state at a scored epoch fails the window. Against the next file: `score.mjs`'s statistic for that store, on the DSST states at the same epochs. Rows are written in the stores' row format, keyed as the stores key them, so `compare-cells.mjs` can take the DSST column by key. Tables: per (reference, regime, fit, lead) the median and 95th percentile in km with n, beside the cells' SGP4, XP (whiteroom), XPU (Space Force), AP, FFM20, FFM40 and FFMfull as `cells.json` carries them, unchanged; by window, ln(e_AP / e_DSST) with `AP5.md`'s cluster bootstrap interval, report only. The cells' `burnsInFit` and `burnsInForecast` are carried as they are.

## Cost

Measured as experiments-sdn-ap-cost-benchmark-20261105's `BENCHMARK.md` measures the others; it is not on origin/main at this registration, so its record's measures are stated here and bind: one named machine (Mac Studio, Apple M3 Ultra, 28 cores), single thread (`-XX:ActiveProcessorCount=1 -XX:+UseSerialGC`, one window at a time), the step named; per window, for the fit and for the flight separately, CPU user plus system (`OperatingSystemMXBean.getProcessCpuTime` across the call) and wall, per object-day at the output step (300 s against truth; the file's own epochs against the next file); peak heap (the heap pools' peak usage, reset before each call); process RSS (the JVM's maximum resident set size, `/usr/bin/time -l`); jar bytes (Orekit and Hipparchus) in place of module bytes; the bytes of one stored fit row in place of bytes per object in the epoch store. One uncounted window warms the JVM. Medians and spreads over the window set, beside the benchmark's figures for AP, FFM, SGP4 and both XPs. If `BENCHMARK.md` lands with other measures, a dated amendment adds them and drops none of these.

## Prior art

DSST and its theory:

- Cefola, P. J., Long, A. C., Holloway, G., "The Long-Term Prediction of Artificial Satellite Orbits," AIAA 74-170, 1974. https://doi.org/10.2514/6.1974-170 (cite).
- McClain, W. D., "A Recursively Formulated First-Order Semianalytic Artificial Satellite Theory Based on the Generalized Method of Averaging," Vol. 1, CSC/TR-77/6010, 1977 (revised 1992); Vol. 2, CSC/TR-78/6001, 1978 (cite).
- Early, L. W., "A Portable Orbit Generator Using Semianalytical Satellite Theory," AIAA 86-2164, 1986. https://doi.org/10.2514/6.1986-2164 (cite).
- Danielson, D. A., Neta, B., Early, L. W., "Semianalytic Satellite Theory (SST): Mathematical Algorithms," NPS-MA-94-001, Naval Postgraduate School, 1994 (United States government work: self-host).
- Danielson, D. A., Sagovac, C. P., Neta, B., Early, L. W., "Semianalytic Satellite Theory," NPS-MA-95-002, Naval Postgraduate School, 1995 (United States government work: self-host; DTIC and NPS Calhoun hold it).
- Cefola, P. J., Phillion, D., Kim, K. S., "Improving Access to the Semi-Analytical Satellite Theory," AAS 09-341, 2009 (cite).
- Cefola, P. J., Folcik, Z., Di-Costanzo, R., Bernard, N., Setty, S., San Juan, J. F., "Revisiting the DSST Standalone Orbit Propagator," AAS 14-411, 2014 (cite).

Orekit's DSST:

- Bernard, N., Maisonobe, L., Barbulescu, L., Scortan, S., Cefola, P. J., Casasco, M., Merz, K., "Validation of the Semi-analytical DSST Satellite Theory in Orekit," 6th International Conference on Astrodynamics Tools and Techniques, ESA, 2016 (cite).
- Orekit 13.1 documentation, propagation (the DSST section): https://www.orekit.org/site-orekit-13.1/architecture/propagation.html; estimation: https://www.orekit.org/site-orekit-13.1/architecture/estimation.html; API `org.orekit.propagation.semianalytical.dsst`: https://www.orekit.org/site-orekit-13.1/apidocs/org/orekit/propagation/semianalytical/dsst/DSSTPropagator.html (Apache-2.0: self-host).

DSST against SGP4 and other theories:

- Fonte, D. J., Neta, B., Sabol, C., Danielson, D. A., Dyar, W. R., "Comparison of Orbit Propagators in the Research and Development Goddard Trajectory Determination System (R&D GTDS). Part I: Simulated Data," AAS 95-431, 1995 (NPS Calhoun copy: United States government work, self-host).
- Vallado, D. A., Cefola, P. J., "Two TLE Compatible Propagators: SGP4 and DSST," IAC-12-C1.6.3, 63rd International Astronautical Congress, 2012 (cite).
- Setty, S. J., Cefola, P. J., Montenbruck, O., Fiedler, H., Lara, M., "Investigating the Suitability of Analytical and Semi-analytical Satellite Theories for Space Object Catalogue Maintenance in Geosynchronous Regime," AAS 13-847, 2013 (cite).
- Setty, S. J., Cefola, P. J., Montenbruck, O., Fiedler, H., "Application of Semi-analytical Satellite Theory orbit propagator to orbit determination for space object catalog maintenance," Advances in Space Research 57(10), 2218-2233, 2016. https://doi.org/10.1016/j.asr.2016.03.001 (cite).
- Hoots, F. R., Roehrich, R. L., "Spacetrack Report No. 3: Models for Propagation of NORAD Element Sets," 1980; Vallado, D. A., Crawford, P., Hujsak, R., Kelso, T. S., "Revisiting Spacetrack Report #3," AIAA 2006-6753, 2006. https://celestrak.org/publications/AIAA/2006-6753/ (cite).

## Limits

- One implementation at one setting: the figures are Orekit 13.1's DSST at the forces above, not DSST's best.
- Earth orientation comes from `finals2000A.all` as issued 2026-08-03, predicted rows for days after its last observed row; the other arms read the archive's rows as issued at the cutoff.
- Every precise-orbit fit reads products published after the fact, as the other arms' do; against the next file the reference is a center's later prediction, not truth.
- Highly elliptical windows (TESS, THEMIS, Chandra) sit where averaged theories converge slowly; a non-converged fit is a failure row, reported.

No arm, window, setting or rule changes after this registration.
