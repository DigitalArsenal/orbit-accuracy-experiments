// Typed transport. Fitting, propagation, frames, covariance and RTN are WASM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import * as fb from 'flatbuffers';
import { loadModule, gitState } from '../../harness/modules.mjs';
import { EST_TYPE, estimationCodec, decodeResult, positionObservation, seedStruct } from '../e5-density-calibration/estimation-wire.mjs';
import { config, root, iso, H, sha256, quiet } from './common.mjs';
import { environment, normalize, dcaAt } from './inputs.mjs';

const estEpoch=ms=>{const day=Math.floor(ms/86400000);return {jd_day:day+2440587.5,seconds:(ms-day*86400000)/1000};};
const cpu=()=>process.threadCpuUsage();
const cpuSec=t=>{const r=process.threadCpuUsage(t);return (r.user+r.system)/1e6;};
export async function openWasm(modulesRoot,fetcher) {
  const modules={},names=['propagator/ffm','analysis/estimation','foundation/frames','foundation/time','data-source/eop-parser','analysis/gp-error-model','data-source/space-weather'];
  try {
    for(const n of names)modules[n]=await loadModule(modulesRoot,n);
    const c=await import(pathToFileURL(path.join(modulesRoot,'propagator/ffm/catalog.mjs')));
    const erm=await import(pathToFileURL(path.join(modulesRoot,'analysis/gp-error-model/scripts/erm-codec.mjs')));
    const est=await estimationCodec(modulesRoot,path.join(root,'node_modules/space-data-module-sdk/schemas/orbpro'));
    const env=await environment(modules,modulesRoot,fetcher);
    const table=(name,values)=>Object.assign(new c.prw[`${name}T`](),values);
    const forceOverrides=f=>({MAXIMUM_DEGREE:f.degree,MAXIMUM_ORDER:f.order,THIRD_BODY_IDS:f.thirdBodies,
      SOLID_TIDES:f.solidTides?c.prw.prwSolidTideModel.IERS_2010:c.prw.prwSolidTideModel.NONE,
      RELATIVITY:f.relativity?c.prw.prwRelativityTerms[f.relativity]:c.prw.prwRelativityTerms.NONE,
      OCEAN_TIDES:f.oceanTides?c.prw.prwOceanTideModel.FES2004:c.prw.prwOceanTideModel.NONE,
      OCEAN_TIDE_MAXIMUM_DEGREE:f.oceanTides?.degree??0,OCEAN_TIDE_MAXIMUM_ORDER:f.oceanTides?.order??0,
      EARTH_RADIATION:f.earthRadiation?c.prw.prwEarthRadiationModel.KNOCKE:c.prw.prwEarthRadiationModel.NONE,
      EARTH_RADIATION_RESOLUTION_DEG:f.earthRadiation?.resolutionDeg??15});
    async function execute(product,epochs,{forces=config.forceModel,dca=null,stm=false,covariance=null}={}) {
      assert(epochs.length&&epochs.every(t=>t>=Date.parse(product.epoch)));
      const request=c.fullForceRequest({epoch:product.epoch,state:product.state,target:iso(epochs.at(-1)),cdAm:product.cdAm,crAm:product.crAm,
        integrator:{...c.CATALOG_INTEGRATOR,...config.integrator},forces:{...forceOverrides(forces),IN_TRACK_ACCELERATION_M_S2:product.inTrack??0,HAS_IN_TRACK_ACCELERATION_M_S2:true}});
      request.SAMPLE_EPOCHS=epochs.map(t=>c.instant(iso(t)));
      request.INCLUDE_STM=stm;request.DYNAMIC_PARAMETERS=product.parameters.map(p=>c.prw.prwDynamicParameter[p.kind]);
      request.INITIAL_COVARIANCE=covariance?table('PRWStateMatrix',{DIMENSION:6+product.parameters.length,VALUES:covariance}):null;
      const inputs=[{portId:'request',typeRef:c.TYPE,payload:c.encode('EXECUTION_REQUEST',request)},...env.inputs(Date.parse(product.epoch),epochs.at(-1)),...(dca?[dca.frame]:[])];
      const response=await modules['propagator/ffm'].invoke('invoke',inputs);
      const result=c.prw.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(new Uint8Array(response.outputs.find(f=>f.portId==='response').payload))).unpack().EXECUTION_RESULT;
      assert(result?.SAMPLES?.length===epochs.length,'FFM did not return all epochs');
      return result.SAMPLES.map((s,i)=>{const v=s.STATE.STATE;assert(s.STATE.VALID!==false,'invalid FFM state');return {ms:epochs[i],state:['POSITION','VELOCITY'].flatMap(k=>['X','Y','Z'].map(a=>v[k][a])),covariance:s.COVARIANCE?.VALUES??null,n:s.STM?.DIMENSION??s.COVARIANCE?.DIMENSION??6,stm:s.STM?.VALUES??null};});
    }
    async function pairStatistics(pairs) {
      const response=await modules['analysis/gp-error-model'].invoke('pair_statistics',[erm.frame('pairs','pairs',{axesFrom:'truth',pairs:pairs.map((p,i)=>({id:String(i),predicted:{position:p.predicted.state.slice(0,3),velocity:p.predicted.state.slice(3),...(p.predicted.covariance?{covariance:p.predicted.covariance,covarianceAxes:'INERTIAL'}:{})},truth:{position:p.truth.slice(0,3),velocity:p.truth.slice(3)}}))})]);
      const out=erm.decode(response.outputs[0].payload).pairs;
      assert.equal(out.length,pairs.length);return out;
    }
    async function fit(points,norad,arm,dca=null) {
      await quiet();const before=cpu(),t0=performance.now();
      const parameters=[{kind:'DRAG_AREA_OVER_MASS',value:config.fit.initialCdAreaOverMass},...(arm===3?[{kind:'IN_TRACK_ACCELERATION',value:0}]:[])];
      const product={epoch:iso(points[0].ms),state:points[0].state,parameters,cdAm:config.fit.initialCdAreaOverMass,crAm:norad<56000?config.srpLock.before56000:config.srpLock.from56000,inTrack:0};
      const request={config:{initial_epoch:estEpoch(points[0].ms),initial_state:points[0].state,initial_covariance:Array(36).fill(0),process_noise_spectral_density:Array(6).fill(0),state_convergence_tolerance:0,rms_convergence_tolerance:0,sigma_edit_threshold:0,dynamic_model_correlation_time_seconds:0,maximum_iterations:0,reference_frame:'ICRF',estimator:'BATCH_WEIGHTED_LEAST_SQUARES',process_noise:'NONE',flags:0},
        extended_observations:points.map(p=>({observation:positionObservation(estEpoch(p.ms),[0,0,0]),values:p.state.slice(0,3),sigmas:[1,1,1]})),
        propagator_port_id:'propagator/ffm',propagator_capability:'plugin_propagate plugin_compute_stm',
        batch_options:{parameter_kinds:parameters.map(p=>c.prw.prwDynamicParameter[p.kind]),parameter_values:parameters.map(p=>p.value),observation_covariances:points.flatMap(()=>[1,0,0,0,1,0,0,0,1]),covariance_axes:0,maximum_iterations:config.fit.maxIterations,correction_tolerance:config.fit.correctionTolerance,sigma_edit_threshold:0,parameter_lower_bounds:parameters.map(p=>p.kind==='DRAG_AREA_OVER_MASS'?0:-1e30),parameter_upper_bounds:parameters.map(p=>p.kind==='DRAG_AREA_OVER_MASS'?1:1e30),levenberg_marquardt:true,rtn_covariance:true}};
      const labels=new Map(points.map(p=>[JSON.stringify(estEpoch(p.ms)),p.ms])),answers=[];
      let result,calls=0;
      for(let round=0;round<4*config.fit.maxIterations+11;round++) {
        const response=await modules['analysis/estimation'].invoke('fit_batch',[{portId:'request',typeRef:EST_TYPE,payload:est.encode({request,propagation_answers:answers})}]);
        result=decodeResult(response.outputs.find(f=>f.portId==='result').payload);
        if(result.status!==1)break;
        const q=result.queries[0];assert(q);
        const trial={...product,state:q.seed.state,cdAm:q.parameter_values[0],inTrack:arm===3?q.parameter_values[1]:0};
        const samples=await execute(trial,result.queries.map(q=>{const ms=labels.get(JSON.stringify(q.target_epoch));assert(Number.isFinite(ms),'unknown fitter epoch');return ms;}),{dca,stm:true});calls++;
        result.queries.forEach((q,i)=>{const s=samples[i],stm=[],sensitivity=[];assert(s.stm);for(let r=0;r<6;r++){for(let col=0;col<6;col++)stm.push(s.stm[r*s.n+col]);for(let col=6;col<s.n;col++)sensitivity.push(s.stm[r*s.n+col]);}answers.push({query:{sequence:q.sequence,seed:seedStruct(q),target_epoch:q.target_epoch,parameter_values:q.parameter_values},sample:{epoch:q.target_epoch,state:s.state,stm},sensitivity});});
      }
      const f=result?.fit;assert(f?.estimate?.length===6+parameters.length,'fitter returned no complete estimate');
      product.state=f.estimate.slice(0,6);product.cdAm=f.estimate[6];product.inTrack=arm===3?f.estimate[7]:0;product.parameters=parameters.map((p,i)=>({...p,value:f.estimate[i+6]}));
      // The estimator, not JS, computes/scales covariance.
      product.covariance=f.scaledCovariance?.length?f.scaledCovariance:f.covariance;
      assert.equal(product.covariance.length,(6+parameters.length)**2);
      const replay=await execute(product,points.map(p=>p.ms),{dca});
      const residuals=await pairStatistics(replay.map((predicted,i)=>({predicted,truth:points[i].state})));
      const rms3d=Math.sqrt(residuals.reduce((s,r)=>s+r.errorRtn.reduce((v,x)=>v+x*x,0),0)/points.length);
      const rmsPerCoordinate=rms3d/Math.sqrt(3);
      assert(Math.abs(rmsPerCoordinate-f.weightedRms)<=Math.max(1e-5,1e-5*f.weightedRms),`fit RMS mismatch: ${rmsPerCoordinate} vs ${f.weightedRms}`);
      return {arm,product,fit:{converged:f.converged,iterations:f.iterations,fitPoints:points.length,weightedRms:f.weightedRms,rms3dM:rms3d,fitReplayDifferenceM:Math.abs(rmsPerCoordinate-f.weightedRms),reducedChiSquare:f.reducedChiSquare,ffmCalls:calls},cpuSeconds:cpuSec(before),wallSeconds:(performance.now()-t0)/1000,dca:dca?.provenance??null};
    }
    function covariance6(sample) {if(!sample.covariance)return null;return Array.from({length:36},(_,i)=>sample.covariance[Math.floor(i/6)*sample.n+i%6]);}
    async function predict(fitted,epochs,dca=null,forces=config.forceModel) {
      await quiet();const before=cpu(),start=performance.now();
      const samples=await execute(fitted.product,epochs,{dca,forces,covariance:fitted.product.covariance});
      return {cpuSeconds:cpuSec(before),wallSeconds:(performance.now()-start)/1000,samples:samples.map(s=>({ms:s.ms,state:s.state,covariance:covariance6(s)}))};
    }
    const provenance={runtime:{node:process.version,platform:process.platform,arch:process.arch,logicalCpus:os.cpus().length,packageLockSha256:sha256(fs.readFileSync(path.join(root,'package-lock.json')))},modules:Object.values(modules).map(m=>m.provenance),source:gitState(modulesRoot),environment:env.provenance};
    return {modules,provenance,execute,fit,predict,pairStatistics,normalize:points=>normalize(modules['foundation/frames'],points),destroy:async()=>{for(const m of Object.values(modules))await m.destroy();}};
  }catch(e){for(const m of Object.values(modules))await m.destroy();throw e;}
}

export function reducedForces(term) {
  const f=structuredClone(config.forceModel);
  for(const t of Array.isArray(term)?term:[term]) {
    if(t==='gravity-above-20'){f.degree=20;f.order=20;}
    else if(t==='ocean-tides')f.oceanTides=null;
    else if(t==='solid-tides')f.solidTides=false;
    else if(t==='relativity')f.relativity=null;
    else if(t==='earth-radiation')f.earthRadiation=null;
    else throw new Error(`unknown ablation ${t}`);
  }
  return f;
}

// Never emulate kappa x drag with an unrelated constant-thrust solve.
// The landed OD method's typed bridge is selected by its explicit contract.
export async function operatorFit(moduleRoot,inputs) {
  const bridge=path.join(moduleRoot,'analysis/od/operator-fit.mjs');
  if(!fs.existsSync(bridge))return {status:'UNAVAILABLE',reason:'operator-fit method/typed bridge not landed'};
  const api=await import(pathToFileURL(bridge));
  assert.equal(typeof api.fitOperator,'function','operator-fit bridge must export fitOperator');
  return api.fitOperator(inputs);
}
