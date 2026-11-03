# AP 0.4.11 against precise orbits, Part T: 944 windows

## APRa12: 0.4.11 against 0.4.0
- day 1: -0.0 % [-0.1 %, 0.0 %], p95 upper 0.5 %, failed 0.00 %, n 944, weeks 38
- day 2: 0.0 % [-0.0 %, 0.0 %], p95 upper 0.1 %, failed 0.00 %, n 944, weeks 38
- day 3: -0.0 % [-0.0 %, 0.0 %], p95 upper 0.1 %, failed 0.00 %, n 944, weeks 38
- day 7: 0.0 % [-0.0 %, 0.0 %], p95 upper 0.0 %, failed 0.00 %, n 944, weeks 38

## AP24: 0.4.11 against 0.4.0
- day 1: -0.1 % [-0.1 %, -0.0 %], p95 upper 0.4 %, failed 0.00 %, n 944, weeks 38
- day 2: -0.0 % [-0.0 %, 0.0 %], p95 upper 0.2 %, failed 0.00 %, n 944, weeks 38
- day 3: -0.0 % [-0.0 %, 0.0 %], p95 upper 0.2 %, failed 0.00 %, n 944, weeks 38
- day 7: -0.0 % [-0.0 %, 0.0 %], p95 upper 0.3 %, failed 0.00 %, n 944, weeks 38

**Statement 1, APRa12 at 0.4.11 does not lose to 0.4.0:** PASS
**Statement 2, AP24 at 0.4.11 does not lose to 0.4.0:** PASS
Report only, APRa12 beats 0.4.0 (rule 1): day 1 no, day 2 no, day 3 no, day 7 no
Report only, AP24 beats 0.4.0 (rule 1): day 1 yes, day 2 no, day 3 no, day 7 no

| Arm | Build | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---|---:|---:|---:|---:|
| APRa12 | 0.4.11 | 0.126 (0.53) | 0.593 (2.94) | 1.446 (7.83) | 11.651 (52.34) |
| APRa12 | 0.4.0 | 0.126 (0.53) | 0.596 (2.94) | 1.441 (7.84) | 11.654 (52.34) |
| AP24 | 0.4.11 | 0.195 (0.7) | 0.88 (3.28) | 2.125 (8.59) | 13.089 (51.13) |
| AP24 | 0.4.0 | 0.196 (0.7) | 0.88 (3.29) | 2.132 (8.58) | 13.103 (50.94) |