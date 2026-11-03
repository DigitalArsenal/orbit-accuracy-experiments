import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
export const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url)));
export const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
export function registration() {
  if (!config.frozen) throw Error('registration is not frozen');
  for (const name of ['config.json','FIVE-DAY.md']) {
    const rel = `experiments/five-day-ca/${name}`;
    if (git('show', `${name === 'FIVE-DAY.md' ? 'eb143664cad7ab97133184d4d0b217592f81b5a8' : '28dd8bb'}:${rel}`) !== fs.readFileSync(path.join(root, rel),'utf8').trim()) throw Error(`registration changed: ${name}`);
  }
  for (const [file, pin] of Object.entries(config.pins)) if (hash(fs.readFileSync(path.resolve(root,file))) !== pin) throw Error(`pin mismatch: ${file}`);
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
  fs.writeFileSync(path.join(out,`manifest-${shard}-${Date.now()}.json`),JSON.stringify({started:new Date().toISOString(),command:process.argv,commit:git('rev-parse','HEAD'),modulesCommit:execFileSync('git',['-C',config.modulesRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),node:process.version,host:os.hostname(),load:os.loadavg(),pins:config.pins,sources},null,2)+'\n');
}

export function analysisProvenance() {
  const sources = {};
  const visit = dir => { for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes:true})) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) visit(rel);
    else if (/\.(mjs|json|md)$/.test(entry.name)) sources[rel] = hash(fs.readFileSync(path.join(root, rel)));
  }};
  visit('experiments/five-day-ca');
  return { command:process.argv, commit:git('rev-parse','HEAD'), node:process.version, host:os.hostname(), registrationCommit:'eb143664cad7ab97133184d4d0b217592f81b5a8', modulesCommit:execFileSync('git',['-C',config.modulesRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(), pins:config.pins, sources };
}
