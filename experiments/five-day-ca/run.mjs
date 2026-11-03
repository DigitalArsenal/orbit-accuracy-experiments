import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { config, registration } from './guard.mjs';
registration();
const phase = process.argv[2] ?? 'cheap';
if (!['cheap','ffm'].includes(phase)) throw Error('phase must be cheap or ffm');
const arms = phase === 'cheap' ? 'AP,XP,S,U' : 'F';
const children = new Set();
let stopping = false;
process.on('SIGTERM',()=>{stopping=true;for(const child of children) child.kill('SIGTERM');});
const jobs = [
 ['regimes', 'regimes.mjs', ['--groups','LS,DO,GD,IG,GE,HE,HX']],
 ['truth2', 'truth.mjs', ['--xm','--from','2026-01-01','--to','2026-05-31']],
 ['truth', 'truth.mjs', ['--from','2025-04-01','--to','2025-12-21']],
];
await Promise.all(Array.from({length:12}, async (_,k)=>{
 for(const [label,script,extra] of jobs){
  if(stopping) break;
  const out = `${config.store}/${phase}/${label}`;
  fs.mkdirSync(out,{recursive:true});
  const log = fs.openSync(`${out}/worker-${k}.log`,'a');
  const child = spawn(process.execPath,['--max-old-space-size=3072',`experiments/five-day-ca/${script}`,'--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--out',out,'--arms',arms,'--shard',`${k}/12`,...extra],{env:{...process.env,SDN_MODULES_ROOT:config.modulesRoot,...(label==='truth2'?{XP2F_CONTROL:'1'}:{})},stdio:['ignore',log,log]});
  children.add(child);fs.closeSync(log);
  fs.appendFileSync(`${config.store}/processes.jsonl`,JSON.stringify({pid:child.pid,phase,label,shard:k,started:new Date().toISOString()})+'\n');
  const code = await new Promise(resolve=>child.on('exit',resolve));
  children.delete(child);
  console.log(JSON.stringify({label,shard:k,code}));
  if(code!==0) {process.exitCode=1;break;}
 }
}));
