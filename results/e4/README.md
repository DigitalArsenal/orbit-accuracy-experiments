# E4 results

The plan is [`experiments/e4-operator-ephemeris-parity/PLAN.md`](../../experiments/e4-operator-ephemeris-parity/PLAN.md)
(frozen at `8005789`, amendments A1–A3). The run below holds the generated
[REPORT.md](e4-operator-ephemeris-parity-90-report-20261009T173808Z/REPORT.md), [metrics.json](e4-operator-ephemeris-parity-90-report-20261009T173808Z/metrics.json) and the manifest of every
step run it used (repository commit `dd95239` for the comparisons; modules
`5f09ba9b`, every artifact's SHA-256 recorded). The operator files are in
[`data/e4/`](../../data/e4/SOURCES.md) or listed in its MANIFEST.json.

S is SGP4 from the latest public element set available at the operator's
cut-off; H is the calibrated CA HPOP product (epoch-state seed, resident
20×20 field, P₀/Q from the 2026-08 HPOP covariance model). E2's fitted
product (C2) was not on the modules' default branch and is not run.

## `e4-operator-ephemeris-parity-90-report-20261009T173808Z`

Median 3D difference from the operator's ephemeris, km, S / H (manoeuvre-flagged object-files left out):

| Provider | Object-files / objects | Flagged | First horizon | 24 h | Last horizon |
| --- | --- | ---: | --- | --- | --- |
| SpaceX Starlink (MEME) | 298 / 298 | 31 | 2.87 / 4.74 | 13.8 / 18.6 | 60 h: 32.0 / 32.8 |
| NASA ISS (OEM) | 4 / 1 | 0 | 0.82 / 1.48 | 1.02 / 2.09 | 72 h: 4.82 / 22.7 |
| CMSE Tianhe (OEM) | 7 / 1 | 0 | 0.67 / 3.59 | 2.55 / 6.50 | 72 h: 20.0 / 54.8 |
| Planet (states, at epoch) | 1233 / 89 | 49 | 0.59 / 1.18 | – / – | at-epoch h: 0.59 / 1.18 |
| Intelsat (ECF, GEO) | 83 / 41 | 3 | 4.79 / 5.95 | 7.89 / 10.1 | 72 h: 17.0 / 18.0 |
| IGS ultra-rapid (GPS) | 859 / 32 | 36 | 1.23 / 1.88 | – / – | 12 h: 1.26 / 2.30 |
| ESA ultra-rapid (GLONASS) | 540 / 21 | 0 | 1.11 / 1.89 | – / – | 12 h: 1.14 / 2.47 |
| ESA rapid + Swarm A / CryoSat-2 POD | 372 / 55 | 13 | 1.16 / 2.00 | 1.28 / 3.37 | 24 h: 1.28 / 3.37 |
| ESA CPF predictions (Galileo) | 225 / 33 | 2 | 1.39 / 3.90 | 1.41 / 5.72 | 72 h: 1.40 / 9.05 |

Against truth (ESA final orbits), median 3D error, km:

| Provider | Horizon (h) | Operator | S | H |
| --- | --- | --- | --- | --- |
| IGS ultra-rapid (GPS) | 0 | 0.0001 | 1.23 | 1.88 |
| IGS ultra-rapid (GPS) | 12 | 0.0001 | 1.26 | 2.32 |
| ESA ultra-rapid (GLONASS) | 0 | 0.0001 | 1.12 | 1.90 |
| ESA ultra-rapid (GLONASS) | 12 | 0.0001 | 1.14 | 2.48 |

Starlink covariance against SpaceX's (UVW = RTN). Median σ in metres R / T / N; in-track σ ratio ours/SpaceX;
mean d²/3 and 95 % coverage of our difference from SpaceX under both covariances (nominal 1.0, 0.95):

| Horizon (h) | SpaceX σ (m) | S σ (m) | S/SpaceX T | S+SpaceX | H/SpaceX T | H+SpaceX |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 1.21 / 2.64 / 2.23 | 131.8 / 794.9 / 165.3 | 306.9 | 25.9, 0.28 | 1663 | 3.6, 0.69 |
| 1 | 1.97 / 7.38 / 1.90 | 131.8 / 794.9 / 165.3 | 110.8 | 31.9, 0.26 | 649.1 | 3.3, 0.66 |
| 3 | 4.34 / 31.0 / 2.45 | 133.3 / 794.9 / 165.3 | 26.8 | 41.0, 0.23 | 199.9 | 3.2, 0.73 |
| 6 | 9.90 / 148.7 / 2.47 | 153.9 / 871.7 / 166.7 | 5.91 | 64.8, 0.20 | 58.6 | 2.9, 0.78 |
| 12 | 26.2 / 781.3 / 3.36 | 153.9 / 871.7 / 166.7 | 1.15 | 62.7, 0.13 | 17.4 | 2.5, 0.77 |
| 24 | 83.7 / 3300 / 5.91 | 203.8 / 969.3 / 165.9 | 0.31 | 48.7, 0.27 | 8.11 | 2.8, 0.85 |
| 36 | 100.0 / 2500 / 15.0 | 203.8 / 969.3 / 165.9 | 0.39 | 271.9, 0.21 | 13.2 | 14.9, 0.84 |
| 48 | 109.8 / 2541 / 95.7 | 275.2 / 1294 / 167.0 | 0.51 | 1221.9, 0.11 | 20.1 | 116.8, 0.57 |
| 60 | 300.0 / 3800 / 500.0 | 275.2 / 1294 / 167.0 | 0.34 | 1344.2, 0.21 | 17.3 | 234.0, 0.92 |

| Hypothesis | Result |
| --- | --- |
| H1 Starlink S within 2 km at 0 h, 30 km at 72 h | FAIL at 0 h (2.87 km); 72 h not reachable (A1), 32.0 km at 60 h |
| H2 our covariance consistent with the difference from SpaceX | FAIL for S and H at every horizon: S's model σ understates the difference (mean d²/3 26–1344), H's P₀ is closer (2.5–3.6 up to 24 h) but still short |
| H3 our in-track σ ≥ 10× SpaceX's | Holds to 3 h only (S: 307×, 111×, 27×); SpaceX's in-track σ grows past ours by 12 h (S/SpaceX 1.15 at 12 h, 0.31 at 24 h) |
| H4 operator closer to truth than ours (ratio upper bound < 0.1) | PASS for GPS and GLONASS (operator ≈ 0.1 m, ours ≈ 1–2 km; ratios ~1e-4); not tested for Galileo (A3) |
| H5 H against S | S closer for every multi-object provider at short horizons; undecided for Starlink beyond 12 h and for Intelsat at most horizons; ISS and Tianhe descriptive (one object) |

Not compared: OneWeb (LTEF), SES (IESS-412) — no module reads them; Telesat
(box centres, not states); EUMETSAT (element sets only). Space-Track, Spire,
EDC and Vimpel are credentialed and excluded.

<!-- credits:begin (harness/credit-lines.mjs) -->

## Credits

- © Navigation Support Office at ESA/ESOC 2026; IGS analysis-centre products, courtesy of the International GNSS Service (Johnston et al. 2017, doi:10.1007/978-3-319-42928-1).
- © Navigation Support Office at ESA/ESOC 2026.
- Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org).

Every source and its terms: [docs/data-licenses.md](../../docs/data-licenses.md#credits-by-experiment).

<!-- credits:end -->
