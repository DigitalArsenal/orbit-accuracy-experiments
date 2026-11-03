# AP 0.4.18 against AP 0.4.11 and AP 0.4.17

Registered 2026-11-03, before any fit of this build on these windows and before any fit of any build on the new altimetry windows. `cycle-ap9.sh` and `ap9-verdict.mjs` (parts truth, truth2, laser, regimes, starlink; `--base 0411` is the gate, `--base 0417` is reported), the `DO9` windows in `lib/regimes.mjs` and `all-regimes.mjs --groups DO9` are part of the registration, with the files AP8.md, AP7.md and AP6.md name.

The owner, 2026-11-03, on the SDN-AP session's stop: "yes to all" to the open decisions, and the program given over. The coordinator, 2026-11-03: the site shows 0.4.11, so the site-move bar is the comparison with 0.4.11; the comparison with 0.4.17 is registered and reported as the SDN-AP session asked, and does not gate the site.

## The build

`propagator/sdn-ap` 0.4.18 at modules 501508b98785f940a60d722ae1ee3a6e79b7105c, `dist/isomorphic/module.wasm`, SHA-256 225bf936f2ad09e68588c84c29e0f4c6fc58f217c5854f0c09e99cda471e66b1, taken with `git archive` from that commit and verified before any fit (844,577 bytes); the module ships no other wasm. Stored beside the older builds as `b0418`, arm `A-APp`. The older arms are the builds AP8 used: `A-APm` 0.4.11 (wasm e4edacb03daff4eaba47263010c27009a6d888259c0d8f028605cebf4d655610, `b0411`) and `A-APo` 0.4.17 (wasm 7d4920ee23f4aecd9f29ef933f4abe98d6cc463b561b3dd7c5f12bbff6ff4c6c, `b0417`). Same forces, weather and priors as AP8.md.

What 0.4.18 does over 0.4.17, stated as its changelog states it. The fitter reports per window the fitted BTERM and AGOM, their posterior widths, the prior used, the arc length and a gap or along-track-step flag (in the `$OBD` BALLISTIC_COEFF_MODEL text, because `$OBD` 0.0.3 has no numeric field for them). After a 72 h fit at 800 to 1,400 km it refits with the 0.4.11 band-median prior when any of these holds:

- the BTERM log posterior sigma is above 0.5;
- BTERM sits more than 3 sigma from the band median while the fit RMS is above 18.95 m (25 % over the band's median 15.16 m);
- two fitted states are more than two revolutions apart;
- the along-track residuals show a velocity step of at least 0.002 m/s at an F ratio of 100 or more.

On the 136 paired AP8 windows the rule acted as a class switch. Every in-band Sentinel-3A and 3B window fell back (Sentinel-3 arcs run 19 to 22 m RMS; SWOT, HY-2 and Jason-3 run 15 to 18 m). Sentinel-6 MF fell back on 13 of 15 windows (within 1.3 %). 37 of the 136 windows fell back and each equals 0.4.11 exactly; the other 99 equal 0.4.17 exactly. The fall-back repairs the three real losses (Sentinel-3A 2025-10-15 day 3, 0.312 to 0.087 km; Sentinel-3B 2025-10-25 day 7, 1.335 to 0.113 km) but gives up 0.4.17's Sentinel-3 gains (3A 2025-11-24 day 3, 0.072 to 1.506 km; 3A 2025-10-30, 0.128 to 0.502 km; 3B 2025-10-30, 0.114 to 0.482 km; Sentinel-3 day-1 median 0.058 to 0.090 km), and does not reach Jason-3 2025-10-10 (+23 % at day 3). SARAL and CryoSat-2 are bit-identical to 0.4.17. XP, the module with its forces off, keeps the conformance digest 72dcf6005046 (bit-exact). Fit cost per 72 h arc: 1.68 to 1.71 s outside the band, 1.83 to 2.21 s in the band on the default path, 1.79 to 3.43 s when the fall-back runs. If the site moves, it must describe the rule this plainly.

## What was already read

Disclosure, in full. The diagnosis and the 0.4.18 build read the 150 DO rows of each of `/opt/data/sdn-archive/operator-theory/ap/b0417/regimes-apxp/rows-0..7.jsonl` and `b0411/regimes-apxp/rows-0..11.jsonl` (lines read as text, only lines containing `"group":"DO"` parsed; the logs folders not opened); 3 LS rows (Starlette 2025-10-25 and 2025-10-30, Westpac 2025-11-19) from a first look at `b0417` `rows-0.jsonl`; a DO count over `b0411/regimes`; the 116 truth OEM files listed in `AP9-read-files.txt` under `reference-leo-pod-2` (late 2025), against which the 136 paired AP8 windows were refit while setting the rule's thresholds; as-issued `$SPW` rows from the `ap-gap` store through the vendored replay library. Not read: any other DO date, Starlink, the six held Galileo, C2 rows.

Also read, by this lane before this registration: AP8's statement tables and the Sentinel-6B altimetry windows of both versions (the orbit-raising burns, `results/ap-truth/README.md`); and, from file names only (no content), the DORIS truth directory listing under `reference-leo-pod-2`, which chose the windows below. No row, state or fit of any build touches the new windows before this file is pushed.

## Arms

`A-APp` 0.4.18, `A-APo` 0.4.17 and `A-APm` 0.4.11, each as AP8.md ran its arm: AP at tesseral 31, zonal 20, the module's fit, as-issued weather; XP for the regimes. Parts T, N and L run 0.4.18 on AP7.md's windows (new store `b0418`); the older builds' rows are the stores AP8 and AP7 wrote. Part R runs 0.4.18 on AP6.md's windows other than altimetry (`LS`, `GD`, `IG`, `GE`, `HE`, `HX`, WAAS) and all three builds on the new altimetry windows below (`do9-apxp` in each build's store). AP6.md's old altimetry windows are not rerun at 0.4.18: the build was refit against them.

## The new altimetry windows

Group `DO` (ten satellites: Jason-3, Sentinel-3A, 3B, 6A, 6B, SARAL, SWOT, CryoSat-2, HY-2C, HY-2D), CNES DORIS precise orbits as AP6.md, the same rules: 24 h and 72 h fits ending at 00:00 UTC, 15 fit epochs per satellite every 5 days from 2026-02-02 to 2026-04-13 (ten weeks; AP6's weeks were 2025-10-10 to 2025-12-21). Each window needs truth from three days before its epoch to seven days after; the coverage rule is AP6.md's. None of the 102 truth files below is among the 116 the 0.4.18 build refit against (checked by name: 0 of 102), none lies in AP6's ten weeks, and all are in the archive; nothing is fetched. All ten satellites have all 15 epochs, 150 windows, so the power is AP6's. A window failing the coverage rule counts as AP6.md counts it (rule 3's failed share). Satellite, fit epoch, truth files (product directory names under `/opt/data/sdn-archive/reference-states/reference-leo-pod-2`, `.DG_` omitted):

```
Jason-3 2026-02-02: ssaja330.b26029.e26039 ssaja330.b26039.e26049
Jason-3 2026-02-07: ssaja330.b26029.e26039 ssaja330.b26039.e26049
Jason-3 2026-02-12: ssaja330.b26039.e26049 ssaja330.b26049.e26059
Jason-3 2026-02-17: ssaja330.b26039.e26049 ssaja330.b26049.e26059
Jason-3 2026-02-22: ssaja330.b26049.e26059 ssaja330.b26059.e26069
Jason-3 2026-02-27: ssaja330.b26049.e26059 ssaja330.b26059.e26069
Jason-3 2026-03-04: ssaja330.b26059.e26069 ssaja330.b26069.e26079
Jason-3 2026-03-09: ssaja330.b26059.e26069 ssaja330.b26069.e26079
Jason-3 2026-03-14: ssaja330.b26069.e26079 ssaja330.b26079.e26088
Jason-3 2026-03-19: ssaja330.b26069.e26079 ssaja330.b26079.e26088
Jason-3 2026-03-24: ssaja330.b26079.e26088 ssaja330.b26088.e26098
Jason-3 2026-03-29: ssaja330.b26079.e26088 ssaja330.b26088.e26098
Jason-3 2026-04-03: ssaja330.b26088.e26098 ssaja330.b26098.e26108
Jason-3 2026-04-08: ssaja330.b26088.e26098 ssaja330.b26098.e26108
Jason-3 2026-04-13: ssaja330.b26098.e26108 ssaja330.b26108.e26118
Sentinel-3A 2026-02-02: ssas3a30.b26028.e26038 ssas3a30.b26037.e26047
Sentinel-3A 2026-02-07: ssas3a30.b26028.e26038 ssas3a30.b26037.e26047
Sentinel-3A 2026-02-12: ssas3a30.b26037.e26047 ssas3a30.b26046.e26056
Sentinel-3A 2026-02-17: ssas3a30.b26037.e26047 ssas3a30.b26046.e26056
Sentinel-3A 2026-02-22: ssas3a30.b26046.e26056 ssas3a30.b26055.e26065
Sentinel-3A 2026-02-27: ssas3a30.b26046.e26056 ssas3a30.b26055.e26065 ssas3a30.b26064.e26074
Sentinel-3A 2026-03-04: ssas3a30.b26055.e26065 ssas3a30.b26064.e26074
Sentinel-3A 2026-03-09: ssas3a30.b26064.e26074 ssas3a30.b26073.e26083
Sentinel-3A 2026-03-14: ssas3a30.b26064.e26074 ssas3a30.b26073.e26083
Sentinel-3A 2026-03-19: ssas3a30.b26073.e26083 ssas3a30.b26082.e26092
Sentinel-3A 2026-03-24: ssas3a30.b26073.e26083 ssas3a30.b26082.e26092
Sentinel-3A 2026-03-29: ssas3a30.b26082.e26092 ssas3a30.b26091.e26101
Sentinel-3A 2026-04-03: ssas3a30.b26082.e26092 ssas3a30.b26091.e26101
Sentinel-3A 2026-04-08: ssas3a30.b26091.e26101 ssas3a30.b26100.e26110
Sentinel-3A 2026-04-13: ssas3a30.b26091.e26101 ssas3a30.b26100.e26110 ssas3a30.b26109.e26119
Sentinel-3B 2026-02-02: ssas3b30.b26029.e26039 ssas3b30.b26038.e26048
Sentinel-3B 2026-02-07: ssas3b30.b26029.e26039 ssas3b30.b26038.e26048
Sentinel-3B 2026-02-12: ssas3b30.b26038.e26048 ssas3b30.b26047.e26057
Sentinel-3B 2026-02-17: ssas3b30.b26038.e26048 ssas3b30.b26047.e26057
Sentinel-3B 2026-02-22: ssas3b30.b26047.e26057 ssas3b30.b26056.e26066
Sentinel-3B 2026-02-27: ssas3b30.b26047.e26057 ssas3b30.b26056.e26066
Sentinel-3B 2026-03-04: ssas3b30.b26056.e26066 ssas3b30.b26065.e26075
Sentinel-3B 2026-03-09: ssas3b30.b26056.e26066 ssas3b30.b26065.e26075 ssas3b30.b26074.e26084
Sentinel-3B 2026-03-14: ssas3b30.b26065.e26075 ssas3b30.b26074.e26084
Sentinel-3B 2026-03-19: ssas3b30.b26074.e26084 ssas3b30.b26083.e26093
Sentinel-3B 2026-03-24: ssas3b30.b26074.e26084 ssas3b30.b26083.e26093
Sentinel-3B 2026-03-29: ssas3b30.b26083.e26093 ssas3b30.b26092.e26102
Sentinel-3B 2026-04-03: ssas3b30.b26083.e26093 ssas3b30.b26092.e26102
Sentinel-3B 2026-04-08: ssas3b30.b26092.e26102 ssas3b30.b26101.e26111
Sentinel-3B 2026-04-13: ssas3b30.b26092.e26102 ssas3b30.b26101.e26111
Sentinel-6A 2026-02-02: ssas6a30.b26024.e26034 ssas6a30.b26034.e26044
Sentinel-6A 2026-02-07: ssas6a30.b26034.e26044 ssas6a30.b26044.e26054
Sentinel-6A 2026-02-12: ssas6a30.b26034.e26044 ssas6a30.b26044.e26054
Sentinel-6A 2026-02-17: ssas6a30.b26044.e26054 ssas6a30.b26054.e26064
Sentinel-6A 2026-02-22: ssas6a30.b26044.e26054 ssas6a30.b26054.e26064
Sentinel-6A 2026-02-27: ssas6a30.b26054.e26064 ssas6a30.b26064.e26074
Sentinel-6A 2026-03-04: ssas6a30.b26054.e26064 ssas6a30.b26064.e26074
Sentinel-6A 2026-03-09: ssas6a30.b26064.e26074 ssas6a30.b26074.e26084
Sentinel-6A 2026-03-14: ssas6a30.b26064.e26074 ssas6a30.b26074.e26084
Sentinel-6A 2026-03-19: ssas6a30.b26074.e26084 ssas6a30.b26084.e26093
Sentinel-6A 2026-03-24: ssas6a30.b26074.e26084 ssas6a30.b26084.e26093
Sentinel-6A 2026-03-29: ssas6a30.b26084.e26093 ssas6a30.b26093.e26103
Sentinel-6A 2026-04-03: ssas6a30.b26084.e26093 ssas6a30.b26093.e26103
Sentinel-6A 2026-04-08: ssas6a30.b26093.e26103 ssas6a30.b26103.e26113
Sentinel-6A 2026-04-13: ssas6a30.b26093.e26103 ssas6a30.b26103.e26113
Sentinel-6B 2026-02-02: ssas6b30.b26024.e26034 ssas6b30.b26034.e26044
Sentinel-6B 2026-02-07: ssas6b30.b26034.e26044 ssas6b30.b26044.e26054
Sentinel-6B 2026-02-12: ssas6b30.b26034.e26044 ssas6b30.b26044.e26054
Sentinel-6B 2026-02-17: ssas6b30.b26044.e26054 ssas6b30.b26054.e26064
Sentinel-6B 2026-02-22: ssas6b30.b26044.e26054 ssas6b30.b26054.e26064
Sentinel-6B 2026-02-27: ssas6b30.b26054.e26064 ssas6b30.b26064.e26074
Sentinel-6B 2026-03-04: ssas6b30.b26054.e26064 ssas6b30.b26064.e26074
Sentinel-6B 2026-03-09: ssas6b30.b26064.e26074 ssas6b30.b26074.e26084
Sentinel-6B 2026-03-14: ssas6b30.b26064.e26074 ssas6b30.b26074.e26084
Sentinel-6B 2026-03-19: ssas6b30.b26074.e26084 ssas6b30.b26084.e26093
Sentinel-6B 2026-03-24: ssas6b30.b26074.e26084 ssas6b30.b26084.e26093
Sentinel-6B 2026-03-29: ssas6b30.b26084.e26093 ssas6b30.b26093.e26103
Sentinel-6B 2026-04-03: ssas6b30.b26084.e26093 ssas6b30.b26093.e26103
Sentinel-6B 2026-04-08: ssas6b30.b26093.e26103 ssas6b30.b26103.e26113
Sentinel-6B 2026-04-13: ssas6b30.b26093.e26103 ssas6b30.b26103.e26113
SARAL 2026-02-02: ssasrl20.b26025.e26033.D__ ssasrl20.b26032.e26040.D__ ssasrl20.b26039.e26047.D__
SARAL 2026-02-07: ssasrl20.b26032.e26040.D__ ssasrl20.b26039.e26047.D__
SARAL 2026-02-12: ssasrl20.b26039.e26047.D__ ssasrl20.b26046.e26054.D__
SARAL 2026-02-17: ssasrl20.b26039.e26047.D__ ssasrl20.b26046.e26054.D__ ssasrl20.b26053.e26061.D__
SARAL 2026-02-22: ssasrl20.b26046.e26054.D__ ssasrl20.b26053.e26061.D__
SARAL 2026-02-27: ssasrl20.b26053.e26061.D__ ssasrl20.b26060.e26068.D__
SARAL 2026-03-04: ssasrl20.b26053.e26061.D__ ssasrl20.b26060.e26068.D__ ssasrl20.b26067.e26075.D__
SARAL 2026-03-09: ssasrl20.b26060.e26068.D__ ssasrl20.b26067.e26075.D__ ssasrl20.b26074.e26082.D__
SARAL 2026-03-14: ssasrl20.b26067.e26075.D__ ssasrl20.b26074.e26082.D__
SARAL 2026-03-19: ssasrl20.b26074.e26082.D__ ssasrl20.b26081.e26089.D__
SARAL 2026-03-24: ssasrl20.b26074.e26082.D__ ssasrl20.b26081.e26089.D__ ssasrl20.b26088.e26096.D__
SARAL 2026-03-29: ssasrl20.b26081.e26089.D__ ssasrl20.b26088.e26096.D__
SARAL 2026-04-03: ssasrl20.b26088.e26096.D__ ssasrl20.b26095.e26103.D__
SARAL 2026-04-08: ssasrl20.b26088.e26096.D__ ssasrl20.b26095.e26103.D__ ssasrl20.b26102.e26110.D__
SARAL 2026-04-13: ssasrl20.b26095.e26103.D__ ssasrl20.b26102.e26110.D__ ssasrl20.b26109.e26117.D__
SWOT 2026-02-02: ssaswo20.b26029.e26037 ssaswo20.b26036.e26044
SWOT 2026-02-07: ssaswo20.b26029.e26037 ssaswo20.b26036.e26044 ssaswo20.b26043.e26051
SWOT 2026-02-12: ssaswo20.b26036.e26044 ssaswo20.b26043.e26051
SWOT 2026-02-17: ssaswo20.b26043.e26051 ssaswo20.b26050.e26058
SWOT 2026-02-22: ssaswo20.b26043.e26051 ssaswo20.b26050.e26058 ssaswo20.b26057.e26065
SWOT 2026-02-27: ssaswo20.b26050.e26058 ssaswo20.b26057.e26065 ssaswo20.b26064.e26072
SWOT 2026-03-04: ssaswo20.b26057.e26065 ssaswo20.b26064.e26072
SWOT 2026-03-09: ssaswo20.b26064.e26072 ssaswo20.b26071.e26079
SWOT 2026-03-14: ssaswo20.b26064.e26072 ssaswo20.b26071.e26079 ssaswo20.b26078.e26086
SWOT 2026-03-19: ssaswo20.b26071.e26079 ssaswo20.b26078.e26086
SWOT 2026-03-24: ssaswo20.b26078.e26086 ssaswo20.b26085.e26093
SWOT 2026-03-29: ssaswo20.b26078.e26086 ssaswo20.b26085.e26093 ssaswo20.b26092.e26100
SWOT 2026-04-03: ssaswo20.b26085.e26093 ssaswo20.b26092.e26100 ssaswo20.b26099.e26107
SWOT 2026-04-08: ssaswo20.b26092.e26100 ssaswo20.b26099.e26107
SWOT 2026-04-13: ssaswo20.b26099.e26107 ssaswo20.b26106.e26114
CryoSat-2 2026-02-02: ssacs220.b26023.e26031.D__ ssacs220.b26030.e26038.D__ ssacs220.b26037.e26045.D__
CryoSat-2 2026-02-07: ssacs220.b26030.e26038.D__ ssacs220.b26037.e26045.D__ ssacs220.b26044.e26052.D__
CryoSat-2 2026-02-12: ssacs220.b26037.e26045.D__ ssacs220.b26044.e26052.D__
CryoSat-2 2026-02-17: ssacs220.b26044.e26052.D__ ssacs220.b26051.e26059.D__
CryoSat-2 2026-02-22: ssacs220.b26044.e26052.D__ ssacs220.b26051.e26059.D__ ssacs220.b26058.e26066.D__
CryoSat-2 2026-02-27: ssacs220.b26051.e26059.D__ ssacs220.b26058.e26066.D__
CryoSat-2 2026-03-04: ssacs220.b26058.e26066.D__ ssacs220.b26065.e26073.D__
CryoSat-2 2026-03-09: ssacs220.b26058.e26066.D__ ssacs220.b26065.e26073.D__ ssacs220.b26072.e26080.D__
CryoSat-2 2026-03-14: ssacs220.b26065.e26073.D__ ssacs220.b26072.e26080.D__ ssacs220.b26079.e26087.D__
CryoSat-2 2026-03-19: ssacs220.b26072.e26080.D__ ssacs220.b26079.e26087.D__
CryoSat-2 2026-03-24: ssacs220.b26079.e26087.D__ ssacs220.b26086.e26094.D__
CryoSat-2 2026-03-29: ssacs220.b26079.e26087.D__ ssacs220.b26086.e26094.D__ ssacs220.b26093.e26101.D__
CryoSat-2 2026-04-03: ssacs220.b26086.e26094.D__ ssacs220.b26093.e26101.D__
CryoSat-2 2026-04-08: ssacs220.b26093.e26101.D__ ssacs220.b26100.e26108.D__
CryoSat-2 2026-04-13: ssacs220.b26093.e26101.D__ ssacs220.b26100.e26108.D__ ssacs220.b26107.e26115.D__
HY-2C 2026-02-02: ssah2c30.b26028.e26038 ssah2c30.b26038.e26048
HY-2C 2026-02-07: ssah2c30.b26028.e26038 ssah2c30.b26038.e26048
HY-2C 2026-02-12: ssah2c30.b26038.e26048 ssah2c30.b26047.e26057
HY-2C 2026-02-17: ssah2c30.b26038.e26048 ssah2c30.b26047.e26057
HY-2C 2026-02-22: ssah2c30.b26047.e26057 ssah2c30.b26057.e26067
HY-2C 2026-02-27: ssah2c30.b26047.e26057 ssah2c30.b26057.e26067
HY-2C 2026-03-04: ssah2c30.b26057.e26067 ssah2c30.b26067.e26077
HY-2C 2026-03-09: ssah2c30.b26057.e26067 ssah2c30.b26067.e26077
HY-2C 2026-03-14: ssah2c30.b26067.e26077 ssah2c30.b26077.e26087
HY-2C 2026-03-19: ssah2c30.b26067.e26077 ssah2c30.b26077.e26087
HY-2C 2026-03-24: ssah2c30.b26077.e26087 ssah2c30.b26087.e26097
HY-2C 2026-03-29: ssah2c30.b26077.e26087 ssah2c30.b26087.e26097
HY-2C 2026-04-03: ssah2c30.b26087.e26097 ssah2c30.b26097.e26107
HY-2C 2026-04-08: ssah2c30.b26087.e26097 ssah2c30.b26097.e26107
HY-2C 2026-04-13: ssah2c30.b26097.e26107 ssah2c30.b26107.e26117
HY-2D 2026-02-02: ssah2d30.b26025.e26035 ssah2d30.b26035.e26045
HY-2D 2026-02-07: ssah2d30.b26035.e26045
HY-2D 2026-02-12: ssah2d30.b26035.e26045 ssah2d30.b26045.e26055
HY-2D 2026-02-17: ssah2d30.b26045.e26055
HY-2D 2026-02-22: ssah2d30.b26045.e26055 ssah2d30.b26055.e26065
HY-2D 2026-02-27: ssah2d30.b26055.e26065
HY-2D 2026-03-04: ssah2d30.b26055.e26065 ssah2d30.b26065.e26075
HY-2D 2026-03-09: ssah2d30.b26065.e26075
HY-2D 2026-03-14: ssah2d30.b26065.e26075 ssah2d30.b26075.e26085
HY-2D 2026-03-19: ssah2d30.b26075.e26085 ssah2d30.b26084.e26094
HY-2D 2026-03-24: ssah2d30.b26075.e26085 ssah2d30.b26084.e26094
HY-2D 2026-03-29: ssah2d30.b26084.e26094 ssah2d30.b26094.e26104
HY-2D 2026-04-03: ssah2d30.b26084.e26094 ssah2d30.b26094.e26104
HY-2D 2026-04-08: ssah2d30.b26094.e26104 ssah2d30.b26104.e26114
HY-2D 2026-04-13: ssah2d30.b26094.e26104 ssah2d30.b26104.e26114
```

## Statements

The statistics, rules 1, 1n, 2 and 3, the seed rule, the clusters (ISO week) and the failed-share cap are AP7.md's and AP8.md's, unchanged; "does not lose" is rule 1n (the upper bound of the interval of the median d below ln 1.02; 0.005 km on Part L). The gate compares 0.4.18 with 0.4.11 by pair (`--base 0411`).

1. Part T, `APRa12` and `AP24` do not lose at days 1, 2, 3 and 7.
2. Part N, `AP72` in `S1` and in `GN` does not lose at days 1, 2, 3 and 7.
3. Part L, `low` (48 h fits, 24 h and 72 h) and `navigation` (72 h fits, 72 h and 168 h) do not lose.
4a. The site-move bar: Part R, `DO` on the new windows, `AP72` at 0.4.18 beats `AP72` at 0.4.11, AP8.md's statement 4 with 0.4.11 as the baseline: rule 1 at days 1 and 3; rules 2 and 3 at days 1, 2, 3 and 7. Registered as AP8.md wrote statement 4 ("beats"); the weaker "does not lose" reading (rule 1n with rules 2 and 3) is printed beside it as a report, and does not gate.
4b. Reported either way, not gating: the same test of 0.4.18 against 0.4.17 (`--base 0417`), with the per-satellite table of medians for 0.4.18, the baseline and XP.
5. Part R, `LS` and `GD` do not lose (rules 1n, 2, 3) at days 1, 2, 3 and 7.
6. `DO` on the new windows, `AP72` beats `XP72` at 0.4.18, AP6.md's statement 2, reported either way.

Reported, not statements: every contrast with 0.4.17 for statements 1, 2, 3 and 5 (`--base 0417`); the pooled medians and 95th percentiles of the three builds on the new altimetry windows, as AP8 reported them; `IG`, `GE`, `HE`, `HX`, WAAS, every 24 h arc, Part S (Starlink, the stored confirmation pairs, as AP8 ran it), every contrast with SGP4 and FFM.

## What moves on a pass

The site moves to 0.4.18 as a whole only if statements 1, 2, 3, 4a and 5 pass against 0.4.11. Statements 4b and 6 are reported either way. On a pass, AP's and XP's arms are rerun at this build wherever the site shows them, merged with `ap7-merge.mjs` (old and new builds changed), and `lib/build.mjs`, the sdn-ap repository's `tools/site.json`, `rigor/claims.json` and the pages move in one push, in the owner's voice, describing the fall-back rule as above. If any of 1, 2, 3, 4a or 5 fails, the site stays at 0.4.11 and says why.

## Limits

- Parts T, N and L, `LS`, `GD` and the Starlink pairs are windows read for the older builds; 0.4.18 fell back to 0.4.11 or equals 0.4.17 on most of them by construction.
- Only altimetry is new, and the thresholds of the fall-back were set on the AP6 altimetry windows, so the new windows are the test of the rule. Ten satellites over ten weeks, one regime.
- Satellites with maneuvers in the new weeks count as they come; the truth is the product.
- No eccentric orbit with drag has precise-orbit truth here.

No arm, window, margin or rule changes after this registration.
