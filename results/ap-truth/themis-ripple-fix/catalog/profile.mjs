// Amendment 14.1: the grid build's wall in wasm, by part. A scratch copy of propagator/sdn-ap with a timing export (never the
// shipped source). node profile.mjs <modules checkout> <scratch dir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [modules, scratch] = process.argv.slice(2);
const packageRoot = path.join(modules, 'propagator/sdn-ap');
const tree = path.join(scratch, 'profile'), copy = path.join(tree, 'propagator/sdn-ap');
fs.rmSync(tree, { recursive: true, force: true });
fs.cpSync(packageRoot, copy, { recursive: true, filter: (p) => !/\/(node_modules|test|dist|\.build)(\/|$)/.test(p.slice(packageRoot.length)) });
const EXPORT = String.raw`
SDNAP_EXPORT("sdnap_test_grid_profile")
int32_t sdnap_test_grid_profile(const double* in, double* out) {
  using namespace sdnap;
  using namespace sdnap::xpt;
  const double n0 = in[0] * kTwoPi / kMinutesPerDay, e0 = in[1], i0 = in[2] * kDeg;
  const int reps = static_cast<int>(in[3]), cls = res::band_of(n0);
  const auto now = [] { return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count(); };
  // whole build (four family sets), one family set, and the allocation alone
  double t0 = now();
  for (int r = 0; r < reps; ++r) { tess::WideGrid g{}; tess::wide_grid_build(12, cls, n0, e0, i0, g); tess::wide_grid_release(g); }
  out[0] = (now() - t0) / reps;
  const size_t per = static_cast<size_t>(6) * tess::kGridN * 2, cap = 12 * 25;
  double* s = static_cast<double*>(std::malloc(cap * per * sizeof(double)));
  int8_t fm[400], fw[400];
  t0 = now();
  for (int r = 0; r < reps; ++r) tess::wide_families(12, cls, n0, e0, i0, fm, fw, s);
  out[1] = (now() - t0) / reps;
  t0 = now();
  for (int r = 0; r < reps; ++r) { void* a = std::malloc(cap * per * sizeof(double)); void* b = std::malloc(cap * per * sizeof(double)); void* c = std::malloc(cap * 4 * per * sizeof(float)); std::memset(a, 0, 8); std::free(a); std::free(b); std::free(c); }
  out[2] = (now() - t0) / reps;
  std::free(s);
  // the FFT integrals alone: 7 transforms pairs per family, 288 families
  double re[tess::kGridNE], im[tess::kGridNE];
  for (int k = 0; k < tess::kGridNE; ++k) { re[k] = std::sin(k * 0.1); im[k] = std::cos(k * 0.3); }
  t0 = now();
  for (int r = 0; r < reps; ++r) for (int f = 0; f < 288 * 7; ++f) { tess::fft_inplace(re, im, tess::kGridNE, false); tess::fft_inplace(re, im, tess::kGridNE, true); }
  out[3] = (now() - t0) / reps;
  // the left-out harmonics' trapezoid: 105 harmonics x 256 nodes x (pow, cos, sin)
  double acc = 0.0;
  t0 = now();
  for (int r = 0; r < reps; ++r) for (int h = 0; h < 105; ++h) for (int k = 0; k < tess::kGridNE; ++k) { const double ph = 0.3 * k + h; acc += std::pow(1.0 + 0.01 * k, 6) * std::cos(ph) + std::sin(ph); }
  out[4] = (now() - t0) / reps;
  out[5] = acc;
  return 0;
}
`;
const abi = path.join(copy, 'src/abi.inc'), text = fs.readFileSync(abi, 'utf8'), anchor = 'SDNAP_EXPORT("sdnap_frame_probe")';
fs.writeFileSync(abi, text.replace(anchor, `${EXPORT}\n${anchor}`));
const mod = path.join(copy, 'src/sdn_ap_module.cpp');
fs.writeFileSync(mod, fs.readFileSync(mod, 'utf8').replace('#include <algorithm>', '#include <algorithm>\n#include <chrono>'));
fs.symlinkSync(path.join(packageRoot, 'node_modules'), path.join(copy, 'node_modules'));
fs.symlinkSync(path.join(modules, 'foundation'), path.join(tree, 'foundation'));
try {
  execFileSync(process.execPath, ['build.mjs'], { cwd: copy, stdio: 'ignore', env: { ...process.env, SPACE_DATA_NETWORK_MODULES_ROOT: modules, SDNAP_DIST_DIR: path.join(tree, 'dist') } });
} finally {
  fs.unlinkSync(path.join(copy, 'node_modules'));
  fs.unlinkSync(path.join(tree, 'foundation'));
}
const entry = createRequire(path.join(packageRoot, 'package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const h = await createStandaloneHarness('browser', path.join(tree, 'dist/isomorphic/module.wasm'), { surface: 'direct' });
const x = h.instance.exports, pin = x.sdnap_alloc(64), pout = x.sdnap_alloc(64);
new Float64Array(h.memory.buffer, pin, 4).set([1.0499037196959449, 0.8221736866449335, 8.132697128525981, 5]);
if (x.sdnap_test_grid_profile(pin, pout) !== 0) throw new Error('profile export failed');
const [build, families, alloc, fft, trapezoid] = Array.from(new Float64Array(h.memory.buffer, pout, 5));
console.log(JSON.stringify({ wasmMsPerGridBuild: +build.toFixed(1), wasmMsPerFamilySet: +families.toFixed(1), allocMs: +alloc.toFixed(2), fftMsPerFamilySet: +fft.toFixed(1), leftOutTrapezoidMsPerFamilySet: +trapezoid.toFixed(1) }));
process.exit(0);
