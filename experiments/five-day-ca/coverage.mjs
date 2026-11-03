import fs from 'node:fs';
import {config} from './guard.mjs';
import {readRows,disclosure} from './statistics.mjs';
const arcs=r=>['LS','DO','P','S1','GN'].includes(r.group)?[24,72]:r.group==='T'?[24]:r.group==='HE'?[72,336]:r.group==='HX'&&/CHANDRA/i.test(r.name)?[72,168]:[72];
export function coverage(){
 const cells=new Map();
 for(const label of ['regimes','truth2','truth']){
  const refs=new Map();for(const dir of label==='regimes'?['regimes','ussf-regimes']:[label,`compare-${label}`,`ussf-${label}`])for(const r of readRows(`/opt/data/sdn-archive/operator-theory/ap/b040/${dir}`))refs.set(r.key,{...r,group:label==='truth'?'T':r.group});
  for(const phase of ['cheap','ffm']){
   const rows=new Map(readRows(`${config.store}/${phase}/${label}`).map(r=>[r.key,r]));
   for(const ref of refs.values())for(const arc of arcs(ref))for(const arm of phase==='cheap'?['AP','XP','S','U']:['F'])for(const day of config.leads){
    const key=[ref.group,arm,arc,day].join('|');if(!cells.has(key))cells.set(key,{group:ref.group,arm,arc,day,disclosure:disclosure(ref.group,day),expected:0,scored:0,excluded:0,missing:0,reasons:{}});
    const c=cells.get(key);c.expected++;const r=rows.get(ref.key),a=r?.arms?.[arm+arc];let reason;
    if(!r){c.missing++;continue;}
    if(r.error)reason=r.error;
    else if(!a){c.missing++;continue;}
    else if(!a.ok)reason=a.error??'arm failed';
    else if(!a.days?.[day])reason='lead grid below 90%';
    else if(!['e','r','t','n'].every(k=>Number.isFinite(a.days[day][k])))reason='nonfinite score';
    if(reason){c.excluded++;c.reasons[reason]=(c.reasons[reason]??0)+1;}else c.scored++;
   }
  }
 }
 return [...cells.values()];
}
