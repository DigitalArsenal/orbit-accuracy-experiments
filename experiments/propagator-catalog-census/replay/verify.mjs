// Full-census runtime replay E2E, retaining all original and replacement outcomes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {parseArgs,isDeepStrictEqual} from 'node:util';
import {root,config,read,write,hashFile,iso} from '../common.mjs';
import {execution,outcomeFile} from '../run.mjs';
import {select} from '../arcs.mjs';
import {report} from '../report.mjs';
import {verify} from '../verify.mjs';
import {settings,registered,prepare} from './common.mjs';

const {values}=parseArgs({options:{modules:{type:'string'}}});
if(!values.modules)throw Error('--modules required');
const amendment=registered(),{dir,source}=prepare(),manifest=execution(dir,values.modules),state=read(path.join(dir,'replay-execution.json')),census=read(path.join(dir,'census.json'));
assert.equal(manifest.executionId,execution(source,values.modules).executionId);
assert.equal(state.amendmentId,amendment.amendmentId);assert.equal(state.executionId,manifest.executionId);
assert.equal(state.total,census.objects.length);assert.equal(state.completed,state.total);assert.equal(state.errors.length,0);
assert(!fs.existsSync(path.join(source,'runner.lock')),'Original run is still active; comparison must wait for its complete results');
const counts={},differences=[],regressions=[],failures={},perObject=[],priorHashes={},replayHashes={};let native=0,metadata=0;
const count=(map,key)=>{map[key]=(map[key]??0)+1;};
for(const object of census.objects){
  const aFile=outcomeFile(source,object.key),bFile=outcomeFile(dir,object.key),a=read(aFile),b=read(bFile);
  assert.equal(a.key,object.key);assert.equal(b.key,object.key);assert(a.finishedUtc);assert(b.finishedUtc);
  assert.equal(a.executionId,manifest.executionId);assert.equal(b.executionId,manifest.executionId);
  assert(b.startedUtc>=state.startedUtc,`Borrowed source result: ${object.key}`);
  priorHashes[object.key]=hashFile(aFile);replayHashes[object.key]=hashFile(bFile);
  const selected=select(object,census);if(selected.status==='metadata_eligible')native++;else metadata++;
  count(counts,`object: ${a.status} -> ${b.status}`);
  if(a.status==='evaluated'&&b.status==='evaluated'){
    assert.deepEqual(Object.keys(b.arms),config.arms);
    for(const arm of config.arms){
      const before=a.arms[arm],after=b.arms[arm];count(counts,`${arm}: ${before.status}/${!!before.ok} -> ${after.status}/${!!after.ok}`);
      if(before.ok&&!after.ok)regressions.push({key:object.key,arm,reason:after.reason});
      if(!after.ok)count(failures,`${arm}: ${after.status}: ${after.reason??'(no reason)'}`);
      if(before.ok&&after.ok&&(!isDeepStrictEqual(before.fit,after.fit)||!isDeepStrictEqual(before.days,after.days))){
        differences.push({key:object.key,arm,fitEqual:isDeepStrictEqual(before.fit,after.fit),scoresEqual:isDeepStrictEqual(before.days,after.days)});
      }
      perObject.push({key:object.key,arm,before:before.status,after:after.status,beforeOk:!!before.ok,afterOk:!!after.ok});
    }
  }
}
assert.equal(native,state.nativeCompleted);assert.equal(metadata,state.metadataCompleted);
const audit={executionId:manifest.executionId,amendmentId:amendment.amendmentId,sourceRun:settings.sourceRun,replayRun:settings.replayRun,sourceObjects:census.objects.length,nativeObjects:native,metadataObjects:metadata,statusTransitions:counts,remainingArmFailures:failures,successfulResultDifferences:differences.length,previousSuccessNowFailed:regressions.length,checkedUtc:iso(Date.now())};
write(path.join(dir,'replay-comparison.json'),{...audit,differences,regressions,perObject,priorHashes,replayHashes});
write(path.join(root,'results',config.id,'runtime-replay.json'),audit);
assert.equal(differences.length,0,'Previously successful fit/score results changed; inspect the preserved detailed audit before any accuracy conclusion');
assert.equal(regressions.length,0,'Previously successful results now fail; inspect the preserved audit');
report(settings.replayRun);
await verify(settings.replayRun,values.modules);
await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,[new URL('../direct/verify.mjs',import.meta.url).pathname,'--run','direct-20261026-r2','--modules',values.modules],{cwd:root,stdio:'inherit'});
  p.once('error',reject);p.once('exit',(code,signal)=>code===0?resolve():reject(Error(`Direct archive E2E: exit ${code}, ${signal}`)));
});
console.log(`FULL RUNTIME REPLAY E2E PASS: ${native} fresh-process objects, ${metadata} metadata outcomes, ${differences.length} changed successful results`);
