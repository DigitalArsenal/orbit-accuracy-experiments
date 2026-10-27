# FFM physical-fit and covariance-validation amendment

This is a new arm, not a replacement for completed census results. Three
recorded failure classes were reproduced exactly before registration: a
positive definite mixed-unit covariance rejected by global-scale validation,
a negative fitted drag coefficient refused by the force model, and a fit that
did not converge. Preserve every original success and failure.

Use FFM 2.0.1, commit 5746b0f53504d4d8a83c4ec7921f4a34b85901a6. Its
dimensionless covariance validation passed the independent closed-form
propagation and invalid-input checks in browser and pinned WasmEdge 0.16.4.
All other modules and all original reference arcs remain on the frozen census
revision. No covariance regularization or surrogate variance is introduced.

Set the existing native estimator's lower bounds for Cd*A/m and Cr*A/m to
zero, with no upper bound, and enable its native Levenberg-Marquardt damping.
These parameters describe nonnegative physical area/mass coefficients. Keep
the same initial state, priors, observations, sigma editing, force terms,
integration tolerance and 0.01 convergence criterion. Raise the maximum
iterations from 10 to 50; extra computation is acceptable to achieve the same
convergence requirement. Both fitting rounds must finish successfully. A
nonconverged fit or an earlier-round fallback remains a failure.

Evaluate every originally admitted arc, including prior successes, to avoid
conditioning the comparison on failure recovery. Retain all other catalog
entries with their original coverage/format status. No spacecraft cap,
per-object timeout or changed epoch selection. Four fresh workers isolate
native state. A transport failure remains an incomplete execution, never a
numerical success. Preflight selects the first available object in each
lineage and each prior failure class using metadata only; all proceed to the
complete population when execution is verified.

Accuracy uses the original 1/3/7-day sampling and source/evidence strata,
object-cluster bootstrap (2,000 resamples, 95% interval), and common-support
comparisons. Covariance calibration uses the separately registered original
chi-square and coverage criteria; it cannot pass from lower position error.
Record native bound status, formal covariance, fit convergence, rejected
observations and every failure. Active constraints change the estimator's
distribution; formal covariance is not asserted to be calibrated Gaussian
uncertainty. Operator reconstructions remain a distinct reference class.
Assumed reference uncertainty is disclosed, not promoted to measured truth.

The complete frozen archive and current direct-feed reconciliation are
different denominators. This arm corrects a demonstrated numerical limitation
on already admitted arcs; normalization and comparisons for newly available
direct-feed objects continue separately. Shared-host runtime is descriptive;
no performance superiority claim is permitted from this run.
