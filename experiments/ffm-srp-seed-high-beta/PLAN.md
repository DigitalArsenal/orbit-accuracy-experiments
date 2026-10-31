# FFM forecast normal error at high |beta| on GLONASS: a correct area seed, or a wider prior?

Task experiments-ffm-srp-seed-high-beta-20261031. Registered 2026-10-31, before any score. A test with a report. Nothing here changes C3-small (experiments-c3-small-covariance-20261031): not C2's seeds, not P_C2, not its chain, its rows or its results. The coordinator hears first if a result could reach it. Owner, 2026-10-29: "The only thing you should be working on right now is getting the propagators accurate, the covariance accurate, and the conjunction assessment validated."

## 1. Question

C3-small's looks at stored R3 rows (looks, not tests): GLONASS median N error at 6 h is about 0 at |beta| < 30 deg, 0.1 m at 30-60, 0.19 m at 60-75, 0.68 m above 75, peak -1.1 m at beta -87 on plane 2 (54377). ESA and GFZ agree; the sign follows beta. Fitted area-to-mass sits 4.17-4.28 times C2's seed (0.00759375 m2/kg, bus face only, no arrays) at every beta and sags on 54377 to 3.67 at beta -87, with formal sigma 0.45 seed units.

Hypothesis H: once the in-plane signal vanishes, what is left of AGOM's signal is the constant offset of the orbit plane, a/n2 sin(beta), about 6 m. That carries about 0.5 seed units of sigma, so a prior of 1 seed unit pulls AGOM about 20 % of the way back to a seed that is too small, and the shortfall appears as N error with the sign of beta.

Arithmetic at beta -87 on 54377 (seed units of 0.00759375 m2/kg; data sigma 0.50; unpulled value 4.2):

| arm | prior sigma | pull share | AGOM | N at 6 h |
| --- | ---: | ---: | ---: | ---: |
| A0 | 1 | 20 % | about 3.6 | about -0.8 m |
| A1 | 4.28 | 1.4 %, on a gap near 0 | about 4.2 | about 0 |
| A2 | 10 | 0.25 % | about 4.2 | about 0 |

Also asked: what each arm does at low beta; Galileo's seed, and its along-track error at 24-72 h (61 m RMS at 72 h, against 10-14 m on GLONASS, in the calibration rows); which other consumers carry a seed with a tight prior (by reading the code; reported in results/ffm-srp-seed-high-beta/README.md). H does not claim the moderate-beta +/-0.1 m, Galileo's opposite sign at about 0.1 m, or Galileo's along-track error. They are reported.

## 2. Arms

AGOM = Cr A/m, the cannonball's one area parameter. Everything but the seed and its prior sigma is C2's R3 fit (C3's lib/open.mjs settingsFor('R3')): fit_batch version 3, one round, 10 m per axis, GCRF, state + AGOM, b fixed at 0, position prior 100 km, velocity prior 10 m/s, A12's fit controls and forces, RK78, relative tolerance 1e-10, steps up to 120 s, fit track at 600 s.

| arm | satellites | seed, m2/kg | prior sigma, m2/kg |
| --- | --- | ---: | ---: |
| A0, control | GLONASS | 0.00759375 | 100 % of the seed, 0.00759375 |
| A1, published seed | GLONASS | 0.0325046 | 100 % of the seed, 0.0325046 |
| A2, wider prior | GLONASS | 0.00759375 | 1000 % of the seed, 0.0759375 |
| G0, control | Galileo | per object, section 3 | 100 % of the seed |
| G2, wider prior | Galileo | per object, section 3 | 1000 % of the seed |

Galileo has no second seed arm: its seed already holds the arrays and the largest box face, the rule A1 applies to GLONASS, so the same rule gives the same number.

## 3. Seeds

C2's rule (seeds.mjs, C2-A4): AGOM = A/m x Cr 1.3, A the published area, the face named.

- **GLONASS current (A0, A2):** 3.05 m x 2.71 m = 8.2655 m2, the largest face of the body envelope (GLONASS IAC). 8.2655 / 1415 = 0.00584134. x 1.3 = 0.00759375.
- **GLONASS published (A1):** Duan B., Hugentobler U., Hofacker M., Selmke I. (2020), "Improving solar radiation pressure modeling for GLONASS satellites", J. Geod. 94:72, doi:10.1007/s00190-020-01400-9, open access, Table 5: mass 1415 kg; solar panels 30.850 m2; +/-x 4.530 m2; +/-z 3.400 m2. A = the arrays + the largest body surface, C2's rule for Galileo: 30.85 + 4.53 = 35.38 m2. 35.38 / 1415 = 0.0250035. x 1.3 = 0.0325046, 4.280 times the current seed. IGS SINEX mass: 1415.000 kg for all four.
- **Galileo current (G0, G2):** GSC satellite metadata, section 6: each array 5.41 m2; FOC +/-X 1.320, +/-Y 2.783, +/-Z 3.036 m2; IOV +/-X 1.32, +/-Y 3.00, +/-Z 3.00 m2. A = 2 x 5.41 + Z: 13.856 m2 FOC, 13.82 m2 IOV. Masses from the IGS SINEX (hac/igs-metadata/20261009, last row). Seeds: 41859 0.0254907; 49810 0.0253462; 38857 0.0257528 (IOV); 41861 0.0254143; 61183 0.0253308; 43565 0.025388; 40544 0.0255253; 59600 0.025431; 49809 0.0253199; 41549 0.025455; 43058 0.0253162; 43056 0.0253532; 43564 0.025345; 43566 0.0253811; 37846 0.0257835 (IOV); 59598 0.025347; 41860 0.0253752; 43057 0.0253614; 40890 0.0254514.

## 4. Satellites and windows

C3's calibration satellites only: GLONASS 40001 (R855, plane 3), 44850 (R859, plane 1), 37869 (R743, plane 1), 54377 (R861, plane 2); Galileo the 19 of section 3. No C2 held-out object. Calibration dates only: cutoffs 2025-10-03 to 2026-03-29. No truth after 2026-05-31 is opened.

- **Grid:** every 3 days, 60 cutoffs, on all 23.
- **Daily:** 54377 every day of the span (178 cutoffs); 40001, 44850 and 37869 every day of 2025-12-24..2026-01-20.
- **Cell H:** 54377 at |beta| >= 75 deg: 28 daily cutoffs, 2025-12-24..2026-01-20, peak -87.1 on 01-07 (18 at |beta| >= 80).
- **Cell M1, same dates:** 40001, 44850, 37869 on those 28 dates: beta +1.3 to +26.4, 41 of the 84 windows in the eclipse season (|beta| < 14.5).
- **Cell M2, same satellite:** 54377 at |beta| < 30: 63 daily cutoffs, 2025-10-03..11-10 and 2026-03-06..03-29.
- **Bins:** |beta| in [0, 15), [15, 30), [30, 60), [60, 75), [75, 90], on the grid. Beta at t_in: asin(s . h), h from the ESA state at t_in, s from propagator/solar-system-bodies with DE440s.

Windows: GLONASS 415 x 3 arms; Galileo 1140 x 2 arms; 3525 fits, each with one forecast.

## 5. Chain and truth

C3's chain, imported read-only: lib/chain.mjs, lib/open.mjs, lib/modules.mjs, lib/environment.mjs, lib/gfz.mjs, lib/notices.mjs and lib/terms.mjs, each SHA-256 pinned in build.json with C3_STORE on this experiment's own store, so a run writes nothing to C3's. A pinned file that changes refuses every step until the coordinator rules. C3's notices/ is read as public NAGU and IAC pages. C3's rows and results are never opened; the integrity log refuses those paths.

C3's arc-disjoint rule: the fit track is the last 24 h of the latest ESA0OPSFIN arc ending (t_in) by the cutoff; leads 1, 6, 12, 24, 48, 72 h run from t_in; truth comes only from arcs starting at or after t_in, excluding the fit's own. GFZ0MGXRAP rapid orbits at the same epochs, beside ESA. Environment as C3's calibration (B1's file, DE440s). Modules by git show at 9a05d899b, SHA-256 checked: estimation 0.7.0, ffm 2.0.4, gp-error-model 0.11.0, solar-system-bodies 0.5.2. Errors in RTN from gp-error-model pair_statistics in the predicted state's axes: forecast minus truth. N is along r x v.

Primary samples: fit CONVERGED; no operator notice (GSC, IAC, issued before 2026-06-01) overlapping [t_in - 24 h, t_in + 84 h]; no UTC day with GFZ Ap >= 30 in [t_in - 24 h, t_in + L). All samples are reported beside them.

## 6. Statistics

- S(arm, cell, L): median of sign(beta) x N error at lead L.
- D(arm, cell, L): median over windows of the paired difference [sign(beta) N](arm) - [sign(beta) N](control).
- RMS ratio per axis and lead: RMS(arm) / RMS(control) on the same windows.
- Intervals: 95 % percentile, 10,000 paired resamples of windows, seed the SHA-256 of the cell's name. A pair with a fit that did not converge in either arm is dropped and counted.
- Also per cell and arm: median AGOM over the seed and over 0.00759375, formal sigma of AGOM, fit terminations, the formal N sigma FFM carries to each lead (formal x max(1, reduced chi-square)) and mean z^2 under that formal covariance alone. That is the fit's own, not P_C2.

## 7. Rules, fixed now

**Control.** S(A0, H, 6 h) must lie in [0.40, 1.00] m, and median AGOM/0.00759375 in A0 at |beta| >= 80 must be below 4.0. If not, the looks do not reproduce under this pin: stop and report before reading the other arms.

**Removal, per arm X in A1, A2, on H at 6 h against ESA:**
- REMOVED: |S(X)| <= 0.20 m (the looks' level at 60-75 deg, which H does not claim to explain) and D's interval wholly below 0.
- REDUCED: not removed, |S(X)| <= 0.7 S(A0), and D's interval wholly below 0.
- NOT REMOVED: otherwise.
- 1 h, 12 h and GFZ are reported beside it. If GFZ disagrees, the verdict's sentence says so.
- Sag gone: median AGOM on H over median AGOM on M2 is at least 0.95, in that arm.

**Low beta, per arm, on M1 and M2, R, T and N at all six leads:** HARM if any RMS ratio's interval lies wholly above 1.05; HELP if any lies wholly below 0.95; otherwise NO CHANGE. All 36 cells per arm are in the table; the margin, not the count, is what guards against a chance cell.

**Galileo, G2 against G0.** N per bin as for GLONASS. T at 24, 48, 72 h: RMS, median |T|, ratio and interval, FOC and IOV apart, with the ten largest |T| at 72 h listed by satellite and date. T CHANGES if the ratio's interval lies wholly below 0.95 or wholly above 1.05 at any of the three leads; otherwise T NO CHANGE. Median AGOM over the seed per bin.

No tuning on scored windows. A deviation is an amendment at the end of this file, dated, saying what had been seen.

## 8. What each outcome means

1. **A1 and A2 REMOVED, sag gone, no HARM:** H holds. The high-beta error is the prior's drag toward C2's seed, and either route closes it. Neither is applied here: the coordinator decides what, if anything, reaches C3.
2. **One REMOVED, the other not:** seed and width are not interchangeable here, against the arithmetic. The numbers say which works, and the fits' terminations are read before any conclusion.
3. **REDUCED or NOT REMOVED, sag gone:** the drag is real but not all of the error. What is left belongs to the cannonball's form: one area along the Sun line cannot serve both in-plane and normal. A box-wing or ECOM2 arm is the next test, not this one.
4. **NOT REMOVED, sag still there in A1 and A2:** the sag is in the data, not the prior: the effective area seen through the normal offset at high beta is smaller. Seed and prior are closed as causes; again the cannonball's form.
5. **REMOVED with HARM at low beta:** the remedy costs elsewhere. Both are reported; this test alone recommends nothing.
6. **Galileo, T NO CHANGE:** the along-track error is not the prior's; with AGOM/seed near 1, not the seed's either. It is reported as open.
7. **Galileo, T falls:** the prior was dragging, and is part of Galileo's along-track error.
8. **Galileo, T rises:** the prior was helping on a 24 h arc of about 1.7 revolutions (2.1 on GLONASS). A wider prior is then wrong for Galileo even if it is right for GLONASS.

## 9. Disclosures

1. Known before registering: the looks' numbers above, including 4.17-4.28 and the sag. A1's 4.28 falls at the top of that range. It is C2's rule applied to Table 5, not a fit; the other readings give 3.73 (arrays only), 4.14 (arrays + z) and 4.73 (arrays + C2's body face), and at sigma 100 % of the seed any of them moves the pull by under 2 %.
2. Table 5 is "adjusted metadata": areas fixed, optical parameters adjusted. Its +/-x surface has a shape factor of 0.728, the weight of a cylinder against a flat plate, which a cross-section ignores. The GLO-M+ satellites (3 of 4) are given GLO-M's surfaces: same SINEX mass, same IAC body. Cr 1.3 is C2's rule, not the paper's optical properties.
3. H rests on one satellite and one event: only 54377 reaches |beta| >= 75 among the calibration satellites. Other plane 2 satellites are outside this population by the task's design. Daily windows share a slowly varying beta; the intervals speak about windows, not about a population of events. Galileo in this population reaches |beta| 72.9 at most.
4. M1 lies largely in the eclipse season. M2 does not. Both are reported.
5. GNSS truth at 1, 6 and 12 h is the next daily file, which may share tracking data with the fit's. GFZ is reported beside it.
6. Probes before registration, in the scratchpad, with no parameter or error printed: beta per satellite and day from orbit normals and the module's Sun; timing of 8 fits with forecasts. Nothing else was opened from truth.
7. The looks used a low-precision Sun, good to about 0.4 deg, older modules on C2's rows and a 3-day grid. The control rule catches a failure to reproduce.
8. No maneuver screen is run: notices decide primary samples, and the ten largest errors are listed. One known unlisted event is named now: R855 (40001), 2026-02-16, public in C3's P2. No notice lists it, so its windows stay in the primary samples of the grid; it lies outside cells H, M1 and M2, and the table names it wherever it appears among the largest errors.

## 10. Cost

Measured on one core, machine load 8-14: fit 2.2 s (2 FFM rounds with STM over the 24 h arc, 145 points at 600 s), forecast 3.6 s (96 h from the fit epoch, covariance carried, outputs at the six leads); RK78, relative tolerance 1e-10, steps up to 120 s, 70 x 70. 3525 x 5.8 s = 5.7 CPU-h; about 45-60 min on 8 workers. Store /opt/data/sdn-archive/ffm-srp-seed-high-beta: about 0.02 GB.

## Amendment 1, 2026-10-31, after the table: report-only additions, no rule changed

Nothing in sections 2 to 8 changes. After the table existed the coordinator asked for three report-only additions, and the results label them so:

1. **The fit itself:** reduced chi-square of each arm over its control and the move of the fitted state, per cell, with intervals, on every window of a set (score.mjs).
2. **The consumer list's fitted-over-seed column (consumers.mjs):** the coordinator approved reading C2's R1 and R2 calibration and validation rows, iss-fit*, and XM2's and XM3's rows: file names checked first, a row's date read first, rows after 2026-05-31 skipped, only the satellite's number, fit.parameters and fit.termination used, every file in the integrity log. C3-small's rows and results, B2's rows and C2's R3 rows stay unread and are marked "not read".
3. **Galileo FOC against IOV per satellite, and the along-track error against one shape (looks.py):** a look chosen after the table, no rule attached.

report.mjs generates the results README from these and from the table.
