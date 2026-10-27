import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,read,write,sha,hashFile,runDir,iso} from '../common.mjs';
import {guard} from '../../propagator-published-truth/common.mjs';
export {root,read,write,sha,hashFile,iso};
export const here=path.dirname(fileURLToPath(import.meta.url)),settings=read(path.join(here,'config.json'));
export const sourceDir=runDir(settings.sourceRun),outputDir=runDir(settings.outputRun);
export const outcomePath=key=>path.join(outputDir,'outcomes',sha(key).slice(0,32)+'.json');
export function registration(modules,ffmModules){
  assert.equal(settings.frozen,true);const baseline=guard(modules),execution=read(path.join(sourceDir,'execution.json'));
  assert.equal(execution.executionId,settings.sourceExecutionId);assert.equal(hashFile(path.join(sourceDir,'census.json')),execution.censusHash);
  assert.equal(execFileSync('git',['-C',ffmModules,'rev-parse','HEAD']).toString().trim(),settings.ffmCommit);
  for(const [f,h]of Object.entries(settings.ffmFiles))assert.equal(hashFile(path.join(ffmModules,f)),h);
  const sourceHashes={};
  const files=['PLAN.md','config.json','common.mjs','engine.mjs','run.mjs'].map(f=>'experiments/propagator-catalog-census/ffm-bounded/'+f).concat([
    'experiments/propagator-catalog-census/common.mjs','experiments/propagator-catalog-census/arcs.mjs','experiments/propagator-catalog-census/environment.mjs',
    'experiments/propagator-published-truth/common.mjs','experiments/propagator-published-truth/config.json','experiments/propagator-published-truth/environment.mjs','experiments/propagator-published-truth/wire.mjs',
    'experiments/e6-public-observations/fit.mjs','experiments/e2-catalog-covariance/estimation-wire.mjs','harness/modules.mjs','harness/time.mjs','harness/ffm-execution.mjs','harness/records.mjs','harness/truth-gate.mjs','experiments/truth-gate/flags.json','package-lock.json']);
  for(const f of files){const b=fs.readFileSync(path.join(root,f));assert.ok(execFileSync('git',['-C',root,'show',`HEAD:${f}`],{maxBuffer:16<<20}).equals(b),`Committed ${f}`);sourceHashes[f]=sha(b);}
  const identity={sourceExecutionId:execution.executionId,censusHash:execution.censusHash,baseline,ffmCommit:settings.ffmCommit,ffmFiles:settings.ffmFiles,sourceHashes};
  return{...identity,amendmentId:sha(JSON.stringify(identity))};
}
