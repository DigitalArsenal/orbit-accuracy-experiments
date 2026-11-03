import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {config,registration,analysisProvenance,hash} from './guard.mjs';
import {mergedRows,disclosure,inputHashes} from './statistics.mjs';
import {openPc,wasmSha256} from './lib/ca-reach.mjs';
import {quantile} from './lib/statistics.mjs';
registration();
const rel='experiments/five-day-ca/CA-PLAN.md';
if(execFileSync('git',['show',`d3c15e2:${rel}`],{encoding:'utf8'}).trim()!==fs.readFileSync(rel,'utf8').trim())throw Error('CA plan changed');
const model=JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/model.json'));
const cal=JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/calibration.json'));
const band={S1:2,GN:6,IG:7,GE:7,HE:9,HX:9};
const mapping=JSON.parse(fs.readFileSync(`${config.store}/gp-regimes.json`));
const rows=mergedRows(),pc=await openPc(),cells=new Map(),cache=new Map();
const out=`${config.store}/ca`;fs.mkdirSync(out,{recursive:true});
const raw=fs.openSync(`${out}/rows-${Date.now()}.jsonl`,'w');
const project=(a,b)=>[.5*(a[2]+b[2]),Math.SQRT1_2*(a[1]+b[1]),a[0]+b[0]];
const gp=(row,day)=>{
 const group=row.group,regime=mapping.mappings[row.key]??model.regimes[band[group]]?.id;
 const s=model.strata.find(s=>s.regime===regime&&day>s.ageDays[0]&&day<=s.ageDays[1]);
 if(!s)return null;
 const c=cal.strata.find(c=>c.regimeIndex===s.regimeIndex&&c.ageIndex===s.ageIndex),p=s.clipped.covariance;
 if(!p)return null;
 const scale=c?.label==='CALIBRATED'?c.scaleFactors:[1,1,1];
 return {cov:[p[0]*scale[0]**2*1e6,p[1]*scale[0]*scale[1]*1e6,p[2]*scale[1]**2*1e6],label:c?.label??'UNCALIBRATED',regime:s.regime};
};
async function evaluate(cov,hbr){const key=JSON.stringify([cov,hbr]);if(!cache.has(key))cache.set(key,await pc.pc(cov,hbr));return cache.get(key);}
const oracle=[];
for(const [v,hbr] of [[10000,10],[2500,100]]){const actual=await pc.pc([v,0,v],hbr),expected=-Math.expm1(-hbr*hbr/(2*v));if(Math.abs(actual-expected)>1e-12)throw Error('zero-miss oracle failure');oracle.push({actual,expected,absoluteError:Math.abs(actual-expected)});}
try{
 for(const r of rows)for(const [arm,a] of Object.entries(r.arms))for(const [d,v] of Object.entries(a.days??{})){
  const day=+d,G=gp(r,day),fit=[v.r*v.r*1e6,0,v.t*v.t*1e6];
  for(const pair of ['fit x fit','fit x GP','GP x GP'])for(const hbr of [10,20,50,100]){
   const k=[r.group,arm,day,pair,hbr].join('|');
   if(!cells.has(k))cells.set(k,{group:r.group,arm,day,pair,hbr,disclosure:disclosure(r.group,day),gpLabel:pair==='fit x fit'?null:G?.label??'MISSING ALTITUDE MAPPING',gpLabels:{},regimeCounts:{},attempted:0,excluded:0,errors:{},values:[]});
   const c=cells.get(k);c.attempted++;if(pair!=='fit x fit'){const label=G?.label??'MISSING';c.gpLabels[label]=(c.gpLabels[label]??0)+1;if(G)c.regimeCounts[G.regime]=(c.regimeCounts[G.regime]??0)+1;}
   try{
    if(pair!=='fit x fit'&&!G)throw Error('missing GP altitude mapping');
    const cov=project(pair==='GP x GP'?G.cov:fit,pair==='fit x fit'?fit:G.cov);
    const ceiling=await evaluate(cov,hbr);
    c.values.push(ceiling);
    fs.writeSync(raw,JSON.stringify({key:r.key,group:r.group,arm,day,pair,hbr,cov,ceiling})+'\n');
   }catch(e){c.excluded++;const reason=String(e.message).slice(0,120);c.errors[reason]=(c.errors[reason]??0)+1;}
  }
 }
 const alfanoAtZero=await pc.pc([10000,0,10000],10,[0,0],true);
 const result={provenance:analysisProvenance(),inputs:inputHashes(),wasmSha256,regimeMappingSha256:hash(fs.readFileSync(`${config.store}/gp-regimes.json`)),planCommit:'d3c15e2',oracle,alfanoAtZero,geometry:'90 degree crossing; R/T plane; independent members',cells:[...cells.values()].map(({values,...c})=>({...c,gpLabel:c.pair==='fit x fit'?null:Object.keys(c.gpLabels).sort().join('/'),n:values.length,medianCeiling:quantile(values,.5),p10:quantile(values,.1),p90:quantile(values,.9),reach1e4:values.length?values.filter(x=>x>=1e-4).length/values.length:null,reach1e5:values.length?values.filter(x=>x>=1e-5).length/values.length:null,alfanoMaximumAtZero:alfanoAtZero}))};
 fs.writeFileSync('results/five-day-ca/ca-reach.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({cells:result.cells.length,oracle,alfanoAtZero}));
}finally{fs.closeSync(raw);await pc.close();}
