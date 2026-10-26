// Generic transport around the published portable module. No host adapter,
// fixture storage, IPFS placeholder, orbit arithmetic or physical conversion.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
export async function wire(modules){
  const moduleRoot=path.join(modules,'data-source/ephemeris-source'),req=createRequire(path.join(moduleRoot,'package.json'));
  const api=await import(pathToFileURL(req.resolve('space-data-module-sdk/host/browser-module')));
  const {decodeHttpRequest,encodeHttpResponse}=await import(pathToFileURL(req.resolve('space-data-module-sdk/runtime-contracts')));
  // This pinned file provides SDS SRG framing only; no fixture is invoked.
  const {srgPort,readSrg,srg,TYPE}=await import(pathToFileURL(path.join(moduleRoot,'tests/harness.mjs')));
  const {ByteBuffer}=req('flatbuffers'),{CAT}=await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/CAT/main.js')));
  const host=await api.createBrowserModuleHarness({wasmSource:fs.readFileSync(path.join(moduleRoot,'dist/isomorphic/module.wasm')),manifest:JSON.parse(fs.readFileSync(path.join(moduleRoot,'plugin-manifest.json'))),surface:'direct'});
  async function invoke(methodId,inputs){const r=await host.invoke({methodId,inputs});if(r.statusCode!==0)throw Error(`${methodId}: ${r.errorCode}: ${r.errorMessage}`);return r.outputs;}
  const settings=(id,epoch)=>srgPort('settings',{settings:{SOURCE_ID:id,EPOCH_MS:BigInt(epoch),MAX_BYTES:33554432n,TIMEOUT_MS:30000}});
  const response=(portId,rec,body,context)=>({portId,typeRef:TYPE.HRSP,payload:encodeHttpResponse({url:rec.url,status:rec.status??0,body,context,retrievedMs:Date.parse(rec.retrievedUtc),headers:rec.headers??{},error:rec.error})});
  return {
    async plan(id,epoch){return (await invoke('plan_source_requests',[settings(id,epoch)])).filter(x=>x.portId==='requests').map(x=>decodeHttpRequest(x.payload));},
    async discover(id,epoch,listings){const out=await invoke('discover_sources',[settings(id,epoch),...listings.map(x=>response('responses',x,x.body))]);return out.filter(x=>x.portId==='resources').flatMap(x=>readSrg(x.payload).RESOURCES??[]);},
    async validate(resource,rec,body){
      const out=await invoke('describe_coverage',[response('response',rec,body,srg({resources:[resource]}))]),identities=[];
      for(const frame of out.filter(x=>x.portId==='catalog'))for(let at=0;at<frame.payload.length;){const bytes=frame.payload,n=new DataView(bytes.buffer,bytes.byteOffset+at,4).getUint32(0,true)+4;if(n<12||at+n>bytes.length)throw Error('Invalid CAT framing');const row=CAT.getSizePrefixedRootAsCAT(new ByteBuffer(bytes.slice(at,at+n)));identities.push({objectId:row.OBJECT_ID(),name:row.OBJECT_NAME()});at+=n;}
      return {rawValidation:'passed',identityCoverage:identities.length?'declared':'not_provided_by_module',identities};
    },
    close:()=>host.destroy()
  };
}
