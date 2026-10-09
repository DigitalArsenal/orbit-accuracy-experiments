# V1 — HPOP against real orbits

Verification plan, written before the first run. Status: **frozen at the
commit that adds it**. A deviation is recorded under Amendments.

## 1. Why

Parts of `propagator/hpop` were ported from TudatPy and Basilisk: its
integrators and force models (`lib/integrators.*`, `lib/force_models.*`, "Phase
11: Astrodynamics Framework (Basilisk + TudatPy Port)"). Their existing
evidence is uneven:

| Evidence | Authority | Strength |
| --- | --- | --- |
| `tests/tudat_wasm_derived.test.mjs`, two-body | Tudat state histories, 0.5 m | Adequate, but Tudat is not an authority for a closed-form case |
| `tests/tudat_wasm_derived.test.mjs`, "high fidelity" | Tudat, within 60 km and 50 m/s | Too loose to detect a wrong force model |
| `tests/zonal_crossvalidation.*` | Three independent zonal implementations | Strong, zonals only |
| `tests/de440_force.*` | DE440 third-body forces evaluated independently | Strong, one force at a time |
| `tests/drag_atmosphere.test.mjs` | NRLMSISE-00 canonical table, US76 | Strong, density only |
| `analysis/gp-error-model/docs/hpop-calibration-2026-08.md` | Reference orbits, resident model | Real orbits, but one fixed force model |

Nothing tests the assembled force model against a real orbit force by force.
V1 does that, using only our modules. The real orbits are the authority, so
the result does not depend on Tudat being right. tudat-wasm is not used.

## 2. Method

Every computation runs in a module: `analysis/reference-states` output for the
precise orbits (GCRF, UTC), `foundation/time` for UTC → TDB, and
`propagator/hpop` for propagation. The harness subtracts two GCRF positions
and takes the norm.

**Seeds and horizons.** HPOP is seeded with a precise-orbit state (position
and velocity) and propagated to later epochs of the same precise orbit, at 1,
6, 12, 24, 48 and 72 hours.

| Objects | Product | Seeds |
| --- | --- | --- |
| LAGEOS-1, LAGEOS-2, ETALON-1, ETALON-2 | ILRS combined weekly arcs (2 min), weeks ending 2026-08-08 and 2026-08-15 | Each arc's first epoch, and 72 h later |
| GPS (all in the products) | IGS final orbits (15 min), 2026-08-02 to 2026-08-15 | 2026-08-02, 08-06 and 08-10, at the first epoch of the day |

**Force configurations.** HPOP offers two paths, and neither carries tesseral
gravity together with third bodies (the execution profile refuses tesserals
without Earth orientation data; the resident model has no Sun or Moon). Both
are run:

| ID | Path | Forces |
| --- | --- | --- |
| E-a | Execution | Point mass |
| E-b | Execution | + zonal harmonics to degree 20 (order 0) |
| E-c | Execution | + Sun and Moon from DE440 (the 2026 excerpt in `files/orbit-products`) |
| E-d | Execution | + cannonball radiation pressure with conical shadow |
| R-20 | Resident | Point mass + 20 × 20 field in Earth-fixed axes |

Physical parameters for radiation pressure: LAGEOS-1 406.965 kg, LAGEOS-2
405.38 kg, both 0.60 m diameter; ETALON 1415 kg, 1.294 m diameter (ILRS
satellite information); Cr 1.13 for LAGEOS and 1.2 for ETALON, nominal values
that are not fitted. GPS uses a nominal 1500 kg, 20 m² and Cr 1.3. A
cannonball cannot represent a GPS satellite, so GPS radiation-pressure
results are descriptive only.

Integrator: RK78, tolerance 1e-13, maximum step 300 s (execution path). The
resident path uses its fixed integrator.

## 3. Criteria

Fixed now, before any run:

1. **Two-body closed form (V1.1).** From a LAGEOS-1 state, point mass only,
   five Kepler periods (T = 2π √(a³/μ), with a from the vis-viva relation and
   μ = 398600.4418 km³/s²): the position returns to the start within 1 m.
2. **Each force helps (V1.2).** For every SLR seed: E-b < E-a and E-c < E-b
   at 24 h, and E-d < E-c at 72 h. Radiation pressure on these spheres is
   about 4e-9 m/s²: tens of metres in a day, under the periodic errors of the
   missing tesserals, but over a hundred metres by 72 h. For every GPS seed:
   E-b < E-a and E-c < E-b at 24 h.
3. **Tesserals help (V1.3).** At 24 h, R-20 < E-b for every GPS seed. GPS
   orbits are in 2:1 resonance with the Earth's rotation, so a missing or
   misaligned tesseral field shows there first.
4. **Magnitude (V1.4).** With the most complete execution model, E-d, the
   median 24 h error over SLR seeds is below 500 m. This is generous: what E-d
   still lacks (tesserals, tides, relativity) is periodic at LAGEOS and
   ETALON altitude, of order a hundred metres.

Every criterion is reported pass or fail with its numbers. A failure is a
finding about the module, reported to its owners, not a reason to change the
criteria.

## 4. What V1 does not show

- Accuracy of a configuration that combines tesserals with third bodies; HPOP
  has none.
- Drag: none of these orbits is low enough. Drag is covered by
  `tests/drag_atmosphere.test.mjs` against published tables, not by a real
  orbit here.
- GPS radiation pressure beyond a cannonball.

## Amendments

Recorded after the first run, `v1-hpop-physical-truth-run-20261008T155943Z`
(`--quick`, HPOP artifact `a7375613…`). The criteria above are unchanged.

**A1. The module changed; V1 is rerun on the new artifact.** The first run
found that E-b equalled E-a to the metre: `SPHERICAL_HARMONICS` without the J
flags evaluated the point mass alone. That and three other HPOP faults were
fixed in the HPOP lockdown of 2026-10-08, against Orekit 13.1 (see
`propagator/hpop/tests/orekit_reference.test.mjs`): the field's column
recursion and the sign of its tesseral y term, and a clock on single
Julian-date doubles. `SPHERICAL_HARMONICS` with degree 20 and order 0 is now
the EGM2008 zonal field to degree 20 in Earth-fixed axes. Each run's manifest
records the artifact it used.

**A2. The radiation-pressure premise in criterion 2 was wrong.** The
acceleration is right (about 4e-9 m/s^2 on LAGEOS), but its effect is not
"over a hundred metres by 72 h". Most of it is periodic, with an amplitude
of order a/n^2, about 2 cm at LAGEOS; the secular part changes the
eccentricity by about 1e-7 a day, about a metre. E-d and E-c therefore differ
by metres while the configurations without tesserals are tens of kilometres
off, so "E-d < E-c at 72 h" cannot be resolved here and decides nothing. It
is still evaluated and reported.

**A3. A configuration with every modelled force, descriptive only.** HPOP's
execution path now takes Earth orientation data (its `earth_orientation`
input), so it can carry tesserals together with the Sun, Moon and radiation
pressure, which section 2 said it could not. E-e adds it:

| ID | Path | Forces |
| --- | --- | --- |
| E-e | Execution | 20 x 20 EGM2008 field in ITRF + Sun and Moon + cannonball radiation pressure, with IERS EOP C04 |

The EOP rows are the IERS EOP C04 file in `reference-states/products`, read
by `data-source/eop-parser`. E-e enters no criterion; it is reported beside
the others.

**A4 (2026-10-08, after the SDS 1.240.0 additions). The IERS 2010 forces,
descriptive only.** HPOP now carries the IERS 2010 solid Earth tides (section
6.2, steps 1 and 2) and the relativistic terms of eq. 10.12 (Schwarzschild,
Lense-Thirring and de Sitter), both checked against Orekit 13.1. E-f is E-e
with both:

| ID | Path | Forces |
| --- | --- | --- |
| E-f | Execution | E-e + IERS 2010 solid tides + IERS 2010 relativity |

E-f enters no criterion. From this amendment the Earth orientation travels
in the PRW `EARTH_ORIENTATION` arm (SDS 1.240.0) instead of a bare `$EOP`
stream, with the same rows.
