// Public Basilisk clMeanOscMap case, through the actual SDS/WASM boundary.
// Values and tolerances: foundation/orbits/tests/keplerian_conversion.test.mjs
// in modules 500b2e9299539e3c79354379b8a231c3aa9643e9, maps ... to mean elements.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as fb from 'flatbuffers';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';
import * as G from 'spacedatastandards.org/lib/js/GRV/main.js';
import {createBrowserModuleHarness} from 'space-data-module-sdk/host/browser-module';
export async function verifyReference(root){
  const modulePath=path.join(root,'foundation/orbits');
  const harness=await createBrowserModuleHarness({wasmSource:fs.readFileSync(path.join(modulePath,'dist/isomorphic/module.wasm')),manifest:JSON.parse(fs.readFileSync(path.join(modulePath,'plugin-manifest.json'))),surface:'direct'});
  const table=(s,n,v)=>Object.assign(new s[n+'T'](),v),degrees=180/Math.PI;
  const o=table(O,'OCM',{HEADER:new O.HeaderT('3.0',[],'U','2000-04-01T00:00:00Z','Basilisk reference'),METADATA:table(O,'Metadata',{OBJECT_NAME:'BASILISK-J2-OSC-REFERENCE',INTERNATIONAL_DESIGNATOR:'BASILISK-ORBITAL-MOTION',TIME_SYSTEM:'UTC',START_TIME:'2000-04-01T00:00:00Z',EPOCH_TZERO:'2000-04-01T00:00:00Z'}),TRAJ_TYPE:O.trajectoryType.KEPLERIAN,STATE_VECTOR_SIZE:6,
    STATE_DATA:[1000.0754644201595,0.20017786852908628,0.20000333960738947*degrees,0.15007256499303692*degrees,0.5001185731572934*degrees,0.19982315726261962*degrees],CENTER_NAME:'EARTH',TRAJ_REF_FRAME:new O.RFMT(O.RFMUnion.CelestialFrameWrapper,new O.CelestialFrameWrapperT(O.CelestialFrame.EME2000)),PERTURBATIONS:table(O,'Perturbations',{GM:398600.436})});
  const g=new G.GRVT(G.GravityModelType.J2_ONLY,G.GravityModelName.CUSTOM_MODEL,G.CentralBody.EARTH,2,0,false,false,false,false,false,false,300,0.001,398600.436);
  const frame=(s,code,portId,value)=>{const b=new fb.Builder(2048);s[code]['finish'+code+'Buffer'](b,value.pack(b));return {portId,payload:b.asUint8Array(),typeRef:{schemaName:code+'.fbs',fileIdentifier:'$'+code,rootTypeName:code}};};
  try{
    const response=await harness.invoke({methodId:'ocm_keplerian_osculating_to_mean',inputs:[frame(O,'OCM','keplerian_state',o),frame(G,'GRV','gravity_context',g)]});
    assert.equal(response.statusCode,0,response.errorMessage);
    const result=O.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(new Uint8Array(response.outputs[0].payload))).unpack();
    assert.equal(result.ORB_AVERAGING,'BROUWER');
    const expected=[1000,0.2,0.2*degrees,0.15*degrees,0.5*degrees,0.2*degrees],tolerances=[2e-4,1e-7,5e-6,5e-6,5e-6,5e-6];
    const errors=result.STATE_DATA.map((x,i)=>Math.abs(x-expected[i]));
    errors.forEach((e,i)=>assert(e<tolerances[i],`Basilisk reference field ${i}: ${e}`));
    return {source:'Basilisk clMeanOscMap public case via modules foundation/orbits',status:'PASS',errors,tolerances};
  }finally{await harness.destroy();}
}
