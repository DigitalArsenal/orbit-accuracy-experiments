import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {root,read,write,sha,sourceDir,outputDir,bodyOf,keyOf,hashFile,registration} from './common.mjs';
import {openReaders,summarize} from './native.mjs';
import {aggregate} from './report.mjs';
const {values}=parseArgs({options:{modules:{type:'string'}}});
if(!values.modules)throw Error('--modules required');
const manifest=read(path.join(outputDir,'manifest.json')),current=registration(path.resolve(values.modules));
assert.equal(current.normalizationId,manifest.normalizationId,'Pinned input and reader identity');
const queue=read(path.join(sourceDir,'queue.json')),all=queue.sources.flatMap(s=>s.resources),seen=new Set(),replays=[];
assert.equal(new Set(all.map(keyOf)).size,all.length,'Resource keys unique within source namespace');
assert.equal(fs.readdirSync(path.join(outputDir,'outcomes')).filter(f=>f.endsWith('.json')).length,all.length,'No missing or extra outcomes');
const verified=new Set(),problems=[],counts={resources:0,rawFiles:0,artifacts:0,sourceEpochs:0,sourceEpochMismatches:0,sourceNonIncreasingEpochs:0};
const checkedBody=(dir,record,kind)=>{const key=dir+'/'+record.file;if(verified.has(key))return null;const bytes=bodyOf(dir,record);verified.add(key);counts[kind]++;return bytes;};
const epochMs=text=>{const m=/^(\d{4})(\d{3})(\d{2})(\d{2})(\d{2}(?:\.\d+)?)$/.exec(text);if(!m)throw Error(`Invalid raw epoch ${text}`);return Date.UTC(+m[1],0,+m[2],+m[3],+m[4])+Math.round(+m[5]*1000);};
for(const resource of all){
  const key=keyOf(resource),inputFile=path.join(sourceDir,'outcomes',key+'.json'),input=read(inputFile),result=read(path.join(outputDir,'outcomes',key+'.json'));
  assert.equal(result.normalizationId,manifest.normalizationId);assert.equal(result.inputReceiptSha256,hashFile(inputFile));assert.deepEqual(result.resource,resource);
  if(input.receipt.state!=='downloaded'){assert.equal(result.status,'download_unavailable');counts.resources++;continue;}
  checkedBody(sourceDir,input.receipt,'rawFiles');assert.equal(result.rawSha256,input.receipt.sha256);
  const actualBlocks=[];
  for(const artifact of result.artifacts??[]){const bytes=checkedBody(outputDir,artifact,'artifacts')??bodyOf(outputDir,artifact);if(artifact.portId!=='descriptor')actualBlocks.push(...summarize(bytes));}
  if(result.blocks){
    assert.equal(actualBlocks.length,result.blocks.length);
    for(let i=0;i<actualBlocks.length;i++){const {sourceStateVectorSize,velocityAvailable,...prior}=result.blocks[i];assert.deepEqual(actualBlocks[i],prior);}
  }
  if(result.sidecarArtifact){
    const sidecar=JSON.parse((checkedBody(outputDir,result.sidecarArtifact,'artifacts')??bodyOf(outputDir,result.sidecarArtifact)).toString());
    if(sidecar.epochs){
      assert.equal(sidecar.epochs.length,result.states);assert.equal(result.blocks.length,1);
      const block=result.blocks[0],start=Date.parse(block.first),step=block.stepSeconds*1000;let mismatches=0,nonIncreasing=0,prior=-Infinity;
      for(let i=0;i<sidecar.epochs.length;i++){const t=epochMs(sidecar.epochs[i]);if(t!==start+i*step)mismatches++;if(t<=prior)nonIncreasing++;prior=t;}
      counts.sourceEpochs+=sidecar.epochs.length;counts.sourceEpochMismatches+=mismatches;counts.sourceNonIncreasingEpochs+=nonIncreasing;
      if(mismatches||nonIncreasing)problems.push({key,source:resource.SOURCE_ID,resourceId:resource.RESOURCE_ID,status:'source_epoch_not_preserved',mismatches,nonIncreasing});
    }
  }
  const replayKey=resource.SOURCE_ID+'/'+resource.FORMAT;if(!seen.has(replayKey)){seen.add(replayKey);replays.push({resource,result,input});}
  counts.resources++;if(counts.resources%1000===0)console.log(JSON.stringify({stage:'retained-byte-verification',...counts}));
}
const readers=await openReaders(path.resolve(values.modules)),replayed=[];
try{for(const {resource,result,input}of replays){
  const actual=await readers.read(resource,bodyOf(sourceDir,input.receipt)),{artifacts,sidecar,...summary}=actual;
  const {normalizationId,inputReceiptSha256,rawSha256,rawBytes,retrievedUtc,resource:_,artifacts:priorArtifacts,sidecarArtifact,sidecar:oldSidecar,duplicateOfResource,...expected}=result;
  assert.deepEqual(summary,expected,`Reader replay summary ${resource.SOURCE_ID}/${resource.FORMAT}`);
  assert.equal(artifacts.length,priorArtifacts.length);
  for(let i=0;i<artifacts.length;i++){assert.equal(sha(artifacts[i].bytes),priorArtifacts[i].sha256);assert.equal(artifacts[i].portId,priorArtifacts[i].portId);}
  if(sidecar)assert.equal(sha(Buffer.from(JSON.stringify(sidecar))),sidecarArtifact.sha256);
  replayed.push({source:resource.SOURCE_ID,format:resource.FORMAT,key:keyOf(resource),status:result.status});
}}finally{await readers.close();}
const summary=aggregate();assert.equal(summary.completeResourceAccounting,true);
const evidence={schema:'direct-inventory-verification',normalizationId:manifest.normalizationId,accountingAndReplay:'PASS',
  scientificAdmission:problems.length?'SOURCE_EPOCH_LOSS_RETAINED':'PENDING_PHYSICAL_AND_IDENTITY_CHECKS',counts,replayed,problems,
  verifierSha256:hashFile(new URL(import.meta.url)),outcomeHashesSha256:summary.provenance.outcomeHashesSha256,
  limitations:['Hashes and exact reader replay establish retained-input reproducibility, not physical truth or covariance calibration.',
    'All source epoch mismatches remain exclusions until the separately registered corrected reader is applied.']};
write(path.join(root,'results/propagator-catalog-census/normalization/verification.json'),evidence);
console.log(JSON.stringify({accountingAndReplay:evidence.accountingAndReplay,scientificAdmission:evidence.scientificAdmission,counts,replayed:replayed.length,epochProblemResources:problems.length}));
