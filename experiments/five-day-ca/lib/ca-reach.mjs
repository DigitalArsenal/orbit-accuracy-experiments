// Request encoding only. Gaussian integration and maximum Pc run in the module.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {config,hash} from '../guard.mjs';
export const wasmSha256='0cc09d7b1399b5037392004327b40c70f76d3150ddfcd303636039a77d936a6a';
export async function openPc(){
 const dir=path.join(config.modulesRoot,'analysis/conjunction-assessment'),req=createRequire(path.join(dir,'package.json'));
 const bytes=fs.readFileSync(path.join(dir,'dist/isomorphic/module.wasm'));
 if(hash(bytes)!==wasmSha256)throw Error('conjunction-assessment artifact changed');
 const {createBrowserModuleHarness}=await import(pathToFileURL(req.resolve('space-data-module-sdk/testing')).href);
 const fb=await import(pathToFileURL(req.resolve('flatbuffers')).href);
 const C=await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/CQR/main.js')).href);
 const h=await createBrowserModuleHarness({wasmSource:bytes,surface:'direct',enableThreads:true});
 return {close:()=>h.destroy(),async pc(cov,hbr,miss=[0,0],maximum=false){
  const b=new fb.Builder(512),record=new C.CQRT();
  record.PROBABILITY_REQUEST=new C.CQRProbabilityRequestT(new C.CQRPlaneGeometryT(miss[0],miss[1],cov[0],cov[1],cov[2],hbr),maximum?C.cqrProbabilityAlgorithm.ALFANO_MAXIMUM:C.cqrProbabilityAlgorithm.FOSTER);
  C.CQR.finishCQRBuffer(b,record.pack(b));
  const r=await h.invoke({methodId:'compute_pc',inputs:[{portId:'request',typeRef:{schemaName:'CQR.fbs',fileIdentifier:'$CQR',rootTypeName:'CQR',wireFormat:'flatbuffer'},payload:b.asUint8Array()}]});
  if(r.statusCode!==0)throw Error(r.errorMessage);
  const p=C.CQR.getRootAsCQR(new fb.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack().PROBABILITY_RESULT;
  const value=maximum?p.MAXIMUM_PROBABILITY:p.PROBABILITY;
  if(!p.CONVERGED||!Number.isFinite(value))throw Error('Pc did not converge');
  if(value<0||value>1)throw Error('Pc outside probability bounds');
  return value;
 }};
}
