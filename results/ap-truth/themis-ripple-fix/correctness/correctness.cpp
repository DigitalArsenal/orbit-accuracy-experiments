// THEMIS-RIPPLE-FIX.md (a): the e > 0.3 first-order tesseral table (sp_terms) and its output-time sum (sp_six), compiled from the
// module's own src, against a direct quadrature of each (l, m) term of the same pinned field on the Kepler ellipse.
#include <algorithm>
#include <cmath>
#include <complex>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <map>
#include <memory>
#include <string>
#include <tuple>
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
using cd = std::complex<double>;

static void fft(std::vector<cd>& a) {  // forward, e^{-i}
  const size_t n = a.size();
  for (size_t i = 1, j = 0; i < n; ++i) {
    size_t bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) std::swap(a[i], a[j]);
  }
  for (size_t len = 2; len <= n; len <<= 1) {
    const double ang = -2.0 * kPi / double(len);
    const cd wl(std::cos(ang), std::sin(ang));
    for (size_t i = 0; i < n; i += len) {
      cd w(1.0);
      for (size_t j = 0; j < len / 2; ++j) {
        const cd u = a[i + j], v = a[i + j + len / 2] * w;
        a[i + j] = u + v;
        a[i + j + len / 2] = u - v;
        w *= wl;
      }
    }
  }
}

// Fully normalized Pbar_lm(x), geodesy convention (no Condon-Shortley phase), m fixed, l = m..L.
static void pbar(int m, int L, double x, double* P) {
  const double c = std::sqrt(std::max(0.0, 1.0 - x * x));
  double pmm = 1.0;
  for (int k = 1; k <= m; ++k) pmm *= (k == 1 ? std::sqrt(3.0) : std::sqrt((2.0 * k + 1.0) / (2.0 * k))) * c;
  P[m] = pmm;
  if (m + 1 <= L) P[m + 1] = std::sqrt(2.0 * m + 3.0) * x * pmm;
  for (int l = m + 2; l <= L; ++l) {
    const double a = std::sqrt((2.0 * l + 1.0) * (2.0 * l - 1.0) / ((l - m) * double(l + m)));
    const double b = std::sqrt((2.0 * l + 1.0) * (l + m - 1.0) * (l - m - 1.0) / ((l - m) * double(l + m) * (2.0 * l - 3.0)));
    P[l] = a * x * P[l - 1] - b * P[l - 2];
  }
}

constexpr int NM = 4096, NW = 32;
// V_lm on the ellipse (a, e, i), node phase beta, grid of M and omega; returns Z = V(beta=0) - i V(beta=pi/2m), DFT coefficient
// c[w][j] for w in [-l, l], j in [-NM/2, NM/2).
struct Coefs { std::vector<cd> c; int l; cd at(int w, int j) const { return c[(w + l) * NM + ((j % NM + NM) % NM)]; } };
static Coefs quad(int l, int m, double a, double e, double inc) {
  std::vector<cd> Z(size_t(NW) * NM);
  const double si = std::sin(inc), ci = std::cos(inc), eta = std::sqrt(1 - e * e);
  double P[80];
  for (int iw = 0; iw < NW; ++iw) {
    const double w = kTwoPi * iw / NW;
    for (int iM = 0; iM < NM; ++iM) {
      const double M = kTwoPi * iM / NM;
      double E = e < 0.8 ? M : kPi;
      for (int it = 0; it < 60; ++it) { const double d = (E - e * std::sin(E) - M) / (1 - e * std::cos(E)); E -= d; if (std::fabs(d) < 1e-15) break; }
      const double r = a * (1 - e * std::cos(E));
      const double f = std::atan2(eta * std::sin(E), std::cos(E) - e);
      const double u = w + f, su = std::sin(u), cu = std::cos(u);
      const double sphi = si * su;
      const double dl = std::atan2(ci * su, cu);  // alpha - Omega
      pbar(m, l, sphi, P);
      const double rad = kMu / r * std::pow(1.0 / r, l) * P[l];
      double vv[2];
      for (int b = 0; b < 2; ++b) {
        const double lam = (b == 0 ? 0.0 : kPi / (2.0 * m)) + dl;
        vv[b] = rad * (tess::kEgmC[l][m] * std::cos(m * lam) + tess::kEgmS[l][m] * std::sin(m * lam));
      }
      Z[size_t(iw) * NM + iM] = cd(vv[0], -vv[1]);
    }
  }
  Coefs out{std::vector<cd>(size_t(2 * l + 1) * NM), l};
  std::vector<cd> row(NM);
  for (int w = -l; w <= l; ++w) {
    for (int iM = 0; iM < NM; ++iM) {
      cd s = 0;
      for (int iw = 0; iw < NW; ++iw) s += Z[size_t(iw) * NM + iM] * std::polar(1.0, -kTwoPi * w * iw / NW);
      row[iM] = s / double(NW);
    }
    fft(row);
    for (int iM = 0; iM < NM; ++iM) out.c[size_t(w + l) * NM + iM] = row[iM] / double(NM);
  }
  return out;
}

static void kep_pos(double a, double e, double i, double node, double argp, double M, double* r) {
  double E = M;
  for (int it = 0; it < 60; ++it) { const double d = (E - e * std::sin(E) - M) / (1 - e * std::cos(E)); E -= d; if (std::fabs(d) < 1e-15) break; }
  const double eta = std::sqrt(1 - e * e), x = a * (std::cos(E) - e), y = a * eta * std::sin(E);
  const double cw = std::cos(argp), sw = std::sin(argp), cO = std::cos(node), sO = std::sin(node), cI = std::cos(i), sI = std::sin(i);
  const double px = cw * x - sw * y, py = sw * x + cw * y;
  r[0] = cO * px - sO * cI * py; r[1] = sO * px + cO * cI * py; r[2] = sI * py;
}
// The six displacements (n, e, i, e varpi, sin i Omega, lambda) to position (m), linearized by central differences.
static void six_to_pos(const Kepler& k, double n, const double* six, double* dr) {
  const double da = -2.0 / 3.0 * k.a * six[0] / n, de = six[1], di = six[2];
  const double dvarpi = six[3] / k.e, dO = six[4] / std::sin(k.i), dl = six[5];
  const double dw = dvarpi - dO, dM = dl - dvarpi;
  const double d[6] = {da, de, di, dO, dw, dM};
  const double base[6] = {k.a, k.e, k.i, k.node, k.argp, k.m};
  for (int c = 0; c < 3; ++c) dr[c] = 0;
  for (int q = 0; q < 6; ++q) {
    const double h = 1e-7 * (q == 0 ? k.a : 1.0);
    double p[6], mm[6];
    std::memcpy(p, base, sizeof p); std::memcpy(mm, base, sizeof mm);
    p[q] += h; mm[q] -= h;
    double rp[3], rm[3];
    kep_pos(p[0], p[1], p[2], p[3], p[4], p[5], rp);
    kep_pos(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5], rm);
    for (int c = 0; c < 3; ++c) dr[c] += (rp[c] - rm[c]) / (2 * h) * d[q] * kRe * 1000.0;
  }
}

struct Comp { int l, m, w, j; cd Z, Ze, Zi; };

int main(int argc, char** argv) {
  if (argc < 9) { std::fprintf(stderr, "usage: label n_revday e i_deg raan_deg argp_deg ma_deg d50\n"); return 2; }
  const char* label = argv[1];
  const double n0 = std::atof(argv[2]) * kTwoPi / kMinutesPerDay, e0 = std::atof(argv[3]), i0 = std::atof(argv[4]) * kDeg;
  const double O0 = std::atof(argv[5]) * kDeg, w0 = std::atof(argv[6]) * kDeg, M0 = std::atof(argv[7]) * kDeg, d50 = std::atof(argv[8]);
  const int cls = res::band_of(n0), degree = 12, near = 31;
  const bool longp = (kTwoPi / n0) >= kLongPeriodMinutes;
  const bool low = cls == 0 && !longp;
  std::vector<tess::SpCoef> T(tess::sp_bound(degree, e0 > tess::kWideE));
  const int count = tess::sp_terms(degree, near, cls, low, n0, i0, e0, T.data());
  T.resize(count);
  const double a0 = std::pow(kKe / n0, kX2o3), eta = std::sqrt(1 - e0 * e0), p0 = a0 * eta * eta, c0 = std::cos(i0);
  const double j2 = 1.5 * kJ2 / (p0 * p0);
  const double mdot = n0 + 0.5 * j2 * n0 * eta * (3 * c0 * c0 - 1), wdot = 0.5 * j2 * n0 * (5 * c0 * c0 - 1), node_rate = -j2 * n0 * c0;
  std::printf("{\"window\":\"%s\",\"class\":%d,\"longPeriod\":%d,\"low\":%d,\"a0Er\":%.9f,\"tableTerms\":%d,", label, cls, longp, low, a0, count);
  // term by term
  const double h = 1e-6;
  std::map<std::tuple<int, int, int, int>, int> held;
  for (int k = 0; k < count; ++k) held[{T[k].l, T[k].m, T[k].w, T[k].j}] = k;
  const res::TermSet carried = res::class_terms(cls);
  int worst_k = -1, defects = 0, omitted_keep = 0;
  double worst_rel = 0, omitted_max = 0, omitted_sum = 0;
  std::string defect_list, omitted_list;
  std::vector<Comp> all;
  std::vector<int> table_of_comp;
  for (int l = 2; l <= degree; ++l)
    for (int m = 1; m <= l; ++m) {
      const Coefs q0 = quad(l, m, a0, e0, i0), qep = quad(l, m, a0, e0 + h, i0), qem = quad(l, m, a0, e0 - h, i0);
      const Coefs qip = quad(l, m, a0, e0, i0 + h), qim = quad(l, m, a0, e0, i0 - h);
      const double A = kMu * std::pow(1.0 / a0, l + 1), sv = std::hypot(tess::kEgmC[l][m], tess::kEgmS[l][m]);
      const bool odd = ((l - m) & 1) != 0;
      const double Cc = odd ? -tess::kEgmS[l][m] : tess::kEgmC[l][m], Sc = odd ? tess::kEgmC[l][m] : tess::kEgmS[l][m];
      double lm_max = 0;
      for (int w = -l; w <= l; w += 2) for (int j = -NM / 2 + 1; j < NM / 2; ++j) lm_max = std::max(lm_max, std::abs(q0.at(w, j)));
      for (int w = -l; w <= l; w += 2)
        for (int j = -NM / 2 + 1; j < NM / 2; ++j) {
          const cd Z = q0.at(w, j);
          if (std::abs(Z) < 1e-14 * lm_max) continue;
          const cd Ze = (qep.at(w, j) - qem.at(w, j)) / (2 * h), Zi = (qip.at(w, j) - qim.at(w, j)) / (2 * h);
          all.push_back({l, m, w, j, Z, Ze, Zi});
          auto it = held.find({l, m, w, j});
          table_of_comp.push_back(it == held.end() ? -1 : it->second);
          const double psidot = w * wdot + j * mdot + m * (node_rate - kOmegaE);
          if (it != held.end()) {
            const tess::SpCoef& t = T[it->second];
            const double G = t.g0 + t.g1 * e0;
            const cd Zm = A * double(t.f) * G * cd(Cc, -Sc), Zme = A * double(t.f) * double(t.g1) * cd(Cc, -Sc), Zmi = A * double(t.df) * G * cd(Cc, -Sc);
            const double tol = std::max(1e-4 * std::abs(Z), 1e-6 * lm_max);
            const double d0 = std::abs(Zm - Z), de = std::abs(Zme - Ze), di = std::abs(Zmi - Zi);
            const double tole = std::max(1e-4 * std::abs(Ze), 1e-6 * lm_max), toli = std::max(1e-4 * std::abs(Zi), 1e-6 * lm_max);
            const double rel = d0 / std::abs(Z);
            if (rel > worst_rel) { worst_rel = rel; worst_k = it->second; }
            if (d0 > tol || de > 10 * tole || di > 10 * toli) {
              ++defects;
              char buf[256];
              std::snprintf(buf, sizeof buf, "%s[%d,%d,%d,%d,%.3e,%.3e,%.3e,%.3e,%.3e,%.3e]", defect_list.empty() ? "" : ",", l, m, w, j, std::abs(Z), d0 / std::abs(Z), std::abs(Ze), de / std::max(std::abs(Ze), 1e-300), std::abs(Zi), di / std::max(std::abs(Zi), 1e-300));
              defect_list += buf;
            }
          } else {
            // not held: in m-daily, a class, the slow band, or dropped by truncation or the screen
            if (w == 0 && j == 0) continue;
            bool cls_term = false;
            for (int c = 0; c < carried.count; ++c) if (carried.t[c].l == l && carried.t[c].m == m && carried.t[c].p == (l - w) / 2 && carried.t[c].q == j - w) cls_term = true;
            if (cls_term || std::fabs(psidot) < tess::kShallowBand * n0) continue;
            const double FG = std::abs(Z) / (A * sv), Fg1 = std::abs(Ze) / (A * sv), dFG = std::abs(Zi) / (A * sv);
            const double ap = std::fabs(psidot), na2 = n0 * a0 * a0;
            const double mag = a0 * A * sv * (FG * (3.0 * std::abs(j) / (a0 * a0 * ap * ap) + 2.0 * (l + 1) / (na2 * ap)) + Fg1 / (na2 * ap) + dFG / (na2 * ap)) * kRe * 1000.0;
            if (mag >= 0.5) {
              ++omitted_keep;
              omitted_sum += mag;
              if (mag > omitted_max) omitted_max = mag;
              if (mag > 2.0) {
                char buf[96];
                std::snprintf(buf, sizeof buf, "%s[%d,%d,%d,%d,%.2f]", omitted_list.empty() ? "" : ",", l, m, w, j, mag);
                if (omitted_list.size() < 6000) omitted_list += buf;
              }
            }
          }
        }
    }
  std::printf("\"worstRelative\":%.3e,\"worstTerm\":[%d,%d,%d,%d],\"defects\":%d,\"defectTerms\":[%s],", worst_rel,
              worst_k >= 0 ? T[worst_k].l : 0, worst_k >= 0 ? T[worst_k].m : 0, worst_k >= 0 ? T[worst_k].w : 0, worst_k >= 0 ? T[worst_k].j : 0,
              defects, defect_list.c_str());
  std::printf("\"omittedAtKeep\":%d,\"omittedMaxM\":%.3f,\"omittedSumM\":%.3f,\"omittedOver2m\":[%s],", omitted_keep, omitted_max, omitted_sum, omitted_list.c_str());
  // short-period effect: (1) table via sp_six, (2) quadrature on the table's terms, (3) quadrature over every admissible harmonic
  const double theta_g0 = gsto_afspc(d50);
  const double na2 = n0 * a0 * a0, si = std::sin(i0);
  const int steps = 7 * 288 + 1;
  std::vector<double> tr1(3 * steps), tr2(3 * steps), tr3(3 * steps), tr4(3 * steps);
  for (int s = 0; s < steps; ++s) {
    const double t = 5.0 * s;  // minutes
    Kepler k{a0, e0, i0, wrap(O0 + node_rate * t), wrap(w0 + wdot * t), wrap(M0 + mdot * t)};
    double six1[6] = {0, 0, 0, 0, 0, 0};
    tess::sp_six(T.data(), count, t, k, n0, eta, si, c0, theta_g0, six1);
    double six2[6] = {0, 0, 0, 0, 0, 0}, six3[6] = {0, 0, 0, 0, 0, 0}, six4[6] = {0, 0, 0, 0, 0, 0};
    const double beta = k.node - (theta_g0 + kOmegaE * t);
    for (size_t c = 0; c < all.size(); ++c) {
      const Comp& q = all[c];
      if (q.w == 0 && q.j == 0) continue;
      const double psidot = q.w * wdot + q.j * mdot + q.m * (node_rate - kOmegaE);
      bool cls_term = false;
      for (int z = 0; z < carried.count; ++z) if (carried.t[z].l == q.l && carried.t[z].m == q.m && carried.t[z].p == (q.l - q.w) / 2 && carried.t[z].q == q.j - q.w) cls_term = true;
      const bool in2 = table_of_comp[c] >= 0;
      const bool in3 = !cls_term && std::fabs(psidot) >= 0.2 * n0;
      const bool in4 = !cls_term && std::fabs(psidot) >= tess::kShallowBand * n0;
      if (!in2 && !in3 && !in4) continue;
      const double psi = q.w * k.argp + q.j * k.m + q.m * beta;
      const cd E = std::polar(1.0, psi) / cd(0, psidot);  // integral over time of e^{i psi}
      const cd dVM = cd(0, q.j) * q.Z, dVw = cd(0, q.w) * q.Z, dVO = cd(0, q.m) * q.Z, dVa = -(q.l + 1) / a0 * q.Z;
      const cd ad = 2.0 / (n0 * a0) * dVM;
      const cd ed = eta * eta / (na2 * e0) * dVM - eta / (na2 * e0) * dVw;
      const cd id = c0 / (na2 * eta * si) * dVw - 1.0 / (na2 * eta * si) * dVO;
      const cd Od = 1.0 / (na2 * eta * si) * q.Zi;
      const cd wd = eta / (na2 * e0) * q.Ze - c0 / (na2 * eta * si) * q.Zi;
      const cd Md = -2.0 / (n0 * a0) * dVa - eta * eta / (na2 * e0) * q.Ze;
      const double da = std::real(ad * E), de = std::real(ed * E), di = std::real(id * E), dO = std::real(Od * E), dw = std::real(wd * E);
      const double dM = std::real(Md * E) + std::real(-1.5 * n0 / a0 * ad * E / cd(0, psidot));
      const double six[6] = {-1.5 * n0 / a0 * da, de, di, e0 * (dw + dO), si * dO, dM + dw + dO};
      for (int z = 0; z < 6; ++z) { if (in2) six2[z] += six[z]; if (in3) six3[z] += six[z]; if (in4) six4[z] += six[z]; }
    }
    six_to_pos(k, n0, six1, &tr1[3 * s]);
    six_to_pos(k, n0, six2, &tr2[3 * s]);
    six_to_pos(k, n0, six3, &tr3[3 * s]);
    six_to_pos(k, n0, six4, &tr4[3 * s]);
  }
  auto diff_stats = [&](const std::vector<double>& x, const std::vector<double>& y, double& rmsd, double& maxd, double& rough) {
    double s2 = 0; maxd = 0;
    std::vector<double> d2;
    for (int s = 0; s < steps; ++s) {
      double q = 0;
      for (int c = 0; c < 3; ++c) q += std::pow(x[3 * s + c] - y[3 * s + c], 2);
      s2 += q; maxd = std::max(maxd, std::sqrt(q));
      if (s >= 1 && s + 1 < steps) {
        double v = 0;
        for (int c = 0; c < 3; ++c) { const double dd = (x[3 * (s + 1) + c] - y[3 * (s + 1) + c]) - 2 * (x[3 * s + c] - y[3 * s + c]) + (x[3 * (s - 1) + c] - y[3 * (s - 1) + c]); v += dd * dd; }
        d2.push_back(std::sqrt(v));
      }
    }
    rmsd = std::sqrt(s2 / steps);
    std::nth_element(d2.begin(), d2.begin() + d2.size() / 2, d2.end());
    rough = d2[d2.size() / 2];
  };
  std::vector<double> zero(3 * steps, 0.0);
  double r1, m1, g1, r2, m2, g2, r12, m12, g12, r13, m13, g13, r14, m14, g14, r3, m3, g3, r4, m4, g4;
  diff_stats(tr1, zero, r1, m1, g1);
  diff_stats(tr2, zero, r2, m2, g2);
  diff_stats(tr3, zero, r3, m3, g3);
  diff_stats(tr4, zero, r4, m4, g4);
  diff_stats(tr1, tr2, r12, m12, g12);
  diff_stats(tr3, tr1, r13, m13, g13);
  diff_stats(tr4, tr1, r14, m14, g14);
  std::printf("\"table\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.4f},\"quadTableTerms\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.4f},", r1, m1, g1, r2, m2, g2);
  std::printf("\"quadAll02n\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.4f},\"quadAll0045n\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.4f},", r3, m3, g3, r4, m4, g4);
  std::printf("\"tableMinusQuadTable\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.4f,\"relRms\":%.3e},", r12, m12, g12, r12 / r2);
  std::printf("\"quadAll02nMinusTable\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.4f},\"quadAll0045nMinusTable\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.4f}}\n", r13, m13, g13, r14, m14, g14);
  return 0;
}
