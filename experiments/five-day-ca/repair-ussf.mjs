// Replay only mismatching U windows through the module, preserving original raw files.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {config,registration} from './guard.mjs';
import {readRows} from './statistics.mjs';
registration();
const jobs=[];
for(const label of ['regimes','truth2','truth']){
 const refs=new Map(readRows(`/opt/data/sdn-archive/operator-theory/ap/b040/ussf-${label}`).map(r=>[r.key,r]));
 const dir=`${config.store}/cheap/${label}`;
 for(const f of fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f))){
  const file=path.join(dir,f),rows=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  for(const r of rows){const old=refs.get(r.key);if(!old)continue;
   const differs=Object.entries(r.arms).some(([arm,a])=>arm.startsWith('U')&&[1,2,3,7].some(d=>['e','r','t','n'].some(k=>Number.isFinite(old.arms[arm]?.days?.[d]?.[k])&&a.days?.[d]?.[k]!==old.arms[arm].days[d][k])));
   if(differs)jobs.push({label,file,key:r.key,group:r.group,old});
  }
 }
}
const epoch=Date.now();let next=0;const repaired=new Map();
await Promise.all(Array.from({length:12},async()=>{
 while(next<jobs.length){const i=next++,j=jobs[i],out=`${config.store}/repair-ussf/${epoch}/${i}`;
  fs.mkdirSync(out,{recursive:true});const log=fs.openSync(`${out}/log`,'w');
  const extra=j.label==='regimes'?['--groups',j.group]:j.label==='truth2'?['--xm','--from','2026-01-01','--to','2026-05-31']:['--from','2025-04-01','--to','2025-12-21'];
  const p=spawn(process.execPath,[`experiments/five-day-ca/${j.label==='regimes'?'regimes':'truth'}.mjs`,'--arms','U','--key',j.key,'--out',out,...extra],{env:{...process.env,SDN_MODULES_ROOT:config.modulesRoot,...(j.label==='truth2'?{XP2F_CONTROL:'1'}:{})},stdio:['ignore',log,log]});fs.closeSync(log);
  const code=await new Promise(resolve=>p.on('exit',resolve));if(code!==0)throw Error(`repair ${i} exited ${code}`);
  const row=JSON.parse(fs.readFileSync(`${out}/rows-0.jsonl`,'utf8').trim());
  for(const [a,v]of Object.entries(row.arms))for(const d of [1,2,3,7])for(const k of ['e','r','t','n'])if(Number.isFinite(j.old.arms[a]?.days?.[d]?.[k])&&v.days?.[d]?.[k]!==j.old.arms[a].days[d][k])throw Error(`repair still differs: ${i}/${a}/${d}/${k}`);
  repaired.set(j.key,row.arms);console.log(JSON.stringify({repaired:i+1,total:jobs.length}));
 }
}));
for(const file of new Set(jobs.map(j=>j.file))){fs.copyFileSync(file,`${file}.before-ussf-${epoch}`);const rows=fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);for(const r of rows)if(repaired.has(r.key))Object.assign(r.arms,repaired.get(r.key));fs.writeFileSync(file,rows.map(JSON.stringify).join('\n')+'\n');}
console.log(JSON.stringify({repairedWindows:repaired.size}));
