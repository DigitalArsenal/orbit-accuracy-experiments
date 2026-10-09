# orbit-accuracy-experiments

Experiments on orbit accuracy and uncertainty, run through the
Space Data Network's WASM modules with the `space-data-module-sdk` harness.
The results are the evidence behind the accuracy claims in the
Evidence-Supported ASO Catalog whitepaper, and behind what the Fast
Conjunction Screening whitepaper says about the states it screens.

## Rules

1. **Modules compute; this repository counts.** Every orbit computation —
   propagation, frames, time scales, errors in RTN — runs in an SDN module
   from `space-data-network-modules`. Code here moves records in and out,
   fits statistical models to the modules' outputs, and computes statistics.
2. **Plan first.** Each experiment has a `PLAN.md` that states its
   hypotheses, data windows, methods, endpoints and decision rules. Its
   `config.json` holds the same numbers for the code. The plan is frozen by a
   commit before its test window is read, and the code refuses the test window
   until then.
3. **Every number has a manifest.** A run writes `runs/<run-id>/manifest.json`:
   command, config hash, commits of this repository and of the modules, each
   module's WASM SHA-256, package versions, runtime, and the SHA-256 of every
   input file. Reports are generated from a run's metrics, never typed.
4. **Element sets stay on this machine.** Space-Track data and per-sample
   tables derived from it live in `runs/` (ignored). Only aggregates,
   manifests and reports are committed, under `results/`.
5. **Failures are results.** A hypothesis that fails is reported with the
   same care as one that passes.

## Layout

| Path | Contents |
| --- | --- |
| `harness/` | Module loading and provenance, record framing, archive and reference readers, statistics |
| `experiments/<id>/` | `PLAN.md`, `config.json`, and numbered steps |
| `test/` | End-to-end checks of the harness against public vectors and the real archive |
| `site/` | The GitHub Pages site: the experiments run live in the browser |
| `runs/` | Run outputs (ignored) |
| `results/` | Committed run summaries |
| `data/` | Operator inputs published for checking, under each provider's terms ([data/e4/SOURCES.md](data/e4/SOURCES.md)) |

## Experiments

| ID | Question | Status |
| --- | --- | --- |
| [V1](experiments/v1-hpop-physical-truth/PLAN.md) | How close does HPOP, seeded from a precise orbit, stay to it over three days, force model by force model? | Reported ([results](results/v1/README.md)): SLR spheres 4.78 m median at 24 h and 13.9 m at 72 h with every force (E-f); GPS 28.5 m at 24 h with a cannonball model. |
| [E1](experiments/e1-gps-epoch/PLAN.md) | Can a GPS element set's state at epoch be corrected, with an honest uncertainty, from information available at publication? | Plan in draft; amendment 2 fixes the primary statistic (5 robust-sigma clipped RMS) before any fit. Harness checks A0.1–A0.4 pass ([report](results/e1/a0/REPORT.md)). Waiting on two years of IGS final orbits. |
| [E2](experiments/e2-catalog-covariance/PLAN.md) | Can catalog history (and E1's corrected element sets) give VCM-equivalent products — state, B/BDOT/AGOM and a covariance that stays realistic when propagated? | Plan in draft; needs SDS 1.240.0 and the train/validation truth. |
| [E3](experiments/e3-combined-catalog/PLAN.md) | How accurate is a catalog combined from several public sources, against precise orbits, and where does combining stop helping? | Reported ([results](results/e3/README.md)): in GPS, selection across sources gives 3.5 cm at issue and 30 m / 104 m / 336 m median at 1 / 3 / 7 days; elsewhere only Space-Track is scorable (0.3–1.2 km median) |
| [E4](experiments/e4-operator-ephemeris-parity/PLAN.md) | How closely do products built only from public catalog data match each operator's published ephemeris and its covariance, and where truth exists, which is closer to it? | Reported ([results](results/e4/README.md)): public-data products sit 0.6–5 km from operator ephemerides at their first horizon (Starlink 2.9 km, GPS/GLONASS ~1.2 km, Planet 0.6 km); operators' own predictions are ~0.1 m from truth for GPS/GLONASS |

The parity target for the high-fidelity products is
[docs/vcm-parity.md](docs/vcm-parity.md): every Vector Covariance Message
field, its PRW carrier, HPOP's implementation and the evidence for it.

## Running

Requirements: Node 22 or later; a `space-data-network-modules` checkout with
built `dist/isomorphic/module.wasm` artifacts; the SDN archive's
`gp_history` and converted reference states.

```sh
npm ci
export SDN_MODULES_ROOT=../../main-packages/space-data-network-modules   # default when this repo sits in the stack
node experiments/e1-gps-epoch/steps/10-baseline.mjs --window a0
npm test
```

Paths default to `config.json` and can be overridden with `--modules`,
`--archive` and `--reference` or the `SDN_MODULES_ROOT`, `SDN_GP_HISTORY`
and `SDN_REFERENCE_STATES` environment variables.

## The site

[digitalarsenal.github.io/orbit-accuracy-experiments](https://digitalarsenal.github.io/orbit-accuracy-experiments/)
runs the modules in the visitor's browser through the same SDK harness, on
a CesiumJS globe: HPOP from any V1 seed (reproducing the committed run bit
for bit), any of the 63 Orekit cases, and a VCM read, propagated with its
covariance and written back. Every file it reads can be downloaded with its
SHA-256. [site/README.md](site/README.md) has the build.

## License

MIT for the code and the results ([LICENSE](LICENSE)). The data the site
publishes stays under its sources' terms (ILRS, IGS, IERS, JPL, Orekit);
`site/dist/provenance.json` lists each file's source and terms.
