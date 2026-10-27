// Orbit propagation, physical frame conversion and error axes remain in the
// existing native modules and the documented USSF black-box interface.
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import * as fb from 'flatbuffers';
import {FRM,FRMT,FRMFrameTransformRequestT,FRMStateVectorT,FRMVector3T,RFMCoordinateSystemT,RFMOriginT,
  frmOperationCode,frmResultStatus,frmStateRepresentation,rfmAxisType,rfmOriginKind} from 'spacedatastandards.org/lib/js/FRM/main.js';
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
  const xp=await openModule(),frames=await loadModule(modules,'foundation/frames');
  const {tleLines,elementsOf}=await imported(path.join(modules,'propagator/sdn-ap/test/lib/tle.mjs'));
  const {openOracle}=await imported(path.join(oracleRoot,'oracle.mjs'));
  const reference=await openOracle({version:settings.oracleVersion});
  async function positionErrorRtn(predicted,truth,epoch){
    const object=()=>Object.assign(new RFMOriginT(rfmOriginKind.SPACE_OBJECT),{OBJECT_ID:'reference'});
    const system=(name,axis,origin)=>new RFMCoordinateSystemT(name,axis,origin,399,epoch,'UTC');
    const gcrf=system('GCRF',rfmAxisType.ICRF,new RFMOriginT(rfmOriginKind.CELESTIAL_BODY,399));
    const state=s=>new FRMStateVectorT(frmStateRepresentation.CARTESIAN,[...s.r,...s.v].map(x=>x*1000),
      new FRMVector3T(...s.r.map(x=>x*1000)),new FRMVector3T(...s.v.map(x=>x*1000)),'GCRF',epoch,'UTC',3.986004418e14);
    const request=Object.assign(new FRMFrameTransformRequestT(),{OPERATION:frmOperationCode.STATE_TRANSFORM,
      SOURCE_COORDINATE_SYSTEM:gcrf,TARGET_COORDINATE_SYSTEM:system('RTN',rfmAxisType.ORBITAL_RADIAL_TRANSVERSE_NORMAL,object()),
      SOURCE_STATE:state(predicted),TARGET_REPRESENTATION:frmStateRepresentation.CARTESIAN,EPOCH:epoch,EPOCH_TIME_SYSTEM:'UTC'});
    const reference=Object.assign(new FRMFrameTransformRequestT(),{SOURCE_STATE:state(truth),SOURCE_COORDINATE_SYSTEM:system('GCRF',rfmAxisType.ICRF,object())});
    const frame=(portId,r)=>{const b=new fb.Builder(2048);FRM.finishFRMBuffer(b,new FRMT(r,null).pack(b));return{portId,typeRef:{schemaName:'FRM.fbs',fileIdentifier:'$FRM',rootTypeName:'FRM'},payload:b.asUint8Array()};};
    const response=await frames.invoke('transform_frame_position',[frame('request',request),frame('object_state',reference)]);
    const result=FRM.getRootAsFRM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).FRAME_TRANSFORM_RESULT();
    if(!result||result.STATUS()!==frmResultStatus.OK)throw Error(`RTN residual transform: ${result?.ERROR_MESSAGE()??'no result'}`);
    const p=result.TARGET_STATE()?.POSITION(),error=p?[p.X(),p.Y(),p.Z()]:[];
    if(error.length!==3||!error.every(Number.isFinite))throw Error('Invalid native RTN position residual');
    return error;
  }
  async function score(states,arc){
    const converted=[];
    for(let i=0;i<states.length;i++){
      const state=await toGcrf(frames,'TRUE_EQUATOR_MEAN_EQUINOX_OF_DATE',arc.score[i].epoch,[...states[i].r,...states[i].v].map(x=>x*1000));
      converted.push({r:state.slice(0,3).map(x=>x/1000),v:state.slice(3).map(x=>x/1000)});
    }
    const stats=[],days={};
    for(let i=0;i<converted.length;i++)stats.push(await positionErrorRtn(converted[i],arc.score[i],arc.score[i].epoch));
    for(const lead of baseline.leadDays){
      const indices=arc.score.flatMap((s,i)=>s.lead===lead?[i]:[]);if(!indices.length)continue;
      const ric=[0,1,2].map(k=>Math.sqrt(indices.reduce((sum,i)=>sum+stats[i][k]**2,0)/indices.length));
      days[lead]={samples:indices.length,rmsM:Math.hypot(...ric),ricRmsM:ric,covarianceStatus:'unavailable'};
    }
    return {ok:true,status:'scored',days};
  }
  return {
    async compare(object,arc,previous,saveInput){
      const response=await fit.invoke({methodId:'fit',inputs:[W.frame('ephemeris','OEM',W.oem(arc.fit,object.norad)),W.frame('configuration','PCF',W.pcf(false))]});
      if(response.statusCode!==0)throw Error(`Recovered XP fit failed: ${response.errorCode}: ${response.errorMessage}`);
      const bytes=response.outputs.find(o=>o.portId==='elements')?.payload;if(!bytes)throw Error('No recovered elements');
      const set=W.unpack(W.OMM,'OMM',bytes),metadata={epoch:set.EPOCH,comment:set.COMMENT,bterm:set.BSTAR,agom:set.MEAN_MOTION_DDOT};
      assert.deepEqual(metadata,previous.fit,'Recovered fit differs from the completed census');
      const recovered={elementsBase64:Buffer.from(bytes).toString('base64'),metadata};
      await saveInput(recovered);
      const epoch=new Date(W.utc(set.EPOCH)),year=epoch.getUTCFullYear(),day=1+(epoch-Date.UTC(year,0,1))/86400000;
      if(!(year>=1957&&year<=2056))throw Error('TLE epoch outside representable year range');
      const lines=tleLines({satnum:settings.syntheticInterfaceId,year:year%100,day,type:4,bterm:set.BSTAR,agom:set.MEAN_MOTION_DDOT,
        inc:set.INCLINATION,raan:set.RA_OF_ASC_NODE,ecc:set.ECCENTRICITY,argp:set.ARG_OF_PERICENTER,ma:set.MEAN_ANOMALY,mm:set.MEAN_MOTION});
      if(lines.some(line=>line.length!==69))throw Error('Fitted elements not representable in type-4 TLE fields');
      const elements=elementsOf(lines);
      if(!Object.values(elements).every(Number.isFinite))throw Error('Nonfinite quantized elements');
      const quantizedEpochMs=Date.UTC(year,0,1)+(Number(lines[0].slice(20,32))-1)*86400000;
      const minutes=arc.score.map(s=>(s.ms-quantizedEpochMs)/60000);
      await saveInput({...recovered,lines,quantizedEpochMs,minutes});
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
      // Same-frame Cartesian distance is the conformance study's statistic;
      // it needs neither an uncertainty model nor a rotating-axis transform.
      const differences=indices.map(i=>1000*Math.hypot(...white[i].r.map((x,k)=>x-official[i].r[k])));
      const agreement={pairedSamples:indices.length,expectedSamples:arc.score.length,maximumPositionDifferenceM:differences.length?Math.max(...differences):null,
        strictThresholdM:settings.strictPositionAgreementM,exceedances:differences.flatMap((d,i)=>d>settings.strictPositionAgreementM?[{index:indices[i],epoch:arc.score[indices[i]].epoch,distanceM:d}]:[])};
      return {arms,failures,agreement,fit:metadata,input:{elementsBase64:Buffer.from(bytes).toString('base64'),lines,quantizedEpochMs,minutes},
        timing:{xpQuantizedWallSeconds:whiteWallSeconds,ussfNativeWallSeconds:referenceWallSeconds,comparableRuntime:false},referenceCovariance:'unavailable'};
    },
    async verifyGeometry(){
      // Circular reference at +X with velocity +Y gives RTN = X,Y,Z.
      // The translated position is independently known in metres.
      const error=await positionErrorRtn({r:[7000.001,.002,.003],v:[0,7.5,0]},
        {r:[7000,0,0],v:[0,7.5,0]},'2026-10-01T00:00:00Z');
      for(let i=0;i<3;i++)assert.ok(Math.abs(error[i]-(i+1))<1e-8,'Native RTN residual units/origin');
      return {analyticalRtnMetres:[1,2,3],maximumAbsoluteToleranceM:1e-8,passed:true};
    },
    async close(){await reference.close();xp.destroy();await xp.harness.destroy?.();await fit.destroy?.();await frames.destroy();}
  };
}
