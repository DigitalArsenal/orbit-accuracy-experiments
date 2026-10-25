# V1c4 amendments

`PLAN.md` and `config.json` are frozen at the registration commit and are not edited; amendments are recorded here.

**A1 (2026-10-25): the E2E without the recorded run.** The recorded run of 2026-10-23 (`runs/v1c4-console-covariance-calibration-20261023`:
raw element sets, the refreshed truth, per-sample scores) was ignored, local to the machine and lost when the lane's worktree was removed. Its
refreshed truth was fetched from public servers on 2026-10-23 and its download cache is gone, so a rerun would read products revised since
and would be a new test, not this one. `run.mjs --check` therefore does, when the run is absent, what the committed artifacts allow, and lists
what it could not do as SKIPPED:

- the frozen registration and configuration equal the committed manifest's;
- both selections are in git history, unchanged, ancestors of the head, and pushed before the test started (`manifest.selectionFreeze`);
- each mode's ranking and selection are derived again from the committed cross-validation cells;
- `README.md` and `MODEL.json` are rendered again from the committed metrics, selections and manifest;
- V1c3's published test cells (SGP4 F-coverage 4/24, FFM-1 coverage 3/24) are reproduced from V1c3's recorded run when `SDN_V1C3_RUN_DIR`
  (default `runs/v1c3-console-covariance-calibration-20261023`) holds it.

Not re-derived without the run: the fold cells and final fits from the raw arcs, the test cells and metrics from the per-sample scores, the
event rule for the registered sample of pairs, the provisioning replay of V1c3's training arcs and the inherited covariance controls. With the
run present, `--check` does all of them as `PLAN.md` section 7 says. The published numbers are unchanged by this amendment.
