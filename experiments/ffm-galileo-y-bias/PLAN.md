# Does a Y-axis acceleration remove Galileo FOC's along-track drift, and how should FFM carry it?

Task experiments-ffm-galileo-y-bias-20261031. Registered 2026-10-31, before any score. A test with a report. Nothing here changes C3-small: not its rows, results or chain. The coordinator decides what reaches it. Owner, 2026-10-29: "The only thing you should be working on right now is getting the propagators accurate, the covariance accurate, and the conjunction assessment validated."

## 1. Question

A look at this program's SRP rows (results/ffm-srp-seed-high-beta/README.md; a look, not a test): T at 72 h on the 17 Galileo FOC satellites fits K g(beta), with g(beta) the orbit mean of the along-track projection of the yaw-steering Y axis: K 92.4 m, R^2 0.988, 7.0 m RMS left of 64.7 m; the three planes agree. IOV K -6.5 m; GLONASS no such shape. A cannonball has no Y force.

Hypothesis H: FOC carries a constant acceleration along Y of about +0.7 nm/s^2 in FFM's axes. Fitted or fixed, it removes the drift.

Predictions, written now:
- **Value:** about +0.7 nm/s^2 on FOC; about -0.05 on IOV; about -0.1 on GLONASS.
- **T at 72 h on FOC:** about 7 to 15 m RMS, from about 65 m.
- **R and N on FOC:** they fall toward IOV's, since FFM's response to Y0 at 72 h, with no refit, is 0.5 to 4 m in R and up to 1.3 m in N per nm/s^2.
- **Fit:** in-arc chi-square falls on FOC.

## 2. Arms

Everything but Y is the fit of the SRP arms: fit_batch version 3, one round, 10 m per axis, GCRF, state + AGOM, b fixed at 0, AGOM seed and 100 % prior as registered there, A12's fit controls and forces, RK78, relative tolerance 1e-10, steps up to 120 s, fit track at 600 s, last 24 h of the latest ESA arc ending by the cutoff.

| arm | Y0 (FFM's ECOM2 Y0, eY = unit(eD x r), scaled by the visible fraction of the Sun) | satellites | cutoffs |
| --- | --- | --- | --- |
| Base | none: the stored SRP rows, G0 on Galileo, A1 on GLONASS, read-only | 23 | grid |
| Yt, trial | fixed +1 nm/s^2, only to choose Y2's value | 23 | dev |
| Y1 | fitted per window: seed 0, prior sigma 100 nm/s^2 (at least 16 times the largest formal sigma measured) | 23 | grid |
| Y2 | fixed per block at the value frozen from dev | 23 | grid |
| Yx, negative control | fixed at FOC's value | 2 IOV, 4 GLONASS | grid |

GLONASS's base is A1, the published seed: SRP showed A0's prior distorts that fit, and A0 would confound the control.

## 3. Satellites, windows, split

The 23 of SRP, on its 3-day grid. Blocks: FOC (17), IOV (2: E101, E103), GLONASS (4: R743, R855, R859, R861).

- **Dev:** the 30 cutoffs 2025-10-03 to 2025-12-29.
- **Test:** the 30 cutoffs 2026-01-01 to 2026-03-29.

No truth after 2026-05-31 is opened. Leads 1, 6, 12, 24, 48, 72 h against ESA's next arcs, GFZ rapid orbits beside them. Primary samples as SRP: no notice, no storm, fit CONVERGED; all samples reported beside them.

## 4. Y2's value, frozen before any test score

For a block: y = - sum(s T0) / sum(s^2) over its dev windows' primary samples at L = 24, 48, 72 h against ESA, with T0 the base's along-track error and s = T(Yt) - T0, FFM's own response to +1 nm/s^2. Rounded to 0.001 nm/s^2 and written to dev-values.json. That file is committed on the wip branch before any Y1, Y2 or Yx row is read, and score.mjs refuses without it. Y1's fitted values are reported beside it and not used.

## 5. Statistics

- Per arm and block, on test, then on dev: RMS of R, T and N at all six leads, median |T|, paired RMS ratio against base with a 95 % percentile interval (10,000 window resamples, seed the SHA-256 of the cell's name).
- T at 24, 48, 72 h against beta: K and R^2 per arm and block, and median T per signed beta bin.
- Per satellite on FOC: RMS of R, T, N at 24, 48, 72 h per arm.
- Fit: reduced chi-square ratio against base, residual per axis, AGOM over seed, state move, per arm and block, on every window of the block.
- Y1: fitted Y0 median and p5 to p95, formal sigma, correlation with AGOM, per block and |beta| bin; the formal sigma of T carried to each lead against base's.
- GFZ: the same T cells beside ESA.

## 6. Rules, fixed now

**Control, read first.** On test, base's K on FOC at 72 h lies in [80, 105] m with R^2 at least 0.90. If not, the look does not hold on the test span: stop and ask before reading any arm.

**Removed, per arm Y1, Y2, on FOC on test, primary samples, against ESA:**
- **REMOVED:** RMS T at most 3, 8 and 15 m at 24, 48 and 72 h, the level of GLONASS under its published seed (2.3, 6.6, 12.9 m in SRP), and every paired ratio's interval wholly below 0.5.
- **REDUCED:** not REMOVED, and the paired ratio's interval at 72 h wholly below 0.75.
- **NOT REMOVED:** otherwise.

If GFZ's verdict differs, the verdict's sentence says so.

**Harm, per arm on FOC on test:** HARM if any RMS ratio's interval of R or N at any lead, or T at 1, 6 or 12 h, lies wholly above 1.05.

**Controls:**
- **DOES LITTLE:** on IOV and on GLONASS, under Y2 and under Y1's median, |value| at most 0.35 nm/s^2 (half of the prediction for FOC), and Y2's RMS T ratio's interval at 72 h overlaps [0.6, 1.2].
- **LARGE:** otherwise.
- **Yx:** FOC's value must hurt where it does not belong. BLOCK-SPECIFIC if the RMS T ratio's lower bound at 72 h on IOV is at least 2; NOT BLOCK-SPECIFIC otherwise.

## 7. What each outcome means

1. **Y1 and Y2 REMOVED, no HARM, controls DOES LITTLE:** H holds and the arc can see Y. A fixed block value is still the simpler design unless Y1's T RMS at 72 h is at least 20 % below Y2's: it adds no parameter, and Y1's formal sigma enlarges the carried covariance (reported). The coordinator decides what reaches C3.
2. **Only Y2 REMOVED:** the arc cannot see Y in 1.7 revolutions, so a fixed bias is the design. Y1's formal sigma and scatter say why.
3. **Only Y1 REMOVED:** the value is not constant enough to fix per block: the spread per satellite and date says what varies.
4. **Neither, with Yt's response of the right size:** the look is a coincidence of the fit, or Y's frame is wrong. The module response and the fitted value's sign separate those two.
5. **T REMOVED with HARM on R or N:** Y alone is not the force; the harmed axis says what else is needed. Nothing is carried.
6. **REDUCED:** Y is part of it. What remains per satellite and against beta is reported.
7. **Controls LARGE:** the look is wrong as read, whatever FOC does; the Y term is absorbing something else, on every block.
8. **NOT BLOCK-SPECIFIC under Yx:** the FOC value does not hurt IOV as it should; the response is suspect and the FOC result is not trusted until explained.

## 8. Published value, reported beside the result, not tuned to

Bury G., Sosnica K., Zajdel R., Strugarek D. (2020), "Toward the 1-cm Galileo orbits: challenges in modeling of perturbing forces", J. Geod. 94:16, doi:10.1007/s00190-020-01342-2: "for all the Galileo-FOC satellites a significant Y-bias is visible, whereas the IOV satellites are not affected. The systematic shift is at the level of -7.0e-10 m/s^2 +/- 0.6e-10 m/s^2 for all the Galileo-FOC satellites", from CODE-MGEX ECOM Y0, 2014.0 to 2018.4, attributed there to asymmetrical radiators on the +/-Y surfaces; they suggest it as an a priori value. Read from the Wayback copy of the open-access PDF, SHA-256 1db2d50d98259cdf.... The size agrees with this look. Their sign is in CODE's Y axis; FFM's sign is measured from the module (below) and the relation between the two axes is not established here.

## 9. Disclosures

**Read before this registration, said plainly:** the published value of section 8 was read before registration, and so was the look. The sign against CODE's axis is open: FFM's sign is measured here, CODE's axis is not related to it here.

1. Known before registering: everything in SRP's README, including the look's K, R^2 and implied 0.69 to 0.75 nm/s^2, per plane and month, on dev and test dates together. The split is the first half against the second, fixed by date.
2. Probes before registration, in the scratchpad, with no fitted value, residual or error printed: FFM's response to Y0 from an ESA state (no truth compared), and the formal sigma of Y0 on five windows.
3. Module response, 96 h from the state, per +1 nm/s^2: T -132 m at beta +34.6 and +175 m at beta -72.5, as arithmetic predicts for +Y along +T at beta > 0. Y0 = 0 through the adapter differs from no ECOM2 by 0.0 m. Fixing T > 0 at beta > 0 therefore needs Y0 > 0 in FFM's axes.
4. Formal sigma of Y0, 10 m per axis, no effective prior: 0.94 nm/s^2 at beta -72.5, 1.36 at +34.6, 6.04 at -4.9 (FOC); 1.28 (IOV); 1.62 (GLONASS, -24.6). Correlation with AGOM -0.73 to +0.46. The formal sigma assumes 10 m; real residuals are about 0.2 m, so the true scatter may be far smaller, unless model error aliases into Y.
5. The fit and carry go through the pinned harness by a small adapter (lib/y0.mjs, coordinator's ruling Q1) that moves its signed constant-acceleration slot T onto ECOM2's Y0 in the FFM request. The harness is pinned by C3 and is not changed; a clean harness path can follow after C3's freeze. fit_batch's parameter kinds are opaque to the estimator; both slots are signed.
6. FFM scales Y0 by the visible fraction of the Sun, so it is off in umbra. A thermal force would not be. Galileo's umbra is at most about an hour of 14 h, in eclipse season only.
7. Base rows are this program's own SRP rows at the same pin; the E2E replays one through this runner bit for bit.
8. One satellite's known unlisted event stays as in SRP: R855, 2026-02-16.
9. IOV is two satellites and GLONASS four; their block values are noisier than FOC's.

## 10. Cost

Measured: one fit 2.3 s (2 FFM rounds with STM over the 24 h arc, 145 points at 600 s), one forecast 3.6 s (96 h from the fit epoch, covariance carried, outputs at the six leads); RK78, relative tolerance 1e-10, steps up to 120 s, 70 x 70; 4.2 and 6.8 s at load near 100. 690 + 1380 + 1380 + 360 = 3810 fits, each with one forecast: 6 to 12 CPU-h, 50 to 90 min on 8 workers. Store /opt/data/sdn-archive/ffm-galileo-y-bias, about 0.03 GB.
