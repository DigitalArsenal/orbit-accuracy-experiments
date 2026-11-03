import fs from 'node:fs';
import path from 'node:path';
import {config,registration,allowed,hash} from './guard.mjs';
import {describe,contrast} from './lib/statistics.mjs';
registration();
export function readRows(dir){return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f)).sort().flatMap(f=>fs.readFileSync(path.join(dir,f),'utf8').split('\n').filter(Boolean).map(JSON.parse)).filter(r=>allowed(r.norad,r.name,Date.parse(r.cutoff))):[];}
export function mergedRows(){const rows=new Map();for(const phase of ['cheap','ffm'])for(const label of ['regimes','truth2','truth'])for(const r of readRows(`${config.store}/${phase}/${label}`)){const key=label+'|'+r.key;if(!rows.has(key))rows.set(key,{...r,group:label==='truth'?'T':r.group,arms:{}});Object.assign(rows.get(key).arms,r.arms);}return [...rows.values()];}
export function disclosure(group,day){return [4,5].includes(day)&&['LS','DO'].includes(group)?'read before the statements were registered':null;}
export function statistics(){
 const rows=mergedRows(),cells=[],paired=[];
 for(const [group,rs] of Map.groupBy(rows,r=>r.group)){
  const arms=[...new Set(rs.flatMap(r=>Object.keys(r.arms)))].sort();
  for(const arm of arms)for(const day of config.leads){
   const values=rs.filter(r=>Number.isFinite(r.arms[arm]?.days?.[day]?.e)).map(r=>({...r.arms[arm].days[day],cutoff:r.cutoff}));
   cells.push({group,arm,day,disclosure:disclosure(group,day),...describe(values,`${group}|${arm}|${day}`)});
  }
  for(const arc of new Set(arms.map(a=>a.match(/\d+/)[0])))for(const [a,b] of [['AP','XP'],['F','XP'],['XP','S']])for(const day of [4,5]){
   const A=a+arc,B=b+arc,pairs=[];let secondFailed=0,sparse=0,unrun=0;
   for(const r of rs){const x=r.arms[A],y=r.arms[B];if(!x||!y){unrun++;continue;}if(r.error||x.error==='coverage'||y.error==='coverage'||(x.ok&&!x.days?.[day])||(y.ok&&!y.days?.[day])){sparse++;continue;}if(!Number.isFinite(y.days?.[day]?.e)){secondFailed++;continue;}pairs.push({cutoff:r.cutoff,x:Number.isFinite(x.days?.[day]?.e)?x.days[day].e:null,y:y.days[day].e});}
   paired.push({group,arc:+arc,contrast:`${a}-${b}`,day,disclosure:disclosure(group,day),secondFailed,sparse,unrun,...contrast(pairs,`${group}|${A}-${B}|${day}`)});
  }
 }
 return {units:'km',bootstrap:{draws:10000,cluster:'ISO week',seed:20261103,interval:[.025,.975]},cells,paired};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const result=statistics();fs.writeFileSync('results/five-day-ca/statistics.json',JSON.stringify(result,(_,v)=>v===Infinity?'Infinity':v===-Infinity?'-Infinity':v,2)+'\n');console.log(JSON.stringify({cells:result.cells.length,paired:result.paired.length}));}
