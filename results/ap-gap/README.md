# AP gap diagnosis — blocked

The run stopped after a hold-out isolation violation. The inherited AP6 MGEX selector calls `readReference` for every OEM file on its first day before filtering to BeiDou/QZSS. That call unpacks state records. All six held Galileo files (43567, 37847, 41862, 41174, 43055, 41175) exist in the selected 2025-10-01 directory. Workers reached the fit loop, which follows completion of that selection. Thus those files were decoded in memory. No held object was fitted, scored, printed, or copied into the output rows.

All 12 launched workers and their supervisor were terminated by exact PID. Five LS window rows were written; zero held-object rows were written. Raw partial rows remain under `/opt/data/sdn-archive/operator-theory/ap-gap/ap`; their hashes and counts are in `status.json`. These are interrupted results, not a completed ablation or evidence for a cause. No error ratios were analyzed.

Registration `f64aa7e` and runner `d0807b5` were committed and WIP-pushed before execution. The runner now refuses execution unconditionally pending coordinator disposition. Its replacement MGEX selector excludes the six filenames before reading bytes; it has not been run. The historical shared selector was not changed.

| Acceptance | Measured status |
| --- | --- |
| Registration before ablations | Completed |
| Method 1, AP ablations | 5 LS rows; incomplete; other groups 0 rows |
| Method 2, FFM subtractions | Not run |
| Method 3, GN 24 h fitter | Not run |
| Method 4, HEO and frame | Not run |
| Method 5, DO event split before ratios | Not run; no ratios analyzed |
| Forward day-3 repeat within 0.001 m | Not measured |
| Completed methods | 0 of 5 |
| Held objects scored | 0 |
| E2E | FAIL: isolation violated and coverage incomplete |

Every requested gap remains unresolved. No module change or expected gain is supported by this run. Hansen and frame variants were not built. The prototype FFM arms have not been exercised. Input provenance is incomplete: manifests pin runner/config/AP bytes, but not every source file. The task's rounded reference errors are not substituted for measurements.

No gauntlet or landing was attempted because the E2E fails. No receipt exists for this run. The next step is coordinator disposition of the irreversible hold-out read, then a full input-access audit and guarded rerun under a new manifest. No graph records were changed, no module source was changed, and no site was updated.
