# The tesseral short-period model in every regime against an independent full-force reference

Record experiments-sdn-ap-tesseral-all-regimes-20261106. Registered before any row is read. Report only: nothing in propagator/sdn-ap
changes here; a fix is its own record and version.

## What is measured
propagator/sdn-ap 0.6.3 (modules 93cb5a058; dist SHA-256 aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e), the AP
theory with the forces the fit states (MAXIMUM_TESSERAL_DEGREE 31, MAXIMUM_DEGREE 20, no atmosphere), fitted to a noise-free arc of
the reference and flown forward: the narrow short-period set below e 0.3 and the closed-form grid above. The error is the forward error
of the flight against the reference (never a fit residual); the lead counts from the fit's end.

## The reference (independent of the model's term selection)
Numerical integration by propagator/ffm 2.2.1 (same modules root; dist SHA-256 a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4)
in vacuum: EGM96 to degree and order 31 (the module's tesseral cap; the zonals above 20 the module leaves out are below a millimeter
in every regime here), point mass, no drag, no SRP, no third body, no tides, no relativity, no Earth radiation. RK78 (Fehlberg's 8th-order
solution), relative tolerance 1e-12, absolute tolerances 1e-9, minimum step 0.01 s, maximum step 300 s, initial step 60 s. Earth
orientation: the zero-EOP rows of the module's model-truth harness (TAI-UTC 37 s). The reference shares nothing with the module but the
EGM96 coefficients and the initial state. It never uses the module's term selection; estar.cpp and the quadrature harness are not the
reference anywhere in this record.

Initial state: the AP set of the regime's mean elements (epoch 2026-10-29T00:00:00 UTC, seed at perigee, argument of latitude equal to the
argument of perigee) converted to its osculating GCRF state by the module (`sdnap_state_of_elements`, the model-truth harness's method,
propagator/sdn-ap/test/lib/heo-model-truth.mjs); from that state the reference is integrated 4 days: 3 days of fit arc sampled every
30 minutes (145 states) and a forward day sampled 64 times per revolution (period 1440 / n minutes). Fit and forward both read the reference.

Convergence check (stated per regime at e 0.001 and for every e 0.29 / 0.30 flight): the reference is integrated again at relative
tolerance 1e-13 (a tenth of the tolerance, stricter than halving); the maximum position difference over the forward day must be below a
tenth of the regime's RMS bound. A regime whose reference fails the check is reported as such and its verdict is withheld.

## The regimes (17; mean motion rev/day, inclination deg; RAAN 0, mean anomaly 0)
Starlette (13.82, 49.8), Ajisai (12.44, 50.0), LARES (12.55, 69.5), Jason-3 (12.81, 66.0), Sentinel-3 (14.27, 98.6), CryoSat-2 (14.52, 92.0),
LAGEOS-1 (6.39, 109.8), LAGEOS-2 (6.47, 52.6), Etalon (2.13, 64.9), GPS (2.005, 55.0), Galileo (1.70, 56.0), GLONASS (2.13, 64.8),
IGSO (1.0027, 55.0), QZSS (1.0027, 40.0), GEO (1.0027, 0.1), Molniya (2.006, 63.4, argument of perigee 270), GTO (2.40, 27.0, argument of
perigee 180). The one-day orbit of the e 0.3 step: THEMIS D (1.0499, 8.133, RAAN 47.856, argument of perigee 68.664; the ripple lane's
fitted elements, results/ap-truth/themis-ripple-fix/correctness/elements.json).

Eccentricity grid: 0.001, 0.01, 0.05, 0.1, 0.2 for every regime, a cell flown only when its perigee altitude is 200 km or more (below that
the cell is marked "below the perigee floor", not flown). The e 0.3 pair: 0.29 and 0.30 for THEMIS D (one day), Molniya and GTO (half day).
Order of flight (the box is two hours; cells not reached are reported unmeasured, never filled): (1) every regime at e 0.001; (2) the six
e 0.29 / 0.30 flights; (3) every regime at e 0.01; (4) e 0.1; (5) e 0.05 and 0.2.

## The orbit-scaled bounds
A, the field's tesseral short-period amplitude in the regime: the RMS over the forward day of the difference between the fitted set flown
with its stated caps and the same set flown with MAXIMUM_TESSERAL_DEGREE 0 (zonals only), both by the module on the same epochs. A is the
tesseral displacement as the model represents it; a model that misses part of the field understates A by the miss, which only tightens
the bound. Reported with every row.
- RMS bound b_rms = max(1 m, 0.02 A); maximum bound b_max = max(5 m, 0.10 A); roughness bound b_rough = max(0.1 m, 0.005 A).
- Roughness: the median over the forward day of |second difference| of the RTN error at the per-revolution step h = P / 64 (never a fixed
  300 s). A j-th harmonic of M of amplitude a contributes about a (2 pi j / 64)^2 to it.
The floors are the ripple registration's absolute bounds (THEMIS-RIPPLE-FIX.md Amendment 2), so a regime where the tesseral field is
small is held to them and not to a fraction of a small A.

## Reading rule
A cell passes when its forward-day RMS, maximum and roughness are all within the bounds; otherwise it fails. A regime's verdict is its
cells' verdicts, listed. The e* sweep's finding ("16 of 17 regimes miss at e 0.001") is re-read here cell by cell: the published statement
of this record is the per-regime pass / fail at e 0.001 against this reference, and nothing from estar.cpp.

The e 0.3 step: for THEMIS D (one day), Molniya and GTO (half day), the difference between the e 0.29 flight's and the e 0.30 flight's
forward-day RMS and maximum against the reference, each fitted and flown on its own reference. The fitted eccentricity of every flight is
reported; a "0.30" flight whose fitted eccentricity is below 0.3 did not exercise the grid and is marked so (a 0.31 flight is then added
and reported as the step's upper arm). The ripple lane's one-day figure (21 m RMS, 44 m maximum by quadrature) stands or falls by the
THEMIS D step measured here; the half-day step is measured here for the first time and SPEC claims nothing about it until then.

## Family attribution
The forward-day RTN error is fitted by least squares to a constant and a linear trend per axis (the secular share: the fit's rate
mismatch) and to cos / sin of j M + m (Omega - theta) for j 0 to 16 and m 0 to 8, (0, 0) excluded, where M advances at the fitted mean
motion and theta at the Earth's rotation rate (1.00273781 rev/day); the fitted RAAN rate is neglected in the frequency (at most 2 % of a
frequency over one day). Frequencies closer than one cycle per day (the day's resolution) are merged and carry both labels (the one-day
regimes collapse to the harmonics of the day). A family's amplitude is the norm over the three axes of its cos / sin coefficients. In the
module's (l, m, p, q) notation j = l - 2p + q: m = 0 is a zonal short-period harmonic, j = 0 with m > 0 an m-daily term, the rest tesseral.
Each failing cell names its families above 10 % of the cell's RMS (at most eight) and the secular share, and says whether the miss sits
in (a) families the narrow set admits (q in {-1, 0, 1}: j within 1 of l - 2p, so a wider narrow set would reach them), (b) families
beyond that (the grid at lower e, or something else), or (c) the secular share (not the short-period model at all).

## Operating characteristics of the pass line
A model equal to the field fails a cell only through (1) the reference's own error, bounded by the convergence check at a tenth of
b_rms, and (2) the fit's forward-day drift on a noise-free arc. (2) is measured by this record's e 0.30 rows: there the module's grid equals
the quadrature field to 0.12 m RMS and 2.3 m maximum (ripple lane, THEMIS D), so an e 0.30 failure beyond those figures is the fit's drift
or a model error this record cannot separate; in that case the line is reported uncalibrated for the one-day regime and no e 0.001 pass
is claimed stronger than "within the bound by the measured margin". A one-day window holds 14 to 15 revolutions in the low regimes and a
single revolution at GEO, IGSO and QZSS: their rows are one-cycle readings of the m-daily terms and are marked so.

## Outputs and check
Rows: results/ap-truth/tesseral-all-regimes/rows-<shard>.jsonl (one per cell: regime, elements, fitted elements, A, the bounds, RMS,
maximum, roughness, the convergence figure where measured, families, verdict, the SHA-256 of both dists and of the runner, createdUtc).
`node experiments/operator-theory/tesseral-all-regimes.mjs --table` writes results/ap-truth/tesseral-all-regimes/table.json and README.md
from the rows; `--check` asserts that this registration's commit precedes the first row, that every row is on the two pinned dists, that
the table reproduces byte for byte, that every flown cell is scored against its orbit-scaled bounds and every failing cell names its
families, and exits 0 only then.
