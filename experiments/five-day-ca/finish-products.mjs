// Resume unfinished products in small, disjoint hash partitions with at most 12 workers.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {config,registration} from './guard.mjs';
import {readRows} from './statistics.mjs';
registration();
const partitions=60,children=new Set();let stopping=false;
const stop=()=>{stopping=true;for(const child of children)child.kill('SIGTERM');};process.on('SIGTERM',stop);
const pending=(phase,label)=>{const done=new Set(readRows(`${config.store}/${phase}/${label}`).map(r=>r.key));return new Set(readRows(`${config.store}/cheap/${label}`).filter(r=>!done.has(r.key)).map(r=>parseInt(crypto.createHash('sha256').update(r.key).digest('hex').slice(0,8),16)%partitions));};
async function stage(jobs){let next=0;const statuses=await Promise.allSettled(Array.from({length:12},async()=>{while(!stopping&&next<jobs.length){const job=jobs[next++],out=`${config.store}/${job.phase}/${job.label}`;fs.mkdirSync(out,{recursive:true});const fd=fs.openSync(`${out}/resume-${job.shard}-${Date.now()}.log`,'w');const child=spawn(process.execPath,['--max-old-space-size=3072',`experiments/five-day-ca/${job.script}`,...job.args,'--shard',`${job.shard}/${partitions}`],{env:{...process.env,SDN_MODULES_ROOT:config.modulesRoot},stdio:['ignore',fd,fd]});children.add(child);fs.closeSync(fd);fs.appendFileSync(`${config.store}/processes.jsonl`,JSON.stringify({pid:child.pid,phase:job.phase,label:job.label,shard:job.shard,partitions,started:new Date().toISOString()})+'\n');const [code]=await once(child,'exit');children.delete(child);console.log(JSON.stringify({phase:job.phase,label:job.label,shard:job.shard,code}));if(code!==0){stop();throw Error(`product job exited ${code}`);}}}));const failed=statuses.find(s=>s.status==='rejected');if(failed)throw failed.reason;if(stopping)throw Error('product pool stopped');}
try{
 await stage([...pending('products','truth')].sort((a,b)=>a-b).map(shard=>({phase:'products',label:'truth',shard,script:'truth.mjs',args:['--wasm','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm','--out',`${config.store}/products/truth`,'--arms','AP,XP,S','--from','2025-04-01','--to','2025-12-21','--products','true']})));
 for(const phase of ['covariance','gp-products']){const jobs=[];for(const label of ['truth2','truth'])for(const shard of pending(phase,label))jobs.push({phase,label,shard,script:phase==='covariance'?'covariance-products.mjs':'gp-products.mjs',args:['--label',label]});jobs.sort((a,b)=>a.shard-b.shard||a.label.localeCompare(b.label));await stage(jobs);}
}finally{process.off('SIGTERM',stop);}
