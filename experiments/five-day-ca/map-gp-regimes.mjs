// Classify registered LS/DO window states through gp-error-model; no JS orbital physics.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {config,registration,hash,allowed} from './guard.mjs';
import {readRows} from './statistics.mjs';
import {STATIC,windowKey} from '../operator-theory/lib/regimes.mjs';
import {chain} from '../sdn-gp-starlink-ffm-match/lib/sources.mjs';
registration();
const dir=path.join(config.modulesRoot,'analysis/gp-error-model');
const wasmSha256='9635bfd1982874735cc40e6d646ed76fc417d595294f6834c7026da5fa034b73';
if(hash(fs.readFileSync(path.join(dir,'dist/isomorphic/module.wasm')))!==wasmSha256)throw Error('regime module changed');
const {call,json}=await import(pathToFileURL(path.join(dir,'tests/erm-harness.mjs')).href);
const model=JSON.parse(fs.readFileSync('/opt/data/sdn-archive/gp-error-model/2026-08/model.json'));
const rows=readRows(`${config.store}/cheap/regimes`),objects=[],inputs={};
for(const o of STATIC.filter(o=>['LS','DO'].includes(o.group)&&o.name!=='stella')){
 const known=rows.filter(r=>r.group===o.group&&r.name.toLowerCase()===o.name.toLowerCase());
 if(!known.length)continue;
 const files=o.files();for(const file of files)inputs[file]=hash(fs.readFileSync(file));
 const s=chain(files);
 if(!allowed(s.norad,s.name,Date.parse(known[0].cutoff)))throw Error('regime input excluded');
 for(const r of known){const line=s.lines.findLast(l=>Date.parse(l.epoch)<=Date.parse(r.cutoff));if(!line)continue;objects.push({id:r.key,state:{position:line.r.map(x=>1000*x),velocity:line.v.map(x=>1000*x)},horizonDays:1,covariance:[1,0,1,0,0,1],covarianceAxes:'RTN'});}
}
const result=await call('calibrate_covariance',[json('model',{kind:'e14-factors',version:'five-day-regime-only',regimes:model.regimes,strata:[{regime:'*',horizonDays:[0,8],factor:1,status:'UNCALIBRATED'}]}),json('objects',{objects})]);
const mappings=Object.fromEntries(result.objects.map(o=>[o.id,o.regime]));
fs.writeFileSync(`${config.store}/gp-regimes.json`,JSON.stringify({wasmSha256,inputs,mappings},null,2)+'\n');
console.log(JSON.stringify({requested:objects.length,mapped:Object.values(mappings).filter(Boolean).length,regimes:[...new Set(Object.values(mappings))]}));
