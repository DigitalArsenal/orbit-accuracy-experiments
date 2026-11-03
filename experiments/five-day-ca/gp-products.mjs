import fs from 'node:fs';
import crypto from 'node:crypto';
import {config,registration,manifest} from './guard.mjs';
import {readRows} from './statistics.mjs';
import {openModules} from '../xp-atmosphere-merit/lib/modules.mjs';
import {setAt,epochMs} from '../e4-operator-ephemeris-parity/products.mjs';
registration();
const args=Object.fromEntries(process.argv.slice(2).filter((_,i)=>i%2===0).map((k,i)=>[k.slice(2),process.argv.slice(2)[2*i+1]]));
const label=args.label??'regimes',[shard,nshards]=(args.shard??'0/1').split('/').map(Number),out=`${config.store}/gp-products/${label}`;
fs.mkdirSync(out,{recursive:true});manifest(out,shard);
const dir=`${config.store}/products/${label}`,ends=new Map(fs.readdirSync(dir).filter(f=>/^endpoints-\d+\.jsonl$/.test(f)).flatMap(f=>fs.readFileSync(`${dir}/${f}`,'utf8').split('\n').filter(Boolean).map(JSON.parse)).map(r=>[r.key,r]));
const sets=new Map();for(const f of fs.readdirSync(`${config.store}/gp-sets`).filter(f=>f.endsWith('.json')))for(const s of JSON.parse(fs.readFileSync(`${config.store}/gp-sets/${f}`)).sets){if(!sets.has(s.norad))sets.set(s.norad,[]);sets.get(s.norad).push(s);}
const model=JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/model.json')),cal=JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/calibration.json')),mapping=JSON.parse(fs.readFileSync(`${config.store}/gp-regimes.json`)).mappings,band={S1:2,GN:6,IG:7,GE:7,HE:9,HX:9};
const done=new Set(readRows(out).map(r=>r.key)),modules=await openModules();
try{for(const base of readRows(`${config.store}/cheap/${label}`)){if((args.key&&base.key!==args.key)||done.has(base.key)||parseInt(crypto.createHash('sha256').update(base.key).digest('hex').slice(0,8),16)%nshards!==shard)continue;
 const group=label==='truth'?'T':base.group,row={key:base.key,norad:base.norad,name:base.name,cutoff:base.cutoff,group,days:{}},ep=ends.get(base.key),set=setAt(sets.get(+base.norad),Date.parse(base.cutoff));
 if(!ep?.ends.length)row.error=base.error??'no endpoint truth';else if(!set)row.error='no cutoff-available public SGP4 set';else{
  row.setEpoch=set.epoch;row.creationDate=set.creationDate;row.regime=mapping[base.key]??model.regimes[band[group]]?.id;
  for(const e of ep.ends){const age=(Date.parse(e.epoch)-epochMs(set.epoch))/86400000,stratum=model.strata.find(s=>s.regime===row.regime&&age>=s.ageDays[0]&&(age<s.ageDays[1]||(age===7&&s.ageDays[1]===7))),d={epoch:e.epoch,ageDays:age};row.days[e.day]=d;
   if(!stratum?.clipped?.covariance){d.error='GP covariance age/regime outside model';continue;}
   const c=cal.strata.find(c=>c.regimeIndex===stratum.regimeIndex&&c.ageIndex===stratum.ageIndex),p=stratum.clipped.covariance,scale=c?.label==='CALIBRATED'?c.scaleFactors:[1,1,1];d.label=c?.label??'UNCALIBRATED';d.ageBin=stratum.ageDays;
   d.covarianceM2=[p[0]*scale[0]**2,p[1]*scale[0]*scale[1],p[2]*scale[1]**2,p[3]*scale[0]*scale[2],p[4]*scale[1]*scale[2],p[5]*scale[2]**2].map(x=>x*1e6);
   try{const [state]=await modules.propagateSgp4(set,base.norad,[Date.parse(e.epoch)],300);if(!state)throw Error('SGP4 no endpoint');const gcrf=await modules.toAxes([state],[e.epoch],'GCRF');d.errorM=(await modules.rtn(gcrf,[e]))[0].map(x=>x*1000);}catch(error){d.error=String(error.message).slice(0,300);}
  }
 }
 fs.appendFileSync(`${out}/rows-${shard}.jsonl`,JSON.stringify(row)+'\n');
}}finally{await modules.close();}
