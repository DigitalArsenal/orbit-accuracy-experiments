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
    const base=all.find(b=>b.key===r.key&&(batch==='resume-gn'||batch==='resume-frame'?b.batch===batch:batch==='resume-ffm'?b.batch===batch:batch==='resume-ap'||batch==='resume-heo'?b.batch===batch:b.batch==='resume-CONTROL'));
    const control=batch==='resume-frame'?'XP72':batch==='resume-ffm'?'F72':g==='GN'&&batch==='resume-gn'?'XP24':'AP72';
    return {v:r.arms[arm]?.ok?r.arms[arm]?.days?.[day]?.e:undefined,b:base?.arms[control]?.ok?base?.arms[control]?.days?.[day]?.e:undefined};
   });
   const values=pairs.filter(p=>Number.isFinite(p.v));const paired=values.filter(p=>Number.isFinite(p.b));
   cells.push({group:g,batch,arm,day,n:values.length,attempted:rows.length,medianM:med(values.map(p=>p.v*1000)),pairedN:paired.length,pairedDeltaM:med(paired.map(p=>(p.v-p.b)*1000))});
  }
 }
}
const labels=Object.fromEntries(events.map(e=>[`${e.norad}|${e.cutoff}`,e.label]));
const eventSplit=['event','quiet','unknown'].map(label=>{const rows=all.filter(r=>r.group==='DO'&&r.batch==='resume-ap'&&labels[`${r.norad}|${r.cutoff}`]===label);return {label,windows:rows.length,days:[1,3,7].map(day=>{const pairs=rows.map(r=>{const f=all.find(x=>x.batch==='resume-ffm'&&x.key===r.key);return {a:r.arms.AP72?.days?.[day]?.e,f:f?.arms.F72?.days?.[day]?.e};}).filter(x=>Number.isFinite(x.a)&&Number.isFinite(x.f));return {day,n:pairs.length,apM:med(pairs.map(p=>p.a*1000)),ffmM:med(pairs.map(p=>p.f*1000)),medianRatio:med(pairs.map(p=>p.a/p.f))};})};});
const status={status:'partial',methodsComplete:0,methodsRequired:5,completedRows:all.filter(r=>r.batch.startsWith('resume-')).length,historicalFiles,eventSplit,groups:Object.fromEntries(groups.map(g=>[g,all.filter(r=>r.group===g).length])),eventCounts:Object.fromEntries(['event','quiet','unknown'].map(x=>[x,events.filter(e=>e.label===x).length])),rowFiles:files.map(p=>({path:path.join(root,p),sha256:hash(path.join(root,p))})),missing:['Method 1 completeness and variant control review pending','Method 2 isolated shadow and zonal-only subtraction unavailable in current wrapper','Method 3 pending full fitter coverage','Method 4 resonant terms above degree 5 not implemented in scratch','Method 5 paired event analysis pending'],cells};
const counts=xs=>Object.fromEntries([...new Set(xs)].map(x=>[x,xs.filter(v=>v===x).length]));
status.failures=Object.fromEntries([...new Set(all.map(r=>r.batch))].map(batch=>{const rows=all.filter(r=>r.batch===batch),arms=rows.flatMap(r=>Object.values(r.arms));return [batch,{attemptedRows:rows.length,rowErrors:counts(rows.filter(r=>r.error).map(r=>r.error)),armErrors:counts(arms.filter(a=>a.error).map(a=>a.error)),fitTerminations:counts(arms.filter(a=>a.termination).map(a=>a.termination))}];}));
status.diagnoses=diagnose(all,groups.filter(g=>g!=='GN')).map(d=>diagnoseAp(all,d)).concat(diagnoseGn(all));
status.builds={};
for(const kind of ['variants','ussf']){const file=`/Users/tj/software/terrain-work/body-look/codex-apgap-d9/${kind}/manifest.json`;if(fs.existsSync(file))status.builds[kind]={manifestSha256:hash(file),variants:Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(file))).map(([k,v])=>[k,{sha256:v.sha256,returncode:v.returncode,path:v.path}]))};}
status.inputManifests=fs.readdirSync(root,{recursive:true}).filter(p=>/^resume-[^/]+\/inputs-\d+\.json$/.test(p)).map(p=>({path:path.join(root,p),sha256:hash(path.join(root,p))}));
const completeBatch=(batch,n)=>all.filter(r=>r.batch===batch).length===n;
status.methodStatus={1:['CONTROL','H03','H05','H07','NOFRAME','CLASS0','CLASS1','CLASS2','CLASS3','CLASS4'].every(v=>completeBatch('resume-'+v,426))?'complete':'partial',2:'partial: shadow and zonal-only isolation unavailable',3:completeBatch('resume-gn',755)&&status.builds.variants?.variants.AGOM_FIXED?.returncode===0&&status.builds.ussf?.variants.FIXED?.returncode===0?'complete':'partial',4:'partial: extended resonant terms not implemented',5:events.length===150&&eventSplit.some(s=>s.days.some(d=>d.n>0))?'complete':'partial'};
status.methodsComplete=Object.values(status.methodStatus).filter(v=>v==='complete').length;
status.missing=Object.entries(status.methodStatus).filter(([k,v])=>v!=='complete').map(([k,v])=>`Method ${k}: ${v}`);
status.missing.push('Unique causes and measured module gains are not established for every gap; follow-up tasks remain coordinator drafts.');
const dest=new URL('../../results/ap-gap/',import.meta.url);
fs.writeFileSync(new URL('status.json',dest),JSON.stringify(status,null,2)+'\n');
const fmt=x=>x===null?'—':x.toFixed(3);
let text='# AP gap diagnosis\n\nExploratory on previously read AP5/AP6 windows. Errors are forward 3D RMS in meters; leads start at fit end. Attempt and failure counts are in status.json; table n counts available forward forecasts from 72 h fits (GN fitter: 24 h). FFM forecasts from unconverged fits remain included as in AP6, with termination counts reported separately. Δ is the median paired error change from the indicated control, not a causal gain estimate.\n\nThe inherited MGEX selector decoded six held Galileo files before filtering. No held object was fitted, scored, printed, or copied into the output rows. The coordinator authorized continuation with filename exclusions; resumed runs use the guarded selector.\n\n';
for(const g of groups){
 text+=`## ${g}\n\n| Batch / arm | Day 1 m (n) | Day 3 m (n) | Day 7 m (n) | Paired Δ day 3 m (n) |\n| --- | ---: | ---: | ---: | ---: |\n`;
 const keys=[...new Set(cells.filter(c=>c.group===g).map(c=>c.batch+'/'+c.arm))];
 for(const key of keys){const cs=cells.filter(c=>c.group===g&&c.batch+'/'+c.arm===key);const d=cs.find(c=>c.day===3);text+=`| ${key} | ${[1,3,7].map(day=>{const c=cs.find(c=>c.day===day);return `${fmt(c.medianM)} (${c.n})`;}).join(' | ')} | ${fmt(d.pairedDeltaM)} (${d.pairedN}) |\n`;}
 if(!keys.length)text+='| Not measured | — | — | — | — |\n';
 const diagnosis=status.diagnoses.find(d=>d.group===g);
 if(g==='HE')text+='\nArchived XP rows provide the AP6 comparison. The resonant extension arm remains unmeasured.\n';
 text+=`\n${diagnosis.cause}. ${diagnosis.proposedChange??'No module change established.'} Expected gain ${diagnosis.expectedGainM===null?'is unmeasured':fmt(diagnosis.expectedGainM)+' m (exploratory)'}; paired ${g==='GN'?'XP–Space Force':diagnosis.reference==='whiteroom XP'?'AP–whiteroom XP':'AP–FFM'} gap ${fmt(diagnosis.pairedGapM)} m (n=${diagnosis.n}). This gap is a target ceiling, not a promised gain.\n\n`;
}
text+='## Fit and coverage outcomes\n\n| Batch | Window attempts | Row exclusions | Arm failures | FFM converged | FFM stalled / iteration limit |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';for(const [batch,v] of Object.entries(status.failures))text+=`| ${batch} | ${v.attemptedRows} | ${Object.values(v.rowErrors).reduce((a,b)=>a+b,0)} | ${Object.values(v.armErrors).reduce((a,b)=>a+b,0)} | ${v.fitTerminations.CONVERGED??0} | ${(v.fitTerminations.STALLED??0)+(v.fitTerminations.MAXIMUM_ITERATIONS??0)} |\n`;
text+='\n## DO event split\n\n| Class | Day | AP m | FFM m | Median paired ratio | n |\n| --- | ---: | ---: | ---: | ---: | ---: |\n';for(const s of eventSplit)for(const d of s.days)text+=`| ${s.label} | ${d.day} | ${fmt(d.apM)} | ${fmt(d.ffmM)} | ${fmt(d.medianRatio)} | ${d.n} |\n`;
text+='\n## Coverage\n\n'+status.missing.map(x=>'- '+x).join('\n')+'\n\nDO labels: '+JSON.stringify(status.eventCounts)+'. Historical interrupted LS rows are excluded from aggregates. First resumed batch predates the archive-read audit; later batches pin synchronous archive reads. Module builds and source hashes are in scratch manifests. No full-task E2E pass or gauntlet receipt is claimed.\n';
fs.writeFileSync(new URL('proposed-tasks.json',dest),JSON.stringify(status.diagnoses.filter(d=>d.candidate).map(d=>({group:d.group,parent:'mode-conjunction',needs:['experiments-ap-gap-diagnosis-20261103'],status:'draft for coordinator; not filed',hypothesis:d.cause,change:d.proposedChange,expectedGainM:d.expectedGainM,gainTargetCeilingM:d.gainTargetCeilingM,confirmation:'Register an E2E on unread eligible windows before reading them; compare forward errors at days 1, 3, and 7.'})),null,2)+'\n');
fs.writeFileSync(new URL('README.md',dest),text);console.log(JSON.stringify({rows:all.length,eventCounts:status.eventCounts}));
