// Typed module calls and record transport; no orbital dynamics in JavaScript.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {hash,modules} from '../guard.mjs';
import * as S from '../../xp-atmosphere-merit/lib/sds.mjs';
import {config as XM3,pinned} from '../../operator-theory/lib/xm3.mjs';
import {standalone} from '../../operator-theory/lib/ap.mjs';
import {encode,kernelFrame} from '../../operator-theory/lib/frame.mjs';
import * as P from 'spacedatastandards.org/lib/js/PRW/main.js';
import * as fb from 'flatbuffers';
import {createBrowserModuleHarness} from 'space-data-module-sdk/host/browser-module';
import {windowTerms} from './window-terms.mjs';
if(execFileSync('git',['show','2748823:experiments/five-day-ca/COVARIANCE.md'],{encoding:'utf8'}).trim()!==fs.readFileSync('experiments/five-day-ca/COVARIANCE.md','utf8').trim())throw Error('covariance registration changed');
export const covarianceConfig=JSON.parse(fs.readFileSync(new URL('../covariance-config.json',import.meta.url)));
for(const [file,pin]of Object.entries(covarianceConfig.constants))if(hash(fs.readFileSync(file))!==pin)throw Error(`covariance constants changed: ${file}`);
/** A registered module's wasm by git show at the modules commit that holds its bytes, SHA-256 checked: the working tree has moved past them. */
export function registeredWasm(rel,commit,sha256){const bytes=execFileSync('git',['-C',modules(),'show',`${commit}:${rel}/dist/isomorphic/module.wasm`],{maxBuffer:1<<28});if(hash(bytes)!==sha256)throw Error(`${rel} at ${commit} is ${hash(bytes)}, registered ${sha256}`);return bytes;}
/** analysis/gp-error-model as registered (covariance-config.json gpWasmSha256): the newest modules commit that writes those bytes. */
const GP_COMMIT='16f1ef67821ff7bc033e93150b16158f70131d4b';
export async function openPairStatistics(){
 const dir=path.join(modules(),'analysis/gp-error-model'),req=createRequire(path.join(dir,'package.json'));
 const bytes=registeredWasm('analysis/gp-error-model',GP_COMMIT,covarianceConfig.gpWasmSha256);
 const {createBrowserModuleHarness:make}=await import(pathToFileURL(req.resolve('space-data-module-sdk/testing')).href);
 const h=await make({wasmSource:bytes,surface:'direct'}),erm=await import(pathToFileURL(path.join(dir,'scripts/erm-codec.mjs')).href);
 async function call(method,port,type,value,output){const r=await h.invoke({methodId:method,inputs:[erm.frame(port,type,value)]});if(r.statusCode!==0)throw Error(r.errorMessage);return erm.decode(Buffer.from(r.outputs.find(o=>o.portId===output).payload));}
 return {stats:async(pairs,axesFrom='predicted')=>(await call('pair_statistics','pairs','pairs',{axesFrom,pairs:pairs.map((p,i)=>({id:String(i),...p}))},'statistics')).pairs,noise:r=>call('noise_responses','request','noise',r,'responses'),dcp:r=>call('dcp_covariance','request','dcp',r,'dcp'),close:()=>h.destroy()};
}
/** The process noise an AP set carries, by its typed fields: COV_PROPAGATION against the registered table's row (covariance-config.json apNoise,
 *  AP 0.4.1's shipped table, which the pinned build ships unchanged) of the set's COV_REALISM regime. The registered replacement of the noise is
 *  then the identity: the record flies as fitted, and a set that carries another table is refused. */
export function registeredNoise(ocm){
 const o=S.OCM.OCM.getRootAsOCM(new S.flatbuffers.ByteBuffer(ocm)).unpack(),p=o.COV_PROPAGATION,regime=o.COV_REALISM?.[0]?.REGIME;
 if(!p)throw Error('AP fit has no COV_PROPAGATION');
 const row=covarianceConfig.apNoise.rows[regime==='DRAG'?0:1],got=[p.NOISE_ECCENTRICITY_PER_DAY,p.NOISE_INCLINATION_PER_DAY,p.NOISE_MEAN_MOTION_RELATIVE,p.NON_GRAVITATIONAL_SHARE];
 if(got.some((v,i)=>v!==row[i]))throw Error(`AP fit's noise ${got.join(' ')} (${regime}) is not the registered ${covarianceConfig.apNoise.version} row ${row.join(' ')}`);
 return {regime,noise:got};
}
/** A flight $PCF: OUTPUT at explicit epochs (ISO UTC) in GCRF, the axes the carried covariance is read in. */
function gcrfPcfBytes(epochs){const t=new S.PCF.PCFT();t.OUTPUT=Object.assign(new S.PCF.PCFOutputT(),{FRAME:S.PCF.pcfOutputFrame.GCRF,EPOCHS:epochs});const b=new S.flatbuffers.Builder(1<<12);S.PCF.PCF.finishPCFBuffer(b,t.pack(b));return b.asUint8Array().slice();}
/** An AP or XP arm's fitted $OCM carried by propagator/sdn-ap at the pinned build to the lead endpoints: GCRF states and covariance (m, m2). */
export async function openApCovariance(){
 const h=await standalone('propagator/sdn-ap');
 return {async carry(record,ends){
  const ocm=new Uint8Array(Buffer.from(record.ocm,'base64'));
  if(record.arm.startsWith('AP'))registeredNoise(ocm);
  const r=await h.invoke({methodId:'propagate',inputs:[{portId:'ocm',typeRef:S.TYPE('OCM'),payload:ocm},{portId:'configuration',typeRef:S.TYPE('PCF'),payload:gcrfPcfBytes(ends.map(l=>l.epoch))}]});
  if(r.statusCode!==0)throw Error(r.errorMessage);
  const bytes=new Uint8Array(r.outputs.find(o=>o.portId==='ephemeris').payload),root=S.OEM.OEM.getRootAsOEM(new S.flatbuffers.ByteBuffer(bytes)).unpack(),b=root.EPHEMERIS_DATA_BLOCK[0];
  if(b.COVARIANCE_MATRIX_LINES?.length!==ends.length)throw Error('missing carried AP/XP covariance');
  return b.EPHEMERIS_DATA_LINES.map((l,i)=>({position:[l.X,l.Y,l.Z].map(x=>x*1000),velocity:[l.X_DOT,l.Y_DOT,l.Z_DOT].map(x=>x*1000),covariance:['CX_X','CY_X','CY_Y','CZ_X','CZ_Y','CZ_Z'].map(k=>b.COVARIANCE_MATRIX_LINES[i][k]*1e6),covarianceAxes:'INERTIAL'}));
 },close:()=>h.destroy?.()};
}
export async function openFfmCovariance(pairs){
 const {bytes,manifest}=pinned(modules(),'propagator/ffm'),h=await createBrowserModuleHarness({wasmSource:bytes,manifest,surface:'direct'});
 const invoke=async(methodId,inputs)=>{const r=await h.invoke({methodId,inputs});if(r.statusCode!==0)throw Error(r.errorMessage);return r;};
 const E=XM3.environment,raw=fs.readFileSync(E.earthOrientation.file),kernelBytes=fs.readFileSync(E.kernel.path);if(hash(raw)!==E.earthOrientation.sha256||hash(kernelBytes)!==E.kernel.sha256)throw Error('FFM environment changed');
 const eop= P.PRW.getSizePrefixedRootAsPRW(new fb.ByteBuffer(Buffer.from(JSON.parse(raw).inputs.earth_orientation_finals,'base64'))).unpack().EARTH_ORIENTATION.ROWS,kernel=kernelFrame(kernelBytes);
 return {async terms(record,cutoff,ends){
  const fit=record.fit,settings=record.settings,lo=Date.parse(fit.epoch)/86400000+40587-3,hi=Date.parse(ends.at(-1).epoch)/86400000+40587+3;
  const rows=eop.filter(r=>r.MJD>=lo&&r.MJD<=hi);if(!rows.length||rows.at(-1).MJD<hi-3)throw Error('no FFM Earth orientation');
  const typeRef={schemaName:'PRW.fbs',fileIdentifier:'$PRW',rootTypeName:'PRW'};
  const inputs=[kernel,{portId:'earth_orientation',typeRef,payload:encode('EARTH_ORIENTATION',Object.assign(new P.PRWEarthOrientationT(),{ROWS:rows}))},...(settings.forces.drag===false||!record.spw?[]:[{portId:'space_weather',typeRef,payload:encode('SPACE_WEATHER',Object.assign(new P.PRWSpaceWeatherTableT(),{ROWS:record.spw.map(r=>Object.assign(new P.SPWT(),r))}))}])];
  return windowTerms({ffm:{invoke},inputs},pairs,fit,Date.parse(cutoff),ends.map(l=>({L:l.day*24,line:l})),settings);
 },close:()=>h.destroy()};
}
