# AP 0.4.0 against precise orbits, Part T: 944 windows

## APRa12: 0.4.0 against 0.3.0
- day 1: -21.5 % [-26.6 %, -15.6 %], p95 upper 5.6 %, failed 0.00 %, n 944, weeks 38
- day 2: -2.2 % [-4.2 %, -1.0 %], p95 upper 4.0 %, failed 0.00 %, n 944, weeks 38
- day 3: -0.2 % [-1.1 %, 0.3 %], p95 upper 2.2 %, failed 0.00 %, n 944, weeks 38
- day 7: 0.0 % [-0.2 %, 0.2 %], p95 upper 1.3 %, failed 0.00 %, n 944, weeks 38

## AP24: 0.4.0 against 0.3.0
- day 1: -18.8 % [-24.1 %, -13.5 %], p95 upper 7.4 %, failed 0.00 %, n 944, weeks 38
- day 2: -7.2 % [-9.9 %, -3.2 %], p95 upper 8.8 %, failed 0.00 %, n 944, weeks 38
- day 3: -2.0 % [-5.5 %, 1.1 %], p95 upper 8.3 %, failed 0.00 %, n 944, weeks 38
- day 7: -1.1 % [-4.0 %, 1.8 %], p95 upper 6.4 %, failed 0.00 %, n 944, weeks 38

**Statement 1, APRa12 at 0.4.0 beats 0.3.0:** PASS
**Statement 2, AP24 at 0.4.0 beats 0.3.0:** PASS

| Arm | Build | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---|---:|---:|---:|---:|
| APRa12 | 0.4.0 | 0.126 (0.53) | 0.596 (2.94) | 1.441 (7.84) | 11.654 (52.34) |
| APRa12 | 0.3.0 | 0.162 (0.54) | 0.598 (2.96) | 1.454 (7.85) | 11.482 (51.77) |
| AP24 | 0.4.0 | 0.196 (0.7) | 0.88 (3.29) | 2.132 (8.58) | 13.103 (50.94) |
| AP24 | 0.3.0 | 0.226 (0.74) | 0.875 (3.43) | 2.122 (8.4) | 13.533 (51.31) |