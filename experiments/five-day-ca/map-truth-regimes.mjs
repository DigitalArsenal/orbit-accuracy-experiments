// Registered truth-window regime lookup, through gp-error-model's state classifier.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {config,registration,hash} from './guard.mjs';
import {readRows} from './statistics.mjs';
import {config as sourceConfig,XM,control,DAY} from '../xp2-fit-design/common.mjs';
import * as T from '../xp-atmosphere-merit/lib/truth.mjs';
registration();
const label=control?'truth2':'truth',dir=path.join(config.modulesRoot,'analysis/gp-error-model');
const pin='9635bfd1982874735cc40e6d646ed76fc417d595294f6834c7026da5fa034b73';
if(hash(fs.readFileSync(path.join(dir,'dist/isomorphic/module.wasm')))!==pin)throw Error('regime module changed');
const {call,json}=await import(pathToFileURL(path.join(dir,'tests/erm-harness.mjs')).href);
const model=JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/model.json'));
const definitions=control?Object.values(XM.config.groups).flatMap(g=>g.objects):sourceConfig.objects;
const objects=[],inputs={};
for(const r of readRows(`${config.store}/cheap/${label}`).filter(r=>!control||r.group==='P').sort((a,b)=>a.norad-b.norad||a.cutoff.localeCompare(b.cutoff))){
 const o=definitions.find(o=>o.norad===r.norad);if(!o)throw Error('missing registered object');
 const end=Date.parse(r.cutoff),from=end-2*3600000;
 for(const f of T.productFiles(o).filter(f=>f.stopMs>=from-DAY&&f.startMs<=end))if(!inputs[f.file])inputs[f.file]=hash(fs.readFileSync(f.file));
 const line=T.series(o,from,end).lines.at(-1);if(!line)continue;
 objects.push({id:r.key,state:{position:line.r.map(x=>x*1000),velocity:line.v.map(x=>x*1000)},horizonDays:1,covariance:[1,0,1,0,0,1],covarianceAxes:'RTN'});
}
const results=[];
for(let i=0;i<objects.length;i+=250){const r=await call('calibrate_covariance',[json('model',{kind:'e14-factors',version:'five-day-regime-only',regimes:model.regimes,strata:[{regime:'*',horizonDays:[0,8],factor:1,status:'UNCALIBRATED'}]}),json('objects',{objects:objects.slice(i,i+250)})]);results.push(...r.objects);}
const target=`${config.store}/gp-regimes.json`,saved=JSON.parse(fs.readFileSync(target));
Object.assign(saved.inputs,inputs);Object.assign(saved.mappings,Object.fromEntries(results.map(r=>[r.id,r.regime])));
fs.writeFileSync(target,JSON.stringify(saved,null,2)+'\n');console.log(JSON.stringify({source:label,requested:objects.length,mapped:results.filter(r=>r.regime).length}));
