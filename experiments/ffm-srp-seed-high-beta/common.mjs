// SRP seed at high beta: configuration, the registered-plan guard, the pins, the integrity log and C3-small's chain on this experiment's own store. Records and statistics only.
// C3's libraries are imported read-only (coordinator's ruling, 2026-10-31): every one is SHA-256 pinned in build.json, and a change refuses every step here until the coordinator rules.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const build = JSON.parse(fs.readFileSync(path.join(dir, 'build.json')));
export const store = process.env.SRP_STORE ?? config.store;
export const results = path.join(root, 'results/ffm-srp-seed-high-beta');
export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const DAY = 86400e3, HOUR = 3600e3;
export const iso = (t) => new Date(Math.round(t)).toISOString();
export const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
export const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

/** The commit that holds the registration: HEAD on main; the wip commit while local main carries C3-small's unlanded commits (coordinator's ruling, 2026-10-31). */
export const registeredRef = process.env.SRP_REGISTERED_REF ?? 'HEAD';
const git = (...a) => execFileSync('git', a, { cwd: root, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
export const commitOf = () => git('rev-parse', registeredRef).toString().trim();
/** A step reads data only when these of this experiment's files equal their blobs at registeredRef. */
export function registered(names = ['PLAN.md', 'config.json', 'build.json']) {
  if (!config.registered) throw new Error('the plan is not registered');
  for (const name of names) {
    const rel = `experiments/ffm-srp-seed-high-beta/${name}`;
    let committed;
    try { committed = git('show', `${registeredRef}:${rel}`); } catch { throw new Error(`commit ${rel} at ${registeredRef} before data access`); }
    if (!committed.equals(fs.readFileSync(path.join(dir, name)))) throw new Error(`${rel} differs from ${registeredRef}: commit it before data access`);
  }
}

for (const [rel, want] of Object.entries(build.sha256)) if (sha256(fs.readFileSync(path.join(root, rel))) !== want) throw new Error(`${rel} is not the pinned file: it changed after registration. Stop and ask the coordinator; do not edit around it.`);

process.env.C3_STORE = store;
process.env.C3_RESULTS = path.join(store, 'c3-results-unused');
const C3 = path.join(root, 'experiments/ffm-covariance-adaptive');
const C3lib = (name) => import(path.join(C3, 'lib', name));
export const c3 = { common: await import(path.join(C3, 'common.mjs')), chain: await C3lib('chain.mjs'), open: await C3lib('open.mjs'), gfz: await C3lib('gfz.mjs'), notices: await C3lib('notices.mjs'), terms: await C3lib('terms.mjs') };
if (c3.common.store !== store) throw new Error('C3_STORE did not take: C3\'s libraries would write to C3\'s store');
if (c3.common.build.pin.commit !== build.pin.commit) throw new Error(`C3's pin ${c3.common.build.pin.commit} is not the registered ${build.pin.commit}`);
for (const rel of ['analysis/estimation', 'propagator/ffm', 'analysis/gp-error-model']) if (c3.common.build.pin.modules[rel].wasmSha256 !== build.pin.modules[rel].wasmSha256) throw new Error(`C3's ${rel} is not the registered one`);

// What this experiment must never open, on top of C3's list: C3's store except its notices, C3's and C2's results, C2's rows.
const NEVER = [/\/sdn-archive\/ffm-covariance-adaptive\/(?!notices\/)/, /\/results\/ffm-covariance-adaptive\//, /\/results\/ffm-covariance-calibration\//, /\/sdn-archive\/ffm-covariance-calibration\/rows/];
/** The integrity log: every path a step opens, refused when forbidden. */
export class Opened extends c3.common.Opened {
  add(file, label = '') {
    const abs = path.resolve(file);
    if (NEVER.some((re) => re.test(abs))) throw new Error(`refusing to open ${abs}`);
    return super.add(file, label);
  }
}

function writeOnce(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const t = `${file}.${process.pid}.part`;
  fs.writeFileSync(t, bytes);
  fs.renameSync(t, file);
}
/** The Sun's GCRF direction source: propagator/solar-system-bodies at the pin (git show, SHA-256 checked) with DE440s. sunAt(ms UTC) -> position, m, geocentric. */
export async function openSun(opened) {
  const { loadModule } = await import(path.join(root, 'harness/modules.mjs'));
  const { MODULES } = await import(path.join(C3, 'lib/modules.mjs'));
  const rel = config.sun.module, m = build.pin.modules[rel], out = path.join(store, 'build', 'sun');
  for (const [file, want] of [['dist/isomorphic/module.wasm', m.wasmSha256], ['plugin-manifest.json', m.manifestSha256]]) {
    const f = path.join(out, rel, file);
    if (fs.existsSync(f) && sha256(fs.readFileSync(f)) === want) continue;
    const b = execFileSync('git', ['-C', MODULES, 'show', `${build.pin.commit}:${rel}/${file}`], { maxBuffer: 1 << 28 });
    if (sha256(b) !== want) throw new Error(`${rel}/${file} at the pin is not build.json's`);
    writeOnce(f, b);
  }
  const ssb = await loadModule(out, rel);
  const kernel = opened.read(config.sun.kernel, 'DE440s');
  if (sha256(kernel) !== config.sun.kernelSha256) throw new Error(`${config.sun.kernel} is not the registered kernel`);
  return async (ms) => {
    const jd = ms / DAY + 2440587.5 + config.sun.taiMinusUtcSeconds / 86400, day = Math.floor(jd);
    const r = await ssb.invokeJson('evaluate', [{ portId: 'kernel', payload: kernel }, { portId: 'request', payload: Buffer.from(JSON.stringify({ operation: 'states', params: { jdTai: [day, (jd - day) * 86400], ids: [10], center: 399 } })) }], 'response');
    if (r.rows?.[0]?.status !== 'ok') throw new Error(`the Sun's state at ${iso(ms)}: ${JSON.stringify(r).slice(0, 200)}`);
    return r.rows[0].position_m;
  };
}
