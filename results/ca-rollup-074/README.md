# SDN-AP 0.7.4 / Catalog-Builder 0.2.6 / GP-Error-Model 0.19.2 Unified Evaluation (`ca-rollup-074`)

Single-latest-version aggregate results superseding `ca-rollup-073` across all eight evaluation stages.

## Pinned Module Builds

- `DigitalArsenal/space-data-network-modules`: `d557f9e2d5f7a860320aec40a722d8a8acff5a8a` (includes PR #151 `76139668410a` + PR #153 `kApSlotCacheDefaultBytes = 1,536 MiB` AP LRU fix)
  - `propagator/sdn-ap 0.7.4` signed public WASM: `c5019fac99b302f23eb49d00a6257cbf19947270574da9d76891d06930d655a0` (`1,998,671` B, canonical `fb6097b6281dd89cb984174ded599f95d384fab1319d077884caf4542670826b`)
  - `propagator/sdn-ap 0.7.4` full build (fit + replay reference): `e9900159be5ce75f39ced742d7e4d0acd825f67bc1eeb5bb00e0c2803a458d51`
  - `flows/catalog-builder 0.2.6`: chain `92203eab4274ace68cc38b35b8f10ae8585f28731cc1bac2cb2f6406dcfed12f`, control `33110d5269a5d9ce98a21917eb99205644cdb285c17fd45ed7611a01a55258b1`
  - `analysis/gp-error-model 0.19.2`: `5b2bdc61910c94dfcc0f3eb2d162e4e612f81483404987163cb5390fee30fbb0`
  - `analysis/conjunction-assessment 0.19.1`: `7f4ff2469f7f88ff040562d6031b94084965bdfc69860465a8174ad5adbde906`

## Result Files (Aggregates Only)

| File | Stage | Summary |
| --- | --- | --- |
| `public-only-tests-0.7.4.json` / `.jsonl` | Stage 1 | Public-element-sets-only comparison across 8 orbit groups (`2,188` tests, `2,045` in aggregates; `0` SGP4 fallbacks). |
| `table-0.7.4.json` | Stage 2 | Precise-orbit scoreboard (`2,830` windows across 14 groups). |
| `replay-full-0.7.4.json` | Stage 2 | Bit-exact replay proof: `9,986/9,986` propagating calls identical (`differences: []`) between full build `e9900159be5c` and signed public `c5019fac99b3`. |
| `sgp4-public-sets-0.7.4.json`, `recount-0.7.4.json`, `allarms-xp-0.7.4.json`, `public-only-0.7.4.json` | Stage 2 | Derived paired public-set and all-arms site tables. |
| `confirmation-0.7.4.json` | Stage 3 | 6-regime physical covariance confirmation; all 3 Earth demo regimes (`spheres_750_2000`, `gnss_meo_24h`, `geostationary_24h`) pass days 1–3 with `100%` PD rate. |
| `amendment6-starlink-11k.json` | Stage 4 | Unified `11,194`-satellite Starlink 7-arm accuracy suite (`0` fallbacks). |
| `amendment6-alerts-3arm.json` | Stage 5 | Fresh unseen forward week (`2026-11-17` to `2026-11-24`) matched-safety notification reduction (`1d allButStarlinkPairs r90`: `30,709` SDN-AP vs `9,533,500` SGP4 (`-99.68%`) and `53,132` SGP4-XP (`-42.2%`); `m1d`: `-39.41%` vs SGP4, `-15.47%` vs XP; `ns90`: `-27.52%` vs SGP4; Student-t Foster `Pc` matched recall: `-59.43%` vs SGP4). |
| `multiday-live-cdm-0.7.4.json` | Stage 6 | 10-day live Space-Track public CDM accuracy (`2,362` CDMs, `164` scored all 3 arms: `257.3 m` SDN-AP vs `423.8 m` SGP4, `371.8 m` SGP4-XP). |
| `live-ca-screen-0.7.4.json` | Stage 7 | Live 5-day 3-arm whole-catalog screen (`32,973` objects, `5 km`): `336,156` SDN-AP vs `615,718` SGP4 (`-45.4%`) and `437,396` SGP4-XP (`-23.1%`); `158,286/158,786` (`99.69%`) native SDN-AP covariance (vs `29.7%` in `0.7.3`) with `1,536 MiB` AP LRU / `192 MiB` cov LRU. |
| `wave1-0.7.4.json` | Stage 8 | Runtime speed & WebAssembly memory on idle box: `12.5 ms` Node (`63.6x`) and `19.6 ms` COI Chromium (`42.5x`) prebuilt first frame, `3.648x` 3-thread browser pool, `3.6x` 4-worker wide-grid pool, `103.3–118.2 MB` across 100k-object mixes (`0` unserved), `0` high-eccentricity failures (`3,166` fallback checks). |
