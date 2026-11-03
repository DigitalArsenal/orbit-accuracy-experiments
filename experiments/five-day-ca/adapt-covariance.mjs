import fs from 'node:fs';
import path from 'node:path';
import {STATIC} from '../operator-theory/lib/regimes.mjs';
import {config,registration,analysisProvenance,hash} from './guard.mjs';
import {readRows} from './statistics.mjs';
import {arcs as expectedArcs} from './coverage.mjs';
import {openPairStatistics} from './lib/covariance-modules.mjs';
import {gOf,scaled,axesMleRef,median,truthTerm,availableAt} from '../ffm-covariance-adaptive/lib/model.mjs';
registration();
const constants=JSON.parse(fs.readFileSync('results/ffm-covariance-adaptive/frozen-constants.json')).classes;
const rows=['regimes','truth2','truth'].flatMap(label=>readRows(`${config.store}/covariance/${label}`).map(r=>({...r,labelSource:label}))),inputs={};
for(const label of ['regimes','truth2','truth']){const dir=`${config.store}/covariance/${label}`;if(fs.existsSync(dir))for(const f of fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f)))inputs[`${dir}/${f}`]=hash(fs.readFileSync(`${dir}/${f}`));}
// Pin every stored fit, endpoint, OMM and public-set extraction used by the products.
for(const phase of ['cheap','ffm','products','gp-products'])for(const label of ['regimes','truth2','truth']){const dir=`${config.store}/${phase}/${label}`;if(fs.existsSync(dir))for(const f of fs.readdirSync(dir).filter(f=>/^(rows|endpoints|omm-products|fit-products|encounter-errors)-\d+\.jsonl$/.test(f)))inputs[`${dir}/${f}`]=hash(fs.readFileSync(`${dir}/${f}`));}
const gpExtraction={days:0,missing:0,sources:{}};for(const f of fs.readdirSync(`${config.store}/gp-sets`).filter(f=>f.endsWith('.json'))){const file=`${config.store}/gp-sets/${f}`,bytes=fs.readFileSync(file),r=JSON.parse(bytes);inputs[file]=hash(bytes);gpExtraction.days++;gpExtraction.missing+=!!r.missing;if(r.sha256)gpExtraction.sources[r.file]=r.sha256;}
// NSGF's uncertainty is reference metadata, not a fitted residual or a C2 row.
const sigmaFiles=new Map();for(const object of STATIC.filter(o=>['LS','GD'].includes(o.group)&&!['stella','lageos1'].includes(o.name))){for(const file of object.files().filter(f=>/nsgf|ilrsa/i.test(f))){const metaFile=path.join(path.dirname(file),'index.json');if(!fs.existsSync(metaFile))continue;const data=fs.readFileSync(metaFile),meta=JSON.parse(data);inputs[metaFile]=hash(data);for(const o of meta.objects??[]){if(!rows.some(r=>r.norad===o.norad))continue;if(!sigmaFiles.has(o.norad))sigmaFiles.set(o.norad,[]);sigmaFiles.get(o.norad).push({file,family:/nsgf/i.test(file)?'nsgf':'ilrsa',start:Date.parse(o.start),stop:Date.parse(o.stop),sigma:meta.statedSigmaM});}}}
for(const r of rows){const metadata=sigmaFiles.get(r.norad);if(!metadata)continue;const at=t=>metadata.filter(x=>x.start<=t&&x.stop>=t),fit=at(Date.parse(r.cutoff));if(fit.length)r.fitAvailableAt=Math.max(...fit.map(x=>availableAt(x.family,x.stop)));for(const [arm,a]of Object.entries(r.arms).filter(([arm])=>arm.startsWith('F')))for(const v of Object.values(a.days??{})){const covers=at(Date.parse(v.epoch)),selected=covers.sort((a,b)=>a.file.localeCompare(b.file)).at(-1);if(covers.length)v.availableAt=Math.max(...covers.map(x=>availableAt(x.family,x.stop)));if(Number.isFinite(selected?.sigma)){v.truthSigmaM=selected.sigma;v.truthSigmaSource=selected.file.replace(/[^/]+$/,'index.json');}}}
const histories=Map.groupBy(rows,r=>`${r.norad}|${r.class}`),counts={adapted:0,emptyHistory:0,classMedian:0,historySamples:0};
const D=86400000,axes=[0,2,5];
for(const r of rows){const p=constants[r.class];if(!p)continue;const E=Date.parse(r.cutoff);for(const [arm,a]of Object.entries(r.arms).filter(([arm])=>arm.startsWith('F'))){const prior=(histories.get(`${r.norad}|${r.class}`)??[]).filter(h=>h.key!==r.key&&Date.parse(h.cutoff)>E-90*D&&Date.parse(h.cutoff)<E&&Number.isFinite(h.fitAvailableAt)&&h.fitAvailableAt<=E).map(h=>h.arms[arm]?.chi).filter(v=>Number.isFinite(v)&&v>0);a.chiRef=prior.length>=5?median(prior):p.classMedianChi;a.fitHistory=prior.length;}}

for(const r of rows){const p=constants[r.class];if(!p)continue;const E=Date.parse(r.cutoff),before=(histories.get(`${r.norad}|${r.class}`)??[]).filter(h=>Date.parse(h.cutoff)<=E-3*D&&Date.parse(h.cutoff)>E-90*D&&Number.isFinite(h.fitAvailableAt)&&h.fitAvailableAt<=E);
 for(const [arm,a]of Object.entries(r.arms).filter(([a])=>a.startsWith('F'))){const fitHistory={length:a.fitHistory},chiRef=a.chiRef;
  for(const [day,v]of Object.entries(a.days??{})){const prior=before.map(h=>({row:h,arm:h.arms[arm],v:h.arms[arm]?.days?.[day]})).filter(h=>h.v&&Number.isFinite(h.v.availableAt)&&h.v.availableAt<=E);const u=axes.map((axis,k)=>axesMleRef(prior.map(h=>({e:h.v.errorM[k],a:gOf(h.arm.chi,h.arm.chiRef,p.a0,p.a1,+day*24)*(h.v.baseCovarianceM2??h.v.covarianceM2)[axis],c:r.class==='R2-O'?truthTerm(h.v.truthSigmaM):0})),p.n0));
   const g=gOf(a.chi,chiRef,p.a0,p.a1,+day*24);v.baseCovarianceM2=v.covarianceM2;v.covarianceM2=scaled(v.baseCovarianceM2,g,u);v.adaptation={g,u,chiRef,history:prior.length,fitHistory:fitHistory.length,historyLatestAvailableAt:prior.length?Math.max(...prior.map(h=>Math.max(h.row.fitAvailableAt,h.v.availableAt))):null,historyLatestCutoff:prior.length?Math.max(...prior.map(h=>Date.parse(h.row.cutoff))):null};v.label=`C3-small ${r.class}; cutoff-available history; seven-day transfer`;
   counts.adapted++;counts.emptyHistory+=!prior.length;counts.classMedian+=fitHistory.length<5;counts.historySamples+=prior.length;
  }
 }
}
// C2/C3 are defined in predicted RTN; the common artificial encounter is in truth RTN.
const pairModule=await openPairStatistics();let rotatedArmDays=0;
try{const todo=[];for(const r of rows)for(const [arm,a]of Object.entries(r.arms))for(const v of Object.values(a.days??{})){if(!v.errorM||!v.covarianceM2)continue;if(arm.startsWith('S')){v.axes='truth RTN';continue;}if(!v.predictedState||!v.truthState)throw Error('carried product lacks frame states');todo.push(v);}
 for(let start=0;start<todo.length;start+=512){const batch=todo.slice(start,start+512),stats=await pairModule.stats(batch.map(v=>({predicted:{...v.predictedState,covariance:v.covarianceM2,covarianceAxes:'RTN'},truth:v.truthState})),'truth');for(let i=0;i<batch.length;i++){const v=batch[i];v.calibrationErrorM=v.errorM;v.calibrationCovarianceM2=v.covarianceM2;v.errorM=stats[i].errorRtn;v.covarianceM2=stats[i].predictedRtn;v.axes='truth RTN';rotatedArmDays++;}}
}finally{await pairModule.close();}
// The covariance/STM propagation requests carry their own module state. Audit
// their endpoint errors against the separate nominal forecast requests.
const endpointComparison={};
for(const label of ['regimes','truth2','truth'])for(const phase of ['products','ffm']){const dir=`${config.store}/${phase}/${label}`;if(!fs.existsSync(dir))continue;const reference=new Map(fs.readdirSync(dir).filter(f=>/^encounter-errors-\d+\.jsonl$/.test(f)).flatMap(f=>fs.readFileSync(`${dir}/${f}`,'utf8').split('\n').filter(Boolean).map(JSON.parse)).map(r=>[r.key+'|'+r.arm,r]));
 for(const r of rows.filter(r=>r.labelSource===label))for(const [arm,a]of Object.entries(r.arms)){if((phase==='ffm')!==arm.startsWith('F'))continue;const ref=reference.get(r.key+'|'+arm);if(!ref)continue;const code=arm.replace(/\d+/g,''),c=endpointComparison[code]??={scalars:0,different:0,maxAbsM:0,missing:0};for(const [day,v]of Object.entries(a.days??{})){if(!v.errorM)continue;const q=ref.days?.[day];if(!q){c.missing+=3;continue;}if(q.epoch!==v.epoch)throw Error('covariance endpoint epoch differs');for(let i=0;i<3;i++){const delta=Math.abs(v.errorM[i]-1000*q.rtnKm[i]);c.scalars++;c.different+=delta!==0;c.maxAbsM=Math.max(c.maxAbsM,delta);}}}
}
const nominal=new Map();for(const label of ['regimes','truth2','truth'])for(const phase of ['cheap','ffm'])for(const r of readRows(`${config.store}/${phase}/${label}`)){const key=`${label}|${r.key}`;if(!nominal.has(key))nominal.set(key,{error:r.error,arms:{}});Object.assign(nominal.get(key).arms,r.arms);}
for(const r of rows)if(!Object.keys(r.arms).length&&nominal.get(`${r.labelSource}|${r.key}`)?.error)r.error=nominal.get(`${r.labelSource}|${r.key}`).error;
for(const r of rows)for(const [arm,a]of Object.entries(r.arms))for(const day of config.leads)if(!a.days[day]){const source=nominal.get(`${r.labelSource}|${r.key}`)?.arms[arm];a.days[day]={error:a.error??(source&&!source.days?.[day]?'lead grid below 90%':'carried covariance product not run')};}
const coverage=new Map(),carried=new Map(rows.map(r=>[`${r.labelSource}|${r.key}`,r]));
const valid=v=>v&&!v.error&&v.errorM?.length===3&&v.covarianceM2?.length===6&&v.errorM.every(Number.isFinite)&&v.covarianceM2.every(Number.isFinite);
for(const label of ['regimes','truth2','truth']){const gp=new Map(readRows(`${config.store}/gp-products/${label}`).map(r=>[r.key,r]));for(const r of readRows(`${config.store}/cheap/${label}`)){const group=label==='truth'?'T':r.group;if(!coverage.has(group))coverage.set(group,{group,expectedWindows:0,carriedWindows:0,gpWindows:0,fitArmDays:{expected:0,scored:0,excluded:0,missing:0},gpArmDays:{expected:0,scored:0,excluded:0,missing:0}});const c=coverage.get(group),fit=carried.get(`${label}|${r.key}`),g=gp.get(r.key);c.expectedWindows++;c.carriedWindows+=!!fit;c.gpWindows+=!!g;
 for(const arc of expectedArcs({...r,group}))for(const arm of ['AP','XP','F','S'])for(const day of config.leads){const d=c.fitArmDays,a=fit?.arms[arm+arc],v=a?.days?.[day];d.expected++;if(valid(v))d.scored++;else if(fit&&(fit.error||a))d.excluded++;else d.missing++;}
 for(const day of config.leads){const d=c.gpArmDays;d.expected++;if(valid(g?.days[day]))d.scored++;else if(g)d.excluded++;else d.missing++;}
}}
const out=`${config.store}/adapted-covariance.jsonl`;fs.writeFileSync(out,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
fs.writeFileSync('results/five-day-ca/covariance.json',JSON.stringify({provenance:analysisProvenance(),inputs,gpExtraction,counts,rotatedArmDays,endpointComparison,coverage:[...coverage.values()],rows:rows.length,outputSha256:hash(fs.readFileSync(out)),truthTerm:'used only when estimating history scale; forecast covariance excludes reference measurement variance'},null,2)+'\n');console.log(JSON.stringify(counts));
