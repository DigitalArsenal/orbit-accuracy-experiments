import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';

export const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
export const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
export const config=read(path.join(here,'config.json'));
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const iso=()=>new Date().toISOString();
export function write(f,v){fs.mkdirSync(path.dirname(f),{recursive:true});const t=`${f}.${process.pid}.tmp`;fs.writeFileSync(t,JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x,2)+'\n');fs.renameSync(t,f);}
export const runDir=name=>{if(!/^[a-zA-Z0-9._-]+$/.test(name))throw Error('Invalid run name');return path.join(root,'runs/propagator-catalog-census',name);};
export function registration(modules){
  if(!config.frozen)throw Error('Direct acquisition must be frozen');
  const moduleRoot=path.join(modules,'data-source/ephemeris-source'),hashes={};
  for(const name of fs.readdirSync(here).filter(x=>/\.(mjs|json|md)$/.test(x))){
    const rel=path.relative(root,path.join(here,name)),body=fs.readFileSync(path.join(here,name));
    if(!body.equals(execFileSync('git',['-C',root,'show',`HEAD:${rel}`])))throw Error(`Uncommitted direct acquisition source: ${name}`);
    hashes[rel]=sha(body);
  }
  if(execFileSync('git',['-C',modules,'rev-parse','HEAD']).toString().trim()!==config.modulesCommit)throw Error('Module revision differs');
  for(const [f,h]of Object.entries(config.moduleFiles))if(sha(fs.readFileSync(path.join(moduleRoot,f)))!==h)throw Error(`Module pin differs: ${f}`);
  return {experimentCommit:execFileSync('git',['-C',root,'rev-parse','HEAD']).toString().trim(),sourceHashes:hashes,moduleFiles:config.moduleFiles,modulesCommit:config.modulesCommit,node:process.version,command:process.argv,registeredUtc:execFileSync('git',['-C',root,'log','-1','--format=%cI','--',here]).toString().trim(),frozenConfigTimestampLabel:config.registeredUtc};
}
export function storeBody(dir,body){
  const hash=sha(body),relative=`raw/${hash.slice(0,2)}/${hash}.gz`,file=path.join(dir,relative);
  if(!fs.existsSync(file)){const compressed=gzipSync(body,{level:6});fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;fs.writeFileSync(tmp,compressed);fs.renameSync(tmp,file);}
  const compressed=fs.readFileSync(file);
  return {sha256:hash,bytes:body.length,file:relative,storedSha256:sha(compressed),storedBytes:compressed.length,storageEncoding:'gzip'};
}
export function bodyOf(dir,record){
  const b=fs.readFileSync(path.join(dir,record.file));if(sha(b)!==record.storedSha256)throw Error(`Stored hash differs: ${record.file}`);
  const raw=gunzipSync(b);if(raw.length!==record.bytes||sha(raw)!==record.sha256)throw Error(`Raw hash differs: ${record.file}`);return raw;
}
export const keyOf=r=>sha(`${r.SOURCE_ID}\n${r.URL}`);
export async function pool(items,fn){let cursor=0;await Promise.all(Array.from({length:config.workers},async()=>{while(cursor<items.length){const i=cursor++;await fn(items[i],i);}}));}
