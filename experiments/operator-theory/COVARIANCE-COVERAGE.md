# COVARIANCE-COVERAGE: AP's propagated covariance against its forward error

Report only, under `modules-sdn-ap-covariance-growth-coverage-20261105`, written and pushed before any row of this study exists. The finding (demo lane, 2026-11-05): on the demo page's ISS sample AP's in-track 1-sigma grows from 0.03 km to 37.8 km over 12 h while AP's error is 0.308 km. The owner's priority is covariance realism. Nothing in a module or the site changes here; a fix, if one follows, is a later module record.

## Build

`propagator/sdn-ap` 0.6.0, wasm SHA-256 `0b5280f05176fc755dbfb859fd8028fc495759d7537024c53043f498c91faa63` at modules `895b6b38de29bc284b4b50a02425a6c3a5fe81a2` (the build the site ships), by `git show` from the read-only clone `space-data-network-modules-pin` at that commit, hash-checked; its $OCM and $OEM read with the bindings it is built on (spacedatastandards.org 1.278.0, from that clone). The truth, the weather, `foundation/frames` and `analysis/gp-error-model` are the producers' (XM's `build.json` pins, by `git show`, SHA-256 checked), hosted from the read-only modules root `space-data-network-modules-r2`, which holds XM's registered installs (the pin clone holds SDS 1.278.0, which XM's guard refuses).

## Windows

The stored windows of `ap/b051` (`/opt/data/sdn-archive/operator-theory/ap/b051`, the 2026-11-04 re-measure), the same keys, arcs, thinning, coverage rule, priors and as-issued weather as their producer (`ap-truth.mjs`):

| Regime | Set | Producer, as `ap/b051` ran it | Objects | Arms |
|---|---|---|---|---|
| Strong drag, 2025 (T) | `truth` | `ap-truth.mjs --arms registered --from 2025-04-01 --to 2025-12-21` | Swarm A, B, C; GRACE-FO 1, 2 | AP24, APRa12 |
| Near 700 km, 2026 (S1) | `truth2`, group S1 only | `XP2F_CONTROL=1 ap-truth.mjs --xm --from 2026-01-01 --to 2026-05-31` | Sentinel-1A, 1C | AP72, AP24 |

Holds: no Starlink group, no held Galileo satellite (43567, 37847, 41862, 41174, 43055, 41175), no operator capture, no C2 row. Swarm and GRACE-FO truth is read only through 2025-12-28 (the last 2025 cutoff plus 7 days), never after 2026-10-31. `--check` refuses a row that breaks either.

## Fits: the stored fits, reproduced

The stored rows keep each fit's parameters and errors but not its $OCM, and the covariance call needs the $OCM. Reading taken (conservative): no new fit is designed or tuned; each stored fit is reproduced by the producer's own `fit` call on its own arc, $PCF and $SPW, unchanged, and is accepted as the stored fit only through the control below. Any difference is reported as found.

Control, per window and arm, against `ap/b051`: `ok`, `bterm`, `agom`, `rms`, `bHeld`, and for lead days 1, 2, 3 and 7 whether scored and `e`, `r`, `t`, `n`, each flown and scored by the producer's own path (TEME flight at the producer's 300 s grid, `foundation/frames` to GCRF, `pair_statistics` RTN), compared as JSON numbers. Pass: 0 differing scalars.

## Covariance flights

Leads: hour h = 1 to 168 after the fit's end (the cutoff), at the epoch cutoff + h x 3600 s, scored where the truth series holds a state at exactly that epoch.

Each fitted $OCM is flown with `propagate` and a $PCF whose OUTPUT names those epochs, frame GCRF; the module writes a covariance line per state (SPEC 12.6). `analysis/gp-error-model` `pair_statistics` (predicted: the flown GCRF state and its 6 x 6 covariance, axes INERTIAL; truth: the truth state; axes from the truth) gives per lead the error in radial, in-track and cross-track (R, I, C), the covariance in the same axes, z per axis and d^2. JavaScript moves records and takes ratios and medians; every state, covariance and projection is a module's.

## Coverage statistic and band

Per lead and axis a: z_a = e_a / sigma_a (the module's `zPredicted`), the actual forward error component over the propagated 1-sigma. Per regime, arm, lead and axis over the windows: the median |z_a|, the share with |z_a| <= 1, the median sigma_a and the median |e_a|; in 3D the mean d^2/3 and the share with d^2 <= 7.815 (the 95 % ellipsoid).

Band for a calibrated covariance: z_a ~ N(0, 1), so median |z_a| = 0.674 and 68.3 % lie within 1-sigma. SPEC 12.7's band, mean d^2/3 in [0.8, 1.25] and 95 % coverage in [0.93, 0.97], is the 3D band; its one-axis image is median |z_a| in [0.603, 0.754] (0.674 x sqrt of [0.8, 1.25]). Median |z_a| below 0.603: the covariance is too wide on that axis; above 0.754: too narrow. The width factor reported is 0.674 / median |z_a|.

## Which term grows

SPEC 12.3 to 12.5: P(t) = J(t) P_p J(t)^T + Q(t) + F(x(t)), Q the sum of four process-noise terms, each carried by the record's COV_PROPAGATION: eccentricity (NOISE_ECCENTRICITY_PER_DAY, s_e), inclination (NOISE_INCLINATION_PER_DAY, s_i), mean longitude (NOISE_MEAN_MOTION_RELATIVE, s_l) and non-gravitational n-dot (NOISE_NON_GRAVITATIONAL_RAD_DAY2 with NON_GRAVITATIONAL_SHARE, s_d = c |n-dot_ng|); F the floor (FLOOR_*_KM2). The module offers no switch per term other than the record's own fields, so each term is switched off by flying a copy of the fitted $OCM with only that term's field(s) set to 0 (s_d: both NOISE_NON_GRAVITATIONAL_RAD_DAY2 and NON_GRAVITATIONAL_SHARE, which keeps the module's invariant), unpacked and packed with the 1.278.0 bindings. Six flights per window and arm: full; s_e off; s_i off; s_l off; s_d off; all four off (the mapped fit covariance plus the floor).

Share of term k on axis a at a lead: (sigma_a^2 full - sigma_a^2 with k off) / sigma_a^2 full, each sigma from `pair_statistics`. The mapped fit covariance's share is (all off - floor) / full, the floor's the record's FLOOR in UVW (U radial, V in-track, W cross-track) over full. Checks: the copy with nothing changed flies byte-equal to the original; the shares sum to 1 within 1e-6 at every lead. The coverage of the all-off flight is reported beside the full one. Reported: median share per regime, arm, axis at 12 h and days 1, 3 and 7; the growing term is the one with the largest median in-track share at day 1.

## The ISS demo figure

The demo's ISS sample, `docs/assets/demo/nasa-iss-2026-07-13.oem` in the sdn-ap repository (SHA-256 `fbda48d1584bee1f38ea562625280ecfe4e6643f67c417e91f2fc245ee48311f`, 12 h of NASA states at 4 min, EME2000), as the demo runs it (`tools/demo/abi.mjs`): AP fitted to the first segment's states at or before the file's midpoint, its useable times as stated, $PCF THEORY AP with FORCES JACCHIA70 on THEORY_FLUX_MODEL, MAXIMUM_DEGREE 20, MAXIMUM_TESSERAL_DEGREE 31, no FIT; flown at the file's later epochs in EME2000. The file's KVN data lines are read into an $OEM as text to numbers (the demo reads them with `files/ccsds-messages` `read_oem`; the numbers are the same doubles). At the file's last epoch (12 h from its start): the in-track 1-sigma and the error, by `pair_statistics`. Reproduced when the in-track 1-sigma is within 0.05 km of 37.8 km and the error within 0.0005 km of 0.308 km; the six flights give its term shares too.

## Rows and run

Rows: `/opt/data/sdn-archive/operator-theory/covariance-coverage/<set>/rows-<k>.jsonl`, per window and arm the control fields and per lead the error, the sigma of each axis for each of the six flights, z and d^2; `manifest.json` names the start, this repository's commit, the runner's SHA-256 and the build. `covariance-coverage.mjs --run`: 12 shards per set, at most 4 workers under `nice -n 10`, a shard starting only while the 1-minute load is under 42 (one shard always runs); a rerun adds only missing keys.

## Table

`results/ap-truth/covariance-coverage/table.json` and `README.md`, written by `--table` from the rows alone: per regime, arm, lead (1 to 168 h) and axis the coverage statistics above; the term shares; the ISS figure; the control.

## End to end

`node experiments/operator-theory/covariance-coverage.mjs --check`: this registration's commit precedes the manifest's start; no held row; the control shows 0 differing scalars; the unchanged copy flies byte-equal and the shares sum to 1 within 1e-6; the table and README reproduce from the rows; a median |z| is present for every regime, arm, axis and lead day 1, 3 and 7; the ISS figure reproduces within the tolerances above; the growing term is named with its median in-track share at day 1.

## Amendment 1, 2026-11-05, before any row of the run

A smoke flight of four windows (rows under the lane's scratch, not the store) found no truth state at exactly cutoff + h hours: the precise-orbit series sit 2 s off the hour (10 s steps from 00:00:02), so the leads as written score nothing. No coverage value was read. The lead epoch of hour h is now the first state of the producer's own scoring grid (300 s, from its first truth state after the cutoff) at or after cutoff + h x 3600 s and within one grid step; each lead row records its offset in seconds. Nothing else changes.

## Amendment 2, 2026-11-05, during the run

The run's first rows, tabulated in the lane's scratch, score no window at hour 168: the producer reads truth through cutoff + 7 days, and hour 168's grid state lies 2 s past it. Day 7 in the table, the shares and the end to end is lead hour 167, the last hour every window can score; hours 1 to 167 are reported. No statistic, window or flight changes.
