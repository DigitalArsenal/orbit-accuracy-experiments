import fs from 'node:fs';
import path from 'node:path';
import { config, registration, allowed, hash } from './guard.mjs';
import { disclosure } from './statistics.mjs';
import { coverage as detailedCoverage } from './coverage.mjs';
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
 const output=[...cells.values()].map(({values,...cell})=>({...cell,disclosure:disclosure(cell.group,cell.day),n:values.length,km:Object.fromEntries(['e','r','t','n'].map(f=>{const v=values.map(x=>x[f]).sort((a,b)=>a-b);return[f,{median:pct(v,.5),p95:pct(v,.95)}];}))})).sort((a,b)=>a.group.localeCompare(b.group)||a.arm.localeCompare(b.arm)||a.day-b.day);
 return {leads:config.leads,coverage,armDayCoverage:detailedCoverage(),reproduction,inputs,cells:output};
}
export function report(d){
 const complete=d.coverage.filter(c=>c.completed===c.expected&&c.expected>0);
 const optional=f=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null;
 const stats=optional('results/five-day-ca/statistics.json'),ca=optional('results/five-day-ca/ca-reach.json');
 const fmt=x=>x===null||x===undefined?'unmeasured':typeof x==='number'?Number(x.toPrecision(7)):Array.isArray(x)?x.map(fmt).join(' to '):x;
 const completed=(group,arm)=>complete.some(c=>c.group===group&&c.phase===(arm.startsWith('F')?'ffm':'cheap'));
 const day5=ca?.cells.filter(c=>c.day===5&&c.n>0&&completed(c.group,c.arm)&&c.arm.endsWith(c.group==='T'?'24':'72'))??[];
 const names=cells=>[...new Set(cells.map(c=>c.group))].sort().join(', ')||'none measured';
 const reachSummary=ca?[10,20,50,100].map(h=>`${h} m: `+['fit x fit','fit x GP','GP x GP'].map(pair=>`${pair} reaches 1e-4 in at least one window for ${names(day5.filter(c=>c.hbr===h&&c.pair===pair&&c.reach1e4>0))}`).join('; ')).join('. '):'CA reach is not yet measured.';
 const changes=ca?['AP','F'].map(a=>{const changed=day5.filter(c=>c.arm===a+'72'&&c.pair!=='GP x GP').filter(c=>{const xp=day5.find(x=>x.group===c.group&&x.arm==='XP72'&&x.pair===c.pair&&x.hbr===c.hbr);return xp&&c.reach1e4!==xp.reach1e4;});return `${a} changes the measured reachable fraction relative to XP in ${names(changed)}`;}).join('; '):'';
 const lines=['# Five-day forecast' ,'',`Forecast coverage: ${complete.length}/${d.coverage.length} group/phase cells complete. Old-lead reproduction: ${d.reproduction.compared} scalar comparisons, ${d.reproduction.different} differences, maximum ${d.reproduction.maxAbsKm} km. Incomplete runs do not support a group conclusion.`, '',
 `At five days (72 h fits; Part T 24 h), ${reachSummary}. ${changes}. Every finite nonsingular covariance has positive zero-miss Pc; these are threshold-reach results, not measured alert rates. The table gives each fraction at 1e-4 and 1e-5, including how arms differ. Missing mappings and unfinished runs are not evidence of zero reach. Synthetic scores remain unmeasured, so no operational five-day CA claim follows.`, '',
 'LS and DO day-4/day-5 rows are descriptive: read before the statements were registered. FIVE-DAY.md also discloses earlier partial rows in other groups. Subsequent registration does not turn those rows into prospective evidence. All paired results include these disclosed reads; they are descriptive pending separate provenance accounting. Only aggregates are redistributed.', '',
 '| Phase | Group | Completed / expected | Window errors |','|---|---|---:|---:|',...d.coverage.map(c=>`| ${c.phase} | ${c.group} | ${c.completed}/${c.expected} | ${c.windowErrors} |`),'',
 'Every expected arm/arc/day cell, including missing work and counted exclusion reasons, is in metrics.json armDayCoverage. A missing run is not a scientific exclusion. Summaries weight windows equally; R/T/N RMS is the square root of the mean squared window axis RMS. Intervals resample ISO weeks 10,000 times.',''];
 if(stats){lines.push('| Group | Arm | Day | n | Median km | p10–p90 km | Median 95% CI km | R/T/N RMS km | Disclosure |','|---|---|---:|---:|---:|---|---|---|---|');for(const c of stats.cells.filter(c=>completed(c.group,c.arm)))lines.push(`| ${c.group} | ${c.arm} | ${c.day} | ${c.n} | ${fmt(c.median)} | ${fmt([c.p10,c.p90])} | ${fmt(c.ci95)} | ${['r','t','n'].map(k=>fmt(c.rtnRms[k])).join('/')} | ${c.disclosure??''} |`);
 lines.push('','Paired AP5 rules, days 4 and 5. Log ratios use first arm / second arm; negative favors the first. Failures of the first arm count as +Infinity. Exclusion and unrun counts are in statistics.json.','','| Group | Arc h | Pair | Day | n | Median log ratio | 95% CI | p95 log ratio upper | Failed share | Rules 1/2/3 | Disclosure |','|---|---:|---|---:|---:|---:|---|---:|---:|---|---|');for(const c of stats.paired.filter(c=>completed(c.group,c.contrast.split('-')[0])&&completed(c.group,c.contrast.split('-')[1])))lines.push(`| ${c.group} | ${c.arc} | ${c.contrast} | ${c.day} | ${c.n} | ${fmt(c.medianLogRatio)} | ${fmt(c.ci95)} | ${fmt(c.p95CI95?.[1])} | ${fmt(c.failedShare)} | ${[c.rule1,c.rule2,c.rule3].map(fmt).join('/')} | ${c.disclosure??''} |`);}
 if(ca){lines.push('','Zero-miss reach: independent members, 90-degree crossing, full projected R/T covariance, Foster disk integral in the module. GP uses clipped covariance and calibrated axis scales only where labeled CALIBRATED. Alfano maximum at zero miss is reported separately. LS/DO altitude bands are classified per window by gp-error-model.','','| Group | Arm | Day | Pair | HBR m | n | Excluded | Median ceiling | Fraction >=1e-4 | Fraction >=1e-5 | Alfano maximum | GP label | Disclosure |','|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|');for(const c of ca.cells.filter(c=>completed(c.group,c.arm)))lines.push(`| ${c.group} | ${c.arm} | ${c.day} | ${c.pair} | ${c.hbr} | ${c.n} | ${c.excluded} | ${fmt(c.medianCeiling)} | ${fmt(c.reach1e4)} | ${fmt(c.reach1e5)} | ${fmt(c.alfanoMaximumAtZero)} | ${c.gpLabel??''} | ${c.disclosure??''} |`);}
 lines.push('','Synthetic encounters: unmeasured. Earlier forecast rows contain daily RMS only. New flights retain signed endpoint errors and FFM fit covariance in the archive, but the registered carried covariance and C3 history terms have not yet been produced. C2 and C3 constants alone cannot reconstruct those products. No RMS surrogate is substituted for XP, FFM, or AP carried covariance. No encounter count, missed-alert rate, false-alert rate, log score, Brier score, or paired score interval is claimed.','');
 return lines.join('\n');
}
if(process.argv[1]===new URL(import.meta.url).pathname){const d=aggregate();fs.writeFileSync('results/five-day-ca/metrics.json',JSON.stringify(d,null,2)+'\n');fs.writeFileSync('results/five-day-ca/README.md',report(d));console.log(JSON.stringify({coverage:d.coverage,reproduction:d.reproduction}));}
