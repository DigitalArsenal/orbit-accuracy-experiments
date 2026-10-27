import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {root,read,write,sha,sourceDir,outputDir,keyOf,bodyOf,storeBody,hashFile} from './common.mjs';
export {root,read,write,sha,sourceDir,outputDir,keyOf,bodyOf,storeBody,hashFile};
export const base=path.join(root,'runs/propagator-catalog-census'),dir=path.join(base,'operator-physical-20261027'),starDir=path.join(base,'starlink-covariance-20261027'),sp3Dir=path.join(base,'sp3-physical-20261027');
export const identityFile=path.join(base,'direct-identity-20261027/reconciled-identities.json'),sesFile=path.join(root,'results/propagator-catalog-census/normalization/ses-identity-history.json');
export const resourceList=()=>read(path.join(sourceDir,'queue.json')).sources.flatMap(s=>s.resources);
export const outcomePath=r=>path.join(dir,'outcomes',keyOf(r)+'.json');
export const candidate=r=>['starlink-meme','ccsds-oem-kvn','ses-i11'].includes(r.FORMAT);
export function registration(modules){
  const moduleCommit='cb22348f2c674e8920716af09f7ca2a6a87f5f28',moduleFiles={
    'foundation/frames/dist/isomorphic/module.wasm':'486acaa334705b97d3a975b8a3d90f4bfd2428af77c6b5086c970ed1f24e27a4',
    'foundation/frames/plugin-manifest.json':'c909a9fa03ced3cf6415f53994d9eb393d661c92d961911206afef7384a56e18',
    'analysis/gp-error-model/dist/isomorphic/module.wasm':'a7a0e21805d50737b6f0c84b89a9ee6e7b981668d8cbe321c36217228f1d76f7',
    'analysis/gp-error-model/plugin-manifest.json':'b171f37c0f553ce6c47d1bd8183857d0eb61b0f8ab908b83965b05b97e2f455e'};
  assert.equal(execFileSync('git',['-C',modules,'rev-parse','HEAD']).toString().trim(),moduleCommit);
  for(const [f,h]of Object.entries(moduleFiles))assert.equal(hashFile(path.join(modules,f)),h);
  const pins={
    [path.join(sourceDir,'queue.json')]:'a894aba45e241f5f0820cb29b58c7ae71472e5e47dd5b25df869b0960cc9806a',
    [identityFile]:'d42519075746a901b66656fa60bc3a555ae7f0011ca89c1c1518a12a13237f69',
    [sesFile]:'d78df8db25cbde9203e0b81def45e28026222e850a0f4e5c7a6ca8f89eae5386',
    [path.join(sp3Dir,'earth-orientation.json')]:'8e754b70ed44765dde37f50328544a8c547c3d626c26502a743c04bc91b48e9e'};
  // Immutable source identities as well as bytes are checked before execution.
  const inputHashes={};for(const [f,h]of Object.entries(pins)){assert.equal(hashFile(f),h);inputHashes[path.relative(root,f)]=h;}
  assert.equal(read(path.join(outputDir,'manifest.json')).normalizationId,'9671e21c3eeef89acce451c55342152864312d241850c8ce59a1b0713b9d01bd');
  assert.equal(read(path.join(starDir,'manifest.json')).amendmentId,'9f4be4d66248d857de4d8fd64b09768728130cb8f96b178d75ab06b64ead0137');
  assert.equal(read(path.join(starDir,'progress.json')).completeAvailablePopulation,true);
  const sourceHashes={};for(const f of ['normalization/OPERATOR-PHYSICAL.md','normalization/operator-common.mjs','normalization/operator-native.mjs','normalization/operator-run.mjs','normalization/common.mjs','normalization/config.json','direct/common.mjs','direct/config.json'].map(f=>'experiments/propagator-catalog-census/'+f).concat(['harness/modules.mjs','experiments/supgp-omm/lib/records.mjs','package-lock.json'])){
    const b=fs.readFileSync(path.join(root,f));assert.ok(execFileSync('git',['-C',root,'show',`HEAD:${f}`],{maxBuffer:16<<20}).equals(b),`Committed ${f}`);sourceHashes[f]=sha(b);
  }
  const identity={moduleCommit,moduleFiles,inputHashes,sourceHashes,stage:'selected-native-operator-state-covariance-normalization'};
  return{...identity,physicalId:sha(JSON.stringify(identity))};
}
