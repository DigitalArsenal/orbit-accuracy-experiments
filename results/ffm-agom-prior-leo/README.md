# XM6: on spent windows, a shorter FFM arc closes F2's tail against public SGP4, and a free AGOM does nothing

**F2's 72 h arc looks like the fault.** In group P (Swarm A, B, C and GRACE-FO 1, 2; 750 pairs in 66 clusters), F2 fails XM3's tail rule against the public set under SGP4 (P) at days 1, 2 and 3 with upper bounds 1.26, 1.31 and 1.20. The same fit on 12 h of truth (A12) has bounds 0.44, 0.71, 0.84 and 0.96 at days 1, 2, 3 and 7, a median -89.7 %, -64.4 %, -44.6 % and -26.3 % against P and -69.7 %, -48.2 %, -35.2 % and -12.7 % against F2, every interval wholly below 0. A24 and A36 hold and close too, so each is the plan's first outcome: "the 72 h arc is a fault in F2's design, at the median and the tail".

**This is exploratory on spent windows, and XM3's "no" stands until a registered test.** Every window here was scored in XM2, XM3 and XM5, and the arcs came from an earlier lead, so every number below is a lead for a registration, not a pass. All three arcs also meet the form of XM3's three rules at day 7, with no failed fit; that is a reading, not XM3's rule met. **The day-1 sizes are not a product claim,** because these arcs end later than P's information time: they fit truth up to about 5 minutes before the cutoff, and the critic of XP2 measured P's information time at about 1.7 h before it.

**AGOM's prior is not the lever.** With AGOM's prior at 1000 % of its seed on the 72 h arc (W72), AGOM moves further from its seed and no error moves: the median against F2 is 0.0 % and the p95 ratio 1.00 at every lead. AGOM over seed is 2.46, 3.12, 1.86 and 1.78 under F2 (Swarm B, Swarm A and C, GRACE-FO, Sentinel-1), 3.57, 4.74, 3.59 and 2.78 under W72, 1.40, 1.56, 1.15 and 1.19 at 36 h, 1.12, 1.17, 1.05 and 1.06 at 24 h and 1.02, 1.02, 1.01 and 1.01 at 12 h. The inflation comes with the span, so correcting the seed alone would not address it. No short arc ran with a free AGOM, so at 12 h the prior may be what holds it.

**The post-storm tail shrinks but does not count as moved.** By the plan's definition an arm moves it if W04's count in the worst 38 is at most 9, 11 and 11 at days 1, 2 and 3, or its median e at the cutoffs 2026-01-22 to 01-26 is at or below P's at days 2 and 3. A12 has 9, 12, 17 and 0.99 and 3.05 km against P's 0.97 and 1.77: it misses, by 2 % at day 2. The plan reads "stays" as clearing the arc's span, and these numbers do not support that: the median there falls from 3.88 km under F2 to P's level at day 2. What remains above P, at days 3 and 7, is what the 3-hourly ap and the model's storm response can still speak to.

**On Sentinel-1, 12 h is too short for the long lead.** A12 is +17.6 % against F2 at day 7 (interval +7.1 to +26.2), as the plan expected of an arc that does not determine B: B over seed is 0.94 against F2's 0.61. A24 does not lose there (-0.7 %, -2.7 to +5.4). In group P, B over seed hardly moves with the arc (1.14 to 1.18 on Swarm B, 1.20 to 1.23 on Swarm A and C, 1.40 to 1.44 on GRACE-FO), so 12 h determines B on drag-strong objects.

Generated from `results/ffm-agom-prior-leo/table.json` (`node experiments/ffm-agom-prior-leo/table.mjs`, 1,020 stored windows, rows digest `28a69158e229`). Plan: [PLAN.md](../../experiments/ffm-agom-prior-leo/PLAN.md), written before any cell (commit 2f9693c, pushed to origin `wip/experiments-ffm-agom-prior-leo-20261031/plan` at 2026-10-31T15:13:49Z), runner d0a6175 (15:14:36Z). Modules 9a05d899b: propagator/ffm 2.0.4 c36f1b14fc233e88, analysis/estimation 0.7.0 7a555ca5b3ed0b02.

## What limits this

- **Spent windows.** XM2, XM3 and XM5 published these windows, and the arcs and the prior were chosen from the critic's and SRP's leads. A cell here can only say which arm deserves a registration on unseen windows. C2's time cut holds these objects to cutoffs before June, so a registration must name its unseen windows.
- **Zero latency.** The arcs fit truth-quality states up to about 5 minutes before the cutoff, as F2's do. P's information is older: the critic of XP2 measured its effective information time at about 1.7 h before the cutoff, and showed a day-1 lead shrink when both arcs end at the set's creation. So the day-1 sizes here are not a product claim, and a registration needs arcs ending at P's creation beside these.
- **Truth-quality input.** As in XM3, this answers the owner's theory-and-atmosphere question ("with truth / owner operator data"), not the console's supply.
- **As-issued weather only.** Observed weather and the 3-hourly ap were not run on short arcs.

## Group P (the reading's group)

Medians of e in km. The percentages are paired changes in the median, and "bound" is the upper bound of the p95 ratio's interval.

| Arm | Lead | Pairs | Arm median | P median | vs P | 95 % interval | p95 ratio vs P | Bound vs P | vs F2 | 95 % interval | p95 ratio vs F2 (interval) | Bound vs P, W04 out | Failures |
| --- | --- | --: | --: | --: | --: | --- | --: | --: | --: | --- | --- | --: | --: |
| A12 | Day 1 | 750 | 0.088 | 0.763 | -89.7 % | -91.4 to -87.2 | 0.34 | 0.44 | -69.7 % | -74.1 to -65.4 | 0.36 (0.27 to 0.48) | 0.43 | 0 |
| A12 | Day 2 | 750 | 0.498 | 1.309 | -64.4 % | -69.8 to -58.8 | 0.57 | 0.71 | -48.2 % | -53.7 to -42.4 | 0.61 (0.44 to 0.71) | 0.70 | 0 |
| A12 | Day 3 | 750 | 1.408 | 2.454 | -44.6 % | -54.3 to -35.6 | 0.65 | 0.84 | -35.2 % | -42.5 to -22.3 | 0.72 (0.58 to 0.89) | 0.76 | 0 |
| A12 | Day 7 | 750 | 10.076 | 15.348 | -26.3 % | -38.5 to -13.5 | 0.78 | 0.96 | -12.7 % | -19.2 to -2.4 | 0.98 (0.81 to 1.18) | 0.85 | 0 |
| A24 | Day 1 | 750 | 0.140 | 0.763 | -83.4 % | -85.7 to -80.1 | 0.45 | 0.57 | -57.4 % | -64.8 to -51.4 | 0.48 (0.36 to 0.66) | 0.56 | 0 |
| A24 | Day 2 | 750 | 0.676 | 1.309 | -55.3 % | -62.2 to -47.6 | 0.71 | 0.87 | -44.4 % | -50.5 to -32.6 | 0.76 (0.56 to 0.88) | 0.86 | 0 |
| A24 | Day 3 | 750 | 1.608 | 2.454 | -37.3 % | -49.0 to -29.4 | 0.72 | 0.89 | -33.9 % | -45.3 to -22.8 | 0.80 (0.64 to 0.97) | 0.89 | 0 |
| A24 | Day 7 | 750 | 11.735 | 15.348 | -15.7 % | -23.1 to -5.5 | 0.76 | 1.02 | -10.1 % | -18.8 to +0.7 | 0.96 (0.77 to 1.18) | 0.83 | 0 |
| A36 | Day 1 | 750 | 0.194 | 0.763 | -77.8 % | -80.7 to -73.8 | 0.60 | 0.76 | -42.1 % | -49.1 to -37.1 | 0.64 (0.50 to 0.84) | 0.71 | 0 |
| A36 | Day 2 | 750 | 0.780 | 1.309 | -42.4 % | -50.0 to -33.2 | 0.84 | 1.01 | -28.9 % | -36.7 to -18.5 | 0.90 (0.68 to 0.97) | 0.91 | 0 |
| A36 | Day 3 | 750 | 1.749 | 2.454 | -28.7 % | -38.5 to -21.0 | 0.81 | 1.05 | -26.6 % | -33.5 to -18.5 | 0.90 (0.79 to 1.04) | 0.93 | 0 |
| A36 | Day 7 | 750 | 11.835 | 15.348 | -15.7 % | -22.5 to -2.8 | 0.77 | 1.03 | -7.7 % | -16.1 to -1.0 | 0.96 (0.84 to 1.17) | 0.85 | 0 |
| W72 | Day 1 | 750 | 0.310 | 0.763 | -60.9 % | -66.3 to -55.9 | 0.94 | 1.26 | -0.0 % | -0.0 to -0.0 | 1.00 (1.00 to 1.00) | 0.97 | 0 |
| W72 | Day 2 | 750 | 1.026 | 1.309 | -29.2 % | -36.3 to -20.3 | 0.93 | 1.32 | -0.0 % | -0.0 to +0.0 | 1.00 (1.00 to 1.00) | 1.03 | 0 |
| W72 | Day 3 | 750 | 2.161 | 2.454 | -17.5 % | -28.0 to -8.0 | 0.90 | 1.21 | -0.0 % | -0.0 to +0.0 | 1.00 (1.00 to 1.00) | 1.00 | 0 |
| W72 | Day 7 | 750 | 11.957 | 15.348 | -14.2 % | -24.2 to -3.1 | 0.80 | 1.05 | +0.0 % | -0.0 to +0.0 | 1.00 (1.00 to 1.00) | 0.90 | 0 |

## Group S1, Sentinel-1A and 1C (report)

| Arm | Lead | Pairs | Arm median | P median | vs P | 95 % interval | p95 ratio vs P | Bound vs P | vs F2 | 95 % interval | p95 ratio vs F2 (interval) | Bound vs P, W04 out | Failures |
| --- | --- | --: | --: | --: | --: | --- | --: | --: | --: | --- | --- | --: | --: |
| A12 | Day 1 | 258 | 0.019 | 0.734 | -97.6 % | -98.0 to -97.3 | 0.34 | 0.47 | -63.5 % | -78.9 to -37.2 | 0.66 (0.28 to 0.92) | 0.48 | 0 |
| A12 | Day 2 | 257 | 0.147 | 1.001 | -84.3 % | -89.4 to -72.1 | 0.64 | 0.93 | -14.8 % | -29.2 to -4.3 | 0.84 (0.50 to 1.11) | 0.96 | 0 |
| A12 | Day 3 | 258 | 0.681 | 1.333 | -47.5 % | -65.0 to -33.9 | 0.62 | 0.87 | -3.8 % | -14.7 to +4.0 | 0.79 (0.59 to 1.07) | 0.93 | 0 |
| A12 | Day 7 | 256 | 4.859 | 4.149 | +18.3 % | -0.3 to +31.2 | 0.80 | 1.07 | +17.6 % | +7.1 to +26.2 | 1.13 (0.79 to 1.39) | 1.08 | 0 |
| A24 | Day 1 | 256 | 0.015 | 0.731 | -98.1 % | -98.5 to -97.5 | 0.34 | 0.54 | -67.6 % | -78.0 to -59.0 | 0.66 (0.34 to 0.93) | 0.49 | 0 |
| A24 | Day 2 | 255 | 0.180 | 0.991 | -82.1 % | -90.6 to -72.6 | 0.64 | 0.88 | -14.2 % | -27.2 to -7.7 | 0.84 (0.48 to 1.05) | 0.88 | 0 |
| A24 | Day 3 | 256 | 0.642 | 1.329 | -49.8 % | -65.7 to -40.4 | 0.58 | 0.80 | -9.2 % | -22.1 to -5.1 | 0.73 (0.49 to 1.02) | 0.85 | 0 |
| A24 | Day 7 | 254 | 4.296 | 4.149 | -1.3 % | -15.9 to +11.8 | 0.77 | 0.99 | -0.7 % | -2.7 to +5.4 | 1.08 (0.76 to 1.30) | 0.98 | 0 |
| A36 | Day 1 | 256 | 0.040 | 0.731 | -94.4 % | -96.4 to -92.7 | 0.37 | 0.93 | -50.9 % | -61.8 to -36.2 | 0.72 (0.46 to 1.00) | 0.89 | 0 |
| A36 | Day 2 | 255 | 0.326 | 0.991 | -64.1 % | -80.7 to -56.8 | 0.64 | 0.90 | -6.8 % | -9.9 to -3.9 | 0.84 (0.57 to 1.05) | 0.93 | 0 |
| A36 | Day 3 | 256 | 0.779 | 1.329 | -41.4 % | -54.2 to -30.3 | 0.61 | 0.89 | -4.9 % | -8.9 to -3.1 | 0.78 (0.65 to 1.03) | 0.91 | 0 |
| A36 | Day 7 | 254 | 4.037 | 4.149 | -10.2 % | -16.1 to +2.7 | 0.74 | 1.11 | -3.9 % | -5.4 to -1.8 | 1.04 (0.80 to 1.43) | 1.14 | 0 |
| W72 | Day 1 | 259 | 0.181 | 0.734 | -76.3 % | -83.9 to -71.4 | 0.51 | 1.17 | -0.0 % | -0.0 to -0.0 | 1.00 (1.00 to 1.00) | 1.10 | 0 |
| W72 | Day 2 | 258 | 0.501 | 1.003 | -53.7 % | -67.1 to -40.4 | 0.75 | 1.39 | -0.0 % | -0.0 to -0.0 | 1.00 (1.00 to 1.00) | 1.06 | 0 |
| W72 | Day 3 | 258 | 0.945 | 1.333 | -40.9 % | -52.6 to -19.0 | 0.78 | 1.09 | +0.0 % | -0.0 to +0.0 | 1.00 (1.00 to 1.00) | 1.12 | 0 |
| W72 | Day 7 | 257 | 3.317 | 4.150 | -12.6 % | -20.8 to -5.3 | 0.71 | 1.12 | -0.0 % | -0.0 to +0.0 | 1.00 (1.00 to 1.00) | 1.09 | 0 |

## The post-storm tail, group P

At days 1, 2, 3 and 7. W04's count and the storm-arc count are out of each arm's worst 38; the storm arc is XM5's class on the 72 h span, whatever the arm's own arc.

| | F2 | P | A12 | A24 | A36 | W72 |
| --- | --- | --- | --- | --- | --- | --- |
| W04 in the worst 38 | 19, 23, 22, 16 | 10, 12, 11, 6 | 9, 12, 17, 14 | 9, 13, 14, 14 | 14, 17, 18, 16 | 19, 23, 22, 16 |
| Storm arc in the worst 38 | 24, 25, 21, 16 | 12, 12, 12, 10 | 20, 21, 18, 19 | 23, 24, 22, 17 | 27, 24, 22, 16 | 24, 25, 21, 16 |
| F2's worst that stay | | | 15, 15, 19, 23 | 12, 15, 17, 20 | 16, 20, 22, 23 | 38, 38, 38, 38 |
| Also P's worst | 11, 14, 16, 17 | | 10, 13, 15, 20 | 6, 16, 18, 21 | 8, 16, 18, 19 | 11, 14, 16, 17 |
| Median km, cutoffs 01-22..01-26 | 1.06, 3.88, 7.56, 34.42 | 0.70, 0.97, 1.77, 8.22 | 0.19, 0.99, 3.05, 30.13 | 0.32, 1.60, 3.60, 21.02 | 0.48, 2.40, 6.15, 28.98 | 1.06, 3.88, 7.56, 34.41 |
| Median km, storm arc | 0.79, 2.35, 4.62, 23.15 | 0.76, 1.36, 2.54, 18.64 | 0.14, 0.78, 2.65, 22.21 | 0.27, 1.00, 2.82, 17.94 | 0.39, 1.57, 3.60, 21.31 | 0.78, 2.35, 4.62, 23.15 |
| Median km, no storm arc | 0.26, 0.88, 1.87, 11.09 | 0.76, 1.31, 2.42, 14.98 | 0.08, 0.47, 1.33, 9.28 | 0.13, 0.64, 1.47, 10.15 | 0.16, 0.74, 1.67, 10.48 | 0.27, 0.88, 1.87, 11.08 |

## AGOM, B and the fits

Values over the object's seed (published area and mass), medians, with the count at the bound 0. Every fit that ran ended CONVERGED. An arc below 90 % of its states is not fitted, and that window leaves the arm's cells, counted as "not run".

| Object | Arm | Fits | Not run | CONVERGED | Median rounds | Most rounds | B / seed | B at 0 | AGOM / seed | AGOM at 0 |
| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |
| Swarm B | F2O | 150 | 0 | 150 | 3 | 15 | 1.18 | 0 | 2.46 | 0 |
| Swarm B | A12 | 150 | 0 | 150 | 2 | 2 | 1.15 | 0 | 1.02 | 0 |
| Swarm B | A24 | 150 | 0 | 150 | 2 | 6 | 1.14 | 0 | 1.12 | 0 |
| Swarm B | A36 | 150 | 0 | 150 | 2 | 14 | 1.18 | 0 | 1.40 | 0 |
| Swarm B | W72 | 150 | 0 | 150 | 3 | 15 | 1.18 | 0 | 3.57 | 1 |
| Swarm A+C | F2O | 300 | 0 | 300 | 3 | 15 | 1.23 | 0 | 3.12 | 2 |
| Swarm A+C | A12 | 300 | 0 | 300 | 2 | 14 | 1.20 | 0 | 1.02 | 0 |
| Swarm A+C | A24 | 300 | 0 | 300 | 3 | 8 | 1.21 | 0 | 1.17 | 0 |
| Swarm A+C | A36 | 300 | 0 | 300 | 3 | 11 | 1.22 | 0 | 1.56 | 0 |
| Swarm A+C | W72 | 300 | 0 | 300 | 3 | 15 | 1.23 | 0 | 4.74 | 22 |
| GRACE-FO | F2O | 300 | 0 | 300 | 3 | 21 | 1.44 | 0 | 1.86 | 1 |
| GRACE-FO | A12 | 300 | 0 | 300 | 2 | 4 | 1.40 | 0 | 1.01 | 0 |
| GRACE-FO | A24 | 300 | 0 | 300 | 2 | 10 | 1.41 | 0 | 1.05 | 0 |
| GRACE-FO | A36 | 300 | 0 | 300 | 3 | 11 | 1.43 | 0 | 1.15 | 0 |
| GRACE-FO | W72 | 300 | 0 | 300 | 3 | 17 | 1.44 | 0 | 3.59 | 2 |
| Sentinel-1 | F2O | 270 | 0 | 270 | 3 | 18 | 0.61 | 113 | 1.78 | 14 |
| Sentinel-1 | A12 | 269 | 1 | 269 | 2 | 10 | 0.94 | 12 | 1.01 | 0 |
| Sentinel-1 | A24 | 267 | 3 | 267 | 2 | 10 | 0.78 | 4 | 1.06 | 0 |
| Sentinel-1 | A36 | 267 | 3 | 267 | 2 | 12 | 0.72 | 64 | 1.19 | 8 |
| Sentinel-1 | W72 | 270 | 0 | 270 | 3 | 18 | 0.61 | 114 | 2.78 | 35 |

## Cost

Owner Mac Studio, 8 workers beside other lanes' load (load average 23 to 96). 1,020 windows of four arms took 4.5 h (15:17 to 19:48 UTC). Each fit round is one propagator/ffm run of the arc at RK78 (relative tolerance 1e-10, absolute 1e-7 m and m/s, initial step 60 s, steps up to 120 s) with the 8 x 8 STM, output at the arc states (300 s); each forecast covers the arc and 7 days at the same settings, no STM, output at the scored epochs (300 s). In group P, a median A12 fit takes 2.6 s (2 rounds, 144 states) and its forecast 16.8 s; a W72 fit 24.5 s and its forecast 21.4 s, at this load. 5 MB on disk.

## Disclosures

- These windows, F2's and P's rows, XM5's table and the critic's and SRP's cells were read before the plan. The arcs and the prior come from those leads.
- The proof passed before any arm: F2 through this code at 72 h and 30 % equals XM3's stored rows byte for byte on three windows. Every row passed the guard against XM3's rows; no row errored and no defect stopped the run.
- The table code ran on synthetic rows copying XM3's F2 before the runner commit, to check it: only identity checks and the registered F2 counts were read from that.
- Nothing in the plan or the code changed after the plan and runner commits.
- The plan's post-storm definition was written before any cell and is reported as written. Saying the numbers do not support its "stays" reading is judgment after the cells.

## Reproduction

```
node experiments/ffm-agom-prior-leo/run.mjs --proof      # F2 through this code against XM3's rows, before any arm
node experiments/ffm-agom-prior-leo/run.mjs --launch 8   # every window, 8 detached workers, PIDs in logs/
node experiments/ffm-agom-prior-leo/table.mjs            # this table
node experiments/ffm-agom-prior-leo/run.mjs --check      # E2E: pinned arms replayed exactly, table rebuilt
```

Every wasm is read with `git show` at modules 9a05d899b and SHA-256 checked; all fitting and propagation are module calls. XM3's code (22313bf), XM's (2c7b326) and XM5's (732dd1e) are imported unchanged and checked by `git diff --quiet`, and `lib/ffm.mjs` is XM3's with `arm` taking its settings and no `$DCL`.

## Data and terms

Results use every dataset the run read; only aggregates are published. Space-Track.org GP element sets (USSPACECOM, 18 SDS) stay in the local store. ESA Swarm precise orbits (SP3 COM); GFZ ISDC GRACE-FO rapid science orbits; contains modified Copernicus Sentinel data 2026 (Sentinel-1 POEORB). GFZ Kp, ap, Ap and F10.7: CC BY 4.0, Matzka et al. (2021), doi:10.5880/Kp.0001. NOAA SWPC RSGA: US Government work. IERS EOP (finals.all): IERS Earth Orientation Center. JPL DE440s: NASA JPL.
