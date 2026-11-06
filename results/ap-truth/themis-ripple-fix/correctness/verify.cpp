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
static std::vector<H6> g_excluded;
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
      bool excluded = false;
      if (w == 0 && j == 0) { ++left_m; excluded = true; }
      bool ct = false;
      for (int z = 0; z < carried.count; ++z) if (carried.t[z].l == l && carried.t[z].m == m && carried.t[z].p == (l - w) / 2 && carried.t[z].q == j - w) ct = true;
      if (!excluded && ct) { ++left_class; excluded = true; }
      const double psidot = w * o.wdot + j * o.mdot + m * (o.node_rate - kOmegaE);
      if (!excluded && std::fabs(psidot) < tess::kShallowBand * o.n0) { ++left_slow; excluded = true; }
      const cd Ze = (qep.at(w, j) - qem.at(w, j)) / (2 * h), Zi = (qip.at(w, j) - qim.at(w, j)) / (2 * h);
      if (excluded) {
        const cd Ze = (qep.at(w, j) - qem.at(w, j)) / (2 * h), Zi = (qip.at(w, j) - qim.at(w, j)) / (2 * h);
        const cd dVM = cd(0, j) * Z, dVw = cd(0, w) * Z, dVO = cd(0, m) * Z, dVa = -(l + 1) / o.a0 * Z;
        const double eta = o.eta, na2 = o.na2, e0 = o.e0, si = o.si, c0 = o.c0, n0 = o.n0, a0 = o.a0;
        H6 x{m, w, j, {2.0 / (n0 * a0) * dVM, eta * eta / (na2 * e0) * dVM - eta / (na2 * e0) * dVw, c0 / (na2 * eta * si) * dVw - 1.0 / (na2 * eta * si) * dVO,
                       1.0 / (na2 * eta * si) * Zi, eta / (na2 * e0) * Ze - c0 / (na2 * eta * si) * Zi, -2.0 / (n0 * a0) * dVa - eta * eta / (na2 * e0) * Ze}};
        g_excluded.push_back(x);
        continue;
      }
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

// The closed-form family re-sum: per (m, w), the six-component displacement on NE uniform eccentric anomalies from the family's forcing
// (sum over l of A F (Cbar - i Sbar) (a/r)^(l+1) e^{iwf}, its M, e, i and a derivatives) by Lagrange's equations and the operator
// H = e^{-i nu e sin E} IFFT(FFT(R (1 - e cos E) e^{i nu e sin E}) / (i (k - nu))) / mdot, the left-out harmonics subtracted.
static std::map<std::pair<int, int>, std::vector<cd>> closed_form(const Orbit& o, int NE) {
  const double a = o.a0, e = o.e0, eta = o.eta, n = o.n0, si = o.si, c = o.c0, na2 = o.na2, mdot = o.mdot;
  std::vector<double> E(NE), M(NE), cf(NE), sf(NE), ar(NE), sE(NE);
  for (int k = 0; k < NE; ++k) {
    E[k] = kTwoPi * k / NE; M[k] = E[k] - e * std::sin(E[k]); sE[k] = std::sin(E[k]);
    ar[k] = 1.0 / (1.0 - e * std::cos(E[k]));
    cf[k] = (std::cos(E[k]) - e) * ar[k]; sf[k] = eta * std::sin(E[k]) * ar[k];
  }
  std::map<std::pair<int, int>, std::vector<cd>> out;
  double f[72], fp[72], fm[72];
  const double hI = 1e-5;
  for (int m = 1; m <= 12; ++m) for (int w = -12; w <= 12; ++w) {
    // forcing: g' (d/dM), g, g_e, g_i, g_a on the E nodes
    std::vector<cd> gM(NE, 0.0), g(NE, 0.0), ge(NE, 0.0), gi(NE, 0.0), ga(NE, 0.0);
    bool any = false;
    for (int l = std::max(m, std::max(2, std::abs(w))); l <= 12; ++l) {
      if (((l - w) & 1) != 0) continue;
      tess::normalized_Fk(m, w, l, o.i0, f); tess::normalized_Fk(m, w, l, o.i0 + hI, fp); tess::normalized_Fk(m, w, l, o.i0 - hI, fm);
      const double F = f[l], dF = (fp[l] - fm[l]) / (2 * hI);
      if (F == 0.0 && dF == 0.0) continue;
      any = true;
      const bool odd = ((l - m) & 1) != 0;
      const cd S = odd ? cd(-tess::kEgmS[l][m], -tess::kEgmC[l][m]) : cd(tess::kEgmC[l][m], -tess::kEgmS[l][m]);
      const double A = kMu * std::pow(1.0 / a, l + 1);
      const int kk = l + 1;
      for (int q = 0; q < NE; ++q) {
        const cd ewf = std::pow(cd(cf[q], sf[q]), w);
        const double ark = std::pow(ar[q], kk);
        const cd base = A * S * ark * ewf;
        g[q] += F * base;
        gi[q] += dF * base;
        ga[q] += -(l + 1) / a * F * base;
        ge[q] += F * base * cd((l + 1) * ar[q] * cf[q], w * sf[q] * (2.0 + e * cf[q]) / (eta * eta));
        gM[q] += F * base * ar[q] * ar[q] * cd(-kk * e * sE[q], w * eta);
      }
    }
    if (!any) continue;
    // left-out harmonics of this family, in rate form
    std::vector<cd> R[6];
    for (int z = 0; z < 6; ++z) R[z].assign(NE, 0.0);
    for (int q = 0; q < NE; ++q) {
      R[0][q] = 2.0 / (n * a) * gM[q];
      R[1][q] = eta * eta / (na2 * e) * gM[q] - eta / (na2 * e) * cd(0, w) * g[q];
      R[2][q] = c / (na2 * eta * si) * cd(0, w) * g[q] - 1.0 / (na2 * eta * si) * cd(0, m) * g[q];
      R[3][q] = 1.0 / (na2 * eta * si) * gi[q];
      R[4][q] = eta / (na2 * e) * ge[q] - c / (na2 * eta * si) * gi[q];
      R[5][q] = -2.0 / (n * a) * ga[q] - eta * eta / (na2 * e) * ge[q];
    }
    for (const H6& x : g_excluded) if (x.m == m && x.w == w) for (int q = 0; q < NE; ++q) { const cd ph = std::polar(1.0, x.j * M[q]); for (int z = 0; z < 6; ++z) R[z][q] -= x.c[z] * ph; }
    const double nu = -(w * o.wdot + m * (o.node_rate - kOmegaE)) / mdot;
    auto op = [&](const std::vector<cd>& r) {
      std::vector<cd> p(NE);
      for (int q = 0; q < NE; ++q) p[q] = r[q] * (1.0 - e * std::cos(E[q])) * std::polar(1.0, nu * e * sE[q]);
      fft(p);
      for (int k = 0; k < NE; ++k) { const int kf = k < NE / 2 ? k : k - NE; p[k] /= cd(0, kf - nu) * double(NE); }
      // inverse FFT by conjugation
      for (auto& v : p) v = std::conj(v);
      fft(p);
      for (int q = 0; q < NE; ++q) p[q] = std::conj(p[q]) * std::polar(1.0, -nu * e * sE[q]) / mdot;
      return p;
    };
    std::vector<cd> D[6];
    for (int z = 0; z < 6; ++z) D[z] = op(R[z]);
    std::vector<cd> extra(NE);
    for (int q = 0; q < NE; ++q) extra[q] = -1.5 * n / a * D[0][q];
    const std::vector<cd> dMx = op(extra);
    auto& v = out[{m, w}];
    v.assign(6 * NE, 0.0);
    for (int q = 0; q < NE; ++q) {
      const cd da = D[0][q], de = D[1][q], di = D[2][q], dO = D[3][q], dw = D[4][q], dM = D[5][q] + dMx[q];
      const cd six[6] = {-1.5 * n / a * da, de, di, e * (dw + dO), si * dO, dM + dw + dO};
      for (int z = 0; z < 6; ++z) v[z * NE + q] = six[z];
    }
  }
  return out;
}
int main(int argc, char** argv) {
  const char* label = argv[1];
  const double n0 = std::atof(argv[2]) * kTwoPi / kMinutesPerDay, e0 = std::atof(argv[3]), i0 = std::atof(argv[4]) * kDeg;
  const double O0 = std::atof(argv[5]) * kDeg, w0 = std::atof(argv[6]) * kDeg, M0 = std::atof(argv[7]) * kDeg, d50 = std::atof(argv[8]);
  const int cls = res::band_of(n0);
  const Orbit ob = orbit(n0, e0, i0);
  const std::vector<H6> base = harmonics(ob, cls);
  constexpr int NS = 1024;
  std::map<std::pair<int, int>, std::vector<cd>> fam;
  std::vector<double> Mg(NS);
  for (int q = 0; q < NS; ++q) { const double E = kTwoPi * q / NS; Mg[q] = E - e0 * std::sin(E); }
  for (const H6& q : base) {
    auto& v = fam[{q.m, q.w}];
    if (v.empty()) v.assign(6 * NS, cd(0));
    for (int s = 0; s < NS; ++s) { const cd ph = std::polar(1.0, q.j * Mg[s]); for (int k = 0; k < 6; ++k) v[k * NS + s] += q.c[k] * ph; }
  }
  const double theta_g0 = gsto_afspc(d50);
  const int steps = 7 * 288 + 1;
  auto kep_at = [&](double t) { return Kepler{ob.a0, ob.e0, ob.i0, wrap(O0 + ob.node_rate * t), wrap(w0 + ob.wdot * t), wrap(M0 + ob.mdot * t)}; };
  std::vector<double> trRef(3 * steps);
  for (int s = 0; s < steps; ++s) {
    const double t = 5.0 * s; const Kepler k = kep_at(t); const double beta = k.node - (theta_g0 + kOmegaE * t);
    double six[6] = {0, 0, 0, 0, 0, 0};
    for (const H6& q : base) { const cd ph = std::polar(1.0, q.w * k.argp + q.j * k.m + q.m * beta); for (int z = 0; z < 6; ++z) six[z] += std::real(q.c[z] * ph); }
    six_to_pos(k, ob.n0, six, &trRef[3 * s]);
  }
  std::printf("{\"window\":\"%s\",\"excluded\":%zu,\"rows\":[", label, g_excluded.size());
  bool first = true;
  {
    // the module's own grid (src/tesseral.inc wide_grid_build, wide_six) against the same quadrature, at the base elements
    tess::WideGrid g{};
    const auto t0 = std::chrono::steady_clock::now();
    const bool ok = tess::wide_grid_build(12, cls, ob.n0, ob.e0, ob.i0, g);
    const double ms = 1e3 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    std::vector<double> tr(3 * steps);
    const auto t1 = std::chrono::steady_clock::now();
    for (int s = 0; s < steps; ++s) {
      const double t = 5.0 * s; const Kepler k = kep_at(t);
      double six[6] = {0, 0, 0, 0, 0, 0};
      tess::wide_six(g, t, k, theta_g0, six);
      six_to_pos(k, ob.n0, six, &tr[3 * s]);
    }
    const double us = 1e6 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t1).count() / steps;
    double s2 = 0, mx = 0; std::vector<double> d2, o2;
    for (int s = 0; s < steps; ++s) { double q = 0; for (int c = 0; c < 3; ++c) q += std::pow(tr[3 * s + c] - trRef[3 * s + c], 2); s2 += q; mx = std::max(mx, std::sqrt(q)); }
    for (int s = 1; s + 1 < steps; ++s) { double q = 0, p = 0; for (int c = 0; c < 3; ++c) { const double dd = (tr[3*(s+1)+c]-trRef[3*(s+1)+c]) - 2*(tr[3*s+c]-trRef[3*s+c]) + (tr[3*(s-1)+c]-trRef[3*(s-1)+c]); q += dd*dd; const double oo = tr[3*(s+1)+c] - 2*tr[3*s+c] + tr[3*(s-1)+c]; p += oo*oo; } d2.push_back(std::sqrt(q)); o2.push_back(std::sqrt(p)); }
    std::nth_element(d2.begin(), d2.begin() + d2.size() / 2, d2.end());
    std::nth_element(o2.begin(), o2.begin() + o2.size() / 2, o2.end());
    std::printf("\"module\":{\"ok\":%d,\"families\":%d,\"bytes\":%zu,\"buildMs\":%.1f,\"usPerStep\":%.2f,\"rmsM\":%.4f,\"maxM\":%.4f,\"roughDiffM\":%.5f,\"outputRoughM\":%.4f},",
                ok, g.count, static_cast<size_t>(g.count) * 4 * 6 * tess::kGridN * 2 * sizeof(float), ms, us, std::sqrt(s2 / steps), mx, d2[d2.size() / 2], o2[o2.size() / 2]);
    // small divisors: each family's nu and its distance from the nearest integer; the largest family amplitude (lambda x a, m)
    double dmin = 1e9, amax = 0; int dm = 0, dw = 0, am = 0, aw = 0; double dnu = 0;
    for (int f = 0; f < g.count; ++f) {
      const int m = g.m[f], w = g.w[f];
      const double nu = -(w * ob.wdot + m * (ob.node_rate - kOmegaE)) / ob.mdot, d = std::fabs(nu - std::round(nu));
      if (d < dmin) { dmin = d; dm = m; dw = w; dnu = nu; }
      const size_t per = static_cast<size_t>(6) * tess::kGridN * 2;
      for (int k = 0; k < tess::kGridN; ++k) {
        const float* v = g.v + static_cast<size_t>(f) * 4 * per + (5 * tess::kGridN + k) * 2;
        const double amp = std::hypot(v[0], v[1]) * ob.a0 * kRe * 1000.0;
        if (amp > amax) { amax = amp; am = m; aw = w; }
      }
    }
    std::printf("\"divisor\":{\"family\":[%d,%d],\"nu\":%.5f,\"distance\":%.5f,\"psidotOverN\":%.5f},\"largestLambdaAmplitudeM\":{\"family\":[%d,%d],\"m\":%.1f},",
                dm, dw, dnu, dmin, dmin * ob.mdot / ob.n0, am, aw, amax);
    tess::wide_grid_release(g);
  }
  for (int NE : {256}) {
    const auto t0 = std::chrono::steady_clock::now();
    const auto cfm = closed_form(ob, NE);
    const double ms = 1e3 * std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
    // grid agreement at the common nodes (every NS/NE-th of the harmonic-sum grid, or every NE/NS-th of the closed form)
    double dmax = 0, vmax = 0;
    for (auto& [key, v] : fam) {
      auto it = cfm.find(key);
      for (int z = 0; z < 6; ++z) for (int s = 0; s < std::min(NS, NE); ++s) {
        const int a1 = NS >= NE ? s * (NS / NE) : s, a2 = NE >= NS ? s * (NE / NS) : s;
        const cd ref = v[z * NS + a1], got = it == cfm.end() ? cd(0) : it->second[z * NE + a2];
        vmax = std::max(vmax, std::abs(ref)); dmax = std::max(dmax, std::abs(ref - got));
      }
    }
    // position check: cubic at N = 128 from the closed form's grid
    const int N = 128, stride = NE / N;
    std::vector<double> tr(3 * steps);
    for (int s = 0; s < steps; ++s) {
      const double t = 5.0 * s; const Kepler k = kep_at(t);
      double E = k.m;
      for (int it = 0; it < 60; ++it) { const double d = (E - k.e * std::sin(E) - k.m) / (1 - k.e * std::cos(E)); E -= d; if (std::fabs(d) < 1e-15) break; }
      const double beta = k.node - (theta_g0 + kOmegaE * t);
      const double x = wrap(E) / kTwoPi * N; int i1 = int(std::floor(x)); const double u = x - i1;
      const int i0_ = (i1 - 1 + N) % N, i2 = (i1 + 1) % N, i3 = (i1 + 2) % N; i1 %= N;
      const double w0_ = -u * (u - 1) * (u - 2) / 6, w1 = (u + 1) * (u - 1) * (u - 2) / 2, w2 = -(u + 1) * u * (u - 2) / 2, w3 = (u + 1) * u * (u - 1) / 6;
      double six[6] = {0, 0, 0, 0, 0, 0};
      for (auto& [key, c] : cfm) { const cd ph = std::polar(1.0, key.second * k.argp + key.first * beta); for (int z = 0; z < 6; ++z) { const cd* r = &c[z * NE]; six[z] += std::real(ph * (w0_ * r[i0_ * stride] + w1 * r[i1 * stride] + w2 * r[i2 * stride] + w3 * r[i3 * stride])); } }
      six_to_pos(k, ob.n0, six, &tr[3 * s]);
    }
    double s2 = 0, mx = 0; std::vector<double> d2;
    for (int s = 0; s < steps; ++s) { double q = 0; for (int c = 0; c < 3; ++c) q += std::pow(tr[3 * s + c] - trRef[3 * s + c], 2); s2 += q; mx = std::max(mx, std::sqrt(q)); }
    for (int s = 1; s + 1 < steps; ++s) { double q = 0; for (int c = 0; c < 3; ++c) { const double dd = (tr[3*(s+1)+c]-trRef[3*(s+1)+c]) - 2*(tr[3*s+c]-trRef[3*s+c]) + (tr[3*(s-1)+c]-trRef[3*(s-1)+c]); q += dd*dd; } d2.push_back(std::sqrt(q)); }
    std::nth_element(d2.begin(), d2.begin() + d2.size() / 2, d2.end());
    std::printf("%s{\"NE\":%d,\"families\":%zu,\"buildMs\":%.1f,\"gridMaxDiffRel\":%.3e,\"cubic128\":{\"rmsM\":%.4f,\"maxM\":%.4f,\"roughDiffM\":%.5f}}", first ? "" : ",", NE, cfm.size(), ms, dmax / vmax, std::sqrt(s2 / steps), mx, d2[d2.size() / 2]);
    first = false;
  }
  std::printf("]}\n");
  return 0;
}
