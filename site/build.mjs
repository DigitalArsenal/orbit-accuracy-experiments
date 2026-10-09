#!/usr/bin/env node
// Builds site/dist, the GitHub Pages site, from this repository and local
// inputs. The page runs the experiments' modules in the visitor's browser
// through the space-data-module-sdk harness, on a CesiumJS globe.
//
// Everything written to dist is public: the module binaries (the owner's
// decision of 2026-10-08), precise orbits (IGS final orbits, ILRS combined
// SLR orbits), IERS EOP 20 C04 rows, a JPL DE440 excerpt, Orekit reference
// trajectories, the survey's sample VCM, and the committed results. No
// Space-Track element set, and no per-sample table derived from one, is read.
//
//   node site/build.mjs [--modules DIR] [--reference DIR] [--eop FILE]
//
// Defaults as in the V1 config, overridden by SDN_MODULES_ROOT,
// SDN_REFERENCE_STATES and SDN_EOP_C04.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import { loadModule, modulesRoot, gitState } from '../harness/modules.mjs';
import { kernelFrame } from '../harness/prw.mjs';
import { c04Records, eopFrame } from '../harness/eop.mjs';
import { selectSeeds, utcMs } from '../experiments/v1-hpop-physical-truth/seeds.mjs';
import { MODELS, PAPERS, headingIds } from './src/models/registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const dist = path.join(here, 'dist');
const { values } = parseArgs({ options: { modules: { type: 'string' }, reference: { type: 'string' }, eop: { type: 'string' } } });
const v1Config = JSON.parse(fs.readFileSync(path.join(repo, 'experiments/v1-hpop-physical-truth/config.json'), 'utf8'));
const modules = modulesRoot({ flag: values.modules, configured: v1Config.inputs.modules, repoRoot: repo });
const referenceDir = path.resolve(values.reference ?? process.env.SDN_REFERENCE_STATES ?? v1Config.inputs.reference);
const eopFile = path.resolve(values.eop ?? process.env.SDN_EOP_C04 ?? v1Config.inputs.eop);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const files = [];  // every data file: {path, bytes, sha256, source, license}
const write = (relative, bytes, source, license) => {
  const file = path.join(dist, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(typeof bytes === 'string' ? bytes : JSON.stringify(bytes));
  fs.writeFileSync(file, buffer);
  if (source) files.push({ path: relative, bytes: buffer.length, sha256: sha256(buffer), source, license });
  return relative;
};
// A plain walk: fs.cpSync carries directory modes over, which some mounted
// file systems refuse.
const copyTree = (from, to) => {
  const target = path.join(dist, to);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyTree(path.join(from, entry.name), path.join(to, entry.name));
    else fs.writeFileSync(path.join(target, entry.name), fs.readFileSync(path.join(from, entry.name)));
  }
};
const log = (...a) => console.log('[site]', ...a);

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// ── Static assets ──
copyTree(path.join(here, 'node_modules/cesium/Build/Cesium'), 'vendor/cesium');
fs.copyFileSync(path.join(here, 'node_modules/cesium/LICENSE.md'), path.join(dist, 'vendor/cesium/LICENSE.md'));
fs.copyFileSync(path.join(here, 'node_modules/coi-serviceworker/coi-serviceworker.min.js'), path.join(dist, 'coi-serviceworker.js'));
copyTree(path.join(here, 'src/vendor'), 'vendor');
for (const name of ['index.html', 'site.css', 'models.css']) fs.copyFileSync(path.join(here, 'src', name), path.join(dist, name));
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

// ── Modules: the exact artifacts the experiments ran ──
const moduleList = ['propagator/hpop', 'foundation/time', 'analysis/vcm-adapter', 'analysis/epoch-state', 'foundation/orbits',
  'foundation/frames', 'files/orbit-products', 'analysis/conjunction-assessment'];
const moduleIndex = [];
const modulesGit = gitState(modules);
for (const relative of moduleList) {
  const wasm = fs.readFileSync(path.join(modules, relative, 'dist/isomorphic/module.wasm'));
  const manifest = fs.readFileSync(path.join(modules, relative, 'plugin-manifest.json'));
  const m = JSON.parse(manifest);
  write(`modules/${relative}/module.wasm`, wasm, `space-data-network-modules ${modulesGit.commit?.slice(0, 8)} ${relative}/dist/isomorphic/module.wasm`, 'Module binary, © Edgesource Corporation; published for this site');
  write(`modules/${relative}/plugin-manifest.json`, manifest);
  moduleIndex.push({ path: relative, pluginId: m.pluginId, version: m.version, wasmSha256: sha256(wasm), bytes: wasm.length });
}
log(`modules: ${moduleIndex.map((m) => `${m.path} ${m.wasmSha256.slice(0, 12)}`).join(', ')}`);

// ── V1: seeds, truth arcs, results ──
const seeds = selectSeeds(v1Config, referenceDir);
const objects = new Map();  // object -> {group, norad, product, states Map}
for (const s of seeds) {
  const o = objects.get(s.object) ?? { group: s.group, norad: s.norad, products: new Set(), states: new Map() };
  o.products.add(s.product);
  for (const [t, state] of s.states) o.states.set(t, state);
  objects.set(s.object, o);
}
const ILRS = 'ILRS combined SLR orbits (ilrsa), via analysis/reference-states';
const IGS = 'IGS final orbits IGS0OPSFIN, via analysis/reference-states';
for (const [name, o] of objects) {
  const step = o.group === 'SLR' ? 600000 : 0;  // SLR arcs every 2 min, kept every 10 min
  const times = [...o.states.keys()].sort((a, b) => a - b).filter((t) => !step || t % step === 0);
  // Full precision: the page seeds HPOP from these states and compares with
  // the committed run, which a rounded velocity would move by decimetres.
  const r = [], v = [];
  for (const t of times) {
    const s = o.states.get(t);
    r.push(...s.position);
    v.push(...s.velocity);
  }
  write(`data/truth/${name}.json`, { object: name, norad: o.norad, group: o.group, products: [...o.products], frame: 'GCRF', timeSystem: 'UTC', units: 'km, km/s', epochsUnixMs: times, position: r, velocity: v },
    o.group === 'SLR' ? ILRS : IGS, o.group === 'SLR' ? 'ILRS data policy: open, cite the ILRS' : 'IGS data policy: open, cite the IGS');
}
const seedIndex = seeds.map((s, i) => ({
  id: i, group: s.group, object: s.object, norad: s.norad, arc: s.arc, seedUnixMs: utcMs(s.seed.epoch), seedUtc: s.seed.epoch,
  params: s.params, horizonsHours: v1Config.horizonsHours,
}));
write('data/v1/seeds.json', seedIndex, 'V1 seed selection (experiments/v1-hpop-physical-truth/seeds.mjs)', 'MIT');
const resultsDir = path.join(repo, 'results/v1');
const latest = fs.readdirSync(resultsDir).filter((d) => d.startsWith('v1-')).sort().at(-1);
const metrics = JSON.parse(fs.readFileSync(path.join(resultsDir, latest, 'metrics.json'), 'utf8'));
write('data/v1/metrics.json', fs.readFileSync(path.join(resultsDir, latest, 'metrics.json')), `results/v1/${latest}/metrics.json`, 'MIT');
write('data/v1/manifest.json', fs.readFileSync(path.join(resultsDir, latest, 'manifest.json')), `results/v1/${latest}/manifest.json`, 'MIT');
const csv = ['group,object,norad,seed_utc,configuration,hours,error_m'];
for (const r of metrics.results) if (Number.isFinite(r.errorM)) csv.push([r.group, r.object, r.norad, r.seedEpoch, r.configuration, r.hours, r.errorM.toFixed(4)].join(','));
write('data/v1/v1-errors.csv', `${csv.join('\n')}\n`, `results/v1/${latest}/metrics.json, flattened`, 'MIT');
write('data/v1/config.json', v1Config, 'experiments/v1-hpop-physical-truth/config.json', 'MIT');

// Kernel and Earth orientation, framed as the V1 run frames them.
const kernelBytes = fs.readFileSync(path.join(modules, v1Config.inputs.kernel));
write('data/kernel/de440-2026.bsp', kernelBytes, `JPL DE440, 2026 excerpt (${v1Config.inputs.kernel})`, 'JPL ephemerides, public');
write('data/kernel/de440-2026.prw', Buffer.from(kernelFrame(kernelBytes).payload), 'The DE440 excerpt as a PRW NATIVE_INPUT frame', 'JPL ephemerides, public');
{
  const parser = await loadModule(modules, 'data-source/eop-parser');
  const parsed = await c04Records(parser, eopFile);
  const mjd = (ms) => Math.floor(ms / 86400000) + 40587;
  const first = Math.min(...seeds.map((s) => mjd(utcMs(s.seed.epoch)))) - 1;
  const last = Math.max(...seeds.flatMap((s) => s.targets.map((t) => mjd(utcMs(t.truth.epoch))))) + 2;
  const frame = eopFrame(parsed.records, first, last);
  write('data/eop/eop-v1.prw', Buffer.from(frame.payload), `IERS EOP 20 C04 rows MJD ${first}..${last} through data-source/eop-parser, as a PRW EARTH_ORIENTATION frame`, 'IERS data, free with attribution');
  write('data/eop/eop-v1.json', parsed.records.filter((r) => r.mjd >= first && r.mjd <= last).map((r) => r.row), 'The same rows as $EOP objects', 'IERS data, free with attribution');
  await parser.destroy();
}

// ── HPOP against Orekit: the reference cases and their exact requests ──
{
  const cases = await import(pathToFileURL(path.join(modules, 'propagator/hpop/tests/lib/orekitCases.mjs')));
  const shared = new Map();
  const index = [];
  cases.REFERENCE.cases.forEach((c, i) => {
    const inputs = cases.requestInputs(c).map((input) => {
      const bytes = Buffer.from(input.payload);
      if (input.portId === 'request') return { portId: 'request', file: write(`data/orekit/request-${String(i).padStart(2, '0')}.prw`, bytes, `PRW EXECUTION_REQUEST for ${c.orbit} ${c.forces}, built by propagator/hpop tests/lib/orekitCases.mjs`, 'MIT') };
      const key = sha256(bytes);
      if (!shared.has(key)) shared.set(key, write(`data/orekit/${input.portId}-${key.slice(0, 12)}.prw`, bytes, `PRW ${input.portId} input shared by the cases (tests/lib/orekitCases.mjs)`, input.portId === 'kernel' ? 'JPL ephemerides, public' : 'MIT'));
      return { portId: input.portId, file: shared.get(key) };
    });
    index.push({ id: i, orbit: c.orbit, forces: c.forces, toleranceM: cases.toleranceFor(c), inputs, samples: c.samples.map((s) => s.slice(0, 4)), parameters: c.parameters ?? null });
  });
  write('data/orekit/cases.json', index, 'propagator/hpop tests/fixtures/orekit/orekit-reference.json (Orekit 13.1) with the requests tests/lib/orekitCases.mjs builds', 'Apache-2.0 (Orekit); MIT');
  write('data/orekit/orekit-reference.json', fs.readFileSync(path.join(modules, 'propagator/hpop/tests/fixtures/orekit/orekit-reference.json')), 'Orekit 13.1 reference trajectories (OrekitReference.java)', 'Apache-2.0');
  // The recorded run (site/run-orekit.mjs) must be of the binary published here.
  const recorded = path.join(here, 'generated/orekit-results.json');
  const results = fs.existsSync(recorded) ? JSON.parse(fs.readFileSync(recorded, 'utf8')) : null;
  const hpopSha = moduleIndex.find((m) => m.path === 'propagator/hpop').wasmSha256;
  if (results?.hpopWasmSha256 !== hpopSha || results.cases.length !== index.length) {
    throw new Error(`site/generated/orekit-results.json is ${results ? `for HPOP ${results.hpopWasmSha256.slice(0, 12)} with ${results.cases.length} cases` : 'missing'}; this build publishes HPOP ${hpopSha.slice(0, 12)} with ${index.length}. Run node site/run-orekit.mjs first.`);
  }
  write('data/orekit/results.json', fs.readFileSync(recorded), `site/run-orekit.mjs on HPOP ${hpopSha.slice(0, 12)} (${results.runtime})`, 'MIT');
}

// ── The VCM sample and E1's committed aggregates ──
write('data/vcm/sample-vcm.txt', fs.readFileSync(path.join(modules, 'analysis/vcm-adapter/tests/fixtures/sample-vcm.txt')), 'spacedatastandards.org survey/legacy-messages/vcm/sample/vcm.txt', 'Apache-2.0 (Space Data Standards survey)');
for (const step of fs.readdirSync(path.join(repo, 'results/e1/a0')).filter((d) => d.startsWith('e1-'))) {
  write(`data/e1/a0/${step}.json`, fs.readFileSync(path.join(repo, 'results/e1/a0', step, 'metrics.json')), `results/e1/a0/${step}/metrics.json (aggregates only)`, 'MIT');
}

// ── Inputs of the paper models ──
// Vallado's SGP4 verification set (public test vectors, as python-sgp4
// ships them) with pyerfa GCRF expectations, from analysis/epoch-state.
write('data/tle/vallado-verification.json', fs.readFileSync(path.join(modules, 'analysis/epoch-state/tests/vallado-verification.json')),
  'analysis/epoch-state tests/vallado-verification.json: Vallado SGP4-VER.TLE and tcppver.out t=0 rows (python-sgp4 2.27), GCRF by pyerfa', 'Public test vectors (Vallado et al. 2006); MIT (python-sgp4)');
write('data/ocm/ccsds-ocm-example-2.txt', fs.readFileSync(path.join(here, 'src/data/ccsds-ocm-example-2.txt')),
  'CCSDS 502.0-B-3 OCM example (OSPREY 5), as Orekit 13.1 ships it in src/test/resources/ccsds/odm/ocm/OCMExample2.txt', 'Apache-2.0 (Orekit test resources)');
{
  // Earth orientation at the OCM example's epoch, framed as V1's rows are.
  const parser = await loadModule(modules, 'data-source/eop-parser');
  const parsed = await c04Records(parser, eopFile);
  const first = 51164, last = 51168;  // 1998-12-16 .. 20
  write('data/eop/eop-1998-12.prw', Buffer.from(eopFrame(parsed.records, first, last).payload), `IERS EOP 20 C04 rows MJD ${first}..${last} through data-source/eop-parser, as a PRW EARTH_ORIENTATION frame`, 'IERS data, free with attribution');
  write('data/eop/eop-1998-12.json', parsed.records.filter((r) => r.mjd >= first && r.mjd <= last).map((r) => r.row), 'The same rows as $EOP objects', 'IERS data, free with attribution');
  await parser.destroy();
}
// The SDS schemas' fields and their documentation, for the field explorers.
const sdsSchemaFields = (code) => {
  const text = fs.readFileSync(path.join(repo, 'node_modules/spacedatastandards.org/schema', code, 'main.fbs'), 'utf8');
  const tables = {};
  let table = null, doc = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const open = /^table\s+(\w+)\s*\{/.exec(line);
    if (open) { table = tables[open[1]] = []; doc = []; continue; }
    if (line.startsWith('}')) { table = null; continue; }
    if (line.startsWith('///')) { doc.push(line.slice(3).trim()); continue; }
    const field = table && /^(\w+)\s*:\s*([^;=(]+)/.exec(line);
    if (field) table.push({ name: field[1], type: field[2].trim(), doc: doc.join(' ') });
    if (!line.startsWith('///')) doc = [];
  }
  return tables;
};
const sdsVersion = JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/spacedatastandards.org/package.json'), 'utf8')).version;
for (const code of ['OCM', 'VCM']) write(`data/sds/${code}.json`, { schema: `${code}.fbs`, version: sdsVersion, tables: sdsSchemaFields(code) }, `spacedatastandards.org ${sdsVersion} schema/${code}/main.fbs, fields and doc comments`, 'Apache-2.0 (Space Data Standards)');

// Each experiment's results: results/<id>/metrics.json, or the latest run
// directory under results/<id>/ that holds one; the models page shows each.
const experimentResults = [];
for (const id of ['e1', 'e2', 'e3', 'e4', 'e5']) {
  const dir = path.join(repo, 'results', id);
  if (!fs.existsSync(dir)) continue;
  const runs = fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, 'metrics.json'))).sort();
  const relative = fs.existsSync(path.join(dir, 'metrics.json')) ? 'metrics.json' : runs.length ? `${runs.at(-1)}/metrics.json` : null;
  if (!relative) continue;
  write(`results/${id}/metrics.json`, fs.readFileSync(path.join(dir, relative)), `results/${id}/${relative}`, 'MIT');
  experimentResults.push(id);
}
write('data/experiments.json', { published: experimentResults });

// ── The paper models: a page per section, and the manifest the paper apps read ──
{
  const papersDir = process.env.SDN_WHITEPAPERS ?? path.join(modules, '..', 'space-data-network', 'whitepapers');
  const ids = {};
  const manifest = [];
  const template = fs.readFileSync(path.join(here, 'src/models/page.html'), 'utf8');
  const fill = (text, values) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => values[k] ?? '');
  const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  for (const m of MODELS) {
    if (!fs.existsSync(path.join(here, 'src/models', m.paper, `${m.model}.js`))) throw new Error(`model ${m.paper}/${m.model}.js is missing`);
    if (!ids[m.paper]) {
      const file = path.join(papersDir, `${m.paper}.md`);
      ids[m.paper] = fs.existsSync(file) ? headingIds(fs.readFileSync(file, 'utf8')) : null;
      if (!ids[m.paper]) log(`warning: ${file} not found; section ids are not checked against the paper`);
    }
    const sectionId = ids[m.paper] ? ids[m.paper].get(m.heading) : headingIds(`## ${m.heading}`).get(m.heading);
    if (!sectionId) throw new Error(`${m.paper} has no heading "${m.heading}"`);
    const url = `models/${m.paper}/${sectionId}.html`;
    manifest.push({ paper: m.paper, section_id: sectionId, title: m.title, url });
    fs.mkdirSync(path.join(dist, 'models', m.paper), { recursive: true });
    fs.writeFileSync(path.join(dist, url), fill(template, {
      base: '../../', paper: m.paper, model: m.model, title: escHtml(m.title), claim: escHtml(m.claim),
      paperTitle: escHtml(PAPERS[m.paper]), heading: escHtml(m.heading),
      paperUrl: `https://spacedatanetwork.org/whitepapers/${m.paper}.html#${sectionId}`,
    }));
  }
  write('models/index.json', JSON.stringify(manifest, null, 2));
  const list = Object.entries(PAPERS).map(([paper, name]) => `<h2>${escHtml(name)}</h2><ul>${manifest.filter((x) => x.paper === paper)
    .map((x) => `<li><a href="./${x.url.slice('models/'.length)}">${escHtml(x.title)}</a><span>§ ${escHtml(MODELS.find((m) => m.paper === paper && x.title === m.title).heading)}</span></li>`).join('')}</ul>`).join('');
  fs.writeFileSync(path.join(dist, 'models/index.html'), fill(fs.readFileSync(path.join(here, 'src/models/index.html'), 'utf8'), { list }));
  log(`models: ${manifest.length} pages`);
}

// ── The app: the same harness code the experiments run ──
await esbuild.build({
  entryPoints: { app: path.join(here, 'src/app.js'), models: path.join(here, 'src/models/main.js') },
  // Splitting keeps the SDK's lazily imported crypto backend out of the
  // first load: it is fetched only if a signature is checked.
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', conditions: ['browser'],
  splitting: true, outdir: dist, entryNames: '[name]', chunkNames: 'chunks/[name]-[hash]',
  minify: true, legalComments: 'linked',
  // The modules repository's own host adapters (record movers) bundle with
  // this site's SDS and flatbuffers, not the checkout's.
  alias: {
    'node:crypto': path.join(here, 'src/shims/node-crypto.js'), '@sdn-modules': modules,
    'spacedatastandards.org': path.join(repo, 'node_modules/spacedatastandards.org'), flatbuffers: path.join(repo, 'node_modules/flatbuffers'),
  },
  nodePaths: [path.join(repo, 'node_modules'), path.join(here, 'node_modules')],
  define: { __HD_WALLET_VERSION__: JSON.stringify(JSON.parse(fs.readFileSync(path.join(here, 'node_modules/hd-wallet-wasm/package.json'), 'utf8')).version) },
  logLevel: 'warning',
});

// ── Provenance ──
const repoGit = gitState(repo);
write('provenance.json', {
  built: new Date().toISOString(),
  repository: { name: 'orbit-accuracy-experiments', ...repoGit },
  modulesRepository: modulesGit,
  modules: moduleIndex,
  v1Run: latest,
  sdk: JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/space-data-module-sdk/package.json'), 'utf8')).version,
  spacedatastandards: JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/spacedatastandards.org/package.json'), 'utf8')).version,
  cesium: JSON.parse(fs.readFileSync(path.join(here, 'node_modules/cesium/package.json'), 'utf8')).version,
  files,
});
const total = execFileSync('du', ['-sh', dist], { encoding: 'utf8' }).split('\t')[0];
log(`wrote ${path.relative(repo, dist)} (${total}): ${files.length} data files, V1 run ${latest}, ${objects.size} truth arcs`);
