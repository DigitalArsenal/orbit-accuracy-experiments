// Typed wire adapters only; all dynamics, frames and elements run in WASM.
import fs from 'node:fs';
import path from 'node:path';
import * as fb from 'flatbuffers';
import * as D from 'spacedatastandards.org/lib/js/DCL/main.js';
import * as F from 'spacedatastandards.org/lib/js/FRM/main.js';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';
import * as G from 'spacedatastandards.org/lib/js/GRV/main.js';
import {SPW} from 'spacedatastandards.org/lib/js/SPW/main.js';
import {createBrowserModuleHarness} from 'space-data-module-sdk/host/browser-module';
import {encodeTimerTick,decodeHttpRequest,encodeHttpResponse} from 'space-data-module-sdk/runtime-contracts';
import {sha} from './transport.mjs';
const table=(s,n,v)=>Object.assign(new s[n+'T'](),v);
const type=code=>({schemaName:code+'.fbs',fileIdentifier:'$'+code,rootTypeName:code,wireFormat:'flatbuffer'});
function encode(s,code,value){const b=new fb.Builder(16384);s[code]['finish'+code+'Buffer'](b,value.pack(b));return b.asUint8Array();}
function decode(s,code,bytes){const prefixed=Buffer.from(bytes).subarray(8,12).toString()==='$'+code;return s[code][(prefixed?'getSizePrefixedRootAs':'getRootAs')+code](new fb.ByteBuffer(bytes)).unpack();}
const frame=(s,code,portId,value)=>({portId,typeRef:type(code),payload:encode(s,code,value)});
export async function openPhysics(root){
  const modules={},provenance=[];
  for(const name of ['foundation/frames','foundation/orbits','analysis/density-calibration','data-source/space-weather']){
    const manifestBytes=fs.readFileSync(path.join(root,name,'plugin-manifest.json'));
    const wasm=fs.readFileSync(path.join(root,name,'dist/isomorphic/module.wasm'));
    const manifest=JSON.parse(manifestBytes);
    modules[name]=await createBrowserModuleHarness({wasmSource:wasm,manifest,surface:'direct'});
    provenance.push({name,version:manifest.version,wasmSha256:sha(wasm),manifestSha256:sha(manifestBytes)});
  }
  async function invoke(name,methodId,inputs){const r=await modules[name].invoke({methodId,inputs});if(r.statusCode!==0)throw new Error(`${name}/${methodId}: ${r.errorCode}: ${r.errorMessage}`);return r.outputs;}
  const earth=()=>table(F,'RFMOrigin',{KIND:F.rfmOriginKind.CELESTIAL_BODY,CELESTIAL_BODY_ID:399});
  const system=(name,axis)=>table(F,'RFMCoordinateSystem',{NAME:name,AXIS_TYPE:F.rfmAxisType[axis],ORIGIN:earth(),AXIS_REFERENCE_BODY_ID:399});
  async function normalize(p){
    const epoch=new Date(p.ms).toISOString(),x=p.stateKm.map(v=>v*1000),vec=a=>table(F,'FRMVector3',{X:a[0],Y:a[1],Z:a[2]});
    const req=table(F,'FRMFrameTransformRequest',{OPERATION:F.frmOperationCode.STATE_TRANSFORM,SOURCE_COORDINATE_SYSTEM:system('EME2000','MEAN_EQUATOR_EQUINOX_J2000'),TARGET_COORDINATE_SYSTEM:system('GCRF','ICRF'),
      SOURCE_STATE:table(F,'FRMStateVector',{REPRESENTATION:F.frmStateRepresentation.CARTESIAN,COMPONENTS:x,POSITION:vec(x.slice(0,3)),VELOCITY:vec(x.slice(3)),COORDINATE_SYSTEM_NAME:'EME2000',EPOCH:epoch,EPOCH_TIME_SYSTEM:'UTC',GRAVITATIONAL_PARAMETER:3.986004418e14}),TARGET_REPRESENTATION:F.frmStateRepresentation.CARTESIAN,EPOCH:epoch,EPOCH_TIME_SYSTEM:'UTC'});
    const r=decode(F,'FRM',(await invoke('foundation/frames','transform_frame_position',[frame(F,'FRM','request',table(F,'FRM',{FRAME_TRANSFORM_REQUEST:req}))]))[0].payload).FRAME_TRANSFORM_RESULT;
    if(r.STATUS!==F.frmResultStatus.OK)throw new Error(r.ERROR_MESSAGE);
    return {ms:p.ms,stateM:['POSITION','VELOCITY'].flatMap(k=>['X','Y','Z'].map(a=>r.TARGET_STATE[k][a]))};
  }
  function cartesianOcm(p){return table(O,'OCM',{
    HEADER:table(O,'Header',{CCSDS_OCM_VERS:'3.0'}),METADATA:table(O,'Metadata',{OBJECT_NAME:'operator-capture',INTERNATIONAL_DESIGNATOR:'operator-capture',TIME_SYSTEM:'UTC',START_TIME:new Date(p.ms).toISOString(),STOP_TIME:new Date(p.ms).toISOString(),EPOCH_TZERO:new Date(p.ms).toISOString()}),
    TRAJ_TYPE:O.trajectoryType.CARTESIAN_PV,STATE_VECTOR_SIZE:6,STATE_DATA:p.stateKm,CENTER_NAME:'EARTH',TRAJ_REF_FRAME:table(O,'RFM',{TYPE:O.RFMUnion.CelestialFrameWrapper,VALUE:table(O,'CelestialFrameWrapper',{VALUE:O.CelestialFrame.EME2000})}),PERTURBATIONS:table(O,'Perturbations',{GM:398600.4418})});}
  // Construct these union tables by their generated positional constructors.
  const ref=new O.RFMT(O.RFMUnion.CelestialFrameWrapper,new O.CelestialFrameWrapperT(O.CelestialFrame.EME2000));
  const gravity=new G.GRVT(G.GravityModelType.J2_ONLY,G.GravityModelName.CUSTOM_MODEL,G.CentralBody.EARTH,2,0,false,false,false,false,false,false,6378.1363,0.00108262668,398600.4418);
  async function mean(p){
    const ocm=cartesianOcm(p);ocm.TRAJ_REF_FRAME=ref;
    const a=(await invoke('foundation/orbits','ocm_state_to_keplerian',[frame(O,'OCM','vector_state',ocm)]))[0];
    const out=(await invoke('foundation/orbits','ocm_keplerian_osculating_to_mean',[{...a,portId:'keplerian_state'},frame(G,'GRV','gravity_context',gravity)]))[0];
    const v=decode(O,'OCM',out.payload);
    if(v.ORB_AVERAGING!=='BROUWER'||v.STATE_DATA.length!==6||!v.STATE_DATA.every(Number.isFinite))throw new Error(`invalid mean elements: averaging=${v.ORB_AVERAGING}, row=${JSON.stringify(v.STATE_DATA)}`);
    return v.STATE_DATA;
  }
  async function weather(fetcher){
    const wire=(portId,payload,schemaName,fileIdentifier,rootTypeName)=>({portId,payload,typeRef:{schemaName,fileIdentifier,rootTypeName,wireFormat:'flatbuffer'}});
    const plan=await invoke('data-source/space-weather','plan_weather',[wire('tick',encodeTimerTick({triggerId:'operator-capture',firedMs:Date.now()}),'TimerTick.fbs','TICK','TimerTick')]);
    const inputs=[],sources=[];
    for(const q of plan.filter(f=>f.portId==='request').map(f=>decodeHttpRequest(f.payload))){
      const r=await fetcher.get(q.url);sources.push({url:q.url,sha256:sha(r.bytes),bytes:r.bytes.length,retrievedUtc:r.retrievedUtc});
      inputs.push(wire('response',encodeHttpResponse({url:q.url,status:200,body:r.bytes,retrievedMs:Date.parse(r.retrievedUtc)}),'HttpResponse.fbs','HRSP','HttpResponse'));
    }
    const out=await invoke('data-source/space-weather','parse_weather',inputs);
    const bytes=Buffer.from(out.find(f=>f.portId==='records').payload),rows=[];
    for(let at=0;at<bytes.length;){const n=bytes.readUInt32LE(at);if(n<8||at+4+n>bytes.length)throw new Error('SPW frame invalid');rows.push(SPW.getSizePrefixedRootAsSPW(new fb.ByteBuffer(bytes.subarray(at,at+4+n))).unpack());at+=4+n;}
    return {rows,sources,sha256:sha(bytes)};
  }
  async function dcl(method,points,weatherRows=null){
    const states=table(D,'dclStates',{EPHEMERIS:table(D,'ephemerisDataBlock',{EPHEMERIS_DATA_LINES:points.map(p=>table(D,'ephemerisDataLine',{EPOCH:new Date(p.ms).toISOString(),...Object.fromEntries(['X','Y','Z','X_DOT','Y_DOT','Z_DOT'].map((k,i)=>[k,p.stateM[i]/1000]))}))})});
    const request=table(D,'DCL',{STATES:states,GRAVITY_DEGREE:36,GRAVITY_ORDER:36,GM_M3_S2:3.986004418e14,EARTH_ROTATION_RAD_S:7.292115e-5,BALLISTIC_COEFFICIENT_M2_KG:1});
    if(weatherRows){request.ATMOSPHERE=table(D,'ATM',{MODEL:D.AtmosphericModelFamily.NRLMSIS00E,YEAR:2000});request.SPACE_WEATHER=weatherRows.map(r=>table(D,'SPW',r));}
    const out=decode(D,'DCL',(await invoke('analysis/density-calibration',method,[frame(D,'DCL','request',request)]))[0].payload);
    if(out.STATES.REFUSED.length)throw new Error(`${method}: ${out.STATES.REFUSED.length} states refused`);
    return out.STATES;
  }
  async function derive(head,weatherRows){
    const native=[];for(const p of head.points)native.push(await normalize(p));
    const energy=await dcl('energy',native),work=await dcl('drag_work',native,weatherRows);
    const samples=[];
    for(let i=0;i<native.length;i+=10){samples.push({ms:native[i].ms,energyJkg:energy.ENERGY_J_KG[i],altitudeKm:energy.ALTITUDE_KM[i],meanElements:await mean(head.points[i]),stateM:native[i].stateM});}
    return {samples,native,work};
  }
  return {provenance,weather,derive,normalize,mean,dcl,destroy:async()=>{for(const m of Object.values(modules))await m.destroy();}};
}
