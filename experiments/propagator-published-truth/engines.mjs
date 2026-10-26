import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadModule } from '../../harness/modules.mjs';
import { fitOrbit, propagateFit } from '../e6-public-observations/fit.mjs';
import { estimationCodec } from '../e2-catalog-covariance/estimation-wire.mjs';
import { config, root, cpu } from './common.mjs';

export async function engines(run,W) {
  const {createStandaloneHarness}=await import(pathToFileURL(W.req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const ap=await createStandaloneHarness('browser',path.join(run.modules,'propagator/sdn-ap/dist/isomorphic/module.wasm'),{surface:'direct'});
  const ffm=await loadModule(run.modules,'propagator/ffm'),estimation=await loadModule(run.modules,'analysis/estimation'),gem=await loadModule(run.modules,'analysis/gp-error-model');
  const erm=await import(pathToFileURL(path.join(run.modules,'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
  const codec=await estimationCodec(run.modules,path.join(root,'node_modules/space-data-module-sdk/schemas/orbpro'));
  const invoke=async(methodId,inputs)=>{const r=await ap.invoke({methodId,inputs});if(r.statusCode!==0)throw new Error(`${methodId}: ${r.errorCode}: ${r.errorMessage}`);return r;};
  const settings=()=>{
    const f=config.ffm,n=8,diagonal=[...Array(3).fill(f.positionPriorSigmaM**2),...Array(3).fill(f.velocityPriorSigmaMS**2),...f.parameters.map(p=>(f.parameterPriorFraction*p.value)**2)];
    return {...f,fixed:{},apriori:Array.from({length:n*n},(_,k)=>Math.floor(k/n)===k%n?diagonal[k%n]:0)};
  };
  return {
    async predict(name,w,arc,env){
      const start=performance.now(),cpu0=cpu(),timing={};
      let pred,fit;
      if(name!=='ffm'){
        const pcf=W.frame('configuration','PCF',W.pcf(name==='ap-msis')),extra=name==='ap-msis'?[env.ap]:[];
        const r=await invoke('fit',[W.frame('ephemeris','OEM',W.oem(arc.fit,w.norad)),pcf,...extra]);
        const omm=r.outputs.find(o=>o.portId==='elements').payload,set=W.unpack(W.OMM,'OMM',omm);
        fit={epoch:set.EPOCH,comment:set.COMMENT,bterm:set.BSTAR,agom:set.MEAN_MOTION_DDOT};
        timing.fitWallSeconds=(performance.now()-start)/1000;timing.fitCpuSeconds=cpu()-cpu0;
        const t=performance.now(),c=cpu();
        const p=await invoke('propagate',[W.frame('omm','OMM',omm),W.frame('grid','OEM',W.oem(arc.score.map(l=>({epoch:l.epoch})),w.norad)),pcf,...extra]);
        const block=W.unpack(W.OEM,'OEM',p.outputs.find(o=>o.portId==='ephemeris').payload).EPHEMERIS_DATA_BLOCK[0];
        const frame=block.REFERENCE_FRAME?.NAME;
        if(frame!=='GCRF')throw new Error(`unexpected output frame ${frame}`);
        pred=W.lines(block);
        timing.propagateWallSeconds=(performance.now()-t)/1000;timing.propagateCpuSeconds=cpu()-c;
      }else{
        const s=settings(),ctx={ffm,estimation,codec,inputs:env.inputs};
        const segments=[{key:'precise-reference-arc',kind:'POSITION_VECTOR',nuisance:null,points:arc.fit.map(l=>({time:l.epoch,values:l.r.map(x=>x*1000),sigmas:Array(3).fill(config.ffm.measurementSigmaM)}))}];
        const product=await fitOrbit(ctx,segments,[],{epoch:arc.fit[0].epoch,state:[...arc.fit[0].r,...arc.fit[0].v].map(x=>x*1000)},s,{outer:1,tolerance:.05,relaxation:1,firstRoundSigmaFactor:config.ffm.firstRoundSigmaFactor,segmentEditRms:0});
        if(product.failed || !product.fit?.converged)throw new Error(product.failed||'FFM fit not converged');
        fit={epoch:product.epoch,parameters:product.parameters,reducedChiSquare:product.fit.reducedChiSquare,iterations:product.fit.iterations,ffmCalls:product.ffmCalls,stoppedBy:product.stoppedBy};
        timing.fitWallSeconds=(performance.now()-start)/1000;timing.fitCpuSeconds=cpu()-cpu0;
        const t=performance.now(),c=cpu(),scale=Math.max(1,product.fit.reducedChiSquare??1);
        const samples=await propagateFit(ctx,{epoch:product.epoch,state:product.state,parameters:product.parameters},arc.score.map(l=>l.epoch),s,product.fit.covariance.map(x=>x*scale));
        pred=samples.map(s=>({epoch:W.utc(s.epoch),ms:Date.parse(W.utc(s.epoch)),r:s.state.slice(0,3).map(x=>x/1000),v:s.state.slice(3).map(x=>x/1000),covariance:s.covariance?Array.from({length:36},(_,k)=>s.covariance[Math.floor(k/6)*s.n+k%6]*1e-6):null}));
        timing.propagateWallSeconds=(performance.now()-t)/1000;timing.propagateCpuSeconds=cpu()-c;
      }
      if(pred.length!==arc.score.length)throw new Error(`returned ${pred.length} states for ${arc.score.length} epochs`);
      for(let i=0;i<pred.length;i++)if(![...pred[i].r,...pred[i].v].every(Number.isFinite)||Date.parse(pred[i].epoch)!==arc.score[i].ms)throw new Error(`invalid state/epoch ${i}`);
      const t=performance.now(),c=cpu();
      const pairs=pred.map((p,i)=>({id:String(i),predicted:{position:p.r,velocity:p.v,covariance:p.covariance,covarianceAxes:'INERTIAL'},truth:{position:arc.score[i].r,velocity:arc.score[i].v,covariance:arc.score[i].covariance,covarianceAxes:'INERTIAL'}}));
      const response=await gem.invoke('pair_statistics',[erm.frame('pairs','pairs',{axesFrom:'truth',pairs})]);
      const stats=erm.decode(response.outputs.find(o=>o.portId==='statistics').payload).pairs;
      if(stats.length!==pred.length)throw new Error('scorer count mismatch');
      timing.scoreWallSeconds=(performance.now()-t)/1000;timing.scoreCpuSeconds=cpu()-c;
      timing.totalWallSeconds=(performance.now()-start)/1000;timing.totalCpuSeconds=cpu()-cpu0;
      const days={};
      for(const lead of config.leadDays){
        const indices=arc.score.flatMap((l,i)=>l.lead===lead?[i]:[]);if(!indices.length)continue;
        const e=indices.map(i=>stats[i]);
        if(e.some(s=>!s.errorRtn.every(Number.isFinite)))throw new Error('nonfinite error statistic');
        const ric=[0,1,2].map(k=>Math.sqrt(e.reduce((v,s)=>v+s.errorRtn[k]**2,0)/e.length));
        const j=indices.find(i=>arc.score[i].ms===arc.leads[lead].exactMs),exact=j===undefined?null:stats[j];
        const finite=e.filter(s=>Number.isFinite(s.d2Combined));
        days[lead]={samples:e.length,rmsM:Math.hypot(...ric)*1000,ricRmsM:ric.map(x=>x*1000),denseCoverage95:finite.length?finite.filter(s=>s.d2Combined<=config.covariance.chiSquare3_95).length/finite.length:null,
          exact:exact?{positionErrorM:Math.hypot(...exact.errorRtn)*1000,d2Combined:exact.d2Combined,d2Predicted:exact.d2Predicted,referenceCovariancePresent:!!arc.score[j].covariance,offsetSeconds:arc.leads[lead].offsetSeconds}:null};
      }
      return {ok:true,fit,timing,days};
    },
    async close(){await ap.destroy?.();await ffm.destroy();await estimation.destroy();await gem.destroy();}
  };
}
