# E13 — An open DCA from fleet drag

[PLAN.md](PLAN.md) is the plan: Part R (the Planet × Swarm / GRACE-FO retrospective) was frozen at `4221f03`; its amendments (R1 the solver, R2 the lag and the definitions the code fixes, S1 the SpaceX measurements) and
Deviation D1 (test A arcs started before the selection was committed, and what was done about it) are at its end. `config.json` is frozen and never edited; the amendments' parameter values are in
[amendments.json](amendments.json), which `common.mjs` merges over it. Results: [../../results/e13/](../../results/e13/).

## Order of work (PLAN sections 7 and 9)

1. `steps/07-planet-sample.mjs` the 68 eligible Doves, 36 calibration and 12 held-out; `steps/10-planet-arcs.mjs --split dev` the drag of every satellite-day through the orbital energy
   (`arcs.mjs`; `analysis/density-calibration` `energy`); `steps/11-arcs-provenance.mjs` the manifest of the arcs; `steps/12-cr-sensitivity.mjs`; `steps/20-density-windows.mjs --split dev`.
2. `steps/40-select.mjs` the solver, the lag and the forecast time constant, on the dev split only, then `results/e13/selection.json` is committed. **A test split opens only then** (`windows.mjs`; `test/e13-windows.test.mjs`).
3. Test A: `10-planet-arcs`, `20-density-windows`, `30-density-score` (H1, H2, H3, H6), `35-propagation` (H4 Swarm, H5 held-out Doves), `50-propagation-score`, `90-report`. Then test B, the same.
4. Part S: `collect.mjs` (the Starlink collector, restarted with the pair mismatch), `steps/60-pairs.mjs`.

## Files

- `arcs.mjs` — one satellite-day: HPOP propagation of a daily state to the next, the mismatch read through the Jacobi energy; `common-mode.mjs` — the fleet's common mode (statistics only); `kappa.mjs` — d ln(rho)/dT;
  `density-truth.mjs`, `score.mjs` — the Swarm / GRACE-FO density windows and the statistics.
- `collect.mjs`, `fleet.mjs`, `head-fit.mjs`, `worker.mjs`, `pool.mjs`, `env.mjs` — the Starlink collector: `nohup node experiments/e13-open-dca/collect.mjs &`; its store, pid file, log and stop file are under
  `/opt/data/sdn-archive/e13-open-dca/`. Raw SpaceX files stay in memory; only derived records are stored.
- `vendor/` — the E4 A6 ephemeris fitter (`ephemeris-fit.mjs`, `frames.mjs`, `full-force.mjs`), copied from branch `task/e4-a4-full-force-20261009` at 70484b2 with the starlink-forecast lane's patch. **It switches to
  `harness/` once E4 A5/A6 lands on main**; keep the two in step until then.
- `analysis/density-calibration` 0.3.0 (`energy`, `drag_work`) is in space-data-network-modules, branch `task/e13-orbital-energy-20261010`; `config.json` `inputs.energyModules` points at its checkout.
- Planet's states are CC BY-NC 4.0: derived results only; the states and the per-satellite-day fits are never committed or published.
