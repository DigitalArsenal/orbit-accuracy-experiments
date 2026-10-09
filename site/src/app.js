// Orbit Accuracy Experiments, the page. The propagation, time-scale and VCM
// work runs in the experiments' own modules (propagator/hpop,
// foundation/time, analysis/vcm-adapter) through the space-data-module-sdk
// browser harness, framed by the same harness code the experiments use in
// Node (harness/prw.mjs, harness/time.mjs). This file moves bytes, takes
// norms of differences and draws.
import * as flatbuffers from 'flatbuffers';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import { PRW_TYPE, decodeExecution, executionFrame } from '../../harness/prw.mjs';
import { convertIso } from '../../harness/time.mjs';
import { COLORS, formatMeters, lineChart, stripChart } from './chart.js';
import { downloadButton, downloadLink, saveBlob, toCsv } from './download.js';
import { createGlobe } from './globe.js';
import { fetchBytes, fetchJson, loadModule } from './modules.js';

const $ = (id) => document.getElementById(id);
const HOUR = 3600e3;
const GITHUB = 'https://github.com/DigitalArsenal/orbit-accuracy-experiments';
const CONFIG_TEXT = {
  'E-a': 'Point mass only.',
  'E-b': 'Zonal harmonics to degree 20.',
  'E-c': 'Zonals + Sun and Moon (JPL DE440).',
  'E-d': 'Zonals, Sun, Moon + radiation pressure with the conical shadow.',
  'E-e': '20×20 EGM2008 in ITRF with IERS Earth orientation, Sun, Moon, radiation pressure.',
  'E-f': 'E-e + IERS 2010 solid tides and relativity: every force HPOP models.',
  'R-20': 'The resident catalog path: 20×20 field, no Sun or Moon.',
};
const OBJECT_NAMES = { lageos1: 'LAGEOS-1', lageos2: 'LAGEOS-2', etalon1: 'ETALON-1', etalon2: 'ETALON-2' };
const objectName = (o) => OBJECT_NAMES[o] ?? (o.startsWith('gps-') ? `GPS · NORAD ${o.slice(4)}` : o);
const isoMicro = (ms) => new Date(ms).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000');
const errorM = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000;
const status = (node, text, error = false) => { node.textContent = text; node.classList.toggle('error', error); };
const encodePrw = (root) => { const b = new flatbuffers.Builder(65536); P.PRW.finishSizePrefixedPRWBuffer(b, root.pack(b)); return b.asUint8Array().slice(); };
const decodePrw = (bytes) => P.PRW.getSizePrefixedRootAsPRW(new flatbuffers.ByteBuffer(new Uint8Array(bytes))).unpack();
const frameOf = (portId, payload) => ({ portId, typeRef: PRW_TYPE, payload });

const state = { modules: {}, truth: new Map() };

async function module(path) {
  state.modules[path] ??= loadModule(path);
  return state.modules[path];
}

// ── Start ──
async function main() {
  const [provenance, seeds, metrics, config] = await Promise.all([
    fetchJson('./provenance.json'), fetchJson('./data/v1/seeds.json'), fetchJson('./data/v1/metrics.json'), fetchJson('./data/v1/config.json'),
  ]);
  Object.assign(state, { provenance, seeds, metrics, config });
  renderFacts();
  renderV1();
  renderExperiments();
  renderData();
  setupLive();
  setupOrekit().catch((e) => status($('orekit-status'), e.message, true));
  setupVcm();
}

function isolationNote() {
  if (window.crossOriginIsolated) return true;
  const note = $('isolation');
  note.hidden = false;
  note.textContent = 'This page needs cross-origin isolation for the modules’ shared WebAssembly memory. Its service worker provides it; reload once if the propagation does not start.';
  return false;
}

// ── Headline numbers ──
function renderFacts() {
  const s = state.metrics.summary;
  const at = (group, cfg, h) => s.find((r) => r.group === group && r.configuration === cfg)?.[`${h}h`]?.medianM;
  const facts = [
    [formatMeters(at('SLR', 'E-f', 24)), 'median HPOP error after a day, SLR spheres, every force (V1)'],
    [formatMeters(at('SLR', 'E-f', 72)), 'after three days'],
    [formatMeters(at('GPS', 'E-f', 24)), 'after a day, GPS, with a cannonball for the satellite'],
    [formatMeters(state.metrics.checks['V1.1'].errorM), 'two-body closure after five orbits'],
  ];
  $('facts').innerHTML = facts.map(([v, t]) => `<li><strong>${v}</strong><span>${t}</span></li>`).join('');
}

// ── Live propagation ──
function setupLive() {
  const objects = [...new Set(state.seeds.map((s) => s.object))];
  const objectSelect = $('object'), seedSelect = $('seed'), cfgSelect = $('configuration');
  const groups = { SLR: 'SLR spheres (ILRS)', GPS: 'GPS (IGS final orbits)' };
  for (const [group, label] of Object.entries(groups)) {
    const og = document.createElement('optgroup');
    og.label = label;
    for (const o of objects.filter((x) => state.seeds.find((s) => s.object === x).group === group)) og.append(new Option(objectName(o), o));
    objectSelect.append(og);
  }
  for (const name of Object.keys(state.config.configurations)) cfgSelect.append(new Option(`${name} · ${CONFIG_TEXT[name].split(':')[0].replace(/\.$/, '')}`, name));
  cfgSelect.value = 'E-f';
  const fillSeeds = () => {
    seedSelect.innerHTML = '';
    for (const s of state.seeds.filter((x) => x.object === objectSelect.value)) seedSelect.append(new Option(`${s.seedUtc.slice(0, 16).replace('T', ' ')} UTC`, s.id));
  };
  const hint = () => { $('configuration-hint').textContent = CONFIG_TEXT[cfgSelect.value]; };
  objectSelect.addEventListener('change', fillSeeds);
  cfgSelect.addEventListener('change', hint);
  objectSelect.value = 'lageos1';
  fillSeeds();
  hint();
  lineChart($('run-chart'), { series: [], x: { min: 0, max: 72, ticks: [0, 12, 24, 36, 48, 60, 72], format: (h) => `${h} h` }, empty: 'Run a propagation to plot its error.' });
  $('controls').addEventListener('submit', (event) => { event.preventDefault(); runLive().catch((e) => { status($('status'), e.message, true); $('run').disabled = false; }); });
  (async () => {
    state.globe = await createGlobe($('globe'));
    isolationNote();
    const [hpop, time] = await Promise.all([module('propagator/hpop'), module('foundation/time')]);
    status($('status'), `Ready: propagator/hpop ${hpop.provenance.wasmSha256.slice(0, 12)}…, foundation/time ${time.provenance.wasmSha256.slice(0, 12)}…`);
  })().catch((e) => { isolationNote(); status($('status'), `The modules could not load: ${e.message}`, true); });
}

async function truthFor(object) {
  if (!state.truth.has(object)) state.truth.set(object, fetchJson(`./data/truth/${object}.json`));
  return state.truth.get(object);
}

async function runLive() {
  const button = $('run');
  button.disabled = true;
  const seed = state.seeds[Number($('seed').value)];
  const cfgName = $('configuration').value;
  const forces = state.config.configurations[cfgName];
  status($('status'), `Preparing ${objectName(seed.object)}…`);
  const [hpop, time, truth] = await Promise.all([module('propagator/hpop'), module('foundation/time'), truthFor(seed.object)]);
  const withKernel = (forces.thirdBodies ?? []).length > 0 || forces.srp;
  const extra = [];
  if (withKernel) extra.push(frameOf('kernel', await fetchBytes('./data/kernel/de440-2026.prw')));
  if (forces.eop) extra.push(frameOf('earth_orientation', await fetchBytes('./data/eop/eop-v1.prw')));
  const index = new Map(truth.epochsUnixMs.map((t, i) => [t, i]));
  const at = (i) => ({ position: truth.position.slice(3 * i, 3 * i + 3), velocity: truth.velocity.slice(3 * i, 3 * i + 3) });
  const s0 = at(index.get(seed.seedUnixMs));
  const sampleMs = truth.epochsUnixMs.filter((t) => t > seed.seedUnixMs && t <= seed.seedUnixMs + 72 * HOUR);
  const horizonMs = state.config.horizonsHours.map((h) => seed.seedUnixMs + h * HOUR);
  status($('status'), `foundation/time: UTC → TDB for ${sampleMs.length + 1} epochs…`);
  const tdb = new Map();
  for (const ms of [seed.seedUnixMs, ...new Set([...sampleMs, ...horizonMs])]) tdb.set(ms, await convertIso(time, isoMicro(ms), 'UTC', 'TDB'));
  const request = (samples) => executionFrame({
    epoch: tdb.get(seed.seedUnixMs), timeScale: 'TDB', position: s0.position, velocity: s0.velocity,
    samples: samples.map((ms) => tdb.get(ms)), target: tdb.get(samples.at(-1)),
    integrator: state.config.integrator, forces: { ...forces, ...(forces.srp ? seed.params : {}) }, kernel: withKernel,
  });
  status($('status'), `propagator/hpop: ${cfgName}, 72 h, ${sampleMs.length} samples…`);
  const dense = request(sampleMs);
  const started = performance.now();
  const response = await hpop.invoke('invoke', [dense, ...extra]);
  const seconds = (performance.now() - started) / 1000;
  const run = decodeExecution(response);
  const rows = run.samples.map((p, k) => {
    const truthAt = at(index.get(sampleMs[k]));
    return { ms: sampleMs[k], hours: (sampleMs[k] - seed.seedUnixMs) / HOUR, truth: truthAt.position, hpop: p.position, errorM: errorM(p.position, truthAt.position) };
  });
  // The committed V1 run asked for the six horizons only; ask the same and
  // compare with results/v1, seed by seed.
  const v1 = decodeExecution(await hpop.invoke('invoke', [request(horizonMs), ...extra]));
  const committed = state.metrics.results.filter((r) => r.object === seed.object && r.seedEpoch === seed.seedUtc && r.configuration === cfgName);
  const compared = v1.samples.map((p, k) => {
    const c = committed.find((r) => r.hours === state.config.horizonsHours[k]);
    return c ? Math.abs(errorM(p.position, at(index.get(horizonMs[k])).position) - c.errorM) : null;
  }).filter((d) => d !== null);
  const reproduced = compared.length ? Math.max(...compared) : null;
  const err = (h) => rows.find((r) => Math.abs(r.hours - h) < 1e-9)?.errorM;
  $('tiles').innerHTML = [[1, '1 h'], [24, '24 h'], [72, '72 h']].map(([h, l]) => `<div><dt>${l}</dt><dd>${formatMeters(err(h))}</dd></div>`).join('');
  const verdict = reproduced === null ? 'results/v1 has no row for this seed and configuration to compare with.'
    : reproduced === 0 ? `Reproduces results/v1 for this seed exactly, at all ${compared.length} horizons.`
    : `Reproduces results/v1 for this seed to ${formatMeters(reproduced, 3)} over ${compared.length} horizons.`;
  status($('status'), `${objectName(seed.object)}, ${cfgName}: ${run.final.steps.toLocaleString()} steps in ${seconds.toFixed(2)} s in this browser. ${verdict}`);
  const medians = state.metrics.summary.find((r) => r.group === seed.group && r.configuration === cfgName);
  $('chart-caption').textContent = `${objectName(seed.object)}, seeded ${seed.seedUtc.slice(0, 16).replace('T', ' ')} UTC, ${cfgName}`;
  lineChart($('run-chart'), {
    series: [
      { name: `V1 median, ${seed.group}, ${cfgName}`, color: COLORS.muted, markers: true, points: state.config.horizonsHours.map((h) => [h, medians[`${h}h`].medianM]) },
      { name: 'This run', color: COLORS.primary, points: rows.map((r) => [Number(r.hours.toFixed(4)), r.errorM]), label: true },
    ],
    x: { min: 0, max: 72, ticks: [0, 12, 24, 36, 48, 60, 72], format: (h) => `${Number(h.toFixed(2))} h` },
  });
  const period = 2 * Math.PI * Math.sqrt(Math.hypot(...s0.position) ** 3 / 398600.4418);
  await state.globe.show([
    { id: 'truth', name: 'Precise orbit', color: 'amber', epochsMs: [seed.seedUnixMs, ...sampleMs], positionsKm: [...s0.position, ...rows.flatMap((r) => r.truth)] },
    { id: 'hpop', name: 'HPOP', color: 'cyan', epochsMs: [seed.seedUnixMs, ...sampleMs], positionsKm: [...s0.position, ...rows.flatMap((r) => r.hpop)] },
  ], { periodSeconds: period });
  const base = `${seed.object}-${seed.seedUtc.slice(0, 10)}-${cfgName}`;
  const box = $('run-downloads');
  box.innerHTML = '';
  downloadButton(box, 'CSV', `${base}.csv`, () => toCsv(['utc', 'hours', 'truth_x_km', 'truth_y_km', 'truth_z_km', 'hpop_x_km', 'hpop_y_km', 'hpop_z_km', 'error_m'],
    rows.map((r) => [isoMicro(r.ms), r.hours.toFixed(6), ...r.truth.map((x) => x.toFixed(6)), ...r.hpop.map((x) => x.toFixed(6)), r.errorM.toFixed(4)])), 'text/csv');
  downloadButton(box, 'CZML', `${base}.czml`, () => JSON.stringify(czml(seed, rows, s0, period)), 'application/json');
  downloadButton(box, 'PRW request', `${base}-request.prw`, () => dense.payload);
  downloadButton(box, 'PRW result', `${base}-result.prw`, () => response.outputs.find((o) => o.portId === 'response').payload);
  downloadButton(box, 'Run record', `${base}.json`, () => JSON.stringify({
    seed, configuration: cfgName, forces, integrator: state.config.integrator, samples: rows.length,
    modules: [hpop.provenance, time.provenance], inputs: { kernel: withKernel ? 'data/kernel/de440-2026.prw' : null, earthOrientation: forces.eop ? 'data/eop/eop-v1.prw' : null },
    browserSeconds: seconds, reproducesV1WithinM: reproduced, horizonsCompared: compared.length,
  }, null, 2), 'application/json');
  button.disabled = false;
}

function czml(seed, rows, s0, period) {
  const start = new Date(seed.seedUnixMs).toISOString(), stop = new Date(rows.at(-1).ms).toISOString();
  const track = (id, name, rgba, pick) => ({
    id, name, availability: `${start}/${stop}`,
    position: { referenceFrame: 'INERTIAL', epoch: start, interpolationAlgorithm: 'LAGRANGE', interpolationDegree: 7,
      cartesian: [0, ...s0.position.map((x) => x * 1000), ...rows.flatMap((r) => [(r.ms - seed.seedUnixMs) / 1000, ...pick(r).map((x) => x * 1000)])] },
    path: { material: { solidColor: { color: { rgba } } }, width: 2, leadTime: 0, trailTime: period },
    point: { pixelSize: 8, color: { rgba } },
  });
  return [
    { id: 'document', name: `${objectName(seed.object)}: precise orbit and HPOP`, version: '1.0', clock: { interval: `${start}/${stop}`, currentTime: start, multiplier: 600 } },
    track('truth', 'Precise orbit (GCRF)', [245, 165, 36, 255], (r) => r.truth),
    track('hpop', 'HPOP', [89, 217, 255, 255], (r) => r.hpop),
  ];
}

// ── V1 ──
function renderV1() {
  const { summary, checks } = state.metrics;
  const horizons = state.config.horizonsHours;
  const configs = [...Object.keys(state.config.configurations), 'R-20'];
  const color = (c) => (c === 'E-f' ? COLORS.primary : c === 'E-e' ? COLORS.second : COLORS.muted);
  for (const group of ['SLR', 'GPS']) {
    lineChart($(`v1-chart-${group.toLowerCase()}`), {
      series: configs.map((c) => ({ name: c, color: color(c), markers: c === 'E-f' || c === 'E-e', label: true, width: c === 'E-f' || c === 'E-e' ? 2 : 1.5,
        points: horizons.map((h) => [h, summary.find((r) => r.group === group && r.configuration === c)[`${h}h`].medianM]) })),
      x: { min: 0, max: 72, ticks: horizons, format: (h) => `${h} h` },
    });
  }
  const cell = (group, c, h) => { const r = summary.find((x) => x.group === group && x.configuration === c)[`${h}h`]; return `${formatMeters(r.medianM)} <span class="fine">(${formatMeters(r.maxM, 1)})</span>`; };
  $('v1-table').innerHTML = `<thead><tr><th>Configuration</th><th>SLR 24 h</th><th>SLR 72 h</th><th>GPS 24 h</th><th>GPS 72 h</th></tr></thead><tbody>${
    configs.map((c) => `<tr class="${c === 'E-f' ? 'highlight' : c === 'E-e' ? 'second' : ''}"><td>${c}</td><td>${cell('SLR', c, 24)}</td><td>${cell('SLR', c, 72)}</td><td>${cell('GPS', c, 24)}</td><td>${cell('GPS', c, 72)}</td></tr>`).join('')
  }</tbody>`;
  const detail = {
    'V1.1': () => `${formatMeters(checks['V1.1'].errorM, 1)} after five orbits (limit 1 m).`,
    'V1.2': () => `${checks['V1.2'].failures.length} violations. Without tesserals the errors are hundreds of metres to kilometres, and an added force can move a seed either way inside that; with them every SLR seed improves.`,
    'V1.3': () => `${checks['V1.3'].failures.length} of 96 GPS seeds. The criterion compared two models without the Sun and Moon, whose absence dominates GPS at a day; the resident model agrees with the execution path to metres.`,
    'V1.4': () => `${formatMeters(checks['V1.4'].medianM)} over ${checks['V1.4'].n} seeds (limit 500 m).`,
  };
  $('v1-criteria').innerHTML = Object.entries(checks).map(([id, c]) => `<li><span class="badge ${c.pass ? 'pass' : 'fail'}">${id} ${c.pass ? 'pass' : 'fail'}</span><span>${c.description[0].toUpperCase()}${c.description.slice(1)}. ${detail[id]?.() ?? ''}</span></li>`).join('');
  $('v1-configs').innerHTML = configs.map((c) => `<dt>${c}</dt><dd>${CONFIG_TEXT[c]}</dd>`).join('');
  const box = $('v1-downloads');
  downloadLink(box, 'metrics.json', './data/v1/metrics.json');
  downloadLink(box, 'errors CSV', './data/v1/v1-errors.csv');
  downloadLink(box, 'run manifest', './data/v1/manifest.json');
  const a = document.createElement('a');
  a.className = 'button small';
  a.href = `${GITHUB}/tree/main/results/v1/${state.provenance.v1Run}`;
  a.textContent = 'Report on GitHub ↗';
  box.appendChild(a);
}

// ── HPOP against Orekit ──
async function setupOrekit() {
  const [cases, results] = await Promise.all([fetchJson('./data/orekit/cases.json'), fetchJson('./data/orekit/results.json')]);
  const select = $('orekit-case');
  const byOrbit = new Map();
  for (const c of cases) {
    select.append(new Option(`${c.orbit} ${c.forces}`, c.id));
    const r = results.cases.find((x) => x.id === c.id);
    if (!byOrbit.has(c.orbit)) byOrbit.set(c.orbit, []);
    byOrbit.get(c.orbit).push({ label: `${c.orbit} ${c.forces}`, value: Math.max(r.worstM, 1e-5), limit: c.toleranceM, onSelect: () => { select.value = c.id; } });
  }
  stripChart($('orekit-chart'), { groups: [...byOrbit].map(([name, items]) => ({ name, items })), min: 1e-5, max: 1 });
  const box = $('orekit-downloads');
  downloadLink(box, 'Orekit reference trajectories', './data/orekit/orekit-reference.json');
  downloadLink(box, 'Case index and requests', './data/orekit/cases.json');
  downloadLink(box, 'HPOP results', './data/orekit/results.json');
  const outside = results.cases.filter((r) => !r.pass || r.jacobiansPass === false).length;
  status($('orekit-status'), `${cases.length} cases, ${outside ? `${outside} outside` : 'every one within'} tolerance; largest ${formatMeters(Math.max(...results.cases.map((r) => r.worstM)), 3)} (recorded with HPOP ${results.hpopWasmSha256.slice(0, 12)}…, ${results.runtime}).`, outside > 0);
  $('orekit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const c = cases[Number(select.value)];
    try {
      status($('orekit-status'), `Running ${c.orbit} ${c.forces} in this browser…`);
      const hpop = await module('propagator/hpop');
      const inputs = await Promise.all(c.inputs.map(async (i) => frameOf(i.portId, await fetchBytes(`./${i.file}`))));
      const started = performance.now();
      const run = decodeExecution(await hpop.invoke('invoke', inputs));
      let worst = 0, worstAt = 0;
      run.samples.forEach((p, k) => {
        const [t, x, y, z] = c.samples[k + 1];
        const d = Math.hypot(p.position[0] * 1000 - x, p.position[1] * 1000 - y, p.position[2] * 1000 - z);
        if (d > worst) { worst = d; worstAt = t / 3600; }
      });
      const recorded = results.cases.find((r) => r.id === c.id).worstM;
      status($('orekit-status'), `${c.orbit} ${c.forces}: largest difference from Orekit ${formatMeters(worst, 3)} at ${worstAt} h (tolerance ${formatMeters(c.toleranceM)}), ${((performance.now() - started) / 1000).toFixed(2)} s in this browser; the recorded run had ${formatMeters(recorded, 3)}.`);
    } catch (e) { status($('orekit-status'), e.message, true); }
  });
}

// ── VCM round trip ──
async function setupVcm() {
  const text = await (await fetch('./data/vcm/sample-vcm.txt')).text();
  $('vcm-in').textContent = text;
  lineChart($('vcm-chart'), { series: [], x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (h) => `${h} h` }, empty: 'Run the round trip to plot the sigmas.' });
  $('vcm-run').addEventListener('click', () => runVcm(text).catch((e) => status($('vcm-status'), e.message, true)));
}

async function runVcm(text) {
  status($('vcm-status'), 'Loading analysis/vcm-adapter and propagator/hpop…');
  const [adapter, hpop] = await Promise.all([module('analysis/vcm-adapter'), module('propagator/hpop')]);
  const json = (portId, value) => ({ portId, payload: new TextEncoder().encode(JSON.stringify(value)) });
  const out = (response, port) => response.outputs.find((o) => o.portId === port).payload;
  // The sample's epoch is 2023; the DE440 excerpt here covers 2026, so the
  // Sun and Moon come from HPOP's analytical ephemeris for this demo. The
  // format leaves the units of the B row unstated, so both readings run.
  const readings = { fractional: 'B row as a fraction of B', absolute: 'B row as printed (m²/kg)' };
  const runs = {};
  for (const rows of Object.keys(readings)) {
    status($('vcm-status'), `analysis/vcm-adapter read, then propagator/hpop 24 h with the 7×7 covariance (${readings[rows]})…`);
    const read = await adapter.invoke('read', [{ portId: 'message', payload: new TextEncoder().encode(text) }, json('options', { ephemerisSource: 'Analytical', arcSeconds: 86400, parameterRows: rows })]);
    const report = JSON.parse(new TextDecoder().decode(out(read, 'report')));
    // Hourly samples with the covariance, on the request the adapter built.
    const prw = decodePrw(out(read, 'request'));
    const epochMs = Date.parse(`${report.epochUtc}Z`);
    prw.EXECUTION_REQUEST.SAMPLE_EPOCHS = Array.from({ length: 24 }, (_, k) => Object.assign(new P.TIMInstantT(), {
      TIME_SYSTEM: P.timingStandard.UTC, EPOCH_FORMAT: P.timEpochRepresentation.ISO8601, ISO8601: isoMicro(epochMs + (k + 1) * HOUR),
    }));
    const request = encodePrw(prw);
    const run = await hpop.invoke('invoke', [frameOf('request', request), frameOf('earth_orientation', out(read, 'earth_orientation'))]);
    const result = decodePrw(out(run, 'response')).EXECUTION_RESULT;
    const sigmas = [{ hours: 0, s: report.recomputedUvwSigmasKm.slice(0, 3).map((x) => x * 1000) }];
    result.SAMPLES.forEach((sample, k) => {
      const st = sample.STATE.STATE, n = sample.COVARIANCE.DIMENSION, v = sample.COVARIANCE.VALUES;
      const r = [st.POSITION.X, st.POSITION.Y, st.POSITION.Z], vel = [st.VELOCITY.X, st.VELOCITY.Y, st.VELOCITY.Z];
      const u = r.map((x) => x / Math.hypot(...r));
      const h = [r[1] * vel[2] - r[2] * vel[1], r[2] * vel[0] - r[0] * vel[2], r[0] * vel[1] - r[1] * vel[0]];
      const w = h.map((x) => x / Math.hypot(...h));
      const t = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
      const sigma = (a) => Math.sqrt(a.reduce((acc, ai, i) => acc + a.reduce((s, aj, j) => s + ai * v[i * n + j] * aj, 0), 0));
      sigmas.push({ hours: k + 1, s: [sigma(u), sigma(t), sigma(w)] });
    });
    runs[rows] = { report, request, run, sigmas };
  }
  const { report } = runs.fractional;
  const axes = ['U radial', 'V in-track', 'W cross-track'];
  const b = (rows) => runs[rows].report.parameterSigmas.find((p) => p.name === 'B');
  const bRow = (rows, label) => { const p = b(rows); return `<tr><td>${label}</td><td>—</td><td>${p.sigma.toExponential(2)} m²/kg <span class="fine">(${p.sigma / p.value >= 1 ? `${(p.sigma / p.value).toFixed(1)}× B` : `${(100 * p.sigma / p.value).toFixed(1)} % of B`})</span></td></tr>`; };
  $('vcm-sigmas').innerHTML = `<thead><tr><th>Sigma</th><th>VCM prints</th><th>Recomputed</th></tr></thead><tbody>${
    axes.map((a, i) => `<tr><td>${a}</td><td>${formatMeters(report.statedUvwSigmasKm[i] * 1000, 1)}</td><td>${formatMeters(report.recomputedUvwSigmasKm[i] * 1000, 2)}</td></tr>`).join('')
  }${bRow('fractional', 'B, row as a fraction')}${bRow('absolute', 'B, row as printed')}</tbody>`;
  $('vcm-notes').innerHTML = [
    `${report.geopotential} ${report.zonals}Z,${report.tesserals}T; drag ${report.drag} as Jacchia-Roberts; B = ${report.ballisticCoefficientM2Kg} m²/kg, carried as a dynamic parameter.`,
    `Covariance ${report.covarianceSize}×${report.covarianceSize}, scaled by max(1, WTD RMS)² = ${report.covarianceScale.toFixed(4)}; its mean-motion row read as dn/n, the reading that reproduces the printed sigmas of four SP messages within 1 %.`,
    'The printed sigmas do not cover the B row. Read like the mean-motion row, as a fraction of B (the adapter’s default), its sigma is 4 % of B; read as printed in m²/kg, five times B, which a fit with a 40 m in-track sigma would hardly leave. Both run here.',
  ].map((n) => `<li>${n}</li>`).join('');
  const last = (rows) => runs[rows].sigmas.at(-1).s;
  lineChart($('vcm-chart'), {
    series: [
      { name: 'Radial', color: COLORS.muted, points: runs.fractional.sigmas.map((p) => [p.hours, p.s[0]]), label: true, width: 1.5 },
      { name: 'Cross-track', color: COLORS.muted, points: runs.fractional.sigmas.map((p) => [p.hours, p.s[2]]), label: true, width: 1.5 },
      { name: 'In-track, B row as printed', labelText: 'As printed', color: COLORS.second, points: runs.absolute.sigmas.map((p) => [p.hours, p.s[1]]), label: true },
      { name: 'In-track, B row as a fraction', labelText: 'As a fraction', color: COLORS.primary, points: runs.fractional.sigmas.map((p) => [p.hours, p.s[1]]), label: true },
    ],
    x: { min: 0, max: 24, ticks: [0, 6, 12, 18, 24], format: (h) => `${h} h` },
  });
  const header = {
    satelliteNumber: 0, internationalDesignator: report.internationalDesignator, commonName: 'SDN ROUND TRIP', center: 'SDN',
    geopotential: report.geopotential, zonals: report.zonals, tesserals: report.tesserals, drag: report.drag,
    lunarSolar: report.lunarSolar ? 'ON' : 'OFF', solarRadiationPressure: report.solarRadiationPressure ? 'ON' : 'OFF',
    solidEarthTides: report.solidEarthTides ? 'ON' : 'OFF', inTrackThrust: report.inTrackThrust ? 'ON' : 'OFF',
    ballisticCoefficient: report.ballisticCoefficientM2Kg, f10: report.f10, averageF10: report.averageF10, averageAp: report.averageAp,
    taiMinusUtcS: report.taiMinusUtcS, ut1MinusUtcS: report.ut1MinusUtcS, ut1RateMsPerDay: report.ut1RateMsPerDay,
    polarX: report.polarMotionArcsec[0], polarY: report.polarMotionArcsec[1], weightedRms: report.weightedRms, parameterRows: 'fractional',
  };
  const written = await adapter.invoke('write', [frameOf('result', out(runs.fractional.run, 'response')), json('header', header)]);
  const vcmText = new TextDecoder().decode(out(written, 'message'));
  $('vcm-out').textContent = vcmText;
  status($('vcm-status'), `Read, propagated and written in this browser. In-track sigma ${formatMeters(runs.fractional.sigmas[0].s[1])} at epoch; after a day ${formatMeters(last('fractional')[1])} with the B row as a fraction of B, ${formatMeters(last('absolute')[1])} as printed.`);
  const box = $('vcm-downloads');
  box.innerHTML = '';
  downloadButton(box, 'VCM written', 'sdn-round-trip.vcm.txt', () => vcmText, 'text/plain');
  downloadButton(box, 'Adapter reports', 'vcm-read-reports.json', () => JSON.stringify({ fractional: runs.fractional.report, absolute: runs.absolute.report }, null, 2), 'application/json');
  downloadButton(box, 'PRW request', 'vcm-request.prw', () => runs.fractional.request);
  downloadButton(box, 'PRW result', 'vcm-result.prw', () => out(runs.fractional.run, 'response'));
  downloadButton(box, 'Sigmas CSV', 'vcm-sigmas.csv', () => toCsv(['hours', 'radial_m', 'in_track_m', 'cross_track_m', 'in_track_b_row_as_printed_m'],
    runs.fractional.sigmas.map((p, k) => [p.hours, ...p.s.map((x) => x.toFixed(3)), runs.absolute.sigmas[k].s[1].toFixed(3)])), 'text/csv');
}

// ── Experiments ──
function renderExperiments() {
  const cards = [
    ['V1', 'Reported', 'HPOP against real orbits', 'HPOP seeded from SLR and GPS precise orbits and compared with them, force model by force model. The results above.', 'experiments/v1-hpop-physical-truth/PLAN.md', 'results/v1/README.md'],
    ['E1', 'Plan; harness checked; truth being fetched', 'Correcting GPS element sets at epoch', 'Can a public element set be made more accurate at its epoch, with an honest uncertainty, using only what is known when it is published? Ly et al. report 65 %; the primary statistic is decided (5 robust-sigma clipped RMS) before any fit.', 'experiments/e1-gps-epoch/PLAN.md', 'results/e1/a0/REPORT.md'],
    ['E2', 'Plan in draft', 'Covariance from catalog history', 'VCM-equivalent products (state, B, BDOT, AGOM, covariance) from public catalog history and E1’s corrections, with covariance realism measured against precise orbits at 0, 1, 3 and 7 days.', 'experiments/e2-catalog-covariance/PLAN.md', 'docs/vcm-parity.md'],
  ];
  $('experiment-cards').innerHTML = cards.map(([id, stage, title, text, plan, more]) => `<div class="panel"><p class="state">${id} · ${stage}</p><h3>${title}</h3><p>${text}</p><a href="${GITHUB}/blob/main/${plan}">Plan ↗</a> &nbsp; <a href="${GITHUB}/blob/main/${more}">${more.split('/').pop()} ↗</a></div>`).join('');
}

// ── Data ──
function renderData() {
  const p = state.provenance;
  const size = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b > 1e3 ? `${(b / 1e3).toFixed(0)} kB` : `${b} B`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const groups = [
    ['modules/', 'Module binaries', 'The WebAssembly this page runs, byte for byte the artifacts the experiments ran.'],
    ['data/truth/', 'Precise orbits', 'GCRF positions and velocities at the epochs V1 compares: SLR spheres every 10 min, GPS every 15 min.'],
    ['data/v1/', 'V1 results', 'The committed run: seeds, per-seed errors, summary and manifest.'],
    ['data/orekit/', 'HPOP against Orekit', 'The reference trajectories, every case’s exact PRW request and inputs, and the recorded HPOP results.'],
    ['data/kernel/', 'Ephemeris', 'The DE440 excerpt for 2026 the propagations read for the Sun and Moon.'],
    ['data/eop/', 'Earth orientation', 'The IERS EOP 20 C04 rows over the V1 arcs.'],
    ['data/vcm/', 'VCM', 'The sample message the round trip reads.'],
    ['data/e1/', 'E1', 'Aggregates of E1’s checked steps; no element set and no per-sample table.'],
  ];
  const html = groups.map(([prefix, title, text]) => {
    const files = p.files.filter((f) => f.path.startsWith(prefix));
    if (!files.length) return '';
    const sources = [...new Set(files.map((f) => f.source))], terms = [...new Set(files.map((f) => f.license))];
    const perFile = sources.length > 1;
    const table = (list) => `<div class="table-wrap"><table class="data-table compact"><thead><tr><th>File</th><th class="num">Size</th><th>SHA-256</th></tr></thead><tbody>${
      list.map((f) => `<tr><td class="file"><a href="./${esc(f.path)}" download>${esc(f.path.slice(prefix.length))}</a>${perFile ? `<span class="source">${esc(f.source)}</span>` : ''}</td><td class="num">${size(f.bytes)}</td><td class="hash" title="${f.sha256}">${f.sha256.slice(0, 12)}…</td></tr>`).join('')}</tbody></table></div>`;
    const total = files.reduce((a, f) => a + f.bytes, 0);
    const meta = `<p class="fine">${perFile ? '' : `${esc(sources[0])}. `}Terms: ${esc(terms.join('; '))}.</p>`;
    // Long groups: the documents open, the bulk (arcs, requests) folded.
    let shown = files, folded = [];
    if (files.length > 8) {
      shown = prefix === 'data/truth/' ? [] : files.filter((f) => f.path.endsWith('.json'));
      folded = files.filter((f) => !shown.includes(f));
    }
    const foldedSize = folded.reduce((a, f) => a + f.bytes, 0);
    const body = `${shown.length ? table(shown) : ''}${folded.length ? `<details><summary>${folded.length} ${prefix === 'data/orekit/' ? 'PRW requests and shared inputs' : 'files'}, ${size(foldedSize)}</summary>${table(folded)}</details>` : ''}`;
    return `<div class="panel file-group"><h3>${title} <span class="fine">${files.length} file${files.length > 1 ? 's' : ''} · ${size(total)}</span></h3><p>${text}</p>${meta}${body}</div>`;
  }).join('');
  $('files').innerHTML = html;
  $('provenance').textContent = `Built ${p.built} from orbit-accuracy-experiments ${p.repository.commit?.slice(0, 10)}${p.repository.dirty ? ' (uncommitted changes)' : ''} and space-data-network-modules ${p.modulesRepository.commit?.slice(0, 10)}; space-data-module-sdk ${p.sdk}, spacedatastandards.org ${p.spacedatastandards}, CesiumJS ${p.cesium} (Apache-2.0). provenance.json lists every file with its hash.`;
}

main().catch((e) => { console.error(e); status($('status'), e.message, true); });
