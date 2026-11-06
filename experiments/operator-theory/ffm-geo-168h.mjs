// FFM-GEO-168H.md: the GEO force settings of FFM 2.2.1 beside AP 0.6.3, each entry from a named file by SHA-256, and the paired FFM/AP ratio
// on every geostationary (GFZ) window of the landed cells at fit 72 h, leads 48, 72 and 168 h, with its window-cluster 95 % interval. Report
// only: no flight, no module change, no burn verdict. Statistics on stored rows only; no physics here.
//   node experiments/operator-theory/ffm-geo-168h.mjs            writes results/ap-truth/ffm-geo-168h/{table.json,README.md}
//   node experiments/operator-theory/ffm-geo-168h.mjs --check    recomputes both from the stores, holds them to the bytes on disk, re-hashes
//                                                                 every cited source it can reach, prints the verdict; PASS or FAIL.
// SDN_MODULES_ROOT: a checkout holding the module sources at modules 93cb5a058 (default: the -covm clone); absent, they are not re-hashed.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { median, pct, asc, rand } from './lib/compare.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(REPO, 'results/ap-truth/ffm-geo-168h');
const AP = '/opt/data/sdn-archive/operator-theory/ap';
const MODULES = process.env.SDN_MODULES_ROOT ?? '/Users/tj/software/private/coordinator-d9/space-data-network-modules-covm';
const CHECK = process.argv.includes('--check');
const HOUR = 3600000, DRAWS = 10000;
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const short = (h) => h.slice(0, 8);

// Every source the table cites, by its SHA-256 at the registered state: experiments 1d12fb5b (this repository) and modules 93cb5a058.
const MODULES_COMMIT = '93cb5a0584fa728864e4426cc9ceb368936589f9';
const SRC = {
  experiments: {
    'experiments/operator-theory/all-regimes.mjs': 'b09c0d16ddf3831b5d007e355ab29924ce1c9798bd8d2b668bf5c58bd0c286d6',
    'experiments/operator-theory/lib/ap.mjs': '08ecf5f294c3b42c7ebb618f45f408a8ec3ad981dd4172bdfe0f13bd33165d7b',
    'experiments/operator-theory/lib/frame.mjs': '9d2084b86cb4def6adb8b7fe15f8f45880d92a5142408915303b98c81271b9ce',
    'experiments/operator-theory/lib/fit.mjs': 'e8393b0264378b3fa2e0901798503ad0eee5e7e50369c55c5774c539bb5db329',
    'experiments/operator-theory/lib/host.mjs': '47373ddbb3503f19c4dd12355388105cbb772794e068874c2444cd96ccc6220d',
    'experiments/operator-theory/ffm220-ratio.mjs': '8418fe02e028dbee7eff849a6508c0f26e67fa19ad91cd39a908d387bd34aa79',
    'experiments/ffm-atmosphere-xm3/config.json': '3eea04347d3e270c62f9a2bea9841b35396898c8778258698f839298570e5c85',
    'results/ap-truth/compare/cells.json': '2d5979c642bb324e45a048149c2f9093525efa6232d6ee00cb90a8ab72fafc0f',
    'results/ap-truth/compare/ffm-ap-ratio.json': 'cd44fadc9229123df02359b8566c5e59fed305eab6d45d6a1acd6d006b3170e3',
    'results/ap-truth/geo/README.md': '324443db911c8a314df7a7403abce0b0bab2a59c3a650ec669d9bb7cc297e724',
    'results/ap-truth/geo/burns-waas.json': '4965572be6c7969f2d697a50d88aa9bd7b8d336a67e8a06054ae32e2e4362203',
  },
  modules: {
    'propagator/ffm/dist/isomorphic/module.wasm': 'a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4',
    'propagator/ffm/FFM.md': '5de4ffbc5f85d0c042fc5d19332118e0ceb4ee2c372220fef2e98c1bce22c212',
    'propagator/ffm/ffm-1.profile.json': '3c256292dd50a15f78dc0410c06fe4811c8c7032ea0e6a17e2eab8ecba0a6282',
    'propagator/ffm/catalog-configuration.mjs': '7d7bc1d4ccc9d8247962478af229a29948251d12fab9094f7d97ff8f39f478f6',
    'propagator/ffm/src/cpp/src/prw_dynamics.cpp': 'fd334bbdb05bc37bd1e4969e9e2d3013af0ef2ddee88d6e6dc67a02965925195',
    'propagator/ffm/lib/shadow.h': 'de9b093d3ea66671bb3790de261d3b7bb98c17d2b4f8ebc3c3bd218c48577d30',
    'propagator/ffm/lib/earth_radiation.h': '23f8fe5dc7254009606dc18a3050ffdfe54e6863b14a9713ffaef0314e37d983',
    'propagator/ffm/lib/force_models.cpp': 'e5972241d304d5b16219e5e2fb9912cf89fa45a116fc28c5c63c5d63f00a66b5',
    'propagator/ffm/lib/astrodynamics.cpp': '7741020317dd38f62399a70c9b5611aa8fa1dd861477668fb0d9853139464d93',
    'propagator/ffm/lib/environment_models.cpp': '3547b3ad869e6325d92cfd991e3cc6e8a3b06e79d9c3d5beb7635a8cad2f9689',
    'propagator/ffm/lib/astrodynamics_types.h': 'e886209516f5d8376f6d88d3a6d3df25ed09ea640467a2b72fdf6ab6fd7bdff6',
    'propagator/sdn-ap/dist/isomorphic/module.wasm': 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e',
    'propagator/sdn-ap/SPEC.md': 'a098f94890cae81854dd21ae66ddd94034e083135e8b056c28d3a518de63c96a',
    'propagator/sdn-ap/src/xp_theory.inc': '37651fb89c0cce3bb82c402748d908b15755f2dbfade0d7e87a7f4aadacf6967',
    'propagator/sdn-ap/src/tesseral.inc': 'f48d086f7445bd4ae07b50ffa4434b57e5dd3ccc9913d3fb6f49e62a11a05884',
    'propagator/sdn-ap/src/gcrf.inc': '22fb1c9188450b52f12a164096eb4b8c45594f1dcbe16beee336520d34b12896',
  },
};
const X = (rel, where = '') => ({ file: rel, sha256: SRC.experiments[rel], where });
const M = (rel, where = '') => ({ file: rel, sha256: SRC.modules[rel], where });
for (const [k, v] of [...Object.entries(SRC.experiments), ...Object.entries(SRC.modules)]) if (!v) throw new Error(`no registered hash for ${k}`);

// The settings table, as FFM-GEO-168H.md registers its rows. `weaker` names the side whose choice is the weaker at GEO for the verdict rule:
// 'ffm', 'ap', 'neither' (equal, or different with neither carrying less), as read from the sources named.
const SETTINGS = [
  {
    setting: 'Solar pressure: parameterization and what is fitted',
    ffm: { value: 'Cannonball on unit area and mass (INITIAL_MASS_KG 1, AREA_M2 1): REFLECTIVITY_COEFFICIENT carries Cr A/m in m^2/kg. In the GE rows the harness high arm fits SRP_AREA_OVER_MASS (seed 0.02 m^2/kg, a priori sigma 0.2 m^2/kg, domain nonnegative) through analysis/estimation 0.7.0, with no drag. FFM-1\'s own default, a fixed crAreaOverMass of 0.02, is not what flew.',
      sources: [X('experiments/operator-theory/lib/frame.mjs', 'REFLECTIVITY_COEFFICIENT = SRP_AREA_OVER_MASS; INITIAL_MASS_KG 1, AREA_M2 1'), X('experiments/operator-theory/all-regimes.mjs', 'ffmHigh: parameters SRP_AREA_OVER_MASS 0.02, apriori([0.2]), drag false'), M('propagator/ffm/catalog-configuration.mjs', 'FIT_PARAMETER_DOMAINS.SRP_AREA_OVER_MASS nonnegative'), M('propagator/ffm/src/cpp/src/prw_dynamics.cpp', 'srp.Cr = REFLECTIVITY_COEFFICIENT, area and mass from the request'), M('propagator/ffm/FFM.md', 'srp: cannonball, crAreaOverMass_m2_kg 0.02')] },
    ap: { value: 'Cannonball: acceleration P AGOM away from the Sun, AGOM = C_R A/m in m^2/kg from the element set. fit solves BTERM and AGOM; AGOM\'s prior is GAUSSIAN_SIGNED, mean 0, sigma 0.05 m^2/kg on an arc of 36 h or more, so on these 72 h arcs. BTERM is solved too with NRLMSISE-00 stated (PCF_AP), the atmosphere giving no density at GEO.',
      sources: [M('propagator/sdn-ap/SPEC.md', '1.1 (AGOM = C_R A/m), 4 (P AGOM), 12 (AGOM prior 0 +- 0.05 on arcs of 36 h or more), 17.1 (SRP_AREA_OVER_MASS solved)'), M('propagator/sdn-ap/src/xp_theory.inc', 'the SRP acceleration'), X('experiments/operator-theory/lib/ap.mjs', 'apForces: FORCES (31, 20) with NRLMSISE-00; fitPcf fit: null, the module\'s priors'), X('experiments/operator-theory/all-regimes.mjs', 'PCF_AP for GE (not vacuum)')] },
    weaker: 'neither', reading: 'Both fit one cannonball coefficient per window on the same 72 h arc. The brief\'s premise, a fixed Cr on the FFM side, does not hold for the stored rows.',
  },
  {
    setting: 'Solar pressure: constant and Sun distance',
    ffm: { value: 'Solar constant SOLAR_FLUX_1AU 1361 W/m^2 over c, 4.54e-6 N/m^2 at 1 AU, scaled by (AU_KM / r_sun)^2 with AU_KM 1.496e8 km and the Sun distance from the kernel (computeSolarFlux, computeSRPCannonball).',
      sources: [M('propagator/ffm/lib/astrodynamics_types.h', 'SOLAR_FLUX_1AU = 1361.0'), M('propagator/ffm/lib/astrodynamics.cpp', 'AU_KM 1.496e8; computeSolarFlux: (AU_KM / sunDistance)^2; computeSRPCannonball: P = flux / c'), M('propagator/ffm/lib/environment_models.cpp', 'SPEED_OF_LIGHT_M 299792458')] },
    ap: { value: 'kSrpPressure 4.5e-6 N/m^2 at 1 AU, scaled by (AU / r_sun)^2 with the analytic Sun distance (F_s = 4.5e-6 AGOM 3600 / (1000 R_E (r_sun/AU)^2)).',
      sources: [M('propagator/sdn-ap/src/xp_theory.inc', 'kSrpPressure = 4.5e-6'), M('propagator/sdn-ap/SPEC.md', '4: Force; Averaged rates; probe 4.2')] },
    weaker: 'neither', reading: 'The constants differ by about 0.9 %; each side\'s fitted coefficient multiplies its constant, so the product is what each fit sets.',
  },
  {
    setting: 'Eclipse and penumbra',
    ffm: { value: 'Conical shadow with the apparent-disk overlap: umbra, penumbra and the annular antumbra (Montenbruck & Gill), ShadowModelType::Conical in the cannonball path, evaluated at every force evaluation; the acceleration scales with 1 - shadowFraction.',
      sources: [M('propagator/ffm/lib/shadow.h', 'the conical model'), M('propagator/ffm/lib/force_models.cpp', 'ShadowModelType::Conical for the cannonball'), M('propagator/ffm/lib/astrodynamics.cpp', 'computeSRPCannonball: computeShadowGeometry, shadowFactor'), M('propagator/ffm/FFM.md', 'srp shadow: conical (umbra, penumbra, antumbra)')] },
    ap: { value: 'Cylindrical shadow of radius R_E (Escobal 1965) on the mean orbit for the averaged rates; at GEO the 1e-12 root test usually misses, so the GEO eclipse season is averaged as wholly sunlit; the output-time SRP periodic terms take no shadow. Whether these October windows meet the Earth\'s shadow is not read here.',
      sources: [M('propagator/sdn-ap/SPEC.md', '4 Shadow: Escobal cylindrical; "the GEO eclipse season is averaged as wholly sunlit"; 4.9; output-time SRP periodic terms, no shadow')] },
    weaker: 'ap', reading: 'FFM carries the richer model; a setting where FFM is the richer cannot explain an FFM loss.',
  },
  {
    setting: 'Earth radiation (albedo and infrared)',
    ffm: { value: 'Knocke albedo and infrared on Cr A/m is available (EARTH_RADIATION KNOCKE; FFM-1 default, 15 degree grid), but the harness request leaves EARTH_RADIATION unset, NONE: not flown in the GE rows.',
      sources: [M('propagator/ffm/src/cpp/src/prw_dynamics.cpp', 'EARTH_RADIATION switch; NONE when unset'), M('propagator/ffm/lib/earth_radiation.h', 'Knocke'), X('experiments/operator-theory/lib/frame.mjs', 'EARTH_RADIATION set only when f.earthRadiation; ffmHigh does not set it'), M('propagator/ffm/FFM.md', 'earthRadiation: Knocke, resolutionDeg 15')] },
    ap: { value: 'No term: the words albedo, Earth radiation and earthshine do not occur in SPEC.md.',
      sources: [M('propagator/sdn-ap/SPEC.md', 'grep -i "albedo|earth radiation|earthshine": 0 lines')] },
    weaker: 'neither', reading: 'Off on both sides in the stored rows.',
  },
  {
    setting: 'Sun and Moon: terms',
    ffm: { value: 'Point-mass Sun and Moon (THIRD_BODY_IDS 10, 301), the full acceleration at every integrator evaluation; no other body in the harness arm (FFM-1 adds the Venus, Mars and Jupiter barycenters).',
      sources: [X('experiments/operator-theory/all-regimes.mjs', 'ffmHigh thirdBodies [10, 301]'), X('experiments/operator-theory/lib/frame.mjs', 'ENABLE_THIRD_BODY, THIRD_BODY_IDS'), M('propagator/ffm/FFM.md', 'thirdBodies; fieldMaximumDegree 0: point masses')] },
    ap: { value: 'Point-mass Sun and Moon. At an epoch period of 1100 min or more (GEO: about 1436 min) the long-period regime takes the full point-mass acceleration from the instantaneous geometry in the rates, with no output-time lunar-solar periodic terms; section 5\'s octupole averaging and 16.8\'s degree 4 to 10 terms apply below 1100 min only.',
      sources: [M('propagator/sdn-ap/SPEC.md', '5 (bodies, mass ratios), 7 (the 1100 min division), 16.8 ("the long-period regime takes the full point-mass acceleration")')] },
    weaker: 'neither', reading: 'The same force on both sides; AP evaluates it in averaged rates on its own grid.',
  },
  {
    setting: 'Sun and Moon: ephemeris',
    ffm: { value: 'JPL DE440s SPK (de440s.bsp, sha256 c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2) on the kernel port, checked by hash before every run; EPHEMERIS_SOURCE JPL_SPK.',
      sources: [X('experiments/ffm-atmosphere-xm3/config.json', 'environment.kernel'), X('experiments/operator-theory/lib/host.mjs', 'the kernel\'s hash checked; kernelFrame'), X('experiments/operator-theory/lib/frame.mjs', 'EPHEMERIS_SOURCE JPL_SPK')] },
    ap: { value: 'Analytic: the Sun from mean elements, the Moon from Brown\'s main terms (reproducing the library\'s direction and distance to 3e-13); JPL ephemerides only when loaded, which this module does not do.',
      sources: [M('propagator/sdn-ap/SPEC.md', '5 Bodies; probe 5.3; "JPL ephemerides are used only when loaded"')] },
    weaker: 'ap', reading: 'FFM carries the richer source; it cannot explain an FFM loss.',
  },
  {
    setting: 'Earth tides: solid, ocean, pole',
    ffm: { value: 'Solid (IERS 2010), ocean (FES2004 30x30) and pole tides are available; the harness high arm sets solidTides false (SOLID_TIDES NONE), no OCEAN_TIDES, no pole tide: none flown in the GE rows.',
      sources: [X('experiments/operator-theory/all-regimes.mjs', 'ffmHigh solidTides: false'), X('experiments/operator-theory/lib/frame.mjs', 'SOLID_TIDES NONE; OCEAN_TIDES only when f.oceanTides'), M('propagator/ffm/src/cpp/src/prw_dynamics.cpp', 'SOLID_TIDES and OCEAN_TIDES switches'), M('propagator/ffm/FFM.md', 'solidTides, oceanTides, poleTide rows')] },
    ap: { value: 'None: solid tide and ocean tide do not occur in SPEC.md; 16.8\'s "tidal acceleration" is the third bodies\' potential, not an Earth tide.',
      sources: [M('propagator/sdn-ap/SPEC.md', 'grep -i "solid tide|ocean tide": 0 lines; 16.8')] },
    weaker: 'neither', reading: 'Off on both sides in the stored rows.',
  },
  {
    setting: 'Gravity: field and degree at GEO',
    ffm: { value: 'Embedded EGM2008, fully normalized, to degree and order 20 (ffmHigh: SPHERICAL_HARMONICS 20x20, every coefficient), in Earth-fixed axes through IERS EOP; FFM-1\'s catalog default 70x70 is not what flew.',
      sources: [X('experiments/operator-theory/all-regimes.mjs', 'ffmHigh gravity SPHERICAL_HARMONICS degree 20 order 20'), M('propagator/ffm/src/cpp/src/prw_dynamics.cpp', 'SPHERICAL_HARMONICS: the embedded EGM2008 to the stated degree and order, every coefficient'), M('propagator/ffm/lib/force_models.cpp', 'EmbeddedEarthGravityField EGM2008')] },
    ap: { value: 'EGM-96: the theory\'s zonals J2 to J5, the zonal tail J6 to J20 (FORCES z = 20), the one-day class\'s 27 resonant tesseral terms of degrees 2 to 4, the m-daily and first-order tesserals to degree 12 and the near-resonant terms to degree 31 (FORCES d = 31), each first order at the mean elements.',
      sources: [X('experiments/operator-theory/lib/ap.mjs', 'apForces tesseral 31, zonal 20'), M('propagator/sdn-ap/SPEC.md', '1.3 and 2 (EGM-96 zonals), 6.1 (the one-day class), 16.2 (tesseral families and caps), 16.3 (zonal tail)'), M('propagator/sdn-ap/src/tesseral.inc', 'the tesseral tables')] },
    weaker: 'ffm', reading: 'Different fields (EGM2008 against EGM-96) and truncations. FFM carries every term to degree 20; the one set AP carries that FFM does not is the near-resonant terms of degree 21 to 31, so by the rule\'s letter (a term AP carries and FFM does not) this is the row where FFM\'s choice is the weaker. Whether those terms move a GEO forecast is not read here. Disclosed: before the first ratio was read this row was classed "neither" with the note that it would count as FFM the weaker only for a loss; the rule as registered makes it count, so it is classed by the rule.',
  },
  {
    setting: 'Integrator and step',
    ffm: { value: 'RK78 (Fehlberg 7(8)), relative tolerance 1e-8, absolute tolerances 1e-5 per component, steps 1e-3 to 300 s, initial 60 s; the catalog\'s 1e-14 and 120 s are not what flew.',
      sources: [X('experiments/operator-theory/all-regimes.mjs', 'ffmHigh integrator tolerance 1e-8, maxStep 300, minStep 1e-3'), X('experiments/operator-theory/lib/frame.mjs', 'RK78; ABSOLUTE_TOLERANCES tolerance x 1000; INITIAL_STEP_SECONDS 60'), M('propagator/ffm/FFM.md', 'integrator: catalog 1e-14, 120 s')] },
    ap: { value: 'Averaged rates integrated on the theory\'s own grid; the one-day class steps 38 minutes; output states from the mean elements plus the short-period terms.',
      sources: [M('propagator/sdn-ap/SPEC.md', '9, 16.4 ("the one-day class retains its frame correction and 38-minute grid"), One-day archive windows (the 38-minute step confirmed)')] },
    weaker: 'neither', reading: 'Not a force setting; carried because it differs.',
  },
  {
    setting: 'Frame and Earth orientation',
    ffm: { value: 'GCRF in and out; the field in ITRF through the IERS finals rows on the earth_orientation port (environment.json sha256 520b825d61e64418d1904a482da49c647cb2f92765c9df736d14d90a6e61dcf6, parsed by data-source/eop-parser).',
      sources: [X('experiments/operator-theory/lib/frame.mjs', 'GCRF coordinate system'), X('experiments/ffm-atmosphere-xm3/config.json', 'environment.earthOrientation'), M('propagator/ffm/FFM.md', 'frames')] },
    ap: { value: 'TEME of date; the one-day class carries epoch-axis states to TEME of date by M(t) M(t0)^T, M the GCRF-to-TEME matrix of gcrf.inc, linear between 12-hour nodes; GCRF fit inputs converted at each sample date.',
      sources: [M('propagator/sdn-ap/SPEC.md', '10, 16.4'), M('propagator/sdn-ap/src/gcrf.inc', 'the GCRF-to-TEME nodes')] },
    weaker: 'neither', reading: 'Not a force setting; carried because it differs.',
  },
];

// The stores.
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f)));
const byKey = (dir) => new Map(rowsIn(dir).map((r) => [r.key, r]));
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
const scored = (v) => Number.isFinite(v) && v > 0;
const seedOf = (tag) => parseInt(sha256(tag).slice(0, 8), 16);
const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };
const r3 = (x) => Number(x.toFixed(3));
/** exp of the median of the paired logs. */
const ratio = (w) => r3(Math.exp(median(w.map((x) => x.ln))));
/** The 95 % interval of the ratio over clusters drawn with replacement: [lower, upper], the cluster count. */
const interval = (tag, w, clusterOf) => {
  const by = new Map();
  for (const x of w) { const c = clusterOf(x); (by.get(c) ?? by.set(c, []).get(c)).push(x.ln); }
  const clusters = [...by.values()], random = rand(seedOf(tag)), meds = [];
  for (let t = 0; t < DRAWS; t += 1) { const draw = []; for (let i = 0; i < clusters.length; i += 1) draw.push(...clusters[Math.floor(random() * clusters.length)]); meds.push(median(draw)); }
  meds.sort(asc);
  const lo = Math.exp(pct(meds, 0.025)), hi = Math.exp(pct(meds, 0.975));
  // The verdict reads the bound unrounded (`lower`, 6 decimals printed); `interval` is the rounded pair for reading.
  return { interval: [r3(lo), r3(hi)], lower: Number(lo.toFixed(6)), upper: Number(hi.toFixed(6)), clusters: clusters.length };
};
const LEADS = [[48, '2'], [72, '3'], [168, '7']], FIT = 72;
/** One cell of a population: the windows with both figures at the day, the ratio, both intervals, per-satellite ratios. */
function cell(tag, members, ap, ffm, day, lead, burnsOf) {
  const w = members.map((r) => ({ key: r.key, name: r.name, cutoff: r.cutoff, ap: e(ap.get(r.key), `AP${FIT}`, day), ffm: e(ffm.get(r.key), `F${FIT}`, day) }))
    .filter((x) => scored(x.ap) && scored(x.ffm)).map((x) => ({ ...x, ln: Math.log(x.ffm / x.ap) }));
  const out = { fit: FIT, lead, day: Number(day), windows: w.length, satellites: new Set(w.map((x) => x.name)).size, ffmWorse: w.filter((x) => x.ln > 0).length,
    ratio: w.length ? ratio(w) : null,
    windowCluster: w.length ? interval(`FFM-GEO-168H|${tag}|${FIT}|${lead}`, w, (x) => x.key) : null,
    objectWeek: w.length ? interval(`FFM-GEO-168H|${tag}|${FIT}|${lead}|object-week`, w, (x) => `${x.name}|${isoWeek(x.cutoff.slice(0, 10))}`) : null,
    perSatellite: Object.fromEntries([...new Set(w.map((x) => x.name))].sort().map((n) => { const s = w.filter((x) => x.name === n); return [n, { windows: s.length, ratio: ratio(s) }]; })),
    medianKm: w.length ? { ffm: r3(median(w.map((x) => x.ffm))), ap: r3(median(w.map((x) => x.ap))) } : null,
    keys: w.map((x) => x.key) };
  if (burnsOf) {
    const inFit = w.filter((x) => burnsOf(x.name).some((t) => t >= Date.parse(x.cutoff) - FIT * HOUR && t <= Date.parse(x.cutoff))).length;
    const inForecast = w.filter((x) => burnsOf(x.name).some((t) => t > Date.parse(x.cutoff) && t <= Date.parse(x.cutoff) + lead * HOUR)).length;
    out.registeredBurns = { inFit, inForecast, note: 'counted, never selected on; information only' };
  }
  return out;
}

function build() {
  const ge = rowsIn(path.join(AP, 'b0411/regimes')).filter((r) => r.group === 'GE' && !r.error).sort((a, b) => a.key.localeCompare(b.key));
  const geAp = byKey(path.join(AP, 'b051/regimes')), geFfm = byKey(path.join(AP, 'ffm220/regimes'));
  if (ge.length !== 45) throw new Error(`GE members ${ge.length}, registered 45`);
  const geFfmBuild = [...new Set(ge.map((r) => geFfm.get(r.key)?.ffm?.wasmSha256))];
  if (geFfmBuild.length !== 1 || geFfmBuild[0] !== 'd635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153') throw new Error(`GE FFM rows are not all 2.2.0: ${geFfmBuild}`);
  const wa = rowsIn(path.join(AP, 'b0411/regimes-wa')).filter((r) => r.group === 'WA' && !r.error).sort((a, b) => a.key.localeCompare(b.key));
  const waAp = byKey(path.join(AP, 'b051/regimes-wa')), waFfm = new Map(wa.map((r) => [r.key, r]));
  const burns = JSON.parse(fs.readFileSync(path.join(REPO, 'results/ap-truth/geo/burns-waas.json'), 'utf8'));
  const burnTimes = new Map(burns.satellites.map((s) => [s.name, s.burns.map((b) => Date.parse(b.day))]));
  const burnsOf = (name) => burnTimes.get(name) ?? [];
  const gfz = LEADS.map(([lead, day]) => cell('GFZ', ge, geAp, geFfm, day, lead));
  const mt9 = LEADS.map(([lead, day]) => cell('MT9', wa, waAp, waFfm, day, lead, burnsOf));
  // The verdict rule, as registered.
  const losses = gfz.filter((c) => c.windowCluster && c.windowCluster.lower > 1);
  const weakerRows = SETTINGS.filter((s) => s.weaker === 'ffm');
  const verdict = losses.length === 0
    ? { losses: [], statement: 'nothing to explain at GEO today', rule: `no GFZ cell has its window-cluster 95 % interval wholly above 1 (unrounded lower bounds: ${gfz.map((c) => `${c.fit}/${c.lead} ${c.windowCluster.lower}`).join(', ')})` }
    : { losses: losses.map((c) => ({ cell: `${c.fit}/${c.lead}`, ratio: c.ratio, windowClusterLower: c.windowCluster.lower, windowClusterUpper: c.windowCluster.upper, objectWeek: c.objectWeek.interval, windows: c.windows, ffmWorse: c.ffmWorse })),
      records: weakerRows.map((s) => ({ setting: s.setting, record: `modules-ffm-geo-${s.setting.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-20261106`,
        shouldTest: 'refly the same GE windows\' F72 at FFM-1\'s catalog degree (70x70, every coefficient, so the field holds every term of degree 21 to 70) and read 72/168 again by this record\'s statistic; a ratio and interval that do not move clear the row' })),
      margin: `the loss rests on the window-cluster lower bound ${losses.map((c) => `${c.windowCluster.lower} at ${c.fit}/${c.lead}`).join(', ')} against 1; the object-week interval of the same cell holds 1 (${losses.map((c) => `[${c.objectWeek.interval.join(', ')}]`).join(', ')}), as results/ap-truth/compare/ffm-ap-ratio.json read it; the rule is the window-cluster bound and is applied as registered. SDN-AP, 2026-11-06: the loss stands by the registered letter, "by 0.0003; the object-week interval [0.998, 1.692] holds 1; a bound this close is within the bootstrap's own Monte Carlo spread"`,
      statement: weakerRows.length ? `a loss at ${losses.map((c) => `${c.fit}/${c.lead}`).join(', ')} the settings table reads to FFM's weaker setting: ${weakerRows.map((s) => s.setting).join('; ')}` : `a loss at ${losses.map((c) => `${c.fit}/${c.lead}`).join(', ')} the settings do not explain; no record named` };
  return {
    registered: 'experiments/operator-theory/FFM-GEO-168H.md',
    reading: 'report only; no module change; no GEO burn verdict',
    task: 'experiments-ffm-geo-168h-candidate-defect-20261106',
    builds: {
      settingsTable: { modulesCommit: MODULES_COMMIT, ffm: { module: 'propagator/ffm', version: '2.2.1', wasmSha256: SRC.modules['propagator/ffm/dist/isomorphic/module.wasm'] }, ap: { module: 'propagator/sdn-ap', version: '0.6.3', wasmSha256: SRC.modules['propagator/sdn-ap/dist/isomorphic/module.wasm'] } },
      rows: {
        gfz: { ap: { version: '0.5.1', wasmSha256: 'd29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb', store: 'ap/b051/regimes', arm: 'AP72' }, ffm: { version: '2.2.0', wasmSha256: 'd635a3d57a2c9ca91d111f74aad38b9d748d6c16199b22c6922af21c92fe2153', store: 'ap/ffm220/regimes', arm: 'F72', fittedBy: 'analysis/estimation 0.7.0' }, members: 'ap/b0411/regimes group GE (45 windows)' },
        mt9: { ap: { version: '0.5.1', wasmSha256: 'd29acd2b5d921446f7da8dbf51f45ba53d59dc7685e677616dcd81944981efdb', store: 'ap/b051/regimes-wa', arm: 'AP72' }, ffm: { version: '2.0.4', wasmSha256: 'c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2', store: 'ap/b0411/regimes-wa', arm: 'F72', note: 'cycle-ffm220.sh did not rerun regimes-wa; the 2.0.4 to 2.2.0 move was 0.000 on every geostationary cell of results/ap-truth/compare/ffm-ap-ratio.json' }, members: 'ap/b0411/regimes-wa group WA (84 windows)' },
      },
      identities: [
        'FFM 2.2.1 is 2.2.0 rebuilt on spacedatastandards.org 1.279.0: between modules f1517ef68e and 93cb5a058 only propagator/ffm/src/cpp/generated/sds/*_generated.h, package.json and plugin-manifest.json change; no file of lib/ or src/cpp/src/ (modules commits e746c4a0d, 9cb02c8e2, 0dfa42a81).',
        'AP 0.6.3 equals 0.5.1 byte for byte at an eccentricity of 0.3 and below: COMPARE.md, 2026-11-06 reflight of the 56 published examples, 53 equal with a largest position difference of 0 m, the 3 that move being THEMIS and Chandra above e 0.3. Every GE window is near-circular.',
      ],
    },
    settings: SETTINGS,
    settingsNote: 'The two gravity fields are different models, not only different truncations: FFM flies the embedded EGM2008 (every coefficient to degree and order 20); AP flies EGM-96 (the theory\'s zonals, the zonal tail, the resonant and tesseral tables of 16.2 and 16.3). The settings table reads sources only; no figure here measures what either model or truncation does to a GEO forecast. The brief\'s "fixed Cr against fitted AGOM" premise did not hold for the stored rows: both arms fit one cannonball coefficient per window (FFM SRP_AREA_OVER_MASS through analysis/estimation, AP AGOM), as the first row reads from the sources.',
    statistic: 'exp(median over windows of ln(F72.e / AP72.e)); e the 3D RMS position error (km) of the lead day\'s bin, counted from the end of the 72 h fit (experiments/ffm-atmosphere-xm3/config.json scoring). windowCluster: 95 % bootstrap with the window as the cluster, 10,000 draws, seed SHA-256 of the tag. objectWeek: the same over satellite x ISO-week clusters, report only.',
    gfz: { truth: 'GFZ multi-GNSS rapid orbits; BeiDou-2G, BeiDou-3G, QZS-2G; cutoffs 2025-10-04 to 2025-10-12 every 2 days', windows: ge.map((r) => r.key), cells: gfz },
    mt9: {
      population: 'a second population: separate satellites, separate truth. Never read against the GFZ column; agreement or disagreement between the columns is not validation of either.',
      truth: 'WAAS message type 9 broadcast (URA 2 m): Galaxy 30, SES-15, Eutelsat 117 West B; cutoffs 2026-09-02 to 2026-10-26 every 2 days',
      noise: 'revolution-to-revolution noise about 45 m: the per-rev record\'s measurement (experiments-ffm-step-flag-per-rev-20261105) as the SDN-AP session states it; not measured here, and no landed per-rev file at experiments 1d12fb5b prints the figure. Measured bound in this store: FFM fitted to 24 h of Galaxy 30\'s broadcast predicts it one day ahead to a median of 0.060 km between burns (results/ap-truth/geo/README.md).',
      ffmBuild: 'FFM 2.0.4 (not 2.2.x); see builds.rows.mt9.ffm.note',
      sameNoise: 'The MT9 ratios of 1.000 with intervals [0.999, 1.000] and [1.000, 1.001] mean that both arms\' errors on this truth are dominated by the same truth noise: the two forecasts differ from each other by far less than either differs from the broadcast (median errors of kilometers against a window-to-window ratio within 0.1 % of 1). Stated as such; nothing is read from it.',
      windows: wa.map((r) => r.key), cells: mt9,
    },
    verdict,
  };
}

function readme(t) {
  const L = [];
  L.push('# GEO force settings: FFM beside AP, report only', '');
  L.push(`Registered in \`${t.registered}\`. ${t.reading}. Written by \`experiments/operator-theory/ffm-geo-168h.mjs\`; \`--check\` reproduces this file and \`table.json\` from the stores.`, '');
  L.push('## Verdict', '', `**${t.verdict.statement}.**`, '');
  if (t.verdict.rule) L.push(`${t.verdict.rule}.`, '');
  else {
    for (const l of t.verdict.losses) L.push(`- Loss ${l.cell}: FFM/AP ${l.ratio} on ${l.windows} windows (FFM worse on ${l.ffmWorse}); window-cluster interval [${l.windowClusterLower}, ${l.windowClusterUpper}] unrounded; object-week [${l.objectWeek.join(', ')}].`);
    L.push(`- Margin: ${t.verdict.margin}.`);
    for (const r of t.verdict.records) L.push(`- Record named: \`${r.record}\` (setting: ${r.setting}). What it should test: ${r.shouldTest}.`);
    L.push('- No GEO burn verdict comes out of this record: the GFZ cells are read with no burn selection, and the MT9 burns are counted only.', '');
  }
  L.push('## The ratios on GFZ truth', '', `Every geostationary window of the landed cells (${t.gfz.windows.length} windows, 9 satellites; ${t.gfz.truth}), no burn selection. AP ${t.builds.rows.gfz.ap.version} (\`${t.builds.rows.gfz.ap.store}\`) against FFM ${t.builds.rows.gfz.ffm.version} (\`${t.builds.rows.gfz.ffm.store}\`, fitted by ${t.builds.rows.gfz.ffm.fittedBy}). ${t.statistic}`, '');
  L.push('| Fit / lead (h) | Windows | Satellites | FFM worse | FFM/AP | 95 % window-cluster | 95 % object-week (report only) | Median FFM km | Median AP km |', '| --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |');
  for (const c of t.gfz.cells) L.push(`| ${c.fit}/${c.lead} | ${c.windows} | ${c.satellites} | ${c.ffmWorse} | ${c.ratio} | [${c.windowCluster.interval.join(', ')}] over ${c.windowCluster.clusters} windows | [${c.objectWeek.interval.join(', ')}] over ${c.objectWeek.clusters} | ${c.medianKm.ffm} | ${c.medianKm.ap} |`);
  L.push('', 'Per satellite (windows, FFM/AP):', '');
  L.push(`| Satellite | ${t.gfz.cells.map((c) => `${c.fit}/${c.lead}`).join(' | ')} |`, `| --- | ${t.gfz.cells.map(() => '---').join(' | ')} |`);
  for (const n of Object.keys(t.gfz.cells[0].perSatellite)) L.push(`| ${n} | ${t.gfz.cells.map((c) => c.perSatellite[n] ? `${c.perSatellite[n].windows}, ${c.perSatellite[n].ratio}` : '-').join(' | ')} |`);
  L.push('', '## WAAS message type 9: a second population', '', `${t.mt9.population} ${t.mt9.truth}; ${t.mt9.windows.length} windows. AP ${t.builds.rows.mt9.ap.version} (\`${t.builds.rows.mt9.ap.store}\`) against **FFM ${t.builds.rows.mt9.ffm.version}** (\`${t.builds.rows.mt9.ffm.store}\`): ${t.builds.rows.mt9.ffm.note}. Beside every figure: ${t.mt9.noise}`, '');
  L.push('| Fit / lead (h) | Windows | FFM worse | FFM/AP | 95 % window-cluster | 95 % object-week (report only) | Median FFM km | Median AP km | Registered burns in fit / in forecast (counted only) |', '| --- | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |');
  for (const c of t.mt9.cells) L.push(`| ${c.fit}/${c.lead} | ${c.windows} | ${c.ffmWorse} | ${c.ratio} | [${c.windowCluster.interval.join(', ')}] over ${c.windowCluster.clusters} windows | [${c.objectWeek.interval.join(', ')}] over ${c.objectWeek.clusters} | ${c.medianKm.ffm} | ${c.medianKm.ap} | ${c.registeredBurns.inFit} / ${c.registeredBurns.inForecast} |`);
  L.push('', t.mt9.sameNoise);
  L.push('', '## The settings table', '', t.settingsNote, '', `FFM ${t.builds.settingsTable.ffm.version} (wasm ${t.builds.settingsTable.ffm.wasmSha256}) beside AP ${t.builds.settingsTable.ap.version} (wasm ${t.builds.settingsTable.ap.wasmSha256}), modules ${t.builds.settingsTable.modulesCommit}; every entry from the files named, by SHA-256 (first 8 hex here, full in \`table.json\`). The rows were flown on FFM 2.2.0 and AP 0.5.1:`, '');
  for (const s of t.builds.identities) L.push(`- ${s}`);
  L.push('', '| Setting | FFM 2.2.1 | AP 0.6.3 | Reading |', '| --- | --- | --- | --- |');
  const cite = (side) => `${side.value} Sources: ${side.sources.map((s) => `\`${s.file}\` ${short(s.sha256)}${s.where ? ` (${s.where})` : ''}`).join('; ')}.`;
  for (const s of t.settings) L.push(`| ${s.setting} | ${cite(s.ffm)} | ${cite(s.ap)} | ${s.reading} |`);
  L.push('', '## What the paper methodology should take', '', 'The settings table above, as a side-by-side of the two force models at GEO by source and hash, with the two identities (FFM 2.2.1 as a bindings rebuild of 2.2.0; AP 0.6.3 equal to 0.5.1 at e 0.3 and below) and the note that the stored GEO rows flew the harness arms (FFM 20x20, Sun and Moon, cannonball with Cr A/m fitted, no tides, no Earth radiation, RK78 at 1e-8 and 300 s; AP FORCES 31, 20), not FFM-1\'s catalog defaults. It carries no ratio claim beyond the cells above, and no burn verdict.', '');
  return `${L.join('\n')}\n`;
}

function verifyHashes() {
  const bad = [], missing = [];
  for (const [rel, want] of Object.entries(SRC.experiments)) { const f = path.join(REPO, rel); if (!fs.existsSync(f)) { missing.push(rel); continue; } if (sha256(fs.readFileSync(f)) !== want) bad.push(rel); }
  let modulesChecked = 0;
  if (fs.existsSync(MODULES)) for (const [rel, want] of Object.entries(SRC.modules)) { const f = path.join(MODULES, rel); if (!fs.existsSync(f)) { missing.push(`modules:${rel}`); continue; } modulesChecked += 1; if (sha256(fs.readFileSync(f)) !== want) bad.push(`modules:${rel}`); }
  return { bad, missing, modulesChecked, modulesRoot: fs.existsSync(MODULES) ? MODULES : null };
}

const table = build();
const tableBytes = `${JSON.stringify(table, null, 1)}\n`, readmeBytes = readme(table);
const hashes = verifyHashes();
for (const c of table.gfz.cells) console.log(`GFZ  ${c.fit}/${String(c.lead).padStart(3)}  n ${String(c.windows).padStart(2)}  FFM/AP ${c.ratio}  window-cluster [${c.windowCluster.interval.join(', ')}] (lower ${c.windowCluster.lower})  object-week [${c.objectWeek.interval.join(', ')}] over ${c.objectWeek.clusters}`);
for (const c of table.mt9.cells) console.log(`MT9  ${c.fit}/${String(c.lead).padStart(3)}  n ${String(c.windows).padStart(2)}  FFM/AP ${c.ratio}  window-cluster [${c.windowCluster.interval.join(', ')}]  object-week [${c.objectWeek.interval.join(', ')}] over ${c.objectWeek.clusters}  burns fit/forecast ${c.registeredBurns.inFit}/${c.registeredBurns.inForecast}  (FFM 2.0.4; second population)`);
console.log(`verdict: ${table.verdict.statement}`);
console.log(`sources: ${Object.keys(SRC.experiments).length} experiments files re-hashed, ${hashes.modulesChecked} of ${Object.keys(SRC.modules).length} module files re-hashed${hashes.modulesRoot ? ` at ${hashes.modulesRoot}` : ' (no modules root)'}${hashes.missing.length ? `; not found: ${hashes.missing.join(', ')}` : ''}${hashes.bad.length ? `; MISMATCH: ${hashes.bad.join(', ')}` : ''}`);
if (hashes.bad.length) { console.log('FAIL: a cited source differs from its registered hash'); process.exit(1); }
if (CHECK) {
  const same = (name, bytes) => fs.existsSync(path.join(OUT, name)) && fs.readFileSync(path.join(OUT, name), 'utf8') === bytes;
  const ok = same('table.json', tableBytes) && same('README.md', readmeBytes);
  console.log(ok ? 'PASS: table.json and README.md reproduce from the stores; every reachable source holds its hash; the verdict stands' : 'FAIL: table.json or README.md differs from what the stores give');
  process.exit(ok ? 0 : 1);
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), tableBytes);
fs.writeFileSync(path.join(OUT, 'README.md'), readmeBytes);
console.log(`wrote ${OUT}/table.json and README.md`);
