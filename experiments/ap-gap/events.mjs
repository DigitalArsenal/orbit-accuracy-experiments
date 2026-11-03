import {writeAudit} from './audit.mjs';
import fs from 'node:fs';
import {STATIC,windowKey} from '../operator-theory/lib/regimes.mjs';
import {readReference} from '../sdn-gp-starlink-ffm-match/lib/sources.mjs';
import {ms} from '../xp-atmosphere-merit/common.mjs';
import {openModules} from '../xp-atmosphere-merit/lib/modules.mjs';
const out='/opt/data/sdn-archive/operator-theory/ap-gap/events';fs.mkdirSync(out,{recursive:true});
const m=await openModules(), rows=[], day=86400000;
for(const o of STATIC.filter(o=>o.group==='DO')) {
 const byEpoch=new Map(), diffs=[];let norad;
 for(const file of o.files()) {
  const ref=readReference(file);norad=ref.norad;const a=[],b=[],epochs=[];
  for(const l of ref.lines) {
   const t=ms(l.epoch);const previous=byEpoch.get(t)||[];
   for(const p of previous)if(p.file!==file){a.push(l);b.push(p.line);epochs.push(t);}
   previous.push({file,line:l});byEpoch.set(t,previous);
  }
  if(a.length) {const e=await m.rtn(a,b);e.forEach((v,i)=>diffs.push({t:epochs[i],meters:Math.hypot(...v)*1000}));}
 }
 for(const t of o.cutoffs) {
  const d=diffs.filter(x=>x.t>=t-3*day&&x.t<=t+7*day);
  rows.push({norad,key:windowKey('DO',o.name,t),name:o.name,cutoff:new Date(t).toISOString(),overlapPairs:d.length,maxM:d.length?Math.max(...d.map(x=>x.meters)):null,label:d.some(x=>x.meters>1000)?'event':d.length?'quiet':'unknown'});
 }
}
fs.writeFileSync(`${out}/labels.json`,JSON.stringify(rows,null,2)+'\n');writeAudit(out,0);console.log(JSON.stringify({windows:rows.length,counts:Object.fromEntries(['event','quiet','unknown'].map(l=>[l,rows.filter(r=>r.label===l).length]))}));process.exit(0);
