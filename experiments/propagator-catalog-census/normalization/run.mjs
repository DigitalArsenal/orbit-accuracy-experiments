import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {openReaders} from './native.mjs';
import {root,read,write,sha,bodyOf,keyOf,storeBody,config,sourceDir,outputDir,registration,hashFile} from './common.mjs';
const {values}=parseArgs({options:{modules:{type:'string'},preflight:{type:'boolean'}}});
if(!values.modules)throw Error('--modules required');
const manifest=registration(path.resolve(values.modules));
fs.mkdirSync(outputDir,{recursive:true});
const lock=path.join(outputDir,'runner.lock');const lockFd=fs.openSync(lock,'wx');fs.writeFileSync(lockFd,JSON.stringify({pid:process.pid,command:process.argv,startedUtc:new Date().toISOString()}));fs.closeSync(lockFd);
const readers=await openReaders(path.resolve(values.modules));
try{
  const prior=path.join(outputDir,'manifest.json');
  if(fs.existsSync(prior)&&read(prior).normalizationId!==manifest.normalizationId)throw Error('Existing inventory identity differs');
  write(prior,manifest);
  const sources=read(path.join(sourceDir,'queue.json')).sources,all=sources.flatMap(s=>s.resources),seen=new Set();
  const selected=values.preflight?all.filter(r=>{const k=`${r.SOURCE_ID}/${r.FORMAT}`;if(seen.has(k))return false;seen.add(k);return true;}):all;
  let done=0;const statusCounts={},cache=new Map();
  for(const r of selected){
    const key=keyOf(r),inputFile=path.join(sourceDir,'outcomes',`${key}.json`),inputHash=hashFile(inputFile),original=read(inputFile);
    if(JSON.stringify(original.resource)!==JSON.stringify(r))throw Error(`Queue/receipt resource differs: ${key}`);
    const outfile=path.join(outputDir,'outcomes',`${key}.json`);
    let result;
    if(fs.existsSync(outfile)){
      result=read(outfile);if(result.normalizationId!==manifest.normalizationId||result.inputReceiptSha256!==inputHash)throw Error(`Stale inventory result: ${key}`);
    }else{
      result={normalizationId:manifest.normalizationId,resource:r,inputReceiptSha256:inputHash,rawSha256:original.receipt.sha256??null,
        rawBytes:original.receipt.bytes??null,retrievedUtc:original.receipt.retrievedUtc??null};
      if(original.receipt.state!=='downloaded')Object.assign(result,{status:'download_unavailable',reason:original.receipt.error??`HTTP ${original.receipt.status}`,identities:[],states:0});
      else try{
        const bytes=bodyOf(sourceDir,original.receipt),cacheKey=sha(`${r.FORMAT}\n${r.RESOURCE_ID}\n${original.receipt.sha256}`);
        if(cache.has(cacheKey)){
          const old=cache.get(cacheKey);Object.assign(result,old.value,{duplicateOfResource:old.key});
        }else{
          const decoded=await readers.read(r,bytes),artifacts=decoded.artifacts.map(a=>({name:a.name,portId:a.portId,...storeBody(outputDir,a.bytes)}));
          const value={...decoded,artifacts};
          if(value.sidecar){value.sidecarArtifact=storeBody(outputDir,Buffer.from(JSON.stringify(value.sidecar)));delete value.sidecar;}
          Object.assign(result,value);cache.set(cacheKey,{key,value});
        }
      }catch(error){Object.assign(result,{status:'normalization_failed',reason:String(error.stack??error),identities:[],states:0});}
      write(outfile,result);
    }
    done++;statusCounts[result.status]=(statusCounts[result.status]??0)+1;
    if(done%50===0||done===selected.length){const progress={normalizationId:manifest.normalizationId,mode:values.preflight?'one-resource-per-source-format':'all-resources',completed:done,total:selected.length,population:all.length,statusCounts,updatedUtc:new Date().toISOString(),completeResourceAccounting:!values.preflight&&done===all.length};write(path.join(outputDir,'progress.json'),progress);console.log(JSON.stringify(progress));}
  }
  write(path.join(outputDir,'loaded-readers.json'),readers.provenance());
}finally{await readers.close();fs.unlinkSync(lock);}
