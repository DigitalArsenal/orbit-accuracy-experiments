// The bar's table for a released sdn-ap version: the catalog's fit (stack #503, #504). For every window of every row that has a numerical arm, AP's record
// is fitted to the numerical propagator's forecast over 0 to 120 h after the cutoff (the module's fit, the row's $PCF, the weather known
// at the cutoff), and the window's figure is the largest 3D distance between that record and the forecast over 0 to 120 h on the
// forecast's 300 s grid (the bar: at most 100 m). Beside it, the error against the precise orbit at day 5 (the scoreboard's statistic:
// the RMS of the 3D error over the 24 h ending at 120 h, on the table's scored epochs) of AP's record and of the numerical forecast.
// The numerical trajectories are the stored ones (<store>/numerical-trajectories, its manifest's last line per window and fit arc): the
// row's numerical arm (the scoreboard's, by name) fitted to the precise orbit over the fit arc before the cutoff, and over the arc after
// the last burn known at the cutoff where that rule moved its arc, then flown 7 days past the cutoff. Writes one JSON
// (schema sdn-ap-catalog-fit/1) of aggregates only: per row and per front-page group, nothing per window.
//
//   node experiments/headline-loop/bar.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 8]
//     [--groups LS,DO] [--arcs 72,24] [--scoreboard <the same build's table.mjs file>: each row's windows are the scoreboard row's]
//
// The build is read by git show at the commit, never from a working tree; this repository's working tree must be clean (the file names
// its commit). Each window's figures go to <store>/bar/<wasm sha12>/rows.jsonl and are flown again only when its manifest line changes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO, MODULES_ROOT, usePackages, envRecord } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const HOUR = 3600e3, DAY = 864e5, BAR_M = 100, BAR_H = 120, STEP_S = 300;
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE', 'HX'];
// the front page's four groups (the site's)
const GROUPS = [
  { key: 'leo', name: 'Low Earth orbit', regimes: ['LS', 'DO', 'S1', 'P', 'T'] },
  { key: 'meo', name: 'Medium Earth orbit', regimes: ['GD', 'GN', 'GN_GAL'] },
  { key: 'geo', name: 'Geosynchronous', regimes: ['IG', 'GE', 'WA'] },
  { key: 'heo', name: 'Highly elliptical', regimes: ['HE', 'HX'] },
];
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });
const doneKey = (r) => `${r.key}|${r.arcH}|${r.source}|${r.from}`;

if (args.worker) await worker(); else await main();

async function main() {
  const t0 = Date.now(), root = args['modules-root'], want = args['modules-commit'], out = args.out;
  if (!root || !want || !out) throw new Error('usage: bar.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 8] [--groups LS,DO] [--arcs 72,24]');
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments').toString().trim();
  if (dirty) throw new Error(`refused: this repository's working tree differs from its commit (the file names the commit):\n${dirty}`);
  const harnessCommit = git(REPO, 'rev-parse', 'HEAD').toString().trim();
  const commit = git(root, 'rev-parse', '--verify', `${want}^{commit}`).toString().trim();
  const wasm = git(root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`);
  const version = JSON.parse(git(root, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  const wasmSha = sha256(wasm);
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const { FFM_220 } = await import(path.join(REPO, 'experiments/operator-theory/lib/build.mjs'));
  const dir = path.join(A.STORE_ROOT, 'bar', wasmSha.slice(0, 12)), file = path.join(dir, 'module.wasm'), rowsFile = path.join(dir, 'rows.jsonl');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
  const groups = args.groups ? args.groups.split(',') : ALL, arcs = (args.arcs ?? '72,24').split(',').map(Number);
  const traj = path.join(A.STORE_ROOT, 'numerical-trajectories'), manifest = new Map();
  for (const l of fs.readFileSync(path.join(traj, 'manifest.jsonl'), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); manifest.set(`${r.key}|${r.arcH}`, r); }
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);
  // The windows each row scores, as table.mjs scores them with --burns: its listing (the first pass, and a regime's second pass once its
  // numerical rows are all in the store), its numerical row (the refit after the burn where the rule moved the arc), its arm (the
  // fullest stored setting by name), and a window counted where AP's row of this build (the table's, <store>/table/<wasm sha12>) and that
  // arm both have a figure at one lead at least. The numerical day-5 figure is the same row's.
  const base = new Map();
  for (const f of fs.readdirSync(path.join(A.STORE_ROOT, A.NUMERICAL_STORE)).filter((x) => /^rows-truth-.*\.jsonl$/.test(x)))
    for (const r of readRows(path.join(A.STORE_ROOT, A.NUMERICAL_STORE, f))) { const k = `${r.key}|${r.arcH}`; if (!base.has(k) || (base.get(k).error && !r.error)) base.set(k, r); }
  const afterBurn = new Map(), afterBurnGroups = new Set(), abDir = path.join(A.STORE_ROOT, A.NUMERICAL_AFTER_BURN.store);
  for (const f of fs.existsSync(abDir) ? fs.readdirSync(abDir).filter((x) => /^rows-after-burn-.*\.jsonl$/.test(x)) : [])
    for (const r of readRows(path.join(abDir, f))) { const k = `${r.key}|${r.arcH}`; if (!afterBurn.has(k) || (afterBurn.get(k).error && !r.error)) afterBurn.set(k, r); afterBurnGroups.add(r.group); }
  const REFIT = 'maneuvering: the arc after its last burn', NOT_CONFIGURED = new Set(['WA']), PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'];
  const numericalOf = (w, arc) => {
    const k = `${w.key}|${arc}`, b = base.get(k);
    if (!b || !afterBurnGroups.has(w.group)) return b;
    const r = afterBurn.get(k);
    if (!r || r.error) return b?.error ? b : null;
    if (NOT_CONFIGURED.has(w.group) && r.burnInArc) return { ...b, arms: {}, burnInArc: true };
    if (r.fitProcess === REFIT) return { ...b, arms: { FFMq: r.arms?.FFMq ?? { ok: false } } };
    return b;
  };
  const chooseArm = (g, bs) => (NOT_CONFIGURED.has(g) && !afterBurnGroups.has(g) ? null : PREFER.find((a) => bs.some((b) => b.arms?.[a]?.ok)) ?? null);
  const meters = (row, arm, day) => { const e = arm ? row?.arms?.[arm]?.ok && row.arms[arm].days?.[day]?.e : row?.days?.[day]?.e; return Number.isFinite(e) ? e * 1000 : null; };
  const all = W.windowsOf(groups);
  const secondIn = new Set(groups.filter((g) => { const sec = all.second.filter((w) => w.group === g); return sec.length && sec.every((w) => w.arcs.every((a) => base.has(`${w.key}|${a}`))); }));
  const listed = [...all.windows, ...all.second.filter((w) => secondIn.has(w.group))];
  const apRows = new Map(readRows(path.join(A.STORE_ROOT, 'table', wasmSha.slice(0, 12), 'rows.jsonl')).filter((r) => (r.theory ?? 'AP') === 'AP' && r.ap?.sha256 === wasmSha).map((r) => [`${r.key}|${r.arcH}`, r]));
  const rowArm = new Map(), numDay5 = new Map(), scoredKeys = new Set();
  for (const g of groups) for (const a of arcs) {
    const ws = listed.filter((w) => w.group === g && w.arcs.includes(a));
    if (!ws.length) continue;
    const bs = ws.map((w) => numericalOf(w, a)), label = bs.every(Boolean) ? chooseArm(g, bs) : null;
    rowArm.set(`${g}|${a}`, label);
    ws.forEach((w, i) => {
      if (W.LEADS.some((d) => meters(apRows.get(`${w.key}|${a}`), null, d) != null && (!label || meters(bs[i], label, d) != null))) scoredKeys.add(`${w.key}|${a}`);
      if (label) numDay5.set(`${w.key}|${a}`, meters(bs[i], label, 5));
    });
  }
  const stored = new Map();
  if (fs.existsSync(rowsFile)) for (const r of readRows(rowsFile)) if (r.wasmSha256 === wasmSha) stored.set(doneKey(r), r);
  // every window each row scores (with --scoreboard; else every listed window) at its fit arcs; flown where its manifest line holds a trajectory
  const exact = !!args.scoreboard;
  const wanted = listed.flatMap((w) => w.arcs.filter((a) => arcs.includes(a) && (!exact || scoredKeys.has(`${w.key}|${a}`))).map((a) => ({ w, a, m: manifest.get(`${w.key}|${a}`) })));
  const todo = wanted.filter((x) => x.m && x.m.source !== 'none' && x.m.file && !stored.has(doneKey(x.m)));
  const jobs = Math.min(Number(args.jobs ?? 8), todo.length);
  console.error(`bar: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${wanted.length} window-arcs, ${wanted.filter((x) => x.m && x.m.source !== 'none').length} with a numerical trajectory, ${todo.length} to fly on ${jobs} jobs`);
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, '--version', version, '--groups', groups.join(',')], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => (next < todo.length ? child.send({ m: todo[next++].m }) : child.send({ stop: true }));
    child.on('message', (msg) => {
      if (msg.row) {
        const row = { ...msg.row, version, modulesCommit: commit, wasmSha256: wasmSha, harness: harnessCommit };
        fs.appendFileSync(rowsFile, `${JSON.stringify(row)}\n`); stored.set(doneKey(row), row);
        flown += 1; if (flown % 25 === 0 || flown === todo.length) console.error(`  ${flown}/${todo.length}, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));

  // the numerical arm's day-5 error against the precise orbit: the scoreboard's own figure for the window (its numerical row and arm)
  const ffmDay5 = (m) => numDay5.get(`${m.key}|${m.arcH}`) ?? null;
  const quantile = (v, p) => { const s = v.slice().sort((a, b) => a - b); if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  const cells = (xs) => {
    // a window whose fit is refused or whose flight fails counts against the share: the bar is met over every window attempted
    const ok = xs.filter((x) => x.r && !x.r.error), failed = xs.filter((x) => x.r?.error).length, D = ok.map((x) => x.r.maxDistanceM), met = D.filter((d) => d <= BAR_M).length;
    // the day-5 medians are paired: both over the windows where AP's figure and the numerical propagator's stored figure both exist;
    // unpaired counts the flown windows with AP's figure and no numerical figure in the store
    const pairs = ok.map((x) => [x.r.day5M, ffmDay5(x.m)]), paired = pairs.filter(([a, f]) => Number.isFinite(a) && Number.isFinite(f)), attempted = ok.length + failed;
    return { flown: ok.length, failed, withinBar: { windows: attempted, met, share: attempted ? Math.round((met / attempted) * 1000) / 1000 : null },
      maxDistanceM: { median: r1(quantile(D, 0.5)), worst: r1(D.length ? Math.max(...D) : null) },
      truthDay5: { windows: paired.length, unpaired: pairs.filter(([a, f]) => Number.isFinite(a) && !Number.isFinite(f)).length,
        ap: { medianM: r1(quantile(paired.map(([a]) => a), 0.5)) }, ffm: { medianM: r1(quantile(paired.map(([, f]) => f), 0.5)) } } };
  };
  // --scoreboard <the same build's scoreboard file>: each row's windows and satellites are the scoreboard row's own (the windows it scores),
  // so "flown on N of M" reads against the scoreboard; without it, the windows listed for the row
  const board = args.scoreboard ? JSON.parse(fs.readFileSync(args.scoreboard, 'utf8')) : null;
  if (board && board.module?.wasmSha256 !== wasmSha) throw new Error(`--scoreboard is of wasm ${board.module?.wasmSha256}, not ${wasmSha}`);
  const boardRow = (g, a) => board?.rows.find((r) => r.regime === W.GROUPS[g].label && r.fitHours === a) ?? null;
  const rows = [], byGroup = new Map();
  for (const g of ALL.filter((x) => groups.includes(x))) {
    for (const a of arcs) {
      const xs = wanted.filter((x) => x.w.group === g && x.a === a).map((x) => ({ ...x, r: x.m && x.m.source !== 'none' ? stored.get(doneKey(x.m)) : null }));
      if (!xs.length) continue;
      const written = xs.filter((x) => x.m && x.m.source !== 'none').length, b = boardRow(g, a);
      if (board && !b) continue;
      const windows = b ? b.windows : xs.length;
      // the set flown is the scoreboard's own: its count must be the scoreboard row's
      if (b && xs.length !== b.windows) console.error(`bar: ${W.GROUPS[g].label} ${a} h: ${xs.length} windows scored here against the scoreboard's ${b.windows}`);
      const head = { regime: W.GROUPS[g].label, fitHours: a, satellites: b ? b.satellites : new Set(xs.map((x) => x.w.name)).size, windows, ...(b && xs.length !== b.windows ? { note: `${xs.length} windows scored by this file's reading of the store against the scoreboard's ${b.windows}` } : {}) };
      if (!written) { rows.push({ ...head, noNumericalArm: true }); continue; }
      const c = cells(xs.filter((x) => x.m && x.m.source !== 'none'));
      const refitAfterBurn = xs.filter((x) => /after the burn/.test(x.m?.source ?? '')).length;
      rows.push({ ...head, ...c, trajectories: { written, missing: Math.max(0, windows - written), refitAfterBurn } });
      byGroup.set(`${g}|${a}`, xs.filter((x) => x.m && x.m.source !== 'none'));
    }
  }
  // a front-page group pools each of its rows once, at the row's longest fit arc here (72 h where the row has one, else 24 h), so no
  // window counts under two arcs; groups[].rows names the arc each row contributes
  const pooledArc = (g) => [...arcs].sort((p, q) => q - p).find((a) => byGroup.has(`${g}|${a}`)) ?? null;
  const groupsOut = GROUPS.map((G) => {
    const parts = G.regimes.filter((g) => groups.includes(g)).map((g) => ({ g, a: pooledArc(g) })).filter((p) => p.a != null);
    const c = cells(parts.flatMap((p) => byGroup.get(`${p.g}|${p.a}`)));
    return { key: G.key, name: G.name, regimes: G.regimes.filter((g) => groups.includes(g)).map((g) => W.GROUPS[g].label),
      rows: parts.map((p) => ({ regime: W.GROUPS[p.g].label, fitHours: p.a })), flown: c.flown, failed: c.failed, met: c.withinBar.met, truthDay5: c.truthDay5 };
  });
  const doc = {
    schema: 'sdn-ap-catalog-fit/1',
    measured: new Date().toISOString().slice(0, 10),
    module: { version, modulesCommit: commit, wasmSha256: wasmSha },
    harness: { repo: 'orbit-accuracy-experiments', commit: harnessCommit, command: ['node', 'experiments/headline-loop/bar.mjs', ...repositoryArgs(process.argv.slice(2))].join(' ') },
    ffm: { version: FFM_220.version, wasmSha256: FFM_220.wasmSha256, modulesCommit: FFM_220.modulesCommit },
    method: 'The numerical propagator (FFM, the row\'s numerical arm as the scoreboard names it) is fitted to the precise orbit over the fit arc before the cutoff, data before the cutoff only (on the arc after the last burn known at the cutoff where that rule moves the arc), and flown 7 days past the cutoff. AP\'s record is fitted, by the module\'s fit with the row\'s $PCF and the space weather known at the cutoff, to that forecast\'s states from the cutoff to 120 h after it, one every 300 s; the fit is one per window. A window\'s figure is the largest 3D distance between AP\'s record and the numerical forecast over 0 to 120 h on the forecast\'s 300 s grid (the bar: at most 100 m). The day-5 figures are the root mean square of the 3D error against the precise orbit over the 24 h ending at 120 h, for AP\'s record and for the numerical forecast; both medians are over the same windows, those where both figures exist (truthDay5.windows), and truthDay5.unpaired counts the flown windows with AP\'s figure and no numerical figure in the store. A window without a stored numerical trajectory is neither flown nor failed (trajectories.missing); a fit or flight that fails is counted in failed and against the share (withinBar.windows is every window attempted, flown and failed), never dropped.',
    bar: { withinM: BAR_M, fromHours: 0, toHours: BAR_H, stepS: STEP_S },
    ...(board ? { scoreboard: { schema: board.schema, sha256: sha256(fs.readFileSync(args.scoreboard)), windows: 'each row\'s windows and satellites are the scoreboard row\'s' } } : {}),
    rows,
    groups: groupsOut,
  };
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.error(`bar: wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

async function worker() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const APL = await import(path.join(REPO, 'experiments/operator-theory/lib/ap.mjs'));
  const { openModules } = await import(path.join(W.root, W.XP2F.xm.dir, 'lib/modules.mjs'));
  const entry = createRequire(path.join(MODULES_ROOT, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
  const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
  const S = A.S, arms = await A.openArms({}), m = await openModules(), env = envRecord();
  const h = await createStandaloneHarness('browser', args.wasm, { surface: 'direct' });
  const invoke = async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r; };
  const iso = (t) => new Date(t).toISOString();
  const flightPcf = (epochs) => { const t = new S.PCF.PCFT(); t.OUTPUT = Object.assign(new S.PCF.PCFOutputT(), { FRAME: S.PCF.pcfOutputFrame.GCRF, EPOCHS: epochs }); const b = new S.flatbuffers.Builder(1 << 14); S.PCF.PCF.finishPCFBuffer(b, t.pack(b)); return b.asUint8Array().slice(); };
  const fly = async (ocm, epochs) => S.oemLines(new Uint8Array((await invoke('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: ocm }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: flightPcf(epochs) }])).outputs.find((o) => o.portId === 'ephemeris').payload)).map((l) => ({ r: l.r, v: l.v }));
  const fit = async (oem, pcf, spw) => new Uint8Array((await invoke('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }, ...(spw ? [{ portId: 'space_weather', typeRef: S.TYPE('SPW'), payload: spw }] : [])])).outputs.find((o) => o.portId === 'elements').payload);
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  const all = W.windowsOf(args.groups.split(',')), winOf = new Map([...all.windows, ...all.second].map((w) => [w.key, w]));
  const traj = path.join(A.STORE_ROOT, 'numerical-trajectories');
  const lastLine = (key, arcH) => { let last = null; for (const l of fs.readFileSync(path.join(traj, 'manifest.jsonl'), 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); if (r.key === key && r.arcH === arcH) last = r; } return last; };
  const flyOne = async (man) => {
    const t1 = performance.now(), row = { key: man.key, group: man.group, arcH: man.arcH, arm: man.arm, source: man.source, from: man.from, env };
    try {
      const w = winOf.get(man.key);
      if (!w) throw new Error('not a listed window');
      const D0 = w.cutoffMs, G = W.GROUPS[w.group];
      // the manifest's line as it is now: a refit overwrites the trajectory and appends a line
      const now = lastLine(man.key, man.arcH);
      if (!now || now.source !== man.source || now.from !== man.from || now.count !== man.count) throw new Error('trajectory changed since the manifest was read');
      const buf = fs.readFileSync(path.join(traj, man.file));
      if (buf.byteLength !== man.count * 48) throw new Error(`trajectory file holds ${buf.byteLength / 48} states, the manifest ${man.count}`);
      const f64 = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8), from = Date.parse(man.from), step = man.stepS * 1000;
      const num = Array.from({ length: man.count }, (_, k) => ({ t: from + k * step, epoch: iso(from + k * step), r: [f64[6 * k], f64[6 * k + 1], f64[6 * k + 2]], v: [f64[6 * k + 3], f64[6 * k + 4], f64[6 * k + 5]] }));
      const span = num.filter((l) => l.t >= D0 && l.t <= D0 + BAR_H * HOUR);
      if (span.length < 2) throw new Error('no forecast span');
      const truth = await W.truthOf(w, D0 - man.arcH * HOUR - HOUR, D0 + 7 * DAY + HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      const wx = G.vacuum ? null : W.weatherAt(D0), object = { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 };
      const choice = A.apPcfFor(w.group, args.version, G.vacuum, man.arcH);
      row.pcf = choice.label;
      const lines = span.map(({ epoch, r, v }) => ({ epoch, r, v }));
      const tf = performance.now();
      const ocm = await fit(S.oemBytes({ frame: 'GCRF', object, lines, useableStart: lines[0].epoch, useableStop: lines.at(-1).epoch }), choice.pcf, wx?.spw);
      row.fitS = r1((performance.now() - tf) / 1000);
      const info = APL.readOcm(ocm);
      const flown = await fly(ocm, span.map((l) => l.epoch));
      const d = flown.map((s, k) => Math.hypot(s.r[0] - span[k].r[0], s.r[1] - span[k].r[1], s.r[2] - span[k].r[2]) * 1000);
      const at = d.indexOf(Math.max(...d));
      Object.assign(row, { maxDistanceM: r1(d[at]), atH: r1((span[at].t - D0) / HOUR), fitRmsM: r1(info.fitRmsKm * 1000), bterm: info.bterm ?? null });
      if (sc.entered.includes(5)) { const days = W.byDay(await m.rtn(await fly(ocm, sc.epochs), sc.truth), sc.entered, sc.sizes); row.day5M = r1(days[5].e * 1000); }
    } catch (e) { row.error = String(e?.message ?? e).slice(0, 200); }
    row.wallS = r1((performance.now() - t1) / 1000);
    return row;
  };
  process.on('message', async (msg) => { if (msg.stop) process.exit(0); process.send({ row: await flyOne(msg.m) }); });
  process.send({ ready: true });
}

function repositoryArgs(argv) { const out = []; for (let i = 0; i < argv.length; i += 1) { if (['--modules-root', '--out', '--scoreboard'].includes(argv[i])) { i += 1; continue; } out.push(argv[i]); } return out; }
