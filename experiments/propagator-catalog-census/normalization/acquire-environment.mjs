import fs from 'node:fs';
import path from 'node:path';
import {root,read,write,bodyOf,storeBody,hashFile} from './common.mjs';
const dir=path.join(root,'runs/propagator-catalog-census/direct-environment-20261027');
const sources=[{id:'iers-finals',url:'https://datacenter.iers.org/data/9/finals2000A.all'},{id:'usno-finals',url:'https://maia.usno.navy.mil/ser7/finals2000A.all'}];
const sourceSha256=hashFile(new URL(import.meta.url)),planSha256=hashFile(new URL('./PHYSICAL-NORMALIZATION.md',import.meta.url));
for(const source of sources){
  const file=path.join(dir,'receipts',source.id+'.json');
  if(fs.existsSync(file)){const r=read(file);if(r.sourceSha256!==sourceSha256||r.planSha256!==planSha256)throw Error('Changed acquisition');if(r.file)bodyOf(dir,r);continue;}
  const r={...source,sourceSha256,planSha256,retrievedUtc:new Date().toISOString()};
  try{const response=await fetch(source.url,{signal:AbortSignal.timeout(30000),headers:{'user-agent':'SDN-orbit-accuracy-research/1.0'}});r.status=response.status;r.finalUrl=response.url;
    r.headers=Object.fromEntries(['content-type','last-modified','etag'].filter(k=>response.headers.has(k)).map(k=>[k,response.headers.get(k)]));
    const bytes=Buffer.from(await response.arrayBuffer());Object.assign(r,storeBody(dir,bytes));
    r.state=response.status===200&&bytes.length?'downloaded':'download_failed';if(r.state!=='downloaded')r.error=`HTTP ${response.status}`;
  }catch(e){r.state='download_failed';r.error=e.message;r.causeCode=e.cause?.code??e.code??null;}
  write(file,r);console.log(JSON.stringify({id:r.id,state:r.state,status:r.status,bytes:r.bytes,sha256:r.sha256,error:r.error}));
}
