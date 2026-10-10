// Validates E12's environment modules against NAIF SPICE (CSPICE through SpiceyPy):
// time scales (foundation/time), the EME2000/GCRF bias and GCRF -> ITRF
// (foundation/frames with IERS finals2000A rows), and the Sun and Moon from
// each DE kernel (propagator/hpop's EPHEMERIS_REQUEST), then the size of the
// "planetary ephemeris" hypothesis axis as a third-body acceleration.
// The modules compute their numbers, SPICE (spice_reference.py) computes its
// own; this file compares them: it frames requests, rotates basis vectors,
// and prints and writes statistics. Section 5 is a tidal-term size estimate,
// not a propagation.
//
//   SDN_MODULES_ROOT=<modules checkout> nice -n 10 node experiments/e12-physics-match/reference/spice-validate.mjs [--kernels DIR] [--python PY]
// Writes runs/e12-spice-validation-<timestamp>.json.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import * as fb from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { PRW_TYPE, kernelFrame, instant } from '../../../harness/prw.mjs';
import { convertIso } from '../../../harness/time.mjs';
import { loadEnvironment } from '../environment.mjs';

const { values } = parseArgs({ options: {
  kernels: { type: 'string', default: '/opt/data/sdn-archive/hac/naif-kernels' },
  python: { type: 'string', default: path.join(repoRoot, 'runs/cache/spice-venv/bin/python') },
} });
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'experiments/e12-physics-match/config.json'), 'utf8'));
const env = await loadEnvironment({ modulesDir: modulesRoot({ configured: config.inputs.modules, repoRoot }), config });

// ── epochs: 25, 2026-01-01 .. 2026-10-09 UTC, to the millisecond ──
const t0 = Date.UTC(2026, 0, 1), t1 = Date.UTC(2026, 9, 9);
const epochs = Array.from({ length: 25 }, (_, i) => new Date(Math.round(t0 + ((t1 - t0) * i) / 24)).toISOString());
const noZ = (s) => s.replace(/Z$/, '');
// ISO text -> microseconds since 1970 (BigInt), keeping the module's microsecond digits.
const micros = (iso) => { const m = /^(.*?)(?:\.(\d+))?Z?$/.exec(iso); return BigInt(Date.parse(`${m[1]}Z`)) * 1000n + BigInt((m[2] ?? '').padEnd(6, '0').slice(0, 6)); };

// ── module side: time ──
const rows = [];
for (const utc of epochs) {
  const tt = await convertIso(env.time, noZ(utc), 'UTC', 'TT'), tdb = await convertIso(env.time, noZ(utc), 'UTC', 'TDB'), tai = await convertIso(env.time, noZ(utc), 'UTC', 'TAI');
  const off = (iso) => Number(micros(iso) - micros(utc)) / 1e6;
  rows.push({ utc: noZ(utc), tdb, ttMinusUtc: off(tt), tdbMinusUtc: off(tdb), taiMinusUtc: off(tai) });
}

// ── SPICE side ──
const spiceRun = spawnSync('nice', ['-n', '10', values.python, '-I', path.join(path.dirname(new URL(import.meta.url).pathname), 'spice_reference.py')],
  { input: JSON.stringify({ kernels: values.kernels, epochs: rows.map((r) => ({ utc: r.utc, tdb: r.tdb })) }), encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, OMP_NUM_THREADS: '1' } });
if (spiceRun.status !== 0) throw new Error(`spice_reference.py failed: ${spiceRun.stderr}`);
const spice = JSON.parse(spiceRun.stdout);

// ── statistics ──
const stats = (a) => ({ max: Math.max(...a.map(Math.abs)), rms: Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length), n: a.length });
const norm = (v) => Math.hypot(...v);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const MAS = 180 / Math.PI * 3600e3;
const report = { generated: new Date().toISOString(), epochs, toolkit: spice.toolkit, spiceypy: spice.spiceypy, kernels: values.kernels, sections: {} };
const table = [];
const record = (section, name, unit, values_, note = '') => { const s = stats(values_); report.sections[section] = { ...(report.sections[section] ?? {}), [name]: { unit, ...s, note } }; table.push([section, name, unit, s.max, s.rms, note]); };

// a. time (microseconds); the module prints microsecond text, so +-0.5 us is rounding
for (const k of ['ttMinusUtc', 'tdbMinusUtc', 'taiMinusUtc']) {
  record('a time', `${k} module - SPICE`, 'us', rows.map((r, i) => (r[k] - spice.epochs[i][k]) * 1e6), k === 'taiMinusUtc' ? 'leap seconds' : 'text rounds to 1 us');
}


report.leapSeconds = { module: [...new Set(rows.map((r) => Math.round(r.taiMinusUtc)))], spice: [...new Set(spice.epochs.map((e) => Math.round(e.taiMinusUtc)))] };

// ── rotations: matrix of GCRF -> axis from the module, by rotating basis vectors ──
const SCALE = 7e6;
const basis = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
async function moduleMatrix(utc, frame) {
  const pts = basis.map((b) => ({ epoch: `${utc}Z`, position: b.map((x) => x * SCALE), velocity: [0, 0, 0] }));
  const out = await env.fromGcrf(pts, frame, 'UTC', 'FINALS');
  return [0, 1, 2].map((r) => [0, 1, 2].map((c) => out[c].position[r] / SCALE)); // columns are the images of the basis vectors
}
const mul = (A, B) => A.map((row) => [0, 1, 2].map((c) => row[0] * B[0][c] + row[1] * B[1][c] + row[2] * B[2][c]));
const T = (A) => [0, 1, 2].map((r) => [0, 1, 2].map((c) => A[c][r]));
// Angle of the rotation A * B^T, in mas (from its skew part: exact at mas level).
function angleMas(A, B) {
  const D = mul(A, T(B));
  const v = [D[2][1] - D[1][2], D[0][2] - D[2][0], D[1][0] - D[0][1]].map((x) => x / 2);
  return Math.atan2(norm(v), (D[0][0] + D[1][1] + D[2][2] - 1) / 2) * MAS;
}
// Rotation vector of A * B^T in mas about the axes of the frame both map into (x, y, z).
function rotationVectorMas(A, B) {
  const D = mul(A, T(B));
  const v = [D[2][1] - D[1][2], D[0][2] - D[2][0], D[1][0] - D[0][1]].map((x) => x / 2);
  const f = Math.atan2(norm(v), (D[0][0] + D[1][1] + D[2][2] - 1) / 2) / norm(v);
  return v.map((x) => x * f * MAS);
}
const metres = (mas, km) => (mas / MAS) * km * 1000;

const gcrfToEme = [], gcrfToItrf = [];
for (const r of rows) { gcrfToEme.push(await moduleMatrix(r.utc, 'EME2000')); gcrfToItrf.push(await moduleMatrix(r.utc, 'ITRF')); }
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// b. frame bias: GCRF -> EME2000 from foundation/frames. SPICE 'J2000' is the ICRF axes.
const bias = gcrfToEme.map((m) => angleMas(m, I3));
record('b bias', 'EME2000 vs GCRF rotation', 'mas', bias, 'SPICE J2000 = ICRF axes: SPICE-written "EME2000" states are GCRF');
record('b bias', 'at 7000 km', 'm', bias.map((b) => metres(b, 7000)));
record('b bias', 'at 42164 km', 'm', bias.map((b) => metres(b, 42164)));
report.sections['b bias'].spread = { minMas: Math.min(...bias), maxMas: Math.max(...bias) };

// c. Earth orientation: J2000(=ICRF) -> Earth-fixed
const cmp = (label, modM, spiceM) => {
  const a = modM.map((m, i) => angleMas(m, spiceM[i]));
  record('c orientation', `${label}`, 'mas', a);
  record('c orientation', `${label} at 7000 km`, 'mm', a.map((x) => metres(x, 7000) * 1000));
  record('c orientation', `${label} at 42164 km`, 'mm', a.map((x) => metres(x, 42164) * 1000));
};
cmp('GCRF->ITRF module vs SPICE ITRF93', gcrfToItrf, spice.epochs.map((e) => e.itrf93));
{
  const comps = gcrfToItrf.map((m, i) => rotationVectorMas(m, spice.epochs[i].itrf93));
  for (const [k, axis] of ['x', 'y', 'z'].entries()) {
    const c = comps.map((v) => v[k]); const mean = c.reduce((a, b) => a + b, 0) / c.length;
    report.sections['c orientation'][`ITRF93 residual about Earth-fixed ${axis}`] = { unit: 'mas', mean, min: Math.min(...c), max: Math.max(...c) };
    console.log(`ITRF93 residual (module - SPICE) about Earth-fixed ${axis}: mean ${mean.toFixed(3)} mas, range ${Math.min(...c).toFixed(3)} .. ${Math.max(...c).toFixed(3)}`);
  }
  report.sections['c orientation'].perEpochResidualMas = comps;
}
cmp('GCRF->ITRF module vs SPICE IAU_EARTH', gcrfToItrf, spice.epochs.map((e) => e.iauEarth));
// Our EME2000 reading of SPICE's "J2000": a vector labelled EME2000 goes to GCRF by the module's bias, then to ITRF.
const viaEme = gcrfToItrf.map((m, i) => mul(m, T(gcrfToEme[i])));
cmp('EME2000->ITRF module vs SPICE ITRF93 (J2000 read as EME2000)', viaEme, spice.epochs.map((e) => e.itrf93));
cmp('EME2000->ITRF module vs SPICE IAU_EARTH (J2000 read as EME2000)', viaEme, spice.epochs.map((e) => e.iauEarth));

// ── d. planetary ephemerides ──
function hpopPosition(kernel, target, tdbIso) {
  const b = new fb.Builder(1024);
  const req = Object.assign(new P.PRWEphemerisRequestT(), { EPOCH: instant(tdbIso, 'TDB'), TARGET_NAIF_ID: target, CENTER_NAIF_ID: 399 });
  P.PRW.finishSizePrefixedPRWBuffer(b, Object.assign(new P.PRWT(), { EPHEMERIS_REQUEST: req }).pack(b));
  return env.hpop.invoke('invoke', [{ portId: 'request', typeRef: PRW_TYPE, payload: b.asUint8Array().slice() }, kernel]).then((response) => {
    const root = P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs.find((o) => o.portId === 'response').payload))).unpack();
    const p = root.EPHEMERIS_RESULT.STATE.STATE.POSITION;
    echo.push(Number(micros(root.EPHEMERIS_RESULT.STATE.STATE.EPOCH) - micros(tdbIso)));
    return [p.X / 1000, p.Y / 1000, p.Z / 1000]; // m -> km
  });
}
const echo = []; // the epoch HPOP writes back minus the epoch asked, microseconds
const DE = ['de440s', 'de430', 'de421', 'de405'];
const hpop = {}; const accepted = {};
for (const de of DE) {
  const kernel = kernelFrame(fs.readFileSync(path.join(values.kernels, `spk/planets/${de}.bsp`)));
  hpop[de] = { sun: [], moon: [] };
  try {
    for (const r of rows) { hpop[de].sun.push(await hpopPosition(kernel, 10, r.tdb)); hpop[de].moon.push(await hpopPosition(kernel, 301, r.tdb)); }
    accepted[de] = 'accepted';
  } catch (error) { accepted[de] = `refused: ${String(error.message).slice(0, 200)}`; }
}
report.hpopKernelAcceptance = accepted;
for (const de of DE) {
  if (accepted[de] !== 'accepted') continue;
  for (const [body, key] of [['Sun', 'sun'], ['Moon', 'moon']]) {
    // same TDB instant: HPOP vs SPICE at the epoch the module read as TDB (kernel reading only)
    record('d ephemeris', `${body} ${de} HPOP vs SPICE, same TDB instant`, 'm', rows.map((_, i) => norm(sub(hpop[de][key][i], spice.epochs[i].ephemeris[de][key])) * 1000));
    // SPICE's own UTC -> TDB (adds the time-model difference, mostly the Sun's 30 km/s)
    record('d ephemeris', `${body} ${de} HPOP vs SPICE, SPICE's str2et`, 'm', rows.map((_, i) => norm(sub(hpop[de][key][i], spice.epochs[i].ephemeris[de][`${key}SpiceTime`])) * 1000));
  }
}
// The echoed epoch and the time shift the position difference implies (diff . v / |v|^2): a kernel-independent offset in HPOP's TDB handling.
record('d ephemeris', 'HPOP echoed epoch - requested TDB epoch', 'us', echo.slice(0, rows.length), 'EPHEMERIS_RESULT epoch, de440s');
for (const [body, key] of [['Sun', 'sun'], ['Moon', 'moon']]) {
  const shift = (de) => rows.map((_, i) => { const d = sub(hpop[de][key][i], spice.epochs[i].ephemeris[de][key]), v = spice.epochs[i].ephemeris[de][`${key}Velocity`]; return (d[0] * v[0] + d[1] * v[1] + d[2] * v[2]) / (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) * 1e6; });
  record('d ephemeris', `${body} de440s HPOP-SPICE implied time shift`, 'us', shift('de440s'));
  const residual = rows.map((_, i) => { const s = shift('de440s')[i] / 1e6, v = spice.epochs[i].ephemeris.de440s[`${key}Velocity`]; return norm(sub(sub(hpop.de440s[key][i], spice.epochs[i].ephemeris.de440s[key]), v.map((x) => x * s))) * 1e6; });
  record('d ephemeris', `${body} de440s HPOP-SPICE after removing that shift`, 'um', residual);
}
// The kernel really is read: HPOP(de) - HPOP(de440s) against SPICE(de) - SPICE(de440s) (the time shift cancels).
for (const de of DE.slice(1)) for (const [body, key] of [['Sun', 'sun'], ['Moon', 'moon']]) {
  record('d kernel read', `${body} ${de}: [HPOP ${de} - HPOP de440s] - [SPICE ${de} - SPICE de440s]`, 'mm', rows.map((_, i) => norm(sub(sub(hpop[de][key][i], hpop.de440s[key][i]), sub(spice.epochs[i].ephemeris[de][key], spice.epochs[i].ephemeris.de440s[key]))) * 1e6));
}
for (const de of DE.slice(1)) for (const [body, key] of [['Sun', 'sun'], ['Moon', 'moon']]) {
  record('d vs de440', `${body} SPICE ${de} - de440s`, 'km', spice.epochs.map((e) => norm(sub(e.ephemeris[de][key], e.ephemeris.de440s[key]))));
}

// ── e. significance: tidal third-body acceleration difference (size estimate, not a propagation) ──
// Tidal term of a body of GM mu at geocentric R acting on a satellite at r:
//   a = mu/|R|^3 [3 (r.Rhat) Rhat - r]. For R (de440s) and R' (older kernel) take the largest |a' - a| over satellite
// directions (a Fibonacci sphere of 2000 points); 0.5 a t^2 at one day assumes the difference never changes sign.
const GM = { sun: 1.32712440041279419e20, moon: 4.902800118e12 }; // m^3/s^2, DE440
const directions = Array.from({ length: 2000 }, (_, i) => { const z = 1 - (2 * (i + 0.5)) / 2000, rr = Math.sqrt(1 - z * z), phi = i * Math.PI * (3 - Math.sqrt(5)); return [rr * Math.cos(phi), rr * Math.sin(phi), z]; });
const tidal = (mu, R, r) => { const d = Math.hypot(...R), u = R.map((x) => x / d), k = 3 * (r[0] * u[0] + r[1] * u[1] + r[2] * u[2]); return u.map((x, j) => (mu / d ** 3) * (k * x - r[j])); };
for (const [orbit, radiusKm] of [['LEO 7000 km', 7000], ['GEO 42164 km', 42164]]) {
  for (const de of DE.slice(1)) for (const [body, key] of [['Sun', 'sun'], ['Moon', 'moon']]) {
    const worst = spice.epochs.map((e) => {
      const R = e.ephemeris.de440s[key].map((x) => x * 1000), Rp = e.ephemeris[de][key].map((x) => x * 1000);
      let w = 0;
      for (const u of directions) { const r = u.map((x) => x * radiusKm * 1000); w = Math.max(w, norm(sub(tidal(GM[key], Rp, r), tidal(GM[key], R, r)))); }
      return w;
    });
    record('e third-body', `${orbit} ${body} ${de} vs de440s: max |da|`, 'm/s^2', worst, 'tidal-term size estimate');
    record('e third-body', `${orbit} ${body} ${de} vs de440s: 0.5 da t^2 at 1 day (upper bound)`, 'm', worst.map((a) => 0.5 * a * 86400 ** 2), 'size estimate, not a propagation');
  }
}

// ── print and write ──
const fmt = (x) => (x === 0 ? '0' : Math.abs(x) >= 1e-3 && Math.abs(x) < 1e5 ? x.toPrecision(4) : x.toExponential(3));
console.log(`CSPICE ${spice.toolkit}, SpiceyPy ${spice.spiceypy}, ${epochs.length} epochs ${epochs[0]} .. ${epochs.at(-1)}`);
console.log('leap seconds (TAI-UTC) module', JSON.stringify(report.leapSeconds.module), 'SPICE', JSON.stringify(report.leapSeconds.spice));
console.log('HPOP kernel acceptance', JSON.stringify(accepted));
let last = '';
for (const [section, name, unit, max, rms, note] of table) {
  if (section !== last) { console.log(`\n== ${section}`); last = section; }
  console.log(`${name.padEnd(82)} max ${fmt(max).padStart(10)}  rms ${fmt(rms).padStart(10)}  ${unit}${note ? `   (${note})` : ''}`);
}
const outFile = path.join(repoRoot, 'runs', `e12-spice-validation-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(`\nwrote ${path.relative(repoRoot, outFile)}`);
await env.destroy();
