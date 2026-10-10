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
| `data/` | Inputs published for checking where their terms allow it: each `data/<id>/SOURCES.md` lists them, [docs/data-licenses.md](docs/data-licenses.md) has every source's terms and attribution |

## Experiments

| ID | Question | Status |
| --- | --- | --- |
| [V1](experiments/v1-hpop-physical-truth/PLAN.md) | How close does HPOP, seeded from a precise orbit, stay to it over three days, force model by force model? | Reported ([results](results/v1/README.md)): SLR spheres 4.78 m median at 24 h and 13.9 m at 72 h with every force (E-f); GPS 28.5 m at 24 h with a cannonball model. |
| [E1](experiments/e1-gps-epoch/PLAN.md) | Can a GPS element set's state at epoch be corrected, with an honest uncertainty, from information available at publication? | Reported ([results](results/e1/README.md)): correction at epoch cuts the GPS element-set 3D RMS from 2.04 km to 0.79 km (R = 61 % [53, 67]); it does not carry to an unseen orbital plane (6 %), and its covariance fails the coverage gate |
| [E2](experiments/e2-catalog-covariance/PLAN.md) | Can catalog history (and E1's corrected element sets) give VCM-equivalent products — state, B/BDOT/AGOM and a covariance that stays realistic when propagated? | Reported ([results](results/e2/README.md)): the batch fit (F2, 3-day span) gives realistic GPS covariance at 0–1 day (mean d²/3 1.2 and 1.05) and fails at 3 days, driven by two satellites with likely unflagged maneuvers; ten catalog-history covariance variants compared |
| [E2b](experiments/e2b-correlated-covariance/PLAN.md) | Are consecutive element sets' errors correlated, do covariance products that model it stay realistic, how do the literature baselines (Osweiler, Thompson et al., Geul et al., Verhaeghe et al.) score, and what does covariance intersection do with one provider's sets? | Reported ([results](results/e2b/README.md)): consecutive sets' along-track errors are correlated at 0.61–1.00 (train, every regime; E2's independence correction is never positive definite); the measured covariance beats E2's best variant on 1-day energy score in GPS, LEO-POD and SLR-LEO but is consistent only in SLR at some horizons; the literature baselines are overconfident (mean d²/3 from about 10 to 10⁷); covariance intersection collapses onto one set (CI/SEL 0.90–1.00) while naive fusion is overconfident |
| [E3](experiments/e3-combined-catalog/PLAN.md) | How accurate is a catalog combined from several public sources, against precise orbits, and where does combining stop helping? | Reported ([results](results/e3/README.md)): in GPS, selection across sources gives 3.5 cm at issue and 30 m / 104 m / 336 m median at 1 / 3 / 7 days; elsewhere only Space-Track is scorable (0.3–1.2 km median) |
| [E4](experiments/e4-operator-ephemeris-parity/PLAN.md) | How closely do products built only from public catalog data match each operator's published ephemeris and its covariance, and where truth exists, which is closer to it? | Reported ([results](results/e4/README.md)): public-data products sit 0.6–5 km from operator ephemerides at their first horizon (Starlink 2.9 km, GPS/GLONASS ~1.2 km, Planet 0.6 km); operators' own predictions are ~0.1 m from truth for GPS/GLONASS |
| [E5](experiments/e5-density-calibration/PLAN.md) | How much of HASDM's density accuracy can a temperature calibration built only from public densities recover (a stand-in for the Dynamic Calibration of the Atmosphere), and does it improve 1–7-day LEO propagation? | Reported ([results](results/e5/README.md)): on held-out satellites the calibrated JB2008 cuts the spread of ln(observed/model) from 0.155 to 0.056 (−64 % [57, 70]); the forecast keeps 9 % [2, 18] for a day, then nothing; 3-day propagation is not improved (median ratio 1.04 [0.96, 1.10]). Against HASDM (CHAMP, GRACE-A, 2003 and 2008): JB2008 0.148, the one-satellite stand-in 0.112, HASDM 0.078. |
| [E6](experiments/e6-public-observations/PLAN.md) | Can public observations (SatNOGS Doppler, amateur optical; ILRS laser ranging as the anchor) make an element-set catalog more accurate than OMM + SGP4? | Reported ([results](results/e6/README.md)): laser ranges anchor full-force HPOP fits at 7 m (0 d) to 42 m (7 d) against SGP4's 0.47–0.69 km (ratio 0.015–0.061); SatNOGS Doppler from waterfall images makes the ISS worse than SGP4 (2.7–10.7×; per-pass frequency bias, drift and timing lag); too few amateur optical lines of truth objects (18) to fit |

Sources for a high-accuracy catalog from public and login-only data — access, terms, latency and contribution — are inventoried in [docs/hac-sources.md](docs/hac-sources.md).

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

MIT for the code and the results ([LICENSE](LICENSE)). Third-party data stays
under its sources' terms: [docs/data-licenses.md](docs/data-licenses.md) quotes
each source's terms, says whether this repository may reproduce it (in `data/`,
as a release asset, on the site) and gives the attribution it asks for. Results
use every source an experiment read, whatever its licence; a source whose terms
do not allow redistribution is cited by URL and SHA-256 instead. The
SatNOGS-derived files in `data/e6/` are CC BY-SA 4.0.
`site/dist/provenance.json` lists each site file's source and terms.
