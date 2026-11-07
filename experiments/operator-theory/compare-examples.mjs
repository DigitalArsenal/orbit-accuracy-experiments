// COMPARE.md: the worked examples behind the site's globe: one real forecast for each provider and regime (next-prediction) and for each satellite (truth), every arm flown over the
// whole span, written as positions the page draws. The example is not picked by eye: of the forecasts with every arm present, the one whose AP error at the rule's lead is nearest AP's
// median for that cell, ties broken by key. Lead: 72 h on next-prediction pairs, day 3 on precise-orbit windows. Module calls only; interpolation of a 300 s table is a data step, as in score.mjs.
//   node experiments/operator-theory/compare-examples.mjs --mode next --out <dir>
//   node experiments/operator-theory/compare-examples.mjs --mode truth --out <dir>          (XP2F_CONTROL=1 and --mode truth2 for AP2.md's windows)
// --pick showcase, in truth, truth2 and regimes modes: one example per regime, chosen to show AP's lead, not to be typical (see showcaseRank). --build names the AP store (default lib/build.mjs's).
// Every pick, typical or showcase, skips a window whose example has a step inside its fit (lib/steps.mjs, as the publisher finds them: hour < fitHours), or a hole in
// its reference there, and takes the next; when every window tried has one, <id>.json says so and holds no tracks. --ids a,b: those examples alone.
// Each example names the build every arm flew as cells.json names its columns': `build`, arm to keys module@sha256[0, 12]; `builds`, each key's module, version,
// commit and SHA-256 (lib/build.mjs BUILD_RECORDS).
//   node experiments/operator-theory/compare-examples.mjs --check [--dir <published examples>]
// --check reads the published examples (results/ap-truth/compare/examples) and cells.json and flies nothing: every arm of every example names a build, and it is
// the one build cells.json's rows name for that arm, each key's record cells.json's; and on every example the Space Force XP track's largest jump between consecutive grid
// samples is at most 3 times whiteroom XP's. Every example is in the one published form (compare-examples-publish.mjs): center the reference, `offsets` the five arms
// of TRACKS, and a file of the reference's Float64 track, each arm's Float32 offset vector and the reference's Float32 rotations, 24 + 12 x 5 + 16 bytes per time.
// The track is the arm's offset vector from the reference; a jump is the change between two consecutive samples less the change before it (the second difference),
// so a steady trend in the error is not counted as a jump and a partial-step sawtooth is. The plain change between samples is printed beside it.
// --ffm-only <dir>,<dir>: FFM's track alone, flown again on lib/host.mjs's FFM build on each stored example's own window (the window it was picked on: its fit and
// its epochs); every other track, field and $OCM is the stored example's, byte for byte, FFM's build named as flown, and nothing is picked again. A later
// folder's example replaces an earlier one's. FFM's next-file products are ap/ffm220's (cycle-ffm220.sh).
//   node experiments/operator-theory/compare-examples.mjs --mode <mode> [--pick showcase] --reflight <dir>[,<dir>] --out <dir>
// --reflight: the stored flights of the published examples (a later folder's example replacing an earlier one's). Each example's window is found again as its mode
// finds it (its start or cutoff and satellite, then its reference track byte for byte), and AP and whiteroom XP alone are fitted and flown again, on
// REFLIGHT_BUILD; every other track is the stored one. --out gets <id>.json and <id>.bin in the stored form with the AP and XP tracks and builds replaced, and
// <id>.ocm, the $OCM AP flew, as the module wrote it. Each run prints AP's and XP's largest position difference from the stored track. The highly elliptical
// (TESS) examples are not flown again (the site withholds that regime).
import fs from 'node:fs';
import path from 'node:path';
import { BUILD, AP_ARM, BUILD_RECORDS } from './lib/build.mjs';
import { pickedSteps } from './lib/steps.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const MODE = args.mode, OUT = args.out;
// The build the examples' AP and whiteroom XP are flown again on (sdn-ap-site-module-0-6-4-20261106): sdn-ap 0.6.4, named by its canonical module hash (sds.* sections stripped, what the signature covers), opened from its signed dist by the bundle's whole-file hash.
const REFLIGHT_BUILD = { module: 'propagator/sdn-ap', version: '0.6.4', commit: 'cfd750eb8de2f5d7c339173ee674bc7a481da8c2', sha256: 'fd1ef4682edc68836d27fdb1f606a45b22bb3605354c55312287f87771a804b5', bundleSha256: 'e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d' };
// The examples flown again on it: every one but the highly elliptical (TESS) examples, which the site withholds.
const FLOWN_AGAIN = (d) => d.regime !== 'Highly elliptical';
if (args.check) {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
  const dir = args.dir ?? path.join(root, 'results/ap-truth/compare/examples'), BOUND = 3;
  const cells = JSON.parse(fs.readFileSync(path.join(root, 'results/ap-truth/compare/cells.json'), 'utf8'));
  const want = {};
  for (const r of cells.rows) for (const [col, keys] of Object.entries(r.build)) if (keys.length) (want[/^FFM/.test(col) ? 'FFM' : col] ??= new Set()).add(keys.join(' '));
  const fails = [], measured = [];
  const again = `${REFLIGHT_BUILD.module}@${REFLIGHT_BUILD.sha256.slice(0, 12)}`;
  const recordOf = (k) => (k === again ? { module: REFLIGHT_BUILD.module, version: REFLIGHT_BUILD.version, commit: REFLIGHT_BUILD.commit, sha256: REFLIGHT_BUILD.sha256 } : cells.builds[k]);
  let full = 0, ocms = 0;
  for (const [arm, set] of Object.entries(want)) if (set.size !== 1) fails.push(`cells.json names ${set.size} builds for ${arm}`);
  for (const e of JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).filter((x) => !x.held && !x.dropped)) {
    const d = JSON.parse(fs.readFileSync(path.join(dir, `${e.id}.json`), 'utf8')), raw = fs.readFileSync(path.join(dir, `${e.id}.bin`));
    const arms = d.offsets ?? [], per = 3, t = d.epochsSeconds, ARMS = ['AP', 'XP', 'XPU', 'SGP4', 'FFM'];
    const form = [d.center !== 'reference' && `center ${d.center}`, arms.join() !== ARMS.join() && `offsets ${arms.join() || 'none'}`, 'errors' in d && 'an errors list', 'referenceDrawn' in d && 'a referenceDrawn flag',
      raw.length !== (24 + 12 * ARMS.length + 16) * d.count && `${raw.length} bytes, not ${(24 + 12 * ARMS.length + 16) * d.count}`].filter(Boolean);
    if (form.length) { fails.push(`${e.id}: not the published form (${form.join(', ')})`); continue; }
    full += 1;
    // AP and whiteroom XP flown again on REFLIGHT_BUILD (their tracks byte for byte the flights cells.json's build made, COMPARE.md), with the $OCM AP flew
    // beside the example; every other arm on cells.json's build.
    for (const arm of new Set(['AP', ...arms])) {
      // The withheld highly elliptical (TESS) examples, not flown again, keep the build they flew: AP's measured build in cells.json's provenance.
      const got = d.build?.[arm]?.join(' '), w = arm === 'AP' || arm === 'XP' ? (FLOWN_AGAIN(d) ? again : cells.provenance.AP.measuredOn) : [...(want[arm] ?? [])][0];
      if (!got || got !== w) fails.push(`${e.id} ${arm}: ${got ?? 'no build named'}, not ${w ?? 'none'}`);
      for (const k of d.build?.[arm] ?? []) if (JSON.stringify(d.builds?.[k]) !== JSON.stringify(recordOf(k))) fails.push(`${e.id} ${k}: its record is not ${k === again ? 'the build flown again' : "cells.json's"}`);
    }
    if (FLOWN_AGAIN(d)) {
      const ocm = path.join(dir, `${e.id}.ocm`), b = fs.existsSync(ocm) ? fs.readFileSync(ocm) : null;
      if (!b || ![4, 8].some((at) => b.subarray(at, at + 4).toString('latin1') === '$OCM')) fails.push(`${e.id}: no $OCM beside it`);
      else ocms += 1;
    }
    const step = Math.min(...t.slice(1).map((x, i) => x - t[i]));
    // An arm's block after the 24-byte-per-time track: Float32, `per` values per time, in `arms` order. On the grid only: a gap in the reference is no step. On a
    // next-file example the reference changes files at leadHours; a sample within one grid step of that junction is the reference's own edge, common to every arm
    // (on next-esa-ultra-rapid-gps it moves AP's second difference from 0.03 m to 0.34 m), so no change that uses one is counted.
    const junction = d.reference === 'next' ? 3600 * d.leadHours : null, edge = (i) => junction !== null && Math.abs(t[i] - junction) <= step + 1e-6;
    const onStep = (i) => Math.abs(t[i] - t[i - 1] - step) < 1e-6 && !edge(i) && !edge(i - 1);
    const jumps = (arm) => {
      const at = 24 * d.count + 4 * per * d.count * arms.indexOf(arm), a = new Float32Array(raw.buffer.slice(raw.byteOffset + at, raw.byteOffset + at + 4 * per * d.count));
      const delta = (i) => Array.from({ length: per }, (_, c) => a[per * i + c] - a[per * (i - 1) + c]);
      let change = 0, jump = 0;
      for (let i = 1; i < d.count; i += 1) if (onStep(i)) {
        change = Math.max(change, Math.hypot(...delta(i)));
        if (i > 1 && onStep(i - 1)) { const p = delta(i - 1); jump = Math.max(jump, Math.hypot(...delta(i).map((x, c) => x - p[c]))); }
      }
      return { change, jump };
    };
    const xpu = jumps('XPU'), xp = jumps('XP'), ratio = xpu.jump / xp.jump;
    measured.push({ id: e.id, ratio });
    console.log(`${e.id}: largest ${step} s jump, Space Force XP ${xpu.jump.toFixed(2)} m, whiteroom XP ${xp.jump.toFixed(2)} m, ratio ${ratio.toFixed(2)}; largest change ${xpu.change.toFixed(1)} m and ${xp.change.toFixed(1)} m`);
    if (!(ratio <= BOUND)) fails.push(`${e.id}: Space Force XP jump ${xpu.jump.toFixed(2)} m is ${ratio.toFixed(2)} times whiteroom XP's ${xp.jump.toFixed(2)} m`);
  }
  const worst = measured.reduce((a, b) => (b.ratio > a.ratio ? b : a), { ratio: 0 });
  if (fails.length) { console.log(`COMPARE EXAMPLES CHECK FAIL: ${fails.length}: ${fails.slice(0, 12).join('; ')}`); process.exit(1); }
  console.log(`COMPARE EXAMPLES CHECK PASS: ${measured.length} examples, ${full} in the full form (the reference's track and every arm's offset from it), every arm on cells.json's one build (${Object.entries(want).map(([a, s]) => `${a} ${[...s][0]}`).join('; ')}) but AP and whiteroom XP, flown again on ${again} (sdn-ap ${REFLIGHT_BUILD.version}) with ${ocms} $OCM beside them; largest Space Force XP to whiteroom XP jump ratio ${worst.ratio.toFixed(2)} (${worst.id}) <= ${BOUND}`);
  process.exit(0);
}
if (!MODE || !OUT) throw new Error('--mode and --out');
fs.mkdirSync(OUT, { recursive: true });
const STORE = '/opt/data/sdn-archive/operator-theory', AP = path.join(STORE, 'ap'), NEW = path.join(AP, args.build ?? BUILD);
const SHOWCASE = args.pick === 'showcase';
const IDS = args.ids ? new Set(args.ids.split(',')) : null;
// A pick tries windows in its order until one is written: at most `usable` that the burn-free rule passes (the tries before it) and 60 in all.
const more = (tried, stepped, usable) => REFLIGHT || (tried - stepped < usable && tried < 60);
const REFLIGHT = args.reflight ? new Map(args.reflight.split(',').flatMap((dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => [f.slice(0, -5), dir]))) : null;
/** A stored example: its description and its tracks' bytes (Float64 km, in its `tracks` order). */
const stored = (id) => { const dir = REFLIGHT.get(id), d = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')); return { d, raw: d.dropped ? null : fs.readFileSync(path.join(dir, `${id}.bin`)) }; };
const reflown = (id) => REFLIGHT.has(id) && !/starlink/i.test(id) && !stored(id).d.dropped && FLOWN_AGAIN(stored(id).d);
const considered = new Set(), written = new Set();
const wanted = (id) => { const w = (!IDS || IDS.has(id)) && (!REFLIGHT || reflown(id)); if (w && REFLIGHT) considered.add(id); return w; };
/** The window found again is the stored one's: start (next-file) or cutoff (precise orbit), and satellite. */
const storedWindow = (id, { start, cutoff, satellite }) => { const { d } = stored(id); return d.satellite === satellite && (start === undefined || d.start === start) && (cutoff === undefined || d.cutoff === cutoff); };
/** propagator/sdn-ap at REFLIGHT_BUILD: lib/ap.mjs openAp's two calls on that build's bytes (pinnedFile: git show at its commit, SHA-256 checked). */
async function openApAt(b) {
  const { standalone } = await import('./lib/ap.mjs');
  const { TYPE, oemLines, flightPcfBytes } = await import('../xp-atmosphere-merit/lib/sds.mjs');
  const h = await standalone(b.module, { modulesCommit: b.commit, wasmSha256: b.bundleSha256 });
  return {
    build: { modulesCommit: b.commit, version: b.version, wasmSha256: b.sha256 },
    async fit(oem, pcf, extra) {
      const inputs = [{ portId: 'ephemeris', typeRef: TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: pcf }, ...(extra?.spw ? [{ portId: 'space_weather', typeRef: TYPE('SPW'), payload: extra.spw }] : [])];
      const r = await h.invoke({ methodId: 'fit', inputs });
      if (r.statusCode !== 0) return { ok: false, error: `${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}` };
      return { ok: true, ocm: new Uint8Array(r.outputs.find((o) => o.portId === 'elements').payload) };
    },
    async propagate(ocm, epochs, count) {
      const r = await h.invoke({ methodId: 'propagate', inputs: [{ portId: 'ocm', typeRef: TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: TYPE('PCF'), payload: flightPcfBytes(epochs) }] });
      if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`);
      const lines = oemLines(new Uint8Array(r.outputs.find((o) => o.portId === 'ephemeris').payload));
      if (lines.length !== count) throw new Error(`propagate returned ${lines.length} of ${count} states`);
      return lines;
    },
  };
}
const apFor = (openAp) => (REFLIGHT ? openApAt(REFLIGHT_BUILD) : openAp());
/** One example flown again: AP and whiteroom XP fitted on the window's arc with the stored flight's configuration, flown on its grid, written beside the stored tracks. */
async function reflight({ id, A, M, oem, pcfAp, extraAp, pcfXp, reference, epochs }) {
  const { d, raw } = stored(id), size = 24 * d.count, track = (t) => raw.subarray(size * d.tracks.indexOf(t), size * (d.tracks.indexOf(t) + 1));
  if (d.count !== epochs.length || !encode(reference).equals(track('reference'))) throw new Error(`${id}: the window found again is not the stored one`);
  const fa = await A.fit(oem, pcfAp, extraAp), fx = await A.fit(oem, pcfXp, undefined);
  if (!fa.ok || !fx.ok) throw new Error(`${id}: ${fa.error ?? fx.error}`);
  const fly = async (ocm) => encode((await M.toAxes(await A.propagate(ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r));
  const flown = { AP: await fly(fa.ocm), XP: await fly(fx.ocm) };
  const key = buildKey(REFLIGHT_BUILD.module, REFLIGHT_BUILD.sha256), build = { ...d.build, AP: [key], XP: [key] };
  const records = { ...d.builds, [key]: { module: REFLIGHT_BUILD.module, version: REFLIGHT_BUILD.version, commit: REFLIGHT_BUILD.commit, sha256: REFLIGHT_BUILD.sha256 } };
  fs.writeFileSync(path.join(OUT, `${id}.bin`), Buffer.concat(d.tracks.map((t) => flown[t] ?? track(t))));
  fs.writeFileSync(path.join(OUT, `${id}.json`), `${JSON.stringify({ ...d, build, builds: Object.fromEntries([...new Set(Object.values(build).flat())].map((k) => [k, records[k]])) })}\n`);
  fs.writeFileSync(path.join(OUT, `${id}.ocm`), fa.ocm);
  const moved = (t) => { const p = flown[t], q = track(t); let m = 0; for (let i = 0; i < p.length; i += 8) m = Math.max(m, Math.abs(p.readDoubleLE(i) - q.readDoubleLE(i))); return m * 1000; };
  console.log(`${id}: AP ${moved('AP').toFixed(6)} m, XP ${moved('XP').toFixed(6)} m from the stored tracks; $OCM ${fa.ocm.length} bytes`);
  written.add(id);
}
let EXTRA = {}, BUILDS = null;
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const HOUR = 3600000, DAY = 86400000, MU = 398600.4418;
const encode = (positions) => Buffer.from(Float64Array.from(positions.flat()).buffer);
const TRACKS = ['reference', 'AP', 'XP', 'XPU', 'SGP4', 'FFM'];
const meanMotion = (s) => { const r = Math.hypot(...s.r), v = Math.hypot(...s.v), a = 1 / (2 / r - (v * v) / MU); return 86400 / (2 * Math.PI * Math.sqrt((a * a * a) / MU)); };
// <id>.json describes the example; <id>.bin holds its positions, Float64 km, little endian, in TRACKS order. compare-examples-publish.mjs writes what the site reads.
const { openUssfXp } = await import('./lib/ussf-xp.mjs');
const U = await openUssfXp();
const { build: SGP4_FIT } = await import('./lib/xp2.mjs');
const buildKey = (rel, sha) => `${rel}@${sha.slice(0, 12)}`;
/** The build each arm flies, from the modules this run opened: AP and whiteroom XP one sdn-ap, the Space Force XP its sgp4-xp, SGP4 its fit and flight, FFM its fit and flight. */
const armBuilds = (A, M, F) => {
  const ap = [buildKey('propagator/sdn-ap', A.build.wasmSha256)];
  return { AP: ap, XP: ap, XPU: [buildKey('propagator/sgp4-xp', U.build.wasmSha256)], SGP4: [buildKey('analysis/gp-error-model', SGP4_FIT.wasmSha256['analysis/gp-error-model']), buildKey('propagator/sgp4', M.provenance.wasmSha256['propagator/sgp4'])], FFM: [buildKey('analysis/estimation', F.provenance.estimation.wasmSha256), buildKey('propagator/ffm', F.provenance.ffm.wasmSha256)] };
};
const write = (doc) => {
  fs.writeFileSync(path.join(OUT, `${doc.id}.bin`), Buffer.concat(TRACKS.map((k) => doc.tracks[k])));
  if (!BUILDS) throw new Error('no arm builds');
  const keys = [...new Set(Object.values(BUILDS).flat())], missing = keys.filter((k) => !BUILD_RECORDS[k]);
  if (missing.length) throw new Error(`builds not in lib/build.mjs BUILD_RECORDS: ${missing.join(', ')}`);
  fs.writeFileSync(path.join(OUT, `${doc.id}.json`), `${JSON.stringify({ ...doc, ...EXTRA, build: BUILDS, builds: Object.fromEntries(keys.map((k) => [k, BUILD_RECORDS[k]])), tracks: TRACKS })}\n`);
  console.error(`${doc.id}: ${doc.count} states, ${Math.round(fs.statSync(path.join(OUT, `${doc.id}.bin`)).size / 1024)} KB`);
};
/**
 * The burn-free rule: false (and a line) when the example's tracks show a step inside its fit, or its reference a hole there of more than two grid steps (a burn
 * the product leaves out, which the step rule cannot see in the track's first orbit); else the example is written.
 */
const fitHoles = (t, fitHours) => { const out = []; for (let i = 1; i < t.length; i += 1) if (t[i] - t[i - 1] > 2 * (t[1] - t[0]) && t[i - 1] / 3600 < fitHours) out.push(`${Math.round(t[i - 1] / 360) / 10} h, ${Math.round(t[i] - t[i - 1])} s`); return out; };
/** Before any fit: the hole rule on a precise-orbit window's grid (ms), so a window it refuses is not flown. */
const holedFit = (id, key, epochsMs, fitEndMs) => { const holes = fitHoles(epochsMs.map((t) => (t - epochsMs[0]) / 1000), (fitEndMs - epochsMs[0]) / 3600000); if (holes.length) console.error(`${id} ${key}: a hole in its fit (${holes.join('; ')}); the next window`); return holes.length > 0; };
const burnFree = (doc, tracks, key) => {
  const inFit = pickedSteps(doc, tracks).filter((s) => s.hour < doc.fitHours), holes = fitHoles(doc.epochsSeconds, doc.fitHours);
  if (inFit.length || holes.length) { console.error(`${doc.id} ${key}: ${inFit.length ? `a step in its fit (${inFit.map((s) => `${s.hour} h, ${s.radialM} m`).join('; ')})` : `a hole in its fit (${holes.join('; ')})`}; the next window`); return false; }
  write({ ...doc, tracks: Object.fromEntries(Object.entries(tracks).map(([k, v]) => [k, encode(v)])) });
  return true;
};
const FFM_ONLY = args['ffm-only'] ? new Map(args['ffm-only'].split(',').flatMap((dir) => fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'index.json' && !/starlink/i.test(n)).map((n) => [n.replace(/\.json$/, ''), dir]))) : null;
const storedExample = (id) => { const dir = FFM_ONLY?.get(id); if (!dir) return null; const d = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')); return d.dropped ? null : { d, dir, bin: fs.readFileSync(path.join(dir, `${id}.bin`)) }; };
/** --ffm-only: the stored example with its FFM track replaced and FFM's build named as the run opened it (F); the window's epochs must be the stored example's. */
const writeFfm = (stored, epochsMs, t0, ffm, F) => {
  const { d, dir, bin } = stored, at = d.tracks.indexOf('FFM'), size = 24 * d.count;
  if (epochsMs.length !== d.count || epochsMs.some((t, i) => (t - t0) / 1000 !== d.epochsSeconds[i])) throw new Error(`${d.id}: the window's epochs are not the stored example's`);
  const keys = [buildKey('analysis/estimation', F.provenance.estimation.wasmSha256), buildKey('propagator/ffm', F.provenance.ffm.wasmSha256)], missing = keys.filter((k) => !BUILD_RECORDS[k]);
  if (missing.length) throw new Error(`builds not in lib/build.mjs BUILD_RECORDS: ${missing.join(', ')}`);
  const build = { ...d.build, FFM: keys }, all = [...new Set(Object.values(build).flat())];
  fs.writeFileSync(path.join(OUT, `${d.id}.bin`), Buffer.concat([bin.subarray(0, size * at), encode(ffm), bin.subarray(size * (at + 1))]));
  fs.writeFileSync(path.join(OUT, `${d.id}.json`), `${JSON.stringify({ ...d, build, builds: Object.fromEntries(all.map((k) => [k, keys.includes(k) ? BUILD_RECORDS[k] : d.builds[k]])) })}\n`);
  if (fs.existsSync(path.join(dir, `${d.id}.ocm`))) fs.copyFileSync(path.join(dir, `${d.id}.ocm`), path.join(OUT, `${d.id}.ocm`));
  console.error(`${d.id}: FFM flown again on its stored window`);
};
/** Every window tried had a step in its fit: the example is dropped, and says so. */
const dropped = (head) => { fs.writeFileSync(path.join(OUT, `${head.id}.json`), `${JSON.stringify({ ...head, ...(SHOWCASE ? { showcase: true } : {}), dropped: 'every window tried holds a step or a hole inside its fit' })}\n`); console.error(`${head.id}: dropped, every window tried holds a step or a hole inside its fit`); };
/**
 * A product's states on a uniform grid, so the worked examples show AP's short-period terms as smooth curves: one minute below 8,400 km, five above. Eight-point Lagrange in the product's own
 * states, a data step. A grid time whose eight nearest states span a gap in the product is left out.
 */
const onGrid = (lines, stepMs) => {
  const ts = lines.map((l) => Date.parse(l.epoch)), cadence = [...ts.slice(1).map((t, i) => t - ts[i])].sort((a, b) => a - b)[(ts.length - 1) >> 1];
  const out = [];
  let i = 0;
  for (let t = ts[0] + stepMs; t <= ts.at(-1); t += stepMs) {
    while (i + 1 < ts.length && ts[i + 1] <= t) i += 1;
    const lo = Math.max(0, Math.min(ts.length - 8, i - 3));
    if (ts[lo + 7] - ts[lo] > 10 * cadence) continue;
    const idx = Array.from({ length: 8 }, (_, k) => lo + k);
    const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
    const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(lines[a])[c], 0));
    out.push({ epoch: new Date(t).toISOString(), r: mix((l) => l.r), v: mix((l) => l.v) });
  }
  return out;
};
// FFM's module takes at most 10,000 samples a call; each call flies from the same fitted state, so batches change nothing.
const inBatches = async (epochs, fly) => { const out = []; for (let i = 0; i < epochs.length; i += 9000) out.push(...(await fly(epochs.slice(i, i + 9000)))); return out; };
// A precise-orbit example must hold its reference without a hole of an hour or more; shorter holes are the burns the product leaves out.
const holed = (epochs) => epochs.some((e, i) => i > 0 && Date.parse(e) - Date.parse(epochs[i - 1]) >= 3600000);
/**
 * The showcase rule (owner 2026-11-03: "we want examples where SGP4 is way off, and XP is ~5-10x off"), on stored day-3 errors: of the windows whose XP error is 5 to 10 times AP's,
 * those where FFM is no more than twice as close as AP first, then the rest; each set by SGP4's error over AP's, largest first. A regime with no window in that band takes its windows by XP's
 * error over AP's, largest first. Chosen to show AP's lead: not typical, and the site says so.
 */
const showcaseRank = (list, errs) => {
  const q = list.map((r) => ({ r, e: errs(r) })).filter(({ e }) => [e.ap, e.xp, e.s, e.f].every(Number.isFinite) && e.ap > 0).map(({ r, e }) => ({ r, e, xp: e.xp / e.ap, s: e.s / e.ap, f: e.f / e.ap }));
  const band = q.filter((x) => x.xp >= 5 && x.xp <= 10), by = (a, b) => b.s - a.s || String(a.r.key).localeCompare(String(b.r.key));
  const ranked = band.length ? [...band.filter((x) => x.f >= 0.5).sort(by), ...band.filter((x) => x.f < 0.5).sort(by)] : [...q].sort((a, b) => b.xp - a.xp || String(a.r.key).localeCompare(String(b.r.key)));
  return ranked.map((x) => Object.assign(x.r, { showcase: { day: 3, inBand: band.length > 0, apKm: x.e.ap, xpOverAp: x.xp, sgp4OverAp: x.s, ffmOverAp: x.f } }));
};
const nearestMedian = (list, value) => { const v = list.map(value).filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return []; const m = v[Math.floor((v.length - 1) / 2)]; return [...list].filter((r) => Number.isFinite(value(r))).sort((a, b) => Math.abs(value(a) - m) - Math.abs(value(b) - m) || String(a.key).localeCompare(String(b.key))); };

if (MODE === 'next') {
  const { isoMs, openFfmHost } = await import('./lib/host.mjs');
  const { binOf } = await import('./lib/compare.mjs');
  const { weatherRows } = await import('./lib/weather.mjs');
  const { openAp, fitPcf, fitWeather, rowsOfSpw, horizonOf, apForces } = await import('./lib/ap.mjs');
  const { openModules } = await import('../xp-atmosphere-merit/lib/modules.mjs');
  const { openSgp4Fit } = await import('./lib/xp2.mjs');
  const S = await import('../xp-atmosphere-merit/lib/sds.mjs');
  const { config: XMC } = await import('../xp-atmosphere-merit/common.mjs');
  const FIT = { dragPrior: XMC.fit.dragPrior, srpPrior: XMC.fit.srpPrior };
  const M = await openModules(), G = await openSgp4Fit(), F = await openFfmHost();
  // AP and XP from the same build: XP is that module with its atmosphere and added terms off.
  const A = await apFor(openAp);
  BUILDS = armBuilds(A, M, F);
  const key = (r) => `${r.source}|${r.norad}|${r.olderStart}|${r.newerStart}`;
  const rows = rowsIn(path.join(NEW, 'laser', 'forward')).filter((r) => binOf(r.leadHours) === 72);
  const stores = ['laser-sgp4', 'laser-sgp4-high'].map((d) => new Map(rowsIn(path.join(NEW, d)).map((r) => [key(r), r])));
  const sgp = (r) => stores.map((s) => s.get(key(r))?.arms['S@48']?.km).find(Number.isFinite);
  const ffmRows = new Map(rowsIn(path.join(AP, 'ffm220', 'cheaper', 'forward')).map((r) => [key(r), r]));
  const NAV = /^(beidou|compass|galileo|glonass|gps|irnss|qzs)/;
  const regimeOf = (r) => (r.source.endsWith('-leo') ? 'Low orbit' : NAV.test(r.object) ? 'Navigation' : 'Geodetic');
  const cells = new Map();
  for (const r of rows) { const k = `${regimeOf(r)}|${r.source.split('-')[1]}`; (cells.get(k) ?? cells.set(k, []).get(k)).push(r); }
  const findProduct = (root, source, norad, start) => {
    for (const c of fs.readdirSync(root).filter((d) => /^c\d{8}T\d{4}$/.test(d))) {
      const dir = path.join(root, c, 'products');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((n) => n.includes(`-${norad}-`))) {
        const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (p.source === source && p.start === start) return p;
      }
    }
    return null;
  };
  const lines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
  function interpolate(table, t) {
    const ts = table.map((l) => Date.parse(l.epoch));
    const i = ts.findIndex((x) => x >= t);
    if (i < 0 || t < ts[0]) return null;
    const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
    const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
    const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(table[a])[c], 0));
    return { r: mix((l) => l.r), v: mix((l) => l.v) };
  }
  for (const [cell, list] of cells) {
    const [regime, provider] = cell.split('|');
    const leo = regime === 'Low orbit';
    const ffmName = leo ? 'F-M40@48' : 'F-H20@48';
    const ranked = nearestMedian(list.filter((r) => Number.isFinite(sgp(r)) && Number.isFinite(ffmRows.get(key(r))?.arms[ffmName]?.km)), (r) => r.arms[`${AP_ARM}@48`]?.km);
    const id = `next-${provider}-${regime.toLowerCase().replace(/\s+/g, '-')}`;
    if (!wanted(id)) continue;
    const stored = FFM_ONLY && storedExample(id);
    if (FFM_ONLY && !stored) continue;
    if (!ranked.length) { console.error(`${id}: no forecast has every arm`); continue; }
    let done = false, stepped = 0, tried = 0;
    for (const pick of stored ? ranked.filter((p) => Date.parse(p.olderStart) === Date.parse(stored.d.start) && p.leadHours === stored.d.leadHours && p.object === stored.d.satellite) : ranked) {
      if (!more(tried, stepped, 12)) break;
      tried += 1;
      const apP = findProduct(path.join(NEW, 'laser'), pick.source, pick.norad, pick.olderStart);
      const xpP = findProduct(path.join(NEW, 'laser-xp'), pick.source, pick.norad, pick.olderStart);
      const ffP = findProduct(path.join(AP, 'ffm220', 'cheaper'), pick.source, pick.norad, pick.olderStart);
      const newer = findProduct(path.join(NEW, 'laser'), pick.source, pick.norad, pick.newerStart);
      if (!apP || !xpP || !ffP || !newer) { console.error(`${id}: a stored product is missing`); continue; }
      const older = lines(apP.forecastOem), next = lines(newer.forecastOem);
      const t0 = Date.parse(older[0].epoch), tn = Date.parse(next[0].epoch), step = (leo ? 60 : 300) * 1000, end = tn + 3 * HOUR;
      if (REFLIGHT && !storedWindow(id, { start: isoMs(t0), satellite: pick.object })) continue;
      const ms = []; for (let t = t0 + step; t <= end; t += step) ms.push(t);
      const reference = ms.map((t) => (t < tn ? interpolate(older, t) : interpolate(next, t)));
      const keep = ms.map((_, i) => !!reference[i]);
      const epochsMs = ms.filter((_, i) => keep[i]), epochs = epochsMs.map(isoMs), refs = reference.filter(Boolean);
      const w = weatherRows(apP.weatherDay, '2026-02-20', '2026-12-14');
      const tracks = { reference: refs.map((s) => s.r) };
      if (REFLIGHT) {
        const seg = older.filter((l) => Date.parse(l.epoch) <= t0 + 48 * HOUR);
        const segOem = S.oemBytes({ frame: 'GCRF', object: { name: pick.object, id: '', norad: pick.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
        await reflight({ id, A, M, oem: segOem, pcfAp: fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null }), extraAp: { spw: fitWeather(rowsOfSpw(w.rows), horizonOf(Date.parse(seg.at(-1).epoch))) }, pcfXp: fitPcf({ forces: {}, fit: null }), reference: tracks.reference, epochs });
        done = true;
        break;
      }
      const f = ffP.products[ffmName];
      // FFM first: its offsets from the reference carry the steps, so a window the burn-free rule refuses is not fitted by the other arms.
      tracks.FFM = (await F.forecast({ epoch: f.epoch, state: f.state, parameters: f.parameters }, epochs, { forces: f.forces, fixed: f.fixed, integrator: f.integrator }, w.rows)).map((s) => s.r);
      if (stored) { writeFfm(stored, epochsMs, t0, tracks.FFM, F); done = true; break; }
      const head = { id, reference: 'next', regime, provider, satellite: pick.object, fitHours: 48, leadHours: pick.leadHours, start: isoMs(t0), fitEndMs: t0 + 48 * HOUR, scoreFromMs: tn, scoreToMs: end, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion(refs[0]), count: epochs.length, ffm: leo ? 'FFM 40×40' : 'FFM 20×20' };
      if (pickedSteps(head, tracks).some((x) => x.hour < head.fitHours) || fitHoles(head.epochsSeconds, head.fitHours).length) { burnFree(head, tracks, key(pick)); stepped += 1; continue; }
      // AP (the stored arm's: 31x20, NRLMSISE-00, the module's priors) and whiteroom XP re-fitted as $OCM on the stored window, the older file's first 48 h
      const seg = older.filter((l) => Date.parse(l.epoch) <= t0 + 48 * HOUR);
      const segOem = S.oemBytes({ frame: 'GCRF', object: { name: pick.object, id: '', norad: pick.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
      const fa = await A.fit(segOem, fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null }), { spw: fitWeather(rowsOfSpw(w.rows), horizonOf(Date.parse(seg.at(-1).epoch))) });
      const fx = await A.fit(segOem, fitPcf({ forces: {}, fit: null }), undefined);
      if (!fa.ok || !fx.ok) { console.error(`${id}: ${fa.error ?? fx.error}`); continue; }
      tracks.AP = (await M.toAxes(await A.propagate(fa.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r);
      tracks.XP = (await M.toAxes(await A.propagate(fx.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r);
      const fu = await U.fit(segOem);
      if (!fu.ok) { console.error(`${id}: ${fu.error}`); continue; }
      tracks.XPU = (await M.toAxes(await U.propagate(fu.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r);
      const { el } = await G.fit(S.oemBytes({ frame: 'GCRF', object: { name: pick.object, id: '', norad: pick.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' }), { from: seg[0].epoch, to: isoMs(t0 + 48 * HOUR), epoch: 'first', fitBstar: true }, { name: pick.object, objectId: '' });
      const flown = await M.propagateSgp4(el, pick.norad, epochsMs, step / 1000);
      if (flown.some((s) => !s)) { console.error(`${id}: SGP4 returned no state at some epochs`); continue; }
      tracks.SGP4 = (await M.toAxes(flown, epochs, 'GCRF')).map((s) => s.r);
      if (!burnFree(head, { reference: tracks.reference, AP: tracks.AP, XP: tracks.XP, XPU: tracks.XPU, SGP4: tracks.SGP4, FFM: tracks.FFM }, key(pick))) { stepped += 1; continue; }
      done = true;
      break;
    }
    if (!done && stepped) dropped({ id, reference: 'next', regime, provider });
    else if (!done) console.error(`${id}: none of the nearest forecasts had every arm`);
  }
  await F.close(); await M.close();
} else if (MODE === 'providers') {
  // Every provider, on the site table's 24 h fit: of its pairs with every arm present and a target at least 6 h past the fit where it has any, the one whose AP error is nearest AP's median. compare-examples-publish.mjs decides whose reference is redrawn.
  const FIT_H = 24;
  const ISS = args.only === 'iss';
  const { isoMs, openFfmHost, openAxes, apriori } = await import('./lib/host.mjs');
  const { weatherRows } = await import('./lib/weather.mjs');
  const { openAp, apForces, fitPcf, fitWeather, rowsOfSpw, horizonOf } = await import('./lib/ap.mjs');
  const { openModules } = await import('../xp-atmosphere-merit/lib/modules.mjs');
  const { openSgp4Fit } = await import('./lib/xp2.mjs');
  const S = await import('../xp-atmosphere-merit/lib/sds.mjs');
  const { config: XMC } = await import('../xp-atmosphere-merit/common.mjs');
  const W = ISS ? await import('../xp-atmosphere-merit/lib/weather.mjs') : null;
  const { driverRows } = ISS ? await import('./lib/xm3.mjs') : {};
  const M = await openModules(), G = await openSgp4Fit(), F = await openFfmHost(), A = await apFor(openAp);
  BUILDS = armBuilds(A, M, F);
  const axes = ISS ? await openAxes() : null;
  const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null }), PCF_XP = fitPcf({ forces: {}, fit: null });
  const LABEL = { starlink: ['SpaceX', 'Low orbit, maneuvering'], iss: ['NASA ISS', 'Low orbit, crewed'], css: ['China Space Station', 'Low orbit, crewed'], planet: ['Planet (Flock)', 'Low orbit, imaging fleet'], gps: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], glonass: ['ESA ultra-rapid', 'Navigation, ultra-rapid'], intelsat: ['Intelsat', 'Geostationary, station-kept'], ses: ['SES', 'Geostationary, station-kept'] };
  const rows = fs.readdirSync(path.join(NEW, 'providers')).filter((f) => /^rows(-iss)?-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(NEW, 'providers', f))).filter((r) => !r.error);
  const lines = (b64) => S.oemLines(Buffer.from(b64, 'base64')).map((l) => ({ ...l, epoch: isoMs(Date.parse(l.epoch)) }));
  const roots = [STORE, path.join(STORE, 'vendors')];
  const findStored = (source, norad, start) => {
    for (const root of roots) for (const c of fs.readdirSync(root).filter((d) => /^c\d{8}T\d{4}$/.test(d))) {
      const dir = path.join(root, c, 'products');
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir).filter((n) => n.startsWith(`${source}-`) && n.includes(`-${norad}-`))) { const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); if (p.start === start && p.forecastOem) return p; }
    }
    return null;
  };
  const ISS_ARCHIVE = '/opt/data/sdn-archive/hac/nasa-iss-oem-archive';
  const issFile = async (start) => {
    for (const d of fs.readdirSync(ISS_ARCHIVE).filter((n) => /^2026-0[1-5]-\d\d$/.test(n)).sort()) {
      const file = path.join(ISS_ARCHIVE, d, 'ISS.OEM_J2K_EPH.txt');
      if (!fs.existsSync(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      const first = /^(\d{4}-\d{2}-\d{2}T[\d:.]+)\s/m.exec(text.slice(0, 20000))?.[1];
      if (first && isoMs(Date.parse(`${first}Z`)) === start) {
        const raw = [];
        for (const line of text.split('\n')) { const t = line.trim().split(/\s+/); if (t.length === 7 && /^\d{4}-\d\d-\d\dT/.test(t[0])) raw.push({ epoch: isoMs(Date.parse(`${t[0]}Z`)), r: t.slice(1, 4).map(Number), v: t.slice(4, 7).map(Number) }); }
        const num = (name) => Number(new RegExp(`COMMENT ${name}=([0-9.]+)`).exec(text)?.[1]);
        const gcrf = await axes.convert(raw, 'EME2000', 'GCRF');
        gcrf.statedB = (num('DRAG_COEFF') * num('DRAG_AREA')) / num('MASS');
        return gcrf;
      }
    }
    return null;
  };
  function interpolate(table, t) {
    const ts = table.map((l) => Date.parse(l.epoch));
    const i = ts.findIndex((x) => x >= t);
    if (i < 0 || t < ts[0]) return null;
    const lo = Math.max(0, Math.min(ts.length - 8, i - 4)), idx = Array.from({ length: 8 }, (_, k) => lo + k);
    const w = idx.map((a) => idx.reduce((acc, b) => (a === b ? acc : (acc * (t - ts[b])) / (ts[a] - ts[b])), 1));
    const mix = (get) => [0, 1, 2].map((c) => idx.reduce((s, a, k) => s + w[k] * get(table[a])[c], 0));
    return { r: mix((l) => l.r), v: mix((l) => l.v) };
  }
  for (const source of Object.keys(LABEL).filter((k) => (ISS ? k === 'iss' : k !== 'iss'))) {
    const [provider, regime] = LABEL[source];
    const usable = rows.filter((r) => r.source === source && Number.isFinite(r.arms[`S@${FIT_H}`]?.km) && Number.isFinite(r.arms[`A-XP@${FIT_H}`]?.km));
    const past = usable.filter((r) => r.leadHours >= FIT_H + 6);
    const ranked = nearestMedian(past.length ? past : usable, (r) => r.arms[`${AP_ARM}@${FIT_H}`]?.km);
    const id = `next-${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${source}`;
    if (!wanted(id)) continue;
    const stored = FFM_ONLY && storedExample(id);
    if (FFM_ONLY && !stored) continue;
    let done = false, stepped = 0, tried = 0;
    for (const pick of stored ? ranked.filter((p) => Date.parse(p.olderStart) === Date.parse(stored.d.start) && p.leadHours === stored.d.leadHours && p.object === stored.d.satellite) : ranked) {
      if (!more(tried, stepped, 8)) break;
      tried += 1;
      try {
        const oldP = ISS ? null : findStored(source, pick.norad, pick.olderStart);
        const newP = ISS ? null : findStored(source, pick.norad, pick.newerStart);
        const older = ISS ? await issFile(pick.olderStart) : oldP && lines(oldP.forecastOem);
        const next = ISS ? await issFile(pick.newerStart) : newP && lines(newP.forecastOem);
        if (!older || !next) continue;
        const t0 = Date.parse(older[0].epoch), tn = Date.parse(next[0].epoch), leo = Math.hypot(...older[0].r) < 8400;
        if (REFLIGHT && !storedWindow(id, { start: isoMs(t0), satellite: pick.object })) continue;
        const step = (leo ? 60 : 300) * 1000, end = tn + 3 * HOUR;
        const ms = []; for (let t = t0 + step; t <= end; t += step) ms.push(t);
        const refs = ms.map((t) => (t < tn ? interpolate(older, t) : interpolate(next, t)));
        const epochsMs = ms.filter((_, i) => refs[i]), epochs = epochsMs.map(isoMs), reference = refs.filter(Boolean);
        let extra, spw;
        if (ISS) {
          const O = W.rowsO(t0 - 72 * HOUR - XMC.conditions.rowsMarginDays * DAY, t0);
          if (O.excluded) continue;
          extra = { spw: fitWeather(O.rows, horizonOf(t0 + FIT_H * HOUR)) };
          spw = driverRows(O.rows, t0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
        } else {
          const w = weatherRows(oldP.weatherDay, '2026-07-15', '2026-12-14');
          spw = w.rows;
          extra = { spw: fitWeather(rowsOfSpw(w.rows), horizonOf(t0 + FIT_H * HOUR)) };
        }
        const seg = older.filter((l) => Date.parse(l.epoch) <= t0 + FIT_H * HOUR);
        const oem = S.oemBytes({ frame: 'GCRF', object: { name: pick.object, id: '', norad: pick.norad }, lines: seg, useableStart: seg[0].epoch, useableStop: seg.at(-1).epoch, originator: 'operator-theory' });
        const seed = older.statedB ?? 0.01;
        const settings = leo
          ? { forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: !ISS, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined }, integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: seed }], fixed: { agom: ISS ? 0 : 0.02 }, apriori: apriori([seed * 10]) }
          : { forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined }, integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01, parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]) };
        if (stored) {
          const ff = await F.fit(seg, [...seg[0].r, ...seg[0].v], settings, spw, Date.parse(seg.at(-1).epoch));
          if (!ff.state) continue;
          writeFfm(stored, epochsMs, t0, (await F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, epochs, settings, spw)).map((x) => x.r), F);
          done = true;
          break;
        }
        if (REFLIGHT) { await reflight({ id, A, M, oem, pcfAp: PCF_AP, extraAp: extra, pcfXp: PCF_XP, reference: reference.map((x) => x.r), epochs }); done = true; break; }
        const fa = await A.fit(oem, PCF_AP, extra); if (!fa.ok) continue;
        const fx = await A.fit(oem, PCF_XP, undefined); if (!fx.ok) continue;
        const fu = await U.fit(oem); if (!fu.ok) continue;
        const { el } = await G.fit(oem, { from: seg[0].epoch, to: seg.at(-1).epoch, epoch: 'first', fitBstar: true }, { name: pick.object, objectId: '' });
        const sg = await M.propagateSgp4(el, pick.norad, epochsMs, step / 1000);
        if (sg.some((x) => !x)) continue;
        const ff = await F.fit(seg, [...seg[0].r, ...seg[0].v], settings, spw, Date.parse(seg.at(-1).epoch));
        if (!ff.state) continue;
        const tracks = {
          reference: reference.map((x) => x.r),
          AP: (await M.toAxes(await A.propagate(fa.ocm, epochs, epochs.length), epochs, 'GCRF')).map((x) => x.r),
          XP: (await M.toAxes(await A.propagate(fx.ocm, epochs, epochs.length), epochs, 'GCRF')).map((x) => x.r),
          XPU: (await M.toAxes(await U.propagate(fu.ocm, epochs, epochs.length), epochs, 'GCRF')).map((x) => x.r),
          SGP4: (await M.toAxes(sg, epochs, 'GCRF')).map((x) => x.r),
          FFM: (await F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, epochs, settings, spw)).map((x) => x.r),
        };
        if (!burnFree({ id, reference: 'next', regime, provider, satellite: pick.object, fitHours: FIT_H, leadHours: pick.leadHours, start: isoMs(t0), fitEndMs: t0 + FIT_H * HOUR, scoreFromMs: tn, scoreToMs: end, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion(reference[0]), count: epochs.length, ffm: leo ? 'FFM 40×40' : 'FFM 20×20' }, tracks, pick.key ?? `${pick.source}|${pick.norad}|${pick.olderStart}`)) { stepped += 1; continue; }
        done = true;
        break;
      } catch (error) { console.error(`${id} ${pick.key}: ${String(error?.message ?? error).slice(0, 140)}`); }
    }
    if (!done && stepped) dropped({ id, reference: 'next', regime, provider });
    else if (!done) console.error(`${id}: none of the nearest forecasts had every arm`);
  }
  await F.close();
} else if (MODE === 'regimes') {
  // AP6.md's regimes: for each satellite named, the 72 h forecast whose AP error on day 3 is nearest AP's median for that satellite. Data E's orbits are not republished, so that group has no example.
  const { config, root, iso, ms, XM } = await import('./lib/xp2.mjs');
  const { pathToFileURL } = await import('node:url');
  const { openSgp4Fit } = await import('./lib/xp2.mjs');
  const { driverRows } = await import('./lib/xm3.mjs');
  const { openAp, apForces, fitPcf, fitWeather, rowsOfSpw, horizonOf } = await import('./lib/ap.mjs');
  const { openFfmHost, openAxes, apriori } = await import('./lib/host.mjs');
  const { STATIC, TESS, GROUPS, HX } = await import('./lib/regimes.mjs');
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const m = await openModules(), A = await apFor(openAp), G = await openSgp4Fit(), F = await openFfmHost();
  BUILDS = armBuilds(A, m, F);
  const GRID = XM.config.scoring.gridSeconds * 1000;
  const PCF_XP = fitPcf({ forces: {}, fit: null });
  const ffmSettings = (high) => (high ? {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
  } : {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
  });
  const rows = rowsIn(path.join(NEW, 'regimes')).filter((r) => !r.error);
  const NAMED = { LS: ['AJISAI', 'STARLETTE', 'LARES'], GD: ['LAGEOS 2', 'ETALON 1', 'LARES-2'] };
  const picks = [];
  if (SHOWCASE) for (const group of ['LS', 'GD', 'IG', 'GE', 'HE', 'HX']) picks.push([group, null]);
  else for (const group of ['LS', 'GD', 'IG', 'GE', 'HE', 'HX']) {
    const names = [...new Set(rows.filter((r) => r.group === group).map((r) => r.name))];
    const chosen = NAMED[group] ? names.filter((n) => NAMED[group].includes(n)) : group === 'HX' ? names.filter((n) => n === 'THEMIS A' || n === 'CHANDRA') : names.slice(0, group === 'HE' ? 1 : 2);
    for (const name of chosen) picks.push([group, name]);
  }
  const seriesOf = async (group, name) => {
    if (group === 'HX') {
      const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
      const h = HX.find((x) => x.name === name);
      const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
      const axes = await openAxes();
      const norm = s.lines.map((l) => ({ ...l, epoch: new Date(Math.round(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`) / 1000) * 1000).toISOString() }));
      const first = ms(norm[0].epoch);
      const lines = await axes.convert(norm.filter((l) => (ms(l.epoch) - first) % GRID === 0), 'EME2000', 'GCRF');
      await axes.close();
      return { norad: h.norad, objectId: h.objectId, lines };
    }
    if (group === 'HE') {
      const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
      const files = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
      const s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: TESS.name, norad: TESS.norad, fromUtc: TESS.from, toUtc: TESS.to, stride: 1 });
      const axes = await openAxes();
      const norm = s.lines.map((l) => ({ ...l, epoch: new Date(Math.round(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`) / 1000) * 1000).toISOString() }));
      const first = ms(norm[0].epoch);
      const lines = await axes.convert(norm.filter((l) => (ms(l.epoch) - first) % GRID === 0), 'EME2000', 'GCRF');
      await axes.close();
      return { norad: TESS.norad, objectId: TESS.objectId, lines };
    }
    if (group === 'IG' || group === 'GE') {
      const o = SRC.mgex({ klass: group === 'IG' ? 'igso' : 'geo' }).find((x) => x.name === name);
      return { norad: o.norad, objectId: o.objectId ?? '', lines: o.lines };
    }
    for (const o of STATIC.filter((x) => x.group === group)) { const s = SRC.chain(o.files()); if ((s.name || o.name) === name) return { norad: s.norad, objectId: s.objectId ?? '', lines: s.lines }; }
    throw new Error(`no series for ${name}`);
  };
  const seriesCache = new Map();
  for (const [group, only] of picks) {
    const slug = GROUPS[group].label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const vacuum = group === 'HE' || group === 'HX', arc = 72, D3 = '3';
    const e3 = (r, a) => (r.arms[a]?.ok ? r.arms[a].days?.[D3]?.e : undefined);
    const ranked = SHOWCASE
      ? showcaseRank(rows.filter((r) => r.group === group), (r) => ({ ap: e3(r, 'AP72'), xp: e3(r, 'XP72'), s: e3(r, 'S72'), f: e3(r, 'F72') }))
      : nearestMedian(rows.filter((r) => r.group === group && r.name === only), (r) => r.arms.AP72?.days?.[D3]?.e);
    const id = SHOWCASE ? `best-${slug}` : `truth-${slug}-${only.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (!wanted(id)) continue;
    const stored = FFM_ONLY && storedExample(id);
    if (FFM_ONLY && !stored) continue;
    const cutoffOf = (p) => iso(Date.parse(p.cutoff.length === 10 ? `${p.cutoff}T00:00:00Z` : p.cutoff));
    let done = false, stepped = 0, tried = 0;
    for (const pick of stored ? ranked.filter((p) => cutoffOf(p) === stored.d.cutoff && (only ?? p.name) === stored.d.satellite) : ranked) {
      if (!more(tried, stepped, SHOWCASE ? 12 : Infinity)) break;
      tried += 1;
      const name = only ?? pick.name;
      if (REFLIGHT && !storedWindow(id, { cutoff: iso(Date.parse(pick.cutoff.length === 10 ? `${pick.cutoff}T00:00:00Z` : pick.cutoff)), satellite: name })) continue;
      if (!seriesCache.has(name)) seriesCache.set(name, await seriesOf(group, name));
      const o = seriesCache.get(name);
      const times = o.lines.map((l) => ms(l.epoch));
      const between = (a, b) => o.lines.filter((_, i) => times[i] >= a && times[i] <= b);
      EXTRA = SHOWCASE ? { showcase: pick.showcase } : {};
      try {
        const D0 = Date.parse(pick.cutoff.length === 10 ? `${pick.cutoff}T00:00:00Z` : pick.cutoff);
        const from = D0 - arc * HOUR, to = D0 + 7 * DAY;
        const raw = between(from, D0);
        const thin = T.thinned(raw).chosen;
        const high = Math.hypot(...thin[0].r) >= 8400;
        const step = (high ? 300 : 60) * 1000;
        const whole = between(from, to), t0 = ms(whole[0].epoch);
        const grid = onGrid(whole, step);
        if (holed(grid.map((l) => l.epoch))) continue;
        const epochs = grid.map((l) => l.epoch), epochsMs = epochs.map(ms);
        if (holedFit(id, pick.key, [t0, ...epochsMs], D0)) { stepped += 1; continue; }
        let ex, spw;
        if (!vacuum) {
          const R = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
          if (R.excluded) continue;
          ex = { spw: fitWeather(R.rows, horizonOf(D0)) };
          spw = driverRows(R.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
        }
        if (stored) {
          const settings = ffmSettings(high);
          const ff = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0); if (!ff.state) continue;
          if (epochsMs.some((t) => t <= Date.parse(ff.epoch))) continue;
          writeFfm(stored, epochsMs, t0, (await inBatches(epochs, (part) => F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, part, settings, spw))).map((x) => x.r), F);
          done = true;
          break;
        }
        const pcfAp = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20, atmosphere: !vacuum }), fit: null });
        const oem = S.oemBytes({ frame: 'GCRF', object: { name, id: o.objectId, norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
        if (REFLIGHT) { await reflight({ id, A, M: m, oem, pcfAp, extraAp: ex, pcfXp: PCF_XP, reference: grid.map((l) => l.r), epochs }); done = true; break; }
        const fa = await A.fit(oem, pcfAp, ex); if (!fa.ok) continue;
        const fx = await A.fit(oem, PCF_XP, undefined); if (!fx.ok) continue;
        const fu = await U.fit(oem); if (!fu.ok) continue;
        const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name, objectId: o.objectId });
        const settings = ffmSettings(high);
        const ff = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0); if (!ff.state) continue;
        const sg = await m.propagateSgp4(el, o.norad, epochsMs, step / 1000);
        if (sg.some((s) => !s)) continue;
        if (epochsMs.some((t) => t <= Date.parse(ff.epoch))) continue;
        const tracks = {
          reference: grid.map((l) => l.r),
          AP: (await m.toAxes(await A.propagate(fa.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r),
          XP: (await m.toAxes(await A.propagate(fx.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r),
          XPU: (await m.toAxes(await U.propagate(fu.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r),
          SGP4: (await m.toAxes(sg, epochs, 'GCRF')).map((s) => s.r),
          FFM: (await inBatches(epochs, (part) => F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, part, settings, spw))).map((s) => s.r),
        };
        if (!burnFree({ id, reference: 'truth', regime: GROUPS[group].label, provider: GROUPS[group].provider, satellite: name, fitHours: arc, cutoff: iso(D0), start: iso(t0), fitEndMs: D0, scoreFromMs: D0, scoreToMs: to, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion({ r: grid[0].r, v: grid[0].v }), count: epochs.length, ffm: high ? 'FFM 20×20' : 'FFM 40×40' }, tracks, pick.key)) { stepped += 1; continue; }
        done = true;
        break;
      } catch (error) { console.error(`${id} ${pick.key}: ${String(error?.message ?? error).slice(0, 140)}`); }
    }
    if (!done && stepped) dropped({ id, reference: 'truth', regime: GROUPS[group].label, provider: GROUPS[group].provider });
    else if (!done) console.error(`${id}: none of the nearest forecasts had every arm`);
  }
  await F.close();
} else {
  const ON_XM = MODE === 'truth2';
  const { config, root, iso, ms, XM, windows } = await import('./lib/xp2.mjs');
  const { openSgp4Fit } = await import('./lib/xp2.mjs');
  const { driverRows } = await import('./lib/xm3.mjs');
  const { openAp, apForces, fitPcf, fitWeather, rowsOfSpw, horizonOf } = await import('./lib/ap.mjs');
  const { openFfmHost, apriori } = await import('./lib/host.mjs');
  const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
  const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
  const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
  const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
  const m = await openModules(), A = await apFor(openAp), G = await openSgp4Fit(), F = await openFfmHost();
  BUILDS = armBuilds(A, m, F);
  const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null }), PCF_XP = fitPcf({ forces: {}, fit: null });
  const MIN_COV = XM.config.fit.minimumCoverage;
  const ffmSettings = (high) => (high ? {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 20, order: 20, thirdBodies: [10, 301], srp: true, drag: false, solidTides: false, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 300, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'SRP_AREA_OVER_MASS', value: 0.02 }], fixed: {}, apriori: apriori([0.2]),
  } : {
    forces: { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined },
    integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
    parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: 0.02 }, apriori: apriori([0.1]),
  });
  const rows = rowsIn(path.join(NEW, ON_XM ? 'truth2' : 'truth')).filter((r) => !r.error);
  const allWindows = ON_XM ? Object.entries(XM.config.groups).flatMap(([group, g]) => g.objects.flatMap((o) => XM.daysOf(XM.config.period.from, XM.config.period.to).map((t) => ({ group, o, cutoffMs: t, key: `${group}|${o.norad}|${XM.dateOf(t)}` })))) : Object.keys(config.spans).flatMap((s) => windows(s));
  const byKey = new Map(allWindows.map((w) => [w.key, w]));
  const CUTS = ON_XM ? [{ group: 'S1', regime: 'Near 700 km', provider: 'Copernicus', arc: 72 }, { group: 'GN', regime: 'Medium Earth orbit', provider: 'ESA navigation', arc: 72 }, { group: 'P', regime: 'Strong drag, 2026', provider: 'ESA', arc: 24, only: /^Swarm/ }] : [{ group: undefined, regime: 'Strong drag, 2025', provider: 'ESA', arc: 24, only: /^Swarm/ }];
  const others = SHOWCASE ? new Map(rowsIn(path.join(NEW, ON_XM ? 'compare-truth2' : 'compare-truth')).filter((r) => !r.error).map((r) => [r.key, r])) : null;
  for (const cut of SHOWCASE ? CUTS.filter((c) => c.group !== 'P') : CUTS) {
    const inCut = rows.filter((r) => (ON_XM ? r.group === cut.group : true) && (!cut.only || cut.only.test(r.name)));
    for (const only of SHOWCASE ? [null] : [...new Set(inCut.map((r) => r.name))]) {
      const arm = `AP${cut.arc}`;
      const e3 = (r, a) => (r?.arms?.[a]?.ok ? r.arms[a].days?.['3']?.e : undefined);
      const ranked = SHOWCASE
        ? showcaseRank(inCut, (r) => { const c = others.get(r.key); return { ap: e3(r, arm), xp: e3(c, `XP${cut.arc}`), s: e3(c, `S${cut.arc}`), f: e3(c, `F${cut.arc}`) }; })
        : nearestMedian(inCut.filter((r) => r.name === only), (r) => r.arms[arm]?.days?.['3']?.e);
      const slug = cut.regime.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const id = SHOWCASE ? `best-${slug}` : `truth-${slug}-${only.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      if (!wanted(id)) continue;
      const stored = FFM_ONLY && storedExample(id);
      if (FFM_ONLY && !stored) continue;
      let done = false, stepped = 0, tried = 0;
      for (const pick of stored ? ranked.filter((p) => byKey.has(p.key) && iso(byKey.get(p.key).cutoffMs) === stored.d.cutoff && (only ?? p.name) === stored.d.satellite) : ranked) {
        if (!more(tried, stepped, 12)) break;
        tried += 1;
        const w = byKey.get(pick.key);
        if (!w) continue;
        const name = only ?? pick.name;
        if (REFLIGHT && !storedWindow(id, { cutoff: iso(w.cutoffMs), satellite: name })) continue;
        EXTRA = SHOWCASE ? { showcase: pick.showcase } : {};
        try {
          const { o, cutoffMs: D0 } = w;
          const from = D0 - cut.arc * HOUR, to = D0 + 7 * DAY;
          const raw = T.series(o, from, D0).lines;
          const coverage = raw.length > 1 ? raw.length / ((cut.arc * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0;
          if (coverage < MIN_COV) continue;
          const thin = T.thinned(raw).chosen;
          const high = Math.hypot(...thin[0].r) >= 8400, step = (high ? 300 : 60) * 1000;
          const whole = [...raw, ...T.series(o, D0 + 1, to).lines];
          const t0 = ms(whole[0].epoch);
          const grid = onGrid(whole, step);
          if (holed(grid.map((l) => l.epoch))) continue;
        if (holed(grid.map((l) => l.epoch))) continue;
          if (grid.length < 100) continue;
          const epochs = grid.map((l) => l.epoch), epochsMs = epochs.map(ms);
          if (holedFit(id, pick.key, [t0, ...epochsMs], D0)) { stepped += 1; continue; }
          const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
          if (O.excluded) continue;
          const ex = { spw: fitWeather(O.rows, horizonOf(D0)) };
          const spw = driverRows(O.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
          if (stored) {
            const settings = ffmSettings(high);
            const ff = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0); if (!ff.state) continue;
            if (epochsMs.some((t) => t <= Date.parse(ff.epoch))) continue;
            writeFfm(stored, epochsMs, t0, (await inBatches(epochs, (part) => F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, part, settings, spw))).map((x) => x.r), F);
            done = true;
            break;
          }
          const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
          if (REFLIGHT) { await reflight({ id, A, M: m, oem, pcfAp: PCF_AP, extraAp: ex, pcfXp: PCF_XP, reference: grid.map((l) => l.r), epochs }); done = true; break; }
          const fa = await A.fit(oem, PCF_AP, ex); if (!fa.ok) continue;
          const fx = await A.fit(oem, PCF_XP, undefined); if (!fx.ok) continue;
          const fu = await U.fit(oem); if (!fu.ok) continue;
          const { el } = await G.fit(oem, { from: thin[0].epoch, to: iso(D0), epoch: 'first', fitBstar: true }, { name: o.name, objectId: o.objectId ?? '' });
          const settings = ffmSettings(high);
          const ff = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, spw, D0); if (!ff.state) continue;
          const sg = await m.propagateSgp4(el, o.norad, epochsMs, step / 1000);
          if (sg.some((s) => !s)) continue;
          const ffmFrom = Date.parse(ff.epoch), inFfm = epochs.map((_, i) => epochsMs[i] > ffmFrom);
          if (inFfm.some((b) => !b)) continue;
          const tracks = {
            reference: grid.map((l) => l.r),
            AP: (await m.toAxes(await A.propagate(fa.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r),
            XP: (await m.toAxes(await A.propagate(fx.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r),
            XPU: (await m.toAxes(await U.propagate(fu.ocm, epochs, epochs.length), epochs, 'GCRF')).map((s) => s.r),
            SGP4: (await m.toAxes(sg, epochs, 'GCRF')).map((s) => s.r),
            FFM: (await inBatches(epochs, (part) => F.forecast({ epoch: ff.epoch, state: ff.state, parameters: ff.parameters }, part, settings, spw))).map((s) => s.r),
          };
          const publicName = name;
          if (!burnFree({ id, reference: 'truth', regime: cut.regime, provider: cut.provider, satellite: publicName, fitHours: cut.arc, cutoff: iso(D0), start: iso(t0), fitEndMs: D0, scoreFromMs: D0, scoreToMs: to, epochsSeconds: epochsMs.map((t) => (t - t0) / 1000), meanMotion: meanMotion({ r: grid[0].r, v: grid[0].v }), count: epochs.length, ffm: high ? 'FFM 20×20' : 'FFM 40×40' }, tracks, pick.key)) { stepped += 1; continue; }
          done = true;
          break;
        } catch (error) { console.error(`${id} ${pick.key}: ${String(error?.message ?? error).slice(0, 140)}`); }
      }
      if (!done && stepped) dropped({ id, reference: 'truth', regime: cut.regime, provider: cut.provider });
      else if (!done) console.error(`${id}: none of the nearest forecasts had every arm`);
    }
  }
  await F.close();
}
if (REFLIGHT) {
  const missing = [...considered].filter((id) => !written.has(id));
  console.log(`REFLIGHT ${written.size} of ${considered.size} examples flown again on sdn-ap ${REFLIGHT_BUILD.version}${missing.length ? `; not found again: ${missing.join(', ')}` : ''}`);
  process.exit(missing.length ? 1 : 0);
}
process.exit(0);
