// Paired artificial encounters; all states, RTN errors, carried covariances and Pc originate in modules.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {config,registration,analysisProvenance,hash,dir,store} from './guard.mjs';
import {readRows,disclosure} from './statistics.mjs';
import {rand} from '../operator-theory/lib/compare.mjs';
import {openPc,wasmSha256} from './lib/ca-reach.mjs';
import {pairedScores} from './lib/paired-scores.mjs';
import {arcs as expectedArcs} from './coverage.mjs';
import {inRegisteredOrder} from './lib/reference.mjs';
registration();
for(const [name,commit]of [['ENCOUNTERS.md','03491e6c679e91d33e66aed5959d325a8b97efe4'],['COVARIANCE.md','2748823']])if(execFileSync('git',['show',`${commit}:experiments/five-day-ca/${name}`],{encoding:'utf8'}).trim()!==fs.readFileSync(`experiments/five-day-ca/${name}`,'utf8').trim())throw Error('encounter registration changed');
const partArg=process.argv[process.argv.indexOf('--part')+1];
if(!process.argv.includes('--part')){const {runEncounterPool}=await import('./lib/encounter-pool.mjs');await runEncounterPool();process.exit(0);}
const [partIndex,partCount]=partArg.split('/').map(Number),runId=process.argv[process.argv.indexOf('--run-id')+1];
if(!Number.isInteger(partIndex)||partIndex<0||partIndex>=partCount||partCount!==12||!/^\d+$/.test(runId))throw Error('invalid encounter worker arguments');
const inputs={},covFile=`${store}/adapted-covariance.jsonl`,cov=new Map(fs.readFileSync(covFile,'utf8').split('\n').filter(Boolean).map(JSON.parse).map(r=>[`${r.labelSource}|${r.key}`,r]));inputs[covFile]=hash(fs.readFileSync(covFile));inputs["results/five-day-ca/covariance.json"]=hash(fs.readFileSync("results/five-day-ca/covariance.json"));
const all=[],arms=['AP','XP','F','S','GP'];let expectedProducts=0,covarianceProducts=0,gpProducts=0;
for(const label of ['regimes','truth2','truth']){
 const gp=new Map(readRows(dir('gp-products',label)).map(r=>[r.key,r]));
 for(const phase of ['fits','gp-products']){const d=dir(phase,label);if(fs.existsSync(d))for(const f of fs.readdirSync(d).filter(f=>/^rows-\d+\.jsonl$/.test(f)))inputs[`${d}/${f}`]=hash(fs.readFileSync(`${d}/${f}`));}
 for(const r of inRegisteredOrder(readRows(dir('fits',label)),'cheap',label,readRows)){const c=cov.get(`${label}|${r.key}`),g=gp.get(r.key);expectedProducts++;covarianceProducts+=!!c;gpProducts+=!!g;const arcs=expectedArcs({...r,group:label==='truth'?'T':r.group});for(const arc of arcs)all.push({key:r.key,object:r.norad,group:label==='truth'?'T':r.group,arc,cutoff:r.cutoff,cov:c,gp:g});}
}
const unresolved=new Map();const unresolvedError=(group,arm,error)=>{const key=JSON.stringify([group,arm,error]);if(!unresolved.has(key))unresolved.set(key,{group,arm,error,count:0});unresolved.get(key).count++;};for(const r of cov.values()){if(/not run|Cannot read properties|is not a function|is not defined/.test(r.error??''))unresolvedError(r.group,null,r.error);for(const [arm,a]of Object.entries(r.arms))if(/not run|Cannot read properties|is not a function|is not defined/.test(a.error??''))unresolvedError(r.group,arm,a.error);}for(const r of cov.values())for(const [arm,a]of Object.entries(r.arms))for(const v of Object.values(a.days??{}))if(/not run|Cannot read properties|is not a function|is not defined/.test(v.error??''))unresolvedError(r.group,arm,v.error);const unresolvedProductErrors=[...unresolved.values()];
const pc=await openPc(),groups=Map.groupBy(all,r=>`${r.group}|${r.arc}`),cells=[],paired=[],out=`${store}/encounters`;
fs.mkdirSync(out,{recursive:true});const rawFile=`${out}/${runId}-part-${partIndex}.jsonl`,raw=fs.openSync(rawFile,'w');
const gpDay=(r,day)=>r?.days[day]??(r?{error:r.error??'lead grid below 90%'}:undefined);
const valid=v=>v&&!v.error&&v.errorM?.length===3&&v.covarianceM2?.length===6&&v.errorM.every(Number.isFinite)&&v.covarianceM2.every(Number.isFinite);
try{for(const [tag,pool]of [...groups].filter((_,i)=>i%partCount===partIndex))for(const pair of ["fit x fit","fit x GP"]){const [group,arcText]=tag.split('|'),arc=+arcText,byDay=new Map(),scores=new Map();
 for(const day of config.leads)for(const arm of arms){const key=`${day}|${arm}`;byDay.set(key,{group,arc,arm,day,pair,gpReference:arm==='GP'?'GP x GP':null,disclosure:disclosure(group,day),expectedWindows:pool.length,draws:0,noPrimary:0,noSecondary:0,pcFailed:0,n:0,hits:0,missed:0,falseAlerts:0,brierSum:0,logSum:0,errors:{},labels:{}});}for(const day of config.leads)scores.set(day,[]);
 for(let k=0;k<20000;k++){
  const rng=rand(parseInt(crypto.createHash('sha256').update(`five-day-ca|${group}|${arc}|${k}`).digest('hex').slice(0,8),16));
  const day=config.leads[Math.floor(rng()*config.leads.length)],p=pool[Math.floor(rng()*pool.length)],secondary=pool.filter(s=>s.object!==p.object),u=rng(),s=secondary[Math.floor(u*secondary.length)];
  const theta=(10+160*rng())*Math.PI/180,miss=Math.exp(Math.log(10)+rng()*Math.log(500)),phi=2*Math.PI*rng(),co=Math.cos(theta/2),si=Math.sin(theta/2),hit=miss<20,draw={group,arc,pair,day,k,primary:p.key,secondary:s?.key??null,object:p.object,trueMissM:miss,hit,scores:{}};
  for(const arm of arms){const c=byDay.get(`${day}|${arm}`);c.draws++;const pv=arm==='GP'?gpDay(p.gp,day):p.cov?.arms[arm+arc]?.days?.[day],sv=(arm==='GP'||pair==='fit x GP')?gpDay(s?.gp,day):s?.cov?.arms[arm+arc]?.days?.[day];
   if(!valid(pv)){c.noPrimary++;const reason=pv?.error??(arm==='GP'?p.gp?.error:p.cov?.arms[arm+arc]?.error??p.cov?.error)??'product not run';c.errors[reason]=(c.errors[reason]??0)+1;continue;}
   if(!s||!valid(sv)){c.noSecondary++;const reason=!s?'no different-object secondary':sv?.error??((arm==='GP'||pair==='fit x GP')?s.gp?.error:s.cov?.arms[arm+arc]?.error??s.cov?.error)??'secondary product not run';c.errors[reason]=(c.errors[reason]??0)+1;continue;}
   const ep=pv.errorM,es=sv.errorM,a=pv.covarianceM2,b=sv.covarianceM2,xi=miss*Math.cos(phi)+co*(es[1]-ep[1])-si*(es[2]+ep[2]),zeta=miss*Math.sin(phi)+es[0]-ep[0];
   const covariance=[co*co*(a[2]+b[2])+si*si*(a[5]+b[5])+2*co*si*(a[4]-b[4]),co*(a[1]+b[1])+si*(a[3]-b[3]),a[0]+b[0]];
   try{const probability=await pc.pc(covariance,20,[xi,zeta]),alert=probability>=1e-4,brier=(probability-Number(hit))**2,log=hit?-Math.log(probability):-Math.log1p(-probability);c.n++;c.hits+=hit;c.missed+=hit&&!alert;c.falseAlerts+=!hit&&alert;c.brierSum+=brier;c.logSum+=log;for(const v of [pv,sv])c.labels[v.label]=(c.labels[v.label]??0)+1;draw.scores[arm]={pc:probability,brier,log,covarianceM2:covariance,predictedMissM:[xi,zeta]};}catch(e){c.pcFailed++;const reason=String(e.message);c.errors[reason]=(c.errors[reason]??0)+1;}
  }
  scores.get(day).push(draw);fs.writeSync(raw,JSON.stringify(draw,(_,v)=>v===Infinity?'Infinity':v===-Infinity?'-Infinity':v)+'\n');
 }
 for(const {brierSum,logSum,...c}of byDay.values())cells.push({...c,missedPerEncounter:c.n?c.missed/c.n:null,falsePerEncounter:c.n?c.falseAlerts/c.n:null,missedGivenHit:c.hits?c.missed/c.hits:null,falseGivenNonHit:c.n>c.hits?c.falseAlerts/(c.n-c.hits):null,brier:c.n?brierSum/c.n:null,log:c.n?logSum/c.n:null});
 for(const day of config.leads)for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++){const a=arms[i],b=arms[j],draws=scores.get(day),records=draws.filter(r=>r.scores[a]&&r.scores[b]).map(r=>({object:r.object,a:r.scores[a],b:r.scores[b]}));paired.push({group,arc,pair,day,contrast:`${a}-${b}`,disclosure:disclosure(group,day),draws:draws.length,unpaired:draws.length-records.length,...pairedScores(records,`${pair}|${tag}|${day}|${a}-${b}`)});}
 console.log(JSON.stringify({group,arc,pair,scored:cells.filter(c=>c.group===group&&c.arc===arc&&c.pair===pair).reduce((n,c)=>n+c.n,0)}));
}
 const result={provenance:analysisProvenance(),complete:expectedProducts===covarianceProducts&&expectedProducts===gpProducts&&unresolvedProductErrors.length===0,unresolvedProductErrors,expectedProducts,covarianceProducts,gpProducts,planCommit:'2748823',encounterPlanCommit:'03491e6c679e91d33e66aed5959d325a8b97efe4',rawFile,rawSha256:hash(fs.readFileSync(rawFile)),inputs,wasmSha256,arms,unmeasuredArms:[],uArm:'No covariance arm is specified for U; forecast and reach tables retain U.',bootstrap:{draws:10000,cluster:'primary object',interval:[.025,.975],limitation:'does not model additional secondary-object dependence'},scope:'same draws across five covariance arms and both A13 pair classes; GP primary is the repeated GP x GP reference; missing products and numerical failures counted; artificial rates',cells,paired};
 fs.writeFileSync(`${out}/${runId}-part-${partIndex}.json`,JSON.stringify(result,(_,v)=>v===Infinity?'Infinity':v===-Infinity?'-Infinity':v,2)+'\n');console.log(JSON.stringify({cells:cells.length,paired:paired.length,encounters:cells.reduce((n,c)=>n+c.n,0),complete:result.complete}));
}finally{fs.closeSync(raw);await pc.close();}
