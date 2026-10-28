import fs from 'node:fs';
import path from 'node:path';
import { config,options,newRun,write,cpu } from './common.mjs';
import { wire } from './wire.mjs';
import { windows,loadArc } from './truth.mjs';
import { environment } from './environment.mjs';
import { engines } from './engines.mjs';

const opts=options(),run=newRun(opts),W=await wire(run.modules),env=await environment(run,W),m=await engines(run,W);
const selected=windows().filter(w=>!opts.only || opts.only.split(',').includes(w.key));
if(!selected.length)throw new Error('no registered windows selected');
try{
  for(const w of selected){
    const file=path.join(run.dir,'rows',`${w.key}.json`);
    const row={key:w.key,norad:w.norad,family:w.family,nominalDate:w.date,arms:{}};
    const arc=loadArc(w,run,W);Object.assign(row,{issue:arc.issue,fitSamples:arc.fit?.length??0,leads:arc.leads,audit:arc.audit});
    if(arc.excluded){row.excluded=arc.excluded;write(file,row);console.log(`${w.key}: EXCLUDED ${arc.excluded}`);continue;}
    const inputs=env(arc);row.weather=inputs.audit;
    for(const arm of config.arms){
      const t=performance.now(),c=cpu();
      try{row.arms[arm]=await m.predict(arm,w,arc,inputs);}catch(error){row.arms[arm]={ok:false,error:String(error.stack||error).slice(0,1600),attemptWallSeconds:(performance.now()-t)/1000,attemptCpuSeconds:cpu()-c};}
      console.log(`${w.key} ${arm}: ${row.arms[arm].ok?'OK':'FAIL '+row.arms[arm].error.split('\n')[0]} (${((performance.now()-t)/1000).toFixed(1)}s)`);
      write(file,row);run.save();
    }
  }
}finally{await m.close();run.finish();}
