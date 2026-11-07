import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { PIN } from '../operator-theory/lib/build.mjs';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
export const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url)));
export const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
/** The re-measure of 2026-11-04 (FIVE-DAY.md, "Amendment 2026-11-04: one $OCM"): AP, XP, S and U re-fitted and re-flown on the archived inputs at
 *  operator-theory's pinned build (lib/build.mjs PIN: sdn-ap 0.5.1 and sgp4-xp 0.2.1, git show with SHA-256), their rows and fitted $OCM under
 *  `store`; the old leads are checked against that build's AP5 and AP6 rows (`reference`). F, the GP products and the regime mapping are the
 *  registered store's (config.store), unchanged: none of them reads an element-set product. */
export const store = `${config.store}/b051`, build = PIN, reference = '/opt/data/sdn-archive/operator-theory/ap/b051';
/** Where a phase's rows live, by label: the re-measure's fits (AP, XP and S rows with their endpoints, fitted $OCM and signed errors), the
 *  Space Force XP's rows (ussf, U) and the carried-covariance products under `store`; the registered F rows and fit products and the GP
 *  products under config.store. */
export const FORECAST_PHASES = ['fits', 'ussf', 'ffm'];
export function dir(phase, label) {
  if (phase === 'fits' || phase === 'ussf' || phase === 'covariance') return `${store}/${phase}/${label}`;
  if (phase === 'ffm' || phase === 'gp-products') return `${config.store}/${phase}/${label}`;
  throw Error(`no phase ${phase}`);
}
/** The registered pins the re-measure's build replaces: AP 0.4.0's wasm and the Space Force XP 0.1.1 in the modules working tree. */
const REPLACED = ['/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm', `${config.modulesRoot}/propagator/sgp4-xp/dist/isomorphic/module.wasm`];
/** The modules checkout (SDN_MODULES_ROOT, else the registered one), holding the pinned build's commit. Resolved here, not through XM's
 *  common.mjs: importing that here would fix XM's store before lib/xp2.mjs sets XM_STORE for the runner it serves. */
export function modules() {
  const dir = path.resolve(process.env.SDN_MODULES_ROOT ?? config.modulesRoot);
  execFileSync('git', ['-C', dir, 'cat-file', '-e', `${PIN.modulesCommit}^{commit}`]);
  return dir;
}
export function registration() {
  if (!config.frozen) throw Error('registration is not frozen');
  const registered = (name, commit) => git('show', `${commit}:experiments/five-day-ca/${name}`), now = (name) => fs.readFileSync(path.join(root, 'experiments/five-day-ca', name), 'utf8').trim();
  if (registered('config.json', '28dd8bb') !== now('config.json')) throw Error('registration changed: config.json');
  if (!now('FIVE-DAY.md').startsWith(registered('FIVE-DAY.md', '989bcea50c8335cf68f2e87acb9ea870f19c93b6'))) throw Error('registration changed: FIVE-DAY.md (an amendment goes at its end)');
  for (const [file, pin] of Object.entries(config.pins)) if (!REPLACED.includes(file) && hash(fs.readFileSync(path.resolve(root,file))) !== pin) throw Error(`pin mismatch: ${file}`);
}
export function allowed(norad, name, cutoff) {
  return !config.excludedNorads.includes(norad) && !/starlink/i.test(name) && (!/Swarm|GRACE/i.test(name) || cutoff + 7*86400000 < Date.parse('2026-11-01'));
}
export function manifest(out, shard) {
  if (!path.resolve(out).startsWith(config.store + '/')) throw Error('output outside five-day store');
  const sources = {};
  for (const dir of ['experiments/five-day-ca','experiments/operator-theory/lib']) for (const name of fs.readdirSync(path.join(root,dir)).filter(x=>/\.(mjs|json|md)$/.test(x))) sources[`${dir}/${name}`]=hash(fs.readFileSync(path.join(root,dir,name)));
  const originalRead = fs.readFileSync;
  const seen = new Set();
  fs.readFileSync = function(file, ...args) {
    const name = String(file);
    if (/\/\.secrets(?:\/|$)|\/operator-capture|\/udl\//i.test(name)) throw Error('forbidden input path');
    const bytes = originalRead.call(fs,file,...args);
    if (name.startsWith('/opt/data/sdn-archive/') && !name.startsWith(config.store+'/') && !seen.has(name)) { seen.add(name); fs.appendFileSync(path.join(out,`inputs-${shard}.jsonl`),JSON.stringify({path:name,sha256:hash(bytes)})+'\n'); }
    return bytes;
  };
  fs.writeFileSync(path.join(out,`manifest-${shard}-${Date.now()}.json`),JSON.stringify({started:new Date().toISOString(),command:process.argv,commit:git('rev-parse','HEAD'),modulesCommit:execFileSync('git',['-C',modules(),'rev-parse','HEAD'],{encoding:'utf8'}).trim(),build,node:process.version,host:os.hostname(),load:os.loadavg(),pins:config.pins,sources},null,2)+'\n');
}

export function analysisProvenance() {
  const sources = {};
  const visit = dir => { for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) visit(rel);
    else if (/\.(mjs|json|md)$/.test(entry.name)) sources[rel] = hash(fs.readFileSync(path.join(root, rel)));
  }};
  visit('experiments/five-day-ca');
  return { command:process.argv, commit:git('rev-parse','HEAD'), node:process.version, host:os.hostname(), registrationCommit:'eb143664cad7ab97133184d4d0b217592f81b5a8', modulesCommit:execFileSync('git',['-C',modules(),'rev-parse','HEAD'],{encoding:'utf8'}).trim(), build, pins:config.pins, sources };
}
