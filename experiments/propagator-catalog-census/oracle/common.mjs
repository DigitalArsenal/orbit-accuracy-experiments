import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,read,write,sha,hashFile,runDir,iso,config as censusConfig} from '../common.mjs';
import {guard} from '../../propagator-published-truth/common.mjs';
export {root,read,write,sha,hashFile,iso};
export const here=path.dirname(fileURLToPath(import.meta.url));
export const settings=read(path.join(here,'config.json'));
export const sourceDir=runDir(settings.sourceRun),outputDir=runDir(settings.outputRun);
export const outcomePath=key=>path.join(outputDir,'outcomes',`${sha(key).slice(0,32)}.json`);
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{maxBuffer:32<<20});
export function registration(modules,oracleRoot){
  if(!settings.frozen)throw Error('Unregistered reference extension');
  const baseline=guard(modules),source=read(path.join(sourceDir,'execution.json'));
  if(source.executionId!==settings.sourceExecutionId)throw Error('Wrong completed census execution');
  if(git(oracleRoot,'rev-parse','HEAD').toString().trim()!==settings.oracleCommit)throw Error('Wrong black-box harness revision');
  if(git(oracleRoot,'status','--porcelain','--untracked-files=no').toString().trim())throw Error('Modified black-box harness checkout');
  const files=['PLAN.md','config.json','common.mjs','engine.mjs','run.mjs'];
  const sourceHashes={};
  for(const file of files){
    const relative=`experiments/propagator-catalog-census/oracle/${file}`,bytes=fs.readFileSync(path.join(here,file));
    if(!git(root,'show',`HEAD:${relative}`).equals(bytes))throw Error(`Uncommitted extension source: ${file}`);
    sourceHashes[relative]=sha(bytes);
  }
  const helpers=['harness/modules.mjs','harness/frames.mjs','harness/records.mjs','harness/truth-gate.mjs',
    'experiments/truth-gate/flags.json','experiments/propagator-catalog-census/arcs.mjs',
    'experiments/propagator-catalog-census/common.mjs','experiments/propagator-published-truth/wire.mjs',
    'experiments/propagator-published-truth/common.mjs','experiments/propagator-published-truth/config.json'];
  for(const file of helpers){
    const bytes=fs.readFileSync(path.join(root,file));
    if(!git(root,'show',`HEAD:${file}`).equals(bytes))throw Error(`Modified helper: ${file}`);
    sourceHashes[file]=sha(bytes);
  }
  for(const file of ['propagator/sdn-ap/test/lib/tle.mjs','propagator/sdn-ap/test/lib/module.mjs','analysis/gp-error-model/scripts/erm-codec.mjs']){
    const bytes=fs.readFileSync(path.join(modules,file));
    if(!git(modules,'show',`HEAD:${file}`).equals(bytes))throw Error(`Modified module helper: ${file}`);
    sourceHashes[`modules:${file}`]=sha(bytes);
  }
  const censusHash=hashFile(path.join(sourceDir,'census.json'));
  if(censusHash!==source.censusHash)throw Error('Frozen census hash changed');
  const identity={sourceExecutionId:source.executionId,censusHash,moduleCommit:censusConfig.moduleCommit,
    oracleCommit:settings.oracleCommit,oracleVersion:settings.oracleVersion,oraclePackageSha256:settings.oraclePackageSha256,
    sourceHashes,baseline,packageLocks:{experiment:hashFile(path.join(root,'package-lock.json')),
      xp:hashFile(path.join(modules,'propagator/sdn-ap/package-lock.json'))}};
  return {...identity,extensionId:sha(JSON.stringify(identity)),experimentCommit:git(root,'rev-parse','HEAD').toString().trim()};
}
