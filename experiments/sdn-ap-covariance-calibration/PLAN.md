# C1: SDN-AP propagated covariance calibrated to the realism band

Registered 2026-10-25 (task modules-sdn-ap-covariance-calibration-to-band-20261025); frozen by the first commit of
this plan and config.json. At registration no candidate model below has been fitted, and no held-out cell has been
scored with one. The cells that motivate it are those SPEC 12.7 of propagator/sdn-ap prints (modules a29c4aec): 1 of
24 held-out cells inside the band. Nothing below changes after that commit except by an amendment section appended at
the end, dated, with its reason, made before the held-out scoring it affects.

The computations run in space-data-network-modules (rule 1): the module's `fit`, `propagate` and covariance
(propagator/sdn-ap, SPEC 12) through its realism harness (propagator/sdn-ap/test/covariance-realism.mjs), which reads
the laser-ranged reference orbits in /opt/data/sdn-archive/reference-states/reference. This experiment holds the plan,
the configuration and the committed summaries.

## Question

Which process-noise model, fitted on one set of objects and dates and chosen on another, puts SDN-AP's and SGP4XP's
propagated position covariance inside the realism band on objects and dates it never saw, cell by cell?

## 1 The quantity

For each window: a 24 h `fit` (THEORY SDNAP, or SGP4XP) of a GCRF laser-ranged reference ephemeris, then `propagate`
of the fitted set onto the reference epochs of the next 3 days every 30 min, states and covariance lines from the
module (test/covariance-realism.mjs, unchanged in what it measures). Per sample e = model - reference (position),
d^2 = e^T P^-1 e on the 3 x 3 position block of P(t). Per cell (theory, set, day of lead 1, 2, 3): mean d^2 / 3, the
share of samples with d^2 <= 7.8147 (the 95 % ellipsoid of chi-square(3)), median d^2, windows, samples.

The band (SPEC 12.7; propagator/sdn-ap/test/rigor/data/covariance-band.json): mean d^2/3 in [0.8, 1.25] and 95 % coverage in
[0.93, 0.97]. A cell is inside when both hold.

## 2 The split (by object and by time; no window in two sets)

| Set | Objects | Dates (window start) | Use |
| --- | --- | --- | --- |
| fit | DRAG: Ajisai, Starlette, LARETS, WESTPAC, LARES; ABOVE: LARES-2, LAGEOS-2, Etalon-1, Etalon-2 | 2026-02-01 to 2026-05-31 | maximum-likelihood sizes of the process noise and the floor scale |
| validation | the fit objects | 2025-11-01 to 2026-01-31 and 2026-06-01 to 2026-08-31 | choosing the model form and its shape parameters (3); never in a likelihood fit |
| held-out, object | LAGEOS-1 (ABOVE), Stella (DRAG) | every date | scored once, after the choice |
| held-out, time | every object | the experiment's windows (rows/slr-high.jsonl, rows/slr-low.jsonl: 2025-09-28 to 2025-10-22) | scored once, after the choice |

Stella leaves the fit set (it was in it for the constants of SPEC 12.5), so the DRAG regime has an object held out as
ABOVE has. LEO windows are every second NSGF arc, high-orbit windows every 9 days from the period start, as the
harness forms them today. Counts available (every second arc): about 22 to 23 fit and 27 to 29 validation windows
per LEO object.

## 3 The candidate models (fixed now)

The covariance stays P(t) = J(t) P_p J(t)^T + Q(t) + F(x(t)) (SPEC 12.3). The candidates change Q and the scale of the
other two terms only; every term stays computed in the module.

- **M0, constant rate errors (today).** Element-rate errors constant after the arc end: element error s_k d,
  d = lead in days (SPEC 12.5). Refit on the fit set as specified here, the baseline.
- **M1, Gauss-Markov rate errors.** Each rate error a first-order Gauss-Markov process of standard deviation s_k and
  correlation time tau: the element error's standard deviation is s_k h(d), h(d) = tau sqrt(2 (d/tau - 1 + exp(-d/tau))),
  which is d for d << tau and sqrt(2 tau d) for d >> tau. tau per regime from the grid {0.5, 1, 2, 4} days
  (tau -> infinity is M0). The drag term (s_d = c |n-dot_ng|) unchanged.
- **M2, residual-correlation inflation of the fit covariance.** P_p multiplied by k = 1 + 2 sum_{j=1..L} rho_j, rho_j the
  lag-j autocorrelation of the fit's along-track residuals (L = the first lag where rho changes sign, at most 20),
  computed by the module from its own residuals at fit time; and the floor F multiplied by f_F, fitted per regime.
- **M3, residual-scaled window weight (the heavy tail).** Q and F multiplied by w = (r / r_reg)^beta, r the window's
  post-fit residual RMS, r_reg the regime's median r over the fit set (a constant of the model), beta from {0, 0.5, 1}.
  It uses only what the fit itself sees.

Candidates evaluated: M0, M1, M1 + M2, M1 + M2 + M3 (each over its grid), per theory (SDNAP, SGP4XP) and regime (DRAG,
ABOVE).

## 4 How they are fitted and chosen

- Sizes (s_e, s_i, s_l, c and f_F) by maximum likelihood on the fit set for each grid point: the Gaussian negative
  log-likelihood of e under P(t), position block, every sample of days 1 to 3 (as the harness does today, P linear in
  the squared sizes).
- Choice on the validation set only: per theory and regime, the candidate and grid point with the most validation
  cells (day 1, 2, 3) inside the band; ties broken by the smaller sum over its cells of |ln(mean d^2/3)| +
  |coverage - 0.95| / 0.05, then by fewer parameters (M0 < M1 < M1 + M2 < M1 + M2 + M3).
- The chosen model's constants are written to src/covariance.inc and SPEC 12.5 before the held-out scoring.

## 5 The held-out scoring and what is reported

- Once, with the module as built from the chosen constants: every held-out cell, theory x set (LAGEOS-1 experiment
  windows, LAGEOS-1 other dates, Stella, LAGEOS-2 / Etalon-1 / Etalon-2 experiment windows, LEO-set experiment
  windows) x day, with mean d^2/3, coverage, median d^2, windows, samples and inside or outside. The vallado rigor
  check reports the cells outside by name as measured limits.
- Success: more than half of the held-out cells inside the band, for each theory. Short of it, the result is still
  committed and reported as it is, the shortfall named; no constant is changed after the held-out scoring without an
  amendment and a new held-out set.
- Unchanged by construction and checked: the states (the conformance digests; test/conformance.e2e.mjs --reproduce),
  the fit (its residuals and elements), the rigor fast tier.

## 6 Not done

No tuning on held-out windows; no per-object constants; no per-day constants (the shape over days is M1's tau, a
model parameter chosen on validation); no window dropped after scoring (a window is excluded only for the harness's
stated reasons: no reference states in the scored span, or a fit the module refuses, both counted in the report).

## Amendment A1 (2026-10-25, before any candidate is fitted or any window scored)

Section 2 requires that no window be in two sets, but its held-out-by-object rows ("every date") and its
held-out-by-time row (the experiment windows, every object) both take the experiment windows of LAGEOS-1 and Stella.
Those windows belong to the held-out-by-time set only. The held-out-by-object set is LAGEOS-1 (every 9 days) and
Stella (every second NSGF arc) on the dates of the fit and validation sets, 2025-11-01 to 2026-08-31; they are reported
as two rows, held-out by object and held-out by time. Nothing else changes.

## Amendment A2 (2026-10-25, after the fit and validation sets, before any held-out window is scored)

M2's factor k, as section 3 defines it, comes out near 40 on every window: the fit residuals are sampled every one to
two minutes and their along-track lag-1 autocorrelation is about 0.997, so the sum runs to the 20-lag cap. With k that
large the fit likelihood is worse than M1's in every regime (SGP4XP, drag: negative log-likelihood -72241 for M1 + M2
at tau 2 days against -83031 for M1), and M3, registered only on top of M2, could not be judged on its own. The
candidates therefore also include M1 + M3 (M1's tau grid by M3's beta grid, no M2), chosen by the same rule of
section 4 with M1 + M3 ranked between M1 and M1 + M2 in the order of parameters. Nothing else changes; no held-out
window has been scored.
