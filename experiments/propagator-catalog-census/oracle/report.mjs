import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {config as baseline} from '../../propagator-published-truth/common.mjs';
import {outcomeFile} from '../run.mjs';
import {root,read,write,sha,hashFile,sourceDir,outputDir,settings} from './common.mjs';
const arms=['xp-native','ap-msis','ffm','xp-quantized','ussf99-quantized'];
const quantile=(a,p)=>{if(!a.length)return null;const v=[...a].sort((x,y)=>x-y),k=(v.length-1)*p,i=Math.floor(k);return v[i]+(v[Math.min(i+1,v.length-1)]-v[i])*(k-i);};
const median=a=>quantile(a,.5);
const count=a=>{const out={};for(const x of a)out[x]=(out[x]||0)+1;return Object.fromEntries(Object.entries(out).sort());};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
function paired(rows,numerator,denominator,lead,label,complete){
  const clusters=new Map();let undefinedRatio=0;
  for(const row of rows){const a=row.arms[numerator],b=row.arms[denominator];if(!a?.ok||!b?.ok||!a.days[lead]||!b.days[lead])continue;
    const ratio=a.days[lead].rmsM/b.days[lead].rmsM;if(!finite(ratio)){undefinedRatio++;continue;}
    const id=row.norad??row.key;if(!clusters.has(id))clusters.set(id,[]);clusters.get(id).push(ratio);
  }
  const values=[...clusters.values()],all=values.flat();let interval=null;
  if(complete&&values.length>=baseline.statistics.minimumObjectsForSuperiority){
    let seed=parseInt(sha(`${baseline.statistics.seed}:${label}:${numerator}:${denominator}:${lead}`).slice(0,8),16)>>>0;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},boot=[];
    for(let i=0;i<baseline.statistics.bootstrapResamples;i++){
      const samples=[];for(let j=0;j<values.length;j++)samples.push(...values[Math.floor(random()*values.length)]);
      boot.push(median(samples));
    }
    interval=[quantile(boot,.025),quantile(boot,.975)];
  }
  return{numerator,denominator,arcs:all.length,objects:values.length,undefinedRatio,medianRatio:median(all),objectBootstrap95:interval,
    decision:!complete?'PENDING_COMPLETE_BATCH':interval?(interval[1]<1?'LOWER_ERROR_ON_COMMON_SUPPORT':interval[0]>1?'HIGHER_ERROR_ON_COMMON_SUPPORT':'UNRESOLVED'):'DESCRIPTIVE_ONLY'};
}
export function aggregate(){
  const manifest=read(path.join(outputDir,'manifest.json')),census=read(path.join(sourceDir,'census.json')),rows=[],hashes=[];
  if(hashFile(path.join(sourceDir,'census.json'))!==manifest.censusHash)throw Error('Changed census');
  for(const object of census.objects){
    const original=outcomeFile(sourceDir,object.key),prior=read(original),file=outcomeFile(outputDir,object.key),extension=fs.existsSync(file)?read(file):null;
    if(prior.key!==object.key||prior.executionId!==settings.sourceExecutionId)throw Error('Foreign source outcome');
    if(extension&&(extension.key!==object.key||extension.extensionId!==manifest.extensionId||extension.sourceOutcomeSha256!==hashFile(original)))throw Error('Foreign extension outcome');
    let diagnostic=null;const diagnosticFile=path.join(outputDir,'diagnostics',path.basename(file));
    if(fs.existsSync(diagnosticFile)){diagnostic=read(diagnosticFile);if(diagnostic.extensionId!==manifest.extensionId)throw Error('Foreign diagnostic');hashes.push([object.key,'diagnostic',hashFile(diagnosticFile)]);}
    hashes.push([object.key,'source',hashFile(original)]);if(extension)hashes.push([object.key,'extension',hashFile(file)]);
    rows.push({...object,status:extension?.status??'pending',finished:!!extension?.finishedUtc,
      reason:extension?.reason??prior.reason??null,arms:{...prior.arms,...extension?.arms},agreement:extension?.agreement,diagnostic});
  }
  const complete=rows.every(r=>r.finished),lineages={};
  for(const lineage of [...new Set(rows.map(r=>r.lineage))].sort()){
    const selected=rows.filter(r=>r.lineage===lineage),leads={};
    for(const lead of baseline.leadDays){
      const metrics={};for(const name of arms){
        const added=name==='xp-quantized'||name==='ussf99-quantized';
        const tried=selected.filter(r=>r.arms[name]||(added&&r.status==='reference_extension_failed'));
        const good=tried.filter(r=>r.arms[name]?.ok&&r.arms[name].days[lead]);
        metrics[name]={population:selected.length,attempted:tried.length,failed:tried.filter(r=>!r.arms[name]?.ok).length,
          successful:good.length,missingOrUnavailable:selected.length-good.length,
          medianRmsM:median(good.map(r=>r.arms[name].days[lead].rmsM)),p90RmsM:quantile(good.map(r=>r.arms[name].days[lead].rmsM),.9)};
      }
      leads[lead]={arms:metrics,paired:[paired(selected,'ussf99-quantized','xp-quantized',lead,lineage,complete),
        paired(selected,'ffm','ussf99-quantized',lead,lineage,complete),paired(selected,'xp-quantized','xp-native',lead,lineage,complete)]};
    }
    const agreement=selected.filter(r=>r.agreement),exceeding=agreement.filter(r=>r.agreement.exceedances.length);
    const classifications=exceeding.flatMap(r=>r.diagnostic?.rows.map(x=>x.classification??x.status)??Array(r.agreement.exceedances.length).fill('diagnostic_pending'));
    lineages[lineage]={source:selected[0].source,evidence:selected[0].evidence,population:selected.length,statuses:count(selected.map(r=>r.status)),
      failures:count(selected.filter(r=>r.reason&&r.status!=='evaluated').map(r=>`${r.status}: ${r.reason}`)),leads,
      agreement:{pairedArcs:agreement.length,pairedSamples:agreement.reduce((n,r)=>n+r.agreement.pairedSamples,0),
        maximumPositionDifferenceM:agreement.length?Math.max(...agreement.map(r=>r.agreement.maximumPositionDifferenceM??0)):null,
        strictExceedingArcs:exceeding.length,strictExceedingSamples:exceeding.reduce((n,r)=>n+r.agreement.exceedances.length,0),classifications:count(classifications)}};
  }
  return{schema:'catalog-reference-extension',completeAvailableExtension:complete,completeCatalog:false,
    provenance:{extensionId:manifest.extensionId,moduleCommit:manifest.moduleCommit,oracleCommit:manifest.oracleCommit,
      oracleVersion:manifest.oracleVersion,oraclePackageSha256:manifest.oraclePackageSha256,censusHash:manifest.censusHash,
      sourceExecutionId:manifest.sourceExecutionId,outcomeAndDiagnosticHashesSha256:sha(JSON.stringify(hashes)),reportSourceSha256:hashFile(new URL(import.meta.url))},
    counts:{sourceObjects:rows.length,uniqueNumericIds:new Set(rows.map(r=>r.norad).filter(Boolean)).size,finished:rows.filter(r=>r.finished).length,
      pending:rows.filter(r=>!r.finished).length,statuses:count(rows.map(r=>r.status))},arms,lineages,
    covariance:{ussf99:'UNAVAILABLE: the reference interface returns no covariance',quantizedXp:'NOT_EVALUATED: no covariance is inferred from coordinate agreement',
      originalArms:'Preserved separately in ../summary.json; failed calibration is not changed by this comparison'},
    limitations:['The complete direct-feed population is not yet normalized; this extension preserves the frozen local census denominator.',
      'Type-4 text quantization is explicit and shared; original returned-OMM outcomes remain separate. Fit comments may already specify two-line digits; OMM payload precision is not an assertion of estimator precision.',
      'Strict reference discrepancies remain reported even when a published numerical branch condition explains them.',
      'A lower position-error ratio is not calibrated uncertainty or an operational collision-risk validation.',
      'Native USSF and browser-hosted WASM timings are not a controlled speed comparison.']};
}
function markdown(out){
  const number=x=>finite(x)?x.toFixed(4):'unavailable',lines=['# Space Force XP extension to the catalog census','',
    `**${out.completeAvailableExtension?'Available-input extension complete':'Batch incomplete'}; full catalog coverage remains unfinished.**`,
    '',`${out.counts.finished.toLocaleString()} of ${out.counts.sourceObjects.toLocaleString()} source/object identities accounted for; ${out.counts.pending.toLocaleString()} pending. Original XP, AP and FFM results are retained.`,
    '',`Reference: USSF ${out.provenance.oracleVersion}; modules ${out.provenance.moduleCommit}; extension ${out.provenance.extensionId}.`,
    '', '| Lineage | Evidence | Lead | Quantized XP / USSF / FFM successes | Median RMS m: quantized XP / USSF / FFM | FFM/USSF median ratio |',
    '|---|---|---:|---|---|---:|'];
  for(const [name,group] of Object.entries(out.lineages))for(const [lead,entry] of Object.entries(group.leads)){
    const names=['xp-quantized','ussf99-quantized','ffm'];if(!names.some(a=>entry.arms[a].attempted))continue;
    lines.push(`| ${name} | ${group.evidence} | ${lead} d | ${names.map(a=>entry.arms[a].successful).join(' / ')} | ${names.map(a=>number(entry.arms[a].medianRmsM)).join(' / ')} | ${number(entry.paired[1].medianRatio)} |`);
  }
  lines.push('','The JSON retains every source and failure denominator, text-quantization comparison, strict discrepancy, and paired object-cluster 95% interval (2,000 resamples after batch completion). USSF covariance is unavailable. Original covariance calibration remains in [the census report](../README.md).','',
    '| Lineage | Paired samples | Maximum difference m | Samples above 1 m | Diagnostic classifications |','|---|---:|---:|---:|---|');
  for(const [name,g] of Object.entries(out.lineages))if(g.agreement.pairedSamples)lines.push(`| ${name} | ${g.agreement.pairedSamples} | ${number(g.agreement.maximumPositionDifferenceM)} | ${g.agreement.strictExceedingSamples} | ${JSON.stringify(g.agreement.classifications)} |`);
  lines.push('','Reproduction and fixed criteria: [registered extension plan](../../../experiments/propagator-catalog-census/oracle/PLAN.md). Raw inputs, complete fitted elements and official provider binaries remain local.','');
  for(const limit of out.limitations)lines.push(`- ${limit}`);
  return lines.join('\n')+'\n';
}
if(process.argv[1]===new URL(import.meta.url).pathname){
  const {values}=parseArgs({options:{output:{type:'string',default:path.join(root,'results/propagator-catalog-census/oracle')}}});
  const out=aggregate();write(path.join(values.output,'summary.json'),out);fs.writeFileSync(path.join(values.output,'README.md'),markdown(out));
  console.log(JSON.stringify({completeAvailableExtension:out.completeAvailableExtension,counts:out.counts}));
}
