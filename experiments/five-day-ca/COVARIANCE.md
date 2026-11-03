# Carried covariance and paired encounter execution

Registered 2026-11-03 under coordinator resume note 5, before these products
are flown or scored. The geometry, 20,000 draws per group/arc, 10–5,000 m
true-miss support, HBR 20 m and Pc 1e-4 alert rule remain ENCOUNTERS.md's.
All arms use the same primary/secondary windows and draws; a missing arm is
counted and never substituted. No fit or covariance constant is calibrated.

Preserve AP 0.4.0 fits and states. Replace only the fitted OMM's four process
noise coefficients with the shipped AP 0.4.1 table from modules commit
8b0f5c7e9 (covariance-config.json pins the source and exact coefficients),
using the OMM's module-issued SDNAP_COV_REGIME; preserve its noise start epoch.
The original module carries that covariance with its original forces and
weather. Label AP UNVERIFIED. XP uses its own carried covariance multiplied
by C2 fairness k_e, plus the frozen diagonal RTN floors: R1 for perigee below
600 km, LP elsewhere (LP is the frozen M0 fairness arm). Label transfers.

FFM uses its saved fit posterior, scaled by max(1, reduced chi-square), and
its original force settings and weather. Sample the module's STM at the
cutoff, 600-second step ends, and every lead endpoint. gp-error-model supplies
white-noise and density responses; no JavaScript dynamics. Compose C2's A,
U_R/U_T/U_N and D_tau terms. Extend the stationary daily density covariance
and its frozen tau to seven days; this is extrapolation beyond C2's three-day
calibration, not a refit. Classes by the module's altitude regime: below
600 km R1-O; 600–2,000 km R2-O; above 2,000 km R3. Eccentric cases use R3 as
an explicitly unvalidated transfer. The same classification maps S1 to R2-O.

For R2-O and R3 apply C3-small's frozen a0/a1/n0, using the same-object,
same-arc, same-lead forecasts already available before the cutoff. Retain
its 90-day lookback and minimum three-day separation. The chi-square
reference is the median of at least five available prior fits, otherwise
the frozen class median. History requires both fit and truth publication
availability under C3's NSGF/ILRSA/ESA rules; absent publication metadata
means no eligible history. Empty history gives u=0 under C3's specified
penalty, and is counted. Never read C2 rows or the held-out populations.
The log-hour extrapolation at days 4, 5 and 7 is labeled.

S uses its signed module error and RMS stand-in. GP uses only a public SGP4
set whose epoch and creation precede the cutoff, propagated only on SGP4;
the covariance uses the actual set age and the frozen GP error model with
its calibrated scale factors. Missing sets, ages beyond the model, refused
covariance, and absent truth are counted exclusions, not zero Pc.

Report missed and false alerts with both event and conditional denominators,
Brier and un-clipped log loss by day, every arm and every pair of arms.
Paired score differences use identical draws. Bootstrap 10,000 times over
primary-window ISO-week clusters, preserving paired scores; state that this
interval does not model additional dependence through secondary windows.
This artificial encounter population cannot establish operational rates.
