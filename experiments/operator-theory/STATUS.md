# Registered work status

Audited 2026-11-03. Store paths below are relative to `/opt/data/sdn-archive/operator-theory`; result paths are relative to `results/`. Existing rows are evidence of a run, not a new execution or an assurance that continuing captures are final.

| Registration | Run in store | Table in results |
|---|---|---|
| PLAN.md | `forward/rows*.jsonl`; interim tables in store; collection ends November 15 | No standalone forward table; provider aggregates in `ap-truth/compare/cells.json` |
| VENDORS.md | `vendors/forward`; continuing collection | Provider aggregates in `ap-truth/compare/cells.json` |
| BACKTEST.md | `backtest/rows-*.jsonl`; interim tables in store | No standalone table |
| CONFIRM.md | `confirm/rows-*.jsonl`; interim tables in store | No standalone table |
| CHEAPER.md | `cheaper/forward`: 19,399 pairs, all seven registered arms represented; 54 registered cycle directories | `operator-theory/cheaper/table.{md,json}` and README; all eligible claims pass; geodetic report only |
| AP.md T | `ap/truth`: 944 windows | `ap-truth/table-t.{md,json}` |
| AP.md L/H | `ap/laser/forward`: 19,399 pairs | `ap-truth/table-l.md` |
| AP.md S | `ap/starlink`: stored rows | No standalone table; no new Starlink input read in this audit |
| AP2.md | `ap/truth2`: 1,812 windows | `ap-truth/table-t2.{md,json}` |
| AP3.md | `ap/apf/rows-*.jsonl` | `ap-truth/table-apf.{md,json}`: 19,399 pairs; low fails, navigation passes |
| AP4.md T/N/L | `ap/b040/truth` (944), `truth2` (1,812), `laser/forward` (19,399) | `ap-truth/table-{t,t2,l}-040.{md,json}` |
| AP4.md S | No dedicated b040 Starlink store found | No standalone table; current owner bar prevents another run |
| AP5.md | `ap/b040/compare-truth` (944), `compare-truth2` (1,812; 12 excluded for missing issued weather) | `ap-truth/compare/truth.{md,json}` |
| AP6.md | `ap/b040/regimes`: 426 windows; 12 excluded for no lead bin | `ap-truth/compare/regimes.{md,json}` |
| AP6.md HX addition | `regimes-hx`: all 19 windows (12 THEMIS, 7 Chandra), also present in `regimes`; AP/XP/S/F 72 h in all 19 and 168 h in all 7 Chandra windows | Ten HX cells in `ap-truth/compare/regimes.json`; table present |
| COMPARE.md SGP4/cost | `laser-sgp4` (7,404), `laser-sgp4-72` (7,404), `laser-sgp4-high` (11,995), `compare-costs` (41 including warm-up) under `ap/b040` | `ap-truth/compare/table.{md,json}` |
| COMPARE.md Space Force XP | `ussf-truth` (944), `ussf-truth2` (1,812), `ussf-regimes` (426, including HX), `ussf-laser` (19,399), `ussf-providers` (2,856) under `ap/b040` | `ap-truth/compare/xp-versions.{md,json}` |
| COMPARE.md providers/examples/sigma | `providers` (2,250); `compare-examples`, `compare-examples-full`, `compare-examples-providers`, `compare-examples-regimes` contain 32, 50, 6, 11 JSON artifacts | `ap-truth/compare/{cells,sigma}.json`; raw examples stay in store |
| GEO-TRUTH.md W | `ap/b040/regimes-wa` (84 windows) and `ussf-regimes-wa` (84), run without an atmosphere as amended before any window was scored | `ap-truth/geo/geo-truth.{md,json}` and README |
| GEO-TRUTH.md F | `ap/b040/geo-files/rows.jsonl`: Galaxy 30 files of 10-26 and 10-29 with AP, XP, U, S, F and the operator; SES-15 and later files wait for the broadcast to reach them | `ap-truth/geo/geo-truth.{md,json}` |
| GEO-TRUTH.md maneuvers | `geo-burns.mjs` on the WAAS broadcast and on the BeiDou and QZSS precise orbits | `ap-truth/geo/burns-{waas,beidou}.json` |

CHEAPER and HX already ran; neither needs duplicate fits. CHEAPER's full-FFM interval upper bounds at 72/168 h are 0/0.003 km for M40 (limits 0.020/0.100), 0.029/0.385 for M20 (0.050/0.500), and 0/0 for H20 navigation (0.005/0.020). The old integrator loses by 2.003 km [1.882, 2.114] at 168 h. These are stored registered results, not new measurements.

GEO-TRUTH.md is complete as registered (commit 086cc9f); its results are in `results/ap-truth/geo`.

Next: GEO-TRUTH.md part F is rerun as the broadcast reaches the newer Intelsat and SES files.