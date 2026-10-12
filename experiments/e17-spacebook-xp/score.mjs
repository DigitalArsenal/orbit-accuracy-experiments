// E17 scoring: per capture day, the Spacebook XP sets and the public GP sets of the same moment, propagated by
// propagator/sgp4-xp (SGP4-XP and SGP4, GCRF), against the opening hours of later operator files.
//   SDN_MODULES=<space-data-network-modules checkout> node experiments/e17-spacebook-xp/score.mjs --day YYYY-MM-DD
//   ... --check   parses a capture and propagates one object; compares nothing with truth (allowed before the freeze)
// Writes runs/e17/<day>.json: per object, arm and horizon bin, the RMS 3D position error and the epoch count. No
// element set, ephemeris or per-epoch value of Spacebook is written.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8'));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]] : null)).filter(Boolean));
const day = args.day;
if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('--day YYYY-MM-DD');
const check = args.check === true;
if (!check && !config.frozen) throw new Error('E17 is not frozen: only --check runs before the freeze (PLAN.md)');

const modules = process.env.SDN_MODULES;
if (!modules) throw new Error('SDN_MODULES must point at a space-data-network-modules checkout');
const xpTests = path.join(modules, 'propagator/sgp4-xp/tests');
const { loadModule, wasmPath } = await import(path.join(xpTests, 'lib/module.mjs'));
const { frame, oemBytes, ommBytes, readOem, blockLines } = await import(path.join(xpTests, 'lib/sds.mjs'));
const { omm: ommOfLines } = await import(path.join(xpTests, 'lib/tle.mjs'));
const { parseMeme } = await import(path.join(xpTests, 'measure/lib/sources.mjs'));
const { parseOemKvn } = await import(path.join(xpTests, 'lib/oemkvn.mjs'));
const wasmSha = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
const pinned = config.modulesBinary?.wasmSha256?.['propagator/sgp4-xp'];
if (pinned && wasmSha !== pinned) throw new Error(`propagator/sgp4-xp module.wasm ${wasmSha} is not the pinned ${pinned}`);

const HOUR = 3600e3;
const STEP_MS = 300e3; // truth epochs every 5 min inside each bin
const gunzip = (file) => zlib.gunzipSync(fs.readFileSync(file)).toString('latin1');
const pairs = (text) => {
  const out = new Map();
  const lines = text.split('\n');
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (lines[i].startsWith('1 ') && lines[i + 1].startsWith('2 ')) { out.set(Number(lines[i].slice(2, 7)), [lines[i].trimEnd(), lines[i + 1].trimEnd()]); i += 1; }
  }
  return out;
};

// ---- the capture ----
const captureDir = path.join(config.captures.spacebook, day.slice(0, 4), day);
const run = JSON.parse(fs.readFileSync(path.join(captureDir, 'run.json'), 'utf8'));
if (!run.complete) throw new Error(`${day}: capture incomplete`);
const requestMs = Date.parse(run.started_utc);
const xp = pairs(gunzip(path.join(captureDir, 'xp-tle.txt.gz')));
const truthRoot = config.captures.truthDaily;
const targets = [25544, ...fs.readdirSync(path.join(truthRoot, day, 'starlink')).map((f) => Number(f.split('.')[0]))];

// ---- GP: per target, the newest set created before the request (gp_history windows of the 10 days before) ----
function gpBefore(norads) {
  const want = new Set(norads);
  const best = new Map();
  const years = [...new Set([new Date(requestMs - 10 * 86400e3).getUTCFullYear(), new Date(requestMs).getUTCFullYear()])];
  for (const year of years) {
    const dir = path.join(config.inputs.gpHistory, String(year));
    for (const name of fs.readdirSync(dir)) {
      const from = Date.parse(name.slice(0, 18).replace(/^(\d{4}-\d{2}-\d{2}T)(\d{2})(\d{2})(\d{2})Z$/, '$1$2:$3:$4Z'));
      if (!(from >= requestMs - 10 * 86400e3 && from <= requestMs)) continue;
      for (const r of JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))).toString('utf8'))) {
        const norad = Number(r.NORAD_CAT_ID);
        const created = Date.parse(`${r.CREATION_DATE}Z`);
        if (!want.has(norad) || !(created < requestMs)) continue;
        const have = best.get(norad);
        if (!have || created > have.created || (created === have.created && r.EPOCH > have.epoch)) best.set(norad, { created, epoch: r.EPOCH, lines: [r.TLE_LINE1, r.TLE_LINE2] });
      }
    }
  }
  return best;
}

// ---- truth: the opening 6 h of each later file, as GCRF positions (EME2000 differs from GCRF by about a metre) ----
function truthStates(norad) {
  const states = [];
  for (const d of fs.readdirSync(truthRoot).filter((x) => x >= day).sort()) {
    const file = norad === 25544 ? path.join(truthRoot, d, 'iss-oem.txt.gz') : path.join(truthRoot, d, 'starlink', `${norad}.txt.gz`);
    if (!fs.existsSync(file)) continue;
    const lines = norad === 25544 ? parseOemKvn(gunzip(file)).blocks.flatMap((b) => b.lines) : parseMeme(gunzip(file));
    if (!lines.length) continue;
    const start = Date.parse(lines[0].epoch.endsWith('Z') ? lines[0].epoch : `${lines[0].epoch}Z`);
    for (const l of lines) {
      const t = Date.parse(l.epoch.endsWith('Z') ? l.epoch : `${l.epoch}Z`);
      if (t - start <= 6 * HOUR) states.push({ t, r: l.r });
    }
  }
  return states;
}
const binOf = (dtMs) => config.horizonBinsHours.findIndex(([a, b]) => dtMs >= a * HOUR && dtMs <= b * HOUR);
function sample(states) {
  const out = [];
  let last = -Infinity;
  for (const s of states.sort((a, b) => a.t - b.t)) if (s.t - last >= STEP_MS && binOf(s.t - requestMs) >= 0) { out.push(s); last = s.t; }
  return out;
}

// ---- propagation by the module ----
const mod = await loadModule();
async function positions(lines, epochs) {
  const fields = ommOfLines(lines, { norad: Number(lines[0].slice(2, 7)) });
  const grid = oemBytes({ blocks: [{ frame: 'GCRF', lines: epochs.map((t) => ({ epoch: new Date(t).toISOString() })) }] });
  const out = await mod.invoke('propagate', [frame('omm', 'OMM', ommBytes(fields)), frame('grid', 'OEM', grid)]);
  const oem = readOem(out.ephemeris?.[0] ?? Object.values(out)[0][0]);
  return oem.EPHEMERIS_DATA_BLOCK.flatMap(blockLines).map((l) => l.r);
}

const gp = gpBefore(targets);
const result = { experiment: config.experiment, day, request_utc: run.started_utc, module: { wasm: path.relative(modules, wasmPath) }, bins: config.horizonBinsHours, rows: [], skipped: [] };
for (const norad of check ? targets.slice(0, 1) : targets) {
  const arms = { XP: xp.get(norad), GP: gp.get(norad)?.lines };
  if (!arms.XP || !arms.GP) { result.skipped.push({ norad, reason: !arms.XP ? 'no XP set' : 'no GP set before the request' }); continue; }
  if (check) {
    const t = [requestMs, requestMs + HOUR];
    for (const [arm, lines] of Object.entries(arms)) {
      const r = await positions(lines, t);
      console.log(`check ${norad} ${arm}: ${ommOfLines(lines).theory}, ${r.length} positions, |r| ${Math.hypot(...r[0]).toFixed(1)} km`);
    }
    continue;
  }
  const truth = sample(truthStates(norad));
  if (!truth.length) { result.skipped.push({ norad, reason: 'no truth in any bin' }); continue; }
  for (const [arm, lines] of Object.entries(arms)) {
    const r = await positions(lines, truth.map((s) => s.t));
    const sums = config.horizonBinsHours.map(() => ({ n: 0, ss: 0 }));
    truth.forEach((s, i) => { const b = binOf(s.t - requestMs); const e = Math.hypot(r[i][0] - s.r[0], r[i][1] - s.r[1], r[i][2] - s.r[2]); sums[b].n += 1; sums[b].ss += e * e; });
    sums.forEach((s, b) => { if (s.n) result.rows.push({ norad, arm, bin: b, epochs: s.n, rmsKm: Math.sqrt(s.ss / s.n) }); });
  }
}
await mod.destroy();
if (!check) {
  const out = path.join(here, '../../runs/e17');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `${day}.json`), JSON.stringify(result, null, 1) + '\n');
  console.log(`${day}: ${result.rows.length} rows, ${result.skipped.length} skipped`);
} else {
  console.log(`check ${day}: ${xp.size} XP sets, GP before the request for ${gp.size} of ${targets.length} targets, ${result.skipped.length} skipped`);
}
