# Second-solution scan on 0.6.2 (FIT-SECOND-SOLUTION.md part 1, report only)

Window-arms published 6312; scanned 6312; fitted 6208. On a second solution (probe fit RMS below 0.98 times the policy's, BTERM outside 0.5 to 2 times): 0. Lower RMS within the band: 2. Control, the scan build's $OCM against the shipped dist's: 810 of 810 byte-identical. The scan's fit RMS equal to the stored 0.5.1 row's (within 1e-9 km): 6194 of 6208.

| Store | Published | Scanned | Fitted | Second solution |
| --- | --: | --: | --: | --: |
| truth | 1888 | 1888 | 1888 | 0 |
| truth2 | 3600 | 3600 | 3553 | 0 |
| regimes | 630 | 630 | 585 | 0 |
| hx | 26 | 26 | 26 | 0 |
| wa | 168 | 168 | 156 | 0 |

Fits whose RMS differs from the stored row's: HE|TESS|2026-08-10 AP72 (382.9 to 174.8 m); HE|TESS|2026-08-10 AP336 (1267.5 to 1082.9 m); HE|TESS|2026-08-17 AP72 (78.0 to 30.2 m); HE|TESS|2026-08-17 AP336 (1939.1 to 1920.4 m); HE|TESS|2026-08-24 AP72 (305.6 to 46.5 m); HE|TESS|2026-08-24 AP336 (452.8 to 376.1 m); HE|TESS|2026-09-07 AP72 (272.7 to 33.3 m); HE|TESS|2026-09-07 AP336 (464.0 to 439.7 m); HE|TESS|2026-07-27 AP72 (412.9 to 95.7 m); HE|TESS|2026-07-27 AP336 (712.9 to 644.7 m); HE|TESS|2026-08-31 AP72 (76.6 to 14.3 m); HE|TESS|2026-08-31 AP336 (687.4 to 679.0 m); HE|TESS|2026-08-03 AP72 (114.6 to 90.2 m); HE|TESS|2026-08-03 AP336 (583.0 to 569.5 m). TESS (HE): the stored 0.5.1 rows were fitted on the chord truth, the scan reads the ten-minute node truth of the TESS re-score (experiments 158285f); refitted on the 0.5.1 dist (d29acd2b5d92) with the scan's inputs, HE|TESS|2026-08-10 gives 174.8 m (AP72) and 1,082.9 m (AP336), the scan's values to the last digit: the input moved, not the build.

## On a second solution

| Store | Window | Arm | Fit RMS (m) | BTERM | Probe fit RMS (m) | Probe BTERM | Start |
| --- | --- | --- | --: | --: | --: | --: | --- |

## Lower fit RMS, BTERM within the band (report only)

| Store | Window | Arm | Fit RMS (m) | BTERM | Probe fit RMS (m) | Probe BTERM | Start |
| --- | --- | --- | --: | --: | --: | --: | --- |
| regimes | GE|J003 QZS-2G|2025-10-04 | AP72 | 5.2 | 0.0005000 | 4.9 | 0.0005000 | A1 |
| wa | WA|GALAXY 30 (G-30)|2026-09-20 | AP24 | 21.1 | 0.01000 | 20.6 | 0.01000 | A1 |
