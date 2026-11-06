// Amendment 10.2: a re-grid on a fixed schedule (every k hours from the epoch, blended over the last fifth of each interval) against
// the grid built at each step's exact elements (the closed form, equal to the full-field quadrature to 3e-10), with e drifting
// linearly (de per week). Both read by the module's wide_six; positions by the Kepler partials of the step's elements.
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <memory>
#include <string>
#include <utility>
#include <vector>
#include "constants.inc"
#include "sgp4_core.inc"
#include "model.inc"
#include "fastmath.inc"
#include "drag.inc"
#include "atmosphere.inc"
#include "xp_theory.inc"
using namespace sdnap;
using namespace sdnap::xpt;

static void kep_pos(double a, double e, double i, double node, double argp, double M, double* r) {
  double E = M;
  for (int it = 0; it < 60; ++it) { const double d = (E - e * std::sin(E) - M) / (1 - e * std::cos(E)); E -= d; if (std::fabs(d) < 1e-15) break; }
  const double eta = std::sqrt(1 - e * e), x = a * (std::cos(E) - e), y = a * eta * std::sin(E);
  const double cw = std::cos(argp), sw = std::sin(argp), cO = std::cos(node), sO = std::sin(node), cI = std::cos(i), sI = std::sin(i);
  const double px = cw * x - sw * y, py = sw * x + cw * y;
  r[0] = cO * px - sO * cI * py; r[1] = sO * px + cO * cI * py; r[2] = sI * py;
}
static void six_to_pos(const Kepler& k, double n, const double* six, double* dr) {
  const double da = -2.0 / 3.0 * k.a * six[0] / n, de = six[1], di = six[2];
  const double dvarpi = six[3] / k.e, dO = six[4] / std::sin(k.i), dl = six[5];
  const double d[6] = {da, de, di, dO, dvarpi - dO, dl - dvarpi};
  const double base[6] = {k.a, k.e, k.i, k.node, k.argp, k.m};
  for (int c = 0; c < 3; ++c) dr[c] = 0;
  for (int q = 0; q < 6; ++q) {
    const double h = 1e-7 * (q == 0 ? k.a : 1.0);
    double p[6], mm[6], rp[3], rm[3];
    std::memcpy(p, base, sizeof p); std::memcpy(mm, base, sizeof mm);
    p[q] += h; mm[q] -= h;
    kep_pos(p[0], p[1], p[2], p[3], p[4], p[5], rp);
    kep_pos(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5], rm);
    for (int c = 0; c < 3; ++c) dr[c] += (rp[c] - rm[c]) / (2 * h) * d[q] * kRe * 1000.0;
  }
}

int main(int argc, char** argv) {
  const double n0 = std::atof(argv[1]) * kTwoPi / kMinutesPerDay, e0 = std::atof(argv[2]), i0 = std::atof(argv[3]) * kDeg;
  const double O0 = std::atof(argv[4]) * kDeg, w0 = std::atof(argv[5]) * kDeg, M0 = std::atof(argv[6]) * kDeg, d50 = std::atof(argv[7]);
  const double dePerWeek = std::atof(argv[8]);
  const int stride = argc > 9 ? std::atoi(argv[9]) : 1;  // reference every stride-th step
  const int cls = res::band_of(n0), degree = 12;
  const double a0 = std::pow(kKe / n0, kX2o3), eta = std::sqrt(1 - e0 * e0), p0 = a0 * eta * eta, c0 = std::cos(i0), j2 = 1.5 * kJ2 / (p0 * p0);
  const double mdot = n0 + 0.5 * j2 * n0 * eta * (3 * c0 * c0 - 1), wdot = 0.5 * j2 * n0 * (5 * c0 * c0 - 1), node_rate = -j2 * n0 * c0;
  const double theta_g0 = gsto_afspc(d50), rate = dePerWeek / (7.0 * 1440.0);
  const int steps = 7 * 288 + 1;
  auto kep_at = [&](double t) { return Kepler{a0, e0 + rate * t, i0, wrap(O0 + node_rate * t), wrap(w0 + wdot * t), wrap(M0 + mdot * t)}; };
  // the reference: a grid built at each sampled step's exact elements
  std::vector<int> idx;
  for (int s = 0; s < steps; s += stride) idx.push_back(s);
  std::vector<double> ref(3 * idx.size());
  for (size_t q = 0; q < idx.size(); ++q) {
    const double t = 5.0 * idx[q];
    const Kepler k = kep_at(t);
    tess::WideGrid g{};
    tess::wide_grid_build(degree, cls, n0, k.e, k.i, g);
    double six[6] = {0, 0, 0, 0, 0, 0};
    tess::wide_six(g, t, k, theta_g0, six);
    six_to_pos(k, n0, six, &ref[3 * q]);
    tess::wide_grid_release(g);
  }
  std::printf("{\"dePerWeek\":%g,\"stride\":%d,\"rows\":[", dePerWeek, stride);
  const int ks[5] = {0, 6, 12, 24, 48};  // 0: one grid at the epoch (no re-grid)
  for (int ki = 0; ki < 5; ++ki) {
    const double K = ks[ki] * 60.0;  // minutes
    const int nodes = ks[ki] == 0 ? 1 : static_cast<int>(std::ceil(7.0 * 1440.0 / K)) + 2;
    std::vector<tess::WideGrid> grids(nodes);
    for (int j = 0; j < nodes; ++j) { const Kepler k = kep_at(j * K); grids[j] = tess::WideGrid{}; tess::wide_grid_build(degree, cls, n0, k.e, k.i, grids[j]); }
    std::vector<double> tr(3 * idx.size()), full(3 * steps);
    for (int s = 0; s < steps; ++s) {
      const double t = 5.0 * s;
      const Kepler k = kep_at(t);
      double six[6] = {0, 0, 0, 0, 0, 0};
      if (ks[ki] == 0) tess::wide_six(grids[0], t, k, theta_g0, six);
      else {
        const int j = static_cast<int>(std::floor(t / K));
        const double u = t / K - j, sb = u < 0.8 ? 0.0 : (u - 0.8) / 0.2;  // blend over the last fifth
        double s0[6] = {0, 0, 0, 0, 0, 0}, s1[6] = {0, 0, 0, 0, 0, 0};
        tess::wide_six(grids[j], t, k, theta_g0, s0);
        if (sb > 0.0) tess::wide_six(grids[j + 1], t, k, theta_g0, s1);
        for (int z = 0; z < 6; ++z) six[z] = (1.0 - sb) * s0[z] + sb * s1[z];
      }
      six_to_pos(k, n0, six, &full[3 * s]);
    }
    double s2 = 0, mx = 0;
    for (size_t q = 0; q < idx.size(); ++q) {
      double d = 0; for (int c = 0; c < 3; ++c) d += std::pow(full[3 * idx[q] + c] - ref[3 * q + c], 2);
      s2 += d; mx = std::max(mx, std::sqrt(d));
    }
    // roughness of the scheduled track's departure from a smooth one: median |second difference| of the scheduled minus the
    // one-grid track (both continuous in t), and of the scheduled track alone
    std::vector<double> d2;
    for (int s = 1; s + 1 < steps; ++s) { double v = 0; for (int c = 0; c < 3; ++c) { const double dd = full[3 * (s + 1) + c] - 2 * full[3 * s + c] + full[3 * (s - 1) + c]; v += dd * dd; } d2.push_back(std::sqrt(v)); }
    std::nth_element(d2.begin(), d2.begin() + d2.size() / 2, d2.end());
    // the largest step across a boundary: the second difference at the interval ends against the median
    std::printf("%s{\"kHours\":%d,\"grids\":%d,\"rmsM\":%.4f,\"maxM\":%.4f,\"outputRoughM\":%.4f}", ki ? "," : "", ks[ki], nodes, std::sqrt(s2 / idx.size()), mx, d2[d2.size() / 2]);
    for (auto& g : grids) tess::wide_grid_release(g);
  }
  std::printf("]}\n");
  return 0;
}
