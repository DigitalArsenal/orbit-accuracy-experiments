# AP 0.6.5 against FFM: eccentric orbits, 24 h fits, and every failing cell (issue #316)

**Exploratory, not registered; 2026-11-10.** Every window here was read before, by this study and by the builds it scores; nothing below is a confirmation, and the reference is FFM at the reduced setting the published cells flew, not the configured or full one the headline loop (README.md) scores against. AP is `propagator/sdn-ap` 0.6.5 (modules 3a3661ea, wasm f0b8352a). FFM is `propagator/ffm` 2.2.0 with `analysis/estimation` 0.7.0 at the published settings (`ffmHigh`: 20×20, Sun, Moon, radiation pressure, no drag; `ffmLow`: 40×40, NRLMSISE-00 on as-issued rows, solid tides, B estimated, S fixed at 0.02 m²/kg). Truth, windows, 300 s grid, coverage rule and as-issued weather are the published harness's (`all-regimes.mjs`, `ap-truth.mjs`). No truth dated 2026-03-01 to 05-31 or after 11-10 was read. All figures are medians over windows; km in tables unless marked m. "Ratio" is the median of per-window ratios to FFM. Scripts: `diagnosis/` beside this file (list at the end).

**Setup check.** AP and FFM re-fly the stored rows behind the published cells to the meter: HX 16 windows (AP day-1 difference median 0.012 m, max 0.22 m; stored AP is 0.6.3), FFM 0.000 m; IGSO 21 windows 0.000 m; altimetry 0.001 m. The HX medians here (AP 0.169, FFM 0.014 km at day 1) equal the published cell. Environment: the runs behind these numbers resolved `spacedatastandards.org` to the 1.279.0 copy sdn-ap 0.6.5 installs, because the clone's own install was a stale 1.243.0; that workaround is gone: the checkout now holds its lockfile's 1.276.0 (`npm ci`, or the stack's `deps-bundle attach`), and `diagnosis/lib.mjs` refuses any other version through `lib/env.mjs`. XM's installed-host guard is still answered by the one documented adapter in `lib/env.mjs` (proper fix stated there: a modules checkout whose host packages equal XM's registered build.json, or XM registered again on today's hosts). The stored-row match above held under both.

## 0. Answers first

1. **A construction-level fix alone does not reach "within about 2 times FFM" at day 1 in most failing cells.** It does in altimetry 72 h (wide priors: 1.5×), near 700 km 24 h (carrier or FFM's coefficients: 1.2×) and TESS 336 h (carrier: 1.7×). It does not in MEO 24 h (9×), MEO 72 h (3.0×), inclined geosynchronous (5.1×), laser geodetic (3.2×), altimetry 24 h (2.7×; 2.2× on a second set) or THEMIS/Chandra (6.9×; 9.6× on a second set). From day 2 or 3 most cells come within 2× (sections 1 and 2).
2. **Two causes, in different proportions per group.** *Estimation* (the fit weights positions at 1 km against priors in m²/kg, so on short arcs B and S sit at the priors) is most of the 24 h-fit gap and none of the eccentric gap. *Representation* — AP cannot follow FFM's own trajectory closer than a floor that is flat in time — is the whole gap in THEMIS/Chandra, IGSO, geodetic and MEO 72 h, and what remains of the 24 h-fit gap: MEO 8–9 m, IGSO 10–11 m, geodetic 5–6 m, altimetry 20–23 m, near 700 km 25–29 m, THEMIS 80–100 m (Chandra similar), TESS 1.2–2.6 km. FFM's own day-1 errors in those cells are 1–3 m, 1–3 m, 2 m, 7–12 m, 20 m (published), 14 m and ~1 km.
3. **Cost on eccentric orbits** is two implementation paths, both at output: per-pass drag (≈70 µs per state, 78 NRLMSISE-00 calls per output state) and the eccentric-anomaly grid (≈24 µs read plus ≈25 ms per 48 h rebuild, which also hits low orbits from e 0.05). Integration, steps and third-body quadrature cost ≈1 µs.
4. **Recommendation (item 6): make the record a compressed FFM forecast** (FFM fitted to the arc, flown 7 days, stored as piecewise Chebyshev positions, eccentric-anomaly segments above e ≈ 0.1). Measured on held-out samples: within half of FFM's own error with 27–160 numbers per day above low orbit (geodetic needs shorter segments than tried in 9 of 15 windows), ≈440 for THEMIS and ≈1,100 in low orbit; 0.04–0.15 µs per state, 0.1–0.5× SGP4's bare kernel. AP's theory cannot meet the speed half of the headline in low orbit even unchanged (2.3–2.6× SGP4 per #317), and its representation floors are 3–10× FFM's day-1 error in five regimes.

## 1. Cause by group (items "representation or estimation")

Arms: *AP from truth* (the published $PCF); *wide priors* ($PCF FIT.DRAG_PRIOR LOG_NORMAL σ = 10 ln 10, SRP_PRIOR GAUSSIAN σ = 10; configuration only); *FFM's coefficients* (AP fitted to the truth arc with B and S held at FFM's estimates through the priors); *carrier* (AP fitted to FFM's own trajectory over the arc plus 7 days of forecast: no truth after the cutoff enters); *carrier minus FFM* is the representation error.

### 1.1 Highly elliptical, THEMIS A/D/E and Chandra, 72 h fit (19 windows, the published set)

| Arm, against truth | day 1 | day 2 | day 3 | day 5 | day 7 | ratio day 1 / 2 / 3 / 7 |
| --- | --: | --: | --: | --: | --: | --: |
| AP from truth (published) | 0.169 | 0.318 | 0.404 | 0.980 | 1.20 | 12.5 / 12.2 / 11.7 / 4.3 |
| AP, no drag (B held at 0) | 0.170 | 0.321 | 0.409 | 0.995 | 1.18 | 12.5 / 12.2 / 11.5 / 4.1 |
| AP, FFM's S held, no drag | 0.207 | 0.349 | 0.448 | 1.01 | 1.22 | 13.5 / 12.9 / 11.6 / 3.5 |
| AP carrier, arc + 3 d | 0.084 | 0.094 | 0.125 | 0.272 | 0.540 | 6.0 / 2.9 / 2.9 / 1.0 |
| AP carrier, arc + 7 d | 0.112 | 0.118 | 0.131 | 0.175 | 0.237 | 6.9 / 3.8 / 3.0 / 1.0 |
| FFM 20×20 | 0.014 | 0.028 | 0.043 | 0.124 | 0.205 | 1 |
| carrier (7 d) minus FFM | 0.101 | 0.087 | 0.082 | 0.079 | 0.188 | arc RMS 0.161 |

Cause: **representation.** AP fitted to FFM's own 10-day trajectory misses it by 80–100 m at every lead (161 m RMS over the span, 450 m maximum at perigee passes), against FFM's 2 m fit to truth. FFM's coefficients change nothing; the carrier only removes extrapolation. The published "vacuum" $PCF is in fact Jacchia 1970 on the theory's flux model with B fitted; turning drag off changes nothing at THEMIS's 900 km perigee. Chandra's NAIF kernel is itself a model trajectory that FFM reproduces to 0.000 km on clean windows, so Chandra is a pure representation test (AP floor 85–140 m); three of its seven windows hold an event no arm follows.

### 1.2 24 h fits

| Group (windows) | Arm | day 1 | day 2 | day 3 | day 7 | ratio day 1 / 2 / 3 / 7 |
| --- | --- | --: | --: | --: | --: | --: |
| MEO, GPS/Galileo/GLONASS (25) | AP from truth | 0.023 | 0.046 | 0.070 | 0.167 | 19.5 / 9.0 / 6.1 / 2.8 |
| | wide priors | 0.008 | 0.012 | 0.020 | 0.060 | 8.3 / 2.6 / 1.6 / 1.1 |
| | FFM's S held | 0.008 | 0.010 | 0.013 | 0.047 | 8.6 / 2.5 / 1.7 / 1.0 |
| | carrier | 0.009 | 0.010 | 0.014 | 0.042 | 9.1 / 2.8 / 1.6 / 1.1 |
| | FFM | 0.001 | 0.003 | 0.007 | 0.035 | 1 |
| | carrier minus FFM | 0.008 | 0.009 | 0.009 | 0.009 | |
| Altimetry, 5 satellites (15) | AP from truth | 0.087 | 0.321 | 0.753 | 4.41 | 5.5 / 6.0 / 10.9 / 6.2 |
| | wide priors | 0.035 | 0.108 | 0.318 | 1.54 | 3.9 / 2.9 / 3.4 / 2.6 |
| | FFM's B and S held | 0.021 | 0.030 | 0.040 | 0.603 | 2.3 / 1.4 / 0.9 / 1.0 |
| | carrier | 0.021 | 0.029 | 0.060 | 0.514 | 2.7 / 1.5 / 1.0 / 1.0 |
| | FFM | 0.007 | 0.017 | 0.056 | 0.521 | 1 |
| | carrier minus FFM | 0.021 | 0.019 | 0.020 | 0.025 | |
| Near 700 km, Sentinel-1A/C (12) | AP from truth | 0.164 | 0.609 | 1.04 | 3.94 | 2.7 / 1.1 / 1.1 / 0.7 |
| | wide priors | 0.112 | 0.396 | 0.842 | 4.31 | 1.8 / 1.0 / 1.0 / 0.9 |
| | FFM's B and S held | 0.079 | 0.542 | 1.00 | 7.09 | 1.2 / 1.0 / 1.0 / 1.0 |
| | carrier | 0.079 | 0.512 | 0.957 | 7.00 | 1.2 / 1.0 / 1.0 / 1.0 |
| | FFM | 0.070 | 0.520 | 0.964 | 7.00 | 1 |
| | carrier minus FFM | 0.025 | 0.026 | 0.026 | 0.031 | |
| Strong drag, control (10) | AP from truth | 0.177 | 1.22 | 2.83 | 18.4 | 0.8 / 0.8 / 0.9 / 1.0 |
| | carrier | 0.222 | 1.25 | 2.54 | 19.8 | 1.1 / 1.0 / 1.0 / 1.0 |
| | FFM | 0.231 | 1.24 | 2.55 | 19.8 | 1 |
| | carrier minus FFM | 0.054 | 0.042 | 0.046 | 0.058 | |

Cause: **estimation first, then a flat representation floor.** On a 24 h arc the fit cannot pin B and S because it weights each position at 1 km while the priors are stated in m²/kg (design review finding 9; estimation draft 4.1): the priors bind about 100 times too hard, pull S toward 0 (short-arc prior 0 ± 0.1) and B toward its altitude median, and the forecast drifts. With FFM's B and S held, or with the carrier, the day-1 error falls 2 to 4 times and AP is within 1.0 to 1.5 times FFM from day 2 on (MEO from day 3). What stays at day 1 is the flat representation floor, which exceeds FFM's day-1 error at MEO (8 against 1 m) and altimetry (21 against 7 m). The near-700 km sample here is dominated by orbit-control steps (FFM 70 m at day 1 against 20 m over the published 300 windows), so its ratios understate the gap there; its floor (25–29 m) is about FFM's published day-1 error. Laser spheres (published 1.7×) and strong drag (control, 0.8–1.1×) pass.

### 1.3 The other failing cells named in the 11-10 ruling

| Group (windows) | Arm | day 1 | day 2 | day 3 | day 7 | ratio day 1 / 2 / 3 / 7 |
| --- | --- | --: | --: | --: | --: | --: |
| MEO 72 h (25) | AP from truth | 0.012 | 0.018 | 0.024 | 0.070 | 3.7 / 2.3 / 1.8 / 1.1 |
| | wide priors | 0.009 | 0.013 | 0.019 | 0.065 | 3.0 / 1.7 / 1.2 / 1.0 |
| | carrier | 0.009 | 0.013 | 0.018 | 0.051 | 3.0 / 1.7 / 1.3 / 1.0 |
| | FFM; carrier minus FFM | 0.003; 0.009 | 0.006; 0.009 | 0.011; 0.008 | 0.044; 0.009 | |
| Inclined geosynchronous 72 h (36) | AP from truth | 0.012 | 0.015 | 0.017 | 0.048 | 5.1 / 2.8 / 1.8 / 1.1 |
| | wide priors | 0.011 | 0.014 | 0.016 | 0.047 | 4.9 / 2.5 / 1.5 / 1.0 |
| | carrier | 0.011 | 0.011 | 0.013 | 0.040 | 5.1 / 2.4 / 1.6 / 1.0 |
| | FFM; carrier minus FFM | 0.002; 0.011 | 0.004; 0.011 | 0.007; 0.009 | 0.030; 0.009 | |
| Laser geodetic 72 h (15) | AP from truth | 0.008 | 0.008 | 0.010 | 0.011 | 3.4 / 1.7 / 1.5 / 1.8 |
| | carrier | 0.007 | 0.009 | 0.009 | 0.008 | 3.2 / 2.0 / 1.6 / 1.4 |
| | FFM; carrier minus FFM | 0.002; 0.005 | 0.004; 0.006 | 0.005; 0.006 | 0.006; 0.006 | |
| Altimetry 72 h (15) | AP from truth | 0.045 | 0.114 | 0.253 | 1.90 | 3.5 / 4.4 / 3.2 / 1.1 |
| | wide priors | 0.021 | 0.026 | 0.087 | 1.08 | 1.5 / 1.2 / 1.0 / 1.0 |
| | FFM's B and S held | 0.025 | 0.042 | 0.078 | 1.06 | 1.7 / 1.9 / 1.7 / 1.0 |
| | carrier | 0.027 | 0.029 | 0.076 | 1.23 | 1.9 / 1.2 / 1.1 / 1.0 |
| | FFM; carrier minus FFM | 0.012; 0.021 | 0.023; 0.019 | 0.083; 0.020 | 1.23; 0.028 | |
| TESS 336 h (4) | AP from truth | 2.32 | 5.07 | 8.35 | 22.6 | 2.6 / 3.3 / 3.7 / 2.6 |
| | carrier | 1.94 | 2.50 | 3.16 | 11.3 | 1.7 / 1.5 / 1.4 / 1.0 |
| | FFM; carrier minus FFM | 0.99; 1.21 | 1.55; 1.33 | 2.28; 1.46 | 10.1; 2.63 | |

MEO 72 h, IGSO and geodetic are representation-limited (FFM's coefficients and wide priors change ≤ 25 %). Altimetry 72 h is estimation-limited and passes with wide priors alone (1.5× at day 1). TESS is both.

## 2. Construction-level fixes, ranked, with second-set check

| Fix (no module change) | Where it reaches 2× FFM at day 1 | Day-1 gain measured |
| --- | --- | --- |
| Carrier: AP fitted to FFM's 7-day forecast from the same arc | near 700 km (1.2×), altimetry 72 h (1.9×), TESS (1.7×) | MEO 24 h 23 → 9 m; altimetry 24 h 87 → 21 m; TESS 2.32 → 1.94 km; IGSO, geodetic, MEO 72 h ≤ 25 %; THEMIS/Chandra 169 → 112 m on the published set but 125 → 161 m on the second set (day 3 on it helps in both: 404 → 131 and 609 → 209 m) |
| FFM's B and S held through the $PCF priors | near 700 km (1.2×), altimetry 72 h (1.7×) | the same as the carrier within 10 % in low and medium orbits; worse than the published fit at THEMIS/Chandra and TESS |
| Wide priors in the $PCF | altimetry 72 h (1.5×), near 700 km (1.8×) | MEO 24 h 23 → 8 m; altimetry 24 h 87 → 35 m |

**Second set of windows** (cutoffs between the published ones, never used above; set `b`), day 1, km (ratio to FFM):

| Group (windows) | AP from truth | wide priors | FFM's coefficients | carrier | FFM | carrier minus FFM |
| --- | --: | --: | --: | --: | --: | --: |
| MEO 24 h (25) | 0.025 (18.0) | 0.009 (7.1) | 0.008 (7.2) | 0.008 (8.5) | 0.001 | 0.008 |
| Altimetry 24 h (12) | 0.114 (4.6) | 0.066 (2.8) | 0.022 (2.2) | 0.023 (2.2) | 0.009 | 0.022 |
| THEMIS/Chandra 72 h (16) | 0.125 (7.6) | 0.116 (8.0) | 0.118 (8.4) | 0.161 (9.6) | 0.014 | 0.118 |

The estimation fixes and the representation floors repeat on the second set; the carrier's day-1 gain on THEMIS/Chandra does not (it helps from day 3: 1.8× against 1.9× for the published fit, 1.0× at day 7), which is what a representation-limited group should show.

## 3. Items 1–4: the carrier residual (AP minus FFM over arc + 7 d)

Per group, median over windows, metres; residual in FFM's R, T, N axes; "target" is half of FFM's own error against truth at that lead; series and empirical fits are least squares over the whole span (`resid.mjs`, 5-minute samples).

| Group | RMS arc / d1 / d3 / d7 | R / T / N RMS at d1 | max d1 | growth | target d1 / d3 / d7 |
| --- | --- | --- | --: | --- | --- |
| MEO 24 h | 9.2 / 7.7 / 8.5 / 8.6 | 2.8 / 5.5 / 4.9 | 13 | flat | 0.4 / 3.3 / 17.6 |
| MEO 72 h | 8.6 / 8.7 / 8.5 / 8.9 | 2.8 / 6.6 / 4.5 | 13 | flat | 1.3 / 5.4 / 21.9 |
| IGSO 72 h | 12.7 / 10.8 / 9.4 / 9.3 | 0.7 / 7.1 / 7.9 | 15 | flat | 1.0 / 3.7 / 15.0 |
| Geodetic 72 h | 5.0 / 5.3 / 5.4 / 5.7 | 1.9 / 3.7 / 3.6 | 12 | flat | 0.9 / 2.5 / 2.8 |
| Altimetry 24 h | 23.8 / 20.7 / 19.7 / 23.9 | 9.8 / 14.4 / 11.6 | 44 | flat | 3.7 / 28 / 260 |
| Altimetry 72 h | 22.5 / 20.6 / 20.2 / 27.4 | 9.9 / 15.9 / 10.7 | 44 | flat | 6.2 / 41 / 617 |
| Near 700 km 24 h | 28.0 / 25.5 / 25.6 / 31.1 | 11.0 / 20.3 / 11.7 | 60 | flat | 35 / 482 / 3,500 |
| Strong drag 24 h (control) | 55.9 / 54.0 / 48.8 / 58.6 | 16.5 / 44.9 / 23.4 | 117 | flat | 134 / 1,163 / 10,924 |
| THEMIS/Chandra 72 h | 161 / 101 / 88 / 179 | 54 / 73 / 27 | 180 (446 in arc) | flat to d5, doubles by d7 | 7.0 / 21 / 103 |
| TESS 336 h | 2,164 / 1,214 / 1,454 / 2,625 | 571 / 921 / 229 | 1,609 | grows (trend 0.8–1.4 km per half span) | 494 / 1,140 / 5,028 |

**Spectrum (item 2)** — the lines that are most often among each axis's three largest, with median amplitude (labels: k/rev = k n; m/day = Earth rotation; long-period < 0.35 per day):

| Group | R | T | N |
| --- | --- | --- | --- |
| MEO | 2/rev 2.2 m | 2/rev 3.6–4.4 m; 1/rev 1.8 m | 1/rev 6.1–6.3 m (sidebands ±0.1/rev) |
| IGSO | 1/rev, 2/rev ≤ 0.6 m | long-period 2.2 m; 1/rev, 2/rev 1.5 m | 1/rev 9.4 m (sidebands 0.85, 1.15/rev) |
| Geodetic | 2/rev 3.1 m | 2/rev 4.8 m | 1/rev 3.3 m; 2/rev 1.6 m |
| Altimetry, near 700 km | 1/rev 4.5–5.8 m; 1/rev ± 1/day 3–4 m | long-period 7–13 m; 2/day 6 m; 1/rev ± 1/day 8–9 m | 1/rev 7–10 m; 2/rev 5 m |
| Strong drag | 1/rev 9 m | long-period 36 m; 2/day 15 m | 1/rev 22 m |
| THEMIS/Chandra | 1/rev 40 m; 2/rev 27 m | 1/rev 51 m; 1/rev − 1/day 60 m (about 20 days at THEMIS); 1/day 44 m | 1/rev 32 m; 2/rev 20 m |
| TESS | 1/rev 745 m; 2/rev 470 m | 2/rev 742 m; 4/rev 418 m | 2/rev 322 m |

Physical reading (measured where marked, otherwise inferred): the m-daily and 1/rev ± 1/day lines in low orbit are tesseral and tidal (measured below); the 2/day along-track line in low orbit matches the semidiurnal solid tide (measured share below); the flat 2/rev R/T and 1/rev N lines at MEO and geodetic heights are unattributed short-period content — not radiation pressure (measured), most likely the lunisolar short-period terms (bodies held fixed over the orbit, analytic Moon) and the second-order J2 short-period terms (about J2 × the first-order amplitude: 1 m at GPS, 3 m at LAGEOS); the THEMIS 1/rev − 1/day line is the one-day commensurability.

**Compressibility (item 3)** — remaining residual (m) after a series of degree d in time plus harmonics k = 1..K of the mean longitude with amplitudes of degree a (coefficients for R, T, N together), median:

| Group | none | d2 K0 (9) | d2 K1 a0 (15) | d2 K2 a1 (33) | d3 K4 a2 (84) | d3 K8 a2 (156) | target d1 | windows meeting target at every lead |
| --- | --: | --: | --: | --: | --: | --: | --: | --: |
| MEO 24 h (d1) | 7.7 | 7.1 | 5.7 | 2.0 | 1.5 | 1.5 | 0.4 | 5 / 25 |
| MEO 72 h (d1) | 8.7 | 7.4 | 6.1 | 3.5 | 2.3 | 2.3 | 1.3 | 11 / 25 |
| IGSO (d1) | 10.8 | 8.7 | 3.6 | 2.6 | 1.8 | 1.8 | 1.0 | 13 / 36 |
| Geodetic (d1) | 5.3 | 4.0 | 3.5 | 3.3 | 3.0 | 3.0 | 0.9 | 0 / 15 |
| Altimetry 24 h (d1) | 20.7 | 18.5 | 17.7 | 15.4 | 15.3 | 15.3 | 3.7 | 1 / 15 |
| Near 700 km (d1) | 25.5 | 23.5 | 22.6 | 21.5 | 20.5 | 20.5 | 35 | 6 / 12 |
| THEMIS/Chandra (d1) | 101 | 77 | 68 | 61 | 32 | 30 | 7.0 | 3 / 19 |
| TESS (d1) | 1,214 | 1,371 | 1,098 | 364 | 52 | 4.4 | 494 | 4 / 4 |

Adding Earth-rotation harmonics (k n + m ω_E, k ≤ 3, |m| ≤ 3, a = 1; 297 numbers), fitted on alternate samples and scored on the others (`compress.mjs`), day 1: MEO 0.2–0.9 m, IGSO 1.4 m, geodetic 2.1 m, low orbit 10–16 m, THEMIS/Chandra 19 m. So a short correction series closes MEO, IGSO and TESS; it does not close geodetic (target 0.9 m), low orbit (a broadband residual: tides, drag, high-degree tesserals) or THEMIS (perigee spikes).

**Empirical accelerations (item 4)** — the module's fit refuses any acceleration parameter (`fit.inc:113-128, 247-251`), and the estimation module offers only a constant in-track one (`IN_TRACK_ACCELERATION` among the PRW dynamic parameters), so this is emulated in the analysis script (`diagnosis/resid.mjs`; analysis of stored residuals, not shipped): the linear response of position to 6 initial conditions plus 9 accelerations (constant, cos u, sin u in R, T, N) from variational equations along a two-body + J2 reference, fitted to the residual. Proper fix: radial, transverse and normal constant and once-per-revolution acceleration parameters in the PRW dynamic parameters and the estimation module, so the same fit is a module call:

| Group (d1, m) | residual | 6 initial conditions | + 3 constant | + 9 empirical (15 numbers) | best series of ≤ 33 numbers |
| --- | --: | --: | --: | --: | --: |
| MEO 24 h | 7.7 | 6.1 | 5.8 | 5.5 | 2.0 |
| IGSO | 10.8 | 4.6 | 3.7 | 2.8 | 2.6 |
| Geodetic | 5.3 | 4.6 | 4.0 | 3.5 | 3.3 |
| Altimetry 24 h | 20.7 | 20.5 | 19.1 | 16.2 | 15.4 |
| Near 700 km | 25.5 | 25.9 | 24.4 | 21.5 | 21.5 |
| THEMIS/Chandra | 101 | 95 | 72 | 41 | 61 |
| TESS | 1,214 | 1,223 | 773 | 281 | 364 |

Per coefficient the empirical accelerations beat the series in eccentric orbits (THEMIS 41 m with 15 numbers against 61 m with 33) and tie elsewhere; neither reaches the target anywhere but TESS. The initial-condition columns cut IGSO 10.8 → 4.6 m and MEO 7.7 → 6.1 m although AP's own fit is converged (the module's finite-difference Jacobian, `sdnap_fit_jacobian_diagnostic(1)`, gives identical fits on 6 IGSO, 8 MEO and 7 geodetic windows): part of the floor is how AP's mean elements map to the trajectory, not the fit.

## 4. Which term carries the representation error (attribution)

AP fitted to the trajectory of an FFM with one force removed, or with both sides truncated alike; median AP-minus-FFM at day 1 (arc RMS in brackets), metres:

| Group (windows) | as published | radiation pressure off on both sides | solid tides off in FFM (AP has none) | tesserals: AP (12, 20) against FFM capped at 12 | AP (12, 20) against full FFM | other |
| --- | --- | --- | --- | --- | --- | --- |
| Altimetry 24 h (9) | 23 (28) | 23 (28) | 20 (22) | 18 (24); tides also off 15 (17) | 58 (72) | |
| Near 700 km (6) | 29 (31) | 29 (31) | 26 (27) | | | |
| MEO 24 h (9) | 9 (11) | 9 (9) | — | | | |
| IGSO (24) | 11 (16) | 10 (13) | — | | | |
| Geodetic (4) | 6 (6) | 6 (6) | — | | | |
| THEMIS/Chandra (8) | 99 (160) | 116 (160) | — | AP (4, 20) against FFM capped at 4: 98 (157); (12, 20) against 12: 96 (160) | | zonal tail off (31, 0): 105 (157) |
| TESS (3) | 709 (1,330) | 1,360 (1,690) | — | | | |

What this shows: **radiation pressure is not the floor anywhere.** In low orbit the floor is three similar shares: solid Earth tides, which AP does not model and refuses as a setting (≈11–13 m RMS), tesserals of degree 13 to 40 that AP's near-resonant and shallow families do not cover (≈14 m), and what remains in a degree-12, tide-free world (13–15 m), which matches the design review's estimate for the missing J3, J4 and second-order J2 short-period terms (12–17 m). On THEMIS, FFM itself needs tesserals of degree 5 to 12 (capped at 4 it loses 210 m at day 1, capped at 12 nothing), but **AP's floor is the same in a world truncated at degree 4 or 12 on both sides**, so the tesseral cut is not the floor; AP's eccentric-anomaly grid carries most of degrees 5 to 12 (AP capped at 4 against full FFM: 184 m). With radiation pressure, drag, tesserals and the zonal tail eliminated, the THEMIS and Chandra floor sits in the long-period regime's lunisolar treatment (instantaneous point mass at the mean-orbit position, integrated with a 38- or 95-minute RK3 step without error control, analytic Moon of 13 longitude terms) and, at THEMIS's 900 km perigee, the zonal short-period terms beyond first-order J2. The MEO, IGSO and geodetic floors (5–11 m, 2/rev in R and T, 1/rev in N) are not radiation pressure and not the fit; they are unattributed between lunisolar short-period terms and second-order J2 short-period terms. Separating them needs AP-side switches (a diagnostic build), which this study could not make.

## 5. Cost on eccentric orbits (bare kernel; µs per state, warm / cold, 7 days)

`cost.mjs`: made-up orbits, perigee 500 km unless stated; X = SGP4XP (no drag); XD = AP without gravity additions, NRLMSISE-00 orbit-averaged drag; Z = zonal tail (0, 20), no drag; ZD = (0, 20) with NRLMSISE-00; G = (31, 20), no drag; GD = (31, 20) with NRLMSISE-00.

| Orbit | e | rev/day | class | X | XD | Z | ZD | G | GD |
| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| e 0.05 | 0.05 | 14.09 | 0 | 5.1 / 6.8 | 2.4 / 2.2 | 0.5 / 1.0 | 1.6 / 2.1 | 0.8 / 1.8 | 1.9 / 3.0 |
| e 0.10 | 0.10 | 12.99 | 0 | 1.3 / 1.4 | 5.7 / 11 | 0.6 / 1.0 | 1.6 / 2.1 | 25 / 76 | 26 / 75 |
| e 0.29 | 0.29 | 9.11 | 0 | 1.2 / 1.2 | 1.9 / 2.0 | 2.5 / 5.2 | 1.3 / 1.7 | 26 / 78 | 26 / 90 |
| e 0.31 | 0.31 | 8.72 | 0 | 1.2 / 1.2 | 4.0 / 3.9 | 11 / 32 | 81 / 86 | 36 / 89 | 108 / 164 |
| e 0.50 | 0.50 | 5.38 | 0 | 1.2 / 1.3 | 1.7 / 1.8 | 9.1 / 12 | 74 / 76 | 34 / 86 | 99 / 170 |
| GTO e 0.72 | 0.72 | 2.25 | 2 | 2.1 / 1.5 | 2.3 / 1.6 | 10 / 13 | 77 / 97 | 35 / 120 | 105 / 193 |
| e 0.72, perigee 3,000 km | 0.72 | 1.42 | 4 | 1.1 / 1.2 | 1.1 / 1.2 | 7.3 / 10 | 7.2 / 9.9 | 31 / 96 | 32 / 99 |
| Molniya | 0.74 | 1.97 | 2 | 1.1 / 1.2 | 6.0 / 6.4 | 0.6 / 3.2 | 75 / 78 | 25 / 109 | 101 / 186 |
| e 0.80 | 0.80 | 1.36 | 4 | 1.1 / 1.3 | 1.3 / 1.3 | 9.4 / 21 | 73 / 76 | 35 / 101 | 99 / 175 |
| THEMIS-like | 0.82 | 1.07 | 1 | 1.2 / 1.3 | 3.6 / 3.7 | 12 / 15 | 81 / 84 | 36 / 105 | 110 / 180 |

At 60 s output the warm figures are the same within 10 % and the cold ones fall toward them (full table: `cost/cost.json`). Where the time goes, all at output:

1. **Per-pass drag, ≈70 µs** (ZD − Z): above e0 0.3 with any gravity cap and a perigee below 2,550 km, every output state runs `output_drag_pass` (`xp_theory.inc:4525-4535, 4980-4982`), which evaluates `drag_part` (`3131-3137`) for two perigee passes of 39 density nodes each (`1340-1375`): 78 NRLMSISE-00 calls per state. Gone at a 3,000 km perigee; orbit-averaged drag (XD) costs 1–6 µs. This is the 74 µs of #317 (that test used caps (0, 20)).
2. **Eccentric-anomaly grid, ≈24 µs to read plus ≈25 ms per build** (G − Z warm; cold − warm × states): above e0 0.05 in class 0 and 0.3 in classes 1–4 with a tesseral cap; every (m, w) family to degree 12 interpolated per state (`tesseral.inc:4696-4789`), rebuilt every 48 h (`xp_theory.inc:5817-5884`); at 300 s the weekly builds add ≈50 µs per state cold. It applies from e 0.05, so a low orbit at e 0.1 with tesserals costs 25–76 µs.
3. **Zonal tail with every w above e0 0.3, ≈9 µs** (Z at e 0.31 against 0.29; `tesseral.inc:3597-3903`).
4. The 95- and 38-minute steps, the third-body quadrature and the integration together: ≈1 µs (X, XD).

## 6. Blocking assumptions, ranked by metres (item 5)

| Group | Assumption or implementation | Cost, measured (m, day 1 unless stated) | Where |
| --- | --- | --- | --- |
| 24 h fits (MEO, altimetry, near 700 km), TESS | positions weighted at σ0 = 1 km against priors in m²/kg; short-arc S prior 0 ± 0.1; B at its altitude median (σ 10 ln 10 at 800–1,400 km) | MEO 23 → 8; altimetry 24 h 87 → 21; near 700 km 164 → 79; altimetry 72 h 45 → 21–25; TESS 2.3 → 1.9 km | `fit.inc:270-285`; `fit_oem.inc:88-93, 579-600`; `pcf.inc:63-80` |
| THEMIS, Chandra | long-period-regime lunisolar treatment and zonal short-period terms at perigee (by elimination) | ≈100 m floor (80–140 m) | `xp_theory.inc:404-412, 556-640, 3803-3921` (point mass), `4320-4335` (38/95-min step), `263-323` (Moon), `5155-5288` (first-order J2 only) |
| THEMIS (cost of the fix that is already there) | degree 5–12 tesserals only as short-period grid terms, slow ones dropped, one-day class terms to degree 4 | FFM: 210 m at day 1; AP's grid recovers it to within the 100 m floor; not the floor | `xp_hansen_series.inc:71`; `tesseral.inc:36, 4359-4380` |
| Altimetry, near 700 km | no solid Earth tides (setting refused) | ≈11–13 m RMS of a 23–29 m floor | `pcf.inc:141-160, 390-401` |
| Altimetry | tesserals 13–40 carried only as near-resonant and shallow families | ≈14 m RMS (AP 12 against FFM 12: 18 m; AP 31 against FFM 40: 23 m) | `tesseral.inc:298-315, 717-1147, 3905-4177` |
| Altimetry | first-order J2 short-period terms only; no J3–J5 or J2² short-period | ≈13–15 m RMS (floor in a degree-12 tide-free world); design review 12–17 m | `xp_theory.inc:5155-5288` |
| MEO, IGSO, geodetic | lunisolar short-period terms with bodies fixed over the orbit and the 16-node form; second-order J2 short-period terms | 5–11 m floor, unattributed between them | `xp_theory.inc:2176-2347, 2665-3076` |
| all | the mean-element map itself (the part of the residual 6 initial conditions remove although the fit is converged) | IGSO 10.8 → 4.6 m, MEO 7.7 → 6.1 m, geodetic 5.3 → 4.6 m | — |
| eccentric cost | per-pass drag at every output state | ≈70 µs per state | `xp_theory.inc:4525-4535, 4980-4982` |
| eccentric and e > 0.05 cost | grid read per output, rebuilt every 48 h | ≈24 µs + ≈25 ms per build | `tesseral.inc:4696-4789`; `xp_theory.inc:5817-5884` |
| eccentric cost | zonal tail keeping every w above e0 0.3 | ≈9 µs | `tesseral.inc:3597-3903` |

## 7. Fixes (item 4 of the brief), ranked

| # | Fix | Gain, measured or bounded | Module change? | Test that would prove it |
| --- | --- | --- | --- | --- |
| 1 | Records built in two steps: FFM fitted to the arc and flown 7 days, AP fitted to that forecast (the carrier) | section 2: day-1 errors fall 2–4× in the 24 h-fit groups and TESS; ≤ 25 % where representation rules | no | the same arms on registered fresh windows |
| 2 | Wide priors in the $PCF for short arcs (or priors stated at the expected value, e.g. S 0.02 ± 0.02) | MEO 24 h 23 → 8 m; altimetry 72 h 45 → 21 m (1.5×); altimetry 24 h 87 → 35 m | no | as 1 |
| 3 | Weight the fit at the residual scatter (or scale the stated prior σ by σ̂/σ0) | bounded by "FFM's coefficients held": MEO 24 h → 8 m, altimetry 24 h → 21 m, near 700 km → 79 m | yes: `fit.inc:270-285, 357-364`, `fit_oem.inc:88-93` | these 24 h windows with the published $PCF reach the held-coefficient errors; a linearized test gives z ≈ 1 for ln B |
| 4 | Cache per-pass drag rates per perigee passage (they depend on t_p only) and reuse them for every output in that revolution | ≈70 → < 1 µs per state on every eccentric orbit with drag; states unchanged to < 1 mm | yes: `xp_theory.inc:3131-3137, 4525-4535` | `cost.mjs` ZD column falls to the Z column; states equal to the current build at all fixture epochs |
| 5 | One summed grid table per output component; one build per flight span | ≈24 µs → a few µs; cold ≈50 µs → 0 | yes: `tesseral.inc:4696-4789`; `xp_theory.inc:5817-5884` | `cost.mjs` G column; THEMIS fixture to 0.1 m |
| 6 | Solid Earth tides (k2, IERS 2010) | ≈11–13 m RMS in low orbit | yes: `pcf.inc:141-160` and a new rate term | carrier residual on these altimetry windows falls to the tide-free-world figure (23 → 20 m) |
| 7 | General short-period tesserals and m-daily terms to degree 40 in low orbit | ≈14 m RMS | yes: `tesseral.inc:35-38, 717-1147` caps | AP 31 against FFM 40 reaches AP 12 against FFM 12 |
| 8 | J3–J5 and second-order J2 short-period terms | ≈13–15 m low orbit; ≈1–3 m MEO/geodetic (bounded) | yes: `xp_theory.inc:5155-5288` | floor in the degree-12 tide-free world below 5 m |
| 9 | Lunisolar treatment in the long-period regime (step control or averaged rates plus short-period terms; DE-grade Moon) | up to the ≈100 m THEMIS/Chandra floor (by elimination) | yes: `xp_theory.inc:263-323, 404-412, 3803-3921, 4320-4335` | carrier minus FFM on these 19 windows below 15 m |
| 10 | Rebuild the grid on a class change (finding 14) | not measured here (no class change in these windows) | yes: `xp_theory.inc:6804-6843` | the specification's GTO fixture |

Items 6–9 together would at best bring the low-orbit floor from ≈23 m to ≈5–10 m and are each a substantial theory addition; even then the MEO and geodetic floors (5–9 m) stay 3–5× FFM's day-1 error.

## 8. Recommendation: the architecture with the least machinery (item 6)

**The record is FFM's forecast, compressed.** Fit FFM to the arc (0.4–5 s per window at the published settings, measured here), fly it 7 days, and store positions as piecewise Chebyshev polynomials (velocity by differentiation): uniform segments below e ≈ 0.1, segments of equal eccentric anomaly above. Accuracy is FFM's plus a compression error chosen below half of FFM's error, so the ratio to FFM is 1.0–1.1 by construction at every lead. Measured on held-out samples (`compress.mjs`, 1-minute series):

| Regime | Segments, degree | Numbers per day | Held-out error at day 1 | FFM's day-1 error |
| --- | --- | --: | --: | --: |
| MEO (GPS, Galileo) | 6–14 h, 12 | 78–156 | ≤ 0.4 m (meets the target in 25 of 25 windows) | 1–8 m |
| IGSO | 12 h, 12 | 78 | meets the target in 36 of 36 | 2 m |
| Geodetic | 6 h, 12 | 156 | meets the 0.9 m target in 6 of 15 (shorter segments needed for LAGEOS) | 2 m |
| Low orbit, 700–800 km | half a revolution, 12 | ≈1,120 | ≤ 4 m (SARAL; quarter revolution, degree 8: 0.3 m at 1,550 per day) | 7–20 m |
| THEMIS | 16 per revolution in E, 8 | ≈440 | 2.5 m | 14 m |
| Chandra | 8–16 per revolution in E, 5–8 | 52–445 | 0.3–2 m | 0–3 km (events) |
| TESS | 24 h, 5–8 | 27 | ≤ 0.5 × FFM | 1 km |

Cost per state: segment lookup and Clenshaw recurrence for three components, 0.035–0.15 µs in V8 for degree 5–16 with velocity (`chebcost.mjs`; WASM would be similar or faster), against SGP4's bare kernel of 0.27–0.40 µs (#317): **0.1–0.5× SGP4 in every regime, eccentric included.** The output frame should be the stored frame (GCRF), since a per-state precession-nutation matrix costs ≈29 µs (#317).

Alternatives measured: AP plus a correction series fitted to the same forecast needs fewer numbers above low orbit (MEO 15–54 per day, IGSO 15–30, TESS 1–2, THEMIS ≈156 with a Chebyshev correction) and about half in low orbit (≈520 per day), but keeps AP's per-state cost (0.44–0.83 µs low and medium orbits, 2.3–2.6× SGP4 in low orbit per #317; 35–110 µs eccentric until fixes 4 and 5) and does not compress the low-orbit or THEMIS residual with a harmonic series of up to 732 numbers. Improving AP's physics (fixes 3 and 6–9) is a long programme whose best case still leaves MEO and geodetic 3–5× FFM at day 1.

Trade-offs to state plainly: the record grows from ≈1 KB to ≈1–10 KB per object-day (float64; about half with float32 offsets from a segment mean); the forecast is frozen at build time, as AP's weather already is; a covariance must be carried separately (FFM's, or AP's process-noise model refitted to the forecast); and building a record needs the FFM fit and a 7-day flight per object (seconds each here).

## 9. Uncertain, open, second set

- **Second set of windows** (set `b`: THEMIS 02-12/14/16, Chandra 03-11 to 04-22 weekly, MEO and altimetry cutoffs between the published ones) was run for MEO 24 h, altimetry 24 h and THEMIS/Chandra only (table in section 2); the other groups' fixes are not yet confirmed on a second set.
- The MEO, IGSO and geodetic floors are unattributed between lunisolar and second-order J2 short-period terms; THEMIS/Chandra's by elimination only. Both need AP-side switches.
- The near-700 km sample is small and step-dominated; its truth ratios are not representative (its representation floor is).
- The empirical-acceleration fit is an emulation with a two-body + J2 variational model, not the module's fit.
- The compression tables use FFM as the reference; at Chandra FFM equals the truth kernel, so "target" there is near zero.
- Cost figures are CPU time on a loaded machine; ratios between columns are the robust part.

## 10. Scripts and outputs

`diagnosis/`: `lib.mjs` (truth, windows, FFM, AP; the environment from `../lib/env.mjs`), `rep.mjs` (all arms), `worker.sh`, `worker2.sh`, `worker3.sh` (the queues as run: `worker.sh <k> <n> <out dir>`), `agg.mjs`, `tables.mjs`, `show.mjs`, `stored.mjs`, `check-stored.mjs` (setup check), `resid.mjs` (items 1, 2, 4), `compress.mjs` (items 3, 6), `summarize.mjs`, `cost.mjs`, `costtable.mjs`, `chebcost.mjs`. Not kept: a one-off export listing, the package redirect (replaced by the lockfile install) and a debugging copy of `resid.mjs`'s reference. The outputs (rows, FFM cache, residual series, `cost.json`, analysis JSON) were written to a scratch folder outside the repository and are not kept; rows hold aggregates, residual series held FFM positions on a 1–5 minute grid and were deleted after the analysis.
