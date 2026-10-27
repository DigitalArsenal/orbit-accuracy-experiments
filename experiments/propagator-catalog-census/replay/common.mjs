import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {root,read,sha,hashFile,runDir} from '../common.mjs';

export const here=path.dirname(fileURLToPath(import.meta.url));
export const settings=read(path.join(here,'config.json'));
export function registered(){
  if(!settings.frozen||settings.objectCap!==null||settings.reuseSourceOutcomes)throw Error('Invalid replay registration');
  const sourceHashes={};
  for(const file of fs.readdirSync(here).filter(f=>/\.(mjs|json|md)$/.test(f)).sort()){
    const rel=path.relative(root,path.join(here,file)),bytes=fs.readFileSync(path.join(here,file));
    if(!bytes.equals(execFileSync('git',['-C',root,'show',`HEAD:${rel}`])))throw Error(`Uncommitted replay source: ${file}`);
    sourceHashes[rel]=sha(bytes);
  }
  return {sourceHashes,amendmentId:sha(JSON.stringify(sourceHashes)),experimentCommit:execFileSync('git',['-C',root,'rev-parse','HEAD']).toString().trim()};
}
export function prepare(){
  const source=runDir(settings.sourceRun),dir=runDir(settings.replayRun);
  if(source===dir)throw Error('Replay must preserve original run');
  fs.mkdirSync(dir,{recursive:true});
  for(const file of ['census.json','census.sha256.json','execution.json','operator-epoch-audit.json','reachability.json']){
    const a=path.join(source,file),b=path.join(dir,file);
    if(!fs.existsSync(a)){if(['census.json','census.sha256.json','execution.json'].includes(file))throw Error(`Missing ${a}`);continue;}
    if(!fs.existsSync(b))fs.linkSync(a,b);
    if(hashFile(a)!==hashFile(b))throw Error(`Replay input differs: ${file}`);
  }
  const environment=path.join(dir,'environment');
  if(!fs.existsSync(environment))fs.symlinkSync(path.join(source,'environment'),environment,'dir');
  if(fs.realpathSync(environment)!==fs.realpathSync(path.join(source,'environment')))throw Error('Replay environment differs');
  return {source,dir};
}
