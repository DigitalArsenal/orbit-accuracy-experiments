# How many fewer conjunction notifications our catalog gives (registration)

Stack issue DigitalArsenal/spacedatanetwork-stack#1059. Registered before any count is read; the runner `run.mjs` refuses to count on a dirty or uncommitted plan and writes this file's commit and SHA-256 into every output. Changes after the merge are dated amendments at the end.

The owner, 2026-11-21 about 21:35 UTC: "We want to say what the reduction in conjunction notifications is from shrinking the inaccuracy/ covariance, that's what matters."

## Question

At the published alert limits, how many conjunction notifications per week does an operator receive with our catalog, against the public catalog, and how many real close approaches does each miss?

- **Public catalog (S):** each object's newest Space-Track element set, flown by SGP4.
- **Our catalog (O):** for Starlink satellites, the product the catalog builder makes from SpaceX's own ephemerides ("SDN-AP production record"); for every other object, SDN-AP made from the object's public element-set history.

## Inputs

1. **The week's close approaches.** The public catalog's whole-catalog screen of 2026-11-06 00:00 UTC to 2026-11-13 00:00 UTC (32,863 objects; Space-Track GP snapshot 2026-11-05, SHA-256 `b6317649...`; SGP4 in `analysis/conjunction-assessment` 0.18.4), as stored by `experiments/two-exponentials/alerts-per-conjunction.mjs` (`ALERTS-PER-CONJUNCTION.md`): tier t0 (every pair, miss up to 5 km, 1,069,553 events, digest `ef114fe5...`) and tier t1 seeds 1 to 3 (5 to 50 km, one object in 8, each encounter weighted N(N-1)/k(k-1), the three seeds averaged), with each encounter's plane axes in both objects' radial, in-track and cross-track axes (`geom/<tier>.f32`). The runner records the SHA-256 of every file it reads.
   - The screen's own miss vector stands for the true miss. This is a realistic population of encounters (real objects, regimes, speeds and plane orientations), not a claim about what happened in orbit.
2. **Measured error sizes, paired.** Each row gives both catalogs' error on the same object, start and lead, against the best truth:
   - Objects other than Starlink: lane fifthday's public-only comparison with the strong-drag change, `/opt/data/sdn-archive/derived/site-measure/public-only-20261121T195726Z.jsonl` (rows with `inAggregates` true; `sgp4PublicSetM` for S, `sdnApFromPublicSetsM` for O; truth: precise orbits), groups as regimes: strong drag (P) for perigee under 600 km, near 700 km (S1) 600 to 750, altimetry (DO) 750 to 2000, laser geodetic (GD) 2000 to 15000, MEO (GN) 15000 to 30000, geostationary (GE) above 30000 km and inclination under 5 degrees, inclined geosynchronous (IG) above 30000 km otherwise.
   - Starlink satellites (object name STARLINK): `/opt/data/sdn-archive/derived/builder-measure/rows-20261121T170238Z.jsonl`, lead 18 to 24 h (`SGP4 public set` for S, `SDN-AP production record` for O; truth: SpaceX's next ephemeris cycle).
3. **Measured error directions.** Unit vectors of public sets' signed radial, in-track, cross-track errors against precise orbits, `/opt/data/sdn-archive/gp-covariance-strata/dev-rows/*.jsonl.gz`, by the object's band (LEO-L perigee under 500 km, LEO-M 500 to 800, LEO-H 800 to 2000, MEO 2000 to 30000, GEO above 30000) and age bin (lead 1 day: bin 2, 0.75 to 1.5 d; lead 3 days: bin 4, 2.5 to 4 d). The same direction is used for both catalogs (our rows hold sizes, not directions): stated on every table.
4. **Sizes for the hard-body radius** (NASA: the sum of the two objects' circumscribing radii): ESA DISCOS `/opt/data/sdn-archive/hac/esa-discos/2026/2026-11/objects-*.json`, radius = half the largest of span, height, width, depth, diameter; else the square root of `xSectMax`/pi; else SATCAT RCS size (`spacetrack/satcat/2026/2026-11-07.json.gz`): small 0.1 m, medium 0.5 m, large 1.5 m; else 0.5 m.
5. **Pc:** the conjunction-assessment module's `compute_pc`, Foster 2-D, through `experiments/gp-covariance-strata/lib/capc.mjs`, the module file from modules `origin/main` (its SHA-256 recorded). An encounter is sent to the module only when an upper bound of its Pc reaches the lowest limit counted: (HBR^2 / (2 sqrt(det C))) exp(-(max(0, d - h))^2 / 2), d the Mahalanobis distance of the predicted miss, h = HBR / sqrt(smallest eigenvalue of C).

## Method

1. **Leads.** A notification is decided L days before closest approach, L = 1 day (headline) and 3 days. At 3 days, encounters with a Starlink satellite are left out (its rows end at 24 h), counted and stated.
2. **Draws.** Each object of an encounter draws one row from its regime's rows at lead L and one direction from its band and age bin; S uses the row's S size, O the same row's O size, both the same direction. Predicted miss = m + P_A e_A - P_B e_B in the encounter plane.
3. **Covariance per side, regime and lead.** Shape: the second moment of the band's directions. Size: one scale per side, regime and lead, fitted on the fit half so that 95.4 % of the fit half's draws fall inside 2 sigma. Halves: by SHA-256 of the NORAD number, even = fit, odd = test. **Realism test on the test half** (50 directions per row): the fractions inside the 1, 2 and 3 sigma ellipsoids (d^2 up to 3.527, 8.025, 14.156) against 0.683, 0.954, 0.997. REALISTIC when the 1 and 2 sigma fractions are within 0.05 of nominal and at most 1 % fall outside 3 sigma. The combined covariance in the plane is P_A C_A P_A^T + P_B C_B P_B^T.
4. **Notifications.** Miss limits: predicted miss under 1 km when both objects' perigees are under 2000 km, else under 5 km (US Space Force). Pc limits: Pc at or above 1e-4 (NASA) and 3e-7 (SpaceX Starlink); 1e-5 reported beside. Pc counts only on encounters where both objects' strata are REALISTIC for both catalogs; elsewhere "not measured", with the share left out. If a side passes nowhere, its Pc counts read "not measured".
5. **Real close approaches and misses.** A real close approach: true miss under the encounter's miss limit (1 km or 5 km as above). Missed at a limit: a real close approach without a notification at that limit.
6. **Counts.** Notifications per week = the weighted count over the week's encounters. Views: all; per regime pair; a Starlink operator (encounters with at least one Starlink satellite); encounters with no Starlink satellite.
7. **Intervals.** 95 % percentile bootstrap, 200 replicates for miss limits and at least 40 for Pc limits (stated): resample each regime's rows by object, new draws, one t1 seed per replicate. Reduction = 1 - N_O / N_S within each replicate.
8. **Also reported (miss limits):** the radius our catalog needs to miss no more real close approaches than the public catalog misses at 1 km, and its notifications.
9. **The claim** "N % fewer notifications at no more missed real close approaches" is made for a limit only when the reduction's interval is above 0 and our missed count's central value is at most the public catalog's; otherwise the result is stated as it is.

## Left out, stated with the results

- No screen flown with our catalog's own products: our catalog's errors are applied to the public screen's encounters.
- No Space-Track request and no Space-Track conjunction message is read; the read-ahead disclosure of `experiments/ca-delta-rolling/REGISTRATION.md` does not apply to this experiment.
- Highly elliptical objects (no rows), objects not in the snapshot, other operators' own orbits (counted as public-history objects).

## Outputs

- Aggregates: `/opt/data/sdn-archive/derived/alerts/<stamp>.json` (notifications per week, missed, reduction and interval per limit, lead and view; realism per stratum; inputs with hashes), shaped for the site's claims. Private rows (per regime pair and stratum): `/opt/data/sdn-archive/derived/alerts/rows-<stamp>.jsonl`. No satellite-with-date pair leaves the machine.
- The fit method of SDN-AP is not described anywhere in the outputs.
