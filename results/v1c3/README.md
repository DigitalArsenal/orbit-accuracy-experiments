# V1c3 — calibration in progress

Registration `5e1be5ef06815647e8e8a10c96a58a536b353105` remains frozen.
August training selected **SGP4 F-coverage: 14/24 realistic cells**.
The selection and all factors were pushed at `e51a3ec` before FFM training.
August FFM-1 training (seeded from that SGP4 selection) then selected
**FFM-1 coverage: 10/24 realistic cells** (none 1, scalar-mle 2, axes-mle 2).
Both selections and all fitted factors are committed and pushed before the
frozen September test is read.

The coordinator resumed this experiment on 2026-10-23: native AOT applies
to artifacts executed in node flows. V1c3 retains V1c2’s exact artifacts and
execution path. The inherited FFM AOT incompatibility is a known defect
owned by `ffm-memory-measured-sizing-20261022`, not an experiment blocker.
See [runtime evidence](runtime-compatibility.json).
