# SDN-AP 0.7.3 Unified Benchmark & Conjunction Rollup (Amendment 5)

Aggregate-only public results for the unified `SDN-AP 0.7.3` release stack (`propagator/sdn-ap 0.7.3`, `flows/catalog-builder 0.2.5`, `analysis/gp-error-model 0.19.1`, `analysis/conjunction-assessment 0.19.1`, modules commit `1d2cb6da1ad820a8a619771833c10d238673622f`). No per-object rows, NORAD IDs, or private records are included.

## Included Results

| File | Summary |
| --- | --- |
| `wave1-0.7.3.json` | Idle-box Node + headless Chromium speed & memory (`100k` catalog mixes, 4-worker pool, `20 x 7d` AP, 50 high-e). |
| `table-0.7.3.json`, `replay-full-0.7.3.json`, `sgp4-public-sets-0.7.3.json`, `recount-0.7.3.json`, `allarms-xp-0.7.3.json`, `public-only-0.7.3.json` | 9-class headline orbit accuracy suite (including all 11 HEO windows) and bit-for-bit public WASM replay proof (`9,986 / 9,986` calls, `0` diffs). |
| `public-only-tests-0.7.3.{json,jsonl}` | `2,188` public-element-only fits (`2,045` in aggregates): Day 5 losses `>= 1 km` cut from `216` to `103` (`5.2%`), strong-drag losses cut `-55.4%` (`204 -> 91`), Day 5 median `2,069.7 m` vs SGP4 `2,604.7 m`. |
| `confirmation-0.7.3.json` | Covariance realism confirmation across `1,246` forecasts / `11,144` scored states / `130` satellites (`80` independent): `100%` 6-D PD, `200/200` public parity; GEO 24 h `cov95 = 98.9%` (`f3 = 100%`), GNSS MEO 72 h `cov95 = 95.7%` (`f3 = 99.4%`). |
| `amendment5-starlink-11k.json` | `11,194` common Starlinks (`0` fallbacks): SDN-AP beats both SGP4 and SGP4-XP on median and p95 across all four 6-hour spans (`12–18 h` median `331.8 m`, `p95` `2,535.3 m` vs XP `4,197.9 m`; `18–24 h` median `1,089.4 m`, `p95` `8,689.2 m` vs XP `11,006.7 m`). |
| `amendment5-alerts-3arm.json` | Unseen week (`928,174` encounters, 200 miss / 40 Pc paired cluster bootstrap replicates, Student-t Foster 2-D Pc): at 1-day SGP4 `1 km` matched recall (`allButStarlinkPairs`), `-26.9%` fewer miss alerts (`6,914` vs `9,452`, `-12.1%` vs XP), `-99.7%` at `90%` recall (`-38.4%` vs XP), `-99.8%` at `95%` recall (`-48.3%` vs XP), `-35.4%` fewer missed real `< 1 km` passes at fixed `1 km`; `-61.0%` fewer matched-safety Student-t Pc alerts (`4,973` vs `12,738`, `-21.7%` vs XP), PR-AUC `0.2746` vs SGP4 `0.1338`. |
| `multiday-live-cdm-0.7.3.json` | Ten-day (`2026-11-16..25`) live Space-Track public CDMs (`2,362` CDMs, `164` scored events): median `|miss error|` `257.3 m` SDN-AP vs `371.8 m` SGP4-XP vs `423.8 m` SGP4 (`66.5%` closer than both). |
| `live-ca-screen-0.7.3.json` | Live 5-day whole-catalog 3-arm screen (`32,973` objects, `2026-11-24T17:00Z`, `32,968` native `$OCM` covariances): `336,077` SDN-AP vs `437,396` SGP4-XP (`-23.2%`) vs `615,718` SGP4 (`-45.4%`), plus 57-event live CDM check (`289.1 m` vs `499.3 m` XP vs `540.0 m` SGP4; `68.4%` closer than SGP4) and `11,195`-satellite next-day unseen Starlink check (`6–12 h` med `105.8 m`, `12–18 h` `307.6 m`, `18–24 h` `503.3 m`). |
