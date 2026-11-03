// Partial S fit x fit encounters. Every signed error is a module output; Pc is a module call.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {config,registration,hash} from './guard.mjs';
import {readRows,disclosure} from './statistics.mjs';
import {rand} from '../operator-theory/lib/compare.mjs';
import {openPc,wasmSha256} from './lib/ca-reach.mjs';
registration();
const plan='experiments/five-day-ca/ENCOUNTERS.md';
if(execFileSync('git',['show',`663355c:${plan}`],{encoding:'utf8'}).trim()!==fs.readFileSync(plan,'utf8').trim())throw Error('encounter plan changed');
const inputs={},signed=new Map(),all=[];
for(const label of ['regimes','truth2','truth']){
 const dir=`${config.store}/cheap/${label}`;
 for(const f of fs.readdirSync(dir).filter(f=>/^encounter-errors-\d+\.jsonl$/.test(f))){const file=`${dir}/${f}`,data=fs.readFileSync(file,'utf8');inputs[file]=hash(data);for(const line of data.split('\n').filter(Boolean)){const r=JSON.parse(line);if(!/^S\d+$/.test(r.arm??''))continue;for(const [d,v]of Object.entries(r.days))signed.set(`${label}|${r.key}|${r.arm}|${d}`,v);}}
 for(const f of fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f)))inputs[`${dir}/${f}`]=hash(fs.readFileSync(`${dir}/${f}`));
 for(const r of readRows(dir))for(const [arm,a]of Object.entries(r.arms).filter(([a])=>/^S\d+$/.test(a)))for(const [d,v]of Object.entries(a.days??{}))all.push({key:r.key,object:r.norad,group:label==='truth'?'T':r.group,arc:+arm.slice(1),day:+d,cutoff:r.cutoff,rms:v,vector:signed.get(`${label}|${r.key}|${arm}|${d}`)});
}
const pc=await openPc(),groups=Map.groupBy(all,r=>`${r.group}|${r.arc}`),cells=[],out=`${config.store}/encounters`;
fs.mkdirSync(out,{recursive:true});const raw=fs.openSync(`${out}/S-${Date.now()}.jsonl`,'w');
try{
 for(const [tag,rows]of groups){
  const [group,arcText]=tag.split('|'),arc=+arcText,byDay=new Map(config.leads.map(day=>[day,{group,arc,arm:'S',day,pair:'fit x fit',covariance:'RMS STAND-IN',disclosure:disclosure(group,day),expectedWindows:rows.filter(r=>r.day===day).length,vectorWindows:rows.filter(r=>r.day===day&&r.vector).length,draws:0,noPrimary:0,noSecondary:0,pcFailed:0,n:0,hits:0,missed:0,falseAlerts:0,brierSum:0,logSum:0}]));
  const pools=new Map(config.leads.map(day=>[day,rows.filter(r=>r.day===day&&r.vector)]));
  for(let k=0;k<20000;k++){
   const rng=rand(parseInt(crypto.createHash('sha256').update(`five-day-ca|${group}|${arc}|${k}`).digest('hex').slice(0,8),16));
   const day=config.leads[Math.floor(rng()*config.leads.length)],c=byDay.get(day),pool=pools.get(day);c.draws++;
   if(!pool.length){c.noPrimary++;continue;}const p=pool[Math.floor(rng()*pool.length)],secondary=pool.filter(s=>s.object!==p.object),u=rng();
   if(!secondary.length){c.noSecondary++;continue;}const s=secondary[Math.floor(u*secondary.length)];
   const theta=(10+160*rng())*Math.PI/180,miss=Math.exp(Math.log(10)+rng()*Math.log(500)),phi=2*Math.PI*rng(),co=Math.cos(theta/2),si=Math.sin(theta/2);
   const ep=p.vector.rtnKm.map(x=>x*1000),es=s.vector.rtnKm.map(x=>x*1000);
   const xi=miss*Math.cos(phi)+co*(es[1]-ep[1])-si*(es[2]+ep[2]),zeta=miss*Math.sin(phi)+es[0]-ep[0];
   const cov=[(co*co*(p.rms.t**2+s.rms.t**2)+si*si*(p.rms.n**2+s.rms.n**2))*1e6,0,(p.rms.r**2+s.rms.r**2)*1e6];
   try{
    const probability=await pc.pc(cov,20,[xi,zeta]),hit=miss<20,alert=probability>=1e-4,brier=(probability-Number(hit))**2,log=hit?-Math.log(probability):-Math.log1p(-probability);
    c.n++;c.hits+=hit;c.missed+=hit&&!alert;c.falseAlerts+=!hit&&alert;c.brierSum+=brier;c.logSum+=log;
    fs.writeSync(raw,JSON.stringify({group,arc,day,k,primary:p.key,secondary:s.key,trueMissM:miss,pc:probability,hit,brier,log:Number.isFinite(log)?log:'Infinity'})+'\n');
   }catch(e){c.pcFailed++;fs.writeSync(raw,JSON.stringify({group,arc,day,k,error:String(e.message)})+'\n');}
  }
  for(const {brierSum,logSum,...c}of byDay.values())cells.push({...c,missedPerEncounter:c.n?c.missed/c.n:null,falsePerEncounter:c.n?c.falseAlerts/c.n:null,missedGivenHit:c.hits?c.missed/c.hits:null,falseGivenNonHit:c.n>c.hits?c.falseAlerts/(c.n-c.hits):null,brier:c.n?brierSum/c.n:null,log:c.n?(Number.isFinite(logSum)?logSum/c.n:'Infinity'):null});
 }
 const result={complete:false,planCommit:'663355c',inputs,wasmSha256,unmeasuredArms:['AP','XP','F','U','GP'],pairedScoreIntervals:'unmeasured: no paired carried covariance products',scope:'S fit x fit; only windows with archived signed module errors; missing windows explicitly counted',cells};
 fs.writeFileSync('results/five-day-ca/encounters.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({cells:cells.length,encounters:cells.reduce((n,c)=>n+c.n,0),pcFailures:cells.reduce((n,c)=>n+c.pcFailed,0),complete:false}));
}finally{fs.closeSync(raw);await pc.close();}
