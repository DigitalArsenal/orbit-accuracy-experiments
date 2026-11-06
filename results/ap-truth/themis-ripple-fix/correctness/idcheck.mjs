// The release step's identity check: a versioned build (<now.wasm>) against the candidate it was cut from (<was.wasm>), every product
// compared with PRODUCER's version read as the candidate's, the $ODR by decoded value with RUN_ID and OCM_CONTENT_ID (the CID of
// that build's own $OCM) excluded. 1. each published example ($OCM and window) flown in TEME at every epoch of its window, and
// sdnap_covariance_at at every 12th epoch; 2. fits: THEMIS A 2013-02-15, the Molniya start-0 fixture, the GTO and Molniya fixtures
// of the model truth, the LEO fixture under AP and SGP4XP; each fit's $OCM, $ODR and its set flown 7 days hourly.
// node idcheck.mjs <modules> <examples dir> <now.wasm> <was.wasm> <nowVersion> <wasVersion>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const [modules, examples, nowWasm, wasWasm, nowV, wasV] = process.argv.slice(2);
const test = path.join(modules, 'propagator/sdn-ap/test');
const req = createRequire(path.join(modules, 'propagator/sdn-ap/package.json'));
const lib = (f) => import(pathToFileURL(path.join(test, 'lib', f)).href);
const { runModelTruth } = await lib('heo-model-truth.mjs');
const { configuration, pcfAtmosphereFamily, MSIS_FORCES, XP_FORCES } = await lib('pcf.mjs');
const { T, ocmOf, AP_FORCES } = await lib('ocm.mjs');
const { inputs: fixtureInputs } = await lib('fixture-inputs.mjs');
const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
const flatbuffers = await import(pathToFileURL(req.resolve('flatbuffers')).href);
const { ODR } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/ODR/ODR.js')).href);
const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
const producer = (v) => Buffer.from(`com.spacedatanetwork.sdn-ap-propagator ${v}`);
const asWas = (bytes) => { const b = Buffer.from(bytes); for (let at = b.indexOf(producer(nowV)); at >= 0; at = b.indexOf(producer(nowV), at + 1)) producer(wasV).copy(b, at); return b; };
const sameValues = (a, b, at = 'ODR') => {
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) { a = Array.from(a ?? []); b = Array.from(b ?? []); }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return [0, `${at}.length`];
    let n = 0;
    for (let i = 0; i < a.length; i += 1) { const [m, d] = sameValues(a[i], b[i], `${at}[${i}]`); n += m; if (d) return [n, d]; }
    return [n, null];
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    let n = 0;
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const [m, d] = sameValues(a[k], b[k], `${at}.${k}`); n += m; if (d) return [n, d]; }
    return [n, null];
  }
  return Object.is(a, b) ? [1, null] : [0, `${at} ${a} | ${b}`];
};
const covarianceAt = (h, set, times) => {
  const x = h.instance.exports, mem = () => h.memory.buffer;
  const po = x.sdnap_alloc(set.length), pm = x.sdnap_alloc(8 * times.length), pout = x.sdnap_alloc(8 * 42 * times.length);
  new Uint8Array(mem(), po, set.length).set(set);
  new Float64Array(mem(), pm, times.length).set(times);
  const status = x.sdnap_covariance_at(po, set.length, pm, times.length, pout);
  const out = Buffer.from(mem().slice(pout, pout + 8 * 42 * times.length));
  x.sdnap_free(po); x.sdnap_free(pm); x.sdnap_free(pout);
  return { status, out };
};
const now = await createStandaloneHarness('browser', nowWasm, { surface: 'direct' });
const was = await createStandaloneHarness('browser', wasWasm, { surface: 'direct' });
const fail = [];
// 1. examples
const ids = fs.readdirSync(examples).filter((f) => f.endsWith('.ocm')).map((f) => f.slice(0, -4)).sort();
let exSame = 0, epochsFlown = 0, timesCovered = 0;
for (const id of ids) {
  const d = JSON.parse(fs.readFileSync(path.join(examples, `${id}.json`), 'utf8')), set = new Uint8Array(fs.readFileSync(path.join(examples, `${id}.ocm`)));
  const t0 = Date.parse(d.start), setMs = Date.parse(`${ocmOf(set).MEAN_ELEMENTS.EPOCH.slice(0, 23)}Z`);
  const epochs = d.epochsSeconds.map((s) => new Date(t0 + 1000 * s).toISOString().replace('Z', ''));
  const times = d.epochsSeconds.filter((_, k) => k % 12 === 0).map((s) => (t0 + 1000 * s - setMs) / 60000);
  const fly = (h) => h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: T('OCM'), payload: set }, configuration({ output: { FRAME: pcfOutputFrame.TEME, EPOCHS: epochs } })] });
  const [p2, p1] = [await fly(now), await fly(was)];
  const flown = p2.statusCode === 0 && p1.statusCode === 0 && asWas(new Uint8Array(p2.outputs[0].payload)).equals(Buffer.from(new Uint8Array(p1.outputs[0].payload)));
  const [a2, a1] = [covarianceAt(now, set, times), covarianceAt(was, set, times)];
  const cov = a2.status === a1.status && a2.out.equals(a1.out);
  if (flown && cov) { exSame += 1; epochsFlown += epochs.length; timesCovered += times.length; } else fail.push(`example ${id}: flight ${flown}, covariance ${cov}`);
}
console.log(JSON.stringify({ examples: ids.length, identical: exSame, epochsFlown, covarianceTimes: timesCovered }));
// 2. fits
const VACUUM_AP = { EPHEMERIS_SOURCE: '', ATMOSPHERE_MODEL: pcfAtmosphereFamily.JACCHIA70, HAS_MAXIMUM_TESSERAL_DEGREE: true, MAXIMUM_TESSERAL_DEGREE: 31, HAS_MAXIMUM_DEGREE: true, MAXIMUM_DEGREE: 20 };
const file = (f, portId, type) => ({ portId, typeRef: T(type), payload: new Uint8Array(fs.readFileSync(path.join(test, 'fixtures', f))) });
const gto = await runModelTruth({ name: 'GTO', n: 2.40, e: 0.72, i: 27, raan: 40, argp: 270, ma: 10, drag: false, hourly: true, fitInput: true, modulePath: wasWasm });
const mol = await runModelTruth({ name: 'Molniya', n: 2, e: 0.74, i: 63.4, raan: 300, argp: 270, ma: 10, drag: true, hourly: true, fitInput: true, modulePath: wasWasm });
const { arc, rows } = fixtureInputs(), leoArc = { portId: 'ephemeris', typeRef: T('OEM'), payload: arc }, leoRows = { portId: 'space_weather', typeRef: T('SPW'), payload: rows.bytes };
const FITS = {
  'THEMIS A 2013-02-15': [file('themis-a-2013-02-15-fit-72h.oem', 'ephemeris', 'OEM'), configuration({ theory: 'AP', forces: VACUUM_AP })],
  'Molniya start 0 (fixture)': [file('molniya-start0-fit-72h.oem', 'ephemeris', 'OEM'), file('molniya-start0-fit.pcf', 'configuration', 'PCF'), file('molniya-start0-fit.spw', 'space_weather', 'SPW')],
  GTO: [gto.ephemeris, gto.configuration, gto.spaceWeather],
  'Molniya, drag fitted': [mol.ephemeris, mol.configuration, mol.spaceWeather],
  'LEO, AP': [leoArc, configuration({ theory: 'AP', forces: AP_FORCES }), leoRows],
  'LEO, SGP4XP': [leoArc, configuration({ theory: 'SGP4XP', forces: XP_FORCES })],
};
const EPOCHS = (set) => { const t = Date.parse(`${ocmOf(set).MEAN_ELEMENTS.EPOCH.slice(0, 23)}Z`); return Array.from({ length: 169 }, (_, k) => new Date(t + k * 3600e3).toISOString().replace('Z', '')); };
let fitSame = 0, odrValues = 0;
for (const [name, inputs] of Object.entries(FITS)) {
  const [r2, r1] = [await now.invoke({ methodId: 'fit', inputs }), await was.invoke({ methodId: 'fit', inputs })];
  if (r2.statusCode !== 0 || r1.statusCode !== 0) { fail.push(`${name}: fit ${r2.errorCode} | ${r1.errorCode}`); continue; }
  const [o2, o1] = [new Uint8Array(r2.outputs[0].payload), new Uint8Array(r1.outputs[0].payload)];
  const ocm = asWas(o2).equals(Buffer.from(o1));
  const odr = (r) => ODR.getRootAsODR(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[1].payload))).unpack();
  const [d2, d1] = [odr(r2), odr(r1)];
  for (const f of ['RUN_ID', 'OCM_CONTENT_ID']) { delete d2[f]; delete d1[f]; }
  const [n, first] = sameValues(d2, d1);
  const fly = (h, set) => h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: T('OCM'), payload: set }, configuration({ output: { FRAME: pcfOutputFrame.TEME, EPOCHS: EPOCHS(o1) } })] });
  const [p2, p1] = [await fly(now, o1), await fly(was, o1)];
  const flown = p2.statusCode === 0 && p1.statusCode === 0 && asWas(new Uint8Array(p2.outputs[0].payload)).equals(Buffer.from(new Uint8Array(p1.outputs[0].payload)));
  console.log(JSON.stringify({ fit: name, ocmIdentical: ocm, odrValues: n, odrFirstDifference: first, flightIdentical: flown, bterm: ocmOf(o2).MEAN_ELEMENTS.BTERM }));
  if (ocm && first === null && flown) { fitSame += 1; odrValues += n; } else fail.push(`${name}: $OCM ${ocm}, $ODR ${first}, flight ${flown}`);
}
console.log(JSON.stringify({ fits: Object.keys(FITS).length, identical: fitSame, odrValues, failures: fail }));
await now.close?.(); await was.close?.();
process.exit(fail.length ? 1 : 0);
