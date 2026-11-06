# PER-REV-FLAG: the maneuver flag read revolution by revolution from FFM24's flight

Amendment of 2026-11-06 under `experiments-ffm-step-flag-per-rev-20261105`, committed and pushed before any re-flag row is read. It amends the flag of `S1-STEP-FREE.md` ("The flag, fixed here"), of `maneuver-flags.mjs` and of every FFM-vs-AP table and comparison cell that splits windows on it (`results/operator-theory`, `results/ap-truth/compare`, `cells.json`). It is written in its own file because `S1-STEP-FREE.md`'s registration holds every one of its commits before its first row. Report: `results/operator-theory/per-rev-flag`.

## Post hoc

The rule was chosen after the Sentinel-1 analysis `S1-24H-DAY7.md` (`results/operator-theory/s1-24h-day7`), which read 52 Sentinel-1 windows and found every one of the 35 FFM losses at day 7 on a burn of 3.16 to 10.58 m that the 8 m truth step does not flag. Nothing here is a test: every window it runs over was read before. The counts before (the 8 m flag) and after (this rule) are reported per regime.

## The rule

`lib/steps.mjs`, replacing the 8 m truth step (not beside it). For a window with cutoff C:

1. FFM24: `propagator/ffm` 2.2.0 (`lib/build.mjs` FFM_220) by `analysis/estimation` 0.7.0 fitted to the 24 h arc before C at CHEAPER.md's settings (the 40x40 low-orbit settings, or the 20x20 high-orbit settings at 8400 km and above, as `all-regimes.mjs`), as-issued weather, no weather in vacuum. It is flown over [C - the window's longest fit arc, C + 168 h] at the truth's epochs (30 s where the product is finer).
2. Mean semimajor axis per revolution, of the flight and of the truth alike: the time mean of `foundation/orbits` 0.1.0's osculating semimajor axis, ascending node to ascending node (`revolutions`).
3. The difference: each flight revolution less the truth revolution starting within 10 minutes of it.
4. Consecutive differences d(i) - d(i-1) where the two revolutions are k = 1 to 7 periods apart (holes of up to 7 orbits bridged; a longer hole is not bridged); the drift, the median over k = 1 of those changes in the span, is removed as d(i) - d(i-1) - k × drift.
5. A window is flagged at a fit arc F and lead L when a drift-free change of 1 m or more (either sign) falls in [C - F, C + L]; burn-free when none does and the compared revolutions cover the span (none of its holes longer than 7 periods, the first and last within 2 periods of its ends); unchecked otherwise, and wherever FFM24 has no fit.

The 8 m low-orbit step and the geosynchronous hourly rule are replaced by this rule in every table this record writes; their old figures are quoted only as the "before" counts. TESS's perigee steps stay the record of `TESS-RESCORE.md`.

## Validation

- S1-24H-DAY7 reproduced from its stored rows (`/opt/data/sdn-archive/operator-theory/s1-24h-day7`): at F = 24 h and L = 168 h, 35 of its 35 day-7 FFM losses are flagged and its 5 burn-free windows are not. The flag E2E asserts both numbers.
- False alarms, named before any re-flag row: the passive objects carry no thruster, so every flag on them is a false alarm: Ajisai, Starlette, WESTPAC, LARES and LARETS (laser spheres), LAGEOS-2, Etalon-1, Etalon-2 and LARES-2 (laser geodetic). Their flagged share is reported per fit and lead; the 1 m threshold is not changed after it is read.

## Regimes

Every stored window of the comparison: near 700 km (Sentinel-1A and 1C, AP5's 2026 windows), strong drag (AP5's 2025 and 2026 windows), laser spheres and laser geodetic, geostationary (WAAS from the broadcast message type 9, GEO-TRUTH.md; the GFZ geostationary satellites), medium Earth orbit, inclined geosynchronous; the altimetry satellites and the highly elliptical windows beside them.

## Reported

Per regime, fit and lead: windows flagged, burn-free and unchecked under the 8 m flag (where a record covered them) and under this rule; and on the burn-free windows the paired FFM/AP ratio, exp(median by window of ln(FFM / AP)), with its 95 % interval over object-week clusters (10,000 draws, the seed from SHA-256 of the cell), the statistic of `ffm220-ratio.mjs`. FFM is the 2.2.0 store (`ap/ffm220`) where it exists, else the store the cell reads (named per row); AP is sdn-ap 0.5.1 (`ap/b051`).

## Decision rule

A near-700 km or geostationary cell whose burn-free ratio interval holds 1 or lies below 1 is explained by maneuvers. A cell whose burn-free interval lies above 1 names an FFM defect for the coordinator; no fix is made here. No propagator or estimation change.

## Counts, 2026-11-06, after the run

Written after every re-flag row was read (1,522 windows, `results/operator-theory/per-rev-flag`). Windows flagged before (the 8 m step, the geosynchronous burn record) and after, at the longest lead (168 h):

| Regime | Fit, h | Windows | Flagged before | Flagged after | Burn-free after | Burn-free FFM/AP [95 %] | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Near 700 km | 24 | 274 | 116 | 267 | 5 | 0.185 [0.143, 0.813] | explained |
| Near 700 km | 72 | 257 | 122 | 250 | 2 | 0.538 | explained |
| Geostationary (GFZ) | 72 | 32 | 14 | 8 | 23 | 1.463 [1.028, 1.97] | FFM defect |
| Geostationary, WAAS | 24 | 76 | 33 | 75 | 1 | 0.998 | explained |
| Geostationary, WAAS | 72 | 74 | 33 | 71 | 0 | - | undecided |
| Medium Earth orbit | 24 / 72 | 748 / 746 | no record | 7 / 9 | 741 / 737 | 0.314 / 0.843 | - |
| Inclined geosynchronous | 72 | 59 | no record | 59 | 0 | - | - |
| Low orbit, altimetry | 24 / 72 | 103 / 103 | 32 / 40 | 32 / 40 | 69 / 61 | 0.129 / 0.442 | - |
| Laser spheres | 24 / 72 | 49 / 56 | no record | 29 / 29 | 16 / 15 | 0.67 / 0.541 | false alarms |
| Laser geodetic | 72 | 43 | no record | 1 | 41 | 0.499 | false alarm |

Near 700 km at 72 h fits: 72/48 burn-free 28 at 0.714 [0.431, 0.956], 72/72 18 at 0.926 [0.496, 1.321]; geostationary (GFZ) 72/72 28 at 1.142 [0.904, 1.527]: explained. The false alarms named in advance: LARETS, WESTPAC and Starlette are flagged on 12, 12 and 13 of their 15 windows at 24/168 (changes of 1.35 to 4.52 m, recurring at the same epochs from different cutoffs); Ajisai, LARES, Etalon-1, Etalon-2 and LARES-2 on none; LAGEOS-2 once (a single -28 km change). The flag therefore also fires on signals that are not burns below about 1,100 km, and the near-700 km burn-free sets are small. The WAAS broadcast truth flags nearly every window. Every cell is in `table.json`.

## Amendment 2026-11-06: why the passive spheres flag, two separating tests

The false-alarm check above failed: the rule flags most windows of LARETS, WESTPAC and Starlette, which carry no thruster. Before any row of these tests is written, two tests are registered to separate the causes. No threshold of the flag changes; no rule (b) is implemented here. Runner `per-rev-flag-separate.mjs`, table `per-rev-flag-separate-table.mjs`, report `results/operator-theory/per-rev-flag/separate`. The flag epochs of the passive spheres were read before this amendment (they are in `table.json`); the truth-product join epochs, the cutoff-boundary coincidences and every model-truth row were not.

Objects: the low passive spheres LARETS, WESTPAC and Starlette (the "low" set), and beside them Ajisai and LARES (laser spheres near 1,450 km) and LAGEOS-2, Etalon-1, Etalon-2 and LARES-2 (laser geodetic). Windows: every window of theirs in `per-rev-flag` whose FFM24 fitted. Span: fit 24 h, lead 168 h, [cutoff - 24 h, cutoff + 168 h].

1. Join test. The units are the flagged changes: every drift-free change of 1 m or more in a window's span, at t, the start of the later revolution of its pair, with P the window's period. A unit coincides with an epoch set when an epoch of the set lies in [t - P, t + P]. Two epoch sets: (i) the truth product's file joins, the first epoch of each product file after the object's first, where the chained series moves to the next file (`sources.mjs` chain); (ii) the cutoff boundaries, the window's cutoff and its fit-arc start (cutoff - 24 h). The statistic is the count of coinciding units, pooled over the low set's windows. The null redraws, in each window, as many revolution starts as it has flagged units, uniformly without replacement from that window's compared revolution starts in the span: 10,000 draws, seed SHA-256 of `PERREV-JOIN|<set>`; one-sided p = (1 + draws at or above the observed count) / 10,001. Joins (or boundaries) explain the flags when the coinciding share is 0.5 or more and p is 0.01 or less; they do not when p is above 0.05; otherwise inconclusive.
2. Truth-product control. Per window, a model truth with no file joins but with drag: FFM24's fitted product (as-issued weather) flown over [cutoff - 72 h, cutoff + 168 h] at the window's truth epochs on the definitive weather (`lib/weather.mjs` rowsM, XM's condition M), so the drag of the model truth follows the observed storms while the detector's flight follows the as-issued forecast. The detector then runs unchanged on the model truth: FFM24 fitted to its 24 h arc before the cutoff (same thinning, same settings, as-issued weather), flown over the same span, revolution means of both, revFlag at 1 m. Statistic: the flagged share at 24/168 on the model truth against the real truth, on the same windows. The truth product is the cause when the low set's model-truth share is 0.10 or less and at most a third of its real-truth share; a drag-rate change (storm-time density near 700 to 800 km), which a step rule cannot separate from small burns without a drag term, when the model-truth share is half the real-truth share or more; mixed between. Limit stated in advance: the model truth carries only the difference between the as-issued and the definitive weather, not density structure NRLMSISE-00 lacks.
3. WAAS broadcast truth, its own line, report only: its flagged share and the join test against its broadcast runs (each run of 256 s records starts a join), with no burn verdict.

### Results of the two tests, 2026-11-06 (`results/operator-theory/per-rev-flag/separate`)

- Model-truth control, low set: 37 of 37 windows flagged on the real truth, 0 of 37 on the model truth (its largest change, median 0.009 m): the truth product is the cause, not a drag-rate change. The other passive objects flag on neither.
- Join test, low set: 22 of the 1,209 flagged changes lie within a period of a product file join (share 0.018, null median 15, p 0.026): inconclusive by the rule, and far from the 0.5 share; the cutoff boundaries do not explain them (23, null median 23, p 0.58). The cause is the product's own revolution-to-revolution scatter, not its joins.
- WAAS, report only: 78 of 79 windows flagged; broadcast-run starts (19 of 405, p 0.050) and cutoff boundaries (66 of 405, p 0.88) do not explain them.

Exploratory, not registered: the median per window of the drift-free revolution-to-revolution change is 0.91, 0.80 and 0.40 m on LARETS, WESTPAC and Starlette (180 s products), 0.013 to 0.016 m on Ajisai, LARES, the geodetic satellites and the altimetry products, 0.019 m on Sentinel-1, 0.061 m geostationary (GFZ), 0.53 m inclined geosynchronous and 44.8 m on the WAAS broadcast. A 1 m threshold sits inside the low spheres' and the WAAS truth's own scatter.

## Amendment 2026-11-06: rule (b) and its validation, parameters fixed before any row

SDN-AP session ruling. Rule (b) is registered whole with its parameters fixed here (k = 10, 0.2 m, N = 6); the validation tests it and never tunes it. k, 0.2 m and N were chosen after the exploratory scatter above was read; every validation window below lies outside the windows that scatter came from. Runner `per-rev-flag-validate.mjs`, table `per-rev-flag-validate-table.mjs` (rule (b) in `lib/steps.mjs` `revFlagB`), report `results/operator-theory/per-rev-flag/validate`. Until rule (b) passes as registered, the near-700 km and geostationary verdicts stay unresolved.

**Rule (b).** On FFM24's flight less the truth, revolution by revolution (as above, flown over [C - 72 h, C + 168 h]), with the drift the median one-revolution change over [C - 24 h, C + 168 h]:
1. Noise-scaled threshold: the window's typical change τ is the median of the absolute drift-free changes between consecutive compared revolutions over [C - 24 h, C + 168 h]; the threshold is θ = max(1 m, 10 τ).
2. Persistence: at each compared revolution i, the median of the differences of revolutions i to i + 5 less the median of revolutions i - 6 to i - 1 (N = 6 each side, or as many as the flown span holds, at least 2 each side), less the drift times the periods between the two medians' middle revolutions. A step is a revolution where its absolute value is θ or more and the largest within N revolutions either side; its epoch is the start of revolution i.
3. No verdict: a window with τ above 0.2 m gets no burn verdict either way (neither flagged nor burn-free), at every fit and lead.
A window is flagged at fit F and lead L when a step lies in [C - F, C + L]; burn-free when none does and the compared revolutions cover the span (no hole over 7 periods; first and last within 2 periods of its ends); unchecked otherwise.

**Validation (all three must pass):**
1. Known burns: the 26 Sentinel-1 burns of the covariance-model catalog's recall set (`COVARIANCE-MODEL.md` amendment 3: `s1-24h-day7`'s truth steps, deduplicated within 3 h). One window per burn, its cutoff 00:00 UTC two days before the burn's day. Detected when a step of rule (b) lies within one period plus 3 h of the burn; a no-verdict window counts as missed. Pass: 25 of 26 or more (at least 95 %).
2. Injected steps: along-track velocity changes sized for a semimajor-axis rise of 2, 3, 4 and 8 m, injected into the truth at an epoch t_b. The truth after t_b gains the difference between two FFM flights from t_b of the window's own FFM24 product: one with its state at t_b, one with that velocity scaled by Δv = μ Δa / (2 a² v) (a and v from `foundation/orbits` and the state; the realized rise measured and reported). Windows from dates not in the current set: Sentinel-1A and 1C, cutoffs 2025-10-05 to 2025-12-21 less the 26 of `s1-24h-day7` (the first 40 by SHA-256 of `PERREV-INJ|<key>`); GFZ geostationary, cutoffs every 14 days from 2026-02-02 to 2026-08-31 (every window). t_b is the middle of the longest stretch of (C + 12 h, C + 156 h) with no step of rule (b) on the window's own uninjected truth (and, on Sentinel-1, none of the covariance-model catalog's 4 m truth steps); a window whose longest stretch is under 24 h is not used. Detected when a step of rule (b) on the injected truth lies within one period plus 3 h of t_b and the uninjected truth has none there; a no-verdict window counts as missed. Pass: 95 % or more at 3, 4 and 8 m, separately for Sentinel-1 and geostationary; 2 m reported.
3. False alarms: quiet windows from dates not in the current set: Ajisai and LARES (cutoffs 2025-10-12 to 12-17 every 5 days), LAGEOS-2, Etalon-1, Etalon-2 and LARES-2 (2025-10-14 to 12-16 every 7 days), the altimetry satellites (2025-10-12 to 12-17 every 5 days, a window used only when the covariance-model catalog's `dols` steps hold none in [C - 72 h, C + 168 h]). Of those with τ of 0.2 m or less, the share with a step of rule (b) in [C - 24 h, C + 168 h]. Pass: 5 % or less. The no-verdict count is reported.

Holds unchanged: Swarm and GRACE-FO, the held Galileo satellites, every Starlink group, C2's objects and cutoffs, operator captures.

### Result, 2026-11-06: rule (b) fails as registered (`results/operator-theory/per-rev-flag/validate`)

Known burns 11 of 26 (pass line 25). Injected, Sentinel-1 (40 windows): 2 m 36, 3 m 38, 4 m 38, 8 m 30 of 40 (7 no verdict); geostationary (GFZ, 40 windows; 85 of the 128 registered had no truth over their span, the 2026 GFZ product holding the BeiDou geostationary satellites only to 2026-04-20 and 02-07): 15, 18, 18 and 18 of 40. False alarms 0 of 79 quiet windows (pass). The near-700 km and geostationary verdicts stay unresolved.

Read after the result, not registered, and not used to change anything: every one of the 26 known burns has a step of rule (b) (3.0 to 9.9 m) within 11.5 h of the catalog epoch, but 15 lie outside one period plus 3 h; the catalog's epochs come from 12-revolution medians, whose epoch the earlier study found within 13 h of the flight-differenced step. At geostationary orbit N = 6 revolutions spans six days, so a window keeps only its largest step (burns of hundreds of meters in the flown span hide the injected one), the typical change and the drift come from about eight revolutions and move with the injected step, and QZS-2G yields no node-to-node revolutions. On Sentinel-1 at 8 m the typical change of 7 windows rises from about 0.03 to 0.3 m with the injected step, which points at the injection (two separately integrated flights differenced) as much as at the rule.

## Amendment 2026-11-06 (c): rule (c), near 700 km only, registered before any row

SDN-AP session ruling after rule (b) failed (recorded above, nothing tuned). Rule (c) is narrowed to low orbit near 700 km. Geostationary burn verdicts are parked: rule (c) gives none, and the geostationary FFM question continues in its own record (experiments-ffm-geo-168h-candidate-defect-20261106) through force settings. Every parameter below is fixed here, before any row of (c); the changes from (b) were chosen after (b)'s failure analysis was read. Runner `per-rev-flag-c.mjs`, rule `lib/steps.mjs` `revFlagC`, table `per-rev-flag-c-table.mjs`, report `results/operator-theory/per-rev-flag/c`. Until rule (c) passes as registered, the near-700 km verdict stays unresolved.

**Rule (c).** On FFM24's flight less the truth, revolution by revolution (flown over [C - 72 h, C + 168 h] as above):
1. Persistence in hours: at each compared revolution i, the median of the differences in [t_i, t_i + 10 h) less the median in [t_i - 10 h, t_i) (at least 3 revolutions on each side), less the drift times the hours between the two sets' median epochs.
2. Drift and typical change away from the candidate: from the one-revolution changes in [C - 24 h, C + 168 h] whose revolutions lie more than 10 h from t_i, the drift is their median rate (m per hour) and the typical change τ_i the median of their absolute drift-free sizes.
3. Noise-scaled threshold: a step is a revolution whose absolute residual is at least θ_i = max(1 m, 10 τ_i) and the largest within 10 h either side (the first of equals); its epoch is the start of revolution i.
4. No verdict: a window whose typical change, over the one-revolution changes more than 10 h from every step it holds, exceeds 0.2 m gets no burn verdict either way.
A window is flagged at fit F and lead L when a step lies in [C - F, C + L]; burn-free when none does and the compared revolutions cover the span; unchecked otherwise (as rule (b)).

**Known-burn tolerance.** The catalog's own timing precision, fixed: a known burn is detected when a step of rule (c) lies within 13 h of its catalog epoch (the covariance-model catalog's 12-revolution-median epochs). No re-timing.

**Injection.** One flight carries the step: at t_b, the truth state there with its velocity raised along-track by Δv = μ Δa / (2 a² v) (a from `foundation/orbits`, the realized rise measured and reported), flown by FFM from t_b over the window's truth epochs with the window's FFM24 settings, fitted parameters and weather; the truth before t_b is unchanged. t_b is the first truth epoch at or after the middle of the longest stretch of (C + 12 h, C + 156 h) holding no step of rule (c) on the uninjected truth and no step of the covariance-model catalog; a window whose stretch is under 30 h is not used. Detected when a step lies within 13 h of t_b and the uninjected truth has none there.

**Fresh validation windows** (`per-rev-flag-c.mjs` `windowsOf`), known-burn and injection cutoffs from 2025-10-05 to 2025-12-21 (the quiet set's in part 3), none used in (a), (b) or the choosing: for Sentinel-1A and 1C no cutoff of S1-24H-DAY7, of (b)'s injection windows or of (b)'s known-burn windows; for the altimetry satellites and the spheres no cutoff on 2025-10-10 + 5k (the comparison's regimes, (a)'s separating tests) or 2025-10-12 + 5k ((b)'s quiet windows). Objects near 700 km: Sentinel-1A, Sentinel-1C, CryoSat-2, SARAL, Sentinel-3A, Sentinel-3B (propulsive); LARETS, WESTPAC, Starlette (passive). Every (c) window is flown without XP2F_CONTROL, through the 2025 readers and AP9.md's spring 2026 products and reports.
1. Known burns, 84 windows: every step of the covariance-model catalog (`s1q4`, `dols`; 4 m truth steps) from 2025-10-07 to 12-23 on the six propulsive objects, less (b)'s 26 burns; one window per burn, its cutoff the burn's day less 2 days (else 3, else 1) when that cutoff is fresh. Sentinel-1A 13, Sentinel-1C 14, CryoSat-2 9, SARAL 9, Sentinel-3A 19, Sentinel-3B 20. A window with no fit, no truth or no verdict counts as missed. Pass: 95 % or more detected within 13 h (80 of 84).
2. Injected steps of 2, 3, 4 and 8 m, 60 windows: the first 40 fresh Sentinel-1 cutoffs (Sentinel-1A 26, Sentinel-1C 14) and the first 20 fresh altimetry cutoffs (CryoSat-2 5, SARAL 2, Sentinel-3A 9, Sentinel-3B 4) by SHA-256 of `PERREV-C-INJ|<key>`, none a known-burn window. A window without a stretch of 30 h is not used and is reported; a no-verdict window counts as missed. Pass: 95 % or more of the used windows at each of 3, 4 and 8 m, pooled near 700 km (Sentinel-1 and altimetry reported apart); 2 m reported.
3. False alarms (amended 2026-11-06 at the SDN-AP session's ruling, before any flight; the 33-window set first written here is replaced), 83 windows (`quietWindows`): every fresh cutoff of the four near-700 km altimetry satellites whose burn catalog holds no step in [C - 37 h, C + 181 h] (the flagged span widened by the 13 h tolerance) and covers that span, and that is not a known-burn window: 2025-10-04 to 12-23 off 10-10 + 5k and 10-12 + 5k, catalog the covariance-model `dols` files (CryoSat-2 8, SARAL 16); 2026-01-22 to 04-23 off 2026-02-02 + 5k (AP9.md's windows), on the spring 2026 products, catalog `results/operator-theory/per-rev-flag/c/catalog` (the `dols` detector unchanged on the truth, written by `per-rev-flag-c-catalog.mjs` before any flight: CryoSat-2 8 steps, SARAL 11, Sentinel-3A 26, Sentinel-3B 27) (CryoSat-2 27, SARAL 17); Sentinel-3A and 3B hold no clean window in either period. 68 altimetry windows in all; beside them the first 15 fresh sphere cutoffs by SHA-256 of `PERREV-C-QUIET|<key>` (LARETS 5, WESTPAC 2, Starlette 8), whose truth is expected to give no verdict. The windows overlap in time (consecutive cutoffs of one satellite share most of their span). Statistic: of the n windows with a verdict, the count with a step in [C - 24 h, C + 168 h]. Pass: n at least 60 and at most floor(0.05 n) flagged (3 at n from 60 to 79); under 60 windows with a verdict the part is undecided and rule (c) does not pass. Operating characteristics (independent windows, binomial): at n 60 and at most 3, the pass chance is 0.968 at a true false-alarm rate of 2 %, 0.647 at 5 % and 0.137 at 10 %; at n 68 and at most 3, 0.952, 0.556 and 0.082. "Quiet" means only that the catalog holds no step, and the catalog can miss small burns: every flag is reported with its epoch and size for report-only review against public operator records, and the count does not change after it is read. The catalog sees steps of 4 m or more while rule (c) aims at 1 to 3 m, so a quiet window can hold an uncataloged burn under 4 m that rule (c) flags correctly but that counts here as a false alarm: the test leans toward failing, which is accepted as conservative; such cases show in the report-only review of each flag against operator records, and the count stands as read.

Holds unchanged: Swarm and GRACE-FO, the held Galileo satellites, every Starlink group, C2's objects and every Sentinel-1 cutoff from 2026-06-01, operator captures.

### Result, 2026-11-06: rule (c) fails as registered; the flag is parked (`results/operator-theory/per-rev-flag/c`)

Known burns 41 of 84 within 13 h (Sentinel-1 26 of 27, the one miss without a fit; altimetry 15 of 57). Injected 54 of 57 used windows at each of 2, 3, 4 and 8 m (Sentinel-1 34 of 37, altimetry 20 of 20). False alarms 6 of 68 windows with a verdict, 3 allowed (11 of 79 flown without a verdict). Nothing was tuned. At the SDN-AP session's ruling the per-revolution flag is parked with no rule (d): the flags are probably real, and a detector of burns under 4 m would be validated against a reference that is itself the question. The near-700 km and geostationary burn verdicts stay unresolved; the geostationary question stays with its own record.

Report only: SARAL's flag of about 118.6 m between 2026-02-08T23:16 and 02-09T00:57, seen from four overlapping cutoffs (2026-02-03 to 02-06), is in neither catalog; it is an uncataloged maneuver or a discontinuity of the truth product, not decided here.

## Amendment 2026-11-06: near 700 km, Sentinel-1 split by the validated catalog, registered before reading (report only)

Run only after the FFM 2.2.0 rerun lands its `cells.json`; nothing of the split is read before. Script `s1-burn-split.mjs`, report `results/operator-theory/per-rev-flag/split`.

- Catalog: `COVARIANCE-MODEL.md` amendment 3 (commit ac438c3a; amendment 4, 0da3ecd3), its 4 m truth-step detector, validated on Sentinel-1 only (26 of 26 known burns, 0 false alarms on the quiet windows). Files `covariance-model/steps/trS1-39634.json` (SHA-256 f21d25b9bf42381a12c415d71a6992aa389e957eb56f4000b6a003b0520d4eb1) and `trS1-62261.json` (d058dad7759febce8b6ad6794f0116f05ec79efddc85edf9e2bfa39ff26a8f05), checked by the script. Its rule as `covariance-model.mjs` applies it: each step taken 2 h earlier; a span is covered when its checked spans leave no gap over 2 h.
- Windows: the near-700 km cells' Sentinel-1 windows (AP5's 2026 rows, `ap/b0411/truth2` group S1 without error; no cutoff from 2026-06-01). FFM from `ap/ffm220/compare-truth2` (propagator/ffm 2.2.0), AP from `ap/b051/truth2` (sdn-ap 0.5.1); if the landed `cells.json` reads other stores, an amendment points the script at them before any split is read. Per fit (24, 72 h) and lead (24, 48, 72, 168 h), a window is burn-affected when a catalog step lies in [cutoff - fit, cutoff + lead], burn-free when none does and the catalog covers that span, unchecked otherwise (reported). The altimetry satellites near 700 km get no verdict: the catalog is validated on Sentinel-1 only (and the near-700 km cells hold no altimetry window).
- Statistic: on each part, exp(median by window of ln(FFM / AP)) with its 95 % interval over object-week clusters (10,000 draws, seed SHA-256 of `PERREV-SPLIT|<fit>|<day>|<part>`), as `ffm220-ratio.mjs`.
- Reading rule, fixed now: a cell with 10 or more burn-free windows whose burn-free interval holds 1 or lies below it has FFM at or below parity, and the Sentinel-1 part of that cell is explained by burns; a burn-free interval wholly above 1 is a candidate FFM defect for its own record; under 10 burn-free windows the cell gets no reading.

## Holds

Never read: C2's held objects (TerraSAR-X, Stella, Sentinel-1D, LAGEOS-1, its six Galileo satellites), Swarm and GRACE-FO, every Starlink group, any Sentinel-1 cutoff from 2026-06-01 (Sentinel-1 truth to 2026-06-08), any operator capture.
