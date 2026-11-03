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
 const stats=optional('results/five-day-ca/statistics.json'),ca=optional('results/five-day-ca/ca-reach.json'),enc=optional('results/five-day-ca/encounters.json');
 for(const [name,value]of [['statistics',stats],['CA reach',ca]])if(value&&(value.snapshotStable!==true||JSON.stringify(value.inputs)!==JSON.stringify(d.inputs)))throw Error(`regenerate ${name} on the frozen forecast snapshot before reporting`);
 const verification=optional('results/five-day-ca/e2e.json');
 const fmt=x=>x===null||x===undefined?'unmeasured':typeof x==='number'?Number(x.toPrecision(7)):Array.isArray(x)?x.map(fmt).join(' to '):x;
 const completed=(group,arm)=>complete.some(c=>c.group===group&&c.phase===(arm.startsWith('F')?'ffm':'cheap'));
 const day5=ca?.cells.filter(c=>c.day===5&&c.n>0&&completed(c.group,c.arm))??[];
 const armCode=c=>c.arm.replace(/\d+/g,'');
 const list=groups=>groups.length?groups.join(', '):'no group';
 const groupsWhere=(h,pair,arm,test)=>[...new Set(day5.filter(c=>c.hbr===h&&c.pair===pair&&armCode(c)===arm&&test(c)).map(c=>c.group))].sort();
 const majority=c=>c.reach1e4>=.5,minority=c=>c.reach1e4>0&&c.reach1e4<.5,without=(a,b)=>a.filter(x=>!b.includes(x));
 const armEffect=(h,pair,base)=>{const parts=['AP','F','S','U'].map(a=>{const reached=groupsWhere(h,pair,a,majority);return [a,without(reached,base),without(base,reached)];}).filter(([,adds,drops])=>adds.length||drops.length).map(([a,adds,drops])=>`${a}${adds.length?` adds ${adds.join(', ')}`:''}${adds.length&&drops.length?' and':''}${drops.length?` drops ${drops.join(', ')}`:''}`);return parts.length?parts.join('; '):'no arm changes this';};
 const ceilingSpan=(h,pair)=>{const cells=day5.filter(c=>c.hbr===h&&c.pair===pair&&armCode(c)==='XP'&&Number.isFinite(c.medianCeiling)).sort((a,b)=>a.medianCeiling-b.medianCeiling);if(!cells.length)return '';const at=cell=>`${cell.medianCeiling.toExponential(1)} (${cell.group})`;return `; median ceilings span ${at(cells[0])} to ${at(cells.at(-1))}`;};
 const reachClause=(h,pair)=>{const base=groupsWhere(h,pair,'XP',majority),partial=without(groupsWhere(h,pair,'XP',minority),base);return `${pair}${pair==='GP x GP'?',':', with XP,'} 1e-4 is reached in most windows for ${list(base)} and in some but under half for ${list(partial)}${pair==='GP x GP'?` (a GP covariance on both objects, the same for every arm${ceilingSpan(h,pair)})`:`; relative to XP, ${armEffect(h,pair,base)}`}`;};
 const gpNever=[...new Set(day5.map(c=>c.group))].filter(g=>!day5.some(c=>c.group===g&&c.pair!=='fit x fit'&&majority(c))).sort();
 const gpNote=gpNever.length?` With a GP covariance (fit x GP or GP x GP), ${gpNever.length<3?gpNever.join(' and '):gpNever.slice(0,-1).join(', ')+' and '+gpNever.at(-1)} never reach 1e-4 in most windows, for any arm or any hard-body radius up to 100 m.`:'';
 const reachSummary=ca?[10,20,50,100].map(h=>`At ${h} m: ${['fit x fit','fit x GP','GP x GP'].map(pair=>reachClause(h,pair)).join('. ')}`).join('. '):'CA reach is not yet measured.';
 const lines=['# Five-day forecast' ,'',`Five-day answer. A pair class can show a Pc at day 5 when its zero-miss ceiling reaches 1e-4 in at least half of a group's windows, for at least one registered fit arc (GP age bin [5,7] d); the 1e-5 fractions, every arc and every arm are in the CA-reach table.${gpNote} ${reachSummary}. Every finite nonsingular covariance has positive zero-miss Pc, so these are threshold-reach results, not alert rates. A fit's sigma here is its own window's realized R/T error, not a forecast covariance. Unfinished runs are not evidence of zero reach. The synthetic encounter rates below describe an artificial population and cannot establish operational five-day CA rates.`, '',
 `Forecast coverage: ${complete.length}/${d.coverage.length} group/phase cells complete. Old-lead reproduction: ${d.reproduction.compared} scalar comparisons, ${d.reproduction.different} differences, maximum ${d.reproduction.maxAbsKm} km. Incomplete runs do not support a group conclusion.`, '',
 'Arms: AP is the operator-theory propagator, XP is the whiteroom XP fit, U is Space Force XP, S is the SGP4 fit, F is FFM, and GP is a public SGP4 set; the hours of the fit arc follow the arm name. Groups: P and T are strong-drag low orbit (Swarm and GRACE-FO; T is the 944 windows of 2025 in AP.md), S1 is Sentinel-1A and 1C, GN is GPS, Galileo and GLONASS in medium Earth orbit, LS laser spheres, DO altimetry satellites, GD laser geodetic satellites above 5,000 km, IG inclined geosynchronous, GE geostationary, HE TESS, HX THEMIS and Chandra. AP fits and forecast states use 0.4.0; only its synthetic covariance process-noise table uses shipped 0.4.1, labeled UNVERIFIED. Frozen builds and hashes are in experiments/five-day-ca/config.json, builds.json and covariance-config.json.', '',
 'LS and DO day-4/day-5 rows are descriptive: read before the statements were registered. FIVE-DAY.md also discloses earlier partial rows in other groups. Subsequent registration does not turn those rows into prospective evidence. All paired results include these disclosed reads; they are descriptive pending separate provenance accounting. Only aggregates are redistributed.', '',
 '| Phase | Group | Completed / expected | Completed share | Missing arm-days | Window errors |','|---|---|---:|---:|---:|---:|',...d.coverage.map(c=>`| ${c.phase} | ${c.group} | ${c.completed}/${c.expected} | ${fmt(c.completed/c.expected)} | ${d.armDayCoverage.filter(x=>x.group===c.group&&(x.arm==='F'?'ffm':'cheap')===c.phase).reduce((n,x)=>n+x.missing,0)} | ${c.windowErrors} |`),'',
 'Every expected arm/arc/day cell, including missing work and counted exclusion reasons, is in metrics.json armDayCoverage. A missing run is not a scientific exclusion. Summaries weight windows equally; R/T/N RMS is the square root of the mean squared window axis RMS. Intervals resample ISO weeks 10,000 times.',''];
 if(verification)lines.push(`Six-day replay: ${verification.replayedScalars} scalars, ${verification.replayDifferences} differences, maximum ${fmt(verification.replayMaxAbsKm*1000)} m, ${verification.replayRejected??'unmeasured'} rejected. U accepts at most 1 m per scalar because of the library's query-order dependence (experiments/propagator-ca-frontier/PLAN.md, Amendment A1); AP, XP, S and F require exact equality.`, '');
 if(verification)lines.push(`E2E ${verification.verdict}: ${verification.statisticalCells} forecast-statistics cells, ${verification.pairedCells} AP5 paired cells, ${verification.reachCells} CA-reach cells, ${verification.syntheticCells} synthetic rate cells and ${verification.syntheticPairedCells} paired proper-score cells; ${verification.missingArmDays} missing forecast arm-days. ${verification.failures.length?'Incomplete: '+verification.failures.join('; ')+'.':'All acceptance checks passed.'}`,'');
 const installed=optional('results/five-day-ca/ussf-install.json');if(installed)lines.push(`Staged U replay: ${installed.cells.reduce((n,c)=>n+c.installedWindows,0)} windows, ${installed.cells.reduce((n,c)=>n+c.differences,0)} differing scalars, maximum ${fmt(1000*Math.max(...installed.cells.map(c=>c.maxAbsKm)))} m against the 1 m allowance; ${installed.cells.reduce((n,c)=>n+c.oldLeadDifferences,0)} old-lead differences. Installation provenance is in ussf-install.json.`,'');
 if(stats){lines.push('| Group | Arm | Day | n | Median km | p10–p90 km | Median 95% CI km | R/T/N RMS km | Disclosure |','|---|---|---:|---:|---:|---|---|---|---|');for(const c of stats.cells)lines.push(`| ${c.group} | ${c.arm} | ${c.day} | ${c.n} | ${fmt(c.median)} | ${fmt([c.p10,c.p90])} | ${fmt(c.ci95)} | ${['r','t','n'].map(k=>fmt(c.rtnRms[k])).join('/')} | ${c.disclosure??''} |`);
 lines.push('','Paired AP5 rules, days 4 and 5. Log ratios use first arm / second arm; negative favors the first. Failures of the first arm count as +Infinity. Exclusion and unrun counts are in statistics.json.','','| Group | Arc h | Pair | Day | n | Median log ratio | 95% CI | p95 log ratio upper | Failed share | Rules 1/2/3 | Disclosure |','|---|---:|---|---:|---:|---:|---|---:|---:|---|---|');for(const c of stats.paired)lines.push(`| ${c.group} | ${c.arc} | ${c.contrast} | ${c.day} | ${c.n} | ${fmt(c.medianLogRatio)} | ${fmt(c.ci95)} | ${fmt(c.p95CI95?.[1])} | ${fmt(c.failedShare)} | ${[c.rule1,c.rule2,c.rule3].map(fmt).join('/')} | ${c.disclosure??''} |`);}
 if(ca){lines.push('','Zero-miss reach: independent members, 90-degree crossing, full projected R/T covariance, Foster disk integral in the module. GP uses clipped covariance and calibrated axis scales only where labeled CALIBRATED. Age bins follow the module: [lo,hi), with day 7 included in the last bin; day 5 uses [5,7]. Calibration labels describe the August 2026 model validation, not validation of transfer to these windows. Alfano maximum at zero miss is reported separately. LS/DO/GD and drag-LEO altitude bands are classified per window by gp-error-model.','','| Group | Arm | Day | Pair | HBR m | n | Excluded | Median ceiling | Fraction >=1e-4 | Fraction >=1e-5 | Alfano maximum | GP label | Disclosure |','|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|');for(const c of ca.cells)lines.push(`| ${c.group} | ${c.arm} | ${c.day} | ${c.pair} | ${c.hbr} | ${c.n} | ${c.excluded} | ${fmt(c.medianCeiling)} | ${fmt(c.reach1e4)} | ${fmt(c.reach1e5)} | ${fmt(c.alfanoMaximumAtZero)} | ${c.gpLabel??''} | ${c.disclosure??''} |`);}
 if(enc){lines.push('',`Synthetic fit x fit and fit x GP pairs (GP primary is the repeated GP x GP reference): AP 0.4.1 shipped table UNVERIFIED, XP C2 fairness, FFM C3-small R2/R3 and C2 elsewhere, S RMS STAND-IN, GP age-bin error model. Frozen class constants are transferred to these groups and seven-day leads as documented in COVARIANCE.md. All errors and completed covariances are in common truth RTN axes, rotated by gp-error-model after C2/C3 scaling. Same primary, secondary, angle and miss draws across arms. True miss is log-uniform 10 m–5 km, HBR 20 m, alert at Pc >=1e-4. Missing products and numerical failures are counted, never assigned zero Pc. GP covariance uses actual age since the selected set epoch; ages beyond seven days are outside the frozen model and are excluded. Product coverage: ${enc.covarianceProducts??0}/${enc.expectedProducts??0} fitted windows and ${enc.gpProducts??0}/${enc.expectedProducts??0} GP windows. Complete: ${enc.complete}.`,'','| Group | Arc h | Pair class | Arm | Day | Draws | No primary / secondary | Pc failures | n | Hits | Missed per encounter | Missed given hit | False per encounter | False given non-hit | Brier loss | Log loss | Disclosure |','|---|---:|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');for(const c of enc.cells)lines.push(`| ${c.group} | ${c.arc} | ${c.pair} | ${c.arm} | ${c.day} | ${c.draws} | ${c.noPrimary}/${c.noSecondary} | ${c.pcFailed} | ${c.n} | ${c.hits} | ${fmt(c.missedPerEncounter)} | ${fmt(c.missedGivenHit)} | ${fmt(c.falsePerEncounter)} | ${fmt(c.falseGivenNonHit)} | ${fmt(c.brier)} | ${fmt(c.log)} | ${c.disclosure??''} |`);
 lines.push('','Paired proper-score differences (first minus second; negative favors first). Intervals use 10,000 primary-object cluster draws and do not model additional secondary-object dependence. Infinite log loss is retained; Infinity minus Infinity is undefined and counted. JSON includes all-encounter alert rates, covariance labels, exclusion reasons, and finite/infinite paired-score counts.','','| Group | Arc h | Pair class | Day | Pair | Paired n / draws | Brier difference | Brier 95% CI | Log difference | Log 95% CI | Undefined log pairs | Disclosure |','|---|---:|---|---:|---|---:|---:|---|---:|---|---:|---|');for(const c of enc.paired??[])lines.push(`| ${c.group} | ${c.arc} | ${c.pair} | ${c.day} | ${c.contrast} | ${c.n}/${c.draws} | ${fmt(c.brier.mean)} | ${fmt(c.brier.ci95)} | ${fmt(c.log.mean)} | ${fmt(c.log.ci95)} | ${c.undefinedLog} | ${c.disclosure??''} |`);
 }
 const adaptation=optional('results/five-day-ca/covariance.json');if(adaptation)lines.push('',`C3-small: ${adaptation.counts.adapted} arm-days adapted; ${adaptation.counts.emptyHistory} have no cutoff-available history and use the specified u=0 penalty solution; ${adaptation.counts.classMedian} use the frozen class chi-square median. Forecast covariance excludes reference measurement variance.`, '');
 if(adaptation?.endpointComparison){lines.push('','Synthetic AP, XP and F errors come from the module states returned with carried covariance/STM on the endpoint/noise grid. The nominal forecast table uses its original state-only grid. Both start from the same saved fit; their numerical endpoint differences are measured below. Encounter scoring uses each carried state with its own covariance.','','| Arm | Compared endpoint scalars | Different | Maximum absolute difference m | Missing reference scalars |','|---|---:|---:|---:|---:|');for(const [arm,c]of Object.entries(adaptation.endpointComparison))lines.push(`| ${arm} | ${c.scalars} | ${c.different} | ${fmt(c.maxAbsM)} | ${c.missing} |`);}
 if(adaptation?.endpointComparisonByGroup){lines.push('','Endpoint-request differences by group, maximum over all six leads (m). These describe the synthetic carried-state requests, not a tolerance change to nominal forecast replay.','','| Group | Arm | Compared scalars | Different | Maximum absolute difference m |','|---|---|---:|---:|---:|');for(const c of adaptation.endpointComparisonByGroup)lines.push(`| ${c.group} | ${c.arm} | ${c.scalars} | ${c.different} | ${fmt(c.maxAbsM)} |`);}
 if(adaptation?.coverage){lines.push('','Carried-covariance coverage by group. Fit arm-days include AP, XP, F and S at every registered arc; GP arm-days count each public-set forecast once. Exclusions are separate from missing work.','','| Group | Carried / expected windows | GP / expected windows | Fit scored / expected arm-days | Fit excluded / missing | GP scored / expected arm-days | GP excluded / missing |','|---|---:|---:|---:|---:|---:|---:|');for(const c of adaptation.coverage)lines.push(`| ${c.group} | ${c.carriedWindows}/${c.expectedWindows} | ${c.gpWindows}/${c.expectedWindows} | ${c.fitArmDays.scored}/${c.fitArmDays.expected} | ${c.fitArmDays.excluded}/${c.fitArmDays.missing} | ${c.gpArmDays.scored}/${c.gpArmDays.expected} | ${c.gpArmDays.excluded}/${c.gpArmDays.missing} |`);}
 if(!enc?.complete)lines.push('','The synthetic covariance products or paired scores remain incomplete; missing work prevents task acceptance.','');
 return lines.join('\n');
}
if(process.argv[1]===new URL(import.meta.url).pathname){const d=aggregate(),markdown=report(d);fs.writeFileSync('results/five-day-ca/metrics.json',JSON.stringify(d,null,2)+'\n');fs.writeFileSync('results/five-day-ca/README.md',markdown);console.log(JSON.stringify({coverage:d.coverage,reproduction:d.reproduction}));}
