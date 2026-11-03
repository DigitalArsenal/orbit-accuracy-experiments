import {coverage,quadrature} from './coverage.mjs';
import {diagnose,diagnoseGn,diagnoseAp} from './diagnose.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root='/opt/data/sdn-archive/operator-theory/ap-gap';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=fs.readdirSync(root,{recursive:true}).filter(p=>/^resume-[^/]+\/rows-\d+\.jsonl$/.test(p));
const all=files.flatMap(file=>fs.readFileSync(path.join(root,file),'utf8').split('\n').filter(Boolean).map(l=>({...JSON.parse(l),batch:file.split('/')[0]})));
const med=a=>{a.sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
const eventsFile=path.join(root,'events/labels.json');
if(!fs.existsSync(eventsFile))throw new Error('classify DO events before reading error ratios');
const events=JSON.parse(fs.readFileSync(eventsFile));
const historicalFiles=[];
for(const [store,arm] of [['regimes','XP72'],['ussf-regimes','U72']]){
 const dir='/opt/data/sdn-archive/operator-theory/ap/b040/'+store;
 for(const file of fs.readdirSync(dir).filter(p=>/^rows-\d+\.jsonl$/.test(p))){
  const full=path.join(dir,file);historicalFiles.push({path:full,sha256:hash(full)});
  for(const line of fs.readFileSync(full,'utf8').split('\n').filter(Boolean)){
   const r=JSON.parse(line);if(r.group==='HE'&&r.arms?.[arm])all.push({...r,batch:'historical-'+store,arms:{[arm]:r.arms[arm]}});
  }
 }
}
const groups=['GD','IG','GE','LS','DO','HX','HE','GN'];
const cells=[];
for(const g of groups) for(const batch of [...new Set(all.map(r=>r.batch))]) {
 const rows=all.filter(r=>r.group===g&&r.batch===batch);
 for(const arm of [...new Set(rows.flatMap(r=>Object.keys(r.arms)))]) {
  if(!arm.endsWith(g==='GN'&&batch==='resume-gn'?'24':'72'))continue;
  for(const day of [1,3,7]) {
   const pairs=rows.map(r=>{
    const base=all.find(b=>b.key===r.key&&(batch==='resume-gn'||batch.startsWith('resume-frame')?b.batch===batch:batch==='resume-ffm-isolated'?b.batch==='resume-ffm':batch==='resume-ffm'?b.batch===batch:batch==='resume-ap'||batch==='resume-heo'?b.batch===batch:b.batch==='resume-CONTROL'));
    const control=batch.startsWith('resume-frame')?'XP72':batch.startsWith('resume-ffm')?'F72':g==='GN'&&batch==='resume-gn'?({AP_FIXED24:'AP24',U_FIXED24:'U_REBUILT24',U_REBUILT24:'U24'}[arm]??'XP24'):'AP72';
    return {control,v:r.arms[arm]?.ok?r.arms[arm]?.days?.[day]?.e:undefined,b:base?.arms[control]?.ok?base?.arms[control]?.days?.[day]?.e:undefined};
   });
   const values=pairs.filter(p=>Number.isFinite(p.v));const paired=values.filter(p=>Number.isFinite(p.b));
   cells.push({group:g,batch,arm,control:pairs[0]?.control,day,n:values.length,attempted:rows.filter(r=>Object.hasOwn(r.arms,arm)).length,medianM:med(values.map(p=>p.v*1000)),pairedN:paired.length,pairedDeltaM:med(paired.map(p=>(p.v-p.b)*1000))});
  }
 }
}
const labels=Object.fromEntries(events.map(e=>[`${e.norad}|${e.cutoff}`,e.label]));
const eventSplit=['event','quiet','unknown'].map(label=>{const rows=all.filter(r=>r.group==='DO'&&r.batch==='resume-ap'&&labels[`${r.norad}|${r.cutoff}`]===label);return {label,windows:rows.length,days:[1,3,7].map(day=>{const pairs=rows.map(r=>{const f=all.find(x=>x.batch==='resume-ffm'&&x.key===r.key);return {a:r.arms.AP72?.days?.[day]?.e,f:f?.arms.F72?.days?.[day]?.e};}).filter(x=>Number.isFinite(x.a)&&Number.isFinite(x.f));return {day,n:pairs.length,apM:med(pairs.map(p=>p.a*1000)),ffmM:med(pairs.map(p=>p.f*1000)),medianRatio:med(pairs.map(p=>p.a/p.f))};})};});
const status={status:'partial',scope:{measuredGroups:groups,contextOnlyGroups:{P:'No AP arm was registered for drag LEO; no new P measurement is claimed.'}},methodsComplete:0,methodsRequired:5,completedRows:all.filter(r=>r.batch.startsWith('resume-')).length,historicalFiles,eventSplit,groups:Object.fromEntries(groups.map(g=>[g,all.filter(r=>r.group===g).length])),eventCounts:Object.fromEntries(['event','quiet','unknown'].map(x=>[x,events.filter(e=>e.label===x).length])),rowFiles:files.map(p=>({path:path.join(root,p),sha256:hash(path.join(root,p))})),missing:['Method 1 completeness and variant control review pending','Method 2 isolated shadow and zonal-only subtraction unavailable in current wrapper','Method 3 pending full fitter coverage','Method 4 resonant terms above degree 5 not implemented in scratch','Method 5 paired event analysis pending'],cells};
const counts=xs=>Object.fromEntries([...new Set(xs)].map(x=>[x,xs.filter(v=>v===x).length]));
status.failures=Object.fromEntries([...new Set(all.map(r=>r.batch))].map(batch=>{const rows=all.filter(r=>r.batch===batch),arms=rows.flatMap(r=>Object.values(r.arms));return [batch,{attemptedRows:rows.length,rowErrors:counts(rows.filter(r=>r.error).map(r=>r.error)),armErrors:counts(arms.filter(a=>a.error).map(a=>a.error)),fitTerminations:counts(arms.filter(a=>a.termination).map(a=>a.termination))}];}));
status.quadrature=quadrature(all);
status.heoRefinement=quadrature(all,'resume-HEO20-q4','resume-HEO20-q16');
status.diagnoses=diagnose(all,groups.filter(g=>g!=='GN')).map(d=>diagnoseAp(all,d,{base:status.quadrature.passed,refined:status.heoRefinement.passed})).concat(diagnoseGn(all));
status.provenance={eventLabels:{path:eventsFile,sha256:hash(eventsFile)},files:fs.readdirSync('experiments/ap-gap',{recursive:true}).filter(p=>/\.(mjs|py|json|md)$/.test(p)).sort().map(p=>({path:'experiments/ap-gap/'+p,sha256:hash('experiments/ap-gap/'+p)}))};
status.builds={};
for(const kind of ['variants','ussf']){const file=`/Users/tj/software/terrain-work/body-look/codex-apgap-d9/${kind}/manifest.json`;if(fs.existsSync(file))status.builds[kind]={manifestSha256:hash(file),variants:Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(file))).map(([k,v])=>[k,{sha256:v.sha256,returncode:v.returncode,path:v.path}]))};}
status.inputManifests=fs.readdirSync(root,{recursive:true}).filter(p=>/^resume-[^/]+\/inputs-\d+\.json$/.test(p)).map(p=>({path:path.join(root,p),sha256:hash(path.join(root,p))}));
const completeBatch=(batch,n)=>all.filter(r=>r.batch===batch).length===n;
const rebuildDeltas=all.filter(r=>r.batch==='resume-gn'&&r.arms.U_REBUILT24?.ok).map(r=>r.arms.U_REBUILT24.rebuildDeltaM);
status.ussfRebuild={pairedWindows:rebuildDeltas.length,maxStateDeltaM:rebuildDeltas.length?Math.max(...rebuildDeltas):null,toleranceM:0.001};
Object.assign(status,coverage(all,events));
status.missing=Object.entries(status.methodStatus).filter(([k,v])=>v!=='complete').map(([k,v])=>`Method ${k}: ${v}`);
if(!status.heoRefinement.passed)status.missing.push('Higher-degree HEO numerical convergence is unconfirmed; no production gain is attributed to these terms.');
status.missing.push('Unique causes and measured module gains are not established for every gap; follow-up tasks remain coordinator drafts.');
const dest=new URL('../../results/ap-gap/',import.meta.url);
fs.writeFileSync(new URL('status.json',dest),JSON.stringify(status,null,2)+'\n');
const fmt=x=>x===null?'—':x.toFixed(3);
let text='# AP gap diagnosis\n\nExploratory on previously read AP5/AP6 windows. Errors are forward 3D RMS in meters; leads start at fit end. Attempt and failure counts are in status.json; variant and historical controls are source-matched CONTROL/AP72; other controls are in the same batch. Table n counts available forward forecasts from 72 h fits (GN fitter: 24 h). FFM forecasts from unconverged fits remain included as in AP6, with termination counts reported separately. Δ is the median paired error change from the indicated control, not a causal gain estimate.\n\nThe inherited MGEX selector decoded six held Galileo files before filtering. No held object was fitted, scored, printed, or copied into the output rows. The coordinator authorized continuation with filename exclusions; resumed runs use the guarded selector.\n\n';
text+='## Named-cause summary\n\n| Group | Diagnosis | Paired day-3 gap m (n) | Tested AP/XP gain m | Proposed module change |\n| --- | --- | ---: | ---: | --- |\n';
for(const d of status.diagnoses)text+=`| ${d.group} | ${d.cause} | ${fmt(d.pairedGapM)} (${d.n}) | ${fmt(d.expectedGainM)} | ${d.proposedChange??'Unresolved: no production change justified by these ablations.'} |\n`;
text+='\nA subtraction identifies a candidate term, not a unique physical cause. Unresolved entries have no measured module gain. Draft tasks remain for the coordinator; no graph task was filed by this lane.\n\n';
for(const g of groups){
 text+=`## ${g}\n\n| Batch / arm | Control | Day 1 m (n) | Day 3 m (n) | Day 7 m (n) | Δ day 1 m (n) | Δ day 3 m (n) | Δ day 7 m (n) |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
 const keys=[...new Set(cells.filter(c=>c.group===g).map(c=>c.batch+'/'+c.arm))];
 for(const key of keys){const cs=cells.filter(c=>c.group===g&&c.batch+'/'+c.arm===key);const d=cs.find(c=>c.day===3);text+=`| ${key} | ${d.control} | ${[1,3,7].map(day=>{const c=cs.find(c=>c.day===day);return `${fmt(c.medianM)} (${c.n})`;}).join(' | ')} | ${[1,3,7].map(day=>{const c=cs.find(c=>c.day===day);return `${fmt(c.pairedDeltaM)} (${c.pairedN})`;}).join(' | ')} |\n`;}
 if(!keys.length)text+='| Not measured | — | — | — | — |\n';
 const diagnosis=status.diagnoses.find(d=>d.group===g);
 if(g==='HE')text+='\nArchived XP rows provide the AP6 comparison. HEO12-heap and HEO20-heap test the registered higher-degree term sets.\n';
 text+=`\n${diagnosis.cause}. ${diagnosis.proposedChange??'No module change established.'} Expected gain ${diagnosis.expectedGainM===null?'is unmeasured':fmt(diagnosis.expectedGainM)+' m (exploratory)'}; paired ${g==='GN'?'XP–Space Force':diagnosis.reference==='whiteroom XP'?'AP–whiteroom XP':'AP–FFM'} gap ${fmt(diagnosis.pairedGapM)} m (n=${diagnosis.n}). The production fix gain is unmeasured; this paired gap is a target, not a promise.\n\n`;
}
text+='## P\n\n| Registered AP arm | Day 1 m (n) | Day 3 m (n) | Day 7 m (n) |\n| --- | ---: | ---: | ---: |\n| None | — (0) | — (0) | — (0) |\n\nThe task record lists drag LEO as context with no AP arm. It is outside the registered ablation groups; no cause or module gain was measured here.\n\n';
text+='## HEO quadrature check\n\nFourfold sampling changes only the added degree-6–20 terms. Maximum paired forward-error differences, in meters: '+status.quadrature.days.map(d=>`day ${d.day}: ${fmt(d.maxDifferenceM)} (n=${d.n})`).join('; ')+`. Criterion: ≤${status.quadrature.toleranceM} m on all 26 windows at every lead. Complete: ${status.quadrature.complete}; passed: ${status.quadrature.passed}. A failed check prevents attributing a higher-term gain to converged numerics.\n\n`;
text+='Sixteenfold versus fourfold sampling: '+status.heoRefinement.days.map(d=>`day ${d.day}: ${fmt(d.maxDifferenceM)} m (n=${d.n})`).join('; ')+`. Criterion unchanged at 0.001 m. Complete: ${status.heoRefinement.complete}; passed: ${status.heoRefinement.passed}.\n\n`;
text+='## Fit and coverage outcomes\n\n| Batch | Window attempts | Row exclusions | Arm failures | FFM converged | FFM stalled / iteration limit |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';for(const [batch,v] of Object.entries(status.failures))text+=`| ${batch} | ${v.attemptedRows} | ${Object.values(v.rowErrors).reduce((a,b)=>a+b,0)} | ${Object.values(v.armErrors).reduce((a,b)=>a+b,0)} | ${v.fitTerminations.CONVERGED??0} | ${(v.fitTerminations.STALLED??0)+(v.fitTerminations.MAXIMUM_ITERATIONS??0)} |\n`;
text+='\n## DO event split\n\n| Class | Day | AP m | FFM m | Median paired ratio | n |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';for(const s of eventSplit)for(const d of s.days)text+=`| ${s.label} | ${d.day} | ${fmt(d.apM)} | ${fmt(d.ffmM)} | ${fmt(d.medianRatio)} | ${d.n} |\n`;
text+='\n## Coverage\n\n'+status.missing.map(x=>'- '+x).join('\n')+'\n\nDO labels: '+JSON.stringify(status.eventCounts)+'. Labels use the same gated truth as the fits; no event-versus-quiet contrast was measured. Historical interrupted LS rows are excluded from aggregates. The initial mixed frame batch used the wrong weather store for GN; its failed attempt is retained, and resume-frame-gn is the corrected GN frame comparison. NO_SUN and NO_MOON include the finite completion queue; their exact coverage is shown in the tables. Optional O12 and O31 arms cover the initial FFM prefix only. Original FFM arms before that merge remain under ffm-bodies/before. Four identical FFM scheduling repeats are preserved but counted once. The first resumed AP batch predates the archive-read audit. Interrupted FFM workers did not flush their input audits; the resumed workers pin the files they read. Early HEO/control batches predate explicit streamed-kernel hashes. This limits input provenance for those rows. Build hashes and changed-source hashes are in builds.json, ffm-builds.json, heo-builds.json, heo-heap-builds.json, heo-quadrature-builds.json, heo-refinement-builds.json, and ussf-builds.json; scratch manifests retain full source provenance. The first HEO12 batch trapped because native term workspaces exceeded the wasm stack. Corrected HEO12-heap and HEO20-heap batches use thread-local workspaces and remain separate. HEO results cover the registered finite harmonic set; they do not prove convergence of every high-eccentricity harmonic. Full measurement coverage and resolved physical causes are separate claims; the E2E reports its scope explicitly.\n';
const draftTasks=status.diagnoses.filter(d=>d.candidate).map(d=>{
 const observed=d.expectedGainM, target=observed??d.gainTargetCeilingM;
 const minimumGainM=target===null?null:target/2;
 return {id:`modules-ap-${d.group.toLowerCase()}-cause-confirm-20261103`,group:d.group,parent:'mode-conjunction',needs:['experiments-ap-gap-diagnosis-20261103'],component:'space-data-network-modules',paths:['propagator/sdn-ap'],status:'draft for coordinator; not filed',notFiledReason:'Lane instructions prohibit graph task creation.',hypothesis:d.cause,change:d.proposedChange,expectedGainM:observed,expectedGainBasis:observed===null?'Unmeasured for a module change; gap is a target only.':'Measured paired gain of the exploratory substitution; production fix gain remains unmeasured.',gainTargetCeilingM:d.gainTargetCeilingM,evidence:'results/ap-gap/README.md',confirmation:{registration:'Register before reading any new eligible truth. Exclude every listed hold-out and every AP5/AP6 window used here.',fitHours:d.group==='GN'?24:72,leadsDays:[1,3,7],minimumPairedDay3GainM:minimumGainM,targetBasis:'Proposed acceptance target, not a measured production result: half the exploratory gain or gap target.',nonregression:'No more than 5% median forward-error regression at days 1, 3, and 7 in GD, IG, GE, LS, DO, HX, HE, and GN on eligible unread controls.',finiteForecasts:'Retain failures and exclusions; require finite forward errors on every accepted window.'}};
});
fs.writeFileSync(new URL('proposed-tasks.json',dest),JSON.stringify(draftTasks,null,2)+'\n');
const checkFile=new URL('check-result.json',dest);
if(fs.existsSync(checkFile)){const c=JSON.parse(fs.readFileSync(checkFile));if(c.reportStatusSha256===hash(new URL('status.json',dest)))text+='\n## E2E\n\n'+`Verdict: ${c.verdict} on committed ${c.testedCommit}. Forward day-3 errors ${c.forwardDay3M.map(fmt).join(' and ')} m; repeat difference ${fmt(c.repeatDeltaM)} m against 0.001 m. Excluded rows ${c.excludedRows} of ${c.rows}; maximum fixed AGOM ${c.maxFixedAgom} across ${c.fixedArms} fits; rebuilt control maximum state difference ${fmt(c.maxURebuildDeltaM)} m. Methods complete ${c.methodsComplete}/${c.methodsRequired}. ${c.reason} Variant repeat maximum ${fmt(c.maxVariantRepeatDeltaM)} m; high-orbit zonal identity maximum ${fmt(c.maxZonalIdentityDeltaM)} m across ${c.zonalIdentityPairs} paired leads. Both native rebuild controls match their pinned binaries. The landing verdict and receipt are reported by the gauntlet separately.\n`;else text+='\n## E2E\n\nPending on this aggregate; the retained prior check belongs to an earlier report.\n';}
fs.writeFileSync(new URL('README.md',dest),text);console.log(JSON.stringify({rows:all.length,eventCounts:status.eventCounts}));
