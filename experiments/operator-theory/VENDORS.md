# Every vendor: the same test on all the operators that publish states

Registered 2026-11-01, before any file of these vendors was scored under this test. `lib/vendors.mjs` and this file's changes to `arms.mjs` are part of the registration. Nothing changes for the four sources in `PLAN.md`: their code path is the same and their cycles keep running from the copy they started with.

The owner, 2026-11-01, verbatim: "ALso we should be testing ALL vendors not just SpaceX".

The question, arms, scoring, rules, limits and identification rule are `PLAN.md`'s, per vendor. Vendors are not pooled.

## The vendors

CelesTrak's 16 Supplemental GP groups, plus the systems reachable from the same sources:

| Vendor | Status here | Source and form |
|---|---|---|
| SpaceX Starlink | in `PLAN.md` and `BACKTEST.md` | MEME, 60 s |
| Planet | in `PLAN.md`, 12 of 115 | OEM, 60 s |
| NASA ISS, China Space Station | in `PLAN.md` | OEM |
| GPS, GLONASS, Galileo | added | ESA ultra-rapid orbits (`ESA0OPSULT`), SP3, 5 min, 48 h: 24 h solved from observations, then 24 h of ESA's prediction |
| ILRS prediction centers, each its own vendor | added | CPF files on EDC's anonymous archive, by target and center, read by `data-source/cpf-source` |
| Intelsat | added | IESS-412 eleven-parameter files, evaluated by `files/orbit-products` |
| SES | added | the same |
| OneWeb | cannot be tested | publishes one mean-element row per satellite, no states (`experiments/supgp-omm/sources/unavailable.mjs`) |
| Telesat | cannot be tested | publishes the station-keeping box center, no states |
| EUMETSAT | cannot be tested | publishes element sets, no states |
| Kuiper, Iridium, Orbcomm, AST | cannot be tested | CelesTrak states its sets come from Space-Track. On 2026-11-01 Space-Track's public listing, read with our account, has an empty Kuiper directory, an empty SpaceX directory and no directory for the others |

A vendor that cannot be tested is reported as such, never filled. Its published SupGP sets are still collected on host-02.

## Sources in detail

- **GPS, GLONASS, Galileo:** source names `gps`, `glonass`, `galileo`. A file counts only if it started at least 26 h before the cycle, since it is published about 24 h after its start. NORAD numbers come from the IGS satellite metadata. Whether ESA's file holds Galileo is read from the file; if it holds none, that is reported.
- **CPF:** source names `cpf-<center>`, each split into `-leo` and `-high` at 8,400 km. The newest file dated before the cycle's day. Every target is taken except lunar reflectors and the exclusions below. Of the navigation targets, a fixed draw by SHA-256 of `operator-theory-vendors:<target>`: 8 BeiDou-3, 3 older BeiDou, 4 Galileo, 4 GLONASS, 2 GPS, 4 NavIC, 3 QZSS. Their scale is the reason for the draw, and it can be widened by a dated amendment.
- **Intelsat:** one weekly (`w`) file per satellite. The previous weekly (`x`) file is taken once, as the first older file, so that a first pair exists now.
- **SES:** the listed file per satellite.
- **Planet:** all 115, in this test's store, beside the 12 of `PLAN.md`.

## Settings

As `PLAN.md`, except:

- Above 8,400 km: no drag, FFM's fitted parameter is the solar-pressure area over mass, seed 0.02 m^2/kg, a priori sigma 0.2. The FFM arm is `F-NO-DRAG@a`. No `RFa12`.
- Below 8,400 km on these vendors: drag seed 0.01 m^2/kg, solar-pressure area over mass held at 0.02 m^2/kg.
- `S24` is our SupGP recipe on a 24 h window for all these vendors. CelesTrak's own windows differ for CPF (the whole file), and a whole-file fit is not a prediction.
- Fit and scoring grid: states kept at least 300 s apart.

## What is held out

- C2's held-out objects: TerraSAR-X, Stella, Sentinel-1D, LAGEOS-1, its six Galileo satellites (`results/ffm-covariance-calibration/precheck-P9.json`). COSMIC-2 is not a source here.
- Swarm and GRACE-FO, until E13b scores.
- C2's time hold-out runs from 2026-06-01 to the end of each product it read. Nothing here reads a date before 2026-10-24. C3-small keeps its frozen constants and takes nothing from here, and its rows are not read. E13b's Dove endpoints are not touched: Planet here is the vendor test and no result changes E13b.

## Back-test

CPF and GNSS archives hold earlier issues, so these vendors get pairs now: cycles `cYYYYMMDDT0000` for each day from 2026-10-24 to 2026-11-01, each reading only what `--as-of` allows, weather as issued the day before. Their reference is the newer file's first 3 h, as everywhere. For GNSS that stretch is solved from observations, so it is close to independent truth. For CPF it is the center's own next prediction.

The forward store is `/opt/data/sdn-archive/operator-theory/vendors`, cycles every 12 h until 2026-11-15, from `cycle-vendors.sh`.

Reports are labeled interim until the final table. No arm, fit, bin or rule changes because of an interim table.
