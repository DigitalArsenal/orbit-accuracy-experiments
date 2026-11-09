#!/usr/bin/env node
/**
 * Compiles wasm/sdn-ap-tides.wasm in memory from propagator/sdn-ap@0.6.5 sources (zero tracked repo edits),
 * adding IERS 2010 nominal degree-2 solid-Earth Sun/Moon Love tidal accelerations (k2 = 0.3012)
 * across both LEO orbit-averaged AP rates (third_body_tail) and MEO/HEO/GEO Gauss AP rates.
 */
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODULES_ROOT =
  process.env.SDN_MODULES_ROOT || new URL("../../../../repos/main-packages/space-data-network-modules", import.meta.url).pathname;
const PACKAGE_ROOT = path.join(MODULES_ROOT, "propagator/sdn-ap");
const OUT_DIR = path.join(__dirname, "wasm");
const OUT_WASM = path.join(OUT_DIR, "sdn-ap-tides.wasm");

const require = createRequire(path.join(PACKAGE_ROOT, "package.json"));
const { compileModuleFromSource, ModuleThreadModel } = await import("space-data-module-sdk/compiler");
const { FlatcRunner } = await import("flatc-wasm");
const sdsRoot = path.dirname(require.resolve("spacedatastandards.org/package.json"));

function replaceExact(src, label, target, replacement) {
  if (!src.includes(target)) {
    throw new Error(`Patch target '${label}' not found`);
  }
  return src.replace(target, replacement);
}

async function oemBindings() {
  const files = {};
  const deps = new Map();
  const pending = ["OEM", "OMM", "OCM", "PCF", "MNV", "SPW", "DCL", "ODR"];
  while (pending.length) {
    const code = pending.pop();
    if (deps.has(code)) continue;
    const text = await fs.readFile(path.join(sdsRoot, "schema", code, "main.fbs"), "utf8");
    files[`/sds/${code}/main.fbs`] = text;
    const includes = [...text.matchAll(/include "\.\.\/([A-Z0-9]+)\/main\.fbs"/g)].map((m) => m[1]);
    deps.set(code, includes);
    pending.push(...includes);
  }
  const order = [];
  const visit = (code) => {
    if (order.includes(code)) return;
    for (const dep of deps.get(code)) visit(dep);
    order.push(code);
  };
  for (const code of ["OEM", "OMM", "OCM", "PCF", "MNV", "SPW", "DCL", "ODR"]) visit(code);
  const flatc = await FlatcRunner.init();
  return order
    .map((code) => {
      const generated = flatc.generateCode({ entry: `/sds/${code}/main.fbs`, files }, "cpp", {
        genObjectApi: false,
      })["main_generated.h"];
      return generated
        .replaceAll("FLATBUFFERS_GENERATED_MAIN_H_", `FLATBUFFERS_GENERATED_SDS_${code}_MAIN_H_`)
        .replace(/^#include "main_generated\.h"\s*$/gm, "");
    })
    .join("\n");
}

async function nrlmsise() {
  const dir = path.join(MODULES_ROOT, "third_party/nrlmsise00");
  const text = {};
  for (const name of ["nrlmsise-00.h", "nrlmsise-00_data.c", "nrlmsise-00.c"]) {
    text[name] = (await fs.readFile(path.join(dir, name))).toString("latin1");
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

async function erfa() {
  const dir = path.join(MODULES_ROOT, "higherpop/third_party/erfa");
  const headers = ["erfa.h", "erfam.h", "erfaextra.h", "erfadatextra.h"];
  const sources = [
    "anp.c", "bpn2xy.c", "cal2jd.c", "dat.c", "eors.c", "era00.c", "erfadatextra.c",
    "fad03.c", "fae03.c", "faf03.c", "faju03.c", "fal03.c", "falp03.c", "fama03.c",
    "fame03.c", "faom03.c", "fapa03.c", "fasa03.c", "faur03.c", "fave03.c", "fw2m.c",
    "gst06.c", "ir.c", "jd2cal.c", "nut00a.c", "nut06a.c", "obl06.c", "pfw06.c",
    "pnm06a.c", "rx.c", "rz.c", "s06.c", "taitt.c", "utctai.c",
  ];
  const hTxt = await Promise.all(
    headers.map(async (h) =>
      (await fs.readFile(path.join(dir, h), "utf8")).replace(/^#include\s+"erfa[^"]*"\s*$/gm, "")
    )
  );
  const cTxt = await Promise.all(
    sources.map(async (c) =>
      (await fs.readFile(path.join(dir, c), "utf8")).replace(/^#include\s+"erfa[^"]*"\s*$/gm, "")
    )
  );
  return ['extern "C" {', ...hTxt, ...cTxt, "}"].join("\n");
}

async function gravity() {
  const bytes = await fs.readFile(path.join(MODULES_ROOT, "propagator/ffm/lib/egm96_data.h"), "utf8");
  const C = Array.from({ length: 71 }, () => new Array(71).fill("0.0"));
  const S = Array.from({ length: 71 }, () => new Array(71).fill("0.0"));
  for (const m of bytes.matchAll(/\{\s*(\d+),\s*(\d+),\s*([-+0-9.eE]+),\s*([-+0-9.eE]+)\s*\}/g)) {
    const n = Number(m[1]), k = Number(m[2]);
    if (n <= 70 && k <= n) {
      C[n][k] = m[3];
      S[n][k] = m[4];
    }
  }
  const rows = (A) => A.map((r) => `    {${r.join(", ")}},`).join("\n");
  return `inline constexpr double kEgmC[71][71] = {\n${rows(C)}\n};\ninline constexpr double kEgmS[71][71] = {\n${rows(S)}\n};\n`;
}

const abiHeader = await fs.readFile(
  require.resolve("space-data-module-sdk/include/orbpro/orbpro_propagator_abi.h"),
  "utf8"
);
const source = await fs.readFile(path.join(PACKAGE_ROOT, "src/sdn_ap_module.cpp"), "utf8");
const partPattern = /^#include "([a-z0-9_]+\.inc)"\n/gm;
const sharedParts = new Map(
  ["sgp4_core.inc", "model.inc"].map((name) => [
    name,
    path.join(MODULES_ROOT, "foundation/sgp4-str3/src", name),
  ])
);
const parts = new Map();
let inlined = source;
for (let depth = 0; partPattern.test(inlined); ++depth) {
  partPattern.lastIndex = 0;
  for (const [, name] of inlined.matchAll(partPattern)) {
    if (!parts.has(name)) {
      let txt = await fs.readFile(sharedParts.get(name) ?? path.join(PACKAGE_ROOT, "src", name), "utf8");
      if (name === "xp_theory.inc") {
        // Patch 1: Add solid_tide_accel helper right after third_body_accel
        txt = replaceExact(
          txt,
          "solid_tide_accel",
          `inline Vec3 third_body_accel(Vec3 r, Vec3 su, double sr, double mass_ratio) {
  const double mu_b = mass_ratio * kMu;
  const Vec3 sv = sr * su;
  const Vec3 d = sv - r;
  const double dn = norm(d);
  return mu_b * ((1.0 / (dn * dn * dn)) * d - (1.0 / (sr * sr * sr)) * sv);
}`,
          `inline Vec3 third_body_accel(Vec3 r, Vec3 su, double sr, double mass_ratio) {
  const double mu_b = mass_ratio * kMu;
  const Vec3 sv = sr * su;
  const Vec3 d = sv - r;
  const double dn = norm(d);
  return mu_b * ((1.0 / (dn * dn * dn)) * d - (1.0 / (sr * sr * sr)) * sv);
}

/// IERS 2010 nominal degree-2 solid-Earth Love tidal acceleration at r (ER/min^2; R_E = 1).
inline Vec3 solid_tide_accel(Vec3 r, Vec3 su, double sr, double mass_ratio) {
  constexpr double k2Love = 0.3012;
  const double r2 = dot(r, r);
  const double rn = std::sqrt(r2);
  if (!(rn > 1.0)) return {0.0, 0.0, 0.0};
  const Vec3 rh = (1.0 / rn) * r;
  const double gam = dot(rh, su);
  const double fac = 1.5 * k2Love * (mass_ratio * kMu) / (sr * sr * sr * r2 * r2);
  return fac * ((1.0 - 5.0 * gam * gam) * rh + (2.0 * gam) * su);
}

/// IERS 2010 Sec. 6.2.2 permanent zonal tide removal (dJ2_perm = +9.357e-9 for k20 = 0.3012) so J2 is not double-counted.
inline Vec3 solid_tide_perm_bias_accel(Vec3 r) {
  constexpr double dJ2Perm = 9.357e-9;
  const double r2 = dot(r, r);
  const double rn = std::sqrt(r2);
  if (!(rn > 1.0)) return {0.0, 0.0, 0.0};
  const double zu = r.z / rn;
  const double fac = -1.5 * kMu * dJ2Perm / (r2 * r2 * rn);
  return {fac * (1.0 - 5.0 * zu * zu) * r.x,
          fac * (1.0 - 5.0 * zu * zu) * r.y,
          fac * (3.0 - 5.0 * zu * zu) * r.z};
}`
        );

        // Patch 2: Include solid_tide_accel in lp_third_body_gauss_ap (MEO/HEO/GEO AP rates)
        txt = replaceExact(
          txt,
          "lp_third_body_gauss_ap_tides",
          `  const double df = (c_dir_s * ds_f - c_ind_s * xs0) + (c_dir_m * dm_f - c_ind_m * xm0);
  const double dg = (c_dir_s * ds_g - c_ind_s * ys0) + (c_dir_m * dm_g - c_ind_m * ym0);
  const double W = (c_dir_s - c_ind_s) * zs0 + (c_dir_m - c_ind_m) * zm0;

  const double xu = X * inv_rn, yu = Y * inv_rn;`,
          `  const double xu = X * inv_rn, yu = Y * inv_rn;
  // IERS 2010 degree-2 solid-Earth Love tides (k2 = 0.3012, R_E = 1)
  const double inv_sr = 1.0 / b.sun_r, inv_mr = 1.0 / b.moon_r;
  const double gam_s = (xu * xs0 + yu * ys0) * inv_sr;
  const double gam_m = (xu * xm0 + yu * ym0) * inv_mr;
  const double inv_r4 = inv_rn * inv_rn * inv_rn * inv_rn;
  const double tf_s = 1.5 * 0.3012 * c_ind_s * inv_r4;
  const double tf_m = 1.5 * 0.3012 * c_ind_m * inv_r4;
  const double t_rad_s = tf_s * (1.0 - 5.0 * gam_s * gam_s), t_u_s = tf_s * 2.0 * gam_s * inv_sr;
  const double t_rad_m = tf_m * (1.0 - 5.0 * gam_m * gam_m), t_u_m = tf_m * 2.0 * gam_m * inv_mr;

  const double df = (c_dir_s * ds_f - c_ind_s * xs0) + (c_dir_m * dm_f - c_ind_m * xm0)
                  + (t_rad_s + t_rad_m) * xu + t_u_s * xs0 + t_u_m * xm0;
  const double dg = (c_dir_s * ds_g - c_ind_s * ys0) + (c_dir_m * dm_g - c_ind_m * ym0)
                  + (t_rad_s + t_rad_m) * yu + t_u_s * ys0 + t_u_m * ym0;
  const double W = (c_dir_s - c_ind_s) * zs0 + (c_dir_m - c_ind_m) * zm0
                 + t_u_s * zs0 + t_u_m * zm0;`
        );

        // Patch 3: Include solid_tide_accel in SIMD lp_tb_gauss_pair_f64x2
        txt = replaceExact(
          txt,
          "lp_tb_gauss_pair_f64x2_tides",
          `  const F64x2 vdf = (vc_dir_s * vds_f - c_ind_s * vxs0) + (vc_dir_m * vdm_f - c_ind_m * vxm0);
  const F64x2 vdg = (vc_dir_s * vds_g - c_ind_s * vys0) + (vc_dir_m * vdm_g - c_ind_m * vym0);
  const F64x2 vW = (vc_dir_s - c_ind_s) * vzs0 + (vc_dir_m - c_ind_m) * vzm0;

  const F64x2 vxu = vX * vinv_rn, vyu = vY * vinv_rn;`,
          `  const F64x2 vxu = vX * vinv_rn, vyu = vY * vinv_rn;
  const double inv_sr = 1.0 / b.sun_r, inv_mr = 1.0 / b.moon_r;
  const F64x2 vgam_s = (vxu * vxs0 + vyu * vys0) * inv_sr;
  const F64x2 vgam_m = (vxu * vxm0 + vyu * vym0) * inv_mr;
  const F64x2 vinv_r4 = vinv_rn * vinv_rn * vinv_rn * vinv_rn;
  const F64x2 vtf_s = (1.5 * 0.3012 * c_ind_s) * vinv_r4;
  const F64x2 vtf_m = (1.5 * 0.3012 * c_ind_m) * vinv_r4;
  const F64x2 vtrad = vtf_s * (1.0 - 5.0 * vgam_s * vgam_s) + vtf_m * (1.0 - 5.0 * vgam_m * vgam_m);
  const F64x2 vtus = vtf_s * (2.0 * inv_sr) * vgam_s;
  const F64x2 vtum = vtf_m * (2.0 * inv_mr) * vgam_m;

  const F64x2 vdf = (vc_dir_s * vds_f - c_ind_s * vxs0) + (vc_dir_m * vdm_f - c_ind_m * vxm0)
                  + vtrad * vxu + vtus * vxs0 + vtum * vxm0;
  const F64x2 vdg = (vc_dir_s * vds_g - c_ind_s * vys0) + (vc_dir_m * vdm_g - c_ind_m * vym0)
                  + vtrad * vyu + vtus * vys0 + vtum * vym0;
  const F64x2 vW = (vc_dir_s - c_ind_s) * vzs0 + (vc_dir_m - c_ind_m) * vzm0
                 + vtus * vzs0 + vtum * vzm0;`
        );

        // Patch 4: Include orbit-averaged solid_tide_accel in third_body_tail (LEO AP rates)
        txt = replaceExact(
          txt,
          "third_body_tail_tides",
          `  for (int m = 0; m < 6; ++m) {
    double sum = 0.0;
    for (int j = 0; j < kThirdBodyTailNodes; ++j) sum += s.w[j] * s.f[m][j];
    out[m] += sum * kInvN;
  }
#endif
}`,
          `  for (int m = 0; m < 6; ++m) {
    double sum = 0.0;
    for (int j = 0; j < kThirdBodyTailNodes; ++j) sum += s.w[j] * s.f[m][j];
    out[m] += sum * kInvN;
  }
#endif
  // Add 8-node orbit-averaged IERS 2010 degree-2 solid-Earth Love tidal Gauss rates for LEO AP
  constexpr int kTideNodes = 8;
  for (int q = 0; q < kTideNodes; ++q) {
    const double Fq = (q + 0.5) * (kTwoPi / kTideNodes);
    Vec3 rq, vq;
    double roa_q = 1.0;
    state_at_F(y, fr, Fq, rq, vq, roa_q);
    const Vec3 dtide = solid_tide_accel(rq, b.sun_u, b.sun_r, kSunMass) +
                       solid_tide_accel(rq, b.moon_u, b.moon_r, kMoonMass) -
                       solid_tide_perm_bias_accel(rq);
    double gt[6];
    gauss(y, fr, rq, vq, dtide, gt);
    const double wq = roa_q * (1.0 / kTideNodes);
    for (int m = 0; m < 6; ++m) out[m] += wq * gt[m];
  }
}`
        );

        // Patch 5: Also include solid_tide_accel in fallback third_body_accel call (high-inclination near-polar fallback)
        txt = replaceExact(
          txt,
          "fallback_tb_tides",
          `        const Vec3 d = third_body_accel(r, b.sun_u, b.sun_r, kSunMass) +
                       third_body_accel(r, b.moon_u, b.moon_r, kMoonMass);`,
          `        const Vec3 d = third_body_accel(r, b.sun_u, b.sun_r, kSunMass) +
                       third_body_accel(r, b.moon_u, b.moon_r, kMoonMass) +
                       solid_tide_accel(r, b.sun_u, b.sun_r, kSunMass) +
                       solid_tide_accel(r, b.moon_u, b.moon_r, kMoonMass) -
                       solid_tide_perm_bias_accel(r);`
        );
      }
      parts.set(name, txt);
    }
  }
  inlined = inlined.replace(partPattern, (_, name) => parts.get(name));
}

const sourceCode = inlined
  .replace('#include "orbpro/orbpro_propagator_abi.h"', abiHeader)
  .replace('#include "oem_generated.h"', await oemBindings())
  .replace('#include "nrlmsise00.h"', await nrlmsise())
  .replace('#include "gravity_egm.h"', await gravity())
  .replace('#include "erfa_pinned.h"', await erfa())
  .replace(
    '#include "sds_cid.hpp"',
    await fs.readFile(path.join(MODULES_ROOT, "common/sds_cid.hpp"), "utf8")
  );

const manifest = JSON.parse(
  await fs.readFile(path.join(PACKAGE_ROOT, "plugin-manifest.json"), "utf8")
);
await fs.mkdir(OUT_DIR, { recursive: true });

console.log("Compiling wasm/sdn-ap-tides.wasm (in-memory IERS 2010 k2 solid-Earth tides)...");
const compilation = await compileModuleFromSource({
  manifest,
  sourceCode,
  language: "c++",
  outputPath: OUT_WASM,
  threadModel: ModuleThreadModel.EMSCRIPTEN_PTHREADS,
});

if (!compilation.report?.ok) {
  const issues = (compilation.report?.issues ?? []).map((i) =>
    [i.severity, i.code, i.message].filter(Boolean).join(" ")
  );
  throw new Error(`sdn-ap-tides compile failed:\n${issues.join("\n")}`);
}

const sha = createHash("sha256").update(compilation.wasmBytes).digest("hex");
console.log(
  `Built ${OUT_WASM} (${compilation.wasmBytes.length} bytes, sha256=${sha.slice(0, 16)}...)`
);
