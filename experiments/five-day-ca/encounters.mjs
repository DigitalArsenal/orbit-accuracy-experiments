// Paired artificial encounters; all states, RTN errors, carried covariances and Pc originate in modules.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {config,registration,analysisProvenance,hash} from './guard.mjs';
import {readRows,disclosure} from './statistics.mjs';
import {rand} from '../operator-theory/lib/compare.mjs';
import {openPc,wasmSha256} from './lib/ca-reach.mjs';
import {pairedScores} from './lib/paired-scores.mjs';
registration();
for(const [name,commit]of [['ENCOUNTERS.md','663355c'],['COVARIANCE.md','2748823']])if(execFileSync('git',['show',`${commit}:experiments/five-day-ca/${name}`],{encoding:'utf8'}).trim()!==fs.readFileSync(`experiments/five-day-ca/${name}`,'utf8').trim())throw Error('encounter registration changed');
const inputs={},covFile=`${config.store}/adapted-covariance.jsonl`,cov=new Map(fs.readFileSync(covFile,'utf8').split('\n').filter(Boolean).map(JSON.parse).map(r=>[`${r.labelSource}|${r.key}`,r]));inputs[covFile]=hash(fs.readFileSync(covFile));
const all=[],arms=['AP','XP','F','S','GP'];let expectedProducts=0,covarianceProducts=0,gpProducts=0;
for(const label of ['regimes','truth2','truth']){
 const gp=new Map(readRows(`${config.store}/gp-products/${label}`).map(r=>[r.key,r]));
 for(const phase of ['cheap','gp-products']){const dir=`${config.store}/${phase}/${label}`;if(fs.existsSync(dir))for(const f of fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f)))inputs[`${dir}/${f}`]=hash(fs.readFileSync(`${dir}/${f}`));}
 for(const r of readRows(`${config.store}/cheap/${label}`)){const c=cov.get(`${label}|${r.key}`),g=gp.get(r.key);expectedProducts++;covarianceProducts+=!!c;gpProducts+=!!g;const arcs=[...new Set(Object.keys(r.arms).map(a=>+a.match(/\d+/)[0]))];for(const arc of arcs)all.push({key:r.key,object:r.norad,group:label==='truth'?'T':r.group,arc,cutoff:r.cutoff,cov:c,gp:g});}
}
const pc=await openPc(),groups=Map.groupBy(all,r=>`${r.group}|${r.arc}`),cells=[],paired=[],out=`${config.store}/encounters`;
fs.mkdirSync(out,{recursive:true});const raw=fs.openSync(`${out}/calibrated-${Date.now()}.jsonl`,'w');
const valid=v=>v&&!v.error&&v.errorM?.every(Number.isFinite)&&v.covarianceM2?.every(Number.isFinite);
try{for(const [tag,pool]of groups){const [group,arcText]=tag.split('|'),arc=+arcText,byDay=new Map(),scores=new Map();
 for(const day of config.leads)for(const arm of arms){const key=`${day}|${arm}`;byDay.set(key,{group,arc,arm,day,pair:'same-arm x same-arm',disclosure:disclosure(group,day),draws:0,noPrimary:0,noSecondary:0,pcFailed:0,n:0,hits:0,missed:0,falseAlerts:0,brierSum:0,logSum:0,errors:{},labels:{}});}for(const day of config.leads)scores.set(day,[]);
 for(let k=0;k<20000;k++){
  const rng=rand(parseInt(crypto.createHash('sha256').update(`five-day-ca|${group}|${arc}|${k}`).digest('hex').slice(0,8),16));
  const day=config.leads[Math.floor(rng()*config.leads.length)],p=pool[Math.floor(rng()*pool.length)],secondary=pool.filter(s=>s.object!==p.object),u=rng(),s=secondary[Math.floor(u*secondary.length)];
  const theta=(10+160*rng())*Math.PI/180,miss=Math.exp(Math.log(10)+rng()*Math.log(500)),phi=2*Math.PI*rng(),co=Math.cos(theta/2),si=Math.sin(theta/2),hit=miss<20,draw={group,arc,day,k,primary:p.key,secondary:s?.key??null,object:p.object,trueMissM:miss,hit,scores:{}};
  for(const arm of arms){const c=byDay.get(`${day}|${arm}`);c.draws++;const pv=arm==='GP'?p.gp?.days[day]:p.cov?.arms[arm+arc]?.days?.[day],sv=arm==='GP'?s?.gp?.days[day]:s?.cov?.arms[arm+arc]?.days?.[day];
   if(!valid(pv)){c.noPrimary++;const reason=pv?.error??(arm==='GP'?p.gp?.error:p.cov?.arms[arm+arc]?.error??p.cov?.error)??'product not run';c.errors[reason]=(c.errors[reason]??0)+1;continue;}
   if(!s||!valid(sv)){c.noSecondary++;const reason=!s?'no different-object secondary':sv?.error??(arm==='GP'?s.gp?.error:s.cov?.arms[arm+arc]?.error??s.cov?.error)??'secondary product not run';c.errors[reason]=(c.errors[reason]??0)+1;continue;}
   const ep=pv.errorM,es=sv.errorM,a=pv.covarianceM2,b=sv.covarianceM2,xi=miss*Math.cos(phi)+co*(es[1]-ep[1])-si*(es[2]+ep[2]),zeta=miss*Math.sin(phi)+es[0]-ep[0];
   const covariance=[co*co*(a[2]+b[2])+si*si*(a[5]+b[5])+2*co*si*(a[4]-b[4]),co*(a[1]+b[1])+si*(a[3]-b[3]),a[0]+b[0]];
   try{const probability=await pc.pc(covariance,20,[xi,zeta]),alert=probability>=1e-4,brier=(probability-Number(hit))**2,log=hit?-Math.log(probability):-Math.log1p(-probability);c.n++;c.hits+=hit;c.missed+=hit&&!alert;c.falseAlerts+=!hit&&alert;c.brierSum+=brier;c.logSum+=log;for(const v of [pv,sv])c.labels[v.label]=(c.labels[v.label]??0)+1;draw.scores[arm]={pc:probability,brier,log};}catch(e){c.pcFailed++;const reason=String(e.message);c.errors[reason]=(c.errors[reason]??0)+1;}
  }
  scores.get(day).push(draw);fs.writeSync(raw,JSON.stringify(draw,(_,v)=>v===Infinity?'Infinity':v===-Infinity?'-Infinity':v)+'\n');
 }
 for(const {brierSum,logSum,...c}of byDay.values())cells.push({...c,missedPerEncounter:c.n?c.missed/c.n:null,falsePerEncounter:c.n?c.falseAlerts/c.n:null,missedGivenHit:c.hits?c.missed/c.hits:null,falseGivenNonHit:c.n>c.hits?c.falseAlerts/(c.n-c.hits):null,brier:c.n?brierSum/c.n:null,log:c.n?logSum/c.n:null});
 for(const day of config.leads)for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++){const a=arms[i],b=arms[j],draws=scores.get(day),records=draws.filter(r=>r.scores[a]&&r.scores[b]).map(r=>({object:r.object,a:r.scores[a],b:r.scores[b]}));paired.push({group,arc,day,contrast:`${a}-${b}`,disclosure:disclosure(group,day),draws:draws.length,unpaired:draws.length-records.length,...pairedScores(records,`${tag}|${day}|${a}-${b}`)});}
 console.log(JSON.stringify({group,arc,scored:cells.filter(c=>c.group===group&&c.arc===arc).reduce((n,c)=>n+c.n,0)}));
}
 const result={provenance:analysisProvenance(),complete:expectedProducts===covarianceProducts&&expectedProducts===gpProducts,expectedProducts,covarianceProducts,gpProducts,planCommit:'2748823',inputs,wasmSha256,arms,unmeasuredArms:[],uArm:'No covariance arm is specified for U; forecast and reach tables retain U.',bootstrap:{draws:10000,cluster:'primary object',interval:[.025,.975],limitation:'does not model additional secondary-object dependence'},scope:'same draws across five covariance arms; missing products and numerical failures counted; artificial rates',cells,paired};
 fs.writeFileSync('results/five-day-ca/encounters.json',JSON.stringify(result,(_,v)=>v===Infinity?'Infinity':v===-Infinity?'-Infinity':v,2)+'\n');console.log(JSON.stringify({cells:cells.length,paired:paired.length,encounters:cells.reduce((n,c)=>n+c.n,0),complete:result.complete}));
}finally{fs.closeSync(raw);await pc.close();}
