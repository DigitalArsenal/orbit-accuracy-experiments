# C3-small: per-satellite, per-axis covariance scaling on non-maneuvering satellites

Registered 2026-10-31, before any C3 score. Not frozen; freeze by 2026-11-09. Base: experiments 22313bf; C2's constants
results/ffm-covariance-calibration/frozen-constants.json (SHA-256 7806980c7e3d655eaf7da31a32a4cb760293be53488a468e99b761b98726c837);
C2-A11. Rulings: coordinator QS1-QS10 of 2026-10-31. Owner (2026-10-29): "The only thing you should be working on right now is getting
the propagators accurate, the covariance accurate, and the conjunction assessment validated."

## What this tests

C3-small tests one change to C2's covariance: each satellite's is rescaled in each of three directions from how its past forecasts
compared with later fits, and widened or narrowed each day by how well that day's fit matched its data.

It is judged on 44 non-maneuvering high-orbit satellites (5 laser spheres, 14 GLONASS, 25 Galileo), pooled, on days C2 never scored,
without operator-notice spans or storm days (1 forecast in 5). The 6 lower spheres are only reported (too few, errors move together).
Forecasts use only data published before them, against truth sharing none of their data, with these limits. Earth orientation: P3 names the
source for each fresh cutoff, as issued at E if a dated archive exists; otherwise final values, and this sentence is then narrowed and the
effect stated here before any score. Cal/val keeps C2's finals file of 2026-10-09 so P4 reproduces. Weather: R2-M takes observed weather
and is labeled; R2-O takes what was issued by E; R3 has no drag and its weather rows are inert (P3 checks this). Answer 2026-12-21, or
2027-01-20 if the freeze check needs December.

## What a pass means

"Realistic outside storms, pooled over 44 named satellites, from precise orbits." It does not mean each satellite (one three times off
passes 89 %), radar or GP data, maneuvering objects or real time.

With C2's error shapes a correct covariance passes 80 % (85 % with December), one 40 % too large or 30 % too small 0-1 %, one 20 % too
small (the band's edge) about 20 %. One unannounced maneuver can sink a correct one (38 % at the worst rate C2's data allow).

## 1. Population, truth, dates

| Class | Truth, cutoffs: satellites (NORAD) | On disk (later fetched) |
|---|---|---|
| R3, judged | `ilrsa` weekly, Sundays 09-06 to 11-29: LAGEOS-2 22195, Etalon-1 19751, Etalon-2 20026, LAGEOS-1 8820. NSGF, 3-day: LARES-2 53105. ESA0OPSFIN, 3-day 09-25 to 11-30: GLONASS-M 40001, 44850, 37869, 54377 (C2's), 43508, 37867, 37868, 39155, 44299, 42939, 43687, 45358, 39620, 41330; Galileo 41859, 49810, 38857, 41861, 61183, 43565, 40544, 59600, 49809, 41549, 43058, 43056, 43564, 43566, 37846, 59598, 41860, 43057, 40890 (never in C2), 43567, 37847, 41862, 41174, 43055, 41175 (C2's six) | ilrsa to 260919, 261003, 261010 (reference-states, hac/ilrs-cddis, V1c5 cache); 260926 is a 307-308 B stub (Last-Modified 10-09): reissue sought, else 2 cutoffs lost; ESA0OPSFIN to 10-04 |
| R2, reported | NSGF daily arcs, 3-day 09-04 to 2027-02-01: Ajisai 16908, LARES 38077, LARETS 27944, Starlette 7646, WESTPAC 25398, Stella 22824 | 260829-261028 (`hac/ilrs-edc/nsgf-rapid`; 260829 is inside C2's span, C2-A11) |

**Out:** drag-LEO, active, altimetry, ISS, Starlink, GPS, GLONASS-K1, Sentinel-1D, TerraSAR-X, COSMIC-2. Galileo 40128 and 40129 (e 0.17) are reported.

**Arc-disjoint rule.** Fit track = the last 24 h of the latest arc ending (t_in) by the cutoff. Leads run from t_in. Truth and references
come only from arcs starting after t_in (C2's chain, `lib/precise.mjs:20-39`, restricted). NSGF daily arcs (3.8 d; LARES-2 6.6 d) end 5-10 h
before the next allowed one: R2 loses 1 h (some 6 h), LARES-2 1-6 h. ilrsa gives Sundays. ESA0OPSFIN per ESA's arcs (P1). P1 yield: at
least 3 leads in at least 80 % of cal/val windows, else R2 is a consistency check.

**Untouched by C2** (C2-A11): R2 after its NSGF truth (08-27/28) and L-P cutoffs (08-30); spheres from ilrsa 260905 (C2's to 08-29); GNSS
from 09-24. Disclosed: LARES-2's first arcs share normal points with arcs C2 scored. C3's û history (section 2) runs C3's own forecasts
against C3's own later fits on products inside C2's held-out spans, from 06-03, for every object including Stella, LAGEOS-1 and C2's six
Galileo; no C2 row is read and nothing inside those spans is scored (C2-A11 point 5).

**Other users of these spans** (labeled; strict stratum E >= 10-26): E14 (MGEX GLONASS and Galileo through 09-30), E2b (test 07-01 to
09-15), V1c5 (issue days 10-09 to 10-20; truth fetch 09-26 to 10-23), V1c5-rescore (truth fetch 10-04 to 10-24), HAC's NSGF fetch
(261012-261024, retrieved 10-24), etalon2-anomaly (ilrsa week 261010, b9142b4). C2's planner read E14, C1 and V1c4 (C2 PLAN:297). C3's
planner read none of their results.

**Exclusions.**
1. 90 % coverage (C2-A2).
2. **Truth gate:** `harness/truth-gate.mjs` (c275cea; RULES of f1c87d5) inline, then `experiments/truth-gate/scan.mjs --products <dirs>
   --out <sealed>` on each fresh file before scoring (center weeks fetched); ledger = scan output (known: Etalon-2 X = 0 on 10-05, 06, 08
   and 09, b9142b4).
3. **Storm samples:** [E - 24 h, E + L) meets a UTC day with GFZ Ap >= 30 (`hac/gfz-kp`): out of primary cells into a stratum (14-32 % of
   cal/val samples, including R3's 2026-01-19 outliers); fixed before more fresh weather is read.
4. **Notices:** any GSC NAGU or IAC notice naming the satellite, except return-to-service, over its stated interval (open: to the next
   return-to-service), overlapping [E - 24 h, E + 84 h], issued by the scoring date (by E in history). PRN/slot to NORAD by IGS SINEX
   SATELLITE/PRN validity. Months drop only on archive failure. Unlisted maneuvers stay in.
5. **The 05-09 gap:** validation windows that hit B1's dropped day (2026-05-09) are refused and counted, as in C2. No fill: XM2's A1 fill is
   not adopted here. A fresh window refused for missing weather is uncovered (section 3).

## 2. Model (nothing else)

`P_w(L) = D_o g_w(L) P_C2(L) D_o + C_w`: P_C2 is C2's frozen class covariance (R3; R2-O, R2-M); C_w is C2-A1's NSGF term, R2 only (P4 checks its axes).

- **(a)** `g_w(L) = (chi2nu_w / chi2nu~_o(E))^(a0 + a1 log10 L)`, unclamped; chi2nu~_o(E) is the median chi2nu of o's fits available at E within 90 d (at least 5, else the class median).
- **(b)** `D_o = diag(e^(u_k/2))` (RTN, per lead), `û_k = argmin 1/2 sum_j [ẽ_jk^2 / (e^u a_jk + c_jk) + ln(e^u a_jk + c_jk)] + (n0/4) u^2`, with a_jk = (g_j P_C2,j)_kk and c_jk = (P_ref,j + C_j)_kk. New code `axes-mle-ref` (gp-error-model's axes-mle lacks c and the prior), in the E2E.
- **History** j: cutoffs in (E - 90 d, E - 3 d]. ẽ_j = forecast minus a later FFM fit to the same product over the 24 h centered on E_j + L, shifted to the first allowed epoch (mid-arc from 12 h; no shared data). Usable if each file meets max(last epoch + lambda, Last-Modified) <= E: lambda NSGF 3 d, ilrsa 11 d (Last-Modified 10.5 d after span end, 260912-261003), ESA0OPSFIN 14 d after its GPS-week batch.
- **P_ref,j** = k_ref x the reference fit's a posteriori covariance at E_j + L; k_ref per class, axis and lead group (1-12 h, 24-72 h) by maximum likelihood of reference minus truth (P-REF). k_ref = 1 is reported.
- **Constants** by calibration log score: a0 -0.2 to 1.2 (step 0.1), a1 -0.8 to 0.8 (0.2), refined; n0 in {0.5, 1, 2, 5, 10, 20, 50}. C3-0 (C2's constants alone), C3-a, C3-b and C3-ab are reported. Stop if the validation interval of C3-ab minus C3-0 is below 0.
- **Sets:** calibration 2025-10-03 to 2026-03-29, validation 04-01 to 05-31: R3 LAGEOS-2, LARES-2, Etalon-1/2, GLONASS 40001, 44850, 37869, 54377, the 19 new Galileo; R2's five spheres. History-only windows from 06-03 run sealed after the freeze. Pooled verdict over all 44; Galileo calibrated on the 19 new ones (QS2). R2 reported only (QS3).

## 3. Test and verdict

- **Cell** (class, lead), storm samples out: band mean d2/3 0.8-1.25, coverage 0.93-0.97; per axis mean z^2 0.5-2.0, |mean z| <= 0.5. Refusals are uncovered (more than 1 % fails a cell). Missing O weather (no RSGA 72 h before E) is a counted exclusion.
- **Eligible:** n >= 100, at least 3 clusters (spheres singly; Etalon-1 and -2 in GLONASS planes 1 and 3 by RAAN; GNSS by IGS plane), n_eff = (2/3)/Var(cell mean d2/3) >= 60 under P7's heavy-tail arm, on realized counts.
- **Verdict, k = 3 fixed:** at least 3 eligible cells; each eligible 95 % two-way interval (clusters x 12-day blocks, over the 8 d and 10 d GNSS repeats; 10,000 resamples, seed SHA-256 `C3S|boot|<class>|<lead>`) overlaps the band; at least 3 in band; else "not realistic" (fewer than 3 eligible: "not testable"). **Judged** only if P7 gives P(pass | perfect) >= 0.80 and <= 0.10 at x0.7 and x1.4 (heavy-tail arm); else one month once (R3 to 12-31); else reported.
- **Q6 (must each direction pass too?):** (a) the band decides, per-axis reported, |mean z| > 0.5 labeled biased; (b) a cell counts only with band and all axes in range, and every eligible per-axis interval overlaps. Q6 is the owner's. A yes by 2026-11-09 23:59 UTC -> (b). A no, or no answer by then -> (a). The answer is recorded in a dated commit, whether or not the freeze commit has landed, and before any fresh file is scored. An early freeze commit does not shorten that window; the freeze commit carries Q6 as whichever is then known.
- **Attribution:** fresh paired log score C3-ab minus C3-a (isolates (b)) and minus C3-0, 95 % two-way intervals. "(b) helps" only if the first is above 0 (planner's validation estimate R3 +1.43 [0.92, 2.03]).
- **Wording:** "realistic outside storms, pooled over 44 named satellites (25 Galileo, 14 GLONASS, 5 spheres), notice-free spans, <span>"; a constellation with all eligible cells out of band is named.
- **Reported:** per satellite n, mean and geometric-mean d2/3, coverage, z^2, z, CvM pass rate (p >= 0.02), excess spread. Strata: storm, constellation, plane, eclipse season (|beta| < 12.4 deg Galileo, 14.5 deg GLONASS; new to Galileo plane A and GLONASS plane 2), strict, C2's screen.

## 4. Power (planning)

Copula on C3-ab's non-storm dependence, resampled cal/val storm days, GNSS keep 0.92. Heavy-tail arm (registered): C3-ab's non-storm d2/3 per lead, mean 1, variance 0.63-1.41 against 0.67. 1,000 trials, alternatives 500 (x0.7, x1.4: 300).

| R3, 44 in 9 clusters, to (n/cell) | n_eff heavy (Gauss) | P(pass given perfect) heavy k = 3 (k = 2); Gauss | Pass x0.7 / x0.8 / x1.25 / x1.4, heavy k = 3 (k = 2) |
|---|---|---|---|
| 11-30 (650-760) | 56-89 (76-88) | 0.79-0.80 (0.90-0.93); 0.97 | 0.00 / 0.03 (0.11-0.13) / 0.18-0.21 (0.37-0.44) / 0.01 (0.03) |
| 12-31 (920-1,080) | 62-106 (76-91) | 0.85 (0.90); 0.97 | 0.00 / 0.02 (0.07-0.09) / 0.30-0.33 (0.45-0.48) / 0.01 (0.04) |

- Heavy-tailed, x1.25 sits on the band's edge (mean 1.25, coverage about 0.94): no error rate.
- **Risks (11-30):** unlisted GNSS maneuvers at the 95 % bound, 0.0064 per window (0 of 472 GLONASS cal/val windows) -> 0.38; same-plane correlation 0.3 -> 0.71; storms kept -> 0.67; one satellite x3 passes 0.89. Q6 (per-axis model, measured z dependence): perfect 0.998 either way; a 0.7-sigma along-track bias passes 0.18 under (a), 0.004 under (b).
- **Not testable** (n_eff < 60 in at least 4 cells): Galileo alone (25, 3 planes) 35-57; spheres + GLONASS (19) 39-66, also to 2027-01-02; R2 21-39 (Gaussian 46-50), also to 05-01; without C2's six Galileo the 1 h cell drops (P 0.77); strict R3 48-76.

## 5. Pre-checks (cal/val; fail = stop and ask)

- **P1** names, spans, arcs, Last-Modified, 260926 reissue, yield.
- **P2 (freeze gate):** both archives give dated entries for every month 2025-09 to 2026-05 (per month: count, types, issue times; later entries sealed). Unlisted rate = C2-screen flags or d2/3 > 30 on C2's GLONASS cal/val without a notice -> P7. A failed archive drops its constellation: R3 not testable (n_eff <= 66).
- **P3** RSGA/SGARF to 2027-02-05, GFZ Ap to scoring. Names the Earth-orientation source for each fresh cutoff: as issued at E if a dated archive exists; otherwise final values, disclosed where "What this tests" states the data rule, with that sentence narrowed so it stays true, and the expected effect on the GNSS along-track axis reported from numbers. Checks that R3's weather rows are inert.
- **P4** C3-0 under C2's chain reproduces `fit-R*.json`, errors, terms, and bridges to the pin (section 6):
  - **P4a, on C2's exact chain:** the frozen candidate's cells in `fit-R3`, `fit-R2` and `fit-R2-O` recomputed from stored rows equal the receipts; 20 windows per class replayed bit for bit. R2-O's 238 refused calibration windows: the count per reason is reported; a reason that bears on P_C2 for R2-O stops the run.
  - **P4b, the same windows on the pin:** R3 state and errors bit-identical, |delta(d2/3)| <= 1e-9. R2 |delta(d2/3)| <= 1e-3 + 1e-3 x d2/3. A class-fit termination may change only to CONVERGED. `pair_statistics`, `noise_responses` and `dcp_covariance` on gp-error-model 0.11.0 are bit-identical to 0.10.0 on the same inputs. Any failure is stop and ask; the limits do not move.
  - **Windows:** per class (R3, R2-M, R2-O) the 20 stored windows of C3's calibration satellites, with a converged fit and stored terms, that have the lowest SHA-256 of `C3S|p4|<class>|<norad>|<E>`, excluding the 16 windows replayed in this lane's step 0; those 16 are reported separately.
- **P5** hand-off, 0 refusals.
- **P-REF** (class, axis, lead): k_ref; stop if |corr(forecast - truth, reference - truth)| >= 0.2 (interval excludes 0) or reference-based e^û is more than 10 % off truth-based.
- **P7** on C3's chain: dependence, marginal, same-plane (Galileo's own; C2's GLONASS pairs: ln d2 -0.34 to 0.12), 2,000 trials, storms, P2's rate, realized keep. **P8** û on synthetic histories (measured a, c, latencies, dependence): |median e^û/e^u - 1| <= 10 % per class, axis, lead.
- **P10** integrity. **P11** 2026-01-19 (R743, Etalon-1, plane 1): IAC notices, ilrsa 260124 vs the centers, EOP, frames. **P12** hashes.

## 6. Schedule and compute

- **Freeze 2026-11-09**, then sealed. The freeze commit holds the constants, k_ref, gate thresholds, dependence parameters and the fetch manifest rule. **Scored once:** R3 2026-12-21 (ESA batch 12-05 + 14 d; ilrsa 261205 + 11 d) or 2027-01-20; R2 2027-02-10; late files are missing. This task lands at the freeze; scoring is a separate task.
- About 5,500 windows (cal/val 2,592 with Galileo, history about 1,450, fresh about 1,450) at 45-80 s each: 70-110 CPU-h, 35-50 before the freeze, at most 12 workers. FFM: RK78, relative tolerance 1e-10, steps up to 120 s; cal/val forecast outputs at the six leads; noise grid 600 s; fit tracks at 600 s.
- **Modules:** modules 9a05d899b for all C3 windows (cal/val, history, fresh): analysis/estimation 0.7.0 7a555ca5, propagator/ffm 2.0.4 c36f1b14, analysis/gp-error-model 0.11.0 8e13eddb, read with `git show` and SHA-256 checked (`build.json`). Later module bytes are outside the verdict. C2's chain (estimation 0.6.0 0e7b4f6a at f54b5107; FFM 2.0.0 d0b04935 and gp-error-model 0.10.0 a7a0e218 at c860a072) is snapshotted the same way, for P4 only. XM's libraries: `git archive 8f2926174 experiments/xp-atmosphere-merit` into the C3 store, SHA-256 checked against `xm-libraries.json`, with C3's own copy of C2's `weather-o`; C2's code is not edited.
- **Earth orientation:** cal/val keeps C2's file (hac/iers-eop/20261009, B1's environment) so P4 reproduces. Fresh cutoffs: P3's ruling, recorded in a dated commit before any score.
- **E2E:** `node experiments/ffm-covariance-adaptive/run.mjs --check`: a cal/val window per class through the arc-disjoint chain, P_ref, `axes-mle-ref`; d2, û, g bit for bit.

## 7. Disclosures

- **C2 held out, the unscreened baseline** (published): by time R2-O 1 of 6 in band (with Sentinel-1), R3 4 of 6; by object (LAGEOS-1, six Galileo) 0 of 6, unscreened mean d2/3 4.4-8.9, coverage 0.30-0.45, along-track z^2 5.6-22.
- **Authorship of C2-A11:** written by this lane, which benefits from it, after C2's held-out summaries were published. Its file-name receipt: 427 NSGF extension files, 0 named in C2's 156 opened-file logs; 7 share product names with conversions C2 read, count as opened whatever their bytes, are not compared and are not released.
- **P4b's limits came from the sample they would describe:** they were set after this lane's step 0 replayed 16 stored C2 windows (6 R3, 10 R2 M; largest measured |delta(d2/3)| 5.7e-13 on R3, 2.3e-4 on LARETS, 2.2e-3 on Sentinel-1C at d2/3 near 1e4). P4 therefore tests them on 20 other windows per class, chosen by the hash rule in section 5, and reports the 16 separately.
- **Planner integrity:** nothing barred opened (C2 held-out rows, B2 files, fresh truth, others' results, ids files, Vallado or USSF SGP4). Ap read to 2026-05-31 only. Earlier fresh-weather reads disclosed: RSGA 10-08, SGARF 10-11.
- **Sealed:** `dl/ids-man` (ten IDS maneuver lists of altimetry satellites, fetched by an earlier planner for the removed H-O R2 class; 36 later-entry counts in its cadence receipt). No C3 step reads either; none of C3's satellites is on those lists.
- **Unresolved at registration:** S-B6 (a) closed by the seal above; unlisted GNSS maneuvers stay a registered risk (P2, P7).
- **Practice.** CARA: 90 days at 3-day spacing against a definitive orbit plus its covariance, Rosner outliers dropped, re-tune below 60 %, D C_SE D plus a bias shift. C3 keeps C2's correlations and outliers and drops storms a priori. JSpOC: factor distributions over a year for Monte Carlo Pc.
- **Step 0 of this lane** read: C2's R2 and R3 calibration and validation rows (terminations, rejected trials, 16 windows replayed under three module chains, d2 of those windows with C2's constants); C2's opened-file logs (names); a pre-seal IAC bulletin, pre-seal GSC rows and one 2023 NAGU, only to establish the archives' form; XM3's `build.json` and the plan lines on its pins. `git log` printed XM2's and XM3's result subjects; no results file of theirs was opened. No C3 score existed.
