// Add catalog membership to an immutable ephemeris snapshot. Element values are
// never used as truth: this reads identities/types and fingerprints the archives.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { config,read,write,writeInventory,walk,hashFile,registration,runDir,iso } from './common.mjs';

export function reconcile(from,to){
  registration();const parent=path.join(from,'census.json'),parentHash=hashFile(parent);
  if(parentHash!==read(path.join(from,'census.sha256.json')).sha256)throw new Error('Parent inventory changed');
  if(fs.existsSync(path.join(to,'census.json')))throw new Error('Target census already frozen');
  const c=read(parent),objects=new Map(c.objects.map(o=>[o.key,o])),cutoff=Date.parse(config.registeredUtc);
  const addFile=(f,meta)=>{const id=c.files.length;c.files.push({path:f,bytes:fs.statSync(f).size,sha256:hashFile(f),...meta});return id;};
  const addObject=(source,lineage,id,norad,fileId,type)=>{
    const key=`${lineage}/${id}`;if(!objects.has(key))objects.set(key,{key,source,lineage,evidence:'gp-only',objectId:String(id),norad,files:[]});
    const o=objects.get(key);o.files.push(fileId);if(type)o.objectType=type;
  };
  for(const f of walk(path.join(config.archive,'spacetrack/gp'))){
    if(!f.endsWith('.json.gz')||fs.statSync(f).mtimeMs>cutoff)continue;
    const id=addFile(f,{kind:'gp-membership',source:'space-track'}),rows=JSON.parse(gunzipSync(fs.readFileSync(f)));
    if(!Array.isArray(rows))throw new Error(`Unexpected GP archive: ${f}`);
    c.files[id].records=rows.length;
    for(const r of rows){const norad=Number(r.NORAD_CAT_ID);if(!Number.isSafeInteger(norad)||norad<=0)throw new Error('Invalid catalog identity');addObject('space-track','space-track-gp',String(norad),norad,id,r.OBJECT_TYPE);}
  }
  // All history files are inventoried. Their membership is not silently inferred
  // from the daily snapshots, and they are not counted as precise references.
  const history=[];
  for(const f of walk(path.join(config.archive,'spacetrack/gp_history/by-creation'))){
    if(!f.endsWith('.json.gz')||fs.statSync(f).mtimeMs>cutoff)continue;
    history.push(addFile(f,{kind:'gp-history-unparsed',source:'space-track'}));
  }
  c.rawArchives.push({source:'space-track',root:'spacetrack/gp_history/by-creation',files:history,status:'unparsed_history_membership'});
  if(!c.sources.some(s=>s.id==='celestrak-supgp'))c.sources.push({id:'celestrak-supgp',name:'CelesTrak supplemental GP',registry:false,format:'omm-gp-json'});
  for(const f of walk(path.join(config.archive,'celestrak/supgp'))){
    if(!/\d{8}T\d{6}Z\.json$/.test(f)||fs.statSync(f).mtimeMs>cutoff)continue;
    const provider=path.basename(path.dirname(f)),id=addFile(f,{kind:'gp-membership',source:'celestrak-supgp',provider}),rows=read(f);
    if(!Array.isArray(rows))throw new Error(`Unexpected supplemental GP archive: ${f}`);
    c.files[id].records=rows.length;
    for(const r of rows){const norad=Number(r.NORAD_CAT_ID);if(!Number.isSafeInteger(norad)||norad<=0)throw new Error('Invalid supplemental catalog identity');addObject('celestrak-supgp',`celestrak-supgp-${provider}`,String(norad),norad,id,r.OBJECT_TYPE);}
  }
  for(const f of c.files.filter(f=>f.source==='sscweb'&&f.kind==='raw-unreconciled')){
    const x=read(f.path),data=x?.[1]?.Result?.[1]?.Data?.[1];if(!Array.isArray(data)){c.issues.push({path:f.path,status:'unsupported_format_or_frame'});continue;}
    for(const [,v]of data){const key=`sscweb/${v.Id}`;if(!objects.has(key))objects.set(key,{key,source:'sscweb',lineage:'sscweb',evidence:'agency-orbit-estimate',objectId:v.Id,norad:null,files:[]});objects.get(key).files.push(c.files.indexOf(f));}
  }
  // Mission names are retained as unresolved identities until native SPK headers
  // establish target/center and crosswalks. No fabricated NORAD association.
  for(const [id,f]of c.files.entries())if(f.kind==='raw-unreconciled'&&['naif-spacecraft','jpl-horizons'].includes(f.source)&&/\.(?:bsp|txt)$/.test(f.path)&&!f.path.endsWith('.object-notes.txt')){
    const marker=f.source==='naif-spacecraft'?'/spk/missions/':'/hac/jpl-horizons/',mission=f.path.split(marker)[1]?.split('/')[0];if(!mission)continue;
    const key=`${f.source}/${mission}`;if(!objects.has(key))objects.set(key,{key,source:f.source,lineage:f.source,evidence:'mission-ephemeris-unclassified',objectId:mission,norad:null,files:[]});objects.get(key).files.push(id);
  }
  c.parentSnapshot={path:parent,sha256:parentHash,frozenUtc:c.frozenUtc};c.frozenUtc=iso(Date.now());c.reconciliation=registration();c.objects=[...objects.values()].sort((a,b)=>a.key.localeCompare(b.key));
  c.incompleteness.push('GP history files are hashed but historical-only membership has not been decoded; daily GP snapshots and every archived supplemental GP file supply catalog membership.');
  const target=path.join(to,'census.json');writeInventory(target,c);write(path.join(to,'census.sha256.json'),{sha256:hashFile(target),files:c.files.length,sourceObjects:c.objects.length});
  const env=path.join(from,'environment');fs.cpSync(env,path.join(to,'environment'),{recursive:true,errorOnExist:true,force:false});
  console.log(JSON.stringify({files:c.files.length,sourceObjects:c.objects.length,uniqueNorad:new Set(c.objects.map(o=>o.norad).filter(Boolean)).size,historyFiles:history.length}));return c;
}
if(process.argv[1]===new URL(import.meta.url).pathname){const{values}=parseArgs({options:{from:{type:'string',default:'registered'},run:{type:'string',default:'catalog'}}});reconcile(runDir(values.from),runDir(values.run));}
