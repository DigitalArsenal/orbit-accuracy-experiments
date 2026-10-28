import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const here=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(here,'../..');
export const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export const config=read(path.join(here,'config.json'));
export const DAY=86400000, iso=t=>new Date(t).toISOString();
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const git=(...args)=>execFileSync('git',['-C',root,...args],{maxBuffer:32<<20}).toString().trim();
export function hashFile(file){
  const h=createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(1<<20);
  try{for(;;){const n=fs.readSync(fd,buffer);if(!n)break;h.update(buffer.subarray(0,n));}}finally{fs.closeSync(fd);}
  return h.digest('hex');
}
export function write(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');fs.renameSync(tmp,file);
}
export function writeInventory(file,value){
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`,fd=fs.openSync(tmp,'w');
  const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
  try{
    fs.writeSync(fd,'{');let first=true;
    for(const [key,v] of Object.entries(value)){
      fs.writeSync(fd,`${first?'':','}\n${json(key)}:`);first=false;
      if(Array.isArray(v)){fs.writeSync(fd,'[');for(let i=0;i<v.length;i++)fs.writeSync(fd,`${i?',':''}\n${json(v[i])}`);fs.writeSync(fd,']');}
      else fs.writeSync(fd,json(v));
    }
    fs.writeSync(fd,'\n}\n');
  }finally{fs.closeSync(fd);}
  fs.renameSync(tmp,file);
}
export function* walk(dir){
  if(!fs.existsSync(dir))return;
  for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const f=path.join(dir,e.name);if(e.isDirectory())yield*walk(f);else if(e.isFile())yield f;
  }
}
export function registration(){
  if(!config.frozen)throw new Error('Unfrozen experiment');
  const hashes={};
  for(const file of fs.readdirSync(here).filter(f=>/\.(?:mjs|json|md)$/.test(f))){
    const rel=`experiments/${config.id}/${file}`,bytes=fs.readFileSync(path.join(here,file));
    const committed=execFileSync('git',['-C',root,'show',`HEAD:${rel}`]);
    if(!committed.equals(bytes))throw new Error(`Uncommitted experiment source: ${file}`);
    hashes[rel]=sha(bytes);
  }
  const baseline=`experiments/${config.baseline.experiment}/config.json`;
  if(hashFile(path.join(root,baseline))!==config.baseline.configSha256)throw new Error('Baseline configuration changed');
  for(const [file,hash] of [[config.registry.file,config.registry.sha256],[config.registry.fleetFile,config.registry.fleetSha256]])
    if(hashFile(file)!==hash)throw new Error(`Provider registry pin changed: ${file}`);
  return {experimentCommit:git('rev-parse','HEAD'),sourceHashes:hashes,registeredUtc:config.registeredUtc};
}
export function checked(file,hash){if(hashFile(file)!==hash)throw new Error(`Frozen input changed: ${file}`);return fs.readFileSync(file);}
export const runDir=name=>{
  if(!/^[a-zA-Z0-9._-]+$/.test(name))throw new Error('Invalid run name');
  return path.join(root,'runs',config.id,name);
};
