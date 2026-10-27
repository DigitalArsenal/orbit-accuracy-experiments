// Configuration/framing and statistical comparison only. Fits, dynamics,
// covariance propagation, frame/time conversion and RTN statistics are native.
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadModule} from '../../../harness/modules.mjs';
import {convertIso} from '../../../harness/time.mjs';
import {fitOrbit,propagateFit} from '../../e6-public-observations/fit.mjs';
import {estimationCodec} from '../../e2-catalog-covariance/estimation-wire.mjs';
import {config as baseline,cpu} from '../../propagator-published-truth/common.mjs';
import {root,settings} from './common.mjs';
export async function openEngine(modules,ffmModules,W){
  const ffm=await loadModule(ffmModules,'propagator/ffm'),estimation=await loadModule(modules,'analysis/estimation'),gem=await loadModule(modules,'analysis/gp-error-model'),time=await loadModule(modules,'foundation/time');
  const erm=await import(pathToFileURL(path.join(modules,'analysis/gp-error-model/scripts/erm-codec.mjs')).href);
  const rawCodec=await estimationCodec(modules,path.join(root,'node_modules/space-data-module-sdk/schemas/orbpro'));
  const codec={encode:v=>{v.request.batch_options.parameter_lower_bounds=settings.parameterLowerBounds;v.request.batch_options.levenberg_marquardt=settings.levenbergMarquardt;return rawCodec.encode(v);}};
  return{
    async predict(object,arc,env,saveFit){
      const start=performance.now(),cpu0=cpu(),f={...baseline.ffm,maximumIterations:settings.maximumIterations},n=8;
      const diagonal=[...Array(3).fill(f.positionPriorSigmaM**2),...Array(3).fill(f.velocityPriorSigmaMS**2),...f.parameters.map(p=>(f.parameterPriorFraction*p.value)**2)];
      const s={...f,fixed:{},apriori:Array.from({length:n*n},(_,k)=>Math.floor(k/n)===k%n?diagonal[k%n]:0)},ctx={ffm,estimation,codec,inputs:env.inputs};
      const segments=[{key:'precise-reference-arc',kind:'POSITION_VECTOR',nuisance:null,points:arc.fit.map(l=>({time:l.epoch,values:l.r.map(x=>x*1000),sigmas:Array(3).fill(f.measurementSigmaM)}))}];
      const product=await fitOrbit(ctx,segments,[],{epoch:arc.fit[0].epoch,state:[...arc.fit[0].r,...arc.fit[0].v].map(x=>x*1000)},s,{outer:1,tolerance:.05,relaxation:1,firstRoundSigmaFactor:f.firstRoundSigmaFactor,segmentEditRms:0});
      saveFit(product);
      if(product.failed||!product.fit?.converged||product.stoppedBy)throw Error(product.failed||product.stoppedBy||'FFM fit not converged');
      if(!product.parameters.every(p=>Number.isFinite(p)&&p>=0))throw Error('Native bounded solution has invalid physical parameters');
      const fit={epoch:product.epoch,parameters:product.parameters,reducedChiSquare:product.fit.reducedChiSquare,iterations:product.fit.iterations,ffmCalls:product.ffmCalls,
        boundStatus:product.fit.boundStatus,activeConstraint:product.fit.boundStatus.some(s=>s!==0),covarianceIdentity:'formal fitted covariance, not empirically calibrated',stoppedBy:product.stoppedBy};
      const timing={fitWallSeconds:(performance.now()-start)/1000,fitCpuSeconds:cpu()-cpu0};let t=performance.now(),c=cpu(),metadata;
      const checked={invoke:async(...a)=>{const out=await ffm.invoke(...a);metadata=W.unpack(W.PRW,'PRW',out.outputs.find(o=>o.portId==='response').payload).EXECUTION_RESULT.SAMPLES.map(s=>({epoch:s.STATE.STATE.EPOCH,scale:s.STATE.STATE.EPOCH_TIME_SYSTEM,frame:s.STATE.STATE.COORDINATE_SYSTEM_NAME}));return out;}};
      const scale=Math.max(1,product.fit.reducedChiSquare??1),samples=await propagateFit({...ctx,ffm:checked},{epoch:product.epoch,state:product.state,parameters:product.parameters},arc.score.map(l=>l.epoch),s,product.fit.covariance.map(x=>x*scale));
      if(samples.length!==arc.score.length)throw Error('Native output count differs');
      for(let i=0;i<samples.length;i++){
        if(metadata[i].frame!=='GCRF'||metadata[i].epoch!==samples[i].epoch||!samples[i].state.every(Number.isFinite))throw Error('Invalid native output state/frame');
        const utc=W.utc(await convertIso(time,metadata[i].epoch,metadata[i].scale,'UTC'));if(Math.abs(Date.parse(utc)-arc.score[i].ms)>1)throw Error('Native output epoch differs');
      }
      timing.propagateWallSeconds=(performance.now()-t)/1000;timing.propagateCpuSeconds=cpu()-c;t=performance.now();c=cpu();
      const pairs=samples.map((s,i)=>({id:String(i),predicted:{position:s.state.slice(0,3),velocity:s.state.slice(3),covariance:s.covariance?Array.from({length:36},(_,k)=>s.covariance[Math.floor(k/6)*s.n+k%6]):null,covarianceAxes:'INERTIAL'},
        truth:{position:arc.score[i].r.map(x=>x*1000),velocity:arc.score[i].v.map(x=>x*1000),covariance:arc.score[i].covariance?.map(x=>x*1e6)??null,covarianceAxes:'INERTIAL'}}));
      const response=await gem.invoke('pair_statistics',[erm.frame('pairs','pairs',{axesFrom:'truth',pairs})]),stats=erm.decode(response.outputs.find(o=>o.portId==='statistics').payload).pairs;
      if(stats.length!==pairs.length||stats.some(s=>!s.errorRtn.every(Number.isFinite)))throw Error('Invalid native statistics');
      const days={};
      for(const lead of baseline.leadDays){const indices=arc.score.flatMap((s,i)=>s.lead===lead?[i]:[]);if(!indices.length)continue;
        const e=indices.map(i=>stats[i]),ric=[0,1,2].map(k=>Math.sqrt(e.reduce((v,s)=>v+s.errorRtn[k]**2,0)/e.length));
        const j=indices.find(i=>arc.score[i].ms===arc.leads[lead].exactMs),exact=j===undefined?null:stats[j],finite=e.filter(s=>Number.isFinite(s.d2Combined));
        days[lead]={samples:e.length,rmsM:Math.hypot(...ric),ricRmsM:ric,denseCoverage95:finite.length?finite.filter(s=>s.d2Combined<=baseline.covariance.chiSquare3_95).length/finite.length:null,
          exact:exact?{positionErrorM:Math.hypot(...exact.errorRtn),d2Combined:exact.d2Combined,d2Predicted:exact.d2Predicted,referenceCovariancePresent:!!arc.score[j].covariance,offsetSeconds:arc.leads[lead].offsetSeconds}:null};
      }
      Object.assign(timing,{scoreWallSeconds:(performance.now()-t)/1000,scoreCpuSeconds:cpu()-c,totalWallSeconds:(performance.now()-start)/1000,totalCpuSeconds:cpu()-cpu0});
      return{ok:true,status:'scored',method:settings.arm,fit,timing,days};
    },
    async close(){await ffm.destroy();await estimation.destroy();await gem.destroy();await time.destroy();}
  };
}
