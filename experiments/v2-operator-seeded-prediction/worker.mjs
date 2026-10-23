import {openWasm,reducedForces,operatorFit} from './wasm.mjs';
import {Fetcher,cut,dcaAt} from './inputs.mjs';
import {config,H,iso,moduleRoot,sha256} from './common.mjs';
let wasm;
const send=value=>process.send(value);
process.on('message',async message=>{
  const cpuStart=process.cpuUsage();
  try {
    if(message.kind==='init') {
      const fetcher=new Fetcher();wasm=await openWasm(moduleRoot(),fetcher);
      send({ready:true,provenance:wasm.provenance,weatherBytes:fetcher.bytes,weatherRequests:fetcher.requests});return;
    }
    if(message.kind==='close'){await wasm?.destroy();process.exit(0);}
    const {norad,source,issueMs,mechanics}=message;
    let arc=cut(Buffer.from(message.bytes));message.bytes=null;
    if(arc.points[0].ms%60000!==42000)throw new Error('unregistered source epoch grid; amendment required');
    if(Date.parse(arc.createdUtc)>issueMs||Date.parse(source.retrievedUtc)>issueMs)throw new Error('future source at issue');
    const points=await wasm.normalize(arc.points);arc.points=null;
    const epochs=config.horizonsHours.flatMap(h=>Array.from({length:15},(_,i)=>issueMs+h*H+42000+i*60000));
    // Refuse missing causal drivers before spending CPU on a fit.
    wasm.assertCoverage(points[0].ms,epochs.at(-1));
    const dca=dcaAt(Math.min(issueMs,Date.parse(source.retrievedUtc)));
    const record={version:1,norad,issueUtc:iso(issueMs),source:{...source,createdUtc:arc.createdUtc,startUtc:arc.startUtc,stopUtc:arc.stopUtc},fitWindow:{start:iso(points[0].ms),end:iso(points.at(-1).ms),points:points.length,joinExcluded:true},arms:{},mechanics:null};
    for(const arm of [1,2,3]) {
      if(arm===2&&!dca){record.arms[arm]={status:'UNAVAILABLE',reason:'no causal Dove DCL'};continue;}
      console.error(`object=${norad} arm=${arm} fit-start`);
      const fitted=await wasm.fit(points,norad,arm,arm===2?dca:null);
      console.error(`object=${norad} arm=${arm} fit-complete CPU=${fitted.cpuSeconds}`);
      fitted.fitId=sha256(JSON.stringify({source:source.sha256,arm,issueMs,config:config.experiment,product:fitted.product,dca:fitted.dca}));
      const prediction=await wasm.predict(fitted,epochs,arm===2?dca:null);
      record.arms[arm]={status:fitted.fit.converged?'FITTED':'NONCONVERGED',...fitted,prediction};
    }
    // Arm 4 and 5 call the landed typed OD bridge only when present.
    record.arms[4]=dca?await operatorFit(moduleRoot(),{mode:'kappa-drag',points,norad,issueMs,densityCorrection:dca.frame,epochs}):{status:'UNAVAILABLE',reason:'no causal Dove DCL'};
    record.arms[5]={status:'UNAVAILABLE',reason:'conditional on E13b Starlink DCA and landed operator fit'};
    const forecastEpochs=epochs.filter(t=>arc.forecast.has(t));
    const forecast=await wasm.normalize(forecastEpochs.map(ms=>({ms,state:arc.forecast.get(ms)})));
    record.arms[6]={status:'FORECAST',prediction:{samples:forecast.map(s=>({...s,covariance:null}))},outsideSpan:epochs.length-forecast.length};
    arc.forecast.clear();arc=null;
    record.arms['sgp4-fit']={status:'UNAVAILABLE',reason:'current OD SGP4 method fixes a 11520 s fit window; 48 h contract pending'};
    record.arms['sgp4-gp']={status:'UNAVAILABLE',reason:'causal CelesTrak baseline capture not configured'};
    if(mechanics) {
      const fitted=record.arms[1], target=issueMs+6*H;
      const full=await wasm.predict(fitted,[target]),ablations=[];
      for(const term of config.trimming.candidates) {
        const forces=reducedForces(term),reduced=await wasm.predict(fitted,[target],null,forces);
        const [comparison]=await wasm.pairStatistics([{predicted:reduced.samples[0],truth:full.samples[0].state}]);
        ablations.push({term,forces,comparison,cpuSeconds:reduced.cpuSeconds});
      }
      const repeat=await wasm.predict(fitted,[target]);
      const [repeatComparison]=await wasm.pairStatistics([{predicted:repeat.samples[0],truth:full.samples[0].state}]);
      record.mechanics={horizonHours:6,fullCpuSeconds:full.cpuSeconds,repeatCpuSeconds:repeat.cpuSeconds,repeatComparison,ablations,accuracyDecision:'NOT SCORED: prospective truth/window unavailable'};
    }
    const cpuUsed=process.cpuUsage(cpuStart);record.totalCpuSeconds=(cpuUsed.user+cpuUsed.system)/1e6;send({record});
  }catch(error){const used=process.cpuUsage(cpuStart);send({error:{message:error.message,stack:error.stack,fatal:!!error.fatal,cpuSeconds:(used.user+used.system)/1e6}});}
});
