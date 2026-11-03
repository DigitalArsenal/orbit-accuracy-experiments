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
const groups=['GD','IG','GE','LS','DO','HX','HE','GN'];
const cells=[];
for(const g of groups) for(const batch of [...new Set(all.map(r=>r.batch))]) {
 const rows=all.filter(r=>r.group===g&&r.batch===batch);
 for(const arm of [...new Set(rows.flatMap(r=>Object.keys(r.arms)))]) {
  if(!arm.endsWith(g==='GN'&&batch==='resume-gn'?'24':'72'))continue;
  for(const day of [1,3,7]) {
   const pairs=rows.map(r=>{
    const base=all.find(b=>b.key===r.key&&(batch==='resume-gn'?b.batch===batch:batch==='resume-ffm'?b.batch===batch:batch==='resume-ap'||batch==='resume-heo'?b.batch===batch:b.batch==='resume-CONTROL'));
    const control=batch==='resume-ffm'?'F72':g==='GN'&&batch==='resume-gn'?'XP24':'AP72';
    return {v:r.arms[arm]?.ok?r.arms[arm]?.days?.[day]?.e:undefined,b:base?.arms[control]?.ok?base?.arms[control]?.days?.[day]?.e:undefined};
   });
   const values=pairs.filter(p=>Number.isFinite(p.v));const paired=values.filter(p=>Number.isFinite(p.b));
   cells.push({group:g,batch,arm,day,n:values.length,attempted:rows.length,medianM:med(values.map(p=>p.v*1000)),pairedN:paired.length,pairedDeltaM:med(paired.map(p=>(p.v-p.b)*1000))});
  }
 }
}
const status={status:'partial',methodsComplete:0,methodsRequired:5,completedRows:all.length,groups:Object.fromEntries(groups.map(g=>[g,all.filter(r=>r.group===g).length])),eventCounts:Object.fromEntries(['event','quiet','unknown'].map(x=>[x,events.filter(e=>e.label===x).length])),rowFiles:files.map(p=>({path:path.join(root,p),sha256:hash(path.join(root,p))})),missing:['Method 1 completeness and variant control review pending','Method 2 isolated shadow and zonal-only subtraction unavailable in current wrapper','Method 3 pending full fitter coverage','Method 4 resonant terms above degree 5 not implemented in scratch','Method 5 paired event analysis pending'],cells};
const dest=new URL('../../results/ap-gap/',import.meta.url);
fs.writeFileSync(new URL('status.json',dest),JSON.stringify(status,null,2)+'\n');
const fmt=x=>x===null?'—':x.toFixed(3);
let text='# AP gap diagnosis\n\nExploratory on previously read AP5/AP6 windows. Errors are forward 3D RMS in meters; leads start at fit end. Counts include failed windows; each table reports successful 72 h fits (GN fitter: 24 h). Δ is the median paired error change from the indicated control, not a causal gain estimate.\n\nThe inherited MGEX selector decoded six held Galileo files before filtering. No held object was fitted, scored, printed, or copied into the output rows. The coordinator authorized continuation with filename exclusions; resumed runs use the guarded selector.\n\n';
for(const g of groups){
 text+=`## ${g}\n\n| Batch / arm | Day 1 m (n) | Day 3 m (n) | Day 7 m (n) | Paired Δ day 3 m (n) |\n| --- | ---: | ---: | ---: | ---: |\n`;
 const keys=[...new Set(cells.filter(c=>c.group===g).map(c=>c.batch+'/'+c.arm))];
 for(const key of keys){const cs=cells.filter(c=>c.group===g&&c.batch+'/'+c.arm===key);const d=cs.find(c=>c.day===3);text+=`| ${key} | ${[1,3,7].map(day=>{const c=cs.find(c=>c.day===day);return `${fmt(c.medianM)} (${c.n})`;}).join(' | ')} | ${fmt(d.pairedDeltaM)} (${d.pairedN}) |\n`;}
 if(!keys.length)text+='| Not measured | — | — | — | — |\n';
 text+='\nCause unresolved; no module change or expected gain established by these partial arms.\n\n';
}
text+='## Coverage\n\n'+status.missing.map(x=>'- '+x).join('\n')+'\n\nDO labels: '+JSON.stringify(status.eventCounts)+'. Historical interrupted LS rows are excluded from aggregates. First resumed batch predates the archive-read audit; later batches pin synchronous archive reads. Module builds and source hashes are in scratch manifests. No full-task E2E pass or gauntlet receipt is claimed.\n';
fs.writeFileSync(new URL('README.md',dest),text);console.log(JSON.stringify({rows:all.length,eventCounts:status.eventCounts}));
