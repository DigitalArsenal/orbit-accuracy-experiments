# Does a Y-axis acceleration remove Galileo FOC's along-track drift, and how should FFM carry it?

**Yes, and a fixed value per block is the design.** On the 17 Galileo FOC satellites, on the test span (372 primary windows, the value chosen on an earlier span), a fixed Y acceleration of +0.685 nm/s^2 takes along-track RMS from 11.1, 34.8 and 63.8 m to 1.05, 3.35 and 6.11 m at 24, 48 and 72 h, ratio 0.096 [0.087 to 0.105] at 72 h. Fitting Y per window reaches 1.58, 5.20 and 9.05 m. Both are REMOVED by the rule written before the score (at most 3, 8 and 15 m, with every paired interval below 0.5), against ESA and against GFZ, with no HARM: every R, T and N cell at all six leads falls under both arms. Under Y2, R at 72 h goes from 3.86 m to 0.66 m and N from 0.58 m to 0.15 m. The shape is gone: K 92.3 m (R^2 0.990) under base, 0.54 m (R^2 0.006) under Y2.

**Why fixed.** The arc can see Y: Y1's median is +0.692 nm/s^2 on test and +0.689 on dev, within 0.67-0.70 in every |beta| bin. But Y1 is not 20 % better than Y2 (9.05 m against 6.11 m), and its formal sigma, 1.9 nm/s^2 (4.4 below 15 deg), about 13 times its real scatter at 10 m per axis, carries to a formal T sigma of 152 m at 72 h against base's 15.5 m. Fitted Y also hurts where it is not needed: IOV's T at 72 h goes from 5.8 m to 13.3 m under Y1 and to 4.6 m under Y2.

**The force is FOC's, and the frame and sign are right.** The value chosen on dev (+0.685) matches the look (0.69 to 0.75) and the published size (0.70 +/- 0.06 nm/s^2 on FOC, "IOV not affected"). The controls DO LITTLE: IOV -0.043 nm/s^2, T ratio 0.79 [0.68 to 0.93]; GLONASS -0.086 nm/s^2, T ratio 0.76 [0.68 to 0.86]. FOC's value where it does not belong makes T at 72 h 53.2 m against 5.8 m on IOV (ratio 9.2 [8.1 to 10.6]) and 79.0 m against 12.9 m on GLONASS (ratio 6.1), and the look's shape appears with the opposite sign (K -98 and -105 m). The plan's outcome: 1.

**The fit improves too (report only).** On FOC, median reduced chi-square under Y2 is 0.204 [0.189 to 0.215] of base's on 1020 windows; the residual per axis goes from 0.200 m to 0.087 m, and the epoch state moves 0.69 m. AGOM over seed stays at 0.948.

**How FFM carries it.** `FORCES.ECOM2.Y0_M_S2` = +6.850e-10 m/s^2 on Galileo FOC, in FFM's axes (eY = unit(eD x r)), scaled by the visible fraction of the Sun. No module change, no SDS field, no FFM bytes. The experiments' harness has no ECOM2 path: this test uses a small adapter on its signed T slot (lib/y0.mjs), because C3 pins the harness's bytes; a clean path can follow after C3's freeze. The console's resident path takes the same FORCES template through the same parser; this test does not exercise it.

**Nothing here reaches C3-small**: not its rows, results or chain. The coordinator decides. What a re-base on this result would need: `FORCES.ECOM2.Y0_M_S2` on FOC only, through the same adapter or a re-pinned harness; every R3 GNSS cal/val row rerun; the constants refit, since R, T and N all shrink on FOC and today's constants would over-cover; P7, P8 and P-REF rerun; P4's reproduction kept as an old record under a new amendment; and no fresh truth opened before it. GLONASS's small value is a separate choice: it helps T at 72 h on test (ratio 0.76) but rests on 4 satellites, and the plan treats it as a control.

## Carrying it beyond C3, report only

Nothing here changes any of these. Read from the code at modules 9a05d899b and on experiments main.

**Who fits Galileo FOC today.**

- **Experiments, FFM with a cannonball:** C2 R3 (six satellites), C3-small R3 (25), SRP and this test. These carry their FORCES per request, so Y can go in through the request.
- **Named by Galileo in their configs, not opened here:** propagator-published-truth, sdn-ap-baselines (its meo-gnss row), E14 (AGOM fixed at 0.02), and GP or SGP4 work (E1, E2, E2b, E3, E4, E7, E10, E16, sdn-ap-gp-history-od, sdn-gp-starlink-ffm-match, xp-atmosphere-merit). Which of them fit FOC with FFM was not established.
- **Production flows:** none fits Galileo with FFM. flows/source-products/sources.json and flows/supplemental-omm fit SGP4 and SGP4-XP element sets through analysis/od; their GNSS source is GLONASS, not Galileo. SGP4-XP has no Y force, so an XP set fitted to FOC would keep this error; that is not measured here.
- **analysis/od fit_ffm:** operator arcs, AGOM fixed at 0.02 (plugin_entrypoints.cpp:116); no Galileo source feeds it.
- **The console and catalog requests:** they propagate, they do not fit FOC. They carry the catalog default AGOM of 0.02 (propagator/ffm/catalog-configuration.mjs:28).

**Does a fixed Y belong in the block's force defaults?** There are no such defaults to put it in. FFM's block enumeration is GPS only (pcfGnssSpacecraftBlock: GPS_IIR, GPS_IIR_M, GPS_IIF; PCF_generated.h:1080-1087), and it selects the box-wing, not ECOM2. The options:

1. **In the request, from an identity table: the fit for this result.** The caller maps NORAD to block through the IGS SINEX, as lib/seeds.mjs already does for the seed, and sets FORCES.ECOM2.Y0_M_S2. No module change. It serves every execution request and every fit.
2. **An FFM default behind a new GALILEO_FOC block:** an SDS enum value, FFM bytes, OrbPro's vendored bytes and sizing constants, and the marketing catalog. The caller must still know the block, so it adds nothing over option 1.
3. **A per-object field on the resident state, only if the console or a whole-catalog pool should carry it.** A resident pool holds one FORCES template, and per object it takes only B and AGOM (resident_dynamics.cpp:497-499,567-579; PRWResidentState). ECOM2 in the template would push every object in the pool. So FOC alone needs a new SDS field, FFM bytes, the OrbPro refresh and a catalog entry, with its own E2E.

Limits on any of these: the value comes from one three-month test span on the 17 satellites here. The two eccentric FOC satellites (E201, E202) and later launches outside this population are untested, and the value's stability over years rests on the published series, not on this test. IOV and GLONASS values are controls, not recommendations.

## What ran

Registered before any score (PLAN.md). Base is the stored rows of ffm-srp-seed-high-beta at the same module pin (9a05d899b): G0 on Galileo, A1, the published seed, on GLONASS. C2's R3 fit through C3-small's arc-disjoint chain, on the 3-day grid: dev is the 30 cutoffs 2025-10-03 to 2025-12-29, test the 30 cutoffs 2026-01-01 to 2026-03-29. Leads 1, 6, 12, 24, 48, 72 h against ESA's next arcs, GFZ rapid orbits beside them. No truth after 2026-05-31 was opened.

| arm | Y0 | satellites | cutoffs |
| --- | --- | --- | --- |
| Yt, trial | fixed +1 nm/s^2, only to choose the value | 23 | dev |
| Y1 | fitted per window, seed 0, prior sigma 100 nm/s^2 | 23 | dev, test |
| Y2 | fixed per block at the value from dev: FOC 0.685, IOV -0.043, GLONASS -0.086 nm/s^2 | 23 | dev, test |
| Yx, negative control | fixed at FOC's value | 2 IOV, 4 GLONASS | dev, test |

The value's rule (PLAN.md section 4) used FFM's own response from Yt and base's errors on dev only, and was committed before any Y1, Y2 or Yx row was run. 3810 fits, each with one forecast, all CONVERGED, 0 refused. Full tables: [table.md](table.md), [table.json](table.json).

## FOC by axis and lead, test span, RMS in m

| axis | L, h | n | base | Y2 | Y2 ratio | interval | Y1 | Y1 ratio | interval |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| R | 1 | 389 | 0.61 | 0.15 | 0.239 | 0.209 to 0.276 | 0.17 | 0.273 | 0.253 to 0.295 |
| R | 6 | 389 | 0.51 | 0.16 | 0.314 | 0.281 to 0.351 | 0.17 | 0.331 | 0.293 to 0.374 |
| R | 12 | 389 | 0.66 | 0.20 | 0.301 | 0.265 to 0.343 | 0.14 | 0.210 | 0.186 to 0.239 |
| R | 24 | 389 | 0.63 | 0.23 | 0.373 | 0.331 to 0.422 | 0.20 | 0.324 | 0.263 to 0.393 |
| R | 48 | 372 | 1.85 | 0.45 | 0.242 | 0.202 to 0.289 | 0.48 | 0.258 | 0.218 to 0.312 |
| R | 72 | 372 | 3.86 | 0.66 | 0.172 | 0.139 to 0.216 | 0.85 | 0.221 | 0.204 to 0.240 |
| T | 1 | 389 | 1.14 | 0.23 | 0.200 | 0.146 to 0.260 | 0.16 | 0.143 | 0.126 to 0.162 |
| T | 6 | 389 | 3.29 | 0.44 | 0.133 | 0.103 to 0.169 | 0.56 | 0.171 | 0.160 to 0.184 |
| T | 12 | 389 | 4.14 | 0.43 | 0.104 | 0.093 to 0.114 | 0.53 | 0.128 | 0.113 to 0.144 |
| T | 24 | 389 | 11.10 | 1.05 | 0.095 | 0.084 to 0.106 | 1.58 | 0.143 | 0.129 to 0.160 |
| T | 48 | 372 | 34.85 | 3.35 | 0.096 | 0.086 to 0.108 | 5.20 | 0.149 | 0.138 to 0.162 |
| T | 72 | 372 | 63.82 | 6.11 | 0.096 | 0.087 to 0.105 | 9.05 | 0.142 | 0.127 to 0.161 |
| N | 1 | 389 | 0.16 | 0.12 | 0.757 | 0.714 to 0.802 | 0.12 | 0.753 | 0.697 to 0.822 |
| N | 6 | 389 | 0.19 | 0.10 | 0.545 | 0.510 to 0.581 | 0.10 | 0.535 | 0.498 to 0.575 |
| N | 12 | 389 | 0.18 | 0.09 | 0.521 | 0.483 to 0.562 | 0.12 | 0.647 | 0.586 to 0.721 |
| N | 24 | 389 | 0.26 | 0.09 | 0.350 | 0.324 to 0.378 | 0.17 | 0.663 | 0.502 to 0.885 |
| N | 48 | 372 | 0.44 | 0.12 | 0.264 | 0.243 to 0.287 | 0.14 | 0.320 | 0.278 to 0.370 |
| N | 72 | 372 | 0.58 | 0.15 | 0.264 | 0.242 to 0.287 | 0.30 | 0.524 | 0.332 to 0.770 |

Against GFZ, T at 24, 48, 72 h: Y2 1.05, 3.35, 6.11 m, REMOVED; Y1 1.59, 5.20, 9.05 m, REMOVED.

## T at 72 h against beta, FOC, test span

| arm | -90 to -60 | -60 to -30 | -30 to -15 | -15 to 15 | 15 to 30 | 30 to 60 | 60 to 90 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| base median, m | -87.5 | -78.0 | -50.0 | 22.8 | 53.8 | 78.6 | - |
| base RMS, m | 89.3 | 79.0 | 52.2 | 29.5 | 53.8 | 78.4 | - |
| Y2 median, m | 1.7 | 0.3 | -0.1 | 1.5 | -0.0 | 1.8 | - |
| Y2 RMS, m | 7.6 | 6.2 | 4.0 | 6.3 | 3.8 | 6.7 | - |
| Y1 median, m | -1.6 | -0.9 | -5.8 | -0.7 | -3.6 | -1.4 | - |
| Y1 RMS, m | 8.9 | 10.1 | 10.7 | 8.0 | 10.2 | 7.0 | - |

The largest primary errors under Y2 lie in the eclipse season (|beta| < 12.4 deg): 40544 at 2026-02-18, beta 4.52, 25.2 m; 43565 at 2026-02-18, beta 4.76, 22.0 m. The largest of all are under notices. This is reported, not tested.

## FOC per satellite, test span, RMS in m

| NORAD | Y1 median Y0, nm/s^2 | T 24 h base, Y2, Y1 | T 72 h base, Y2, Y1 | R 72 h base, Y2, Y1 | N 72 h base, Y2, Y1 |
| ---: | ---: | --- | --- | --- | --- |
| 41859 | 0.68 | 9.6, 1.4, 2.0 | 57.0, 4.1, 15.0 | 3.14, 0.54, 0.80 | 0.67, 0.15, 0.25 |
| 49810 | 0.74 | 7.1, 0.9, 1.4 | 42.3, 4.5, 7.2 | 2.44, 0.51, 0.83 | 0.78, 0.10, 0.33 |
| 41861 | 0.57 | 8.8, 1.5, 1.2 | 50.0, 8.3, 6.0 | 2.94, 0.70, 0.65 | 0.65, 0.17, 0.29 |
| 61183 | 0.69 | 14.9, 0.4, 1.6 | 84.6, 1.9, 9.1 | 5.27, 0.38, 0.85 | 0.36, 0.16, 0.14 |
| 43565 | 0.76 | 7.5, 1.0, 1.4 | 42.6, 6.3, 7.0 | 3.13, 1.41, 1.17 | 0.69, 0.09, 0.25 |
| 40544 | 0.57 | 5.8, 1.1, 2.6 | 36.0, 8.2, 11.6 | 2.50, 0.93, 0.87 | 0.44, 0.23, 0.90 |
| 59600 | 0.72 | 10.4, 0.7, 1.3 | 60.3, 4.3, 6.4 | 3.44, 0.54, 0.66 | 0.73, 0.17, 0.22 |
| 49809 | 0.73 | 7.2, 0.7, 1.3 | 40.5, 4.4, 7.8 | 2.74, 0.58, 0.79 | 0.65, 0.08, 0.15 |
| 41549 | 0.76 | 16.9, 2.4, 1.9 | 96.4, 13.5, 11.4 | 5.85, 0.82, 1.11 | 0.44, 0.15, 0.12 |
| 43058 | 0.62 | 13.4, 1.4, 1.3 | 74.3, 9.1, 7.5 | 4.29, 0.64, 0.76 | 0.37, 0.16, 0.13 |
| 43056 | 0.67 | 14.3, 0.3, 1.6 | 82.8, 2.5, 9.4 | 4.94, 0.47, 0.95 | 0.38, 0.20, 0.20 |
| 43564 | 0.67 | 6.9, 0.6, 1.5 | 39.0, 3.8, 9.0 | 2.23, 0.61, 0.90 | 0.71, 0.09, 0.17 |
| 43566 | 0.72 | 6.9, 0.7, 1.3 | 41.6, 4.6, 7.3 | 2.94, 0.48, 0.72 | 0.55, 0.12, 0.31 |
| 59598 | 0.77 | 10.7, 1.0, 1.4 | 63.8, 6.6, 7.5 | 3.96, 0.50, 0.57 | 0.67, 0.17, 0.15 |
| 41860 | 0.70 | 10.4, 0.8, 1.3 | 59.8, 4.2, 8.1 | 3.89, 0.43, 0.70 | 0.65, 0.12, 0.28 |
| 43057 | 0.67 | 14.5, 0.3, 1.7 | 83.7, 1.5, 9.9 | 4.79, 0.49, 0.99 | 0.32, 0.17, 0.14 |
| 40890 | 0.65 | 14.2, 0.6, 1.6 | 80.0, 3.3, 9.2 | 4.53, 0.52, 0.92 | 0.36, 0.15, 0.12 |

## Controls, test span

| block | Y2 value, nm/s^2 | Y1 median, nm/s^2 | T at 72 h, base to Y2, m | Y2 ratio | interval | verdict | T under Y1, m | T under Yx, m | Yx ratio | interval |
| --- | ---: | ---: | --- | ---: | --- | --- | ---: | ---: | ---: | --- |
| IOV | -0.043 | -0.060 | 5.77 to 4.58 | 0.79 | 0.68 to 0.93 | DOES LITTLE | 13.26 | 53.16 | 9.21 | 8.10 to 10.62 |
| GLONASS | -0.086 | -0.084 | 12.89 to 9.83 | 0.76 | 0.68 to 0.86 | DOES LITTLE | 17.32 | 78.96 | 6.13 | 5.43 to 7.03 |

## Published value

Bury, Sosnica, Zajdel, Strugarek (2020), J. Geod. 94:16, doi:10.1007/s00190-020-01342-2: "for all the Galileo-FOC satellites a significant Y-bias is visible, whereas the IOV satellites are not affected", -0.70 +/- 0.06 nm/s^2 from CODE's ECOM Y0, 2014.0 to 2018.4, attributed there to asymmetrical radiators on the +/-Y surfaces, and suggested as an a priori value. It was read before registration and not tuned to. **The sign against CODE's axis is open:** FFM's sign is measured here (module response and fitted value), and the relation between the two axes is not established here.

## Disclosures

1. The look (SRP's README) and the published value were both read before registration. The look covered dev and test dates together; the split is the first half against the second, fixed by date.
2. Probes before registration, with no fitted value, residual or error printed: FFM's response to Y0 from an ESA state, and the formal sigma of Y0 on five windows.
3. The fit and carry go through the pinned harness by a small adapter (lib/y0.mjs) that moves its signed slot T onto ECOM2's Y0 in the FFM request. Y0 = 0 through it equals no ECOM2, bit for bit; the E2E checks that and replays SRP's base rows through this runner.
4. FFM scales Y0 by the visible fraction of the Sun, so it is off in umbra. A thermal force would not be. Galileo's umbra is at most about an hour of 14 h, in eclipse season only.
5. One value per block, one sign, one test span of three months: nothing here tests the value's stability over years, though the published series spans 2014 to 2018. IOV is two satellites and GLONASS four, so their values are noisier than FOC's.
6. GNSS truth at 1, 6 and 12 h is the next daily file, which may share tracking data with the fit's. GFZ is reported beside it.
7. C3-small's chain is imported read-only with SHA-256 pins through SRP's common.mjs; no C3 row or result was opened. One known unlisted event stays as in SRP: R855, 2026-02-16.

## Cost and reproduction

Per arm and window, median at load near 20 to 100: fit 2.3 s (2 FFM rounds with STM over the 24 h arc, 145 points at 600 s), forecast and statistics 3.7 s (96 h from the fit epoch, covariance carried, outputs at the six leads); RK78, relative tolerance 1e-10, steps up to 120 s, 70 x 70. 6.4 CPU-h in all, on 8 workers. Store /opt/data/sdn-archive/ffm-galileo-y-bias, about 0.03 GB.

```
node experiments/ffm-galileo-y-bias/run.mjs --launch --phase dev --workers 8
node experiments/ffm-galileo-y-bias/dev.mjs
node experiments/ffm-galileo-y-bias/run.mjs --launch --phase arms --workers 8
node experiments/ffm-galileo-y-bias/score.mjs
node experiments/ffm-galileo-y-bias/report.mjs
node experiments/ffm-galileo-y-bias/run.mjs --check
```
