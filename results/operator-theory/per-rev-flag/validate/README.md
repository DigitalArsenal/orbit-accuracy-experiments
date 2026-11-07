# Rule (b): validation

Registered in `experiments/operator-theory/PER-REV-FLAG.md` (amendment of 2026-11-06) with k = 10, the 0.2 m no-verdict line and N = 6 fixed before any row. Overall: **fails**.

| Part | Measured | Pass line | Result |
| --- | --- | --- | --- |
| Known burns (Sentinel-1) | 11 of 26 detected | 25 of 26 | FAIL |
| Injected 2 m, Sentinel-1 | 36 of 40 (0.9), no verdict 0 | reported | - |
| Injected 3 m, Sentinel-1 | 38 of 40 (0.95), no verdict 0 | 95 % | pass |
| Injected 4 m, Sentinel-1 | 38 of 40 (0.95), no verdict 0 | 95 % | pass |
| Injected 8 m, Sentinel-1 | 30 of 40 (0.75), no verdict 7 | 95 % | FAIL |
| Injected 2 m, Geostationary (GFZ) | 15 of 40 (0.375), no verdict 9 | reported | - |
| Injected 3 m, Geostationary (GFZ) | 18 of 40 (0.45), no verdict 9 | 95 % | FAIL |
| Injected 4 m, Geostationary (GFZ) | 18 of 40 (0.45), no verdict 12 | 95 % | FAIL |
| Injected 8 m, Geostationary (GFZ) | 18 of 40 (0.45), no verdict 14 | 95 % | FAIL |
| False alarms, quiet windows | 0 of 79 (0); no verdict 0 | 5 % | pass |

Known burns missed: S1|62261|2025-12-10|2025-12-12T18:00 (no step near the burn); S1|62261|2025-12-21|2025-12-23T19:00 (no step near the burn); S1|39634|2026-03-19|2026-03-21T01:06 (no step near the burn); S1|39634|2026-04-08|2026-04-10T16:30 (no step near the burn); S1|39634|2026-04-12|2026-04-14T17:36 (no step near the burn); S1|62261|2026-01-12|2026-01-14T17:36 (no step near the burn); S1|62261|2026-05-10|2026-05-12T16:12 (no step near the burn); S1|39634|2026-01-19|2026-01-21T03:30 (no step near the burn); S1|62261|2026-04-22|2026-04-24T20:18 (no step near the burn); S1|62261|2026-05-13|2026-05-15T19:54 (no step near the burn); S1|62261|2026-05-20|2026-05-22T16:30 (no step near the burn); S1|39634|2026-01-14|2026-01-16T16:30 (no step near the burn); S1|39634|2026-03-22|2026-03-24T16:24 (no step near the burn); S1|39634|2026-05-21|2026-05-23T04:48 (no step near the burn); S1|62261|2026-02-25|2026-02-27T19:48 (no step near the burn).

Injection windows: Sentinel-1 40 of 40 used, geostationary 40 of 128 (not used: {}; {"no truth over the span":85,"coverage":3}).

Quiet windows by group: LS 0 of 24 flagged, 0 no verdict; DO 0 of 15 flagged, 0 no verdict; GD 0 of 40 flagged, 0 no verdict.

