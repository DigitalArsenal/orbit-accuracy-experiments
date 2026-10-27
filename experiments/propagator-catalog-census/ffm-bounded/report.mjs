// Report-only statistics. No selection, fitting or propagation is performed here.
import fs from 'node:fs';
import path from 'node:path';
import {config as baseline} from '../../propagator-published-truth/common.mjs';
import {outcomeFile} from '../run.mjs';
import {root,read,write,sha,hashFile,settings,sourceDir,outputDir,outcomePath} from './common.mjs';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const count=a=>{const d={};for(const x of a)d[x]=(d[x]??0)+1;return Object.fromEntries(Object.entries(d).sort());};
const quantile=(a,p)=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),k=(s.length-1)*p,i=Math.floor(k);return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(k-i);};
const median=a=>quantile(a,.5),mean=a=>a.length?a.reduce((v,x)=>v+x,0)/a.length:null;
function interval(clusters,label,stat,complete){
  if(!complete||clusters.size<baseline.statistics.minimumObjectsForSuperiority)return null;
  let seed=parseInt(sha(`${baseline.statistics.seed}:bounded:${label}`).slice(0,8),16)>>>0;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},groups=[...clusters.values()],boot=[];
  for(let i=0;i<baseline.statistics.bootstrapResamples;i++){const a=[];for(let k=0;k<groups.length;k++)a.push(...groups[Math.floor(random()*groups.length)]);boot.push(stat(a));}
  return[quantile(boot,.025),quantile(boot,.975)];
}
function paired(rows,other,lead,label,complete){
  const groups=new Map();let undefinedRatio=0;
  for(const r of rows){const a=r.arm,b=r.prior.arms?.[other];if(!a?.ok||!b?.ok||!a.days[lead]||!b.days[lead])continue;
    const x=a.days[lead].rmsM/b.days[lead].rmsM;if(!finite(x)){undefinedRatio++;continue;}const id=r.object.norad??r.object.key;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(x);}
  const ci=interval(groups,`${label}:${other}:${lead}:ratio`,median,complete);
  return{numerator:settings.arm,denominator:other,arcs:[...groups.values()].flat().length,objects:groups.size,undefinedRatio,medianRatio:median([...groups.values()].flat()),objectBootstrap95:ci,
    decision:!complete?'PENDING_COMPLETE_BATCH':!ci?'DESCRIPTIVE_ONLY':ci[1]<1?'LOWER_ERROR_ON_COMMON_SUPPORT':ci[0]>1?'HIGHER_ERROR_ON_COMMON_SUPPORT':'UNRESOLVED'};
}
function covariance(rows,lead,key,label,complete){
  const available=rows.filter(r=>r.arm?.ok&&r.arm.days[lead]?.exact),valid=available.filter(r=>finite(r.arm.days[lead].exact[key])),groups=new Map();
  for(const r of valid){const id=r.object.norad??r.object.key;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r.arm.days[lead].exact[key]);}
  const d=[...groups.values()].flat(),coverage=a=>a.filter(x=>x<=baseline.covariance.chiSquare3_95).length/a.length;
  const coverage95=d.length?coverage(d):null,meanD2Over3=d.length?mean(d)/3:null;
  const within=(x,b)=>finite(x)&&x>=b[0]&&x<=b[1];
  return{arcs:d.length,objects:groups.size,missingOrInvalid:available.length-d.length,coverage95,meanD2Over3,
    coverageObjectBootstrap95:interval(groups,`${label}:${lead}:${key}:coverage`,coverage,complete),meanD2Over3ObjectBootstrap95:interval(groups,`${label}:${lead}:${key}:mean`,a=>mean(a)/3,complete),
    referenceCovarianceArcs:valid.filter(r=>r.arm.days[lead].exact.referenceCovariancePresent).length,
    activeConstraintArcs:valid.filter(r=>r.arm.fit.activeConstraint).length,
    statisticalDiagnostic:!complete?'PENDING_COMPLETE_BATCH':d.length<baseline.covariance.minimumArcs||groups.size<baseline.covariance.minimumObjects?'INSUFFICIENT':within(coverage95,baseline.covariance.acceptableCoverage95)&&within(meanD2Over3,baseline.covariance.acceptableMeanD2Over3)?'WITHIN_REGISTERED_BANDS':'OUTSIDE_REGISTERED_BANDS',
    operationalCalibration:'NOT_ESTABLISHED: reference quality, independence and held-out population adequacy remain separate requirements'};
}
export function aggregate(){
  const manifest=read(path.join(outputDir,'manifest.json')),census=read(path.join(sourceDir,'census.json')),rows=[],hashes=[];
  if(hashFile(path.join(sourceDir,'census.json'))!==manifest.censusHash)throw Error('Changed census');
  for(const object of census.objects){
    const p=outcomeFile(sourceDir,object.key),prior=read(p),f=outcomePath(object.key),out=fs.existsSync(f)?read(f):null;
    if(prior.executionId!==settings.sourceExecutionId||prior.key!==object.key)throw Error('Foreign prior result');
    if(out&&(out.amendmentId!==manifest.amendmentId||out.key!==object.key||out.sourceOutcomeSha256!==hashFile(p)))throw Error('Foreign bounded result');
    hashes.push([object.key,'prior',hashFile(p)]);if(out)hashes.push([object.key,'bounded',hashFile(f)]);
    if(out?.fitSha256){const fit=path.join(outputDir,'fits',sha(object.key).slice(0,32)+'.json');if(hashFile(fit)!==out.fitSha256)throw Error('Changed fitted solution');hashes.push([object.key,'fit',out.fitSha256]);}
    rows.push({object,prior,out,arm:out?.arm,finished:!!out?.finishedUtc});
  }
  const complete=rows.every(r=>r.finished),lineages={};
  for(const lineage of [...new Set(rows.map(r=>r.object.lineage))].sort()){
    const selected=rows.filter(r=>r.object.lineage===lineage),tried=selected.filter(r=>r.arm),ok=tried.filter(r=>r.arm.ok),leads={};
    for(const lead of baseline.leadDays){
      const good=ok.filter(r=>r.arm.days[lead]),common=good.filter(r=>r.prior.arms?.ffm?.ok&&r.prior.arms.ffm.days[lead]);
      leads[lead]={successful:good.length,missingOrFailed:selected.length-good.length,medianRmsM:median(good.map(r=>r.arm.days[lead].rmsM)),p90RmsM:quantile(good.map(r=>r.arm.days[lead].rmsM),.9),
        paired:['ffm','xp-native','ap-msis'].map(other=>paired(selected,other,lead,lineage,complete)),
        commonPriorFfm:{arcs:common.length,oldMedianRmsM:median(common.map(r=>r.prior.arms.ffm.days[lead].rmsM)),newMedianRmsM:median(common.map(r=>r.arm.days[lead].rmsM))},
        combined:covariance(selected,lead,'d2Combined',lineage,complete),predictionOnly:covariance(selected,lead,'d2Predicted',lineage,complete)};
    }
    lineages[lineage]={source:selected[0].object.source,evidence:selected[0].object.evidence,population:selected.length,pending:selected.filter(r=>!r.finished).length,attempted:tried.length,successful:ok.length,failed:tried.length-ok.length,
      statusTransitions:count(tried.map(r=>`${r.prior.arms.ffm.ok?'success':r.prior.arms.ffm.reason} -> ${r.arm.ok?'success':r.arm.reason}`)),
      statuses:count(selected.map(r=>r.out?.status??'pending')),failures:count(tried.filter(r=>!r.arm.ok).map(r=>r.arm.reason)),activeConstraintFits:ok.filter(r=>r.arm.fit.activeConstraint).length,boundStatus:count(ok.map(r=>JSON.stringify(r.arm.fit.boundStatus))),leads,
      timing:{classification:'shared-host descriptive only; no speed superiority claim',medianFitSeconds:median(ok.map(r=>r.arm.timing.fitWallSeconds)),medianTotalCpuSeconds:median(ok.map(r=>r.arm.timing.totalCpuSeconds))}};
  }
  return{schema:'ffm-physical-fit-amendment',completeAvailableArm:complete,completeCatalog:false,method:settings.arm,
    provenance:{amendmentId:manifest.amendmentId,sourceExecutionId:settings.sourceExecutionId,ffmCommit:settings.ffmCommit,sourceAndOutcomeHashesSha256:sha(JSON.stringify(hashes)),reportSourceSha256:hashFile(new URL(import.meta.url))},
    counts:{sourceObjects:rows.length,finished:rows.filter(r=>r.finished).length,pending:rows.filter(r=>!r.finished).length,attempted:rows.filter(r=>r.arm).length,successful:rows.filter(r=>r.arm?.ok).length,failed:rows.filter(r=>r.arm&&!r.arm.ok).length},
    statistics:{...baseline.statistics,confidence:.95},covarianceCriteria:baseline.covariance,lineages,
    limitations:['Original outcomes remain unchanged; this amendment applies physical bounds, native damping, 50 maximum iterations and corrected covariance validation.',
      'Both fit rounds must converge at the unchanged tolerance. Failure recovery does not imply improved accuracy or calibrated uncertainty.',
      'Paired accuracy compares successful common support; all unsuccessful and unavailable entries remain in population counts.',
      'Formal fitted covariance and active-bound covariance are not asserted to be empirically calibrated.',
      'Operator head reconstruction is separate from independently reconstructed reference evidence. Assumed reference uncertainty is not measured truth covariance.',
      'The frozen archive and current direct-feed snapshot have separate denominators. This arm does not close direct-feed coverage gaps.',
      'No collision-risk or performance superiority conclusion follows from these position-error statistics.']};
}
function markdown(out){
  const n=x=>finite(x)?x.toFixed(4):'unavailable',lines=['# Bounded FFM comparison','',`**${out.completeAvailableArm?'Available-input arm complete':'Batch incomplete'}; full catalog coverage remains unfinished.**`,
    '',`${out.counts.finished} / ${out.counts.sourceObjects} source/object entries accounted for. ${out.counts.successful} successful numerical results, ${out.counts.failed} failed, ${out.counts.pending} pending.`,
    '', '| Lineage | Successful / attempted | Recovered / regressed | Active bounds |','|---|---:|---:|---:|'];
  for(const [name,g]of Object.entries(out.lineages))if(g.attempted){const entries=Object.entries(g.statusTransitions),recovered=entries.filter(([k])=>!k.startsWith('success ->')&&k.endsWith(' -> success')).reduce((s,[,v])=>s+v,0),regressed=entries.filter(([k])=>k.startsWith('success ->')&&!k.endsWith(' -> success')).reduce((s,[,v])=>s+v,0);lines.push(`| ${name} | ${g.successful} / ${g.attempted} | ${recovered} / ${regressed} | ${g.activeConstraintFits} |`);}
  lines.push('','| Lineage | Lead | New FFM / old FFM median error ratio, 95% CI | New FFM / XP median ratio, 95% CI | Combined covariance diagnostic |','|---|---:|---|---|---|');
  const ratio=r=>`${n(r.medianRatio)} [${r.objectBootstrap95?.map(n).join(', ')??'unavailable'}]`;
  for(const [name,g]of Object.entries(out.lineages))if(g.attempted)for(const [d,v]of Object.entries(g.leads))lines.push(`| ${name} | ${d} d | ${ratio(v.paired[0])} | ${ratio(v.paired[1])} | ${v.combined.statisticalDiagnostic} |`);
  lines.push('','The [JSON](summary.json) retains denominators, failure transitions, object-cluster intervals, missing covariance, and method identity. Normalized-error bands are statistical diagnostics; they do not establish operational uncertainty calibration.','');
  for(const l of out.limitations)lines.push('- '+l);lines.push('','Procedure and unchanged acceptance criteria: [registered plan](../../../experiments/propagator-catalog-census/ffm-bounded/PLAN.md).','');return lines.join('\n');
}
if(process.argv[1]===new URL(import.meta.url).pathname){const out=aggregate(),destination=path.join(root,'results/propagator-catalog-census/ffm-bounded');write(path.join(destination,'summary.json'),out);fs.writeFileSync(path.join(destination,'README.md'),markdown(out));console.log(JSON.stringify(out.counts));}
