// The truth gate's scan (harness/truth-gate.mjs): every truth set on this machine through the full rules, into experiments/truth-gate/
// flags.json: every flagged state, with its rule, reason and action, and every set scanned. Drops are listed by product, object
// and epoch, which is what gate() reads. Counting and subtraction; the confirmation of a jump is propagator/ffm's (G1's wrapper), and frames
// are foundation/frames'.
// The readers are called raw (the states as written), so a re-run reproduces the ledger.
//   SDN_MODULES_ROOT=<modules checkout> node experiments/truth-gate/scan.mjs [--only centers,reference,iss,packs,spk,capture] [--products <a,b>] [--out <file>] [--merge]
// --products limits the reference part to those product directories; --out writes there instead of experiments/truth-gate/ (check.mjs).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { RULES, sanity, screen } from '../../harness/truth-gate.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const A = process.env.SDN_ARCHIVE ?? '/opt/data/sdn-archive';
const G1S = path.join(A, 'sdn-gp-starlink-ffm-match');
if (process.argv.includes('--merge')) { // the parts written by --only runs, merged into flags.json in the order of PARTS
  const PARTS = ['centers', 'reference', 'iss', 'packs', 'spk', 'capture'];
  const files = PARTS.map((p) => path.join(here, `flags.${p}.json`));
  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) throw new Error(`--merge needs every part: missing ${missing.map((f) => path.basename(f)).join(', ')}`);
  const parts = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  fs.writeFileSync(path.join(here, 'flags.json'), `${JSON.stringify({ rules: parts[0].rules, sets: parts.flatMap((p) => p.sets), flags: parts.flatMap((p) => p.flags) }, null, 1)}\n`);
  for (const f of files) fs.unlinkSync(f);
  console.error(`truth gate: merged ${parts.length} parts`);
  process.exit(0);
}
const opt = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const productsOnly = opt('--products') ? new Set(opt('--products').split(',')) : null;
const want = (x) => !only || only.has(x);
const g1 = (n) => import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match', n));
const flags = [], sets = [];
const iso = (t) => new Date(t).toISOString();
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const median = (v) => { const a = [...v].sort((x, y) => x - y); return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2; };
const CENTER_SET = 'ILRS combined weekly orbits against the analysis centers (SP3)';
const ILRS_NORAD = { etalon1: 19751, etalon2: 20026, lageos1: 8820, lageos2: 22195, ajisai: 16908, starlette: 7646, stella: 22824, larets: 27944, westpac: 25398, lares: 38077, lares2: 53105 };

// 1. The center rule over every group of SP3 products of one satellite and week with the combination and at least two analysis centers.
function readSp3(file) {
  const out = new Map();
  let t = null;
  for (const line of zlib.gunzipSync(fs.readFileSync(file)).toString('latin1').split('\n')) {
    if (line.startsWith('*')) { const p = line.trim().split(/\s+/); t = Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4], +p[5], Math.round(+p[6])); }
    else if (line.startsWith('P') && t !== null) { const p = line.trim().split(/\s+/); const v = p.slice(1, 4).map(Number); if (v.every(Number.isFinite)) out.set(t, v); }
  }
  return out;
}
if (want('centers')) {
  const dirs = [path.join(A, 'reference-states/products'), path.join(A, 'v1c5/truth/download-cache/products')].filter((d) => fs.existsSync(d));
  const groups = new Map();
  for (const d of dirs) for (const f of fs.readdirSync(d)) {
    const m = /^([a-z]+)\.orb\.([a-z0-9]+)\.(\d{6})\.(v\d+)\.sp3\.gz$/.exec(f);
    if (!m) continue;
    const k = `${m[2]}|${m[3]}|${m[4]}`;
    if (!groups.has(k)) groups.set(k, {});
    groups.get(k)[m[1]] ??= path.join(d, f);
  }
  let compared = 0, states = 0;
  for (const [k, centers] of [...groups.entries()].sort()) {
    if (!centers.ilrsa || Object.keys(centers).length < 3) continue;
    const [sat, week, version] = k.split('|');
    const il = readSp3(centers.ilrsa), others = Object.entries(centers).filter(([c]) => c !== 'ilrsa').map(([, f]) => readSp3(f));
    compared += 1;
    for (const [t, a] of il) {
      const pts = others.map((o) => o.get(t)).filter(Boolean);
      if (pts.length < 2) continue;
      states += 1;
      const d = median(pts.map((p) => dist(a, p)));
      let spread = 0;
      for (const p of pts) for (const q of pts) spread = Math.max(spread, dist(p, q));
      if (d > RULES.centerWrongKm && spread < RULES.centerAgreeKm) flags.push({ set: CENTER_SET, product: `ilrsa.orb.${sat}.${week}.${version}`, norad: ILRS_NORAD[sat] ?? null, epoch: iso(t), rule: 'center', reason: `${d.toFixed(3)} km from the median of ${pts.length} analysis centers, which agree within ${(spread * 1000).toFixed(1)} m`, km: Number(d.toFixed(3)), action: 'drop' });
    }
  }
  sets.push({ set: CENTER_SET, directories: dirs, groups: compared, states });
}

// The jump rule's confirmation: FFM from the previous good state (GCRF, m) to the candidate's epoch, a priori area-to-mass, drag on.
let ffm = null;
async function confirm(series, i, center = 'EARTH') {
  if (center !== 'EARTH') return { confirmed: null, why: `no full-force confirmation about ${center.toLowerCase()} here` };
  let j = i - 1;
  while (j >= 0 && series[j].candidate) j -= 1;
  if (j < 0) { j = i + 1; while (j < series.length && series[j].candidate) j += 1; }
  if (j < 0 || j >= series.length || !series[j].v || !series[j].v.some((c) => c !== 0)) return { confirmed: null, why: 'no good neighbor with a velocity to start from' };
  ffm ??= await (async () => {
    const FFM = await g1('lib/ffm.mjs'), { modulesRoot } = await g1('lib/modules.mjs');
    const modules = modulesRoot();
    const ctx = await FFM.loadEnvironment(modules, { archive: A, store: G1S });
    const { ffmEnvironment } = await import(path.join(root, 'experiments/sdn-ap-baselines/lib/environment.mjs')); // B1's Earth orientation and space weather, 2012 on
    const env = await ffmEnvironment(modules, ctx);
    return { FFM, modules, ctx, env };
  })();
  const s = series[j], target = series[i];
  try {
    const res = await ffm.FFM.propagate(ffm.modules, { ...ffm.ctx, inputs: ffm.env.inputsFor(Math.min(s.ms, target.ms), Math.max(s.ms, target.ms)) }, { epoch: iso(s.ms), state: [...s.r, ...s.v].map((x) => x * 1000), cdAm: 0.01, crAm: 0.02, epochs: [target.ms] });
    const miss = dist(res.samples[0].state.slice(0, 3).map((x) => x / 1000), target.r);
    return { confirmed: miss > RULES.jumpKm, km: Number(miss.toFixed(3)), from: iso(s.ms) };
  } catch (error) { return { confirmed: null, why: `full force model: ${String(error.message).slice(0, 120)}` }; }
}

/** One series through the sanity rule and the jump rule; flags carry the set, the product and the object. */
async function scanSeries(set, product, norad, series, { center = 'EARTH', confirmable = true } = {}) {
  for (const x of series) { const why = sanity(x.r, center); if (why) flags.push({ set, product, norad, epoch: iso(x.ms), rule: 'sanity', reason: why, action: 'drop' }); }
  const { candidates, thresholdKm, medianKm } = screen(series);
  for (const i of candidates) series[i].candidate = true;
  for (const i of candidates) {
    if (sanity(series[i].r, center)) continue; // already dropped by the sanity rule
    const c = confirmable ? await confirm(series, i, center) : { confirmed: null, why: 'not confirmable for this set' };
    const base = { set, product, norad, epoch: iso(series[i].ms), rule: 'jump', screenThresholdKm: Number(thresholdKm.toFixed(3)), screenMedianKm: Number(medianKm.toFixed(4)) };
    if (c.confirmed === true) flags.push({ ...base, reason: `the full force model from ${c.from} misses it by ${c.km} km`, km: c.km, action: 'drop' });
    else if (c.confirmed === null) flags.push({ ...base, reason: `screen only (${c.why})`, action: 'report' });
  }
  return series.length;
}

// 2. Converted reference states (analysis/reference-states output, GCRF): every product directory of every reference directory.
if (want('reference')) {
  const { readReference } = await g1('lib/sources.mjs');
  const dirs = [['reference-states', path.join(A, 'reference-states/reference')], ['reference-states finals2000a', path.join(A, 'reference-states/reference-finals2000a')], ['reference-states LEO POD 2', path.join(A, 'reference-states/reference-leo-pod-2')],
    ['V1c5 refreshed truth', path.join(A, 'v1c5/truth/reference-finals2000a')], ['G1 laser-ranging copies (CDDIS)', path.join(G1S, 'slr-ref/reference')], ['G1 GFZ rapid orbits', path.join(G1S, 'gnss-rapid/reference')], ['E14 MGEX orbits', path.join(A, 'e14-covariance-realism/reference')],
    ['V1c5 re-score truth', path.join(A, 'v1c5-rescore/truth/reference')]];
  for (const [name, dir] of dirs) {
    if (!fs.existsSync(dir)) continue;
    let products = 0, objects = 0, states = 0;
    for (const product of fs.readdirSync(dir).sort()) {
      if (productsOnly && !productsOnly.has(product)) continue;
      const pdir = path.join(dir, product);
      if (!fs.statSync(pdir).isDirectory()) continue;
      products += 1;
      for (const f of fs.readdirSync(pdir).filter((x) => x.endsWith('.oem'))) {
        let ref;
        try { ref = readReference(path.join(pdir, f), { raw: true }); } catch { continue; }
        objects += 1;
        states += await scanSeries(name, product, ref.norad, ref.lines.map((l) => ({ ms: Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`), r: l.r, v: l.v })));
      }
    }
    sets.push({ set: name, directory: dir, products, objects, states });
    console.error(`${name}: ${products} products, ${objects} objects, ${states} states`);
  }
}

// 3. NASA's ISS trajectory files (EME2000), the archive and G1's single copy, under the product the readers use (nasa-iss-oem/<CREATION_DATE>):
// the confirmation needs GCRF, so candidates are reported.
if (want('iss')) {
  const { issArchiveFiles, parseIssOem } = await g1('lib/iss-oem.mjs');
  const single = path.join(A, 'hac/nasa-iss-oem');
  const all = [...issArchiveFiles().map((x) => x.file), ...(fs.existsSync(single) ? fs.readdirSync(single).map((d) => path.join(single, d, 'ISS.OEM_J2K_EPH.txt')).filter((f) => fs.existsSync(f)) : [])];
  let files = 0, states = 0;
  for (const file of all) {
    const p = parseIssOem(fs.readFileSync(file, 'utf8'), { raw: true });
    files += 1;
    states += await scanSeries('NASA ISS trajectory files', p.product, 25544, p.states.map((s) => ({ ms: s.ms, r: s.r, v: s.v })), { confirmable: false });
  }
  sets.push({ set: 'NASA ISS trajectory files', directories: [path.join(A, 'hac/nasa-iss-oem-archive'), single], files, states });
}

// 4. G1's truth packs (lunar, cislunar, heliocentric): the sanity rule about the pack's center and the screen; no confirmation here.
if (want('packs')) {
  const { listPacks, readPack } = await g1('lib/packs.mjs');
  let packs = 0, states = 0;
  for (const name of listPacks()) {
    const { meta, object } = readPack(name, { raw: true });
    packs += 1;
    states += await scanSeries('G1 truth packs', name, 0, object.lines.map((l) => ({ ms: Date.parse(l.epoch), r: l.r, v: l.v })), { center: String(meta.center ?? 'EARTH').toUpperCase(), confirmable: false });
  }
  sets.push({ set: 'G1 truth packs', directory: path.join(G1S, 'pack'), packs, states });
}

// 5. The SPK objects of G1's highly elliptical windows (spk-windows.mjs, amendments A5 and A8b), read raw over their spans (EME2000).
if (want('spk')) {
  const { modulesRoot } = await g1('lib/modules.mjs');
  const { KERNELS, FILES, A5, A8, spkObject, spkObjectSeries } = await g1('lib/spk-sources.mjs');
  const { openContainers } = await g1('lib/containers.mjs'), { openTime } = await g1('lib/timeconv.mjs');
  const modules = modulesRoot(), containers = await openContainers(modules), time = await openTime(modules);
  const files = FILES(KERNELS(A));
  const objects = [
    ...A5.themis.objects.map(([letter, target]) => ({ file: files.themis(letter), source: 'heo-themis', id: `THEMIS-${letter} (${target})`, name: `THEMIS-${letter}`, norad: 99000 - target, fromUtc: A5.themis.span[0], toUtc: A5.themis.span[1] })),
    { file: files.chandra, source: 'heo-chandra', id: 'Chandra (-151)', name: 'CHANDRA', norad: 99151, fromUtc: A5.chandra.span[0], toUtc: A5.chandra.span[1] },
    { file: files.artemis2, source: 'heo-artemis2', id: 'Artemis II HEO checkout (-24)', name: 'ARTEMIS-II', norad: 99024, fromUtc: A5.artemis2.span[0], toUtc: A5.artemis2.span[1] },
  ];
  const tessDir = path.join(A, 'hac/mast-tess/models');
  let count = 0, states = 0;
  for (const o of objects) {
    if (!fs.existsSync(o.file)) continue;
    const object = await spkObject(modules, { ...o, containers, time, raw: true });
    count += 1;
    states += await scanSeries('G1 SPK windows', o.source, o.norad, object.lines.map((l) => ({ ms: Date.parse(l.epoch), r: l.r, v: l.v })), { confirmable: false });
  }
  if (fs.existsSync(tessDir)) {
    const names = fs.readdirSync(tessDir).filter((f) => /^TESS_EPH_DEF_\d{7}_\d+\.bsp$/.test(f)).sort();
    const tess = await spkObjectSeries(modules, { files: names.map((f) => path.join(tessDir, f)), source: 'heo-tess', id: 'TESS (-95)', name: 'TESS', norad: A8.tess.norad, fromUtc: A8.tess.span[0], toUtc: A8.tess.span[1], stride: A8.tess.stride, containers, time, raw: true });
    count += 1;
    states += await scanSeries('G1 SPK windows', 'heo-tess', A8.tess.norad, tess.lines.map((l) => ({ ms: Date.parse(l.epoch), r: l.r, v: l.v })), { confirmable: false });
  }
  await containers.destroy(); await time.destroy();
  sets.push({ set: 'G1 SPK windows', directories: [KERNELS(A), tessDir], objects: count, states });
}

// 6. The operator-capture states (SpaceX's first 8 h of each file, GCRF), as B2's part 1a reads them.
if (want('capture')) {
  const C = path.join(A, 'operator-capture/cycles');
  let records = 0, states = 0;
  for (const cycle of fs.readdirSync(C).filter((d) => /^\d{4}-/.test(d)).sort()) {
    for (const f of fs.readdirSync(path.join(C, cycle)).filter((x) => x.endsWith('.json.gz'))) {
      let d;
      try { d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(C, cycle, f)))); } catch { continue; }
      if (!d.truth?.length) continue;
      records += 1;
      states += await scanSeries('operator-capture (SpaceX first 8 h)', `operator-capture/${cycle}/${d.source?.sha256?.slice(0, 16)}`, d.source?.norad ?? Number(f.split('.')[0]), d.truth.map((s) => ({ ms: s.ms, r: s.stateM.slice(0, 3).map((x) => x / 1000), v: s.stateM.slice(3, 6).map((x) => x / 1000) })), { confirmable: false });
    }
  }
  sets.push({ set: 'operator-capture (SpaceX first 8 h)', directory: C, records, states });
}

const out = opt('--out') ? path.resolve(opt('--out')) : path.join(here, only ? `flags.${[...only].join('-')}.json` : 'flags.json');
fs.writeFileSync(out, `${JSON.stringify({ rules: RULES, sets, flags }, null, 1)}\n`);
console.error(`truth gate scan: ${flags.length} flags (${flags.filter((f) => f.action === 'drop').length} drops) -> ${out}`);
process.exit(0);
