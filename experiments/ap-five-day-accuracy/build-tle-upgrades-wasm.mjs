#!/usr/bin/env node
/**
 * Compiles wasm/tle-astrodynamics-upgrades.wasm (wasm32-wasip1-threads, C++17 + SIMD128, -fno-exceptions)
 * implementing all 4 TLE-only astrodynamics & statistical estimation upgrades in 100% compiled WebAssembly:
 *  1. tleup_forecast_spw_bartels: Causal 27-day Bartels solar-rotation + AR(1) relaxation $SPW forecaster & 81d mean
 *  2. tleup_compute_msis_arc_lnb & tleup_solve_fleet_dca: Pinned NRLMSISE-00 (gtd7d) Brouwer decay arcs + generalized
 *     open-DCA Schur-complement tridiagonal/Cholesky fleet common-mode log-density solver s(t) with sphere/DISCOS priors
 *  3. tleup_track_rolling_ballistics & tleup_track_rolling_agom: Multi-month (120+ d) causal Huber-Kalman BTERM & AGOM
 *     trackers decoupled from s(t) + hierarchical empirical-Bayes non-DISCOS shrinkage
 *  4. tleup_dealias_and_solve_gls: Block-specific box-wing SRP ECOM-lite beta(t) modulation + IERS 2010 solid-Earth k2
 *     Sun/Moon tides + SGP4-to-AP short-periodic nodal de-biasing + exact AR(1)+nugget Cholesky GLS normal solver.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_ROOT =
  process.env.SDN_MODULES_ROOT || new URL("../../../../repos/main-packages/space-data-network-modules", import.meta.url).pathname;
const SDNAP_ROOT = path.join(MODULES_ROOT, "propagator/sdn-ap");
const OUT_DIR = path.join(__dirname, "wasm");
const OUT_WASM = path.join(OUT_DIR, "tle-astrodynamics-upgrades.wasm");

const require = createRequire(path.join(SDNAP_ROOT, "package.json"));
const { compileModuleFromSource, ModuleThreadModel } = await import("space-data-module-sdk/compiler");

const NRLMSISE_PIN = Object.freeze({
  "nrlmsise-00.h": "22eb2ced40595717ef0b73044995e5613aabc8755ed6c43642bfd74335b55535",
  "nrlmsise-00_data.c": "d0b3022f3c3e7ffdf703cc0e0d02339dfee01c0bf1520b29c68d5f4afd8784d5",
  "nrlmsise-00.c": "c25e4a36a6475f0eee6802939d1425384be23d49b0e945a77fc0316bc9f0a699",
});

async function loadPinnedNrlmsise() {
  const dir = path.join(MODULES_ROOT, "third_party/nrlmsise00");
  const text = {};
  for (const [name, want] of Object.entries(NRLMSISE_PIN)) {
    const bytes = await fs.readFile(path.join(dir, name));
    const got = crypto.createHash("sha256").update(bytes).digest("hex");
    if (got !== want) {
      throw new Error(`NRLMSISE-00 pin mismatch on ${name}: got ${got}, expected ${want}`);
    }
    text[name] = bytes.toString("latin1");
  }
  const mallocCast = "u=malloc(sizeof(double)*(unsigned int)n);";
  const ptmExtern = "extern double ptm[10];";
  const model = text["nrlmsise-00.c"]
    .replace('#include "nrlmsise-00.h"', "")
    .replace(/#include <(math|stdio|stdlib)\.h>/g, "");
  return [
    "#include <math.h>",
    "#include <stdio.h>",
    "#include <stdlib.h>",
    "namespace nrlmsise00 {",
    text["nrlmsise-00.h"],
    text["nrlmsise-00_data.c"],
    model
      .replace(mallocCast, "u=(double*)malloc(sizeof(double)*(unsigned int)n);")
      .replace(ptmExtern, "extern double ptm[50];"),
    "}",
  ].join("\n");
}

const sdsCidHpp = await fs.readFile(path.join(MODULES_ROOT, "common/sds_cid.hpp"), "utf8");
const nrlmsiseSrc = await loadPinnedNrlmsise();

const manifest = {
  pluginId: "com.spacedatanetwork.tle-astrodynamics-upgrades",
  name: "TLE Astrodynamics & GLS Upgrades",
  version: "1.0.0",
  description:
    "Compiled C++17 WASM kernels for Bartels $SPW forecasting, fleet-wide TLE $DCL log-density calibration, multi-month rolling Kalman BTERM/AGOM estimation, box-wing SRP + solid-Earth k2 tide de-aliasing, and AR(1) Cholesky GLS fitting.",
  pluginFamily: "analysis",
  capabilities: [],
  externalInterfaces: [],
  invokeSurfaces: ["direct", "command"],
  runtimeTargets: ["browser", "wasmedge"],
  sequentialJustification: {
    kind: "pure-transform",
    detail:
      "Deterministic NRLMSISE-00 decay quadrature, tridiagonal/Cholesky DCA common-mode estimation, Kalman ballistic tracking, and AR(1) GLS solving over caller-supplied buffers.",
  },
  methods: [
    {
      methodId: "noop_health",
      displayName: "Health Check",
      description: "Validates WASM runtime initialization.",
      inputPorts: [],
      outputPorts: [],
      maxBatch: 1,
      drainPolicy: "drain-to-empty",
    },
  ],
};

const cppSource = `
#include "space_data_module_invoke.h"
${sdsCidHpp}
${nrlmsiseSrc}

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <map>
#include <vector>

#ifdef __wasm__
#pragma clang attribute push(__attribute__((target("simd128"))), apply_to=function)
#include <wasm_simd128.h>
#endif

#define TLEUP_EXPORT(name) __attribute__((export_name(name))) extern "C"

extern "C" int noop_health(void) {
  plugin_reset_output_state();
  return 0;
}

namespace tleup {

constexpr double kPi = 3.14159265358979323846;
constexpr double kTwoPi = 6.28318530717958647692;
constexpr double kDeg2Rad = kPi / 180.0;
constexpr double kRad2Deg = 180.0 / kPi;
constexpr double kMuKm3S2 = 398600.4418;
constexpr double kReKm = 6378.137;
constexpr double kFlatWgs84 = 1.0 / 298.257223563;
constexpr double kOmegaEarthRadS = 7.2921150e-5;
constexpr double kAuKm = 149597870.7;
constexpr double kP0SrpNm2 = 4.56e-6; // N/m^2 at 1 AU
constexpr double kMuSunKm3S2 = 1.32712440018e11;
constexpr double kMuMoonKm3S2 = 4902.800066;
constexpr double kJ2 = 1.08262668355e-3;
constexpr double kJ3 = -2.53265648533e-6;
constexpr double kXkeWgs72 = 0.07436691613317342;
constexpr double kJ2Wgs72 = 0.001082616;
constexpr double kReWgs72Km = 6378.135;

struct Vec3 {
  double x = 0.0, y = 0.0, z = 0.0;
};

inline Vec3 operator+(Vec3 a, Vec3 b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
inline Vec3 operator-(Vec3 a, Vec3 b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
inline Vec3 operator*(double s, Vec3 a) { return {s * a.x, s * a.y, s * a.z}; }
inline double dot(Vec3 a, Vec3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
inline Vec3 cross(Vec3 a, Vec3 b) {
  return {a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x};
}
inline double norm(Vec3 a) { return std::sqrt(dot(a, a)); }

// Global causal SPW table stored in WASM memory for NRLMSISE-00 evaluations
struct SpwEntry {
  int32_t mjd = 0;
  double f107_obs = 120.0;
  double f107_c81 = 120.0;
  double ap = 8.0;
};
static std::vector<SpwEntry> g_spw_table;

// Global solved fleet DCA nodes stored in WASM memory for rolling ballistic de-aliasing
static std::vector<double> g_dca_d70;
static std::vector<double> g_dca_s;

inline const SpwEntry& spw_at_mjd(int32_t mjd) {
  static const SpwEntry kFallback{61000, 120.0, 120.0, 8.0};
  if (g_spw_table.empty()) return kFallback;
  if (mjd <= g_spw_table.front().mjd) return g_spw_table.front();
  if (mjd >= g_spw_table.back().mjd) return g_spw_table.back();
  size_t lo = 0, hi = g_spw_table.size() - 1;
  while (hi - lo > 1) {
    const size_t mid = (lo + hi) >> 1;
    if (g_spw_table[mid].mjd <= mjd) lo = mid;
    else hi = mid;
  }
  return g_spw_table[lo];
}

inline double eval_dca_s_at_d70(double d70) {
  if (g_dca_d70.empty()) return 0.0;
  if (d70 <= g_dca_d70.front()) return g_dca_s.front();
  if (d70 >= g_dca_d70.back()) return g_dca_s.back();
  size_t lo = 0, hi = g_dca_d70.size() - 1;
  while (hi - lo > 1) {
    const size_t mid = (lo + hi) >> 1;
    if (g_dca_d70[mid] <= d70) lo = mid;
    else hi = mid;
  }
  const double span = g_dca_d70[hi] - g_dca_d70[lo];
  if (span <= 1e-12) return g_dca_s[lo];
  const double w = (d70 - g_dca_d70[lo]) / span;
  return g_dca_s[lo] * (1.0 - w) + g_dca_s[hi] * w;
}

inline double median_vec(std::vector<double> v) {
  if (v.empty()) return 0.0;
  std::sort(v.begin(), v.end());
  const size_t n = v.size();
  return (n & 1u) ? v[n / 2] : 0.5 * (v[n / 2 - 1] + v[n / 2]);
}

// Sun and Moon geocentric GCRF/J2000 positions (km) from d70 (days since 1970-01-01 00:00 UTC)
// MJD = d70 + 40587.0, JD = d70 + 2440587.5, Julian centuries from J2000: T = (d70 - 10957.5) / 36525.0
inline void sun_moon_gcrf_km(double d70, Vec3& r_sun_km, double& d_sun_km, Vec3& r_moon_km, double& d_moon_km) {
  const double T = (d70 - 10957.5) / 36525.0;
  // Low-precision analytical IAU solar coordinates (~0.01 deg)
  const double L0 = (280.46646 + 36000.76983 * T) * kDeg2Rad;
  const double M = (357.52911 + 35999.05029 * T) * kDeg2Rad;
  const double e_s = 0.016708634 - 0.000042037 * T;
  const double C = ((1.914602 - 0.004817 * T) * std::sin(M) + 0.019993 * std::sin(2.0 * M)) * kDeg2Rad;
  const double sun_lon = L0 + C;
  const double nu = M + C;
  const double r_au = (1.000001018 * (1.0 - e_s * e_s)) / (1.0 + e_s * std::cos(nu));
  d_sun_km = r_au * kAuKm;
  const double eps = (23.439291 - 0.0130042 * T) * kDeg2Rad;
  const double ce = std::cos(eps), se = std::sin(eps);
  const double cl = std::cos(sun_lon), sl = std::sin(sun_lon);
  r_sun_km = {d_sun_km * cl, d_sun_km * sl * ce, d_sun_km * sl * se};

  // Brown main lunar terms (~0.1 deg, < 0.2% tidal precision)
  const double Lm = (218.3165 + 481267.8813 * T) * kDeg2Rad;
  const double Dm = (297.8502 + 445267.1115 * T) * kDeg2Rad;
  const double Mm = (134.9634 + 477198.8676 * T) * kDeg2Rad;
  const double Fm = (93.2721 + 483202.0175 * T) * kDeg2Rad;
  const double lon_m = Lm + (6.2888 * std::sin(Mm) + 1.2740 * std::sin(2.0 * Dm - Mm) +
                             0.6583 * std::sin(2.0 * Dm) + 0.2136 * std::sin(2.0 * Mm) -
                             0.1856 * std::sin(M) - 0.1143 * std::sin(2.0 * Fm)) * kDeg2Rad;
  const double lat_m = (5.1282 * std::sin(Fm) + 0.2806 * std::sin(Mm + Fm) +
                        0.2777 * std::sin(Mm - Fm) + 0.1732 * std::sin(2.0 * Dm - Fm)) * kDeg2Rad;
  const double par_m = (0.95072 + 0.05181 * std::cos(Mm) + 0.00953 * std::cos(2.0 * Dm - Mm) +
                        0.00784 * std::cos(2.0 * Dm) + 0.00282 * std::cos(2.0 * Mm)) * kDeg2Rad;
  d_moon_km = kReKm / std::sin(par_m);
  const double cb = std::cos(lat_m), sb = std::sin(lat_m);
  const double clon = std::cos(lon_m), slon = std::sin(lon_m);
  r_moon_km = {
      d_moon_km * cb * clon,
      d_moon_km * (cb * slon * ce - sb * se),
      d_moon_km * (cb * slon * se + sb * ce),
  };
}

// Convert d70 (days since 1970-01-01 UTC) to (year, doy, ut_sec)
inline void d70_to_ydoy_sec(double d70, int& year_out, int& doy_out, double& sec_out) {
  const double fl = std::floor(d70);
  int64_t z = static_cast<int64_t>(fl) + 719468LL;
  const int64_t era = (z >= 0 ? z : z - 146096LL) / 146097LL;
  const unsigned doe = static_cast<unsigned>(z - era * 146097LL);
  const unsigned yoe = (doe - doe / 1460u + doe / 36524u - doe / 146096u) / 365u;
  int y = static_cast<int>(yoe) + static_cast<int>(era) * 400;
  const unsigned doy0 = doe - (365u * yoe + yoe / 4u - yoe / 100u);
  const unsigned mp = (5u * doy0 + 2u) / 153u;
  const unsigned d = doy0 - (153u * mp + 2u) / 5u + 1u;
  const unsigned m = mp < 10u ? mp + 3u : mp - 9u;
  if (m <= 2u) y += 1;
  const bool leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
  static const int kCumDays[12] = {0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334};
  int doy = kCumDays[m - 1] + static_cast<int>(d);
  if (leap && m > 2u) doy += 1;
  year_out = y;
  doy_out = doy;
  sec_out = (d70 - fl) * 86400.0;
}

// Kozai mean motion (rev/day) -> Brouwer mean motion (rev/day) and semi-major axis (km)
inline void kozai_to_brouwer(double n_kozai_rev_day, double e, double inc_deg, double& n_brouwer_out, double& a_km_out) {
  const double no_k = (n_kozai_rev_day * kTwoPi) / 1440.0;
  const double a1 = std::pow(kXkeWgs72 / no_k, 2.0 / 3.0);
  const double ci = std::cos(inc_deg * kDeg2Rad);
  const double x3thm1 = 3.0 * ci * ci - 1.0;
  const double b2 = std::max(1e-6, 1.0 - e * e);
  const double b = std::sqrt(b2);
  const double t0 = (0.75 * kJ2Wgs72 * x3thm1) / (b * b2);
  const double del1 = t0 / (a1 * a1);
  const double a0 = a1 * (1.0 - del1 * ((1.0 / 3.0) + del1 * (1.0 + (134.0 / 81.0) * del1)));
  const double del0 = t0 / (a0 * a0);
  n_brouwer_out = n_kozai_rev_day / (1.0 + del0);
  const double n_rad_s = (n_brouwer_out * kTwoPi) / 86400.0;
  a_km_out = std::cbrt(kMuKm3S2 / (n_rad_s * n_rad_s));
}

// Orbit-averaged unit-BTERM (B = 1.0 m^2/kg) NRLMSISE-00 da/dt (m/day, negative) at epoch d70
inline double msis_unit_dadt_m_per_day(double d70, double a_km, double e, double inc_deg, double raan_deg, double argp_deg) {
  const int32_t mjd = static_cast<int32_t>(std::floor(d70 + 40587.0));
  const SpwEntry& spw_prev = spw_at_mjd(mjd - 1);
  const SpwEntry& spw_curr = spw_at_mjd(mjd);

  int year = 2026, doy = 1;
  double ut_sec = 0.0;
  d70_to_ydoy_sec(d70, year, doy, ut_sec);

  // GMST angle (rad) for ECEF geodetic latitude/longitude
  const double T_ut = (d70 - 10957.5) / 36525.0;
  const double gmst_deg = std::fmod(280.46061837 + 360.98564736629 * (d70 - 10957.5) + 0.000387933 * T_ut * T_ut, 360.0);
  const double gmst = (gmst_deg < 0.0 ? gmst_deg + 360.0 : gmst_deg) * kDeg2Rad;
  const double cg = std::cos(gmst), sg = std::sin(gmst);

  const double ci = std::cos(inc_deg * kDeg2Rad), si = std::sin(inc_deg * kDeg2Rad);
  const double cO = std::cos(raan_deg * kDeg2Rad), sO = std::sin(raan_deg * kDeg2Rad);
  const double cw = std::cos(argp_deg * kDeg2Rad), sw = std::sin(argp_deg * kDeg2Rad);
  const Vec3 P = {cw * cO - sw * ci * sO, cw * sO + sw * ci * cO, sw * si};
  const Vec3 Q = {-sw * cO - cw * ci * sO, -sw * sO + cw * ci * cO, cw * si};

  const double eta = std::sqrt(std::max(1e-8, 1.0 - e * e));
  const double n_rad_s = std::sqrt(kMuKm3S2 / (a_km * a_km * a_km));
  const double a_m = a_km * 1000.0;
  const double mu_m3_s2 = kMuKm3S2 * 1e9;

  nrlmsise00::nrlmsise_flags flags{};
  flags.switches[0] = 1; // SI units: kg/m^3
  for (int i = 1; i < 24; ++i) flags.switches[i] = 1;

  // 12-point eccentric anomaly quadrature (exact for eccentric & circular drag scale height)
  constexpr int NQ = 12;
  double sum_dadt_m_s = 0.0;
  const double e2_wgs = kFlatWgs84 * (2.0 - kFlatWgs84);
  // SPEC 3.4 J2 short-periodic radial offset on Brouwer mean elements (matches sdn-ap xp_theory.inc L1015-1215)
  const double a_er = a_km / 6378.1363;
  const double p_er = a_er * eta * eta;
  const double cj2 = kJ2 / (4.0 * p_er);
  const double cj2_c = cj2 * (1.0 - ci * ci);
  const double cj2_s = cj2 * (3.0 * ci * ci - 1.0);
  const double inv_1peta = 1.0 / (1.0 + eta);

  for (int q = 0; q < NQ; ++q) {
    // Offset by half-bin to avoid symmetry aliasing with perigee/equator
    const double E = (q + 0.5) * (kTwoPi / NQ);
    const double cE = std::cos(E), sE = std::sin(E);
    const double roa = 1.0 - e * cE;
    const double cn = (cE - e) / roa;
    const double sn = (eta * sE) / roa;
    const double Dn = 1.0 + e * cn;
    const double cu = cw * cn - sw * sn;
    const double su = sw * cn + cw * sn;
    const double dr_j2_km = 6378.1363 * (-cj2_s * (e * cn * inv_1peta + 2.0 * eta / Dn + 1.0) + cj2_c * (cu * cu - su * su));
    const Vec3 r_mean_km = (a_km * (cE - e)) * P + (a_km * eta * sE) * Q;
    const double r_mean_norm = norm(r_mean_km);
    const Vec3 r_km = ((r_mean_norm + dr_j2_km) / r_mean_norm) * r_mean_km;
    const double v_fac = (n_rad_s * a_km) / roa;
    const Vec3 v_kms = (-v_fac * sE) * P + (v_fac * eta * cE) * Q;

    // Co-rotating atmosphere relative velocity (m/s)
    const Vec3 v_rel_ms = {
        (v_kms.x + kOmegaEarthRadS * r_km.y) * 1000.0,
        (v_kms.y - kOmegaEarthRadS * r_km.x) * 1000.0,
        v_kms.z * 1000.0,
    };
    const Vec3 v_ms = {v_kms.x * 1000.0, v_kms.y * 1000.0, v_kms.z * 1000.0};
    const double v_rel_mag = norm(v_rel_ms);
    const double v_dot_vrel = dot(v_ms, v_rel_ms);

    // Rotate r_km to ECEF for WGS84 geodetic altitude and longitude
    const double x_e = cg * r_km.x + sg * r_km.y;
    const double y_e = -sg * r_km.x + cg * r_km.y;
    const double z_e = r_km.z;
    const double p_xy = std::hypot(x_e, y_e);
    double lon_deg = std::atan2(y_e, x_e) * kRad2Deg;
    if (lon_deg < 0.0) lon_deg += 360.0;

    // Bowring 1-iteration WGS-84 geodetic latitude & height (accurate to < 1 mm)
    double lat = std::atan2(z_e, p_xy * (1.0 - e2_wgs));
    for (int it = 0; it < 2; ++it) {
      const double slat = std::sin(lat);
      const double N_rad = kReKm / std::sqrt(1.0 - e2_wgs * slat * slat);
      lat = std::atan2(z_e + e2_wgs * N_rad * slat, p_xy);
    }
    const double slat = std::sin(lat), clat = std::cos(lat);
    const double N_rad = kReKm / std::sqrt(1.0 - e2_wgs * slat * slat);
    const double alt_km = (clat > 1e-4 ? p_xy / clat - N_rad : std::fabs(z_e) / std::fabs(slat) - N_rad * (1.0 - e2_wgs));
    if (alt_km > 1150.0) continue;

    double lst = std::fmod(ut_sec / 3600.0 + lon_deg / 15.0, 24.0);
    if (lst < 0.0) lst += 24.0;

    nrlmsise00::nrlmsise_input inp{};
    inp.year = year;
    inp.doy = doy;
    inp.sec = ut_sec;
    inp.alt = std::max(90.0, alt_km);
    inp.g_lat = lat * kRad2Deg;
    inp.g_long = lon_deg;
    inp.lst = lst;
    inp.f107A = spw_curr.f107_c81;
    inp.f107 = spw_prev.f107_obs;
    inp.ap = spw_curr.ap;
    inp.ap_a = nullptr;

    nrlmsise00::nrlmsise_output out{};
    nrlmsise00::gtd7d(&inp, &flags, &out);
    const double rho_kg_m3 = out.d[5];
    if (!(rho_kg_m3 > 0.0) || !std::isfinite(rho_kg_m3)) continue;

    // Exact Gauss energy decay rate da/dt = -(a^2 / mu) * B * rho * |v_rel| * (v . v_rel)
    // Note: B = BTERM = (1/2) Cd A / m in AP OCM! Wait — check BTERM definition in sdn-ap!
    // In sdn-ap (SPEC 3.3 / SGP4-XP), BTERM = Cd * A / m (m^2/kg) and drag accel a_drag = -0.5 * BTERM * rho * |v_rel| * v_rel!
    // Therefore da/dt = (2 a^2 / mu) * (v . a_drag) = -(a^2 / mu) * BTERM * rho * |v_rel| * (v . v_rel)!
    // Wait: dM = (1 - e cos E) dE = roa dE! So orbit average over M weights by roa!
    const double da_dt_inst = -(a_m * a_m / mu_m3_s2) * rho_kg_m3 * v_rel_mag * v_dot_vrel;
    sum_dadt_m_s += da_dt_inst * roa;
  }
  return (sum_dadt_m_s / NQ) * 86400.0;
}

// Block-specific attitude-law box-wing SRP effective cross-section ratio f_BW(|beta_rad|)
// Normalized so f_BW(0.45 rad ~ 25.8 deg) == 1.0 for clean compatibility with nominal Cr * A/m priors!
// Codes:
//  0 = SPHERE / CANNONBALL (constant 1.0)
//  1 = GPS_IIR / IIRM (large bus-to-panel ratio: strong beta modulation)
//  2 = GPS_IIF
//  3 = GPS_III
//  4 = GALILEO (elongated 1.3x1.1x2.7m bus: strong ECOM D0(beta) variation)
//  5 = GLONASS_M / K (cylindrical bus)
//  6 = BEIDOU_MEO / IGSO / QZSS
//  7 = GEO_3AXIS (nadir bus + N/S solar array tracking Sun declination)
inline double boxwing_raw(int32_t block_code, double abs_beta_rad) {
  if (block_code <= 0) return 1.0;
  double w_sp = 0.75, w_z = 0.13, w_x = 0.12;
  switch (block_code) {
    case 1: w_sp = 0.62; w_z = 0.21; w_x = 0.17; break; // GPS IIR/IIRM
    case 2: w_sp = 0.70; w_z = 0.16; w_x = 0.14; break; // GPS IIF
    case 3: w_sp = 0.76; w_z = 0.13; w_x = 0.11; break; // GPS III
    case 4: w_sp = 0.66; w_z = 0.23; w_x = 0.11; break; // GALILEO (elongated Z/X bus!)
    case 5: w_sp = 0.68; w_z = 0.18; w_x = 0.14; break; // GLONASS
    case 6: w_sp = 0.72; w_z = 0.15; w_x = 0.13; break; // BEIDOU / QZSS
    case 7: {
      // 3-axis GEO: solar wing pitched around N/S axis, cosine foreshortening cos(beta) on wings + bus
      const double cb = std::cos(abs_beta_rad), sb = std::sin(abs_beta_rad);
      return 0.78 * cb + 0.22 * (0.6366 * cb + 0.5 * sb);
    }
    default: break;
  }
  const double cb = std::cos(abs_beta_rad);
  // 8-point orbit-anomaly average over u in [0, pi/2] under nominal GNSS yaw-steering
  double sum_z = 0.0, sum_x = 0.0;
  for (int q = 0; q < 8; ++q) {
    const double u = (q + 0.5) * (0.5 * kPi / 8.0);
    const double cu_cb = std::cos(u) * cb;
    sum_z += std::fabs(cu_cb);
    sum_x += std::sqrt(std::max(0.0, 1.0 - cu_cb * cu_cb));
  }
  return w_sp + w_z * (sum_z / 8.0) + w_x * (sum_x / 8.0);
}

inline double boxwing_scale(int32_t block_code, double abs_beta_rad) {
  if (block_code <= 0) return 1.0;
  const double ref = boxwing_raw(block_code, 0.45);
  return ref > 1e-9 ? boxwing_raw(block_code, abs_beta_rad) / ref : 1.0;
}

// IERS 2010 step-1 degree-2 solid-Earth tidal acceleration in GCRF (km/s^2)
inline Vec3 solid_earth_tide_accel_kms2(Vec3 r_km, double d70) {
  const double r2 = dot(r_km, r_km);
  const double r = std::sqrt(r2);
  if (!(r > kReKm)) return {0.0, 0.0, 0.0};
  const Vec3 r_hat = (1.0 / r) * r_km;
  Vec3 r_sun, r_moon;
  double d_sun = 0.0, d_moon = 0.0;
  sun_moon_gcrf_km(d70, r_sun, d_sun, r_moon, d_moon);
  const Vec3 u_sun = (1.0 / d_sun) * r_sun;
  const Vec3 u_moon = (1.0 / d_moon) * r_moon;

  constexpr double k2 = 0.3012; // IERS 2010 nominal Love k2
  const double re5 = std::pow(kReKm, 5);
  const double r4 = r2 * r2;

  const double gs = dot(r_hat, u_sun);
  const double fac_s = 1.5 * k2 * kMuSunKm3S2 * re5 / (d_sun * d_sun * d_sun * r4);
  const Vec3 a_s = fac_s * ((1.0 - 5.0 * gs * gs) * r_hat + (2.0 * gs) * u_sun);

  const double gm = dot(r_hat, u_moon);
  const double fac_m = 1.5 * k2 * kMuMoonKm3S2 * re5 / (d_moon * d_moon * d_moon * r4);
  const Vec3 a_m = fac_m * ((1.0 - 5.0 * gm * gm) * r_hat + (2.0 * gm) * u_moon);

  return a_s + a_m;
}

// Fast Cholesky solver for dense SPD matrix A (n x n)
inline bool cholesky_factor(const double* A, double* L, int n) {
  std::fill(L, L + n * n, 0.0);
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j <= i; ++j) {
      double s = A[i * n + j];
      for (int k = 0; k < j; ++k) s -= L[i * n + k] * L[j * n + k];
      if (i == j) {
        if (!(s > 1e-24) || !std::isfinite(s)) return false;
        L[i * n + i] = std::sqrt(s);
      } else {
        L[i * n + j] = s / L[j * n + j];
      }
    }
  }
  return true;
}

// Forward substitution L y = b (lower triangular L, n x n)
inline void cholesky_forward(const double* L, const double* b, double* y, int n) {
  for (int i = 0; i < n; ++i) {
    double s = b[i];
    for (int k = 0; k < i; ++k) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
}

inline bool solve_spd_and_invert(const double* A, const double* rhs, int n, double* dx_out, double* inv_out) {
  std::vector<double> M(n * (2 * n + 1), 0.0);
  const int W = 2 * n + 1;
  for (int i = 0; i < n; ++i) {
    for (int j = 0; j < n; ++j) M[i * W + j] = A[i * n + j];
    M[i * W + n + i] = 1.0;
    M[i * W + 2 * n] = rhs[i];
  }
  for (int col = 0; col < n; ++col) {
    int piv = col;
    double max_abs = std::fabs(M[col * W + col]);
    for (int r = col + 1; r < n; ++r) {
      if (std::fabs(M[r * W + col]) > max_abs) {
        max_abs = std::fabs(M[r * W + col]);
        piv = r;
      }
    }
    if (!(max_abs > 1e-20) || !std::isfinite(max_abs)) return false;
    if (piv != col) {
      for (int j = 0; j < W; ++j) std::swap(M[col * W + j], M[piv * W + j]);
    }
    const double diag = M[col * W + col];
    for (int j = col; j < W; ++j) M[col * W + j] /= diag;
    for (int r = 0; r < n; ++r) {
      if (r == col) continue;
      const double f = M[r * W + col];
      if (f == 0.0) continue;
      for (int j = col; j < W; ++j) M[r * W + j] -= f * M[col * W + j];
    }
  }
  for (int i = 0; i < n; ++i) {
    dx_out[i] = M[i * W + 2 * n];
    for (int j = 0; j < n; ++j) inv_out[i * n + j] = M[i * W + n + j];
  }
  return true;
}

inline void vec_to_uvw(Vec3 r, Vec3 v, Vec3 q, double out[3]) {
  const double rn = norm(r);
  const Vec3 U = (1.0 / rn) * r;
  const Vec3 hc = cross(r, v);
  const double hn = norm(hc);
  const Vec3 W = (1.0 / hn) * hc;
  const Vec3 V = cross(W, U);
  out[0] = dot(q, U);
  out[1] = dot(q, V);
  out[2] = dot(q, W);
}

inline Vec3 uvw_to_vec(Vec3 r, Vec3 v, double u, double vv, double w) {
  const double rn = norm(r);
  const Vec3 U = (1.0 / rn) * r;
  const Vec3 hc = cross(r, v);
  const double hn = norm(hc);
  const Vec3 W = (1.0 / hn) * hc;
  const Vec3 V = cross(W, U);
  return u * U + vv * V + w * W;
}

// Integrate perturbed Hill-Clohessy-Wiltshire / Keplerian relative offset delta_x(t_k) in UVW->GCRF
// driven by differential acceleration da(t) integrated from t_ref to t_target!
// Exact for small non-conservative / tidal differential accelerations (< 1e-7 km/s^2 over <= 45 days).
inline void integrate_diff_perturbation_gcrf(
    double d70_ref,
    double d70_tgt,
    Vec3 r_tgt,
    Vec3 v_tgt,
    double a_km,
    double e,
    double inc_deg,
    double raan_deg,
    double agom_ref,
    int32_t block_code,
    int32_t enable_tides,
    int32_t enable_boxwing,
    Vec3& dr_gcrf_out,
    Vec3& dv_gcrf_out) {
  dr_gcrf_out = {0.0, 0.0, 0.0};
  dv_gcrf_out = {0.0, 0.0, 0.0};
  const double dt_days = d70_tgt - d70_ref;
  if (std::fabs(dt_days) < 1e-5 || (!enable_tides && !enable_boxwing)) return;

  const double ci = std::cos(inc_deg * kDeg2Rad), si = std::sin(inc_deg * kDeg2Rad);
  const double cO = std::cos(raan_deg * kDeg2Rad), sO = std::sin(raan_deg * kDeg2Rad);
  // Precessing orbital angular momentum unit vector h_hat(t) under secular J2 RAAN rate
  const double n_rad_s = std::sqrt(kMuKm3S2 / (a_km * a_km * a_km));
  const double p_km = a_km * std::max(1e-4, 1.0 - e * e);
  const double raan_dot_rad_day = -1.5 * n_rad_s * kJ2 * (kReKm / p_km) * (kReKm / p_km) * ci * 86400.0;

  auto h_hat_at = [&](double d70) -> Vec3 {
    const double Om = raan_deg * kDeg2Rad + raan_dot_rad_day * (d70 - d70_ref);
    return {si * std::sin(Om), -si * std::cos(Om), ci};
  };

  // Compute reference beta at d70_ref
  Vec3 r_s0, r_m0;
  double d_s0 = 0.0, d_m0 = 0.0;
  sun_moon_gcrf_km(d70_ref, r_s0, d_s0, r_m0, d_m0);
  const Vec3 h0 = h_hat_at(d70_ref);
  const double sin_beta_ref = std::max(-1.0, std::min(1.0, dot(h0, (1.0 / d_s0) * r_s0)));
  const double f_bw_ref = boxwing_scale(block_code, std::fabs(std::asin(sin_beta_ref)));

  // Orbit-averaged secular/long-period Gauss integration in (di, dOmega, dex, dey, dM) from d70_ref to d70_tgt
  const int n_steps = std::max(4, std::min(64, static_cast<int>(std::ceil(std::fabs(dt_days) / 0.5))));
  const double h_day = dt_days / n_steps;
  const double h_sec = h_day * 86400.0;

  double d_inc = 0.0, d_raan = 0.0, d_ex = 0.0, d_ey = 0.0, d_uM = 0.0;

  for (int s = 0; s < n_steps; ++s) {
    const double t_mid = d70_ref + (s + 0.5) * h_day;
    const double Om = raan_deg * kDeg2Rad + raan_dot_rad_day * (t_mid - d70_ref);
    const Vec3 h_u = {si * std::sin(Om), -si * std::cos(Om), ci};
    const Vec3 node_u = {std::cos(Om), std::sin(Om), 0.0};
    const Vec3 perp_u = cross(h_u, node_u);

    Vec3 r_sun, r_moon;
    double d_sun = 0.0, d_moon = 0.0;
    sun_moon_gcrf_km(t_mid, r_sun, d_sun, r_moon, d_moon);
    const Vec3 u_sun = (1.0 / d_sun) * r_sun;

    double delta_agom = 0.0;
    if (enable_boxwing && agom_ref > 0.0 && block_code > 0 && f_bw_ref > 1e-6) {
      const double sin_b = std::max(-1.0, std::min(1.0, dot(h_u, u_sun)));
      const double f_bw_t = boxwing_scale(block_code, std::fabs(std::asin(sin_b)));
      delta_agom = agom_ref * ((f_bw_t / f_bw_ref) - 1.0);
    }

    // 8-point orbit-anomaly average over u in [0, 2*pi)
    for (int q = 0; q < 8; ++q) {
      const double u_ang = (q + 0.5) * (kTwoPi / 8.0);
      const double cu = std::cos(u_ang), su = std::sin(u_ang);
      const Vec3 r_u = cu * node_u + su * perp_u;
      const Vec3 t_u = -su * node_u + cu * perp_u;
      const Vec3 r_orb = a_km * r_u;

      Vec3 da = {0.0, 0.0, 0.0};
      if (enable_tides) {
        da = da + solid_earth_tide_accel_kms2(r_orb, t_mid);
      }
      if (std::fabs(delta_agom) > 1e-9) {
        // Check cylindrical shadow
        const double proj = dot(r_orb, u_sun);
        const Vec3 perp_s = r_orb - proj * u_sun;
        const bool sunlit = (proj >= 0.0) || (dot(perp_s, perp_s) > kReKm * kReKm);
        if (sunlit) {
          const double au_ratio = kAuKm / d_sun;
          const double a_srp_kms2 = -1e-3 * kP0SrpNm2 * delta_agom * au_ratio * au_ratio;
          da = da + a_srp_kms2 * u_sun;
        }
      }

      const double R_acc = dot(da, r_u);
      const double T_acc = dot(da, t_u);
      const double W_acc = dot(da, h_u);
      const double inv_na = 1.0 / (n_rad_s * a_km);
      const double w_q = h_sec / 8.0;

      d_inc += (cu * W_acc * inv_na) * w_q;
      if (si > 1e-3) d_raan += (su * W_acc * inv_na / si) * w_q;
      d_ex += ((su * R_acc + 2.0 * cu * T_acc) * inv_na) * w_q;
      d_ey += ((-cu * R_acc + 2.0 * su * T_acc) * inv_na) * w_q;
      d_uM += (-2.0 * R_acc * inv_na - (si > 1e-3 ? ci * (su * W_acc * inv_na / si) : 0.0)) * w_q;
    }
  }

  // Map integrated differential element offsets at d70_tgt into UVW -> GCRF
  const double rn = norm(r_tgt);
  const Vec3 hc = cross(r_tgt, v_tgt);
  const Vec3 h_tgt = (1.0 / norm(hc)) * hc;
  const double Om_t = std::atan2(h_tgt.x, -h_tgt.y);
  const Vec3 node_t = {std::cos(Om_t), std::sin(Om_t), 0.0};
  const Vec3 perp_t = cross(h_tgt, node_t);
  const Vec3 r_u_tgt = (1.0 / rn) * r_tgt;
  const double cu_t = dot(r_u_tgt, node_t);
  const double su_t = dot(r_u_tgt, perp_t);

  const double dR_km = -a_km * (d_ex * cu_t + d_ey * su_t);
  const double dT_km = a_km * (d_uM + 2.0 * (d_ex * su_t - d_ey * cu_t) + d_raan * std::cos(inc_deg * kDeg2Rad));
  const double dW_km = a_km * (d_inc * su_t - d_raan * std::sin(inc_deg * kDeg2Rad) * cu_t);

  const double dR_vel = n_rad_s * a_km * (d_ex * su_t - d_ey * cu_t);
  const double dT_vel = 2.0 * n_rad_s * a_km * (d_ex * cu_t + d_ey * su_t);
  const double dW_vel = n_rad_s * a_km * (d_inc * cu_t + d_raan * std::sin(inc_deg * kDeg2Rad) * su_t);

  dr_gcrf_out = uvw_to_vec(r_tgt, v_tgt, dR_km, dT_km, dW_km);
  dv_gcrf_out = uvw_to_vec(r_tgt, v_tgt, dR_vel, dT_vel, dW_vel);
}

}  // namespace tleup

// =================================================================================================
// Exported C ABI Kernels
// =================================================================================================

TLEUP_EXPORT("tleup_alloc")
uint8_t* tleup_alloc(uint32_t bytes) {
  return static_cast<uint8_t*>(std::malloc(bytes > 0 ? bytes : 8));
}

TLEUP_EXPORT("tleup_free")
void tleup_free(void* ptr) {
  std::free(ptr);
}

TLEUP_EXPORT("tleup_cid_v1_raw_sha256")
uint32_t tleup_cid_v1_raw_sha256(const uint8_t* data, uint32_t len, char* out_buf, uint32_t out_cap) {
  if (!data || !out_buf || out_cap < 64) return 0;
  const std::string s = sdn_cid::cid_v1_raw_sha256(data, len);
  if (s.size() + 1 > out_cap) return 0;
  std::memcpy(out_buf, s.c_str(), s.size() + 1);
  return static_cast<uint32_t>(s.size());
}

/**
 * Kernel 1: Causal 27-Day Bartels Solar-Rotation + AR(1) Space Weather Forecaster & 81-Day Mean
 */
TLEUP_EXPORT("tleup_forecast_spw_bartels")
int32_t tleup_forecast_spw_bartels(
    const int32_t* obs_mjd,
    const double* obs_f107,
    const double* obs_ap,
    int32_t n_obs,
    const int32_t* sgarf_mjd,
    const double* sgarf_f107,
    const double* sgarf_ap,
    int32_t n_sgarf,
    int32_t cutoff_mjd,
    int32_t grid_start_mjd,
    int32_t grid_count,
    double* out_f107,
    double* out_f107_c81,
    double* out_ap,
    int32_t* out_is_prd) {
  using namespace tleup;
  if (grid_count <= 0 || !out_f107 || !out_f107_c81 || !out_ap || !out_is_prd) return -1;

  // Build dense internal map covering [min(grid_start_mjd - 85, cutoff_mjd - 120) .. grid_start_mjd + grid_count + 85]
  const int32_t m0 = std::min(grid_start_mjd - 85, cutoff_mjd - 120);
  const int32_t m1 = grid_start_mjd + grid_count + 85;
  const int32_t span = m1 - m0 + 1;
  std::vector<double> f(span, -1.0), ap(span, -1.0);
  std::vector<int32_t> prd(span, 1);

  for (int32_t i = 0; i < n_obs; ++i) {
    const int32_t m = obs_mjd[i];
    if (m > cutoff_mjd || m < m0 || m > m1) continue;
    const int32_t idx = m - m0;
    if (obs_f107[i] > 40.0 && std::isfinite(obs_f107[i])) f[idx] = obs_f107[i];
    if (obs_ap[i] >= 0.0 && std::isfinite(obs_ap[i])) ap[idx] = obs_ap[i];
    prd[idx] = (m < cutoff_mjd) ? 0 : 1;
  }

  // Interpolate any tiny gaps strictly <= cutoff_mjd
  double last_f = 135.0, last_ap = 8.0;
  for (int32_t k = 0; k < span; ++k) {
    if (m0 + k > cutoff_mjd) break;
    if (f[k] > 0.0) last_f = f[k];
    if (ap[k] >= 0.0) last_ap = ap[k];
  }
  // Forward/backward fill <= cutoff_mjd
  double cur_f = 135.0, cur_ap = 8.0;
  for (int32_t k = 0; k < span; ++k) {
    if (f[k] > 0.0) { cur_f = f[k]; break; }
  }
  for (int32_t k = 0; k < span; ++k) {
    if (ap[k] >= 0.0) { cur_ap = ap[k]; break; }
  }
  for (int32_t k = 0; k <= cutoff_mjd - m0 && k < span; ++k) {
    if (f[k] <= 0.0) f[k] = cur_f; else cur_f = f[k];
    if (ap[k] < 0.0) ap[k] = cur_ap; else cur_ap = ap[k];
  }

  // Apply SGARF on cutoff_mjd if cutoff_mjd had no observed F10.7/Ap
  std::map<int32_t, std::pair<double, double>> sgarf_map;
  for (int32_t i = 0; i < n_sgarf; ++i) {
    if (sgarf_f107[i] > 40.0 && sgarf_ap[i] >= 0.0) {
      sgarf_map[sgarf_mjd[i]] = {sgarf_f107[i], sgarf_ap[i]};
    }
  }
  const int32_t c_idx = cutoff_mjd - m0;
  if (c_idx >= 0 && c_idx < span && sgarf_map.count(cutoff_mjd)) {
    // Keep observed cutoff day if present in obs, otherwise SGARF day 0
    bool had_obs_cutoff = false;
    for (int32_t i = 0; i < n_obs; ++i) if (obs_mjd[i] == cutoff_mjd && obs_f107[i] > 40.0) had_obs_cutoff = true;
    if (!had_obs_cutoff) {
      f[c_idx] = sgarf_map[cutoff_mjd].first;
      ap[c_idx] = sgarf_map[cutoff_mjd].second;
      prd[c_idx] = 1;
    }
  }

  // Compute causal trailing 81-day solar mean & 27-day solar mean & quiet geomagnetic median
  double sum81 = 0.0; int cnt81 = 0;
  double sum27_0 = 0.0; int cnt27_0 = 0;
  double sum27_1 = 0.0; int cnt27_1 = 0;
  std::vector<double> recent_ap;
  for (int32_t d = 0; d < 81; ++d) {
    const int32_t idx = c_idx - d;
    if (idx >= 0 && idx < span) {
      sum81 += f[idx]; cnt81++;
      if (d < 27) { sum27_0 += f[idx]; cnt27_0++; recent_ap.push_back(ap[idx]); }
      else if (d < 54) { sum27_1 += f[idx]; cnt27_1++; }
    }
  }
  const double f81_trail = cnt81 > 0 ? sum81 / cnt81 : cur_f;
  const double f27_0 = cnt27_0 > 0 ? sum27_0 / cnt27_0 : f81_trail;
  const double f27_1 = cnt27_1 > 0 ? sum27_1 / cnt27_1 : f27_0;
  // Median Ap over trailing 27 days (avoids storm tail bias)
  const double ap_bg = std::max(4.0, std::min(14.0, recent_ap.empty() ? 8.0 : median_vec(recent_ap)));

  const double f0 = (c_idx >= 0 && c_idx < span) ? f[c_idx] : f81_trail;
  const double ap0 = (c_idx >= 0 && c_idx < span) ? ap[c_idx] : ap_bg;

  // Forecast strictly causal post-cutoff days m > cutoff_mjd
  for (int32_t k = std::max(0, c_idx + 1); k < span; ++k) {
    const int32_t m = m0 + k;
    const double dt = static_cast<double>(m - cutoff_mjd);
    prd[k] = 1;

    // 27-day Bartels solar rotation anomaly relative to its 27-day mean
    const double df_27 = (k - 27 >= 0) ? (f[k - 27] - f27_0) : 0.0;
    const double df_54 = (k - 54 >= 0) ? (f[k - 54] - f27_1) : df_27;
    const double rot_anom = 0.72 * df_27 + 0.28 * df_54;
    // Relax 27-day rotation amplitude gently over multiple solar rotations toward f81_trail
    const double rot_decay = std::exp(-dt / 45.0);
    const double f_bartels = f27_0 * std::exp(-dt / 35.0) + f81_trail * (1.0 - std::exp(-dt / 35.0)) + rot_decay * rot_anom;

    // Persistence from f0 at tau_F = 3.5 days into Bartels recurrence
    const double w_pers = std::exp(-dt / 3.5);
    double f_pred = w_pers * f0 + (1.0 - w_pers) * f_bartels;

    // Blend official SGARF 3-day USAF/NOAA forecast on days +1, +2 if causal SGARF exists
    auto it_sg = sgarf_map.find(m);
    if (it_sg != sgarf_map.end() && dt <= 2.5) {
      const double w_sg = dt <= 1.5 ? 0.75 : 0.55;
      f_pred = w_sg * it_sg->second.first + (1.0 - w_sg) * f_pred;
    }
    f[k] = std::max(65.0, std::min(320.0, f_pred));

    // Geomagnetic Ap: AR(1) storm relaxation (tau_Ap = 1.25 d) + weak 27-day coronal-hole recurrence
    const double dap_27 = (k - 27 >= 0) ? std::max(-4.0, std::min(16.0, ap[k - 27] - ap_bg)) : 0.0;
    double ap_pred = ap_bg + (ap0 - ap_bg) * std::exp(-dt / 1.25) + 0.20 * std::exp(-dt / 30.0) * dap_27;
    if (it_sg != sgarf_map.end() && dt <= 2.5) {
      const double w_sg = dt <= 1.5 ? 0.75 : 0.50;
      ap_pred = w_sg * it_sg->second.second + (1.0 - w_sg) * ap_pred;
    }
    ap[k] = std::max(2.0, std::min(80.0, std::round(ap_pred)));
  }

  // Populate output grid + exact 81-day centered mean [k - 40 .. k + 40]
  for (int32_t j = 0; j < grid_count; ++j) {
    const int32_t k = (grid_start_mjd + j) - m0;
    double sum = 0.0;
    int cnt = 0;
    for (int32_t q = std::max(0, k - 40); q <= std::min(span - 1, k + 40); ++q) {
      sum += f[q];
      cnt++;
    }
    out_f107[j] = f[k];
    out_f107_c81[j] = cnt > 0 ? sum / cnt : f[k];
    out_ap[j] = ap[k];
    out_is_prd[j] = prd[k];
  }
  return 0;
}

/**
 * Load causal SPW table into WASM memory for NRLMSISE-00 evaluations.
 */
TLEUP_EXPORT("tleup_set_spw_table")
void tleup_set_spw_table(
    const int32_t* mjd,
    const double* f107_obs,
    const double* f107_c81,
    const double* ap,
    int32_t count) {
  tleup::g_spw_table.clear();
  if (count <= 0) return;
  tleup::g_spw_table.reserve(count);
  for (int32_t i = 0; i < count; ++i) {
    tleup::g_spw_table.push_back({mjd[i], f107_obs[i], f107_c81[i], ap[i]});
  }
  std::sort(tleup::g_spw_table.begin(), tleup::g_spw_table.end(),
            [](const tleup::SpwEntry& a, const tleup::SpwEntry& b) { return a.mjd < b.mjd; });
}

/**
 * Compute observed Brouwer decay vs NRLMSISE-00 unit-BTERM decay across N TLE pairs.
 * Each input row has 11 doubles: [d70_a, n_a, e_a, inc_a, raan_a, argp_a, d70_b, n_b, e_b, inc_b, raan_b]
 * Outputs:
 *  - out_lnb[j]: ln( (-da_obs_m) / (-da_msis_unit_m) ), or NaN if non-decaying / maneuvered / invalid
 *  - out_weight[j]: statistical precision weight 1 / sigma_lnb^2
 */
TLEUP_EXPORT("tleup_compute_msis_arc_lnb")
int32_t tleup_compute_msis_arc_lnb(
    const double* arcs_11,
    int32_t n_arcs,
    double* out_lnb,
    double* out_weight) {
  using namespace tleup;
  if (n_arcs <= 0 || !arcs_11 || !out_lnb || !out_weight) return 0;
  int32_t valid_count = 0;

  for (int32_t j = 0; j < n_arcs; ++j) {
    const double* r = arcs_11 + j * 11;
    const double d70_a = r[0], n_a = r[1], e_a = r[2], inc_a = r[3], raan_a = r[4], argp_a = r[5];
    const double d70_b = r[6], n_b = r[7], e_b = r[8], inc_b = r[9], raan_b = r[10];

    out_lnb[j] = std::numeric_limits<double>::quiet_NaN();
    out_weight[j] = 0.0;

    const double dt_days = d70_b - d70_a;
    if (!(dt_days >= 0.30 && dt_days <= 20.0)) continue;
    if (std::fabs(inc_b - inc_a) > 0.012) continue; // plane-change burn gate

    double nb_a = 0.0, a_a_km = 0.0, nb_b = 0.0, a_b_km = 0.0;
    kozai_to_brouwer(n_a, e_a, inc_a, nb_a, a_a_km);
    kozai_to_brouwer(n_b, e_b, inc_b, nb_b, a_b_km);

    const double hp_km = a_a_km * (1.0 - e_a) - kReKm;
    if (hp_km < 220.0 || hp_km > 1000.0) continue;

    // Subtract odd-zonal J3 eccentricity-coupled long-period Brouwer semi-major axis safety check:
    // Brouwer mean semi-major axis has zero J3 term, and da_obs in meters is:
    const double da_obs_m = (a_b_km - a_a_km) * 1000.0;
    // Require measurable natural decay (> 0.8 m drop so random SMA noise doesn't flip sign)
    if (!(da_obs_m < -0.8)) continue;

    // Integrate unit-BTERM NRLMSISE-00 decay using 2-point Gauss-Legendre in time across [d70_a, d70_b]
    const double g0 = 0.5 - 0.28867513459481287;
    const double g1 = 0.5 + 0.28867513459481287;
    double draan = raan_b - raan_a;
    if (draan > 180.0) draan -= 360.0;
    if (draan < -180.0) draan += 360.0;

    const double dadt0 = msis_unit_dadt_m_per_day(
        d70_a + g0 * dt_days, 0.5 * (a_a_km + a_b_km), 0.5 * (e_a + e_b),
        0.5 * (inc_a + inc_b), raan_a + g0 * draan, argp_a);
    const double dadt1 = msis_unit_dadt_m_per_day(
        d70_a + g1 * dt_days, 0.5 * (a_a_km + a_b_km), 0.5 * (e_a + e_b),
        0.5 * (inc_a + inc_b), raan_a + g1 * draan, argp_a);

    const double da_msis_unit_m = 0.5 * (dadt0 + dadt1) * dt_days;
    if (!(da_msis_unit_m < -1e-5) || !std::isfinite(da_msis_unit_m)) continue;

    const double b_obs = (-da_obs_m) / (-da_msis_unit_m);
    if (!(b_obs > 1e-5 && b_obs < 10.0) || !std::isfinite(b_obs)) continue;

    // Single-TLE Brouwer SMA precision ~ 2.2 m -> pair difference sigma_da ~ 3.1 m (+ 6% model floor)
    const double rel_sig = std::hypot(3.1 / std::fabs(da_obs_m), 0.06);
    if (rel_sig > 1.25) continue;

    out_lnb[j] = std::log(b_obs);
    out_weight[j] = 1.0 / (rel_sig * rel_sig);
    valid_count++;
  }
  return valid_count;
}

/**
 * Kernel 2: Fleet-Wide TLE Dynamic Atmospheric Calibration ($DCL LogDensityNodes)
 * Generalized Schur-complement tridiagonal + Cholesky solver over passive LEO calibration arcs.
 * Each input arc has 7 doubles:
 *   [sat_id, start_ms, end_ms, lnb_obs, lnb_prior, prior_sigma, arc_weight]
 * Outputs node_ms[out_n], node_s[out_n] (covering history + forecast tail out to issue_ms + forecast_span_hours).
 * Also caches the solved s(t) inside WASM memory for tleup_track_rolling_ballistics!
 */
TLEUP_EXPORT("tleup_solve_fleet_dca")
int32_t tleup_solve_fleet_dca(
    const double* arcs_7,
    int32_t n_arcs_in,
    double issue_ms,
    double step_hours,
    double history_days,
    double forecast_tau_hours,
    double forecast_span_hours,
    double global_level_prior_sigma,
    double* out_node_ms,
    double* out_node_s,
    int32_t max_out_nodes,
    double* out_stats_6) {
  using namespace tleup;
  constexpr double kHourMs = 3600000.0;
  constexpr double kDayMs = 86400000.0;

  if (n_arcs_in < 10 || !arcs_7 || !out_node_ms || !out_node_s || max_out_nodes < 8) return -1;
  const double step_ms = std::max(6.0, step_hours) * kHourMs;
  const double hist_start_ms = issue_ms - std::max(7.0, history_days) * kDayMs;

  struct ArcRow {
    int32_t sat_id;
    double start_ms, end_ms, y, prior_mean, prior_sig, w_obs;
    size_t idx;
    std::vector<std::pair<int, double>> node_w;
  };

  std::vector<ArcRow> valid;
  valid.reserve(n_arcs_in);
  double lo_ms = issue_ms, hi_ms = hist_start_ms;
  for (int32_t i = 0; i < n_arcs_in; ++i) {
    const double* a = arcs_7 + i * 7;
    const int32_t sat_id = static_cast<int32_t>(a[0]);
    const double s_ms = a[1], e_ms = a[2], y = a[3], pm = a[4], ps = a[5], wo = a[6];
    if (!std::isfinite(s_ms) || !std::isfinite(e_ms) || !std::isfinite(y) || !(e_ms > s_ms)) continue;
    if (e_ms > issue_ms + 1.0 || e_ms < hist_start_ms || wo <= 0.0) continue;
    const double clip_s = std::max(s_ms, hist_start_ms);
    if (e_ms - clip_s < 4.0 * kHourMs) continue;
    lo_ms = std::min(lo_ms, clip_s);
    hi_ms = std::max(hi_ms, e_ms);
    valid.push_back({sat_id, clip_s, e_ms, y, pm, ps, std::min(100.0, wo), valid.size(), {}});
  }
  if (valid.size() < 12 || !(hi_ms > lo_ms)) return -2;

  // Align nodes cleanly backward from issue_ms so the last historical node sits near issue_ms
  const int n_hist = std::max(3, std::min(120, static_cast<int>(std::ceil((issue_ms - lo_ms) / step_ms)) + 1));
  const double first_node_ms = issue_ms - (n_hist - 1) * step_ms;

  auto hat = [](double x, double h) -> double {
    if (x <= -h) return 0.0;
    if (x <= 0.0) return (x + h) * (x + h) / (2.0 * h);
    if (x <= h) return h - (h - x) * (h - x) / (2.0 * h);
    return h;
  };

  std::map<int32_t, size_t> sat_map;
  std::vector<std::vector<ArcRow>> by_sat;
  std::vector<int> sat_support(n_hist, 0);
  std::vector<double> node_info(n_hist, 0.0);

  for (auto& a : valid) {
    auto it = sat_map.find(a.sat_id);
    if (it == sat_map.end()) {
      it = sat_map.emplace(a.sat_id, by_sat.size()).first;
      by_sat.emplace_back();
    }
    const int k0 = std::max(0, static_cast<int>(std::floor((a.start_ms - first_node_ms) / step_ms)));
    const int k1 = std::min(n_hist - 1, static_cast<int>(std::ceil((a.end_ms - first_node_ms) / step_ms)));
    double w_sum = 0.0;
    for (int k = k0; k <= k1; ++k) {
      const double t_node = first_node_ms + k * step_ms;
      const double w = (hat(a.end_ms - t_node, step_ms) - hat(a.start_ms - t_node, step_ms)) / (a.end_ms - a.start_ms);
      if (w > 1e-6) {
        a.node_w.push_back({k, w});
        w_sum += w;
      }
    }
    if (w_sum > 1e-6) {
      for (auto& nw : a.node_w) {
        nw.second /= w_sum;
        sat_support[nw.first] += 1;
        node_info[nw.first] += nw.second * nw.second * a.w_obs;
      }
      by_sat[it->second].push_back(a);
    }
  }
  if (by_sat.size() < 4) return -3;

  struct Tridiag {
    std::vector<double> e, cp, dp;
    bool factor(std::vector<double> d, std::vector<double> off) {
      e = std::move(off); dp = std::move(d); cp.assign(dp.size(), 0.0);
      if (!(dp[0] > 1e-18)) return false;
      for (size_t j = 1; j < dp.size(); ++j) {
        cp[j - 1] = e[j - 1] / dp[j - 1];
        dp[j] -= e[j - 1] * cp[j - 1];
        if (!(dp[j] > 1e-18)) return false;
      }
      return true;
    }
    std::vector<double> solve(const std::vector<double>& b) const {
      std::vector<double> x(b.size());
      x[0] = b[0] / dp[0];
      for (size_t j = 1; j < x.size(); ++j) x[j] = (b[j] - e[j - 1] * x[j - 1]) / dp[j];
      for (int j = static_cast<int>(x.size()) - 2; j >= 0; --j) x[j] -= cp[j] * x[j + 1];
      return x;
    }
  };

  std::vector<std::vector<double>> dt_sat(by_sat.size()), beta_sat(by_sat.size());
  for (size_t i = 0; i < by_sat.size(); ++i) {
    auto& list = by_sat[i];
    std::stable_sort(list.begin(), list.end(), [](const ArcRow& a, const ArcRow& b) {
      return (a.start_ms + a.end_ms) < (b.start_ms + b.end_ms);
    });
    dt_sat[i].assign(list.size(), 1.0);
    beta_sat[i].assign(list.size(), 0.0);
    for (size_t j = 1; j < list.size(); ++j) {
      dt_sat[i][j] = std::max(0.05, 0.5 * ((list[j].start_ms + list[j].end_ms) - (list[j - 1].start_ms + list[j - 1].end_ms)) / kDayMs);
    }
  }

  std::vector<double> huber_w(valid.size(), 1.0);
  std::vector<double> s(n_hist, 0.0);
  constexpr double kSatRwPerSqrtDay = 0.012;
  constexpr double kNodeSmoothSigma = 0.055; // smooths 12h/24h common-mode density scale
  const double smooth_prec = (1.0 / (kNodeSmoothSigma * kNodeSmoothSigma)) * (kDayMs / step_ms);
  const double level_prec = global_level_prior_sigma > 0.0 ? 1.0 / (global_level_prior_sigma * global_level_prior_sigma) : 0.0;

  bool converged = false;
  int iters_done = 0;
  double post_rms = 0.0;

  for (int it = 0; it < 25; ++it) {
    iters_done = it + 1;
    std::vector<double> A(n_hist * n_hist, 0.0), rhs(n_hist, 0.0);
    std::vector<Tridiag> factors(by_sat.size());

    for (size_t i = 0; i < by_sat.size(); ++i) {
      const auto& list = by_sat[i];
      const size_t m = list.size();
      std::vector<double> d(m, 0.0), off(m > 1 ? m - 1 : 0, 0.0), oy(m, 0.0);

      for (size_t j = 0; j < m; ++j) {
        const double w = huber_w[list[j].idx] * list[j].w_obs;
        d[j] += w;
        oy[j] += w * list[j].y;
      }
      // Anchor satellite ballistic baseline to physical sphere / DISCOS prior if supplied!
      if (std::isfinite(list[0].prior_mean) && list[0].prior_sig > 0.0 && list[0].prior_sig < 1.0) {
        const double wp = 1.0 / (list[0].prior_sig * list[0].prior_sig * m);
        for (size_t j = 0; j < m; ++j) {
          d[j] += wp;
          oy[j] += wp * list[0].prior_mean;
        }
      } else {
        // Weak numerical gauge regularizer so unanchored debris still solve cleanly
        for (size_t j = 0; j < m; ++j) d[j] += 1e-4;
      }
      for (size_t j = 1; j < m; ++j) {
        const double k_rw = 1.0 / (kSatRwPerSqrtDay * kSatRwPerSqrtDay * dt_sat[i][j]);
        d[j - 1] += k_rw;
        d[j] += k_rw;
        off[j - 1] = -k_rw;
      }
      if (!factors[i].factor(d, off)) return -4;
      const auto z = factors[i].solve(oy);

      std::map<int, std::vector<double>> cols, x_cols;
      for (size_t j = 0; j < m; ++j) {
        const double w = huber_w[list[j].idx] * list[j].w_obs;
        for (const auto& nw : list[j].node_w) {
          auto& col = cols[nw.first];
          if (col.empty()) col.assign(m, 0.0);
          col[j] += w * nw.second;
        }
      }
      for (const auto& kv : cols) x_cols[kv.first] = factors[i].solve(kv.second);

      for (size_t j = 0; j < m; ++j) {
        const double w = huber_w[list[j].idx] * list[j].w_obs;
        for (const auto& p : list[j].node_w) {
          rhs[p.first] += w * p.second * list[j].y;
          for (const auto& q : list[j].node_w) {
            A[p.first * n_hist + q.first] += w * p.second * q.second;
          }
        }
      }
      for (const auto& [n1, col1] : cols) {
        double dot_z = 0.0;
        for (size_t j = 0; j < m; ++j) dot_z += col1[j] * z[j];
        rhs[n1] -= dot_z;
        for (const auto& [n2, x2] : x_cols) {
          double dot_x = 0.0;
          for (size_t j = 0; j < m; ++j) dot_x += col1[j] * x2[j];
          A[n1 * n_hist + n2] -= dot_x;
        }
      }
    }

    // First-difference random-walk smoothing + global level prior
    for (int k = 0; k + 1 < n_hist; ++k) {
      A[k * n_hist + k] += smooth_prec;
      A[(k + 1) * n_hist + (k + 1)] += smooth_prec;
      A[k * n_hist + (k + 1)] -= smooth_prec;
      A[(k + 1) * n_hist + k] -= smooth_prec;
    }
    for (int k = 0; k < n_hist; ++k) {
      A[k * n_hist + k] += (level_prec / n_hist) + 1e-6;
    }

    std::vector<double> L(n_hist * n_hist, 0.0), y_tmp(n_hist, 0.0), s_next(n_hist, 0.0);
    if (!cholesky_factor(A.data(), L.data(), n_hist)) return -5;
    cholesky_forward(L.data(), rhs.data(), y_tmp.data(), n_hist);
    for (int k = n_hist - 1; k >= 0; --k) {
      double v = y_tmp[k];
      for (int q = k + 1; q < n_hist; ++q) v -= L[q * n_hist + k] * s_next[q];
      s_next[k] = v / L[k * n_hist + k];
    }

    double max_step = 0.0;
    for (int k = 0; k < n_hist; ++k) {
      s_next[k] = std::max(-0.85, std::min(0.85, s_next[k]));
      max_step = std::max(max_step, std::fabs(s_next[k] - s[k]));
    }
    s = std::move(s_next);

    // Update satellite baselines & Huber weights
    std::vector<double> abs_norm_res;
    abs_norm_res.reserve(valid.size());
    double sum_r2 = 0.0;
    size_t cnt_r = 0;
    for (size_t i = 0; i < by_sat.size(); ++i) {
      const auto& list = by_sat[i];
      const size_t m = list.size();
      std::vector<double> b_vec(m, 0.0);
      for (size_t j = 0; j < m; ++j) {
        double mod = 0.0;
        for (const auto& nw : list[j].node_w) mod += nw.second * s[nw.first];
        const double w = huber_w[list[j].idx] * list[j].w_obs;
        b_vec[j] = w * (list[j].y - mod);
      }
      if (std::isfinite(list[0].prior_mean) && list[0].prior_sig > 0.0 && list[0].prior_sig < 1.0) {
        const double wp = 1.0 / (list[0].prior_sig * list[0].prior_sig * m);
        for (size_t j = 0; j < m; ++j) b_vec[j] += wp * list[0].prior_mean;
      }
      beta_sat[i] = factors[i].solve(b_vec);
      for (size_t j = 0; j < m; ++j) {
        double mod = 0.0;
        for (const auto& nw : list[j].node_w) mod += nw.second * s[nw.first];
        const double res = list[j].y - beta_sat[i][j] - mod;
        sum_r2 += res * res;
        cnt_r++;
        abs_norm_res.push_back(std::fabs(res) * std::sqrt(list[j].w_obs));
      }
    }
    post_rms = cnt_r > 0 ? std::sqrt(sum_r2 / cnt_r) : 0.0;
    const double rob_scale = std::max(0.5, 1.4826 * median_vec(abs_norm_res));
    for (size_t i = 0; i < by_sat.size(); ++i) {
      const auto& list = by_sat[i];
      for (size_t j = 0; j < list.size(); ++j) {
        double mod = 0.0;
        for (const auto& nw : list[j].node_w) mod += nw.second * s[nw.first];
        const double z = std::fabs(list[j].y - beta_sat[i][j] - mod) * std::sqrt(list[j].w_obs) / rob_scale;
        huber_w[list[j].idx] = z > 1.8 ? 1.8 / z : 1.0;
      }
    }
    if (max_step < 1e-4 && it >= 3) {
      converged = true;
      break;
    }
  }

  // Empirical-Bayes trailing baseline for causal forecast relaxation:
  // s(issue + dt) relaxes from s_last toward the 21-day trailing background s_bg at tau = forecast_tau_hours!
  // Why toward s_bg (and NOT 0)? Because if NRLMSISE-00 has a persistent solar-cycle thermospheric bias s_bg
  // over the current solar rotation, holding s_bg while relaxing storm transients (s_last - s_bg) * exp(-dt/tau)
  // preserves BOTH storm recovery AND persistent solar-cycle density calibration!
  double sum_bg = 0.0, w_bg = 0.0;
  for (int k = std::max(0, n_hist - static_cast<int>(std::round(21.0 * 24.0 / step_hours))); k < n_hist; ++k) {
    sum_bg += s[k];
    w_bg += 1.0;
  }
  const double s_bg = w_bg > 0.0 ? 0.65 * (sum_bg / w_bg) : 0.0;
  const double s_last = s[n_hist - 1];

  // Store historical nodes in WASM memory for rolling ballistic de-aliasing
  g_dca_d70.clear();
  g_dca_s.clear();

  int32_t out_n = 0;
  for (int k = 0; k < n_hist && out_n < max_out_nodes; ++k) {
    const double ms = std::round(first_node_ms + k * step_ms);
    out_node_ms[out_n] = ms;
    out_node_s[out_n] = s[k];
    g_dca_d70.push_back(ms / kDayMs);
    g_dca_s.push_back(s[k]);
    out_n++;
  }

  // Append explicit 6-hour forecast nodes from issue_ms through issue_ms + forecast_span_hours
  const double tail_step_ms = 6.0 * kHourMs;
  const double end_tail_ms = issue_ms + std::max(72.0, forecast_span_hours) * kHourMs;
  for (double ms = out_node_ms[out_n - 1] + tail_step_ms; ms <= end_tail_ms + 1.0 && out_n < max_out_nodes; ms += tail_step_ms) {
    const double dt_h = std::max(0.0, (ms - issue_ms) / kHourMs);
    const double s_val = forecast_tau_hours > 0.0
        ? s_bg + (s_last - s_bg) * std::exp(-dt_h / forecast_tau_hours)
        : s_last;
    out_node_ms[out_n] = std::round(ms);
    out_node_s[out_n] = s_val;
    g_dca_d70.push_back(ms / kDayMs);
    g_dca_s.push_back(s_val);
    out_n++;
  }

  if (out_stats_6) {
    out_stats_6[0] = converged ? 1.0 : 0.0;
    out_stats_6[1] = static_cast<double>(iters_done);
    out_stats_6[2] = static_cast<double>(valid.size());
    out_stats_6[3] = static_cast<double>(by_sat.size());
    out_stats_6[4] = post_rms;
    out_stats_6[5] = s_last;
  }
  return out_n;
}

/**
 * Kernel 3a: Multi-Month Rolling Huber-Kalman Ballistic Tracker (ln BTERM)
 * Subtracts solved fleet s(t) from each historical arc so solar/geomagnetic density errors never corrupt BTERM!
 * Input segs_4: [mid_d70, lnb_obs_raw, weight, is_valid_unused] (4 doubles per segment, chronological)
 */
TLEUP_EXPORT("tleup_track_rolling_ballistics")
int32_t tleup_track_rolling_ballistics(
    const double* segs_3,
    int32_t n_segs,
    double prior_lnb,
    double prior_sig,
    double rw_per_sqrt_day,
    int32_t subtract_dca,
    double* out_post_4) {
  using namespace tleup;
  if (!out_post_4) return -1;
  double mu = prior_lnb;
  double var = prior_sig * prior_sig;
  int32_t used = 0;

  if (n_segs > 0 && segs_3) {
    // Robust pre-screen median of de-biased lnB to reject unflagged burns before forward Kalman pass
    std::vector<double> clean_vals;
    clean_vals.reserve(n_segs);
    for (int32_t k = 0; k < n_segs; ++k) {
      const double mid_d70 = segs_3[k * 3 + 0];
      const double lnb_raw = segs_3[k * 3 + 1];
      const double w = segs_3[k * 3 + 2];
      if (!std::isfinite(lnb_raw) || !(w > 0.0)) continue;
      const double y = lnb_raw - (subtract_dca ? eval_dca_s_at_d70(mid_d70) : 0.0);
      clean_vals.push_back(y);
    }
    const double med_y = clean_vals.empty() ? prior_lnb : median_vec(clean_vals);
    std::vector<double> dev;
    for (double y : clean_vals) dev.push_back(std::fabs(y - med_y));
    const double mad_sig = std::max(0.12, 1.4826 * median_vec(dev));

    double prev_d70 = std::numeric_limits<double>::quiet_NaN();
    for (int32_t k = 0; k < n_segs; ++k) {
      const double mid_d70 = segs_3[k * 3 + 0];
      const double lnb_raw = segs_3[k * 3 + 1];
      const double w = segs_3[k * 3 + 2];
      if (!std::isfinite(lnb_raw) || !(w > 0.0)) continue;
      const double y = lnb_raw - (subtract_dca ? eval_dca_s_at_d70(mid_d70) : 0.0);

      // Reject 3.5-MAD maneuver/outlier spikes
      if (clean_vals.size() >= 4 && std::fabs(y - med_y) > 3.5 * mad_sig) continue;

      if (std::isfinite(prev_d70) && mid_d70 > prev_d70) {
        var += (rw_per_sqrt_day * rw_per_sqrt_day) * (mid_d70 - prev_d70);
      }
      prev_d70 = mid_d70;

      const double obs_var = std::max(0.015 * 0.015, 1.0 / w);
      const double innov = y - mu;
      const double S = var + obs_var;
      const double z = std::fabs(innov) / std::sqrt(S);
      const double huber = z > 2.2 ? 2.2 / z : 1.0;
      const double eff_obs_var = obs_var / (huber * huber);

      const double K = var / (var + eff_obs_var);
      mu += K * innov;
      var = (1.0 - K) * var;
      used++;
    }
  }

  out_post_4[0] = std::max(std::log(1e-5), std::min(std::log(10.0), mu));
  out_post_4[1] = std::max(0.05, std::min(prior_sig, std::sqrt(var)));
  out_post_4[2] = static_cast<double>(used);
  out_post_4[3] = std::exp(out_post_4[0]);
  return used;
}

/**
 * Kernel 3b: Multi-Month Rolling Deep-Space AGOM Tracker (MEO / HEO / GEO)
 * Regresses multi-month eccentricity vector evolution (ex, ey) = (e cos w, e sin w) after subtracting
 * analytical J2 + J3 + Sun/Moon third-body gravitational eccentricity precession onto box-wing modulated SRP!
 * Each input TLE row has 6 doubles: [d70, n_rev_day, e, inc_deg, raan_deg, argp_deg]
 */
TLEUP_EXPORT("tleup_track_rolling_agom")
int32_t tleup_track_rolling_agom(
    const double* tles_6,
    int32_t n_tles,
    int32_t block_code,
    double prior_ln_agom,
    double prior_sig,
    double* out_post_4) {
  using namespace tleup;
  if (!out_post_4) return -1;
  out_post_4[0] = prior_ln_agom;
  out_post_4[1] = prior_sig;
  out_post_4[2] = 0.0;
  out_post_4[3] = std::exp(prior_ln_agom);
  if (n_tles < 8 || !tles_6) return 0;

  // Build non-overlapping / strided multi-day clean pairs (span 5..22 days) across the 90-150d history
  double info_agom = 0.0;
  double rhs_agom = 0.0;
  int32_t used_pairs = 0;

  for (int32_t i = 0; i < n_tles - 1; ++i) {
    const double* ta = tles_6 + i * 6;
    // Find partner ~10-16 days ahead without any SMA/inclination maneuver jump in between
    int32_t j_best = -1;
    bool clean = true;
    for (int32_t j = i + 1; j < n_tles; ++j) {
      const double* tj = tles_6 + j * 6;
      const double* tp = tles_6 + (j - 1) * 6;
      if (std::fabs(tj[1] - tp[1]) / tp[1] > 1.5e-4 || std::fabs(tj[3] - tp[3]) > 0.015 || (tj[0] - tp[0]) > 8.0) {
        clean = false;
        break;
      }
      const double span = tj[0] - ta[0];
      if (span >= 9.0 && span <= 18.0) {
        j_best = j;
        break;
      }
    }
    if (!clean || j_best < 0) continue;
    const double* tb = tles_6 + j_best * 6;
    const double dt_days = tb[0] - ta[0];

    double nb_a = 0.0, a_km = 0.0;
    kozai_to_brouwer(0.5 * (ta[1] + tb[1]), 0.5 * (ta[2] + tb[2]), 0.5 * (ta[3] + tb[3]), nb_a, a_km);
    if (a_km < 9500.0) continue;

    const double ex_a = ta[2] * std::cos(ta[5] * kDeg2Rad), ey_a = ta[2] * std::sin(ta[5] * kDeg2Rad);
    const double ex_b = tb[2] * std::cos(tb[5] * kDeg2Rad), ey_b = tb[2] * std::sin(tb[5] * kDeg2Rad);

    // Integrate gravitational (J2 + J3 + 3rd-body) eccentricity evolution + unit-AGOM SRP sensitivity from ta[0] to tb[0]
    double ex_grav = ex_a, ey_grav = ey_a;
    double gx_srp = 0.0, gy_srp = 0.0;
    const int n_sub = std::max(6, static_cast<int>(std::ceil(dt_days)));
    const double h_d = dt_days / n_sub;
    const double n_rad_s = std::sqrt(kMuKm3S2 / (a_km * a_km * a_km));
    const double inc_rad = 0.5 * (ta[3] + tb[3]) * kDeg2Rad;
    const double ci = std::cos(inc_rad), si = std::sin(inc_rad);

    double draan = tb[4] - ta[4];
    if (draan > 180.0) draan -= 360.0;
    if (draan < -180.0) draan += 360.0;

    for (int s = 0; s < n_sub; ++s) {
      const double frac = (s + 0.5) / n_sub;
      const double d70 = ta[0] + (s + 0.5) * h_d;
      const double e_cur = std::hypot(ex_grav, ey_grav);
      const double eta2 = std::max(1e-4, 1.0 - e_cur * e_cur);
      const double eta = std::sqrt(eta2);
      const double p_km = a_km * eta2;

      // Secular J2 apsidal rotation + J3 eccentricity forcing
      const double w_dot_j2 = 0.75 * n_rad_s * kJ2 * (kReKm / p_km) * (kReKm / p_km) * (5.0 * ci * ci - 1.0) * 86400.0;
      const double j3_ecc_dot = -0.75 * n_rad_s * kJ3 * std::pow(kReKm / p_km, 3) * si * (1.0 - 1.25 * si * si) * eta * 86400.0;

      const double dtheta = w_dot_j2 * h_d;
      const double cd = std::cos(dtheta), sd = std::sin(dtheta);
      const double nx = ex_grav * cd - ey_grav * sd + j3_ecc_dot * h_d;
      const double ny = ex_grav * sd + ey_grav * cd;
      ex_grav = nx;
      ey_grav = ny;

      // Unit-AGOM sunlit SRP eccentricity rate in orbital plane (node_u, perp_u):
      // de_vec/dt = +(3/2) * (a_srp / (n * a)) * (h_u x u_sun_inplane) -> in (ex, ey) = (e cos w, e sin w):
      // dex/dt = -(3/2) * Fs * eta * sin(u_sun_arg), dey/dt = +(3/2) * Fs * eta * cos(u_sun_arg)
      // Wait: check exact sign against xp_theory.inc line 796 (srp_rates_sunlit_ap):
      // In xp_theory.inc: A = P . sun_u, B = Q . sun_u (where sun_u points Earth->Sun, SRP accel points -sun_u!).
      // With w = 0 (P = node_u, Q = perp_u): af = ex, ag = ey, sOw = 0, cOw = 1:
      // d[kAf]/dt = -3/2 * Fs * eta * B = -3/2 * Fs * eta * (perp_u . sun_u),
      // d[kAg]/dt = +3/2 * Fs * eta * A = +3/2 * Fs * eta * (node_u . sun_u)! EXACT!
      const double Om = (ta[4] + frac * draan) * kDeg2Rad;
      const Vec3 node_u = {std::cos(Om), std::sin(Om), 0.0};
      const Vec3 h_u = {si * std::sin(Om), -si * std::cos(Om), ci};
      const Vec3 perp_u = cross(h_u, node_u);

      Vec3 r_sun, r_moon;
      double d_sun = 0.0, d_moon = 0.0;
      sun_moon_gcrf_km(d70, r_sun, d_sun, r_moon, d_moon);
      const Vec3 u_sun = (1.0 / d_sun) * r_sun;
      const double sin_b = std::max(-1.0, std::min(1.0, dot(h_u, u_sun)));
      const double f_bw = boxwing_scale(block_code, std::fabs(std::asin(sin_b)));
      const double au_r = kAuKm / d_sun;
      const double Fs_unit_per_day = (1e-3 * kP0SrpNm2 * au_r * au_r * f_bw / (n_rad_s * a_km)) * 86400.0;

      // Rotate previous SRP accumulator by J2 apsidal rotation too
      const double gxn = gx_srp * cd - gy_srp * sd - 1.5 * Fs_unit_per_day * eta * dot(perp_u, u_sun) * h_d;
      const double gyn = gx_srp * sd + gy_srp * cd + 1.5 * Fs_unit_per_day * eta * dot(node_u, u_sun) * h_d;
      gx_srp = gxn;
      gy_srp = gyn;
    }

    const double g2 = gx_srp * gx_srp + gy_srp * gy_srp;
    if (g2 < 1e-12) continue;
    const double rx = ex_b - ex_grav;
    const double ry = ey_b - ey_grav;
    const double agom_est = (gx_srp * rx + gy_srp * ry) / g2;
    if (!(agom_est > 5e-4 && agom_est < 0.25)) continue;

    // TLE eccentricity noise ~ 8e-6 per component
    const double sig_e = 1.2e-5;
    const double w_pair = g2 / (sig_e * sig_e);
    info_agom += w_pair;
    rhs_agom += w_pair * agom_est;
    used_pairs++;
    i = std::max(i, j_best - 2); // advance to keep pairs nearly independent
  }

  if (used_pairs >= 2 && info_agom > 0.0) {
    const double agom_obs = rhs_agom / info_agom;
    const double sig_agom_obs = 1.0 / std::sqrt(info_agom);
    const double rel_sig_obs = std::max(0.10, sig_agom_obs / std::max(1e-4, agom_obs));
    const double w0 = 1.0 / (prior_sig * prior_sig);
    const double w1 = 1.0 / (rel_sig_obs * rel_sig_obs);
    const double post_ln = (w0 * prior_ln_agom + w1 * std::log(agom_obs)) / (w0 + w1);
    const double post_sig = std::max(0.08, 1.0 / std::sqrt(w0 + w1));
    out_post_4[0] = std::max(std::log(1e-5), std::min(std::log(2.0), post_ln));
    out_post_4[1] = post_sig;
    out_post_4[2] = static_cast<double>(used_pairs);
    out_post_4[3] = std::exp(out_post_4[0]);
  }
  return used_pairs;
}

/**
 * Compute 5-day forward horizon box-wing effective AGOM ratio:
 * mean_{t in [d70_ref .. d70_ref + horizon_days]} f_BW(|beta(t)|) / f_BW(|beta(d70_ref)|)
 */
TLEUP_EXPORT("tleup_boxwing_forecast_ratio")
double tleup_boxwing_forecast_ratio(
    double d70_ref,
    double horizon_days,
    double a_km,
    double e,
    double inc_deg,
    double raan_deg,
    int32_t block_code) {
  using namespace tleup;
  if (block_code <= 0 || horizon_days <= 0.0) return 1.0;
  const double ci = std::cos(inc_deg * kDeg2Rad), si = std::sin(inc_deg * kDeg2Rad);
  const double n_rad_s = std::sqrt(kMuKm3S2 / (a_km * a_km * a_km));
  const double p_km = a_km * std::max(1e-4, 1.0 - e * e);
  const double raan_dot = -1.5 * n_rad_s * kJ2 * (kReKm / p_km) * (kReKm / p_km) * ci * 86400.0;

  auto eval_f = [&](double d70) -> double {
    const double Om = raan_deg * kDeg2Rad + raan_dot * (d70 - d70_ref);
    const Vec3 h_u = {si * std::sin(Om), -si * std::cos(Om), ci};
    Vec3 rs, rm;
    double ds = 0.0, dm = 0.0;
    sun_moon_gcrf_km(d70, rs, ds, rm, dm);
    const double sb = std::max(-1.0, std::min(1.0, dot(h_u, (1.0 / ds) * rs)));
    return boxwing_scale(block_code, std::fabs(std::asin(sb)));
  };

  const double f0 = eval_f(d70_ref);
  if (!(f0 > 1e-6)) return 1.0;
  double sum = 0.0;
  for (int k = 0; k < 6; ++k) {
    sum += eval_f(d70_ref + ((k + 0.5) / 6.0) * horizon_days);
  }
  return (sum / 6.0) / f0;
}

/**
 * Kernel 4: De-Aliased (Short-Periodic + Box-Wing SRP + Solid-Earth k2 Tides) & Exact AR(1)+Nugget Cholesky GLS Solver
 * Inputs:
 *  - m: number of epochs, np: number of active solve-for parameters (<= 8)
 *  - d70[m]: epoch times (days since 1970-01-01 UTC, ascending)
 *  - tgt_rv_gcrf[6*m]: SGP4 own-epoch GCRF states [rx, ry, rz, vx, vy, vz]
 *  - sp_bias_rv_gcrf[6*m]: SGP4-to-AP instantaneous short-periodic differential [drx, dry, drz, dvx, dvy, dvz] (or null)
 *  - nom_rv_gcrf[6*m]: AP nominal GCRF states at current iteration
 *  - jac_rv_gcrf[np * 6 * m]: AP finite-difference Jacobian GCRF columns (parameter-major, then epoch k, 6 doubles)
 *  - sig_rtn[6*m]: marginal 1-sigma RTN [sigR, sigT, sigN, sigVR, sigVT, sigVN]
 *  - ar1_tau_days[6]: AR(1) correlation time constant per RTN channel (<= 0 means white / diagonal)
 *  - ar1_eta[6]: correlated variance share in [0, 0.96] per RTN channel
 *  - orb_params[8]: [d70_ref, a_km, e, inc_deg, raan_deg, agom_curr, huber_k, iter_idx]
 *  - flags_3[3]: [block_code, enable_tides, enable_boxwing]
 *  - prior_prec[np]: diagonal MAP prior precision 1/sigma_0^2
 *  - prior_diff[np]: (theta_active - theta_prior)
 * Outputs:
 *  - out_dx[np]
 *  - out_normal_inv[np * np]
 *  - out_postfit_uvw_pos[3 * m]
 *  - out_chi2_2[2]: [chi2_whitened, dof_count]
 */
TLEUP_EXPORT("tleup_dealias_and_solve_gls")
int32_t tleup_dealias_and_solve_gls(
    int32_t m,
    int32_t np,
    const double* d70,
    const double* tgt_rv_gcrf,
    const double* sp_bias_rv_gcrf,
    const double* nom_rv_gcrf,
    const double* jac_rv_gcrf,
    const double* sig_rtn,
    const double* ar1_tau_days,
    const double* ar1_eta,
    const double* orb_params,
    const int32_t* flags_3,
    const double* prior_prec,
    const double* prior_diff,
    double* out_dx,
    double* out_normal_inv,
    double* out_postfit_uvw_pos,
    double* out_chi2_2) {
  using namespace tleup;
  if (m <= 0 || np <= 0 || np > 8) return -1;

  const double d70_ref = orb_params[0];
  const double a_km = orb_params[1];
  const double e = orb_params[2];
  const double inc_deg = orb_params[3];
  const double raan_deg = orb_params[4];
  const double agom_curr = orb_params[5];
  const double huber_k = orb_params[6];
  const int32_t iter_idx = static_cast<int32_t>(orb_params[7]);

  const int32_t block_code = flags_3[0];
  const int32_t enable_tides = flags_3[1];
  const int32_t enable_boxwing = flags_3[2];

  // Channel-major residuals r_chan[6][m], Jacobians J_chan[6][m * np], and Huber-inflated sigmas eff_sig[6][m]
  std::vector<double> r_chan(6 * m, 0.0);
  std::vector<double> eff_sig(6 * m, 1.0);
  std::vector<double> J_chan(6 * m * np, 0.0);

  for (int32_t k = 0; k < m; ++k) {
    const double* trv = tgt_rv_gcrf + k * 6;
    const double* nrv = nom_rv_gcrf + k * 6;
    Vec3 r_tgt = {trv[0], trv[1], trv[2]};
    Vec3 v_tgt = {trv[3], trv[4], trv[5]};

    // 1. Apply analytical SGP4-to-AP short-periodic nodal/m-daily/3b de-biasing at t_k
    if (sp_bias_rv_gcrf) {
      const double* sp = sp_bias_rv_gcrf + k * 6;
      r_tgt = r_tgt + Vec3{sp[0], sp[1], sp[2]};
      v_tgt = v_tgt + Vec3{sp[3], sp[4], sp[5]};
    }

    // 2. Compute differential solid-Earth k2 tide + box-wing beta(t) SRP perturbation across [d70_ref -> d70[k]]
    // Since AP nominal flies without solid tides and with constant AGOM, the true trajectory has +dr_pert(t_k),
    // so the SGP4 target observation carries +dr_pert(t_k) relative to AP's unmodeled forces -> subtract dr_pert from target!
    Vec3 dr_pert{0, 0, 0}, dv_pert{0, 0, 0};
    if (enable_tides || enable_boxwing) {
      integrate_diff_perturbation_gcrf(
          d70_ref, d70[k], r_tgt, v_tgt, a_km, e, inc_deg, raan_deg,
          agom_curr, block_code, enable_tides, enable_boxwing, dr_pert, dv_pert);
    }
    const Vec3 r_obs = r_tgt - dr_pert;
    const Vec3 v_obs = v_tgt - dv_pert;

    const Vec3 err_r = Vec3{nrv[0], nrv[1], nrv[2]} - r_obs;
    const Vec3 err_v = Vec3{nrv[3], nrv[4], nrv[5]} - v_obs;

    double res_pos[3], res_vel[3];
    vec_to_uvw(r_tgt, v_tgt, err_r, res_pos);
    vec_to_uvw(r_tgt, v_tgt, err_v, res_vel);

    if (out_postfit_uvw_pos) {
      out_postfit_uvw_pos[k * 3 + 0] = res_pos[0];
      out_postfit_uvw_pos[k * 3 + 1] = res_pos[1];
      out_postfit_uvw_pos[k * 3 + 2] = res_pos[2];
    }

    const double* sk = sig_rtn + k * 6;
    const double z_pos = std::sqrt(
        (res_pos[0] / sk[0]) * (res_pos[0] / sk[0]) +
        (res_pos[1] / sk[1]) * (res_pos[1] / sk[1]) +
        (res_pos[2] / sk[2]) * (res_pos[2] / sk[2])) / std::sqrt(3.0);
    const double huber_w = (iter_idx >= 1 && m >= 3 && z_pos > huber_k) ? (huber_k / z_pos) : 1.0;

    r_chan[0 * m + k] = res_pos[0];
    r_chan[1 * m + k] = res_pos[1];
    r_chan[2 * m + k] = res_pos[2];
    r_chan[3 * m + k] = res_vel[0];
    r_chan[4 * m + k] = res_vel[1];
    r_chan[5 * m + k] = res_vel[2];

    for (int c = 0; c < 6; ++c) {
      eff_sig[c * m + k] = sk[c] / huber_w;
    }

    for (int a = 0; a < np; ++a) {
      const double* jrv = jac_rv_gcrf + (a * m + k) * 6;
      double jp[3], jv[3];
      vec_to_uvw(r_tgt, v_tgt, Vec3{jrv[0], jrv[1], jrv[2]}, jp);
      vec_to_uvw(r_tgt, v_tgt, Vec3{jrv[3], jrv[4], jrv[5]}, jv);
      J_chan[(0 * m + k) * np + a] = jp[0];
      J_chan[(1 * m + k) * np + a] = jp[1];
      J_chan[(2 * m + k) * np + a] = jp[2];
      J_chan[(3 * m + k) * np + a] = jv[0];
      J_chan[(4 * m + k) * np + a] = jv[1];
      J_chan[(5 * m + k) * np + a] = jv[2];
    }
  }

  // Accumulate exact AR(1)+nugget Cholesky-whitened normal equations across all 6 RTN channels
  std::vector<double> A(np * np, 0.0);
  std::vector<double> rhs(np, 0.0);
  double chi2_sum = 0.0;

  std::vector<double> C_mat(m * m, 0.0), L_mat(m * m, 0.0);
  std::vector<double> z_vec(m, 0.0), j_col(m, 0.0);
  std::vector<double> H_mat(np * m, 0.0); // column-major per parameter a

  for (int c = 0; c < 6; ++c) {
    const double tau = ar1_tau_days ? ar1_tau_days[c] : 0.0;
    const double eta = ar1_eta ? std::max(0.0, std::min(0.96, ar1_eta[c])) : 0.0;
    const double* rc = &r_chan[c * m];
    const double* sc = &eff_sig[c * m];
    const double* Jc = &J_chan[c * m * np];

    bool use_corr = (m >= 2 && tau > 1e-3 && eta > 1e-3);
    if (use_corr) {
      for (int i = 0; i < m; ++i) {
        for (int j = 0; j <= i; ++j) {
          const double corr = (i == j) ? 1.0 : eta * std::exp(-std::fabs(d70[i] - d70[j]) / tau);
          const double cov_ij = sc[i] * sc[j] * corr;
          C_mat[i * m + j] = C_mat[j * m + i] = cov_ij;
        }
      }
      if (!cholesky_factor(C_mat.data(), L_mat.data(), m)) {
        use_corr = false;
      }
    }

    if (use_corr) {
      cholesky_forward(L_mat.data(), rc, z_vec.data(), m);
      for (int a = 0; a < np; ++a) {
        for (int k = 0; k < m; ++k) j_col[k] = Jc[k * np + a];
        cholesky_forward(L_mat.data(), j_col.data(), &H_mat[a * m], m);
      }
    } else {
      for (int k = 0; k < m; ++k) {
        const double inv_s = 1.0 / sc[k];
        z_vec[k] = rc[k] * inv_s;
        for (int a = 0; a < np; ++a) H_mat[a * m + k] = Jc[k * np + a] * inv_s;
      }
    }

    for (int k = 0; k < m; ++k) chi2_sum += z_vec[k] * z_vec[k];

    for (int a = 0; a < np; ++a) {
      const double* Ha = &H_mat[a * m];
      double g = 0.0;
      for (int k = 0; k < m; ++k) g -= Ha[k] * z_vec[k];
      rhs[a] += g;
      for (int b = 0; b <= a; ++b) {
        const double* Hb = &H_mat[b * m];
        double h = 0.0;
        for (int k = 0; k < m; ++k) h += Ha[k] * Hb[k];
        A[a * np + b] += h;
      }
    }
  }

  for (int a = 0; a < np; ++a) {
    for (int b = 0; b < a; ++b) A[b * np + a] = A[a * np + b];
    const double wp = prior_prec ? prior_prec[a] : 1e-8;
    const double df = prior_diff ? prior_diff[a] : 0.0;
    A[a * np + a] += wp;
    rhs[a] -= df * wp;
  }

  if (!solve_spd_and_invert(A.data(), rhs.data(), np, out_dx, out_normal_inv)) {
    return -2;
  }

  if (out_chi2_2) {
    out_chi2_2[0] = chi2_sum;
    out_chi2_2[1] = static_cast<double>(6 * m);
  }
  return 0;
}

#ifdef __wasm__
#pragma clang attribute pop
#endif
`;

await fs.mkdir(OUT_DIR, { recursive: true });
console.log("Compiling wasm/tle-astrodynamics-upgrades.wasm (wasm32-wasip1-threads, C++17 + SIMD128)...");

const compilation = await compileModuleFromSource({
  manifest,
  sourceCode: cppSource,
  language: "c++",
  outputPath: OUT_WASM,
  threadModel: "wasi-sequential",
});

if (!compilation.report?.ok) {
  const issues = (compilation.report?.issues ?? []).map((i) =>
    [i.severity, i.code, i.message].filter(Boolean).join(" ")
  );
  throw new Error(`tle-astrodynamics-upgrades compile failed:\n${issues.join("\n")}`);
}

const sha = crypto.createHash("sha256").update(compilation.wasmBytes).digest("hex");
console.log(
  `Built ${OUT_WASM} (${compilation.wasmBytes.length} bytes, sha256=${sha.slice(0, 16)}...)`
);
