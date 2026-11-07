# Fitted sets against sdn-ap 0.6.4's class rule

The AP fits behind the precise-orbit rows of cells.json, each window fitted again and the set's MEAN_ELEMENTS read, against sdn-ap 0.6.4's class rule. No flight.

Build: Fitted on propagator/sdn-ap 0.5.1 (modules ea824356, dist d29acd2b5d92), the build the cells were flown on, by each store's own runner (all-regimes.mjs, ap-truth.mjs) with the fit's result logged in place of its flight (the two .patch files). The THEMIS and Chandra rows flew on 0.6.3; their sets here are 0.5.1's fits, above 0.3 on both.

Rule: propagator/sdn-ap/src/tesseral.inc at modules cfd750eb8: wide_set(cls, e0) = e0 > (cls == 0 ? 0.05 : 0.3), cls = res::band_of(n0). A set moves only where that answer differs from 0.6.3's e0 > 0.3: class 0 with 0.05 < e <= 0.3.

Coverage: Read at every window, AP and whiteroom XP arms: LS, DO, GD, GE, IG, HE, HX, WA (the regimes, regimes-hx and regimes-wa stores); GRACE-FO (Research satellite 1 and 2) at every window, AP arm alone. Sampled, every fifth window, AP arm alone: Swarm, Sentinel-1 and the medium Earth orbit satellites. Whiteroom XP on the truth and truth2 stores is not read here. A window whose arc had too little coverage has no set, as in its store.

3353 sets from 1386 windows; 0 in the band. The largest class 0 eccentricity below the band is 0.0213, the smallest above it 0.4541.

| Group | Satellite | Year | Coverage | Windows | Sets | Class | n (rev/day) | e | In band |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DO | CRYOSAT 2 |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 14.5284 to 14.5286 | 0.00128 to 0.00134 | 0 |
| DO | HAIYANG 2C |  | every window, AP and whiteroom XP | 11 | 44 | 0 | 13.8380 to 13.8381 | 0.00047 to 0.00051 | 0 |
| DO | HAIYANG 2D |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 13.8379 to 13.8381 | 0.00017 to 0.00020 | 0 |
| DO | JASON 3 |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 12.8799 | 0.00010 to 0.00018 | 0 |
| DO | S6 MICHAEL FREILICH |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 12.8129 | 0.00009 to 0.00012 | 0 |
| DO | SARAL |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 14.3358 to 14.3362 | 0.00096 to 0.00133 | 0 |
| DO | SENTINEL 3A |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 14.2758 to 14.2760 | 0.00112 to 0.00115 | 0 |
| DO | SENTINEL 3B |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 14.2758 to 14.2759 | 0.00108 to 0.00119 | 0 |
| DO | SENTINEL-6B |  | every window, AP and whiteroom XP | 5 | 20 | 0 | 12.8129 to 12.8624 | 0.00010 to 0.00122 | 0 |
| DO | SWOT |  | every window, AP and whiteroom XP | 15 | 60 | 0 | 14.0092 to 14.0093 | 0.00098 to 0.00104 | 0 |
| GD | ETALON 1 |  | every window, AP and whiteroom XP | 11 | 22 | 2 | 2.1316 | 0.00218 to 0.00221 | 0 |
| GD | ETALON 2 |  | every window, AP and whiteroom XP | 11 | 22 | 2 | 2.1321 | 0.00190 to 0.00191 | 0 |
| GD | LAGEOS 1 |  | every window, AP and whiteroom XP | 11 | 22 | 0 | 6.3876 | 0.00432 to 0.00447 | 0 |
| GD | LAGEOS 2 |  | every window, AP and whiteroom XP | 11 | 22 | 0 | 6.4728 | 0.01426 to 0.01427 | 0 |
| GD | LARES-2 |  | every window, AP and whiteroom XP | 10 | 20 | 0 | 6.3906 | 0.00086 to 0.00094 | 0 |
| GE | C006 BDS-2G |  | every window, AP and whiteroom XP | 3 | 6 | 1 | 1.0026 | 0.00092 to 0.00100 | 0 |
| GE | C011 BDS-2G |  | every window, AP and whiteroom XP | 3 | 6 | 1 | 1.0027 | 0.00075 to 0.00088 | 0 |
| GE | C016 BDS-2G |  | every window, AP and whiteroom XP | 3 | 6 | 1 | 1.0027 to 1.0028 | 0.00059 to 0.00064 | 0 |
| GE | C018 BDS-2G |  | every window, AP and whiteroom XP | 4 | 8 | 1 | 1.0026 to 1.0027 | 0.00044 to 0.00056 | 0 |
| GE | C020 BDS-2G |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0027 | 0.00062 to 0.00072 | 0 |
| GE | C217 BDS-3G |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0027 | 0.00027 to 0.00041 | 0 |
| GE | C229 BDS-3G |  | every window, AP and whiteroom XP | 4 | 8 | 1 | 1.0027 | 0.00014 to 0.00030 | 0 |
| GE | C231 BDS-3G |  | every window, AP and whiteroom XP | 3 | 6 | 1 | 1.0026 | 0.00053 to 0.00060 | 0 |
| GE | J003 QZS-2G |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0027 | 0.00022 to 0.00027 | 0 |
| GN | E218 GAL-2 | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 60 | 2 | 1.7047 | 0.00007 to 0.00022 | 0 |
| GN | G053 GPS-IIR-M | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 60 | 2 | 2.0057 to 2.0058 | 0.01257 to 0.01289 | 0 |
| GN | G073 GPS-IIF | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 60 | 2 | 2.0057 | 0.01092 to 0.01099 | 0 |
| GN | R743 GLO-M | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 59 | 2 | 2.1311 | 0.00235 to 0.00257 | 0 |
| GN | R859 GLO-M+ | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 60 | 2 | 2.1311 | 0.00110 to 0.00133 | 0 |
| HE | TESS |  | every window, AP and whiteroom XP | 7 | 28 | 0 | 0.0678 to 0.0706 | 0.45408 to 0.49363 | 0 |
| HX | CHANDRA |  | every window, AP and whiteroom XP | 7 | 28 | 0 | 0.3778 to 0.3781 | 0.68473 to 0.68661 | 0 |
| HX | THEMIS A |  | every window, AP and whiteroom XP | 4 | 8 | 1 | 1.0493 to 1.0494 | 0.82348 to 0.82466 | 0 |
| HX | THEMIS D |  | every window, AP and whiteroom XP | 4 | 8 | 1 | 1.0498 to 1.0499 | 0.82098 to 0.82223 | 0 |
| HX | THEMIS E |  | every window, AP and whiteroom XP | 4 | 8 | 1 | 1.0496 to 1.0497 | 0.82128 to 0.82250 | 0 |
| IG | C005 BDS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0030 | 0.00500 to 0.00502 | 0 |
| IG | C007 BDS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0025 to 1.0026 | 0.00468 to 0.00476 | 0 |
| IG | C008 BDS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0029 | 0.00362 to 0.00367 | 0 |
| IG | C009 BDS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0026 | 0.01437 to 0.01441 | 0 |
| IG | C010 BDS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0026 to 1.0027 | 0.01085 to 0.01094 | 0 |
| IG | C017 BDS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0027 | 0.00558 to 0.00562 | 0 |
| IG | C019 BDS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0028 | 0.00905 to 0.00908 | 0 |
| IG | C220 BDS-3I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0026 to 1.0027 | 0.00249 to 0.00252 | 0 |
| IG | C221 BDS-3I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0029 | 0.00365 to 0.00366 | 0 |
| IG | C224 BDS-3I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0026 to 1.0027 | 0.00449 to 0.00452 | 0 |
| IG | J002 QZS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0025 to 1.0026 | 0.07464 to 0.07487 | 0 |
| IG | J004 QZS-2I |  | every window, AP and whiteroom XP | 5 | 10 | 1 | 1.0027 | 0.07463 to 0.07488 | 0 |
| LS | AJISAI |  | every window, AP and whiteroom XP | 13 | 52 | 0 | 12.4435 to 12.4436 | 0.00039 to 0.00185 | 0 |
| LS | LARES |  | every window, AP and whiteroom XP | 14 | 48 | 0 | 12.5536 | 0.00025 to 0.00076 | 0 |
| LS | LARETS |  | every window, AP and whiteroom XP | 14 | 52 | 0 | 14.6470 to 14.6473 | 0.00008 to 0.00241 | 0 |
| LS | STARLETTE |  | every window, AP and whiteroom XP | 14 | 54 | 0 | 13.8213 to 13.8214 | 0.01995 to 0.02134 | 0 |
| LS | STELLA |  | every window, AP and whiteroom XP | 13 | 46 | 0 | 14.2831 | 0.00056 to 0.00177 | 0 |
| LS | WESTPAC |  | every window, AP and whiteroom XP | 14 | 48 | 0 | 14.2387 to 14.2388 | 0.00107 to 0.00127 | 0 |
| P | GRACE-FO 1 | 2025 | every window, AP alone | 79 | 158 | 0 | 15.3665 to 15.3766 | 0.00029 to 0.00254 | 0 |
| P | GRACE-FO 1 | 2026 | every window, AP alone | 150 | 300 | 0 | 15.3776 to 15.3921 | 0.00027 to 0.00248 | 0 |
| P | GRACE-FO 2 | 2025 | every window, AP alone | 79 | 158 | 0 | 15.3665 to 15.3766 | 0.00029 to 0.00254 | 0 |
| P | GRACE-FO 2 | 2026 | every window, AP alone | 150 | 300 | 0 | 15.3776 to 15.3922 | 0.00027 to 0.00248 | 0 |
| P | Swarm A | 2025 | every fifth window (cutoff day number divisible by 5), AP alone | 53 | 106 | 0 | 15.4179 to 15.4768 | 0.00132 to 0.00146 | 0 |
| P | Swarm A | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 60 | 0 | 15.4800 to 15.5154 | 0.00134 to 0.00148 | 0 |
| P | Swarm B | 2025 | every fifth window (cutoff day number divisible by 5), AP alone | 53 | 106 | 0 | 15.2564 to 15.2812 | 0.00130 to 0.00144 | 0 |
| P | Swarm B | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 60 | 0 | 15.2822 to 15.2946 | 0.00133 to 0.00147 | 0 |
| P | Swarm C | 2025 | every fifth window (cutoff day number divisible by 5), AP alone | 53 | 106 | 0 | 15.4179 to 15.4768 | 0.00132 to 0.00146 | 0 |
| P | Swarm C | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 30 | 60 | 0 | 15.4800 to 15.5154 | 0.00134 to 0.00148 | 0 |
| S1 | Sentinel-1A | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 27 | 53 | 0 | 14.6010 to 14.6011 | 0.00118 to 0.00119 | 0 |
| S1 | Sentinel-1C | 2026 | every fifth window (cutoff day number divisible by 5), AP alone | 27 | 53 | 0 | 14.6009 to 14.6011 | 0.00118 to 0.00119 | 0 |
| WA | EUTELSAT 117 WEST B |  | every window, AP and whiteroom XP | 26 | 90 | 1 | 1.0027 | 0.00001 to 0.00011 | 0 |
| WA | GALAXY 30 (G-30) |  | every window, AP and whiteroom XP | 28 | 112 | 1 | 1.0026 to 1.0027 | 0.00017 to 0.00028 | 0 |
| WA | SES-15 |  | every window, AP and whiteroom XP | 28 | 110 | 1 | 1.0026 to 1.0027 | 0.00001 to 0.00010 | 0 |

`table.mjs --check` reproduces this file and table.json from the rows-*.jsonl beside it.
