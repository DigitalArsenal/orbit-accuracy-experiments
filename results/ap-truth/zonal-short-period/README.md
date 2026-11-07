# AP zonal short-period terms above J5: the harness prototype against the independent reference

Registration: experiments/operator-theory/ZONAL-SHORT-PERIOD.md. Pins: modules 93cb5a058; sdn-ap 0.6.4 signed bundle e98b63558d84, canonical fd1ef4682edc; ffm 2.2.1 a91331207752; EGM96 zonals from propagator/ffm/lib/egm96_data.h 4d5c80b3d673. Shares are the all-regimes m = 0 share (RMS over the window, m) with [lower, upper] by the delete-one-block jackknife; the difference's interval is +-2 sqrt(SE_before^2 + SE_after^2). Floors: RMS 1 m, maximum 5 m. Rows 42, flown 40. Self-test of the Hill response (item 2): pass (3.70e-11 m against an amplitude of 0.61 m).

## Verdict
- the gap is not first-order zonal short-period.
- Counted cells (e 0.001 secondary, V1 validated): Starlette, Ajisai, LARES, Jason-3, Sentinel-3, CryoSat-2.
- Reduced: none. Inside the floors after the prototype: none. Cost within: yes.
- Residuals named: none.
- V1 (S = E20 - E5, the J6-J20 zonal short-period content the module lacks, before and after the prototype; E5 the module's m = 0 error with nothing above J5): Starlette: validated (S j >= 2 amplitude 1.00 -> 0.04 m with +Delta, x23.8; -Delta x0.50; E5 m = 0 4.10 m [4.03, 4.18] against the cell's 3.55: agree); Ajisai: validated (S j >= 2 amplitude 0.63 -> 0.02 m with +Delta, x36.1; -Delta x0.50; E5 m = 0 3.57 m [3.49, 3.65] against the cell's 3.36: agree); LARES: validated (S j >= 2 amplitude 0.29 -> 0.00 m with +Delta, x99.0; -Delta x0.50; E5 m = 0 3.76 m [3.73, 3.79] against the cell's 4.19: agree); Jason-3: validated (S j >= 2 amplitude 0.40 -> 0.00 m with +Delta, x111.9; -Delta x0.50; E5 m = 0 3.89 m [3.85, 3.92] against the cell's 4.04: agree); Sentinel-3: validated (S j >= 2 amplitude 0.70 -> 0.01 m with +Delta, x62.8; -Delta x0.50; E5 m = 0 2.73 m [2.67, 2.79] against the cell's 3.13: agree); CryoSat-2: validated (S j >= 2 amplitude 0.38 -> 0.01 m with +Delta, x55.7; -Delta x0.50; E5 m = 0 5.46 m [5.41, 5.50] against the cell's 5.95: agree).
- E5 agrees with the cell's m = 0 share (the gap is below J6) in: Starlette, Ajisai, LARES, Jason-3, Sentinel-3, CryoSat-2.

## The cells
| Cell | m = 0 forward before (m) | after | before - after | Reading | Floor three-way before -> after | Residual family after | (0,1) before / after | In-arc before -> after | Leakage (tesseral; secular) | Landed 0.6.3 (reproduction) | Correction RMS (m) |
| --- | --: | --: | --: | --- | --- | --- | --: | --- | --- | --: | --: |
| Starlette secondary e 0.001 (L 20) | 3.55 [2.85, 4.25] | 3.99 [3.21, 4.77] | -0.44 [-1.49, 0.61] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.22) | (0,2) 5.53 | 0.00 / 0.00 | 3.85 [3.41, 4.30] -> 3.86 [3.44, 4.28] (not reduced) | tess 6.14 -> 6.14; sec 6.18 -> 6.18 | 3.55 (0.00) | 0.71 |
| Starlette primary e 0.001 (L 31) | 3.60 [2.88, 4.31] | 4.04 [3.23, 4.84] | -0.44 [-1.52, 0.64] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 8.68) | (0,2) 5.59 | 0.00 / 0.00 | 3.84 [3.24, 4.44] -> 3.85 [3.27, 4.42] (not reduced) | tess 6.42 -> 6.42; sec 5.85 -> 5.85 | 3.60 (0.00) | 0.70 |
| Starlette secondary e 0.01 (L 20) | 3.58 [2.91, 4.26] | 4.03 [3.31, 4.75] | -0.44 [-1.43, 0.55] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.22) | (0,2) 5.58 | 0.00 / 0.00 | 3.84 [2.82, 4.87] -> 3.85 [2.85, 4.85] (not reduced) | tess 5.54 -> 5.54; sec 5.55 -> 5.55 | - | 0.71 |
| Starlette secondary e 0.05 (L 20) | 4.39 [2.39, 6.40] | 4.79 [2.87, 6.70] | -0.39 [-3.17, 2.38] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.76) | (0,2) 6.51 | 0.00 / 0.00 | 3.53 [0.00, 12.12] -> 3.53 [0.00, 12.10] (not reduced) | tess 11.32 -> 11.32; sec 15.07 -> 15.07 | - | 0.71 |
| Starlette secondary e 0.1 (L 20) | 8.86 [3.12, 14.60] | 9.09 [3.46, 14.73] | -0.23 [-8.28, 7.81] | not reduced | fail -> fail (A-scaled undecided -> undecided; b_rms 12.67) | (0,2) 12.46 | 0.00 / 0.00 | 3.75 [0.00, 26.61] -> 3.74 [0.00, 26.58] (not reduced) | tess 9.59 -> 9.59; sec 75.78 -> 75.78 | - | 0.71 |
| Ajisai secondary e 0.001 (L 20) | 3.36 [3.02, 3.70] | 3.64 [3.29, 4.00] | -0.28 [-0.78, 0.21] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 6.67) | (0,2) 5.04 | 0.00 / 0.00 | 2.95 [2.43, 3.48] -> 2.95 [2.42, 3.49] (not reduced) | tess 4.59 -> 4.59; sec 4.58 -> 4.58 | 3.36 (0.00) | 0.45 |
| Ajisai primary e 0.001 (L 31) | 3.36 [3.00, 3.71] | 3.64 [3.27, 4.00] | -0.28 [-0.79, 0.23] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 6.70) | (0,2) 5.03 | 0.00 / 0.00 | 2.96 [2.38, 3.53] -> 2.96 [2.37, 3.55] (not reduced) | tess 4.66 -> 4.66; sec 4.53 -> 4.53 | 3.36 (0.00) | 0.45 |
| Ajisai secondary e 0.01 (L 20) | 3.38 [3.02, 3.75] | 3.67 [3.29, 4.05] | -0.29 [-0.81, 0.24] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 6.69) | (0,2) 5.07 | 0.00 / 0.00 | 3.42 [3.07, 3.77] -> 3.42 [3.06, 3.78] (not reduced) | tess 4.55 -> 4.55; sec 4.43 -> 4.43 | - | 0.45 |
| Ajisai secondary e 0.05 (L 20) | 3.45 [2.61, 4.29] | 3.73 [2.91, 4.55] | -0.28 [-1.45, 0.89] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 7.00) | (0,2) 5.05 | 0.00 / 0.00 | 4.24 [1.99, 6.49] -> 4.23 [2.02, 6.45] (not reduced) | tess 9.70 -> 9.70; sec 4.15 -> 4.15 | - | 0.45 |
| Ajisai secondary e 0.1 (L 20) | 4.21 [2.89, 5.54] | 4.48 [3.22, 5.73] | -0.27 [-2.09, 1.56] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 8.60) | (0,2) 6.08 | 0.00 / 0.00 | 3.35 [0.00, 13.09] -> 3.33 [0.00, 13.08] (not reduced) | tess 5.30 -> 5.30; sec 21.18 -> 21.18 | - | 0.45 |
| LARES secondary e 0.001 (L 20) | 4.19 [3.39, 4.98] | 4.11 [3.31, 4.92] | 0.07 [-1.06, 1.20] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.45) | (0,2) 4.46 | 3.17 / 3.17 | 0.93 [0.44, 1.42] -> 0.93 [0.43, 1.43] (not reduced) | tess 3.68 -> 3.68; sec 7.55 -> 7.55 | 4.19 (0.00) | 0.21 |
| LARES primary e 0.001 (L 31) | 4.43 [3.53, 5.33] | 4.36 [3.45, 5.27] | 0.07 [-1.21, 1.35] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.52) | (0,2) 4.46 | 3.77 / 3.77 | 0.94 [0.33, 1.55] -> 0.94 [0.32, 1.55] (not reduced) | tess 3.70 -> 3.70; sec 13.20 -> 13.20 | 4.43 (0.00) | 0.21 |
| LARES secondary e 0.01 (L 20) | 4.13 [3.15, 5.11] | 4.06 [3.05, 5.06] | 0.07 [-1.33, 1.48] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.43) | (0,2) 4.46 | 3.03 / 3.03 | 1.03 [0.83, 1.22] -> 1.03 [0.82, 1.23] (not reduced) | tess 3.72 -> 3.72; sec 7.57 -> 7.57 | - | 0.21 |
| LARES secondary e 0.05 (L 20) | 6.15 [2.92, 9.38] | 6.10 [2.84, 9.36] | 0.04 [-4.55, 4.63] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.57) | (0,1) 7.06 | 7.06 / 7.06 | 1.61 [0.64, 2.58] -> 1.61 [0.64, 2.59] (not reduced) | tess 8.08 -> 8.08; sec 8.30 -> 8.30 | - | 0.21 |
| LARES secondary e 0.1 (L 20) | 15.79 [11.60, 19.98] | 15.77 [11.58, 19.97] | 0.02 [-5.91, 5.95] | not reduced | fail -> fail (A-scaled fail -> fail; b_rms 10.60) | (0,1) 21.82 | 21.82 / 21.82 | 1.65 [0.00, 3.49] -> 1.66 [0.00, 3.51] (not reduced) | tess 3.49 -> 3.49; sec 12.19 -> 12.19 | - | 0.21 |
| Jason-3 secondary e 0.001 (L 20) | 4.04 [3.50, 4.58] | 4.01 [3.47, 4.55] | 0.03 [-0.74, 0.79] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.34) | (0,2) 5.09 | 1.76 / 1.76 | 0.16 [0.00, 0.87] -> 0.16 [0.00, 0.87] (not reduced) | tess 3.76 -> 3.76; sec 7.66 -> 7.66 | 4.04 (0.00) | 0.28 |
| Jason-3 primary e 0.001 (L 31) | 4.07 [3.59, 4.54] | 4.04 [3.55, 4.53] | 0.03 [-0.66, 0.71] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.34) | (0,2) 5.10 | 1.84 / 1.84 | 0.16 [0.00, 0.77] -> 0.16 [0.00, 0.77] (not reduced) | tess 3.71 -> 3.71; sec 8.05 -> 8.05 | 4.07 (0.00) | 0.29 |
| Jason-3 secondary e 0.01 (L 20) | 4.16 [3.28, 5.05] | 4.14 [3.25, 5.03] | 0.02 [-1.23, 1.28] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 9.43) | (0,2) 5.08 | 2.25 / 2.25 | 0.30 [0.00, 0.74] -> 0.30 [0.00, 0.74] (not reduced) | tess 3.92 -> 3.92; sec 7.90 -> 7.90 | - | 0.28 |
| Jason-3 secondary e 0.05 (L 20) | 5.32 [2.37, 8.28] | 5.31 [2.37, 8.25] | 0.01 [-4.16, 4.18] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 10.23) | (0,1) 5.14 | 5.13 / 5.14 | 0.88 [0.00, 2.28] -> 0.89 [0.00, 2.30] (not reduced) | tess 8.59 -> 8.59; sec 12.01 -> 12.01 | - | 0.28 |
| Jason-3 secondary e 0.1 (L 20) | 7.67 [6.18, 9.15] | 7.65 [6.16, 9.14] | 0.02 [-2.09, 2.12] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 12.66) | (0,1) 9.65 | 9.65 / 9.65 | 1.47 [0.00, 4.85] -> 1.48 [0.00, 4.92] (not reduced) | tess 3.77 -> 3.77; sec 71.51 -> 71.51 | - | 0.28 |
| Sentinel-3 secondary e 0.001 (L 20) | 3.13 [2.29, 3.96] | 2.94 [2.04, 3.85] | 0.18 [-1.05, 1.41] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 16.51) | (0,2) 3.27 | 0.00 / 0.00 | 4.57 [4.10, 5.03] -> 4.57 [4.10, 5.04] (not reduced) | tess 7.42 -> 7.42; sec 9.03 -> 9.03 | 3.13 (0.00) | 0.50 |
| Sentinel-3 primary e 0.001 (L 31) | 3.12 [2.29, 3.95] | 2.92 [2.03, 3.80] | 0.20 [-1.01, 1.41] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 17.61) | (0,2) 3.22 | 0.00 / 0.00 | 4.59 [3.60, 5.58] -> 4.60 [3.60, 5.59] (not reduced) | tess 7.78 -> 7.78; sec 9.52 -> 9.52 | 3.12 (0.00) | 0.49 |
| Sentinel-3 secondary e 0.01 (L 20) | 3.13 [2.45, 3.81] | 2.95 [2.17, 3.72] | 0.19 [-0.85, 1.22] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 16.75) | (0,2) 3.28 | 0.00 / 0.00 | 4.68 [4.21, 5.15] -> 4.69 [4.21, 5.17] (not reduced) | tess 7.23 -> 7.23; sec 9.05 -> 9.05 | - | 0.50 |
| Sentinel-3 secondary e 0.05 (L 20) | 3.37 [1.65, 5.09] | 3.18 [1.32, 5.05] | 0.18 [-2.36, 2.73] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 19.08) | (0,2) 3.55 | 0.00 / 0.00 | 5.35 [1.42, 9.28] -> 5.36 [1.42, 9.30] (not reduced) | tess 9.09 -> 9.09; sec 9.86 -> 9.86 | - | 0.50 |
| cell:secondary:Sentinel-3|0.1 | below the perigee floor | | | | | | | | | | |
| CryoSat-2 secondary e 0.001 (L 20) | 5.95 [4.07, 7.84] | 5.93 [4.05, 7.81] | 0.02 [-2.64, 2.68] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 18.43) | (0,1) 7.82 | 7.82 / 7.82 | 5.59 [5.07, 6.10] -> 5.59 [5.06, 6.12] (not reduced) | tess 7.42 -> 7.42; sec 11.51 -> 11.51 | 5.95 (0.00) | 0.27 |
| CryoSat-2 primary e 0.001 (L 31) | 16.21 [12.92, 19.50] | 16.20 [12.92, 19.49] | 0.00 [-4.64, 4.65] | not reduced | fail -> fail (A-scaled undecided -> undecided; b_rms 16.92) | (0,1) 22.71 | 22.71 / 22.71 | 5.57 [4.52, 6.62] -> 5.57 [4.54, 6.61] (not reduced) | tess 8.60 -> 8.60; sec 38.78 -> 38.78 | 16.21 (0.00) | 0.27 |
| CryoSat-2 secondary e 0.01 (L 20) | 7.10 [5.37, 8.83] | 7.08 [5.35, 8.82] | 0.02 [-2.43, 2.47] | not reduced | fail -> fail (A-scaled pass -> pass; b_rms 18.25) | (0,1) 9.52 | 9.52 / 9.52 | 5.44 [5.02, 5.87] -> 5.45 [5.03, 5.86] (not reduced) | tess 6.76 -> 6.76; sec 11.49 -> 11.49 | - | 0.27 |
| CryoSat-2 secondary e 0.05 (L 20) | 21.93 [19.17, 24.68] | 21.92 [19.16, 24.69] | 0.00 [-3.90, 3.91] | not reduced | fail -> fail (A-scaled fail -> fail; b_rms 18.81) | (0,1) 30.71 | 30.71 / 30.71 | 5.76 [2.87, 8.64] -> 5.76 [2.88, 8.64] (not reduced) | tess 10.28 -> 10.28; sec 16.27 -> 16.27 | - | 0.27 |
| cell:secondary:CryoSat-2|0.1 | below the perigee floor | | | | | | | | | | |

## The constant members (item 3; forward day; module minus reference; m)
| Cell | R0 predicted | R0 measured | inside interval | N0 predicted | N0 measured | inside interval | T1 (m/day) |
| --- | --: | --: | --- | --: | --: | --- | --: |
| Starlette secondary e 0.001 | -0.20 | -0.66 [-2.16, 0.83] | yes | 0.84 | -4.18 [-5.73, -2.62] | no | -13.01 [-32.17, 6.14] |
| Starlette primary e 0.001 | -0.21 | -0.64 [-2.31, 1.03] | yes | 0.82 | -4.25 [-5.81, -2.70] | no | -12.83 [-31.51, 5.85] |
| Starlette secondary e 0.01 | -0.20 | -0.53 [-1.74, 0.67] | yes | 0.84 | -4.30 [-5.86, -2.74] | no | -11.06 [-28.62, 6.50] |
| Starlette secondary e 0.05 | -0.20 | 0.84 [-0.60, 2.28] | yes | 0.84 | -3.78 [-5.73, -1.82] | no | -19.95 [-34.49, -5.41] |
| Starlette secondary e 0.1 | -0.20 | 3.30 [0.13, 6.46] | no | 0.84 | -0.07 [-3.43, 3.28] | yes | -60.95 [-86.80, -35.10] |
| Ajisai secondary e 0.001 | -0.14 | 0.32 [-1.26, 1.91] | yes | 0.51 | -3.93 [-4.64, -3.22] | no | -3.10 [-9.62, 3.43] |
| Ajisai primary e 0.001 | -0.14 | 0.32 [-1.22, 1.86] | yes | 0.50 | -3.90 [-4.60, -3.20] | no | -3.06 [-9.27, 3.15] |
| Ajisai secondary e 0.01 | -0.14 | 0.47 [-0.71, 1.65] | yes | 0.51 | -4.08 [-4.81, -3.36] | no | -3.44 [-10.61, 3.73] |
| Ajisai secondary e 0.05 | -0.14 | -0.31 [-2.20, 1.58] | yes | 0.51 | -3.93 [-4.70, -3.17] | no | -2.19 [-9.90, 5.51] |
| Ajisai secondary e 0.1 | -0.14 | -0.62 [-2.10, 0.87] | yes | 0.51 | -2.27 [-3.50, -1.04] | no | 16.58 [5.33, 27.83] |
| LARES secondary e 0.001 | -0.07 | 1.96 [0.93, 2.98] | no | -0.19 | -7.41 [-8.10, -6.71] | no | -0.33 [-12.53, 11.87] |
| LARES primary e 0.001 | -0.07 | 2.00 [0.97, 3.02] | no | -0.19 | -7.44 [-8.08, -6.80] | no | -13.19 [-24.40, -1.98] |
| LARES secondary e 0.01 | -0.07 | 1.99 [0.78, 3.21] | no | -0.19 | -7.43 [-8.06, -6.79] | no | -1.98 [-14.98, 11.01] |
| LARES secondary e 0.05 | -0.07 | 3.14 [0.81, 5.48] | no | -0.19 | -7.64 [-8.37, -6.90] | no | -5.86 [-20.99, 9.27] |
| LARES secondary e 0.1 | -0.07 | 3.39 [2.48, 4.30] | no | -0.19 | -8.26 [-9.40, -7.12] | no | -0.26 [-13.76, 13.24] |
| Jason-3 secondary e 0.001 | -0.20 | 1.25 [-0.32, 2.82] | yes | -0.03 | -7.54 [-7.93, -7.16] | no | -1.69 [-18.61, 15.23] |
| Jason-3 primary e 0.001 | -0.20 | 1.26 [-0.25, 2.78] | yes | -0.03 | -7.52 [-7.93, -7.12] | no | -0.49 [-18.39, 17.40] |
| Jason-3 secondary e 0.01 | -0.20 | 1.62 [0.42, 2.83] | no | -0.03 | -7.54 [-7.94, -7.15] | no | -3.46 [-20.62, 13.71] |
| Jason-3 secondary e 0.05 | -0.20 | 2.39 [1.02, 3.76] | no | -0.03 | -7.65 [-8.42, -6.88] | no | 3.05 [-9.65, 15.74] |
| Jason-3 secondary e 0.1 | -0.20 | 1.98 [1.14, 2.83] | no | -0.03 | -8.26 [-9.57, -6.94] | no | 47.27 [32.21, 62.32] |
| Sentinel-3 secondary e 0.001 | 0.23 | 7.24 [5.50, 8.99] | no | 0.77 | 4.98 [3.48, 6.47] | no | -0.17 [-13.18, 12.84] |
| Sentinel-3 primary e 0.001 | 0.22 | 6.98 [5.18, 8.78] | no | 0.77 | 5.18 [3.78, 6.58] | no | 2.37 [-10.75, 15.49] |
| Sentinel-3 secondary e 0.01 | 0.23 | 6.86 [5.18, 8.53] | no | 0.77 | 4.87 [3.49, 6.26] | no | 0.83 [-12.54, 14.20] |
| Sentinel-3 secondary e 0.05 | 0.23 | 5.87 [3.36, 8.38] | no | 0.77 | 3.97 [2.38, 5.57] | no | 4.94 [-11.41, 21.30] |
| CryoSat-2 secondary e 0.001 | 0.14 | 9.50 [6.81, 12.20] | no | 0.29 | 0.85 [-0.82, 2.53] | yes | -14.22 [-27.64, -0.80] |
| CryoSat-2 primary e 0.001 | 0.15 | 9.12 [6.32, 11.92] | no | 0.27 | 0.87 [-0.68, 2.41] | yes | 21.06 [1.07, 41.05] |
| CryoSat-2 secondary e 0.01 | 0.14 | 9.32 [5.91, 12.74] | no | 0.29 | 0.83 [-0.75, 2.42] | yes | -13.40 [-27.38, 0.58] |
| CryoSat-2 secondary e 0.05 | 0.14 | 9.60 [3.50, 15.71] | no | 0.29 | 0.45 [-1.31, 2.20] | yes | -11.45 [-24.91, 2.00] |

## V1 per regime (Amendment 1: S = E20 - E5 of the fitted zonal-only arms, forward day; E5 is the module's m = 0 error with nothing above J5 in play)
| Regime | S RMS (m) | S j >= 2 zonal amplitude: before -> +Delta / -Delta (m) | ratio +Delta / -Delta | Prototype RMS (m) | E5 m = 0 share | E20 m = 0 share | Cell m = 0 share | E5 agrees with the cell | E5 zonal families | validated |
| --- | --: | --- | --- | --: | --: | --: | --: | --- | --- | --- |
| Starlette | 1.60 | 1.00 -> 0.04 / 1.99 | 23.84 / 0.50 | 0.71 | 4.10 [4.03, 4.18] | 3.64 [3.56, 3.73] | 3.55 [2.85, 4.25] | yes | (0,2) 5.71; (0,3) 1.06; (0,4) 0.35; (0,5) 0.10; (0,6) 0.03; (0,7) 0.02 | yes |
| Ajisai | 0.93 | 0.63 -> 0.02 / 1.27 | 36.14 / 0.50 | 0.45 | 3.57 [3.49, 3.65] | 3.30 [3.24, 3.36] | 3.36 [3.02, 3.70] | yes | (0,2) 4.94; (0,3) 0.95; (0,4) 0.32; (0,5) 0.05; (0,7) 0.02; (0,6) 0.02 | yes |
| LARES | 0.43 | 0.29 -> 0.00 / 0.59 | 99.05 / 0.50 | 0.21 | 3.76 [3.73, 3.79] | 3.75 [3.73, 3.78] | 4.19 [3.39, 4.98] | yes | (0,2) 4.45; (0,1) 2.26; (0,3) 1.69; (0,4) 0.49; (0,5) 0.05; (0,8) 0.00 | yes |
| Jason-3 | 0.71 | 0.40 -> 0.00 / 0.80 | 111.87 / 0.50 | 0.28 | 3.89 [3.85, 3.92] | 3.88 [3.85, 3.91] | 4.04 [3.50, 4.58] | yes | (0,2) 4.99; (0,3) 1.61; (0,1) 1.53; (0,4) 0.48; (0,10) 0.08; (0,5) 0.05 | yes |
| Sentinel-3 | 1.20 | 0.70 -> 0.01 / 1.41 | 62.78 / 0.50 | 0.50 | 2.73 [2.67, 2.79] | 2.93 [2.88, 2.98] | 3.13 [2.29, 3.96] | yes | (0,2) 2.99; (0,3) 2.34; (0,4) 0.74; (0,5) 0.08; (0,6) 0.02; (0,7) 0.02 | yes |
| CryoSat-2 | 1.03 | 0.38 -> 0.01 / 0.76 | 55.69 / 0.50 | 0.27 | 5.46 [5.41, 5.50] | 5.96 [5.90, 6.01] | 5.95 [4.07, 7.84] | yes | (0,1) 7.07; (0,3) 2.54; (0,2) 1.77; (0,4) 0.78; (0,5) 0.10; (0,15) 0.01 | yes |

## The cost (per object, measured in this harness; upper bounds for a compiled implementation)
| Regime | Terms summed (L 20 / 31) | Stored floats (L 20 / 31) | Bytes (L 20 / 31) | Table build L 20 / 31 (ms, median of 50) | Per epoch L 20 / 31 (us) | Flight of 65 epochs L 31 (ms) | Within (below 10 ms and 272 bytes at L 20) |
| --- | --: | --: | --: | --: | --: | --: | --- |
| Starlette | 94 / 234 | 57 / 90 | 228 / 360 | 0.207 / 0.295 | 0.11 / 0.12 | 0.303 | within |
| Ajisai | 94 / 234 | 57 / 90 | 228 / 360 | 0.198 / 0.284 | 0.09 / 0.11 | 0.291 | within |
| LARES | 94 / 234 | 57 / 90 | 228 / 360 | 0.182 / 0.268 | 0.09 / 0.13 | 0.276 | within |
| Jason-3 | 94 / 234 | 57 / 90 | 228 / 360 | 0.198 / 0.268 | 0.09 / 0.11 | 0.275 | within |
| Sentinel-3 | 94 / 234 | 57 / 90 | 228 / 360 | 0.187 / 0.274 | 0.08 / 0.11 | 0.282 | within |
| CryoSat-2 | 94 / 234 | 57 / 90 | 228 / 360 | 0.195 / 0.271 | 0.08 / 0.11 | 0.278 | within |

## For the coordinator: the module record (not warranted on this verdict; stated in case the finding is reconsidered)
- Title: propagator/sdn-ap: first-order zonal short-period terms J6 to J_MAXIMUM_DEGREE (m = 0, j >= 2) at the output step, small-e form in the argument of latitude
- Terms: ZONAL-SHORT-PERIOD.md items 1 and 2: per object one table of 3 (L - 1) floats (the forced Hill response per harmonic j = 2..L of the summed J6..J_L force harmonics at the mean a, i, n), rebuilt when the mean i or a moves; applied to the osculating output position in RTN; the j = 0 and j = 1 members stay in the rates as today
- The e >= 0.05 non-resonant identity questions:
  - the q = +-1 and +-2 sidebands (Kaula G_lpq, |q| <= 2) at e >= 0.05: the (0, j) members at j n +- q n and their identity with the narrow set's q in {-1, 0, 1} selection of the tesseral table (double counting at m = 0 must be excluded by construction)
  - the e-linearization of G about the epoch e (as the module's sp_g does for the tesseral table) against the exact Hansen coefficient for the zonal members at e 0.05 to 0.3
  - the j = 1 member at e >= 0.05: the once-per-revolution odd-l term is no longer the small-eccentricity-vector response; whether the odd-l long-period rates (w = +-1) still carry it or a short-period (l, 0, p, q = 0, j = 1) output term is needed
  - the wide-e class above kWideE 0.3: whether the zonal members enter the existing grid (every (l, 0, p, q) term) or stay in this table
  - the radial bias at fixed mean motion (item 3, R0_pred against the measured R0): whether the mean-to-osculating semi-major axis should carry the even-l constant term when the output table is added
