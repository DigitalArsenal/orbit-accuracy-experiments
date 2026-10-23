import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { sha256 } from '../../harness/modules.mjs';
export { sha256, sleep };
export const dir = path.dirname(new URL(import.meta.url).pathname);
export const root = path.resolve(dir, '../..');
export const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json')));
export const store = process.env.V2_STORE ?? config.store;
export const H = 3600000;
export const iso = ms => new Date(ms).toISOString();
export const read = file => JSON.parse(fs.readFileSync(file));
export function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${process.pid}.tmp`; fs.writeFileSync(temp, JSON.stringify(value, null, 2)+'\n'); fs.renameSync(temp,file); }
export function append(file, value) { fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,JSON.stringify(value)+'\n'); }
export function lines(file) { return fs.existsSync(file) ? fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []; }
export function frozen() {
  if (!config.frozen) throw new Error('prospective data locked');
  for (const name of ['PLAN.md','config.json']) {
    const relative = `experiments/v2-operator-seeded-prediction/${name}`;
    const committed = execFileSync('git',['show',`HEAD:${relative}`],{cwd:root});
    if (!committed.equals(fs.readFileSync(path.join(dir,name)))) throw new Error('commit the frozen registration before data access');
  }
}
export function freeGiB() { const s=fs.statfsSync(store);return s.bavail*s.bsize/2**30; }
export async function quiet(log = console.log) {
  while (os.loadavg()[0] >= config.compute.maxLoad1m || freeGiB() < config.compute.minimumFreeGiB) {
    if(fs.existsSync(path.join(store,'collector.stop'))) throw new Error('stop requested');
    log(`paused: load=${os.loadavg()[0].toFixed(2)} freeGiB=${freeGiB().toFixed(1)}`);await sleep(30000);
  }
}
export const moduleRoot = () => process.env.SDN_MODULES_ROOT ?? path.resolve(root,'../space-data-network-modules--experiments-v2-operator-seeded-prediction-20261023');
export function sourceHashes() {
  const names=fs.readdirSync(dir).filter(n=>/\.(mjs|json|md)$/.test(n));
  return Object.fromEntries(names.sort().map(n=>[n,sha256(fs.readFileSync(path.join(dir,n)))]));
}
