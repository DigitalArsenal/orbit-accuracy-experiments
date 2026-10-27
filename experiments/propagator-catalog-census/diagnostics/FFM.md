# Diagnose existing FFM failures

Replay the lexically first recorded example of each existing failure class
using the unchanged census selection, module revision, settings and environment.
Retain all native requests, fit output and the failing request. This stage
diagnoses the failures; it does not replace the full population result or
qualify a modified model. Do not invent covariance or repair a matrix by
clipping eigenvalues. Record physical parameter bounds and mixed-unit matrix
conditioning separately before registering any modified comparison.

Native estimator bounds already exist in the pinned implementation. Any later
use of those bounds is a new experiment arm with the same force configuration,
convergence requirement and reference coverage, never a relabeling of the
unconstrained result as successful.
