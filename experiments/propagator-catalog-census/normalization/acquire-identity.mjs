import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {root,read,write,sha,sourceDir,bodyOf,keyOf,storeBody,hashFile} from './common.mjs';
const exec=promisify(execFile),dir=path.join(root,'runs/propagator-catalog-census/direct-identity-20261027');
const inputs=[
  {id:'planet-matches',url:'https://ephemerides.planet-labs.com/18SPCS_matches_v1.txt'},
  {id:'igs-satellite-metadata',url:'https://files.igs.org/pub/station/general/igs_satellite_metadata.snx'},
  {id:'nasa-sp3-correspondence',url:'https://cddis.nasa.gov/sp3c_satlist.html'}
];
const sourceSha256=hashFile(new URL(import.meta.url)),planSha256=hashFile(new URL('./RECONCILIATION.md',import.meta.url));
async function get(item,transport){
  const file=path.join(dir,'receipts',`${item.id}-${transport}.json`);
  if(fs.existsSync(file)){const prior=read(file);if(prior.sourceSha256!==sourceSha256||prior.planSha256!==planSha256||prior.url!==item.url)throw Error('Stale acquisition receipt');if(prior.file)bodyOf(dir,prior);return prior;}
  const result={...item,transport,sourceSha256,planSha256,startedUtc:new Date().toISOString()};
  let tmp=null;
  try{
    let bytes;
    if(transport==='node-fetch'){
      const response=await fetch(item.url,{signal:AbortSignal.timeout(30000),headers:{'user-agent':'SDN-orbit-accuracy-research/1.0'}});
      result.status=response.status;result.finalUrl=response.url;
      result.headers=Object.fromEntries(['content-type','etag','last-modified'].filter(k=>response.headers.has(k)).map(k=>[k,response.headers.get(k)]));
      bytes=Buffer.from(await response.arrayBuffer());
    }else{
      tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ca-direct-retry-'));const output=path.join(tmp,'body');
      const {stdout}=await exec('curl',['--ipv4','--location','--max-time','30','--connect-timeout','20','--silent','--show-error','--output',output,'--write-out','%{http_code}\n%{url_effective}\n',item.url],{maxBuffer:1<<20});
      const [status,finalUrl]=stdout.trim().split('\n');result.status=Number(status);result.finalUrl=finalUrl;bytes=fs.readFileSync(output);
    }
    Object.assign(result,storeBody(dir,bytes));result.state=result.status===200&&bytes.length?'downloaded':'download_failed';
    if(result.state!=='downloaded')result.error=`HTTP ${result.status}`;
  }catch(e){result.state='download_failed';result.error=e.message;result.causeCode=e.cause?.code??e.code??null;}
  finally{if(tmp)fs.rmSync(tmp,{recursive:true});}
  result.finishedUtc=new Date().toISOString();write(file,result);console.log(JSON.stringify({id:item.id,transport,state:result.state,status:result.status,bytes:result.bytes,error:result.error}));return result;
}
const failed=read(path.join(sourceDir,'queue.json')).sources.flatMap(s=>s.resources).map(resource=>({resource,input:read(path.join(sourceDir,'outcomes',keyOf(resource)+'.json'))})).filter(x=>x.input.receipt.state!=='downloaded');
const retries=failed.map(({resource,input})=>({id:`retry-${keyOf(resource)}`,url:resource.URL,source:resource.SOURCE_ID,resourceKey:keyOf(resource),originalReceiptSha256:hashFile(path.join(sourceDir,'outcomes',keyOf(resource)+'.json')),originalState:input.receipt.state}));
const receipts=await Promise.all([...inputs.map(item=>get(item,'node-fetch')),...retries.flatMap(item=>['node-fetch','curl-ipv4'].map(transport=>get(item,transport)))]);
write(path.join(dir,'manifest.json'),{sourceSha256,planSha256,inputs,retries,receipts:receipts.map(r=>({id:r.id,transport:r.transport,state:r.state,sha256:r.sha256??null,status:r.status??null,error:r.error??null}))});
