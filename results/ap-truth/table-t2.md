# AP against precise orbits, AP2.md: 1812 windows, 12 with no entry

## S1: 300 windows, 2 satellites

| Arm | n | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---:|---:|---:|---:|---:|
| AP72 | 259 | 0.192 (1.11) | 0.502 (2.4) | 0.906 (4.45) | 3.026 (12.8) |
| AP24 | 276 | 0.126 (0.72) | 0.37 (2.33) | 0.728 (3.14) | 2.087 (12.01) |
| X2 | 259 | 0.691 (1.36) | 0.912 (2.87) | 1.393 (5.51) | 4.555 (15.83) |
| P | 289 | 0.742 (2.15) | 1.029 (3.29) | 1.385 (5.78) | 4.437 (18.41) |

### AP72 against P
- day 1: -75.5 % [-79.9 %, -70.8 %], p95 upper 15.4 %, failed 0.00 %, left for coverage 30, n 259, weeks 21
- day 2: -54.3 % [-67.9 %, -42.0 %], p95 upper 40.0 %, failed 0.00 %, left for coverage 29, n 258, weeks 21
- day 3: -41.8 % [-54.1 %, -24.6 %], p95 upper 6.1 %, failed 0.00 %, left for coverage 29, n 258, weeks 21
- day 7: -20.7 % [-28.7 %, -10.8 %], p95 upper 8.3 %, failed 0.00 %, left for coverage 30, n 257, weeks 21

### AP24 against P
- day 1: -82.8 % [-84.3 %, -80.9 %], p95 upper -28.3 %, failed 0.00 %, left for coverage 13, n 276, weeks 22
- day 2: -59.1 % [-66.9 %, -52.4 %], p95 upper 0.9 %, failed 0.00 %, left for coverage 13, n 274, weeks 22
- day 3: -44.8 % [-52.6 %, -39.5 %], p95 upper -19.8 %, failed 0.00 %, left for coverage 12, n 275, weeks 22
- day 7: -48.4 % [-54.9 %, -41.1 %], p95 upper -14.9 %, failed 0.00 %, left for coverage 13, n 274, weeks 22

### AP72 against X2
- day 1: -70.9 % [-75.1 %, -66.7 %], p95 upper -1.9 %, failed 0.00 %, left for coverage 0, n 259, weeks 21
- day 2: -46.4 % [-57.5 %, -39.5 %], p95 upper -2.5 %, failed 0.00 %, left for coverage 0, n 258, weeks 21
- day 3: -35.2 % [-43.1 %, -30.4 %], p95 upper -1.7 %, failed 0.00 %, left for coverage 0, n 258, weeks 21
- day 7: -22.7 % [-29.1 %, -18.3 %], p95 upper -3.9 %, failed 0.00 %, left for coverage 0, n 257, weeks 21

**S1, AP72 beats P:** fail

## GN: 750 windows, 5 satellites

| Arm | n | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---:|---:|---:|---:|---:|
| AP72 | 746 | 0.038 (0.07) | 0.054 (0.1) | 0.07 (0.14) | 0.143 (0.45) |
| AP24 | 748 | 0.078 (0.12) | 0.148 (0.24) | 0.219 (0.36) | 0.519 (0.79) |
| X2 | 745 | 0.161 (0.26) | 0.24 (0.39) | 0.32 (0.52) | 0.65 (1.01) |
| P | 749 | 1.631 (4.74) | 1.686 (5.21) | 1.744 (5.69) | 1.887 (7.19) |

### AP72 against P
- day 1: -97.7 % [-98.0 %, -97.5 %], p95 upper -98.2 %, failed 0.00 %, left for coverage 3, n 746, weeks 22
- day 2: -96.9 % [-97.2 %, -96.6 %], p95 upper -97.4 %, failed 0.00 %, left for coverage 3, n 746, weeks 22
- day 3: -96.1 % [-96.5 %, -95.7 %], p95 upper -96.4 %, failed 0.00 %, left for coverage 3, n 746, weeks 22
- day 7: -93.1 % [-93.5 %, -92.4 %], p95 upper -92.5 %, failed 0.00 %, left for coverage 3, n 746, weeks 22

### AP24 against P
- day 1: -95.4 % [-96.0 %, -94.9 %], p95 upper -97.0 %, failed 0.00 %, left for coverage 1, n 748, weeks 22
- day 2: -91.8 % [-92.9 %, -90.7 %], p95 upper -94.1 %, failed 0.00 %, left for coverage 1, n 748, weeks 22
- day 3: -88.4 % [-89.7 %, -86.8 %], p95 upper -91.4 %, failed 0.00 %, left for coverage 1, n 748, weeks 22
- day 7: -76.6 % [-78.5 %, -74.5 %], p95 upper -87.0 %, failed 0.00 %, left for coverage 1, n 748, weeks 22

### AP72 against X2
- day 1: -76.9 % [-78.7 %, -75.2 %], p95 upper -70.6 %, failed 0.00 %, left for coverage 0, n 745, weeks 22
- day 2: -78.8 % [-80.6 %, -76.7 %], p95 upper -71.3 %, failed 0.00 %, left for coverage 0, n 745, weeks 22
- day 3: -79.0 % [-80.9 %, -77.1 %], p95 upper -68.5 %, failed 0.00 %, left for coverage 0, n 745, weeks 22
- day 7: -78.3 % [-79.7 %, -76.3 %], p95 upper -49.8 %, failed 0.00 %, left for coverage 0, n 745, weeks 22

**GN, AP72 beats P:** PASS

## P: 750 windows, 5 satellites

| Arm | n | Day 1 | Day 2 | Day 3 | Day 7 |
|---|---:|---:|---:|---:|---:|
| AP72 | 750 | 0.331 (1.43) | 1.044 (4.64) | 2.14 (10.34) | 11.69 (59.23) |
| AP24 | 750 | 0.235 (0.77) | 0.881 (3.45) | 2.041 (8.39) | 12.012 (56.62) |
| X2 | 750 | 0.86 (1.62) | 1.652 (4.55) | 2.942 (9.62) | 13.96 (56.74) |
| P | 750 | 0.763 (1.56) | 1.309 (4.86) | 2.454 (11.43) | 15.348 (73.69) |

### AP72 against P
- day 1: -59.6 % [-64.7 %, -53.5 %], p95 upper 19.3 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 2: -27.8 % [-39.0 %, -16.4 %], p95 upper 27.4 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 3: -23.0 % [-34.3 %, -6.3 %], p95 upper 10.6 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 7: -14.3 % [-27.4 %, -0.9 %], p95 upper 3.8 %, failed 0.00 %, left for coverage 0, n 750, weeks 22

### AP24 against P
- day 1: -73.0 % [-75.8 %, -69.3 %], p95 upper -35.7 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 2: -41.2 % [-50.6 %, -29.2 %], p95 upper -15.8 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 3: -21.8 % [-34.4 %, -5.0 %], p95 upper -8.7 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 7: -12.2 % [-29.2 %, 5.2 %], p95 upper 5.2 %, failed 0.00 %, left for coverage 0, n 750, weeks 22

### AP72 against X2
- day 1: -62.4 % [-66.3 %, -53.3 %], p95 upper -0.2 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 2: -33.4 % [-43.4 %, -22.1 %], p95 upper 11.6 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 3: -21.9 % [-30.5 %, -13.4 %], p95 upper 10.6 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
- day 7: -8.0 % [-11.9 %, -4.1 %], p95 upper 8.8 %, failed 0.00 %, left for coverage 0, n 750, weeks 22
