import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config,root,read,write,sha,hashFile,runDir } from './common.mjs';
import { config as baseline } from '../propagator-published-truth/common.mjs';
import { outcomeFile } from './run.mjs';

const finite=x=>typeof x==='number'&&Number.isFinite(x),unique=a=>[...new Set(a)];
const quantile=(a,p)=>{if(!a.length)return null;const s=[...a].sort((a,b)=>a-b),k=(s.length-1)*p,i=Math.floor(k);return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(k-i);};
const median=a=>quantile(a,.5),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const counts=a=>Object.fromEntries(unique(a).sort().map(k=>[k,a.filter(x=>x===k).length]));
function paired(rows,a,b,lead,label){
  const clusters=new Map();let undefinedRatio=0;
  for(const r of rows){const x=r.arms?.[a],y=r.arms?.[b];if(!x?.ok||!y?.ok||!x.days[lead]||!y.days[lead])continue;
    const ratio=x.days[lead].rmsM/y.days[lead].rmsM;if(!finite(ratio)){undefinedRatio++;continue;}
    const id=r.norad??r.key;if(!clusters.has(id))clusters.set(id,[]);clusters.get(id).push(ratio);
  }
  const values=[...clusters.values()],all=values.flat();let interval=null;
  if(values.length>=baseline.statistics.minimumObjectsForSuperiority){
    let seed=parseInt(sha(`${baseline.statistics.seed}:${label}:${a}:${b}:${lead}`).slice(0,8),16)>>>0;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;},boot=[];
    for(let i=0;i<baseline.statistics.bootstrapResamples;i++){const samples=[];for(let j=0;j<values.length;j++)samples.push(...values[Math.floor(random()*values.length)]);boot.push(median(samples));}
    interval=[quantile(boot,.025),quantile(boot,.975)];
  }
  return {numerator:a,denominator:b,arcs:all.length,objects:values.length,undefinedRatio,medianRatio:median(all),objectBootstrap95:interval,decision:interval?(interval[1]<1?'LOWER_ERROR_ON_COMMON_SUPPORT':interval[0]>1?'HIGHER_ERROR_ON_COMMON_SUPPORT':'UNRESOLVED'):'DESCRIPTIVE_ONLY'};
}
function covariance(rows,arm,lead,key){
  const available=rows.filter(r=>r.arms?.[arm]?.ok&&r.arms[arm].days[lead]?.exact),selected=available.filter(r=>finite(r.arms[arm].days[lead].exact[key]));
  const d=selected.map(r=>r.arms[arm].days[lead].exact[key]),objects=unique(selected.map(r=>r.norad??r.key)).length,coverage95=d.length?d.filter(x=>x<=baseline.covariance.chiSquare3_95).length/d.length:null,meanD2Over3=d.length?mean(d)/3:null;
  const within=(x,b)=>x>=b[0]&&x<=b[1];
  return {arcs:d.length,objects,invalidOrMissing:available.length-d.length,coverage95,meanD2Over3,referenceCovarianceArcs:selected.filter(r=>r.arms[arm].days[lead].exact.referenceCovariancePresent).length,status:d.length<baseline.covariance.minimumArcs||objects<baseline.covariance.minimumObjects?'INSUFFICIENT':within(meanD2Over3,baseline.covariance.acceptableMeanD2Over3)&&within(coverage95,baseline.covariance.acceptableCoverage95)?'PASS':'FAIL'};
}
export function aggregate(census,rows,provenance){
  const byKey=new Map(rows.map(r=>[r.key,r]));if(byKey.size!==rows.length)throw new Error('Duplicate outcome key');
  const sources=census.sources.map(s=>{
    const population=census.objects.filter(o=>o.source===s.id),outcomes=population.map(o=>byKey.get(o.key)).filter(Boolean),provider=census.providers.find(p=>p.source===s.id);
    return {...s,files:census.files.filter(f=>f.source===s.id).length,sourceObjects:population.length,uniqueNorad:unique(population.map(o=>o.norad).filter(Boolean)).length,unresolvedIdentities:population.filter(o=>!o.norad).length,finished:outcomes.filter(r=>r.finishedUtc).length,pending:population.length-outcomes.filter(r=>r.finishedUtc).length,outcomes:counts(outcomes.map(r=>r.status)),provider:provider?{status:provider.status,reason:provider.reason,advertisedRecords:provider.advertisedRecords??null,acquiredRecords:provider.records.length,completePagination:provider.completePagination}:null,populationKnown:false};
  });
  const lineages={};
  for(const lineage of unique(census.objects.map(o=>o.lineage)).sort()){
    const pop=census.objects.filter(o=>o.lineage===lineage),selected=pop.map(o=>byKey.get(o.key)).filter(Boolean),leads={};
    for(const lead of config.selection.leadDays){
      const arms={};for(const arm of config.arms){
        const tried=selected.filter(r=>r.arms?.[arm]),good=tried.filter(r=>r.arms[arm].ok&&r.arms[arm].days[lead]);
        arms[arm]={population:pop.length,attempted:tried.length,failed:tried.filter(r=>!r.arms[arm].ok).length,successful:good.length,leadAvailable:selected.filter(r=>r.leads?.[lead]?.available).length,unavailableReference:selected.filter(r=>r.finishedUtc&&!r.leads?.[lead]?.available).length,pending:pop.length-selected.filter(r=>r.finishedUtc).length,medianRmsM:median(good.map(r=>r.arms[arm].days[lead].rmsM)),p90RmsM:quantile(good.map(r=>r.arms[arm].days[lead].rmsM),.9),combined:covariance(selected,arm,lead,'d2Combined'),predictionOnly:covariance(selected,arm,lead,'d2Predicted')};
      }
      leads[lead]={arms,paired:[paired(selected,'ap-msis','xp-native',lead,lineage),paired(selected,'ffm','xp-native',lead,lineage),paired(selected,'ffm','ap-msis',lead,lineage)]};
    }
    const common=selected.filter(r=>config.arms.every(a=>r.arms?.[a]?.ok));
    lineages[lineage]={source:pop[0].source,evidence:pop[0].evidence,regime:'not yet classified by native module',population:pop.length,statuses:counts(selected.map(r=>r.status)),leads,timing:{commonArcs:common.length,arms:Object.fromEntries(config.arms.map(a=>[a,Object.fromEntries(['fitWallSeconds','propagateWallSeconds','scoreWallSeconds','totalWallSeconds','totalCpuSeconds'].map(k=>[k,median(common.map(r=>r.arms[a].timing[k]))]))]))}};
  }
  const failures=rows.flatMap(r=>r.arms?Object.entries(r.arms).filter(([,a])=>!a.ok).map(([arm,a])=>`${r.lineage} | ${arm} | ${a.status}: ${a.reason}`):[`${r.lineage} | ${r.status}: ${r.reason||''}`]);
  const terminal=rows.filter(r=>r.finishedUtc).length;
  const ephemerides=census.objects.filter(o=>o.evidence!=='gp-only');
  return {schema:'public-ephemeris-census-report-v1',completeCatalog:false,completeAvailableBatch:terminal===census.objects.length,provenance,counts:{registrySources:census.sources.filter(s=>s.registry).length,providerInventoriesComplete:census.providers.filter(p=>p.completePagination).length,files:census.files.length,deduplicatedConversions:census.duplicates.length,sourceObjects:census.objects.length,ephemerisSourceObjects:ephemerides.length,gpSourceObjects:census.objects.length-ephemerides.length,ephemerisUniqueResolvedNorad:unique(ephemerides.map(o=>o.norad).filter(Boolean)).length,uniqueResolvedNorad:unique(census.objects.map(o=>o.norad).filter(Boolean)).length,spaceTrackObjectTypes:counts(census.objects.filter(o=>o.lineage==='space-track-gp').map(o=>o.objectType||'UNKNOWN')),unresolvedSourceIdentities:census.objects.filter(o=>!o.norad).length,finished:terminal,pending:census.objects.length-terminal},sources,lineages,failureReasons:counts(failures),rawArchives:census.rawArchives.map(r=>({...r,files:r.files.length})),inventoryIssues:census.issues,
    limits:['All-catalog coverage is unproven while live source inventories are unreachable or raw archives remain unparsed.','Counts describe the frozen local archive, not all objects currently advertised upstream.','Numeric NORAD/catalog IDs are reported by the sources, not independently crossmatched against the full SATCAT; some operator IDs are provisional.','One arc per source/object; no spacecraft cap. No residual-based selection.','No independent Space Force XP result: the earlier WASM validity failure remains unresolved.','Operator heads are reconstruction evidence, not independent physical truth; missing reference covariance is explicit.','Native orbit-regime classification and full raw-format reconciliation remain open.','Runtime on this shared host is descriptive; retain accuracy improvements regardless of speed cost.','The earlier 21/21 NASA CARA Pc integral tests do not certify covariance or conjunction performance for this larger population.']};
}
export function markdown(out){
  const n=x=>x.toLocaleString('en-US'),num=x=>finite(x)?x.toFixed(2):'—';
  const lines=['# Public ephemeris census and propagator comparison','',
    '**Status: incomplete catalog coverage.** This replaces the ten-spacecraft pilot as the population definition; it is not yet an all-catalog accuracy result.','',
    `The frozen local inventory contains **${n(out.counts.sourceObjects)} source/object identities**, representing **${n(out.counts.uniqueResolvedNorad)} source-reported numeric NORAD/catalog IDs** plus **${n(out.counts.unresolvedSourceIdentities)} unresolved source identities**, across **${n(out.counts.files)} files**. Multiple sources may describe the same object; these totals are deliberately distinct. There is no spacecraft or source cap.`,
    '',`Ephemeris archives identify **${n(out.counts.ephemerisUniqueResolvedNorad)} distinct numeric IDs** across **${n(out.counts.ephemerisSourceObjects)} source/object entries**. These include provisional operator IDs; full SATCAT identity validation remains open. GP feeds add catalog membership, not independent truth. The Space-Track membership includes ${Object.entries(out.counts.spaceTrackObjectTypes).map(([k,v])=>`${n(v)} ${k.toLowerCase()}`).join(', ')}; debris and rocket bodies are not mislabeled spacecraft.`,
    '',`Numerical/accounting outcomes: **${n(out.counts.finished)} finished; ${n(out.counts.pending)} pending**. Live provider inventories reconciled: **${out.counts.providerInventoriesComplete}/${out.counts.registrySources}**. A finished coverage or parser failure is not a successful propagation.`,
    '', '## Source coverage','', '| Source | Local files | Source/object identities | Resolved NORAD | Finished / pending | Provider inventory |','|---|---:|---:|---:|---:|---|'];
  for(const s of out.sources)lines.push(`| ${s.id} | ${n(s.files)} | ${n(s.sourceObjects)} | ${n(s.uniqueNorad)} | ${n(s.finished)} / ${n(s.pending)} | ${s.provider?.status??'additional archive; no provider reconciliation'} |`);
  if(out.operatorRecordCoverage)lines.push('',`Full Starlink record/epoch audit: **${n(out.operatorRecordCoverage.objects)} identities checked; ${n(out.operatorRecordCoverage.statuses.eligible||0)} eligible; ${n(out.operatorRecordCoverage.statuses.missing_fit_coverage||0)} with insufficient fit coverage**. ${n(out.operatorRecordCoverage.epochChecks)} selected epochs survive OEM framing unchanged. This is a coverage/framing check; it is not completion of the numerical batch.`);
  lines.push('', 'A zero means no identified local object for that source, not an empty upstream catalog. Registered source endpoints are deployment metadata, not proof of active ingestion. Credentialed feeds remain in the source reconciliation; a private commercial feed does not count as public truth.','', '## Accuracy on available support','',
    'Results are separated by product lineage and evidence class. Only successful common support enters paired ratios; all missing coverage and numerical failures remain in the denominators in [summary.json](summary.json). No numerical orbit-regime classification has yet been added.','',
    '| Lineage | Evidence | Lead | XP / AP / FFM successes | Median RMS metres XP / AP / FFM | FFM/XP paired ratio |','|---|---|---:|---:|---|---:|');
  for(const [name,g]of Object.entries(out.lineages))for(const [lead,l]of Object.entries(g.leads)){
    if(!config.arms.some(a=>l.arms[a].attempted))continue;
    lines.push(`| ${name} | ${g.evidence} | ${lead} d | ${config.arms.map(a=>l.arms[a].successful).join(' / ')} | ${config.arms.map(a=>num(l.arms[a].medianRmsM)).join(' / ')} | ${num(l.paired[1].medianRatio)} |`);
  }
  lines.push('', 'Covariance calibration diagnostics, 2,000-resample object-cluster intervals, arm failures and common-support timing are in the aggregate JSON. Reference covariance is not assumed when absent. These results do not establish calibrated Pc or operational conjunction performance.', '', '## Remaining gaps','');
  for(const l of out.limits)lines.push(`- ${l}`);
  lines.push('', '## Reproduce','', 'The [frozen plan and dated amendment](../../experiments/propagator-catalog-census/PLAN.md) define selection and environment inputs. The [configuration](../../experiments/propagator-catalog-census/config.json) pins the pilot settings, module revision and source registry. Raw ephemerides, fitted elements and per-epoch statistics remain local.','',
    '```sh','node experiments/propagator-catalog-census/census.mjs --run registered',
    '# Place the exact amendment-pinned GFZ weather file in the run environment directory.',
    'node experiments/propagator-catalog-census/catalog.mjs --from registered --run catalog',
    'node experiments/propagator-catalog-census/batch.mjs --from catalog --run catalog-epochs --modules "$SDN_MODULES_ROOT"','```','',
    'The finite batch runs every object, generates this report and then executes the real-archive E2E. It can resume interrupted execution with unchanged provenance. The earlier strict-grid run is retained separately: its 45-second sampling rule admitted only 91 Starlink identities. The dated amendment selects operator states within half their ten-minute cadence, uses their actual timestamps for propagation/scoring, and retains the original 45-second exact-lead covariance test. No state interpolation or epoch relabeling is used.','',
    'The census refuses to overwrite a frozen snapshot. The runner resumes only outcomes with matching execution provenance and uses four workers. It does not sample spacecraft or remove slow cases. Report generation can show an explicitly incomplete run. Verification of available readers does not close missing-source gaps.','');
  return lines.join('\n');
}
export function report(name='registered',destination=path.join(root,'results',config.id)){
  const dir=runDir(name),file=path.join(dir,'census.json'),census=read(file),censusHash=hashFile(file);
  if(censusHash!==read(path.join(dir,'census.sha256.json')).sha256)throw new Error('Census changed');
  const rows=[],outcomeHashes={};
  for(const o of census.objects){const f=outcomeFile(dir,o.key);if(fs.existsSync(f)){const r=read(f);if(r.key!==o.key)throw new Error('Outcome key mismatch');rows.push(r);outcomeHashes[o.key]=hashFile(f);}}
  const executionFile=path.join(dir,'execution.json'),execution=fs.existsSync(executionFile)?read(executionFile):null;
  if(rows.some(r=>r.executionId!==execution?.executionId))throw new Error('Mixed execution provenance');
  const out=aggregate(census,rows,{censusHash,executionId:execution?.executionId??null,moduleCommit:config.moduleCommit,sourceSnapshotUtc:census.frozenUtc,outcomeHashesSha256:sha(JSON.stringify(outcomeHashes))});
  const auditFile=path.join(dir,'operator-epoch-audit.json');
  if(fs.existsSync(auditFile)){
    const a=read(auditFile);if(a.censusHash!==censusHash)throw new Error('Operator audit belongs to another census');
    const source=`experiments/${config.id}/arcs.mjs`;
    if(a.sourceHashes[source]!==execution.sourceHashes[source])throw new Error('Operator audit uses another sampling implementation');
    out.operatorRecordCoverage={classification:'source coverage and exact epoch framing, not numerical completion',censusHash,selectionSha256:a.sourceHashes[source],objects:a.objects,statuses:a.statuses,fitSamples:a.fitSamples,scoreSamples:a.scoreSamples,epochChecks:a.epochChecks,completedUtc:a.completedUtc};
  }
  write(path.join(dir,'report-inputs.json'),{censusHash,execution,outcomeHashes});
  write(path.join(destination,'summary.json'),out);fs.writeFileSync(path.join(destination,'README.md'),markdown(out));return out;
}
if(process.argv[1]===new URL(import.meta.url).pathname){const{values}=parseArgs({options:{run:{type:'string',default:'registered'}}});const out=report(values.run);console.log(JSON.stringify(out.counts));}
