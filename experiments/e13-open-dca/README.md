# E13 — An open DCA from fleet drag

[PLAN.md](PLAN.md) is the plan; Part R (the Planet × Swarm / GRACE-FO retrospective) is frozen, Part S (Starlink) is a design.

- `collect.mjs` — the Starlink collector (Part S): `nohup node experiments/e13-open-dca/collect.mjs &`; its store, pid file, log and stop file are under `/opt/data/sdn-archive/e13-open-dca/`.
- `steps/` — 05 Starlink sample, 06 estimator evidence, 07 Planet sample, 10 Planet arcs.
- `vendor/` — the E4 A6 ephemeris fitter (`ephemeris-fit.mjs`, `frames.mjs`, `full-force.mjs`), copied from branch `task/e4-a4-full-force-20261009` at 70484b2 with the starlink-forecast lane's patch. **It switches to `harness/` once E4 A5/A6 lands on main**; keep the two in step until then.
- `analysis/density-calibration` 0.3.0 (`energy`, `drag_work`) is in space-data-network-modules, branch `task/e13-orbital-energy-20261010`; `config.json` `inputs.energyModules` points at its checkout.
- Planet's states are CC BY-NC 4.0: derived results only; the states are never committed or published.
