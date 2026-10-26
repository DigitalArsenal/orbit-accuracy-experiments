import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config,root,results,read,sha } from './common.mjs';
import { windows } from './truth.mjs';

const finite = x => typeof x === 'number' && Number.isFinite(x);
const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const quantile = (xs,p) => {
  if (!xs.length) return null;
  const s=[...xs].sort((a,b)=>a-b),i=(s.length-1)*p,k=Math.floor(i);
  return s[k]+(s[Math.min(k+1,s.length-1)]-s[k])*(i-k);
};
const median = xs => quantile(xs,.5);
const unique = xs => [...new Set(xs)];
function coverage(rows,arm,lead,key) {
  const eligible=rows.filter(r=>r.arms[arm]?.ok && r.arms[arm].days[lead]?.exact);
  const selected=eligible.filter(r=>finite(r.arms[arm].days[lead].exact[key]));
  const d=selected.map(r=>r.arms[arm].days[lead].exact[key]),objects=unique(selected.map(r=>r.norad)).length;
  const rate=d.length?d.filter(x=>x<=config.covariance.chiSquare3_95).length/d.length:null,normalized=mean(d)===null?null:mean(d)/3;
  const inBand=(x,band)=>x>=band[0]&&x<=band[1];
  return {arcs:d.length,objects,invalidOrMissing:eligible.length-d.length,meanD2Over3:normalized,coverage95:rate,
    referenceCovarianceArcs:selected.filter(r=>r.arms[arm].days[lead].exact.referenceCovariancePresent).length,
    status:d.length<config.covariance.minimumArcs || objects<config.covariance.minimumObjects?'INSUFFICIENT':inBand(normalized,config.covariance.acceptableMeanD2Over3)&&inBand(rate,config.covariance.acceptableCoverage95)?'PASS':'FAIL'};
}
function paired(rows,a,b,lead,label) {
  const pairs=rows.filter(r=>r.arms[a]?.ok&&r.arms[b]?.ok&&r.arms[a].days[lead]&&r.arms[b].days[lead]).map(r=>({object:r.norad,ratio:r.arms[a].days[lead].rmsM/r.arms[b].days[lead].rmsM}));
  if(pairs.some(p=>!finite(p.ratio)))throw new Error('nonfinite paired ratio');
  const objects=unique(pairs.map(p=>p.object)),point=median(pairs.map(p=>p.ratio));
  let interval=null;
  if(objects.length>=config.statistics.minimumObjectsForSuperiority){
    let seed=parseInt(sha(`${config.statistics.seed}:${label}:${a}:${b}:${lead}`).slice(0,8),16)>>>0;
    const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
    const boot=[];
    for(let i=0;i<config.statistics.bootstrapResamples;i++){
      const selected=[];
      for(let j=0;j<objects.length;j++){const object=objects[Math.floor(random()*objects.length)];selected.push(...pairs.filter(p=>p.object===object).map(p=>p.ratio));}
      boot.push(median(selected));
    }
    interval=[quantile(boot,.025),quantile(boot,.975)];
  }
  return {numerator:a,denominator:b,arcs:pairs.length,objects:objects.length,medianRatio:point,objectBootstrap95:interval,decision:interval?(interval[1]<1?'LOWER_ERROR_ON_COMMON_SUPPORT':interval[0]>1?'HIGHER_ERROR_ON_COMMON_SUPPORT':'UNRESOLVED'):'DESCRIPTIVE_ONLY'};
}
export function aggregate(rows) {
  const families={};
  for(const family of ['All',...unique(config.objects.map(o=>o.family))]){
    const selected=family==='All'?rows:rows.filter(r=>r.family===family),leads={};
    for(const lead of config.leadDays){
      const arms={};
      for(const arm of config.arms){
        const attempted=selected.filter(r=>r.arms[arm]),good=attempted.filter(r=>r.arms[arm].ok&&r.arms[arm].days[lead]),d=good.map(r=>r.arms[arm].days[lead]);
        arms[arm]={registered:selected.length,excluded:selected.filter(r=>r.excluded).length,attempted:attempted.length,failed:attempted.filter(r=>!r.arms[arm].ok).length,successful:good.length,unavailableLead:selected.filter(r=>!r.excluded&&!r.leads[lead]?.available).length,
          objects:unique(good.map(r=>r.norad)).length,medianRmsM:median(d.map(x=>x.rmsM)),p90RmsM:quantile(d.map(x=>x.rmsM),.9),
          medianRicRmsM:[0,1,2].map(k=>median(d.map(x=>x.ricRmsM[k]))),medianExactErrorM:median(d.map(x=>x.exact?.positionErrorM).filter(finite)),
          combined:coverage(selected,arm,lead,'d2Combined'),predictionOnly:coverage(selected,arm,lead,'d2Predicted')};
      }
      leads[lead]={arms,paired:[paired(selected,'ap-msis','xp-native',lead,family),paired(selected,'ffm','xp-native',lead,family),paired(selected,'ffm','ap-msis',lead,family)]};
    }
    const common=selected.filter(r=>config.arms.every(a=>r.arms[a]?.ok));
    const timing={commonArcs:common.length,arms:{}};
    for(const arm of config.arms)timing.arms[arm]=Object.fromEntries(['fit','propagate','score','total'].flatMap(stage=>['Wall','Cpu'].map(kind=>[`${stage}${kind}Seconds`,median(common.map(r=>r.arms[arm].timing[`${stage}${kind}Seconds`]))])));
    families[family]={leads,timing};
  }
  return {classification:config.classification,moduleCommit:config.moduleCommit,registeredArcs:windows().length,objects:config.objects.length,
    pairedStatistic:'median per-arc RMS ratio; 2,000 object-cluster bootstrap resamples, percentile 95% interval',families,
    exclusions:rows.filter(r=>r.excluded).map(r=>({key:r.key,reason:r.excluded})),
    failures:rows.flatMap(r=>config.arms.filter(a=>r.arms[a]&&!r.arms[a].ok).map(a=>({key:r.key,arm:a,error:r.arms[a].error.split('\n')[0]}))),
    retainedFirstRoundFits:rows.filter(r=>r.arms.ffm?.ok&&r.arms.ffm.fit.stoppedBy).map(r=>({key:r.key,reason:r.arms.ffm.fit.stoppedBy})),
    // Arc-level aggregates contain no states, fitted elements, or per-epoch tables.
    arcSummaries:rows.map(r=>({key:r.key,norad:r.norad,family:r.family,issue:r.issue,fitSamples:r.fitSamples,leads:r.leads,excluded:r.excluded,
      arms:Object.fromEntries(config.arms.filter(a=>r.arms[a]).map(a=>[a,r.arms[a].ok?{ok:true,days:r.arms[a].days,timing:r.arms[a].timing}:{ok:false,error:r.arms[a].error.split('\n')[0]}]))}))};
}
const number = x => finite(x)?x.toLocaleString('en-US',{maximumFractionDigits:1}):'—';
const ratio = x => finite(x)?x.toFixed(3):'—';
const percent = x => finite(x)?`${number(x*100)}%`:'—';
export function markdown(out,pc,manifest) {
  const lines=['# Published-reference propagator comparison','',`Thirty registered arcs across ten spacecraft; module commit \`${config.moduleCommit}\`. Precise orbit products are held out from each fit, not globally unseen. Accuracy gains are retained regardless of execution cost.`,'',
    `NASA CARA 2D Foster Pc: **${pc.passed}/${pc.cases.length} pass**, using unchanged upstream tolerances. This verifies the integral, not orbit prediction, covariance calibration or operational collision risk.`,
    '',`Orbit exclusions: ${out.exclusions.length}. Failed arm/arc attempts: ${out.failures.length}. SDN-AP contains white-room XP at this pin: “XP-native” and “AP-MSIS” are two configurations of that module. USSF WASM is excluded following the independently reproduced invalid/order-dependent behavior in the [earlier study](../propagator-ca-frontier/README.md).`,
    '', '## Trajectory accuracy','', 'Median final-day position RMS in metres, across arcs. Each cell uses that arm’s successful arcs; paired comparisons below use identical support. P90, R/T/N components, exact-lead errors and all counts are in [summary.json](summary.json).','',
    '| Family | Lead | XP-native | AP-MSIS | FFM | Successful arcs XP/AP/FFM |','|---|---:|---:|---:|---:|---|'];
  for(const [family,f] of Object.entries(out.families).filter(([n])=>n!=='All'))for(const [lead,l] of Object.entries(f.leads))lines.push(`| ${family} | ${lead} d | ${config.arms.map(a=>number(l.arms[a].medianRmsM)).join(' | ')} | ${config.arms.map(a=>l.arms[a].successful).join('/')} |`);
  lines.push('','## Matched comparisons','','Pooled median per-arc RMS ratios, with object-cluster bootstrap intervals. A ratio below one favors the numerator. These exploratory pooled results do not establish superiority in every orbit family. Each family has fewer than five objects and is descriptive only. Failure rates remain part of the result.','','| Comparison | Lead | Common arcs | Ratio | 95% interval | Decision |','|---|---:|---:|---:|---|---|');
  for(const [lead,l] of Object.entries(out.families.All.leads))for(const p of l.paired)lines.push(`| ${p.numerator}/${p.denominator} | ${lead} d | ${p.arcs} | ${ratio(p.medianRatio)} | ${p.objectBootstrap95?.map(ratio).join('–')??'insufficient'} | ${p.decision} |`);
  lines.push('','## Covariance coverage','','One exact-lead observation per arc; no dense-sample independence claim. Primary values add available reference covariance. Realism requires both mean D²/3 in [0.8, 1.25] and 95% coverage in [93%, 97%], with at least 30 arcs and five objects. “INSUFFICIENT” is not a pass. Three arcs per object remain correlated; this is a screening diagnostic, not certification.','','| Arm | Lead | Arcs | Mean D²/3 | Coverage | Prediction-only coverage | Result |','|---|---:|---:|---:|---:|---:|---|');
  for(const [lead,l] of Object.entries(out.families.All.leads))for(const [arm,a] of Object.entries(l.arms))lines.push(`| ${arm} | ${lead} d | ${a.combined.arcs} | ${number(a.combined.meanD2Over3)} | ${percent(a.combined.coverage95)} | ${percent(a.predictionOnly.coverage95)} | ${a.combined.status} |`);
  const t=out.families.All.timing;
  lines.push('','## Execution cost','',`Median seconds on ${t.commonArcs} arcs for which all three arms completed the same scored workload, including covariance. One sequential pass on a shared host; these are observed costs, not a controlled throughput ranking. CPU seconds include all process threads. Start/end load averages: ${manifest.host.loadStart.join(', ')} / ${manifest.host.loadEnd.join(', ')}; ${manifest.host.cpus} logical CPUs. Endpoint load measurements do not certify absence of saturation throughout the run.`,
    '','| Arm | Fit wall | Forecast wall | Score wall | Total wall | Total CPU |','|---|---:|---:|---:|---:|---:|');
  for(const [arm,a] of Object.entries(t.arms))lines.push(`| ${arm} | ${['fitWallSeconds','propagateWallSeconds','scoreWallSeconds','totalWallSeconds','totalCpuSeconds'].map(k=>a[k]?.toFixed(4)??'—').join(' | ')} |`);
  lines.push('','## Failures and limits','');
  if(!out.exclusions.length&&!out.failures.length)lines.push('Every registered arc completed all three arms.');
  for(const r of out.exclusions)lines.push(`- ${r.key}: excluded — ${r.reason}.`);
  for(const r of out.failures)lines.push(`- ${r.key}, ${r.arm}: ${r.error}.`);
  for(const r of out.retainedFirstRoundFits)lines.push(`- ${r.key}, FFM: the existing E6 estimator retained its first-round solution after the second round stopped: ${r.reason}.`);
  lines.push('','The 24-hour fits use retrospective precise states, not public TLEs. The estimators differ, so force models alone cannot explain all differences. Final EOP and historical revised weather are not a verified as-issued forecast replay. Driver dates stop before issue day and then persist. Maneuvers were not independently screened; no residual-based exclusions were made.',
    '', 'Swarm uses ESA/TU Delft reduced-dynamic products. Sentinel uncertainties encode the product accuracy requirement rather than measured epoch-specific errors. GRACE-FO uses GFZ rapid RSO, not final GNV1B; overlap uncertainties are not independent absolute accuracy. GPS uses ESA final SP3. Source URLs, checksums and converter metadata are retained in the provenance file. The existing truth gate applies to every reference product.',
    '', 'No force model was trimmed or tuned against these scores. DCA/prior merit remains in the separately owned XM study. The scope does not test conjunction screening, TCA search, 3D Pc, Monte Carlo Pc or calibration against physical collisions.',
    '', '## Reproduce','', 'The [frozen plan](../../experiments/propagator-published-truth/PLAN.md) and [configuration](../../experiments/propagator-published-truth/config.json) preceded state access. The implementation corrected a weather record constructor and explicit UTC parsing during integration; scoring, selection and physics were unchanged.',
    '', '```sh', 'node experiments/propagator-published-truth/run.mjs --modules "$SDN_MODULES_ROOT" --run registered', 'node experiments/propagator-published-truth/pc.mjs --modules "$SDN_MODULES_ROOT" --run pc-registered', 'node experiments/propagator-published-truth/report.mjs --run registered', 'node experiments/propagator-published-truth/verify.mjs --modules "$SDN_MODULES_ROOT"', '```',
    '', 'Run names must be fresh. The real local archive and pinned module checkout are required; missing data is a visible skip, never a pass. The E2E checks provenance, replays the first registered arc of each family and all 21 Pc cases, and regenerates aggregates/report exactly. Raw ephemerides and per-epoch tables are not committed.',
    '', 'Sources: [ESA/TU Delft Swarm product catalogue](https://swarm-disc.github.io/product-catalogue-tools/SW_SP3xCOM_2_.html), [Copernicus POD](https://sentiwiki.copernicus.eu/web/precise-orbit-determination), [GFZ GRACE-FO](https://isdc-data.gfz.de/grace-fo/), [NASA CARA software](https://www.nasa.gov/cara/publicly-available-cara-software/).','');
  return lines.join('\n');
}
export function report(runName='registered',check=false) {
  const dir=path.join(root,'runs',config.id,runName),manifest=read(path.join(dir,'manifest.json'));
  if(!manifest.completedUtc)throw new Error('orbit run has not completed');
  const rows=windows().map(w=>read(path.join(dir,'rows',`${w.key}.json`))),pcDir=path.join(root,'runs',config.id,`pc-${runName}`),pc=read(path.join(pcDir,'pc.json')),pcManifest=read(path.join(pcDir,'manifest.json'));
  const out=aggregate(rows),provenance={orbit:manifest,pc:pcManifest,rows:Object.fromEntries(windows().map(w=>[w.key,sha(fs.readFileSync(path.join(dir,'rows',`${w.key}.json`)))])),
    archive:rows.map(r=>({key:r.key,weather:r.weather,audit:r.audit})),outputs:{'summary.json':sha(JSON.stringify(out,null,2)+'\n'),'pc.json':sha(JSON.stringify(pc,null,2)+'\n')}};
  const files={'summary.json':JSON.stringify(out,null,2)+'\n','pc.json':JSON.stringify(pc,null,2)+'\n','provenance.json':JSON.stringify(provenance,null,2)+'\n','README.md':markdown(out,pc,manifest)};
  fs.mkdirSync(results,{recursive:true});
  for(const [name,bytes] of Object.entries(files)){
    const f=path.join(results,name);
    if(check){if(fs.readFileSync(f,'utf8')!==bytes)throw new Error(`report differs: ${name}`);}else fs.writeFileSync(f,bytes);
  }
  return out;
}
if(process.argv[1]===new URL(import.meta.url).pathname){const {values}=parseArgs({options:{run:{type:'string',default:'registered'}}});if(!/^[a-zA-Z0-9._-]+$/.test(values.run))throw new Error('invalid run name');report(values.run);console.log(`Wrote ${results}`);}
