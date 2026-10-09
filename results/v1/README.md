# V1 results

The plan is `experiments/v1-hpop-physical-truth/PLAN.md`, with amendments
A1-A3. Runs are listed newest first; each directory holds the generated
report, the run manifest (repository and modules commits, artifact hashes,
input hashes) and the metrics.

## `v1-hpop-physical-truth-run-20261009T004514Z`

Full run on HPOP from space-data-network-modules `750b6399` (samples in one
pass, steps ending on shadow boundaries, JB2008 and Jacchia-Roberts, the IERS
2010 forces; all against Orekit 13.1), with amendment A4: E-f adds the IERS
2010 solid tides and relativity to E-e, and the Earth orientation now
travels in the PRW `EARTH_ORIENTATION` arm (SDS 1.240.0). Every
configuration through E-e reproduces the previous run to the printed digits;
the run took three minutes instead of ten.

| Check | Result |
| --- | --- |
| V1.1 two-body return after five periods | PASS, 0.8 mm (limit 1 m) |
| V1.2 each added force helps | FAIL, 14 violations (as before) |
| V1.3 resident 20x20 beats zonals alone (GPS, 24 h) | FAIL, 43 of 96 seeds (as before) |
| V1.4 E-d median at 24 h over SLR seeds | PASS, 246 m (limit 500 m) |

Median (max) 3D error, m:

| Configuration | SLR 24 h | SLR 72 h | GPS 24 h | GPS 72 h |
| --- | ---: | ---: | ---: | ---: |
| E-e 20x20 in ITRF, Sun, Moon, radiation pressure | 6.23 (15.0) | 18.6 (51.1) | 29.5 (117) | 92.1 (90436) |
| E-f E-e + IERS 2010 tides and relativity | 4.78 (10.2) | 13.9 (30.7) | 28.5 (117) | 91.1 (90434) |

The tides and relativity take a quarter off the SLR error at every horizon
(the worst seed halves at 72 h); for GPS, where a cannonball stands in for
the satellite's radiation pressure, they change the median by 3 %. The
whitepapers quote E-f.

## `v1-hpop-physical-truth-run-20261008T182617Z`

Full run: 16 SLR seeds (LAGEOS-1/2, ETALON-1/2) and 96 GPS seeds, HPOP from
space-data-network-modules `f200ec23` (the lockdown against Orekit 13.1).
Run in two invocations (`--budget 140`, then `--resume`).

| Check | Result |
| --- | --- |
| V1.1 two-body return after five periods | PASS, 0.8 mm (limit 1 m) |
| V1.2 each added force helps | FAIL, 14 violations |
| V1.3 resident 20x20 beats zonals alone (GPS, 24 h) | FAIL, 43 of 96 seeds |
| V1.4 E-d median at 24 h over SLR seeds | PASS, 246 m (limit 500 m) |

Median (max) 3D error at 24 h and 72 h, m:

| Configuration | SLR 24 h | SLR 72 h | GPS 24 h | GPS 72 h |
| --- | ---: | ---: | ---: | ---: |
| E-a point mass | 46209 (395798) | 110208 (1213015) | 25012 (39943) | 74814 (169566) |
| E-b + zonals to 20 | 1281 (2233) | 3376 (8657) | 2090 (6492) | 6043 (93528) |
| E-c + Sun and Moon | 257 (2113) | 677 (6218) | 331 (868) | 983 (89003) |
| E-d + radiation pressure | 246 (2113) | 670 (6217) | 277 (661) | 853 (88970) |
| E-e + 20x20 in ITRF (A3) | 6.2 (15.0) | 18.6 (51.1) | 29.5 (117) | 92.1 (90436) |
| R-20 resident 20x20 | 634 (2125) | 1493 (8242) | 1955 (6039) | 6194 (95028) |

What the failures say:

- **V1.2.** Four of the 14 violations are Sun and Moon not helping LAGEOS at
  24 h (2026-08-02 and 08-05 seeds); the other ten are the 72 h radiation
  pressure comparison, which A2 records cannot be resolved. All the
  configurations in the criterion lack tesserals, which leave errors of
  hundreds of metres to kilometres; an added force can move a seed either
  way inside that. With the tesserals present, every SLR seed improves from
  E-d to E-e, and 92 of 96 GPS seeds do.
- **V1.3.** It compares two models without the Sun and Moon, whose absence
  dominates the GPS error at 24 h (E-c is 331 m against E-b's 2090 m). The
  first run passed it only because E-b was then the point mass. The resident
  model is not at fault: a probe run (not part of V1) of the execution path
  with the same forces, a 20x20 field with Earth orientation and no third
  bodies, agreed with R-20 to metres seed by seed.
- **GPS maxima at 48-72 h** (about 90 km in every configuration) are one
  satellite, NORAD 35752, seeded 2026-08-06; the same object carries most of
  the E1 baseline's squared error. It is not modelled by any configuration
  and is left as an open item about the truth or the satellite, not HPOP.

The configuration that matters for the whitepapers is E-e: HPOP with every
force it models and IERS Earth orientation is 6 m from the SLR orbits after a
day (median, 16 seeds) and 19 m after three days. For GPS it is 29 m after a
day with a cannonball standing in for the satellite's radiation pressure.
