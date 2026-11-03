# AP gap diagnosis

Registered 2026-11-03 before this lane reads any ablation row. AP5/AP6 windows and their prior results were already read; this is exploratory, not confirmation. No hold-outs, operator captures, Starlink groups, C2 rows, or six held Galileo objects are admitted. No module change is delivered here.

Use AP5/AP6 truth, windows, thinning, coverage, weather and forward bins unchanged. Leads count from the end of each fit. Preserve failed and excluded windows. Report paired median forward 3D errors in meters at days 1, 3, 7 with n, and median paired error changes. Never interpret fit residual as forecast accuracy.

Run in order:
1. AP on GD, IG, GE, LS, DO, then HX, HE: baseline (31,20), XP atmosphere only, tesseral 0 and 12, zonal 0, frame correction off, Hansen threshold 0.3/0.5/0.7, forced resonance classes. Isolated internal switches require copies built in scratch; hashes identify every build.
2. FFM baseline and single subtractions: SRP, third bodies, solid tides, degree 20, order 12/31. Unsupported isolated shadow or individual-body switches are reported, never silently substituted.
3. GN 24 h fits, AP and both XP implementations with AGOM fixed at seed and Space Force priors. Use only AP5 GN objects and dates.
4. HEO resonance degree limits and frame arms (0,1), (1,0), on GN/IG/GE.
5. DO event split: before reading error ratios, label windows with duplicate truth epochs from different files disagreeing by over 1 km in the fit or seven-day forecast interval. Missing overlaps are unknown, not quiet.

A subtraction is a candidate explanation if its paired errors approach AP; this alone does not identify a unique cause. Report unresolved gaps explicitly. Proposed gains are exploratory estimates, requiring a module-task E2E on unread windows. Graph task creation is reserved for the coordinator.

Raw rows and input manifests: /opt/data/sdn-archive/operator-theory/ap-gap. Only aggregates in results/ap-gap. Scratch: /Users/tj/software/terrain-work/body-look/codex-apgap-d9. Maximum 12 workers. Stop by 2026-11-03T03:48:49Z; retain and report partial work.

E2E: run the real module on a registered archive window twice; forward day-3 error must be finite and repeat within 0.001 m. Require every registered method and group to have completed or explicit missing status; incomplete coverage is not a full-task pass. Pin registration, runner, inputs, module bytes and aggregate inputs by SHA-256. No acceptance claim may be manufactured from the task's rounded reference numbers.

## Amendment 2026-11-03: coordinator disposition

The inherited MGEX selector decoded all six held Galileo files in memory before filtering. No held object was fitted, scored, printed, or copied into the output rows. The coordinator authorized continuation; the replacement selector filters NORAD filenames before decoding. EXCLUDE_NORADS now also excludes Swarm and GRACE-FO at every date; closed source selection and a name guard exclude every Starlink. Fresh results use resume-* stores; the interrupted five LS rows remain historical.
