// Orbit propagation, physical frame conversion and error axes remain in the
// existing native modules and the documented USSF black-box interface.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {loadModule} from '../../../harness/modules.mjs';
import {toGcrf} from '../../../harness/frames.mjs';
import {config as baseline} from '../../propagator-published-truth/common.mjs';
import {settings} from './common.mjs';
const imported=file=>import(pathToFileURL(file).href);
const finiteState=s=>s&&s.error===0&&[...s.r,...s.v].every(Number.isFinite);

export async function openEngines(modules,oracleRoot,W){
  const {createStandaloneHarness}=await imported(W.req.resolve('space-data-module-sdk/testing/isomorphic'));
  const fit=await createStandaloneHarness('browser',path.join(modules,'propagator/sdn-ap/dist/isomorphic/module.wasm'),{surface:'direct'});
  const {openModule}=await imported(path.join(modules,'propagator/sdn-ap/test/lib/module.mjs'));
  const xp=await openModule(),frames=await loadModule(modules,'foundation/frames'),gem=await loadModule(modules,'analysis/gp-error-model');
  const erm=await imported(path.join(modules,'analysis/gp-error-model/scripts/erm-codec.mjs'));
  const {tleLines,elementsOf}=await imported(path.join(modules,'propagator/sdn-ap/test/lib/tle.mjs'));
  const {openOracle}=await imported(path.join(oracleRoot,'oracle.mjs'));
  const reference=await openOracle({version:settings.oracleVersion});
  async function statistics(predicted,truth){
    const si=s=>({position:s.r.map(x=>x*1000),velocity:s.v.map(x=>x*1000),covariance:null,covarianceAxes:'INERTIAL'});
    const pairs=predicted.map((p,i)=>({id:String(i),predicted:si(p),truth:si(truth[i])}));
    const response=await gem.invoke('pair_statistics',[erm.frame('pairs','pairs',{axesFrom:'truth',pairs})]);
    const result=erm.decode(response.outputs.find(o=>o.portId==='statistics').payload).pairs;
    if(result.length!==pairs.length||result.some(p=>!p.errorRtn.every(Number.isFinite)))throw Error('Invalid error-statistics result');
    return result;
  }
  async function score(states,arc){
    const converted=[];
    for(let i=0;i<states.length;i++){
      const state=await toGcrf(frames,'TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE',arc.score[i].epoch,[...states[i].r,...states[i].v].map(x=>x*1000));
      converted.push({r:state.slice(0,3).map(x=>x/1000),v:state.slice(3).map(x=>x/1000)});
    }
    const stats=await statistics(converted,arc.score),days={};
    for(const lead of baseline.leadDays){
      const indices=arc.score.flatMap((s,i)=>s.lead===lead?[i]:[]);if(!indices.length)continue;
      const ric=[0,1,2].map(k=>Math.sqrt(indices.reduce((sum,i)=>sum+stats[i].errorRtn[k]**2,0)/indices.length));
      days[lead]={samples:indices.length,rmsM:Math.hypot(...ric),ricRmsM:ric,covarianceStatus:'unavailable'};
    }
    return {ok:true,status:'scored',days};
  }
  return {
    async compare(object,arc,previous){
      const response=await fit.invoke({methodId:'fit',inputs:[W.frame('ephemeris','OEM',W.oem(arc.fit,object.norad)),W.frame('configuration','PCF',W.pcf(false))]});
      if(response.statusCode!==0)throw Error(`Recovered XP fit failed: ${response.errorCode}: ${response.errorMessage}`);
      const bytes=response.outputs.find(o=>o.portId==='elements')?.payload;if(!bytes)throw Error('No recovered elements');
      const set=W.unpack(W.OMM,'OMM',bytes),metadata={epoch:set.EPOCH,comment:set.COMMENT,bterm:set.BSTAR,agom:set.MEAN_MOTION_DDOT};
      assert.deepEqual(metadata,previous.fit,'Recovered fit differs from the completed census');
      const epoch=new Date(W.utc(set.EPOCH)),year=epoch.getUTCFullYear(),day=1+(epoch-Date.UTC(year,0,1))/86400000;
      if(!(year>=1957&&year<=2056))throw Error('TLE epoch outside representable year range');
      const lines=tleLines({satnum:settings.syntheticInterfaceId,year:year%100,day,type:4,bterm:set.BSTAR,agom:set.MEAN_MOTION_DDOT,
        inc:set.INCLINATION,raan:set.RA_OF_ASC_NODE,ecc:set.ECCENTRICITY,argp:set.ARG_OF_PERICENTER,ma:set.MEAN_ANOMALY,mm:set.MEAN_MOTION});
      if(lines.some(line=>line.length!==69))throw Error('Fitted elements not representable in type-4 TLE fields');
      const elements=elementsOf(lines);
      if(!Object.values(elements).every(Number.isFinite))throw Error('Nonfinite quantized elements');
      const quantizedEpochMs=Date.UTC(year,0,1)+(Number(lines[0].slice(20,32))-1)*86400000;
      const minutes=arc.score.map(s=>(s.ms-quantizedEpochMs)/60000);
      xp.init([elements]);const white=[],whiteStart=performance.now();
      for(const t of minutes){const p=xp.atMinutes([t]);white.push({error:p.status[0],r:[p.x[0],p.y[0],p.z[0]],v:[p.vx[0],p.vy[0],p.vz[0]]});}
      const whiteWallSeconds=(performance.now()-whiteStart)/1000,referenceStart=performance.now();
      const official=await reference.propagate(lines,minutes),referenceWallSeconds=(performance.now()-referenceStart)/1000;
      const arms={},failures={};
      for(const [name,states] of [['xp-quantized',white],['ussf99-quantized',official]]){
        failures[name]=arc.score.flatMap((s,i)=>finiteState(states?.[i])?[]:[{index:i,epoch:s.epoch,code:states?.[i]?.error??null,reason:states?.[i]?'nonzero return or nonfinite state':'reference state unavailable'}]);
        arms[name]=failures[name].length?{ok:false,status:'propagation_failed',failedSamples:failures[name].length,expectedSamples:arc.score.length}:await score(states,arc);
      }
      const indices=arc.score.flatMap((s,i)=>finiteState(white[i])&&finiteState(official?.[i])?[i]:[]);
      const pair=indices.length?await statistics(indices.map(i=>white[i]),indices.map(i=>official[i])):[];
      const differences=pair.map(p=>Math.hypot(...p.errorRtn));
      const agreement={pairedSamples:indices.length,expectedSamples:arc.score.length,maximumPositionDifferenceM:differences.length?Math.max(...differences):null,
        strictThresholdM:settings.strictPositionAgreementM,exceedances:differences.flatMap((d,i)=>d>settings.strictPositionAgreementM?[{index:indices[i],epoch:arc.score[indices[i]].epoch,distanceM:d}]:[])};
      return {arms,failures,agreement,fit:metadata,input:{elementsBase64:Buffer.from(bytes).toString('base64'),lines,quantizedEpochMs,minutes},
        timing:{xpQuantizedWallSeconds:whiteWallSeconds,ussfNativeWallSeconds:referenceWallSeconds,comparableRuntime:false},referenceCovariance:'unavailable'};
    },
    async close(){await reference.close();xp.destroy();await xp.harness.destroy?.();await fit.destroy?.();await frames.destroy();await gem.destroy();}
  };
}
