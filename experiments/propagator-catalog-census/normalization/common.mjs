import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,read,write,sha,runDir,bodyOf,keyOf,storeBody} from '../direct/common.mjs';
export {root,read,write,sha,bodyOf,keyOf,storeBody};
export const here=path.dirname(fileURLToPath(import.meta.url)),config=read(path.join(here,'config.json'));
export const sourceDir=runDir(config.sourceRun),outputDir=runDir(config.outputRun);
export const hashFile=f=>sha(fs.readFileSync(f));
const git=(dir,...a)=>execFileSync('git',['-C',dir,...a],{maxBuffer:32<<20});
export function registration(modules){
  const queue=read(path.join(sourceDir,'queue.json')),manifest=read(path.join(sourceDir,'manifest.json'));
  if(hashFile(path.join(sourceDir,'queue.json'))!==config.queueSha256||manifest.queueSha256!==config.queueSha256)throw Error('Direct queue pin differs');
  if(git(modules,'rev-parse','HEAD').toString().trim()!==config.modulesCommit)throw Error('Module revision differs');
  for(const [f,h]of Object.entries(config.moduleFiles))if(hashFile(path.join(modules,f))!==h)throw Error(`Module pin differs: ${f}`);
  const sources=['PLAN.md','config.json','common.mjs','native.mjs','run.mjs'],sourceHashes={};
  for(const f of sources){const relative=path.relative(root,path.join(here,f)),bytes=fs.readFileSync(path.join(here,f));
    if(!git(root,'show',`HEAD:${relative}`).equals(bytes))throw Error(`Uncommitted normalizer: ${f}`);sourceHashes[relative]=sha(bytes);}
  for(const f of config.helpers){const bytes=fs.readFileSync(path.join(root,f));if(!git(root,'show',`HEAD:${f}`).equals(bytes))throw Error(`Modified helper: ${f}`);sourceHashes[f]=sha(bytes);}
  const identity={moduleCommit:config.modulesCommit,moduleFiles:config.moduleFiles,queueSha256:config.queueSha256,sourceHashes,
    packageLockSha256:hashFile(path.join(root,'package-lock.json')),stage:'native-frame-inventory-not-scoring'};
  return {...identity,normalizationId:sha(JSON.stringify(identity)),experimentCommit:git(root,'rev-parse','HEAD').toString().trim(),
    population:queue.sources.reduce((n,s)=>n+s.resources.length,0),sourceEntries:queue.sources.length};
}
