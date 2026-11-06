// Native wall of xp_init for a THEMIS-like AP (31, 20) set, and of its parts.
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
int main() {
  const auto now = [] { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); };
  tess::active().tesseral = 31;
  tess::active().zonal = 20;
  const int reps = 20;
  double t0 = now();
  for (int r = 0; r < reps; ++r) {
    Elements e{};
    e.xno = 1.0499 * kTwoPi / kMinutesPerDay; e.eo = 0.8221 + r * 1e-3; e.xincl = 8.13 * kDeg; e.xnodeo = 0.8; e.omegao = 1.2; e.xmo = 0.7;
    e.epoch_jd_whole = 2456332.5; e.epoch_jd_frac = 0.0;
    XpSat* s = static_cast<XpSat*>(std::calloc(1, sizeof(XpSat)));
    xp_init(e, *s);
    xp_release(*s);
    std::free(s);
  }
  const double all = (now() - t0) / reps;
  t0 = now();
  float* F = static_cast<float*>(std::malloc(4 * tess::zonal_count(20, true) * sizeof(float)));
  for (int r = 0; r < reps; ++r) tess::zonal_visit_terms(20, true, 8.13 * kDeg, 0.8221 + r * 1e-3, F);
  const double zon = (now() - t0) / reps;
  t0 = now();
  for (int r = 0; r < reps; ++r) { tess::WideGrid g{}; tess::wide_grid_build(12, 1, 1.0499 * kTwoPi / kMinutesPerDay, 0.8221 + r * 1e-3, 8.13 * kDeg, g); tess::wide_grid_release(g); }
  const double grid = (now() - t0) / reps;
  std::printf("{\"xpInitMs\":%.1f,\"zonalWideMs\":%.1f,\"gridMs\":%.1f,\"zonalTerms\":%d}\n", all, zon, grid, tess::zonal_count(20, true));
  return 0;
}
