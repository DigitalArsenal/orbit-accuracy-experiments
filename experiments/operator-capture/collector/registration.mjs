// The V2 subset registration (SUBSETS.md) and the truth states it selects. Reading and selection only.
import fs from 'node:fs';
import {sha} from './transport.mjs';
export function subsets(file){
  if(!fs.existsSync(file))return {mode:'fallback-all',sha256:null,subsets:[]};
  const text=fs.readFileSync(file,'utf8'),block=/```json\s*([\s\S]*?)```/.exec(text);
  if(!block)throw new Error('SUBSETS.md has no JSON registration');
  const value=JSON.parse(block[1]);
  if(value.version!==1||!Array.isArray(value.subsets))throw new Error('unsupported subset registration');
  for(const s of value.subsets){if(!Array.isArray(s.norads)||!Array.isArray(s.epochsUtc)||!s.norads.every(Number.isSafeInteger)||!s.epochsUtc.every(e=>Number.isFinite(Date.parse(e)))||!(s.epochToleranceSeconds>=0&&s.epochToleranceSeconds<=3600)||!(s.truthHeadHours>0&&s.truthHeadHours<=8))throw new Error('invalid subset registration');}
  return {...value,mode:'registered',sha256:sha(text)};
}
export function selectTruth(reg,norad,native,samples){
  if(reg.mode==='fallback-all')return samples.map(p=>({ms:p.ms,stateM:p.stateM,registration:'fallback-all'}));
  const result=[];
  for(const s of reg.subsets.filter(s=>s.norads.includes(norad)))for(const epoch of s.epochsUtc){
    const wanted=Date.parse(epoch),tol=s.epochToleranceSeconds*1000;
    const point=native.find(p=>p.ms>=wanted&&p.ms<=wanted+tol&&p.ms<=native[0].ms+s.truthHeadHours*3600000);
    if(point)result.push({...point,registeredMs:wanted,registration:s.id});
  }
  return result;
}
