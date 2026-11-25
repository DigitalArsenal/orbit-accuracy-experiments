# Whole-Catalog 3-Arm Conjunction Assessment & All-Regime Rollup (SDN-AP 0.7.2 vs SGP4 vs SGP4-XP)

Stack issue: `DigitalArsenal/spacedatanetwork-stack#1110` (also integrating `#1059` weekly conjunction-notification reduction and `#1036`/`#1060` public-history strong-drag & Starlink verification).

## Question

Across the full catalog and across every orbital regime and initial-orbit source, how do three operational catalog arms compare on accuracy, live 5-day whole-catalog conjunction screening, Foster 2-D collision probability (`Pc`), real Space-Track CDM alignment, strictly unseen future operator ephemeris truth, and weekly conjunction-notification load?

- **SGP4 (`S`):** Each object's newest public Space-Track GP element set flown on stock SGP4.
- **SDN-AP 0.7.2 (`O` / `Op`):** Genuine `meanElementSource::AP` element sets produced by `flows/catalog-builder 0.2.2/0.2.3` and evaluated on public `propagator/sdn-ap 0.7.2` (zero SGP4 fallbacks).
- **SGP4-XP (`X` / `Xp`):** `SGP4XP` element sets produced on the same inputs by `flows/catalog-builder 0.2.2/0.2.3` and evaluated on `propagator/sdn-ap 0.7.2`.

## Components

1. **All-Regime Accuracy Rollup (`results/ca-rollup-072/all-regimes-summary.json`):**
   - Public-sets-only 8-group precise-orbit suite (`2,188` tests, `2,045` in aggregates, Days 1–5, strict look-ahead verified `2,045/2,045`).
   - Starlink public-history suite (`303` satellites, `0–6`, `6–12`, `12–18`, `18–24 h`, strict look-ahead verified `303/303`, zero SGP4 fallbacks).
   - High-eccentricity orbit (HEO) deep-space suite (`108` tests across 4 satellites, Days 1–5).
   - Strong-drag LEO (SWARM `750` tests + Planet Labs `551` tests across 29 satellites, Days 1–5).
2. **Weekly Conjunction Notification Rollup (`alerts-3arm.mjs` -> `results/ca-rollup-072/phase7-alerts-3arm.json`):**
   - Extends `experiments/alert-reduction/PLAN.md` (`#1059`, Amendments 1–3) to all three arms (`S`, `O`, `X`) plus 100% public-history sensitivities (`Op`, `Xp`) over the registered 1-week whole-catalog encounter set (`2026-11-06` to `2026-11-13`, `32,863` objects, `1,069,553` tier-0 encounters + tier-1 seeds 1–3).
   - Uses `analysis/conjunction-assessment` Foster 2-D `compute_pc` and ESA DISCOS / SATCAT hard-body radii, applying the strict Amendment 3 held-out covariance realism gate (reporting `"not measured"` wherever the gate is not met).
3. **Live 5-Day Whole-Catalog 3-Arm CA Screen (`screen-3arm.mjs` -> `results/ca-rollup-072/phase6-live-3arm-ca.json`):**
   - Full `2026-11-24` public catalog (`32,988` objects, `T0 = 2026-11-24T17:00:00Z`, 5-day horizon `T0` to `T0 + 5 d`).
   - All three arms screened all-vs-all through compiled `analysis/conjunction-assessment` WASM (SGP4 via `sgp4Sources`, SDN-AP 0.7.2 and SGP4-XP via `propagator/sdn-ap 0.7.2` degree-12 Chebyshev `$PPE`/`$PRW`).
   - Exact Foster 2-D `Pc` computed via `analysis/conjunction-assessment` `compute_pc` at NASA (`1e-4`, `1e-5`) and SpaceX (`3e-7`) thresholds using both ESA DISCOS/SATCAT radii and fixed `10 m` HBR, alongside USSF miss-distance thresholds (`1 km` LEO–LEO, `5 km` else).
   - Scored against live `2026-11-24` Space-Track public CDMs (`TCA >= T0`) and strictly unseen future `2026-11-25` SpaceX Starlink ephemeris cycles.

## Publication Rules

- All orbit propagation, frame transformations, conjunction screening, and Foster 2-D `Pc` computations execute inside compiled WASM modules from `space-data-network-modules`.
- Only aggregate counts, medians, percentiles, Wilson / bootstrap intervals, and file digests are committed under `results/ca-rollup-072/`. No per-object rows, element sets, NORAD-with-epoch tables, or private fit-policy internals are published.
