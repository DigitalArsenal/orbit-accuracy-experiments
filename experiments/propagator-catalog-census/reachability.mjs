// HTTP endpoint diagnostics, separate from acquisition and numerical inputs.
// A responding origin does not establish ephemeris availability or completeness.
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config,read,write,registration,runDir,iso } from './common.mjs';

const products={
  'spacex-starlink':'https://api.starlink.com/public-files/ephemerides/MANIFEST.txt',
  planet:'https://ephemerides.planet-labs.com/planet.states',
  iss:'https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.txt',
  'esa-pod':'https://navigation-office.esa.int/products/gnss-products/'
};
async function probe(request){
  const {source,scope,url}=request,checkedUtc=iso(Date.now());
  try{
    const r=await fetch(url,{method:request.method||'GET',headers:request.body?{'content-type':'application/json'}:{},body:request.body?JSON.stringify(request.body):undefined,signal:AbortSignal.timeout(15000)});
    const result={source,scope,url,checkedUtc,httpResponded:true,status:r.status,finalUrl:r.url,contentType:r.headers.get('content-type'),contentLength:r.headers.get('content-length')};
    await r.body?.cancel();return result;
  }catch(e){return {source,scope,url,checkedUtc,httpResponded:false,error:e.message,causeCode:e.cause?.code??null};}
}
export async function check(run){
  const reg=registration(),registry=read(config.registry.file),sources=Array.isArray(registry)?registry:registry.sources,fleet=read(config.registry.fleetFile);
  const requests=[...fleet.nodes,...fleet.reusedNodes].map(n=>({source:n.sourceId,scope:'local-provider-api',url:`${config.providerApi}:${n.apiPort}/api/v1/data/query`,method:'POST',body:{schema:'NCD.fbs',source_name:n.sourceId,provider_id:`ephemeris-provider:${n.sourceId}`,limit:1,offset:0}}));
  for(const s of sources)for(const url of products[s.source_id]?[products[s.source_id]]:s.origins)requests.push({source:s.source_id,scope:products[s.source_id]?'public-data-or-index':'upstream-origin-only',url});
  const probes=[];
  for(let i=0;i<requests.length;i+=4)probes.push(...await Promise.all(requests.slice(i,i+4).map(probe)));
  const result={...reg,checkedUtc:iso(Date.now()),classification:'HTTP endpoint diagnostics; no claim of full acquisition or source inventory',probes};
  write(path.join(runDir(run),'reachability.json'),result);
  for(const p of probes)console.log(JSON.stringify({source:p.source,scope:p.scope,url:p.url,status:p.status,causeCode:p.causeCode}));return result;
}
if(process.argv[1]===new URL(import.meta.url).pathname){const{values}=parseArgs({options:{run:{type:'string',default:'catalog-epochs'}}});await check(values.run);}
