import fs from 'node:fs';
import path from 'node:path';
import { config, registration, allowed, hash } from './guard.mjs';
import { pct } from '../operator-theory/lib/compare.mjs';
registration();
const base='/opt/data/sdn-archive/operator-theory/ap/b040';
const read = dir => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f)).sort().flatMap(f=>fs.readFileSync(path.join(dir,f),'utf8').split('\n').filter(Boolean).map(JSON.parse)).filter(r=>allowed(r.norad,r.name,Date.parse(r.cutoff))) : [];
export function aggregate(){
 const cells=new Map(), coverage=[], reproduction={compared:0,different:0,maxAbsKm:0,byArm:{},missingReference:0};
 const inputs={};
 for(const phase of ['cheap','ffm']) for(const label of ['regimes','truth2','truth']){
  const dir=`${config.store}/${phase}/${label}`;
  const rows=read(dir);
  if(fs.existsSync(dir))for(const f of fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f)))inputs[`${dir}/${f}`]=hash(fs.readFileSync(`${dir}/${f}`));
  const old=new Map();
  for(const name of label==='regimes'?['regimes','ussf-regimes']:[label,`compare-${label}`,`ussf-${label}`])for(const r of read(`${base}/${name}`)){
   if(!old.has(r.key))old.set(r.key,{...r,arms:{}});
   Object.assign(old.get(r.key).arms,r.arms);
  }
  const counts=new Map();
  const groupOf=r=>label==='truth'?'T':r.group;
  for(const r of old.values()){const g=groupOf(r);if(!counts.has(g))counts.set(g,{phase,source:label,group:g,expected:0,completed:0,windowErrors:0});counts.get(g).expected++;}
  for(const r of rows){
   const group=groupOf(r),c=counts.get(group);if(c){c.completed++;if(r.error)c.windowErrors++;}
   for(const [arm,a] of Object.entries(r.arms)){
    for(const day of config.leads){
     const key=`${group}|${arm}|${day}`;
     if(!cells.has(key))cells.set(key,{group,arm,day,attempted:0,failed:0,coverageExcluded:0,binExcluded:0,values:[]});
     const cell=cells.get(key);cell.attempted++;
     if(a.error==='coverage'){cell.coverageExcluded++;continue;}
     if(!a.ok){cell.failed++;continue;}
     const v=a.days?.[day];if(!v){cell.binExcluded++;continue;}
     if(!Object.values(v).every(Number.isFinite)){cell.failed++;continue;}
     cell.values.push(v);
     if([1,2,3,7].includes(day))for(const field of ['e','r','t','n']){
      const before=old.get(r.key)?.arms?.[arm]?.days?.[day]?.[field];
      if(!Number.isFinite(before)){reproduction.missingReference++;continue;}
      const d=Math.abs(before-v[field]);reproduction.compared++;reproduction.different+=d!==0;reproduction.maxAbsKm=Math.max(reproduction.maxAbsKm,d);
      const code=arm.replace(/\d+/g,'');const s=reproduction.byArm[code]??={compared:0,different:0,maxAbsKm:0};s.compared++;s.different+=d!==0;s.maxAbsKm=Math.max(s.maxAbsKm,d);
     }
    }
   }
  }
  coverage.push(...counts.values());
 }
 const output=[...cells.values()].map(({values,...cell})=>({...cell,n:values.length,km:Object.fromEntries(['e','r','t','n'].map(f=>{const v=values.map(x=>x[f]).sort((a,b)=>a-b);return[f,{median:pct(v,.5),p95:pct(v,.95)}];}))})).sort((a,b)=>a.group.localeCompare(b.group)||a.arm.localeCompare(b.arm)||a.day-b.day);
 return {leads:config.leads,coverage,reproduction,inputs,cells:output};
}
export function report(d){
 const complete=d.coverage.filter(c=>c.completed===c.expected&&c.expected>0);
 return `# Five-day forecast\n\nThe forecast comparison is incomplete: ${complete.length} of ${d.coverage.length} group/phase cells have every expected window. There are ${d.reproduction.compared} comparable old-lead scalar values; ${d.reproduction.different} differ, with maximum absolute difference ${d.reproduction.maxAbsKm} km. Day-4/day-5 accuracy is descriptive. The required new statements were omitted from stage-1 registration before scoring, so the prospective-test requirement failed (see experiments/five-day-ca/REGISTRATION-FAILURE.md). CA reach, synthetic alerts and proper scores have not been measured, so these results cannot establish a five-day CA capability. Frozen covariance failures remain unresolved; no covariance was refitted.\n\nOnly aggregates are published. Rows and input hashes remain in the archive. Incomplete cells are progress counts, not completed-group estimates.\n\n| Phase | Group | Completed / expected | Window errors |\n|---|---|---:|---:|\n`+d.coverage.map(c=>`| ${c.phase} | ${c.group} | ${c.completed} / ${c.expected} | ${c.windowErrors} |`).join('\n')+'\n\n| Group | Arm | Day | n | Median km | p95 km |\n|---|---|---:|---:|---:|---:|\n'+d.cells.filter(c=>complete.some(g=>g.group===c.group&&g.phase===(c.arm.startsWith('F')?'ffm':'cheap'))).map(c=>`| ${c.group} | ${c.arm} | ${c.day} | ${c.n} | ${c.km.e.median} | ${c.km.e.p95} |`).join('\n')+'\n';
}
if(process.argv[1]===new URL(import.meta.url).pathname){const d=aggregate();fs.writeFileSync('results/five-day-ca/metrics.json',JSON.stringify(d,null,2)+'\n');fs.writeFileSync('results/five-day-ca/README.md',report(d));console.log(JSON.stringify({coverage:d.coverage,reproduction:d.reproduction}));}
