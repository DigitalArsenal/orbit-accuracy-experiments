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
#include <chrono>
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

constexpr int NM = 1024, NW = 32;  // e <= 0.3: the series converges well inside 512 harmonics
static bool g_low = false;
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
struct Orbit { double n0, a0, e0, i0, eta, c0, si, mdot, wdot, node_rate, na2; };
static Orbit orbit(double n0, double e0, double i0) {
  Orbit o{};
  o.n0 = n0; o.e0 = e0; o.i0 = i0; o.a0 = std::pow(kKe / n0, kX2o3); o.eta = std::sqrt(1 - e0 * e0); o.c0 = std::cos(i0); o.si = std::sin(i0);
  const double p0 = o.a0 * o.eta * o.eta, j2 = 1.5 * kJ2 / (p0 * p0);
  o.mdot = n0 + 0.5 * j2 * n0 * o.eta * (3 * o.c0 * o.c0 - 1); o.wdot = 0.5 * j2 * n0 * (5 * o.c0 * o.c0 - 1); o.node_rate = -j2 * n0 * o.c0; o.na2 = n0 * o.a0 * o.a0;
  return o;
}
// every admissible harmonic (not m-daily, no class term, |psi-dot| >= 0.045 n), with its six-component coefficient
struct H6 { int m, w, j; cd c[6]; };
static std::vector<H6> harmonics(const Orbit& o, int cls) {
  std::vector<H6> out;
  const res::TermSet carried = res::class_terms(cls);
  const double h = 1e-6;
  int left_m = 0, left_class = 0, left_slow = 0;
  for (int l = 2; l <= 12; ++l) for (int m = 1; m <= l; ++m) {
    const Coefs q0 = quad(l, m, o.a0, o.e0, o.i0), qep = quad(l, m, o.a0, o.e0 + h, o.i0), qem = quad(l, m, o.a0, o.e0 - h, o.i0);
    const Coefs qip = quad(l, m, o.a0, o.e0, o.i0 + h), qim = quad(l, m, o.a0, o.e0, o.i0 - h);
    double mx = 0;
    for (int w = -l; w <= l; w += 2) for (int j = -NM / 2 + 1; j < NM / 2; ++j) mx = std::max(mx, std::abs(q0.at(w, j)));
    for (int w = -l; w <= l; w += 2) for (int j = -NM / 2 + 1; j < NM / 2; ++j) {
      const cd Z = q0.at(w, j);
      if (std::abs(Z) < 1e-14 * mx) continue;
      if (w == 0 && j == 0) { ++left_m; continue; }
      bool ct = false;
      for (int z = 0; z < carried.count; ++z) if (carried.t[z].l == l && carried.t[z].m == m && carried.t[z].p == (l - w) / 2 && carried.t[z].q == j - w) ct = true;
      if (cls == 2 && l > 5 && (m & 1) == 0 && j == m / 2) ct = true;  // the half-day tail, in the class's rates
      if (ct) { ++left_class; continue; }
      const double psidot = w * o.wdot + j * o.mdot + m * (o.node_rate - kOmegaE);
      // the table's own admission (sp_terms weight_of): low orbits drop only |psi-dot| < 1e-3 n and the shallow band's
      // q = 0, w = 1, j = 1 terms; the others drop |psi-dot| < kShallowBand n
      const double x = std::fabs(psidot) / (tess::kShallowBand * o.n0);
      if (g_low ? ((j - w == 0 && w == 1 && j == 1 && x < 1.0) || std::fabs(psidot) < 1e-3 * o.n0) : x < 1.0) { ++left_slow; continue; }
      const cd Ze = (qep.at(w, j) - qem.at(w, j)) / (2 * h), Zi = (qip.at(w, j) - qim.at(w, j)) / (2 * h);
      const cd ip(0, psidot);
      const cd dVM = cd(0, j) * Z, dVw = cd(0, w) * Z, dVO = cd(0, m) * Z, dVa = -(l + 1) / o.a0 * Z;
      const double eta = o.eta, na2 = o.na2, e0 = o.e0, si = o.si, c0 = o.c0, n0 = o.n0, a0 = o.a0;
      const cd ad = 2.0 / (n0 * a0) * dVM;
      const cd ed = eta * eta / (na2 * e0) * dVM - eta / (na2 * e0) * dVw;
      const cd id = c0 / (na2 * eta * si) * dVw - 1.0 / (na2 * eta * si) * dVO;
      const cd Od = 1.0 / (na2 * eta * si) * Zi;
      const cd wd = eta / (na2 * e0) * Ze - c0 / (na2 * eta * si) * Zi;
      const cd Md = -2.0 / (n0 * a0) * dVa - eta * eta / (na2 * e0) * Ze;
      const cd ca = ad / ip, ce = ed / ip, cI = id / ip, cO = Od / ip, cw = wd / ip, cM = Md / ip - 1.5 * n0 / a0 * ad / (ip * ip);
      out.push_back({m, w, j, {-1.5 * n0 / a0 * ca, ce, cI, e0 * (cw + cO), si * cO, cM + cw + cO}});
    }
  }
  std::fprintf(stderr, "left out: m-daily %d, class %d, slow %d; kept %zu\n", left_m, left_class, left_slow, out.size());
  return out;
}

int estar_main(int argc, char** argv);
int main(int argc, char** argv) { return estar_main(argc, argv); }
int old_main(int argc, char** argv) {
  const char* label = argv[1];
  const double n0 = std::atof(argv[2]) * kTwoPi / kMinutesPerDay, e0 = std::atof(argv[3]), i0 = std::atof(argv[4]) * kDeg;
  const double O0 = std::atof(argv[5]) * kDeg, w0 = std::atof(argv[6]) * kDeg, M0 = std::atof(argv[7]) * kDeg, d50 = std::atof(argv[8]);
  const std::string mode = argv[9];
  const double de = argc > 10 ? std::atof(argv[10]) : 0, dar = argc > 11 ? std::atof(argv[11]) : 0, di = argc > 12 ? std::atof(argv[12]) : 0;
  const int cls = res::band_of(n0);
  const Orbit ob = orbit(n0, e0, i0);
  const std::vector<H6> base = harmonics(ob, cls);
  // grid at the base elements: per (m, w), NS samples in E
  constexpr int NS = 1024;
  std::map<std::pair<int, int>, std::vector<cd>> fam;
  std::vector<double> Mg(NS);
  for (int n = 0; n < NS; ++n) { const double E = kTwoPi * n / NS; Mg[n] = E - e0 * std::sin(E); }
  const auto t0 = std::chrono::steady_clock::now();
  for (const H6& q : base) {
    auto& v = fam[{q.m, q.w}];
    if (v.empty()) v.assign(6 * NS, cd(0));
    for (int n = 0; n < NS; ++n) { const cd ph = std::polar(1.0, q.j * Mg[n]); for (int k = 0; k < 6; ++k) v[k * NS + n] += q.c[k] * ph; }
  }
  const double sampleS = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
  // the flight's elements: base, or shifted (drift)
  const double n1 = mode == "drift" ? n0 * std::pow(1.0 + dar, -1.5) : n0;
  const Orbit o1 = mode == "drift" ? orbit(n1, e0 + de, i0 + di) : ob;
  const std::vector<H6> ref = mode == "drift" ? harmonics(o1, cls) : base;
  const double theta_g0 = gsto_afspc(d50);
  const int steps = 7 * 288 + 1;
  auto kep_at = [&](const Orbit& o, double t) { return Kepler{o.a0, o.e0, o.i0, wrap(O0 + o.node_rate * t), wrap(w0 + o.wdot * t), wrap(M0 + o.mdot * t)}; };
  std::vector<double> trRef(3 * steps);
  for (int s = 0; s < steps; ++s) {
    const double t = 5.0 * s;
    const Kepler k = kep_at(o1, t);
    const double beta = k.node - (theta_g0 + kOmegaE * t);
    double six[6] = {0, 0, 0, 0, 0, 0};
    for (const H6& q : ref) { const cd ph = std::polar(1.0, q.w * k.argp + q.j * k.m + q.m * beta); for (int z = 0; z < 6; ++z) six[z] += std::real(q.c[z] * ph); }
    six_to_pos(k, o1.n0, six, &trRef[3 * s]);
  }
  auto stats = [&](const std::vector<double>& x, const std::vector<double>* y, double& rmsd, double& maxd, double& rough) {
    double s2 = 0; maxd = 0; std::vector<double> d2;
    auto v = [&](int s, int c) { return x[3 * s + c] - (y ? (*y)[3 * s + c] : 0.0); };
    for (int s = 0; s < steps; ++s) {
      double q = 0; for (int c = 0; c < 3; ++c) q += v(s, c) * v(s, c);
      s2 += q; maxd = std::max(maxd, std::sqrt(q));
      if (s >= 1 && s + 1 < steps) { double w2 = 0; for (int c = 0; c < 3; ++c) { const double dd = v(s + 1, c) - 2 * v(s, c) + v(s - 1, c); w2 += dd * dd; } d2.push_back(std::sqrt(w2)); }
    }
    rmsd = std::sqrt(s2 / steps); std::nth_element(d2.begin(), d2.begin() + d2.size() / 2, d2.end()); rough = d2[d2.size() / 2];
  };
  std::printf("{\"window\":\"%s\",\"mode\":\"%s\",\"de\":%g,\"daRel\":%g,\"di\":%g,\"families\":%zu,\"harmonics\":%zu,\"sampleSeconds\":%.2f,\"rows\":[", label, mode.c_str(), de, dar, di, fam.size(), base.size(), sampleS);
  const std::vector<int> Ns = mode == "drift" ? std::vector<int>{128, 256} : std::vector<int>{128, 256, 512, 1024};
  const std::vector<std::string> kinds = mode == "drift" ? std::vector<std::string>{"fourier"} : std::vector<std::string>{"fourier", "cubic"};
  bool first = true;
  for (const auto& kind : kinds) for (int N : Ns) {
    if (kind == "fourier" && N > 256) continue;
    const int stride = NS / N;
    std::map<std::pair<int, int>, std::vector<cd>> co;
    for (auto& [key, v] : fam) {
      std::vector<cd> c(6 * N);
      for (int k = 0; k < 6; ++k) {
        std::vector<cd> row(N);
        for (int n = 0; n < N; ++n) row[n] = v[k * NS + n * stride];
        if (kind == "fourier") { fft(row); for (int n = 0; n < N; ++n) row[n] /= double(N); }
        for (int n = 0; n < N; ++n) c[k * N + n] = row[n];
      }
      co[key] = std::move(c);
    }
    std::vector<double> tr(3 * steps);
    const auto te = std::chrono::steady_clock::now();
    std::vector<cd> eE(N);
    for (int s = 0; s < steps; ++s) {
      const double t = 5.0 * s;
      const Kepler k = kep_at(o1, t);
      double E = k.m;
      for (int it = 0; it < 60; ++it) { const double d = (E - k.e * std::sin(E) - k.m) / (1 - k.e * std::cos(E)); E -= d; if (std::fabs(d) < 1e-15) break; }
      const double beta = k.node - (theta_g0 + kOmegaE * t);
      double six[6] = {0, 0, 0, 0, 0, 0};
      if (kind == "fourier") {
        for (int s2 = 0; s2 < N; ++s2) { const int f = s2 < N / 2 ? s2 : s2 - N; eE[s2] = std::polar(1.0, f * E); }
        for (auto& [key, c] : co) {
          const cd ph = std::polar(1.0, key.second * k.argp + key.first * beta);
          for (int z = 0; z < 6; ++z) { cd sum = 0; for (int s2 = 0; s2 < N; ++s2) sum += c[z * N + s2] * eE[s2]; six[z] += std::real(ph * sum); }
        }
      } else {
        const double x = wrap(E) / kTwoPi * N; int i1 = int(std::floor(x)); const double u = x - i1;
        const int i0_ = (i1 - 1 + N) % N, i2 = (i1 + 1) % N, i3 = (i1 + 2) % N; i1 %= N;
        const double w0_ = -u * (u - 1) * (u - 2) / 6, w1 = (u + 1) * (u - 1) * (u - 2) / 2, w2 = -(u + 1) * u * (u - 2) / 2, w3 = (u + 1) * u * (u - 1) / 6;
        for (auto& [key, c] : co) {
          const cd ph = std::polar(1.0, key.second * k.argp + key.first * beta);
          for (int z = 0; z < 6; ++z) { const cd* r = &c[z * N]; six[z] += std::real(ph * (w0_ * r[i0_] + w1 * r[i1] + w2 * r[i2] + w3 * r[i3])); }
        }
      }
      six_to_pos(k, o1.n0, six, &tr[3 * s]);
    }
    const double us = 1e6 * std::chrono::duration<double>(std::chrono::steady_clock::now() - te).count() / steps;
    double rr, mx, rg, r0, m0, g0;
    stats(tr, &trRef, rr, mx, rg);
    stats(tr, nullptr, r0, m0, g0);
    std::printf("%s{\"interpolant\":\"%s\",\"N\":%d,\"bytes\":%zu,\"usPerStep\":%.1f,\"outputRoughM\":%.4f,\"rmsM\":%.4f,\"maxM\":%.4f,\"roughDiffM\":%.5f}", first ? "" : ",", kind.c_str(), N, co.size() * 6 * N * sizeof(cd), us, g0, rr, mx, rg);
    first = false;
  }
  std::printf("]}\n");
  return 0;
}

// Amendment 7 / 12: the narrow set (the module's sp_terms at e <= kWideE, degree 2 to 12) through sp_six against the full-field
// quadrature over the same admission rules, 7 days at 300 s. Args: label n_revday e i_deg raan argp ma d50
int estar_main(int argc, char** argv) {
  const char* label = argv[1];
  const double n0 = std::atof(argv[2]) * kTwoPi / kMinutesPerDay, e0 = std::atof(argv[3]), i0 = std::atof(argv[4]) * kDeg;
  const double O0 = std::atof(argv[5]) * kDeg, w0 = std::atof(argv[6]) * kDeg, M0 = std::atof(argv[7]) * kDeg, d50 = std::atof(argv[8]);
  const int cls = res::band_of(n0);
  const bool longp = (kTwoPi / n0) >= kLongPeriodMinutes;
  g_low = cls == 0 && !longp;
  const Orbit ob = orbit(n0, e0, i0);
  const std::vector<H6> ref = harmonics(ob, cls);
  std::vector<tess::SpCoef> T(tess::sp_bound(12, false));
  const int count = tess::sp_terms(12, 31, cls, g_low, n0, i0, e0, T.data());
  std::vector<tess::SpCoef> narrow;
  for (int k = 0; k < count; ++k) if (T[k].l <= 12) narrow.push_back(T[k]);
  const double theta_g0 = gsto_afspc(d50);
  const int steps = 7 * 288 + 1;
  std::vector<double> d(3 * steps);
  double s2 = 0, mx = 0, r2 = 0;
  for (int s = 0; s < steps; ++s) {
    const double t = 5.0 * s;
    const Kepler k{ob.a0, ob.e0, ob.i0, wrap(O0 + ob.node_rate * t), wrap(w0 + ob.wdot * t), wrap(M0 + ob.mdot * t)};
    const double beta = k.node - (theta_g0 + kOmegaE * t);
    double sref[6] = {0, 0, 0, 0, 0, 0}, stab[6] = {0, 0, 0, 0, 0, 0};
    for (const H6& q : ref) { const cd ph = std::polar(1.0, q.w * k.argp + q.j * k.m + q.m * beta); for (int z = 0; z < 6; ++z) sref[z] += std::real(q.c[z] * ph); }
    tess::sp_six(narrow.data(), static_cast<int>(narrow.size()), t, k, ob.n0, ob.eta, ob.si, ob.c0, theta_g0, stab);
    double pr[3], pt[3];
    six_to_pos(k, ob.n0, sref, pr);
    six_to_pos(k, ob.n0, stab, pt);
    double q = 0, qr = 0;
    for (int c = 0; c < 3; ++c) { d[3 * s + c] = pt[c] - pr[c]; q += d[3 * s + c] * d[3 * s + c]; qr += pr[c] * pr[c]; }
    s2 += q; r2 += qr; mx = std::max(mx, std::sqrt(q));
  }
  std::vector<double> d2;
  for (int s = 1; s + 1 < steps; ++s) { double v = 0; for (int c = 0; c < 3; ++c) { const double dd = d[3 * (s + 1) + c] - 2 * d[3 * s + c] + d[3 * (s - 1) + c]; v += dd * dd; } d2.push_back(std::sqrt(v)); }
  std::nth_element(d2.begin(), d2.begin() + d2.size() / 2, d2.end());
  std::printf("{\"case\":\"%s\",\"n\":%s,\"e\":%s,\"i\":%s,\"class\":%d,\"low\":%d,\"narrowTerms\":%zu,\"fieldRmsM\":%.3f,\"rmsM\":%.4f,\"maxM\":%.4f,\"roughM\":%.5f}\n",
              label, argv[2], argv[3], argv[4], cls, g_low ? 1 : 0, narrow.size(), std::sqrt(r2 / steps), std::sqrt(s2 / steps), mx, d2[d2.size() / 2]);
  return 0;
}
