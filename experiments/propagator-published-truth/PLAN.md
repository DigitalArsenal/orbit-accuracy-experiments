# Published-reference propagator and Pc study

Registered 2026-10-26, before reading orbital states or scoring. The owner's goal is the fastest propagator relevant to conjunction assessment and Pc, retaining accuracy improvements regardless of speed cost.

## Objective

Compare native white-room XP, SDN-AP configured with NRLMSISE-00 and causal-date weather, and FFM on identical agency-reference arcs at 1, 3 and 7 days. Measure trajectory errors, covariance coverage and execution cost. Replay NASA CARA Pc references through the built WASM interface. No production implementation or existing experiment is changed.

SDN-AP contains the white-room XP implementation at this pin. These are explicitly named configurations. USSF 9.1.1.0 WASM is excluded from speed rankings because of the previously reproduced invalid/query-order-dependent outputs. The concurrently active XM study owns DCA and prior merit; this experiment neither trims nor tunes those features.

## References and data

`config.json` freezes all objects, dates, cadence, horizons, forces, estimators, runtime and artifact hashes. Only filenames, index metadata and existing published results were inspected before registration. These archived periods may have been used in other experiments. They are held out from the new fits, not globally unseen data.

- Swarm A/B/C: ESA/TU Delft SP3xCOM reduced-dynamic science orbits, https://doi.org/10.57780/esa-8579355 and https://swarm-disc.github.io/product-catalogue-tools/SW_SP3xCOM_2_.html. The archive records kinematic/reduced-dynamic differences for uncertainty.
- Sentinel-1C/1D: Copernicus AUX_POEORB, https://sentiwiki.copernicus.eu/web/precise-orbit-determination. Its archived sigma is the 5 cm 3D accuracy requirement expressed per axis, not a measured guarantee for each epoch.
- GRACE-FO 1/2: GFZ rapid science orbits, https://isdc-data.gfz.de/grace-fo/. These are reconstructed rapid RSO products, not final GNV1B. Adjacent-arc overlap estimates precision rather than independent absolute accuracy; report separately.
- Three GPS objects: ESA final GNSS SP3, with recorded uncertainties, as a different-regime control. Original URLs, source hashes, converted-state hashes and EOP metadata come from the archive indices.
- NASA CARA software and expected values: https://www.nasa.gov/cara/publicly-available-cara-software/ and https://github.com/nasa/CARA_Analysis_Tools. The pinned `cara_pc.csv` and its NOTICE identify all upstream assertions, units, frames, epochs and tolerances. No expected answer comes from the tested implementation.

Thirty arcs: three issue dates for each of ten spacecraft. Existing truth gates apply, with all drops counted. Sort product names and let the last overlapping epoch win. Reject nonfinite/missing velocities and unmatched epochs. Do not select or exclude arcs based on propagator residuals. Maneuver status is not independently certified; unexpected changes remain in the results.

The actual issue is the last reference epoch at or before nominal UTC midnight. Fit the preceding 24 hours at 600-second spacing, with >=90% coverage. Score the final 24-hour bin at each lead 1/3/7 at 1800-second spacing, with >=90% coverage. Match reference epochs within 45 seconds, never extrapolate. Include an exact-lead sample for covariance. Every arm uses the same surviving times. Reference files are retrospective products: this is a precise-arc model/estimator benchmark, not an operational public-TLE forecast.

## Arms and information boundary

XP-native uses the module's default SGP4XP fit and Jacchia-70/generic flux. AP-MSIS uses the same fit with NRLMSISE-00, RECORDS and HOLD_LAST. FFM uses the existing E6 fit_batch orchestration, estimating state, B and AGOM under config.json's priors. Different estimator policies mean differences cannot all be attributed to force models.

Only pre-issue states enter the fit. AP-MSIS and FFM use identical F10.7 and Ap history strictly before issue day, with means truncated at the same cutoff and persistence afterward. Revised historical values are not verified as-issued weather. Final EOP and DE440 are fixed auxiliary inputs. Preserve FFM's registered 70x70 gravity, Sun/Moon, SRP, drag, solid tides and relativity; cost never triggers force trimming.

## Endpoints and decisions

Per family/arm/lead: attempted, successful and failed arcs; median/p90 arc position RMS; R/T/N RMS; exact-lead errors; paired ratios on common support. Bootstrap objects in 2,000 deterministic replicates only with >=5 objects; smaller-family results are descriptive. Superiority requires the paired 95% interval wholly below one, with failure rates reported. A pooled result cannot establish every-family superiority.

Propagate fitted covariances using their own model. FFM uses formal covariance times max(1,reduced chi-square), as B2; XP uses its shipped covariance. Add available reference position covariance for the primary normalized error and report prediction-only sensitivity. Axis transforms and Mahalanobis values use gp-error-model pair_statistics. One exact-lead sample per arc is the primary coverage sample; dense samples are descriptive only. Apply the registered realism bands only with >=30 arcs and >=5 objects; otherwise INSUFFICIENT. No calibration is fitted on these results.

Time fit, propagation with covariance, scoring and total separately. Record CPU and wall time, host load and runtime. Compare successful common workloads only; no raw-state throughput claim. The earlier exact batching speedup is separate evidence, not assumed here.

Run all 21 NASA-derived 2D Pc cases through compute_pc, converting km/km2 to m/m2 and retaining each original tolerance. Record failures, refusals and convergence. This checks the 2D integral, not 3D/Monte Carlo behavior, covariance realism, operational collision frequencies or TCA screening performance. No synthetic hit-rate curve is substituted for those claims.

## Execution and verification

1. Commit this plan and config before state access.
2. Implement provenance-preserving readers and adapters; run every registered arc and every Pc case, retaining failures.
3. Generate aggregate JSON and a report from local rows. Never commit raw ephemerides or per-sample rows.
4. One E2E replays representative real arcs and all Pc cases, checks pins and provenance, and regenerates the report exactly. Reproducibility passing does not turn a failed scientific hypothesis into a pass.
5. Run the repository gauntlet, push the task ref, land on remote main, verify the SHA and close the task. No production deployment.
