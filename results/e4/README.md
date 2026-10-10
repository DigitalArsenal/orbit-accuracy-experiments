# E4 results

The plan is [`experiments/e4-operator-ephemeris-parity/PLAN.md`](../../experiments/e4-operator-ephemeris-parity/PLAN.md)
(frozen at `8005789`, amendments A1–A4). The current report is
[`e4-operator-ephemeris-parity-90-report-20261010T085030Z`](e4-operator-ephemeris-parity-90-report-20261010T085030Z/REPORT.md) ([metrics.json](e4-operator-ephemeris-parity-90-report-20261010T085030Z/metrics.json), and the
manifest of every step run it used: repository commits `71dde8b` and `fa0a3b9` (the same step code) for the
comparisons; modules `cb9160db`, propagator/hpop 1.2.0 with WASM
SHA-256 `c432dd6593061f524477dd8ad6941bdf039bd059f1c9262e9c2d2911e8ad3e13`, built on spacedatastandards.org 1.243.0). The operator
files are in [`data/e4/`](../../data/e4/SOURCES.md) or listed in its MANIFEST.json.

Amendment A4 renamed the first report's H, propagator/hpop's resident model
(point mass and EGM2008 20×20), to **R**, and added two full-force products.
The first report ([`e4-operator-ephemeris-parity-90-report-20261009T173808Z`](e4-operator-ephemeris-parity-90-report-20261009T173808Z/REPORT.md))
is kept; R reproduces its H exactly.

| Product | What it is | Covariance |
| --- | --- | --- |
| S | SGP4 from the latest public element set at the operator's cut-off | The regime and age stratum of `model-2026-08-scaled.json` |
| R | The set's epoch state propagated by HPOP's resident model (point mass, EGM2008 20×20) | P₀ and Q of the 2026-08 HPOP covariance model |
| H-epoch | The same epoch state propagated with the full force model | R's P₀ and Q, propagated with the full force model |
| H-arc | The full force model fitted to the epoch states of the 3-day arc of sets ending at the latest one | The fit's covariance times max(1, reduced χ²), propagated |

The full force model is EGM2008 70×70 in LEO and 20×20 at MEO and GEO; the
Sun, Moon, Venus, Mars and Jupiter (DE440s); cannonball solar radiation
pressure; Knocke Earth radiation pressure; NRLMSISE-00 drag in LEO; IERS 2010
solid tides and relativity; and FES2004 ocean tides to degree and order 30.
H-epoch and H-arc are made when their element set is published, with the Earth
orientation and space weather released by then.

## `e4-operator-ephemeris-parity-90-report-20261010T085030Z`

Median 3D difference from the operator's ephemeris, km, S / R / H-epoch / H-arc (manoeuvre-flagged object-files left out). H-arc's median is over the object-files whose fit converged; REPORT.md gives every sample count, and the H5 ratios below compare each product with S on the same samples.

| Provider | Object-files / objects | Flagged | First horizon | 24 h | Last horizon |
| --- | --- | ---: | --- | --- | --- |
| SpaceX Starlink (MEME) | 298 / 298 | 31 | 0 h: 2.87 / 4.74 / 4.66 / 3.79 | 13.8 / 18.6 / 20.5 / 14.0 | 60 h: 32.0 / 32.8 / 39.9 / 29.2 |
| NASA ISS (OEM) | 4 / 1 | 0 | 0 h: 0.82 / 1.48 / 1.71 / 1.17 | 1.02 / 2.09 / 2.21 / 4.36 | 72 h: 4.82 / 22.7 / 12.1 / 7.03 |
| CMSE Tianhe (OEM) | 7 / 1 | 0 | 0 h: 0.67 / 3.59 / 3.96 / 1.24 | 2.55 / 6.50 / 11.2 / 4.52 | 72 h: 20.0 / 54.8 / 12.3 / 21.7 |
| Planet (states, at epoch) | 1233 / 89 | 49 | at epoch: 0.59 / 1.18 / 1.14 / 0.73 | – | – |
| Intelsat (ECF, GEO) | 83 / 41 | 3 | 0 h: 4.79 / 5.95 / 8.06 / 6.49 | 7.89 / 10.1 / 17.6 / 8.81 | 72 h: 17.0 / 18.0 / 37.8 / 20.3 |
| SES (IESS-412, GEO) | 33 / 33 | 1 | 0 h: 3.50 / 4.12 / 4.86 / 5.80 | 4.40 / 8.47 / 8.17 / 8.30 | 72 h: 9.65 / 18.4 / 22.3 / 16.2 |
| IGS ultra-rapid (GPS) | 859 / 32 | 36 | 0 h: 1.23 / 1.88 / 2.13 / 2.15 | – | 12 h: 1.26 / 2.30 / 2.76 / 2.44 |
| ESA ultra-rapid (GLONASS) | 540 / 21 | 0 | 0 h: 1.11 / 1.89 / 2.17 / 1.51 | – | 12 h: 1.14 / 2.47 / 2.84 / 1.67 |
| ESA rapid + Swarm A / CryoSat-2 POD | 372 / 55 | 13 | 0 h: 1.16 / 2.00 / 2.04 / 1.80 | 1.28 / 3.37 / 3.58 / 2.32 | 24 h: 1.28 / 3.37 / 3.58 / 2.32 |
| ESA CPF predictions (Galileo) | 225 / 33 | 2 | 0 h: 1.39 / 3.90 / 3.35 / 3.14 | 1.41 / 5.72 / 5.25 / 3.67 | 72 h: 1.40 / 9.05 / 8.99 / 4.48 |

Against truth, median 3D error, km:

| Provider | Truth | Horizon (h) | Operator | S | R | H-epoch | H-arc |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IGS ultra-rapid (GPS) | ESA0OPSFIN | 0 | 0.0001 | 1.23 | 1.88 | 2.13 | 2.12 |
| IGS ultra-rapid (GPS) | ESA0OPSFIN | 12 | 0.0001 | 1.26 | 2.32 | 2.77 | 2.43 |
| ESA ultra-rapid (GLONASS) | ESA0OPSFIN | 0 | 0.0001 | 1.12 | 1.90 | 2.17 | 1.51 |
| ESA ultra-rapid (GLONASS) | ESA0OPSFIN | 12 | 0.0001 | 1.14 | 2.48 | 2.83 | 1.67 |
| ESA rapid + Swarm A / CryoSat-2 POD | ESA0OPSFIN | 0 | 0.0000 | 1.18 | 2.06 | 2.08 | 1.94 |
| ESA rapid + Swarm A / CryoSat-2 POD | ESA0OPSFIN | 12 | 0.0000 | 1.23 | 2.70 | 2.82 | 2.09 |
| ESA rapid + Swarm A / CryoSat-2 POD | ESA0OPSFIN | 24 | 0.0000 | 1.29 | 3.35 | 3.57 | 2.35 |
| ESA CPF predictions (Galileo) | GFZ0OPSFIN | 0 | 0.0001 | 1.42 | 3.90 | 3.35 | 2.87 |
| ESA CPF predictions (Galileo) | GFZ0OPSFIN | 12 | 0.0001 | 1.53 | 4.89 | 3.88 | 3.16 |
| ESA CPF predictions (Galileo) | GFZ0OPSFIN | 24 | 0.0002 | 1.43 | 5.61 | 5.17 | 3.40 |
| ESA CPF predictions (Galileo) | GFZ0OPSFIN | 48 | 0.0005 | 1.43 | 7.41 | 6.97 | 3.73 |
| ESA CPF predictions (Galileo) | GFZ0OPSFIN | 72 | 0.0008 | 1.39 | 8.89 | 8.41 | 3.85 |

Starlink covariance against SpaceX's (UVW = RTN): median in-track σ, m; mean d²/3 and 95 % coverage of our difference from SpaceX under both covariances (nominal 1.0, 0.95):

| Horizon (h) | SpaceX σT | S σT | S | R σT | R | H-epoch σT | H-epoch | H-arc σT | H-arc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 2.64 | 795 | 25.9, 0.28 | 4.44e+3 | 3.64, 0.69 | 4.44e+3 | 3.64, 0.69 | 1.98e+3 | 9.51, 0.34 |
| 1 | 7.38 | 795 | 31.9, 0.26 | 5.23e+3 | 3.30, 0.66 | 5.22e+3 | 3.29, 0.67 | 1.92e+3 | 9.95, 0.31 |
| 3 | 31.0 | 795 | 41.0, 0.23 | 6.56e+3 | 3.16, 0.73 | 6.55e+3 | 3.13, 0.74 | 2.14e+3 | 11.4, 0.34 |
| 6 | 149 | 872 | 64.8, 0.20 | 8.53e+3 | 2.91, 0.78 | 8.52e+3 | 2.86, 0.80 | 2.34e+3 | 12.5, 0.26 |
| 12 | 781 | 872 | 62.7, 0.13 | 1.30e+4 | 2.45, 0.77 | 1.29e+4 | 2.32, 0.77 | 2.58e+3 | 12.3, 0.24 |
| 24 | 3.30e+3 | 969 | 48.7, 0.27 | 2.33e+4 | 2.80, 0.85 | 2.33e+4 | 2.36, 0.85 | 3.44e+3 | 8.80, 0.35 |
| 36 | 2.50e+3 | 969 | 272, 0.21 | 3.53e+4 | 14.9, 0.84 | 3.53e+4 | 11.6, 0.86 | 4.80e+3 | 12.3, 0.37 |
| 48 | 2.54e+3 | 1.29e+3 | 1.22e+3, 0.11 | 4.85e+4 | 117, 0.57 | 4.85e+4 | 96.1, 0.56 | 6.15e+3 | 106, 0.12 |
| 60 | 3.80e+3 | 1.29e+3 | 1.34e+3, 0.21 | 6.34e+4 | 234, 0.92 | 6.34e+4 | 191, 0.91 | 7.79e+3 | 191, 0.40 |

H5, median 3D over S's [95 %] at the first horizon and at 24 h (or the last):

| Provider | Horizon (h) | R/S | H-epoch/S | H-arc/S |
| --- | --- | --- | --- | --- |
| SpaceX Starlink (MEME) | 0 | 1.65 [1.37, 1.97] | 1.63 [1.36, 1.92] | 0.97 [0.75, 1.21] |
| SpaceX Starlink (MEME) | 24 | 1.34 [0.96, 1.72] | 1.48 [1.06, 1.82] | 0.69 [0.53, 0.95] |
| NASA ISS (OEM) | 0 | 1.81 [1.81, 1.81] | 2.10 [2.10, 2.10] | 1.43 [1.43, 1.43] |
| NASA ISS (OEM) | 24 | 2.06 [2.06, 2.06] | 2.17 [2.17, 2.17] | 4.29 [4.29, 4.29] |
| CMSE Tianhe (OEM) | 0 | 5.38 [5.38, 5.38] | 5.93 [5.93, 5.93] | 1.70 [1.70, 1.70] |
| CMSE Tianhe (OEM) | 24 | 2.55 [2.55, 2.55] | 4.38 [4.38, 4.38] | 0.98 [0.98, 0.98] |
| Planet (states, at epoch) | at-epoch | 2.00 [1.79, 2.40] | 1.93 [1.76, 2.11] | 1.26 [1.10, 1.39] |
| Intelsat (ECF, GEO) | 0 | 1.24 [1.04, 1.37] | 1.68 [1.22, 2.46] | 1.08 [0.66, 1.55] |
| Intelsat (ECF, GEO) | 24 | 1.28 [0.95, 1.87] | 2.24 [1.55, 3.42] | 0.99 [0.76, 1.57] |
| SES (IESS-412, GEO) | 0 | 1.18 [0.85, 1.78] | 1.39 [0.90, 2.10] | 1.55 [0.51, 2.67] |
| SES (IESS-412, GEO) | 24 | 1.93 [1.31, 3.06] | 1.86 [1.05, 3.28] | 1.96 [0.97, 3.05] |
| IGS ultra-rapid (GPS) | 0 | 1.52 [1.24, 1.99] | 1.73 [1.28, 2.27] | 1.50 [1.13, 2.12] |
| IGS ultra-rapid (GPS) | 12 | 1.82 [1.46, 2.41] | 2.19 [1.67, 2.94] | 1.71 [1.21, 2.37] |
| ESA ultra-rapid (GLONASS) | 0 | 1.70 [1.34, 2.19] | 1.95 [1.42, 2.45] | 1.41 [1.09, 2.08] |
| ESA ultra-rapid (GLONASS) | 12 | 2.16 [1.72, 2.91] | 2.48 [1.79, 3.28] | 1.49 [1.09, 2.11] |
| ESA rapid + Swarm A / CryoSat-2 POD | 0 | 1.73 [1.45, 2.31] | 1.76 [1.43, 2.40] | 1.55 [1.17, 1.92] |
| ESA rapid + Swarm A / CryoSat-2 POD | 24 | 2.64 [2.28, 3.36] | 2.81 [2.27, 3.71] | 1.74 [1.36, 2.22] |
| ESA CPF predictions (Galileo) | 0 | 2.79 [2.23, 3.36] | 2.44 [1.83, 3.74] | 2.56 [1.41, 4.98] |
| ESA CPF predictions (Galileo) | 24 | 4.07 [3.41, 4.86] | 3.77 [3.11, 5.02] | 2.68 [1.59, 5.43] |

H-arc fits:

| Provider | Sets (groups) | Converged / fitted | Reduced χ² median | Fitted parameter / a priori (median, m²/kg) | Missing |
| --- | ---: | --- | --- | --- | --- |
| SpaceX Starlink (MEME) | 298 | 143 / 144 | 2.40 | 0.00540 / 0.00375 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (154); H-arc: the fit did not converge (1) |
| NASA ISS (OEM) | 4 | 4 / 4 | 1.54 | 0.00539 / 0.00134 | – |
| CMSE Tianhe (OEM) | 7 | 6 / 6 | 1.18 | 0.00786 / 0.00267 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (1) |
| Planet (states, at epoch) | 849 | 822 / 822 | 1.36 | 0.0236 / 0.00369 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (24); H-arc: fewer than 3 element sets in the arc (3) |
| Intelsat (ECF, GEO) | 83 | 34 / 34 | 588 | 0.0412 / 0.0217 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (49) |
| SES (IESS-412, GEO) | 33 | 19 / 19 | 390 | 0.0510 / 0.0217 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (14) |
| IGS ultra-rapid (GPS) | 292 | 181 / 181 | 4.88 | 0.0249 / 0.0173 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (88); H-arc: fewer than 3 element sets in the arc (23) |
| ESA ultra-rapid (GLONASS) | 147 | 74 / 74 | 9.87 | 0.0975 / 0.0173 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (40); H-arc: fewer than 3 element sets in the arc (33) |
| ESA rapid + Swarm A / CryoSat-2 POD | 284 | 173 / 173 | 6.83 | 0.0297 / 0.0173 | H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (76); H-arc: fewer than 3 element sets in the arc (35) |
| ESA CPF predictions (Galileo) | 125 | 45 / 45 | 7.11 | 0.0379 / 0.0232 | H-arc: fewer than 3 element sets in the arc (44); H-epoch and H-arc: no force-table row for the regime Eccentric (e >= 0.1) (6); H-arc: a fit iteration proposed a negative Cr*A/m or Cd*A/m, which propagator/hpop refuses (30) |

| Hypothesis | Result |
| --- | --- |
| H1 Starlink S within 2 km at 0 h, 30 km at 72 h | FAIL at 0 h (2.87 km); 72 h not reachable (A1), 32.0 km at 60 h |
| H2 our covariance consistent with the difference from SpaceX | FAIL for every product at every horizon. S's σ is far too small (mean d²/3 26–1344). R and H-epoch, with the HPOP model's P₀ and Q, come closest (2.3–3.6 to 24 h, coverage 0.66–0.85). H-arc's fitted covariance is too small (8.8–12.5 to 36 h, coverage 0.24–0.37) |
| H3 our in-track σ ≥ 10× SpaceX's | S to 3 h; R and H-epoch to 12 h and again from 36 h (8.1× at 24 h); H-arc to 6 h |
| H4 operator closer to truth than ours (ratio upper bound < 0.1) | PASS for GPS, GLONASS and, with GFZ0OPSFIN, Galileo: the operators' predictions are 0.1–0.8 m from truth, ours 1–9 km |
| H5 each product against S | R and H-epoch are never closer than S: S is closer or the pair is undecided for every multi-object provider. H-arc is closer than S for Starlink from 6 h to 60 h (median ratio 0.61–0.74, on the 129 object-files with a converged fit) and undecided for Intelsat and SES; S is closer for the GNSS providers. For Planet's states, at their own epoch, S is closer than all three (H-arc/S 1.26 [1.10, 1.39]). |

What A4 shows:
- From one element set (H-epoch), a better force model does not make up for
  the start state. H-epoch starts from the set's SGP4 state at its epoch and
  is farther from the operator than S for almost every provider and horizon
  (GPS 2.13 km against S's 1.23 km at 0 h; against Galileo truth 3.35 km
  against 1.42 km). E7 finds the same against precise orbits: its H-epoch is
  no better than SGP4 in any regime, worse within hours to days, and its
  error is almost all along-track ([E7 test report](../e7/test/REPORT.md)).
- Fitted to an arc of sets (H-arc), the full force model is the one product
  that beats S anywhere: for Starlink from 6 h to 60 h. For Planet, the GNSS
  providers and the GEO operators it stays behind S or undecided. A fit
  through SGP4 epoch states inherits their errors, and the fitted
  coefficient absorbs them: Cr·A/m comes out 1.4 to 5.6 times the nominal
  value at GNSS altitudes.
- Outside Planet (822 of 849 fits converge), about half the arcs give no
  H-arc. fit_batch has no bounds, and propagator/hpop refuses a negative
  Cr·A/m or Cd·A/m, so a fit whose iteration crosses zero ends there: 154 of
  298 Starlink arcs, 49 of 83 Intelsat, 88 of 292 GPS. GNSS sets are sparse,
  and 23 to 44 arcs per GNSS provider hold fewer than three sets. In LEO the
  fitted Cd·A/m is 1.4 (Starlink) to 6.4 (Planet) times the value from B*.
- The two eccentric Galileo satellites (gp-error-model regime "Eccentric")
  have no row in the force table, so they get no full-force product (6 sets).
- The fits' reduced χ² (median 2.4 for Starlink, 4.9–9.9 at GNSS altitudes,
  390–590 at GEO) shows that the [0, 0.5] d second moment understates how far
  consecutive element sets' epoch states scatter, most of all at GEO.

Not compared: OneWeb (LTEF: no module reads it, and the format is only
partly decoded without Eutelsat's specification), Telesat (box centres, not
states) and EUMETSAT (element sets only). Two SES files name satellites with
no unique catalog name (SES-11, SES-24), and three had expired before
capture. Space-Track, Spire, EDC and Vimpel are credentialed and excluded.

<!-- credits:begin (harness/credit-lines.mjs) -->

## Credits

- © Navigation Support Office at ESA/ESOC 2026; IGS analysis-centre products, courtesy of the International GNSS Service (Johnston et al. 2017, doi:10.1007/978-3-319-42928-1).
- © Navigation Support Office at ESA/ESOC 2026.
- Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org).

Every source and its terms: [docs/data-licenses.md](../../docs/data-licenses.md#credits-by-experiment).

<!-- credits:end -->
