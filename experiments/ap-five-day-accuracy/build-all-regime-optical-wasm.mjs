import fs from "node:fs/promises";
import fsSync from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MODULES_ROOT =
  process.env.SDN_MODULES_ROOT || new URL("../../../../repos/main-packages/space-data-network-modules", import.meta.url).pathname;
const OA_ROOT = path.join(MODULES_ROOT, "analysis/optical-astrometry");
const OUT_DIR =
  new URL("./wasm", import.meta.url).pathname;
const OUT_WASM = path.join(OUT_DIR, "optical-astrometry-all-regimes.wasm");

const { compileModuleFromSource } = await import(
  pathToFileURL(path.join(OA_ROOT, "node_modules/space-data-module-sdk/dist/compiler/index.js")).href
).catch(() => import("space-data-module-sdk/compiler"));

const { generateSdsHeaders } = await import(pathToFileURL(path.join(OA_ROOT, "sds-headers.mjs")).href);
const { composeErfaTranslationUnit } = await import(
  pathToFileURL(path.join(MODULES_ROOT, "foundation/frames/erfa-amalgamation.mjs")).href
);

function replaceExact(src, label, target, replacement) {
  if (!src.includes(target)) {
    throw new Error(`Patch target '${label}' not found`);
  }
  return src.replace(target, replacement);
}

const framesSrc = path.join(MODULES_ROOT, "foundation/frames/src");
const lambert = path.join(MODULES_ROOT, "analysis/lambert-izzo/include/lambert_izzo/solver.hpp");
const { header, version } = await generateSdsHeaders(
  ["FIL", "SKT", "STR", "OMM", "OEM", "EOP", "ERM", "PRW", "SKQ", "TDM", "EOO", "SKI", "OCM"],
  pathToFileURL(path.join(OA_ROOT, "build.mjs")).href
);
const erfa = await composeErfaTranslationUnit();
const bodyModels = await fs.readFile(path.join(framesSrc, "iau_body_models.hpp"), "utf8");
const axisEngine = (await fs.readFile(path.join(framesSrc, "axis_engine.hpp"), "utf8"))
  .replace('#include "iau_body_models.hpp"', "")
  .replace(
    /extern "C" \{\n#include "erfa\.h"\n#include "erfam\.h"\n\}\n/,
    "// ERFA is amalgamated ahead of this header by build.mjs.\n"
  );
const eopSeries = (await fs.readFile(path.join(framesSrc, "eop_series.hpp"), "utf8")).replace("#pragma once", "");

const before = ["base", "image", "overlay", "detect", "catalog", "wcs", "solve", "ephem", "locate", "calibrate"];
const after = ["od", "reduce", "records", "module"];
const read = (names) => Promise.all(names.map((n) => fs.readFile(path.join(OA_ROOT, "src", `${n}.cpp`), "utf8")));
const [own0, own1, solver] = await Promise.all([read(before), read(after), fs.readFile(lambert, "utf8")]);

// Patch od.cpp in memory for fast all-regime (LEO + MEO + HEO + GEO) angles-only IOD
let odSrc = own1[0];

// 1. Altitude-scaled RK4 step: bit-identical <= 11,000 km (all LEO), 45 s in lower MEO, 120 s above 20,000 km
odSrc = replaceExact(
  odSrc,
  "j2_rk4-step",
  `inline void j2_rk4(V3* r, V3* v, double dt) {
  const int steps = std::max(1, static_cast<int>(std::ceil(std::fabs(dt) / 10.0)));`,
  `inline void j2_rk4(V3* r, V3* v, double dt) {
  const double rn0 = norm(*r);
  const double max_step = rn0 > 20000.0 ? 120.0 : (rn0 > 11000.0 ? 45.0 : 10.0);
  const int steps = std::max(1, static_cast<int>(std::ceil(std::fabs(dt) / max_step)));`
);

// 2. Extend gooding_iod radius scan from LEO up to 55,000 km (MEO, HEO, GEO + asymmetric HEO starts)
odSrc = replaceExact(
  odSrc,
  "gooding_iod-starts",
  `  std::sort(starts.begin(), starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
  if (starts.size() > static_cast<size_t>(kIodStarts)) starts.resize(kIodStarts);`,
  `  std::sort(starts.begin(), starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
  if (starts.size() > static_cast<size_t>(kIodStarts)) starts.resize(kIodStarts);
  std::vector<Start> high_starts;
  for (double radius = kIodRadiusMax * 1.008; radius <= 55000.0; radius *= 1.008) {
    const double period = 2 * kPi * std::sqrt(radius * radius * radius / kMuEarth);
    const int rev0 = multi_pass ? static_cast<int>(std::floor(t13 / period)) : 0;
    const int rlo = multi_pass ? std::max(0, rev0 - 1) : 0, rhi = multi_pass ? rev0 + 1 : 0;
    const double r1 = range_to(s[0], radius), r3 = range_to(s[2], radius);
    if (!std::isfinite(r1) || !std::isfinite(r3)) continue;
    for (int rev = rlo; rev <= rhi; ++rev) {
      for (int branch = 0; branch < (rev > 0 ? 2 : 1); ++branch) {
        double f[2];
        V3 p2, v2;
        if (miss(r1, r3, rev, branch, f, &p2, &v2)) high_starts.push_back({std::hypot(f[0], f[1]), r1, r3, rev, branch});
      }
    }
  }
  std::sort(high_starts.begin(), high_starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
  if (high_starts.size() > 8) high_starts.resize(8);
  std::vector<Start> asym_starts;
  for (double rad1 = 7200.0; rad1 <= 46000.0; rad1 *= 1.18) {
    const double r1 = range_to(s[0], rad1);
    if (!std::isfinite(r1)) continue;
    for (double rad3 = 7200.0; rad3 <= 46000.0; rad3 *= 1.18) {
      if (std::fabs(rad1 - rad3) < 0.08 * rad1) continue;
      const double r3 = range_to(s[2], rad3);
      if (!std::isfinite(r3)) continue;
      const double rmean = 0.5 * (rad1 + rad3);
      const double period = 2 * kPi * std::sqrt(rmean * rmean * rmean / kMuEarth);
      const int rev0 = multi_pass ? static_cast<int>(std::floor(t13 / period)) : 0;
      for (int branch = 0; branch < (rev0 > 0 ? 2 : 1); ++branch) {
        double f[2];
        V3 p2, v2;
        if (miss(r1, r3, rev0, branch, f, &p2, &v2)) asym_starts.push_back({std::hypot(f[0], f[1]), r1, r3, rev0, branch});
      }
    }
  }
  std::sort(asym_starts.begin(), asym_starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
  if (asym_starts.size() > 6) asym_starts.resize(6);
  starts.insert(starts.end(), high_starts.begin(), high_starts.end());
  starts.insert(starts.end(), asym_starts.begin(), asym_starts.end());`
);

// 3. Extend far_sight_iod:
//    a) Test LEO circular starts + MEO/GEO phase-adaptive circular starts FIRST
//    b) ONLY if no bound orbit converged (e.g. eccentric Molniya / GTO HEO with large radial velocity!), run fast bounded vis-viva HEO scan
odSrc = replaceExact(
  odSrc,
  "far_sight_iod-full-tail",
  `  std::sort(starts.begin(), starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
  if (starts.size() > static_cast<size_t>(kFarStarts)) starts.resize(kFarStarts);
  for (const Start& start : starts) {
    double r0 = start.r0, r1 = start.r1, f[2], last_step = INFINITY;
    bool ok = false;
    int it = 0;
    V3 pf, vf;
    for (; it < kIterations; ++it) {
      if (!miss(r0, r1, f, &pf, &vf)) break;
      attained = std::min(attained, std::hypot(f[0], f[1]));
      if (std::hypot(f[0], f[1]) < kIodMissRad) { ok = true; break; }
      const double h0 = 1e-6 * r0, h1 = 1e-6 * r1;
      double f0[2], f1[2];
      V3 tp, tv;
      if (!miss(r0 + h0, r1, f0, &tp, &tv) || !miss(r0, r1 + h1, f1, &tp, &tv)) break;
      double J[2][2];
      for (int k = 0; k < 2; ++k) { J[k][0] = (f0[k] - f[k]) / h0; J[k][1] = (f1[k] - f[k]) / h1; }
      const double det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      if (std::fabs(det) < 1e-30) break;
      const double d0 = (J[1][1] * f[0] - J[0][1] * f[1]) / det, d1 = (-J[1][0] * f[0] + J[0][0] * f[1]) / det;
      const double scale = std::max(1.0, std::max(std::fabs(d0), std::fabs(d1)) / kFarStepKm);
      r0 -= d0 / scale;
      r1 -= d1 / scale;
      if (r0 <= 0 || r1 <= 0) break;
      const double step = (std::fabs(d0) + std::fabs(d1)) / scale;
      if (step < kStepKm && step > 0.5 * last_step) {
        ok = miss(r0, r1, f, &pf, &vf);
        if (ok) attained = std::min(attained, std::hypot(f[0], f[1]));
        break;
      }
      last_step = step;
    }
    if (!ok) continue;
    ++converged;
    const double rf = norm(pf - far.site_km);
    bool dup = false;
    for (double x : found) dup = dup || std::fabs(x - rf) < 1.0;
    if (!dup) found.push_back(rf);
    const double rn = norm(pf), energy = 0.5 * dot(vf, vf) - kMuEarth / rn;
    if (energy >= 0) { ++unbound; continue; }
    const V3 ev = (pf * (dot(vf, vf) - kMuEarth / rn) - vf * dot(pf, vf)) * (1.0 / kMuEarth);
    const double ecc = norm(ev), sma = -kMuEarth / (2 * energy);
    if (sma * (1 - ecc) <= kReEarth) { ++subsurface; continue; }
    if (!best.ok || ecc < best.eccentricity) {
      best.ok = true;
      best.t = far.t;
      best.r = pf;
      best.v = vf;
      best.rho[0] = r0;
      best.rho[1] = rf;
      best.rho[2] = r1;
      best.miss_arcsec = std::hypot(f[0], f[1]) / kArcsec;
      best.iterations = it;
      best.revolutions = static_cast<int>(std::floor(std::fabs(tf) / (2 * kPi * std::sqrt(sma * sma * sma / kMuEarth))));
      best.eccentricity = ecc;
    }
  }`,
  `  std::sort(starts.begin(), starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
  if (starts.size() > 40) starts.resize(40);

  // High-altitude circular MEO/GEO scan (10,380 km .. 55,000 km), ~280 lightweight evaluations
  std::vector<Start> high_scan;
  for (double radius = kRadiusMax + 5.0; radius <= 55000.0; ) {
    const double r0 = range_to(a0, radius), r1 = range_to(a1, radius);
    double f[2];
    V3 pf, vf;
    high_scan.push_back({std::isfinite(r0) && std::isfinite(r1) && miss(r0, r1, f, &pf, &vf) ? std::hypot(f[0], f[1]) : INFINITY, r0, r1});
    const double dphi_dr = 1.5 * std::sqrt(kMuEarth) * std::pow(radius, -2.5) * std::clamp(std::fabs(tf), 3600.0, 5.0 * 86400.0);
    radius += std::clamp(0.30 / std::max(dphi_dr, 1e-12), 10.0, 180.0);
  }
  std::vector<Start> high_starts;
  for (size_t k = 0; k < high_scan.size(); ++k) {
    const bool left = k == 0 || high_scan[k].miss < high_scan[k - 1].miss;
    const bool right = k + 1 == high_scan.size() || high_scan[k].miss <= high_scan[k + 1].miss;
    if (std::isfinite(high_scan[k].miss) && left && right) high_starts.push_back(high_scan[k]);
  }
  std::sort(high_starts.begin(), high_starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
  if (high_starts.size() > 18) high_starts.resize(18);
  starts.insert(starts.end(), high_starts.begin(), high_starts.end());

  auto iterate_pool = [&](const std::vector<Start>& pool) {
    constexpr int kMaxIterAll = 110;
    for (const Start& start : pool) {
      double r0 = start.r0, r1 = start.r1, f[2], last_step = INFINITY;
      bool ok = false;
      int it = 0;
      V3 pf, vf;
      for (; it < kMaxIterAll; ++it) {
        if (!miss(r0, r1, f, &pf, &vf)) break;
        attained = std::min(attained, std::hypot(f[0], f[1]));
        if (std::hypot(f[0], f[1]) < kIodMissRad) { ok = true; break; }
        const double h0 = 1e-6 * r0, h1 = 1e-6 * r1;
        double f0[2], f1[2];
        V3 tp, tv;
        if (!miss(r0 + h0, r1, f0, &tp, &tv) || !miss(r0, r1 + h1, f1, &tp, &tv)) break;
        double J[2][2];
        for (int k = 0; k < 2; ++k) { J[k][0] = (f0[k] - f[k]) / h0; J[k][1] = (f1[k] - f[k]) / h1; }
        const double det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
        if (std::fabs(det) < 1e-30) break;
        const double d0 = (J[1][1] * f[0] - J[0][1] * f[1]) / det, d1 = (-J[1][0] * f[0] + J[0][0] * f[1]) / det;
        const double min_r = std::min(r0, r1);
        const double step_cap = min_r < 2500.0 ? kFarStepKm : std::max(kFarStepKm, 0.03 * min_r);
        const double scale = std::max(1.0, std::max(std::fabs(d0), std::fabs(d1)) / step_cap);
        r0 -= d0 / scale;
        r1 -= d1 / scale;
        if (r0 <= 0 || r1 <= 0) break;
        const double step = (std::fabs(d0) + std::fabs(d1)) / scale;
        if (step < kStepKm && step > 0.5 * last_step) {
          ok = miss(r0, r1, f, &pf, &vf);
          if (ok) attained = std::min(attained, std::hypot(f[0], f[1]));
          break;
        }
        last_step = step;
      }
      if (!ok) continue;
      ++converged;
      const double rf = norm(pf - far.site_km);
      bool dup = false;
      for (double x : found) dup = dup || std::fabs(x - rf) < 1.0;
      if (!dup) found.push_back(rf);
      const double rn = norm(pf), energy = 0.5 * dot(vf, vf) - kMuEarth / rn;
      if (energy >= 0) { ++unbound; continue; }
      const V3 ev = (pf * (dot(vf, vf) - kMuEarth / rn) - vf * dot(pf, vf)) * (1.0 / kMuEarth);
      const double ecc = norm(ev), sma = -kMuEarth / (2 * energy);
      if (sma * (1 - ecc) <= kReEarth) { ++subsurface; continue; }
      if (!best.ok || ecc < best.eccentricity) {
        best.ok = true;
        best.t = far.t;
        best.r = pf;
        best.v = vf;
        best.rho[0] = r0;
        best.rho[1] = rf;
        best.rho[2] = r1;
        best.miss_arcsec = std::hypot(f[0], f[1]) / kArcsec;
        best.iterations = it;
        best.revolutions = static_cast<int>(std::floor(std::fabs(tf) / (2 * kPi * std::sqrt(sma * sma * sma / kMuEarth))));
        best.eccentricity = ecc;
      }
    }
  };

  iterate_pool(starts);

  // Lazy vis-viva eccentric HEO scan: invoked ONLY when circular starts did not find a clean low-eccentricity orbit
  if ((!best.ok || best.eccentricity > 0.65) && t01 > 0.5 && std::fabs(tf) <= 8.0 * 86400.0) {
    std::vector<Start> ecc_starts;
    const double tf_clamped = std::clamp(std::fabs(tf), 14400.0, 3.5 * 86400.0);
    const double freq_min = 1.0 / (48.0 * 3600.0);
    const double freq_max = 1.0 / (1.8 * 3600.0);
    const double dfreq = 0.26 / tf_clamped;
    for (double radius = 6750.0; radius <= 46000.0; radius *= 1.04) {
      const double r0 = range_to(a0, radius), r1_base = range_to(a1, radius);
      if (!std::isfinite(r0) || !std::isfinite(r1_base)) continue;
      const V3 p0 = a0.site_km + a0.los * r0, p1_base = a1.site_km + a1.los * r1_base;
      const double p0n = norm(p0);
      const V3 v_base = (p1_base - p0) * (1.0 / t01) - gravity(p0) * (0.5 * t01);
      const double proj = dot(v_base, a1.los);
      const double v_perp2 = std::max(0.0, dot(v_base, v_base) - proj * proj);
      for (double sgn : {-1.0, 1.0}) {
        std::vector<Start> branch_scan;
        for (double freq = freq_min; freq <= freq_max; freq += dfreq) {
          const double n_rad = 2.0 * kPi * freq;
          const double sma = std::cbrt(kMuEarth / (n_rad * n_rad));
          const double v_targ2 = kMuEarth * (2.0 / p0n - 1.0 / sma);
          if (v_targ2 <= v_perp2 + 1e-6) continue;
          const double u = -proj + sgn * std::sqrt(v_targ2 - v_perp2);
          const double r1_try = r1_base + u * t01;
          if (r1_try <= 150.0) continue;
          const V3 v_est = v_base + a1.los * u;
          const V3 ev = (p0 * (v_targ2 - kMuEarth / p0n) - v_est * dot(p0, v_est)) * (1.0 / kMuEarth);
          const double ecc = norm(ev);
          if (ecc >= 0.88 || sma * (1.0 - ecc) <= kReEarth + 100.0) continue;
          double f[2];
          V3 pf, vf;
          const double mval = miss(r0, r1_try, f, &pf, &vf) ? std::hypot(f[0], f[1]) : INFINITY;
          branch_scan.push_back({mval, r0, r1_try});
        }
        for (size_t k = 0; k < branch_scan.size(); ++k) {
          const bool left = k == 0 || branch_scan[k].miss < branch_scan[k - 1].miss;
          const bool right = k + 1 == branch_scan.size() || branch_scan[k].miss <= branch_scan[k + 1].miss;
          if (branch_scan[k].miss < 0.35 && left && right) ecc_starts.push_back(branch_scan[k]);
        }
      }
    }
    std::sort(ecc_starts.begin(), ecc_starts.end(), [](const Start& a, const Start& b) { return a.miss < b.miss; });
    if (ecc_starts.size() > 24) ecc_starts.resize(24);
    iterate_pool(ecc_starts);
  }`
);

// 4. Allow up to 24 Gauss-Newton iterations in refine_orbit
odSrc = replaceExact(
  odSrc,
  "refine_orbit-iters",
  `  constexpr int kRefineIterations = 12;`,
  `  constexpr int kRefineIterations = 24;`
);

own1[0] = odSrc;

// Patch module.cpp:
//  - allow crossingObservations >= 2
//  - when far == true (no single night has 2 crossings), pick the consecutive night pair with the SMALLEST time gap!
//  - when !far fails IOD, fall back to the smallest-gap consecutive night pair!
let modSrc = own1[3];

modSrc = replaceExact(
  modSrc,
  "module-crossingObservations",
  `else if (key == "crossingObservations" && number && value >= 3 && value == std::floor(value)) crossing_sights = static_cast<int>(value);`,
  `else if (key == "crossingObservations" && number && value >= 2 && value == std::floor(value)) crossing_sights = static_cast<int>(value);`
);

modSrc = replaceExact(
  modSrc,
  "module-night-pair-selection",
  `  // The first night with two counting crossings, else the first two crossings (one on each of two nights: far).
  size_t c0 = 0, c1 = 1;
  bool far = true;
  for (size_t k = 0; k + 1 < crossings.size(); ++k)
    if (crossings[k].night == crossings[k + 1].night) {
      c0 = k;
      c1 = k + 1;
      far = false;
      while (c1 + 1 < crossings.size() && crossings[c1 + 1].night == crossings[k].night) ++c1;
      break;
    }`,
  `  // The first night with two counting crossings, else the consecutive-night crossing pair with the smallest time gap (far).
  size_t c0 = 0, c1 = 1;
  bool far = true;
  for (size_t k = 0; k + 1 < crossings.size(); ++k)
    if (crossings[k].night == crossings[k + 1].night) {
      c0 = k;
      c1 = k + 1;
      far = false;
      while (c1 + 1 < crossings.size() && crossings[c1 + 1].night == crossings[k].night) ++c1;
      break;
    }
  if (far) {
    double best_gap = INFINITY;
    for (size_t k = 0; k + 1 < crossings.size(); ++k) {
      if (crossings[k].night == crossings[k + 1].night) continue;
      const double g = sights[crossings[k + 1].kept.front()].t - sights[crossings[k].kept.back()].t;
      if (g < best_gap) { best_gap = g; c0 = k; c1 = k + 1; }
    }
  }`
);

modSrc = replaceExact(
  modSrc,
  "module-far-fallback",
  `  IodResult iod = far ? far_sight_iod(s3[0], s3[1], s3[2]) : gooding_iod(s3, multi_pass);
  if (!iod.ok)
    return initial_orbit_fail("no-initial-orbit", std::string(far ? "The far-sight iteration" : "Gooding's iteration") + " over " + std::to_string(c1 - c0 + 1) + " crossings: " + iod.error);`,
  `  IodResult iod = far ? far_sight_iod(s3[0], s3[1], s3[2]) : gooding_iod(s3, multi_pass);
  if (!iod.ok && !far && crossings.back().night > crossings.front().night) {
    // Fall back from degenerate intra-night Gooding geometry to smallest-gap cross-night far_sight_iod
    const auto cspan = [&](size_t c) { return sights[crossings[c].kept.back()].t - sights[crossings[c].kept.front()].t; };
    double best_gap = INFINITY;
    size_t best_a = 0, best_b = 1;
    for (size_t k = 0; k + 1 < crossings.size(); ++k) {
      if (crossings[k].night == crossings[k + 1].night) continue;
      size_t la = k, lb = k + 1;
      for (size_t j = 0; j < crossings.size(); ++j) {
        if (crossings[j].night == crossings[k].night && cspan(j) > cspan(la)) la = j;
        if (crossings[j].night == crossings[k + 1].night && cspan(j) > cspan(lb)) lb = j;
      }
      const double g = sights[crossings[lb].kept.front()].t - sights[crossings[la].kept.back()].t;
      if (g < best_gap) { best_gap = g; best_a = la; best_b = lb; }
    }
    c0 = std::min(best_a, best_b);
    c1 = std::max(best_a, best_b);
    far = true;
    const size_t a = cspan(best_b) > cspan(best_a) ? best_b : best_a, b = a == best_a ? best_b : best_a;
    const std::vector<size_t>& kb = crossings[b].kept;
    pick[0] = {sights[crossings[a].kept.front()].t, a};
    pick[1] = {sights[crossings[a].kept.back()].t, a};
    pick[2] = {sights[kb[kb.size() / 2]].t, b};
    for (int q = 0; q < 3; ++q) {
      const Crossing& c = crossings[pick[q].second];
      const Sight& o = sights[c.kept.front()];
      ax::Epoch e;
      ax::EarthOrientation eo;
      if (!clock.at(pick[q].first, &e, &eo, &err)) return initial_orbit_fail("invalid-angles", err);
      double xyz[3] = {o.itrs.x, o.itrs.y, o.itrs.z};
      Site site;
      if (eraGc2gd(1, xyz, &site.lon, &site.lat, &site.h) != 0) return initial_orbit_fail("invalid-angles", "the site does not convert to geodetic");
      V3 sr, sv;
      site_gcrs(site, e, eo, &sr, &sv);
      s3[q].t = pick[q].first;
      s3[q].los = c.at(pick[q].first);
      s3[q].site_km = sr * 1e-3;
    }
    iod = far_sight_iod(s3[0], s3[1], s3[2]);
  }
  if (!iod.ok)
    return initial_orbit_fail("no-initial-orbit", std::string(far ? "The far-sight iteration" : "Gooding's iteration") + " over " + std::to_string(c1 - c0 + 1) + " crossings: " + iod.error);`
);

own1[3] = modSrc;

const manifest = JSON.parse(await fs.readFile(path.join(OA_ROOT, "plugin-manifest.json"), "utf8"));
await fs.mkdir(OUT_DIR, { recursive: true });

console.log("Compiling fast all-regime optical-astrometry WASM into scratch...");
const result = await compileModuleFromSource({
  manifest,
  sourceCode: [
    '#include "space_data_module_invoke.h"',
    '#include "typedHostcall.hpp"',
    '#include "FlowNotice_generated.h"',
    header,
    erfa.source,
    bodyModels,
    axisEngine,
    eopSeries,
    ...own0,
    solver.replace("#pragma once", ""),
    ...own1,
  ].join("\n\n"),
  language: "c++",
  outputPath: OUT_WASM,
  threadModel: "wasi-sequential",
  allowUndefinedImports: true,
});

if (!result.report?.ok) {
  throw new Error(JSON.stringify(result.report?.issues, null, 2));
}
const wasm = fsSync.readFileSync(OUT_WASM);
const sha = crypto.createHash("sha256").update(wasm).digest("hex");
console.log(`Built ${OUT_WASM} (${wasm.length} bytes, sha256=${sha.slice(0, 16)}...) against SDS@${version}`);
