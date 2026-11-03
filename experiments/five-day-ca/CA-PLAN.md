# CA reach geometry — 2026-11-03

Report-only disk integration through the pinned conjunction-assessment module
in lib/ca-reach.mjs. Before archive-based CA calls, freeze this geometry:
90-degree crossing, common R axis and opposite transverse velocities, R/T
plane (the N direction is omitted as the task defines). Each member's T
projects by cos(45 degrees). Fit covariance is diagonal with window RMS
R and T squared, not a calibrated forecast covariance. Sum independent
members' projected covariances. Fit x fit uses two copies of the window.
GP covariance is the model's clipped packed 6x6 covariance (km units),
retaining the R/T off-diagonal. Apply scaleFactors to each axis only when
label is CALIBRATED. Age at the lead endpoint enters (lo, hi], so day 5
uses (3,5]. Report missing altitude mapping, invalid covariance and module
refusals as exclusions. No guessed group-average altitude for LS or DO.
For other groups use registered bands: P/T below 450 km, S1 600–800 km,
GN 10000–30000 km, GD 2000–10000 km, IG/GE 30000–40000 km, HE/HX eccentric.

Report zero-miss ceiling at HBR 10,20,50,100 m and fractions >=1e-4, >=1e-5.
Report Alfano maximum separately at zero miss (a supremum of one); this is
not a fixed-covariance ceiling. No synthetic encounter score can be inferred
from these RMS covariances. A separate encounter stage requires real error
vectors and the registered carried covariance, including C3 history terms.

## Altitude mapping amendment — before archive CA integration

LS/DO mappings are supplied by gp-error-model calibrate_covariance's
osculating-state classifier, using the last permitted truth state at or
before each existing window cutoff and the GP model's exact regime bounds.
An identity factor is only transport for that classifier; its covariance is
not used in CA. No model is fitted. Input hashes and per-window regime labels
stay in the archive. Windows lacking a permitted state remain excluded.
