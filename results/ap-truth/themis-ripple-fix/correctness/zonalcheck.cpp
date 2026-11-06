// Amendment 18 check: the wide zonal tail's G and dG/de by node_G (256-node trapezoid) against res::exact_G (512-point quadrature,
// fourth-order difference) over its terms (l 6 to 20, w = l - 2p, q = -w) at an eccentricity.
#include <algorithm>
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
int main(int argc, char** argv) {
  const double e = std::atof(argv[1]);
  double worstG = 0, worstD = 0, scaleG = 0, scaleD = 0;
  int terms = 0;
  // relative to the largest |G| (|dG/de|) of the same degree: the term's weight in the degree's sum
  double hiG[3] = {0, 0, 0};
  for (int l = 6; l <= 20; ++l) {
    double mG = 0, mD = 0;
    double G0[41], D0[41], G1[41], D1[41];
    int k = 0;
    for (int w = -l; w <= l; w += 2, ++k) {
      const int p = (l - w) / 2, q = -w;
      res::exact_G(l, p, q, e, G0[k], D0[k]);
      tess::node_G(l, p, q, e, G1[k], D1[k]);
      mG = std::max(mG, std::fabs(G0[k]));
      mD = std::max(mD, std::fabs(D0[k]));
      ++terms;
    }
    for (int j = 0; j < k; ++j) {
      worstG = std::max(worstG, std::fabs(G1[j] - G0[j]) / mG);
      worstD = std::max(worstD, std::fabs(D1[j] - D0[j]) / mD);
    }
    hiG[0] = std::max(hiG[0], mG);
  }
  std::printf("{\"e\":%g,\"terms\":%d,\"worstGRelativeToDegreeMax\":%.3e,\"worstDGRelativeToDegreeMax\":%.3e}\n", e, terms, worstG, worstD);
  return 0;
}
