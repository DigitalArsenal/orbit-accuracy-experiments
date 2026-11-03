// Typed module calls and record transport; no orbital dynamics in JavaScript.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {config,hash} from '../guard.mjs';
import * as S from '../../xp-atmosphere-merit/lib/sds.mjs';
import {config as XM3,pinned} from '../../ffm-atmosphere-xm3/common.mjs';
import {encode,kernelFrame} from '../../operator-theory/lib/frame.mjs';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import * as fb from 'flatbuffers';
import {createBrowserModuleHarness} from 'space-data-module-sdk/host/browser-module';
import {windowTerms} from './window-terms.mjs';
if(execFileSync('git',['show','2748823:experiments/five-day-ca/COVARIANCE.md'],{encoding:'utf8'}).trim()!==fs.readFileSync('experiments/five-day-ca/COVARIANCE.md','utf8').trim())throw Error('covariance registration changed');
export const covarianceConfig=JSON.parse(fs.readFileSync(new URL('../covariance-config.json',import.meta.url)));
for(const [file,pin]of Object.entries(covarianceConfig.constants))if(hash(fs.readFileSync(file))!==pin)throw Error(`covariance constants changed: ${file}`);
export async function openPairStatistics(){
 const dir=path.join(config.modulesRoot,'analysis/gp-error-model'),req=createRequire(path.join(dir,'package.json'));
 const bytes=fs.readFileSync(path.join(dir,'dist/isomorphic/module.wasm'));if(hash(bytes)!==covarianceConfig.gpWasmSha256)throw Error('GP module changed');
 const {createBrowserModuleHarness:make}=await import(pathToFileURL(req.resolve('space-data-module-sdk/testing')).href);
 const h=await make({wasmSource:bytes,surface:'direct'}),erm=await import(pathToFileURL(path.join(dir,'scripts/erm-codec.mjs')).href);
 async function call(method,port,type,value,output){const r=await h.invoke({methodId:method,inputs:[erm.frame(port,type,value)]});if(r.statusCode!==0)throw Error(r.errorMessage);return erm.decode(Buffer.from(r.outputs.find(o=>o.portId===output).payload));}
 return {stats:async(pairs,axesFrom='predicted')=>(await call('pair_statistics','pairs','pairs',{axesFrom,pairs:pairs.map((p,i)=>({id:String(i),...p}))},'statistics')).pairs,noise:r=>call('noise_responses','request','noise',r,'responses'),dcp:r=>call('dcp_covariance','request','dcp',r,'dcp'),close:()=>h.destroy()};
}
export async function openApCovariance(){
 const req=createRequire(path.join(config.modulesRoot,'propagator/sdn-ap/package.json'));
 const {createStandaloneHarness}=await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
 const h=await createStandaloneHarness('browser','/opt/data/sdn-archive/operator-theory/ap/b040/module.wasm',{surface:'direct'});
 return {async carry(record,ends){
  let omm=new Uint8Array(Buffer.from(record.omm,'base64'));
  if(record.arm.startsWith('AP')){const u=S.readFitOmm(omm).u,fields=new Map(u.USER_DEFINED_PARAMETERS.map(x=>[x.PARAM_NAME,x]));const n=fields.get('SDNAP_COV_NOISE');if(!n)throw Error('AP fit has no covariance noise');const old=n.PARAM_VALUE.split(/\s+/).map(Number),row=covarianceConfig.apNoise.rows[fields.get('SDNAP_COV_REGIME')?.PARAM_VALUE==='DRAG'?0:1];n.PARAM_VALUE=[...row.slice(0,3),row[3]===0?0:old[3]*(row[3]/1.275e-6),old[4]].map(v=>v.toPrecision(17)).join(' ');const b=new S.flatbuffers.Builder(4096);S.OMM.OMM.finishOMMBuffer(b,u.pack(b));omm=b.asUint8Array();}
  const grid=S.oemBytes({frame:'GCRF',lines:ends.map(l=>({epoch:l.epoch,r:[0,0,0]}))});
  const r=await h.invoke({methodId:'propagate',inputs:[{portId:'omm',typeRef:S.TYPE('OMM'),payload:omm},{portId:'grid',typeRef:S.TYPE('OEM'),payload:grid},{portId:'configuration',typeRef:S.TYPE('PCF'),payload:Buffer.from(record.pcf,'base64')},...(record.weather?[{portId:'space_weather',typeRef:S.TYPE('SPW'),payload:Buffer.from(record.weather,'base64')}]:[])]});
  if(r.statusCode!==0)throw Error(r.errorMessage);
  const bytes=new Uint8Array(r.outputs.find(o=>o.portId==='ephemeris').payload),root=S.OEM.OEM.getRootAsOEM(new S.flatbuffers.ByteBuffer(bytes)).unpack(),b=root.EPHEMERIS_DATA_BLOCK[0];
  if(b.COVARIANCE_MATRIX_LINES?.length!==ends.length)throw Error('missing carried AP/XP covariance');
  return b.EPHEMERIS_DATA_LINES.map((l,i)=>({position:[l.X,l.Y,l.Z].map(x=>x*1000),velocity:[l.X_DOT,l.Y_DOT,l.Z_DOT].map(x=>x*1000),covariance:['CX_X','CY_X','CY_Y','CZ_X','CZ_Y','CZ_Z'].map(k=>b.COVARIANCE_MATRIX_LINES[i][k]*1e6),covarianceAxes:'INERTIAL'}));
 },close:()=>h.destroy?.()};
}
export async function openFfmCovariance(pairs){
 const {bytes,manifest}=pinned(config.modulesRoot,'propagator/ffm'),h=await createBrowserModuleHarness({wasmSource:bytes,manifest,surface:'direct'});
 const invoke=async(methodId,inputs)=>{const r=await h.invoke({methodId,inputs});if(r.statusCode!==0)throw Error(r.errorMessage);return r;};
 const E=XM3.environment,raw=fs.readFileSync(E.earthOrientation.file),kernelBytes=fs.readFileSync(E.kernel.path);if(hash(raw)!==E.earthOrientation.sha256||hash(kernelBytes)!==E.kernel.sha256)throw Error('FFM environment changed');
 const eop= P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(Buffer.from(JSON.parse(raw).inputs.earth_orientation_finals,'base64'))).unpack().EARTH_ORIENTATION.ROWS,kernel=kernelFrame(kernelBytes);
 return {async terms(record,cutoff,ends){
  const fit=record.fit,settings=record.settings,lo=Date.parse(fit.epoch)/86400000+40587-3,hi=Date.parse(ends.at(-1).epoch)/86400000+40587+3;
  const rows=eop.filter(r=>r.MJD>=lo&&r.MJD<=hi);if(!rows.length||rows.at(-1).MJD<hi-3)throw Error('no FFM Earth orientation');
  const typeRef={schemaName:'PRW.fbs',fileIdentifier:'$PRW',rootTypeName:'PRW'};
  const inputs=[kernel,{portId:'earth_orientation',typeRef,payload:encode('EARTH_ORIENTATION',Object.assign(new P.PRWEarthOrientationT(),{ROWS:rows}))},...(settings.forces.drag===false?[]:[{portId:'space_weather',typeRef,payload:encode('SPACE_WEATHER',Object.assign(new P.PRWSpaceWeatherTableT(),{ROWS:record.spw.map(r=>Object.assign(new P.SPWT(),r))}))}])];
  return windowTerms({ffm:{invoke},inputs},pairs,fit,Date.parse(cutoff),ends.map(l=>({L:l.day*24,line:l})),settings);
 },close:()=>h.destroy()};
}
