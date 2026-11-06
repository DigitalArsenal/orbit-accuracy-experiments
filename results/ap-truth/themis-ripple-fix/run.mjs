// THEMIS-RIPPLE-FIX.md (b), (c): every stored window with e > 0.3, each arm fitted and flown on its build; rows to the store.
// Module calls only: every state from propagator/sdn-ap, frames by foundation/frames, RTN errors by analysis/gp-error-model.
//   SDN_MODULES_ROOT=<root> node run.mjs --arms base=<wasm>,cand=<wasm> [--shard k/n] [--only THEMIS|CHANDRA|TESS]
//   node run.mjs --table      (rows to table.json and README-run.md here)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname);
const EXP = path.resolve(HERE, '../../../experiments/operator-theory');
const STORE = process.env.THEMIS_RIPPLE_STORE ?? '/opt/data/sdn-archive/operator-theory/themis-ripple-fix';
const STEP_S = 300, HOUR = 3600000, DAY = 86400000, ARC_H = 72;
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const rowsOf = () => (fs.existsSync(STORE) ? fs.readdirSync(STORE).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => jsonl(path.join(STORE, f))) : []);

/** Bootstrap 95 % percentile interval of the median over windows (10,000 draws, seed 20261106). */
function bootstrap(values) {
  const v = values.filter(Number.isFinite);
  if (!v.length) return null;
  let s = 20261106 >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const meds = [];
  for (let b = 0; b < 10000; b += 1) meds.push(median(v.map(() => v[Math.floor(rnd() * v.length)])));
  meds.sort((a, b) => a - b);
  return [meds[Math.floor(0.025 * meds.length)], meds[Math.floor(0.975 * meds.length)]];
}

if (args.table) {
  const rows = rowsOf().filter((r) => r.ok);
  const out = [];
  for (const object of [...new Set(rows.map((r) => r.object))]) for (const arm of [...new Set(rows.map((r) => r.arm))]) {
    const rs = rows.filter((r) => r.object === object && r.arm === arm);
    if (!rs.length) continue;
    const day = (k) => ({ median: median(rs.map((r) => r.days[k]?.e)), interval: bootstrap(rs.map((r) => r.days[k]?.e)) });
    out.push({ object, arm, windows: rs.length, roughM: median(rs.map((r) => r.rough)), roughMax: Math.max(...rs.map((r) => r.rough)), day1: day(1), day3: day(3), day7: day(7) });
  }
  fs.writeFileSync(path.join(HERE, 'table.json'), `${JSON.stringify({ registration: 'experiments/operator-theory/THEMIS-RIPPLE-FIX.md', rows: rows.length, builds: [...new Map(rows.map((r) => [r.arm, r.sha256])).entries()], per: out }, null, 1)}\n`);
  const f = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
  const iv = (d) => (d.interval ? `${f(d.median)} [${f(d.interval[0])}, ${f(d.interval[1])}]` : '-');
  const lines = out.map((p) => `| ${p.object} | ${p.arm} | ${p.windows} | ${f(p.roughM, 3)} | ${iv(p.day1)} | ${iv(p.day3)} | ${iv(p.day7)} |`);
  fs.writeFileSync(path.join(HERE, 'README-run.md'), `# THEMIS ripple fix: the measurement set\n\nRows: ${rows.length}. Roughness: median over windows of the median |second difference| of the RIC error (m, h = 300 s). Days: 3D RMS per lead day, median over windows [95 % bootstrap interval].\n\n| Object | Arm | Windows | Roughness (m) | Day 1 (m) | Day 3 (m) | Day 7 (m) |\n| --- | --- | --: | --: | --: | --: | --: |\n${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  process.exit(0);
}

const { config, root, iso, ms, XM } = await import(`${EXP}/lib/xp2.mjs`);
const { apForces, fitPcf } = await import(`${EXP}/lib/ap.mjs`);
const { openAxes } = await import(`${EXP}/lib/host.mjs`);
const { HX, TESS, windowKey } = await import(`${EXP}/lib/regimes.mjs`);
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
/** THEMIS-ROUGHNESS.md's statistic, verbatim from themis-roughness.mjs (which runs on import). */
function roughness(tMs, ric, cutoffMs) {
  const d2 = [];
  for (let i = 1; i + 1 < tMs.length; i += 1) {
    if (tMs[i] - tMs[i - 1] !== STEP_S * 1000 || tMs[i + 1] - tMs[i] !== STEP_S * 1000) continue;
    const v = [0, 1, 2].map((c) => ric[i + 1][c] - 2 * ric[i][c] + ric[i - 1][c]);
    d2.push({ i, day: Math.ceil((tMs[i] - cutoffMs) / DAY), v, n: Math.hypot(...v) });
  }
  const stat = (list) => ({ rough: median(list.map((x) => x.n)), roughR: median(list.map((x) => Math.abs(x.v[0]))), roughI: median(list.map((x) => Math.abs(x.v[1]))), roughC: median(list.map((x) => Math.abs(x.v[2]))), triples: list.length });
  const days = {};
  for (let k = 1; k <= 7; k += 1) {
    const at = tMs.map((t, i) => i).filter((i) => tMs[i] > cutoffMs + (k - 1) * DAY && tMs[i] <= cutoffMs + k * DAY);
    if (!at.length) continue;
    const axis = [0, 1, 2].map((c) => rms(at.map((i) => ric[i][c])));
    days[k] = { e: Math.hypot(...axis), r: axis[0], i: axis[1], c: axis[2], samples: at.length, ...stat(d2.filter((x) => x.day === k)) };
  }
  return { ...stat(d2), days, d2 };
}
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
const MOD = process.env.SDN_MODULES_ROOT;
const entry = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json')).resolve('space-data-module-sdk/testing/isomorphic');
const { createStandaloneHarness } = await import(pathToFileURL(entry).href);
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
// an arm: name=<wasm> (fit and flight), or name=<fit wasm>+<flight wasm>
const ARMS = args.arms.split(',').map((x) => {
  const [arm, spec] = x.split('='); const [file, flyFile = file] = spec.split('+');
  return { arm, file, flyFile, sha256: file === flyFile ? sha256(fs.readFileSync(file)) : `${sha256(fs.readFileSync(file)).slice(0, 32)}${sha256(fs.readFileSync(flyFile)).slice(0, 32)}` };
});
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
const TESS_FILES = fs.readdirSync(TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(TESS.dir, f));
// (b): THEMIS A, D, E (12), Chandra (7, 72 h arcs), TESS (7, 72 h arcs)
const OBJECTS = [
  ...HX.filter((x) => /^THEMIS/.test(x.name)).map((x) => ({ object: 'THEMIS', group: 'HX', x, files: [x.file], cutoffs: x.cutoffs })),
  ...HX.filter((x) => x.name === 'CHANDRA').map((x) => ({ object: 'CHANDRA', group: 'HX', x, files: [x.file], cutoffs: x.cutoffs })),
  { object: 'TESS', group: 'HE', x: { ...TESS, id: 'TESS (-95)' }, files: TESS_FILES, cutoffs: TESS.cutoffs },
].filter((o) => !args.only || o.object === args.only);

const harnesses = new Map();
async function open(a) {
  if (harnesses.has(a.arm)) return harnesses.get(a.arm);
  if (a.flyFile !== a.file) {
    const F = await open({ arm: `${a.arm}#fit`, file: a.file, flyFile: a.file }), P = await open({ arm: `${a.arm}#fly`, file: a.flyFile, flyFile: a.flyFile });
    const api = { fit: F.fit, fly: P.fly };
    harnesses.set(a.arm, api);
    return api;
  }
  const h = await createStandaloneHarness('browser', a.file, { surface: 'direct' });
  const call = async (methodId, inputs) => { const r = await h.invoke({ methodId, inputs }); if (r.statusCode !== 0) throw new Error(`${methodId}: ${r.errorCode}: ${String(r.errorMessage).slice(0, 200)}`); return r.outputs; };
  const port = (outs, id) => new Uint8Array(outs.find((o) => o.portId === id).payload);
  const api = {
    fit: async (oem, pcf) => port(await call('fit', [{ portId: 'ephemeris', typeRef: S.TYPE('OEM'), payload: oem }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: pcf }]), 'elements'),
    fly: async (set, epochs) => S.oemLines(port(await call('propagate', [{ portId: 'ocm', typeRef: S.TYPE('OCM'), payload: set }, { portId: 'configuration', typeRef: S.TYPE('PCF'), payload: S.flightPcfBytes(epochs) }]), 'ephemeris')),
  };
  harnesses.set(a.arm, api);
  return api;
}

const m = await openModules();
const axes = await openAxes();
fs.mkdirSync(STORE, { recursive: true });
const outFile = path.join(STORE, `rows-${SHARD}.jsonl`);
const done = new Set(rowsOf().map((r) => `${r.key}#${r.arm}#${r.sha256}`));
const pcf = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20, atmosphere: false }), fit: null });
for (const o of OBJECTS) {
  const keys = o.cutoffs.map((t) => windowKey(o.group, o.x.name, t)).filter(inShard);
  if (!keys.some((k) => ARMS.some((a) => !done.has(`${k}#${a.arm}#${a.sha256}`)))) continue;
  const s = await spkObjectSeries(MOD, { files: o.files, source: 'ap6-heo', id: o.x.id, name: o.x.name, norad: o.x.norad, fromUtc: o.x.from, toUtc: o.x.to, stride: 1 });
  const norm = s.lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  const lines = await axes.convert(norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % (STEP_S * 1000) === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() })), 'EME2000', 'GCRF');
  const times = lines.map((l) => ms(l.epoch));
  const between = (a, b) => lines.filter((_, i) => times[i] >= a && times[i] <= b);
  for (const D0 of o.cutoffs) {
    const key = windowKey(o.group, o.x.name, D0);
    if (!inShard(key)) continue;
    const after = between(D0 + 1, D0 + 7 * DAY), f0 = ms(after[0].epoch);
    const grid = after.filter((l) => (ms(l.epoch) - f0) % (STEP_S * 1000) === 0);
    const epochs = grid.map((l) => l.epoch), tMs = epochs.map(ms), truth = grid.map((l) => ({ r: l.r, v: l.v }));
    const raw = between(D0 - ARC_H * HOUR, D0);
    const thin = T.thinned(raw).chosen;
    const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.x.name, id: o.x.objectId, norad: o.x.norad }, lines: thin, useableStart: thin[0].epoch, useableStop: iso(D0) });
    for (const a of ARMS) {
      if (done.has(`${key}#${a.arm}#${a.sha256}`)) continue;
      const row = { key, object: o.object, name: o.x.name, cutoff: iso(D0), arm: a.arm, sha256: a.sha256, ok: false };
      const t0 = Date.now();
      try {
        const api = await open(a);
        const tf = Date.now();
        const set = await api.fit(oem, pcf);
        row.fitSeconds = (Date.now() - tf) / 1000;
        const me = S.readFitOcm(set).o.MEAN_ELEMENTS;
        row.elements = { n: me.MEAN_MOTION, e: me.ECCENTRICITY, i: me.INCLINATION };
        const tl = Date.now();
        const flown = await api.fly(set, epochs);
        row.flightSeconds = (Date.now() - tl) / 1000;
        if (args.save) {
          // the fitted set and the reference states on the flight grid, by hash, for the module's E2E
          const dir = path.join(STORE, 'sets'), id = crypto.createHash('sha256').update(`${key}#${a.arm}#${a.sha256}`).digest('hex').slice(0, 16);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `${id}.ocm`), set);
          fs.writeFileSync(path.join(dir, `${id}.truth.json`), JSON.stringify({ key, cutoff: iso(D0), epochs, r: truth.map((x) => x.r), v: truth.map((x) => x.v) }));
          row.saved = id;
        }
        if (flown.length !== epochs.length) throw new Error(`flight returned ${flown.length} of ${epochs.length} states`);
        const ric = (await m.rtn(await m.toAxes(flown, epochs, 'GCRF'), truth)).map((q) => q.map((x) => x * 1000));
        const st = roughness(tMs, ric, D0);
        const { d2, ...rest } = st;
        Object.assign(row, rest, { ok: true, states: epochs.length });
      } catch (error) { row.error = String(error?.message ?? error).slice(0, 200); }
      row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      console.error(`${key} ${a.arm}: ${row.ok ? `rough ${row.rough.toFixed(3)} m, day 1 ${row.days[1]?.e.toFixed(1)} day 3 ${row.days[3]?.e.toFixed(1)} day 7 ${row.days[7]?.e.toFixed(1)} m` : row.error} (${row.seconds.toFixed(1)} s)`);
    }
  }
}
await axes.close();
await m.close();
console.error(`shard ${SHARD}/${SHARDS}: done`);
process.exit(0);
