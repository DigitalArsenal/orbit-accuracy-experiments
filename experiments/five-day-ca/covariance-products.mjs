import fs from 'node:fs';
import crypto from 'node:crypto';
import {config,registration,manifest} from './guard.mjs';
import {readRows} from './statistics.mjs';
import {openPairStatistics,openApCovariance,openFfmCovariance,covarianceConfig} from './lib/covariance-modules.mjs';
import {pC2} from '../ffm-covariance-adaptive/lib/model.mjs';
registration();
const args=Object.fromEntries(process.argv.slice(2).filter((_,i)=>i%2===0).map((k,i)=>[k.slice(2),process.argv.slice(2)[2*i+1]]));
const label=args.label??'regimes',[shard,nshards]=(args.shard??'0/1').split('/').map(Number),out=`${config.store}/covariance/${label}`;
fs.mkdirSync(out,{recursive:true});manifest(out,shard);
const load=(phase,prefix)=>{const dir=`${config.store}/${phase}/${label}`;return fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>new RegExp(`^${prefix}-\\d+\\.jsonl$`).test(f)).sort().flatMap(f=>fs.readFileSync(`${dir}/${f}`,'utf8').split('\n').filter(Boolean).map(JSON.parse)):[];};
const endpoints=new Map(load('products','endpoints').map(r=>[r.key,r]));
const omms=new Map(load('products','omm-products').map(r=>[r.key+'|'+r.arm,r]));
const fits=new Map(load('ffm','fit-products').map(r=>[r.key+'|'+r.arm,r]));
const signed=new Map(load('products','encounter-errors').map(r=>[r.key+'|'+r.arm,r]));
const baseline=readRows(`${config.store}/cheap/${label}`),ff=new Map(readRows(`${config.store}/ffm/${label}`).map(r=>[r.key,r]));
const completed=new Set(readRows(out).map(r=>r.key));
const mapping=JSON.parse(fs.readFileSync(`${config.store}/gp-regimes.json`)).mappings;
const model=JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/model.json'));
const band={S1:2,GN:6,IG:7,GE:7,HE:9,HX:9};
const c2=JSON.parse(fs.readFileSync('results/ffm-covariance-calibration/frozen-constants.json')).classes;
const xp=JSON.parse(fs.readFileSync('results/ffm-covariance-calibration/sgp4xp/frozen-constants.json')).classes;
const pairs=await openPairStatistics(),ap=await openApCovariance(),fm=await openFfmCovariance(pairs);
try{for(const base of baseline){if((args.key&&base.key!==args.key)||completed.has(base.key)||parseInt(crypto.createHash('sha256').update(base.key).digest('hex').slice(0,8),16)%nshards!==shard)continue;
 const group=label==='truth'?'T':base.group,endpoint=endpoints.get(base.key),regime=mapping[base.key]??model.regimes[band[group]]?.id,ri=model.regimes.findIndex(r=>r.id===regime),cls=ri>=0&&ri<2?'R1-O':ri>=2&&ri<5?'R2-O':'R3';
 const row={key:base.key,group,norad:base.norad,name:base.name,cutoff:base.cutoff,regime,class:cls,label:'frozen covariance transfer; seven-day extrapolation',fitAvailableAt:endpoint?.fitAvailableAt??null,arms:{}};
 if(!endpoint){row.error=base.error??'endpoint products not run';fs.appendFileSync(`${out}/rows-${shard}.jsonl`,JSON.stringify(row)+'\n');continue;}
 const arms={...base.arms,...ff.get(base.key)?.arms};
 for(const [arm,a]of Object.entries(arms)){if(arm.startsWith('U'))continue;const ends=endpoint.ends.filter(e=>a.days?.[e.day]);const record={days:{}};row.arms[arm]=record;if(!ends.length){record.error=a.error??'no scored lead';continue;}
 try{
  if(arm.startsWith('AP')||arm.startsWith('XP')){const product=omms.get(base.key+'|'+arm);if(!product)throw Error('fit OMM not run');const states=await ap.carry(product,ends);const stats=await pairs.stats(states.map((predicted,i)=>({predicted,truth:{position:ends[i].r.map(x=>x*1000),velocity:ends[i].v.map(x=>x*1000)}})));
   for(let i=0;i<ends.length;i++){const k=ends[i].day,p=arm.startsWith('XP')?xp[cls==='R1-O'?'R1':'LP'].parameters:null;const cov=p?pC2(p,{A:stats[i].predictedRtn}):stats[i].predictedRtn;record.days[k]={epoch:ends[i].epoch,predictedState:{position:states[i].position,velocity:states[i].velocity},truthState:{position:ends[i].r.map(x=>x*1000),velocity:ends[i].v.map(x=>x*1000)},errorM:stats[i].errorRtn,covarianceM2:cov,availableAt:ends[i].availableAt,label:p?`C2 fairness ${cls==='R1-O'?'R1':'LP'} transfer`:`AP ${covarianceConfig.apNoise.version} UNVERIFIED`};}
  }else if(arm.startsWith('S')){const errors=signed.get(base.key+'|'+arm);for(const e of ends){const v=errors?.days?.[e.day];if(!v)throw Error('signed S endpoint not run');record.days[e.day]={epoch:e.epoch,errorM:v.rtnKm.map(x=>x*1000),covarianceM2:[a.days[e.day].r**2,0,a.days[e.day].t**2,0,0,a.days[e.day].n**2].map(x=>x*1e6),label:'RMS STAND-IN'};}}
  else if(arm.startsWith('F')){const product=fits.get(base.key+'|'+arm);if(!product)throw Error('FFM fit product not run');const terms=await fm.terms(product,base.cutoff,ends);record.chi=product.fit.reducedChiSquare;for(let i=0;i<ends.length;i++){const e=ends[i],t=terms.leads[i];record.days[e.day]={epoch:e.epoch,predictedState:t.predictedState,truthState:t.truthState,errorM:t.errRtnM,covarianceM2:pC2(c2[cls].parameters,t.terms),terms:t.terms,truthSigmaM:e.sigma??null,availableAt:e.availableAt,label:`C2 ${cls}; C3 adaptation pending`};}}
 }catch(error){record.error=String(error.message).slice(0,300);console.error(JSON.stringify({key:base.key,arm,error:String(error.stack??error)}));}
 }
 fs.appendFileSync(`${out}/rows-${shard}.jsonl`,JSON.stringify(row)+'\n');
}}finally{await ap.close();await fm.close();await pairs.close();}
