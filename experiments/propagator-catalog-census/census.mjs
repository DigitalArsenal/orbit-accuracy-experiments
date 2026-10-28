// Inventory and identity reconciliation only. No orbital calculations or spacecraft sampling.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parseArgs } from 'node:util';
import { ByteBuffer } from 'flatbuffers';
import { NCD } from 'spacedatastandards.org/lib/js/NCD/main.js';
import { config,read,write,writeInventory,walk,hashFile,sha,registration,runDir,iso } from './common.mjs';

export function referenceClass(x){
  const p=x.product;
  if(p.startsWith('ESA0'))return {source:'esa-pod',lineage:'esa-gnss-final',evidence:'precise-reconstruction'};
  if(p.startsWith('IGS0'))return {source:'gps-precise',lineage:p.includes('ULT')?'igs-ultrarapid-mixed':'igs-final',evidence:p.includes('ULT')?'mixed-reconstructed-predicted':'precise-reconstruction'};
  if(p.startsWith('GFZ0'))return {source:'gfz-gnss',lineage:'gfz-mgex-rapid',evidence:'precise-reconstruction'};
  if(p.startsWith('GFZOP'))return {source:'grace-fo',lineage:'gfz-grace-fo-rso',evidence:'precise-reconstruction'};
  if(p.startsWith('SW_'))return {source:'swarm',lineage:'swarm-reduced-dynamic',evidence:'precise-reconstruction'};
  if(p.startsWith('S1'))return {source:'sentinel-1',lineage:'sentinel-1-poeorb',evidence:'precise-reconstruction'};
  if(p.startsWith('leoOrb'))return {source:'cosmic-2',lineage:'ucar-nrt-leoorb',evidence:'precise-reconstruction'};
  if(p.startsWith('ssa'))return {source:'doris',lineage:'cnes-doris-poe',evidence:'precise-reconstruction'};
  if(p.startsWith('ilrsa'))return {source:'ilrs',lineage:'ilrs-combination',evidence:'precise-reconstruction'};
  if(p.startsWith('nsgf'))return {source:'ilrs',lineage:'nsgf-orbit',evidence:'precise-reconstruction'};
  return {source:'unclassified-reference',lineage:p.split('.')[0],evidence:'unclassified'};
}

export async function providerInventory(node,dir,apiBase=config.providerApi){
  const api=new URL(apiBase);api.port=String(node.apiPort);
  const audit={source:node.sourceId,scope:'local-provider-api',api:api.origin,queriedUtc:iso(Date.now()),pages:[],records:[],upstreamReachability:'not_tested'};
  const query=async offset=>{
    const response=await fetch(new URL('/api/v1/data/query',api),{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Accept:'application/vnd.sdn.flatbuffers.stream'},body:JSON.stringify({schema:'NCD.fbs',provider_id:`ephemeris-provider:${node.sourceId}`,source_name:node.sourceId,limit:256,offset})});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    for(const h of ['x-sdn-total-count','x-sdn-record-count'])if(response.headers.get(h)===null)throw new Error(`Missing ${h}`);
    const total=Number(response.headers.get('x-sdn-total-count')),count=Number(response.headers.get('x-sdn-record-count'));
    if(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(count)||count<0)throw new Error('Invalid pagination counts');
    const bytes=Buffer.from(await response.arrayBuffer()),records=[];
    for(let at=0;at<bytes.length;){
      if(at+4>bytes.length)throw new Error('Truncated frame length');
      const n=bytes.readUInt32LE(at),end=at+4+n;if(!n||end>bytes.length)throw new Error('Truncated frame');
      const frame=bytes.subarray(at+4,end);if(frame.subarray(4,8).toString()!=='$NCD')throw new Error('Unexpected record schema');
      const r=NCD.getRootAsNCD(new ByteBuffer(frame)).unpack();
      records.push({frameSha256:sha(frame),sourceCid:r.SOURCE_CID,sourceSha256:r.SOURCE_SHA256,sourceBytes:String(r.SOURCE_BYTE_LENGTH),descriptor:r});at=end;
    }
    if(records.length!==count)throw new Error('Record count differs from header');
    const file=path.join(dir,'provider-pages',node.sourceId,`${offset}.ncd`);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);
    return {total,count,records,sha256:sha(bytes)};
  };
  try{
    const first=await query(0),seen=new Set();audit.advertisedRecords=first.total;
    for(let offset=0;offset<first.total;){
      const p=offset?await query(offset):first;if(p.total!==first.total)throw new Error('Source changed during pagination');
      if(!p.count||offset+p.count>first.total)throw new Error('Incomplete/overfull pagination');
      for(const r of p.records){if(seen.has(r.frameSha256))throw new Error('Overlapping pages');seen.add(r.frameSha256);audit.records.push(r);}
      audit.pages.push({offset,count:p.count,sha256:p.sha256});offset+=p.count;
    }
    const end=await query(first.total),again=await query(0);
    if(end.count||end.total!==first.total||again.sha256!==first.sha256)throw new Error('Unstable terminal page or snapshot');
    audit.status='inventory_acquired';audit.completePagination=true;
  }catch(e){audit.status='local_inventory_unavailable';audit.reason=e.message;audit.causeCode=e.cause?.code??null;audit.completePagination=false;}
  return audit;
}

export async function census(dir){
  const reg=registration(),target=path.join(dir,'census.json');
  if(fs.existsSync(target))throw new Error('Census already frozen; use another run name');
  fs.mkdirSync(dir,{recursive:true});
  const start=iso(Date.now()),archive=config.archive,files=[],objects=new Map(),duplicates=[],issues=[];
  const sources=read(config.registry.file).sources;
  const registry=Array.isArray(sources)?sources:read(config.registry.file);
  const sourceRows=new Map(registry.map(s=>[s.source_id,{id:s.source_id,name:s.name,format:s.format,credentialed:s.credentialed,registry:true}]));
  const obj=(source,lineage,evidence,id,norad=null)=>{
    if(!sourceRows.has(source))sourceRows.set(source,{id:source,name:source,registry:false});
    const key=`${lineage}/${id}`;
    if(!objects.has(key))objects.set(key,{key,source,lineage,evidence,objectId:id,norad,files:[]});
    const o=objects.get(key);if(norad&&o.norad&&norad!==o.norad)throw new Error(`Identity conflict: ${key}`);if(norad)o.norad=norad;return o;
  };
  const file=(f,meta={})=>{
    const row={path:f,bytes:fs.statSync(f).size,sha256:hashFile(f),...meta};files.push(row);return files.length-1;
  };
  const originals=new Map();
  for(const rel of config.referenceRoots){
    const base=path.join(archive,rel);if(!fs.existsSync(base)){issues.push({path:base,status:'unavailable_archive'});continue;}
    let count=0;
    for(const p of fs.readdirSync(base).sort()){
      const indexPath=path.join(base,p,'index.json');if(!fs.existsSync(indexPath))continue;
      const index=read(indexPath),kind=referenceClass(index),indexId=file(indexPath,{kind:'reference-index',source:kind.source});
      for(const o of index.objects||[]){
        const entry={kind:'reference',...kind,norad:o.norad,objectId:o.objectId,product:p,indexId,start:o.start,stop:o.stop,epochs:o.epochs,url:index.url,sourceSha256:index.memberSha256||index.eofSha256||index.sha256,uncertainty:index.statedSigmaBasis||o.comment,eop:index.eop};
        const ref=obj(kind.source,kind.lineage,kind.evidence,String(o.norad),o.norad);
        const f=path.join(base,p,o.file);if(!fs.existsSync(f)){issues.push({object:ref.key,path:f,status:'unavailable_archive'});continue;}
        const id=file(f,entry),key=`${kind.lineage}/${entry.sourceSha256}/${o.norad}`;
        if(originals.has(key)){duplicates.push({file:id,preferred:originals.get(key),reason:'same source product/object; earlier configured conversion root preferred'});continue;}
        originals.set(key,id);ref.files.push(id);
      }
      count++;
    }
    console.log(JSON.stringify({stage:'reference-inventory',root:rel,products:count,objects:objects.size}));
  }
  const cycles=[],cycleRoot=path.join(archive,config.operatorCycles);
  if(fs.existsSync(cycleRoot))for(const c of fs.readdirSync(cycleRoot).sort()){
    const summaryPath=path.join(cycleRoot,c,'summary.json');if(!fs.existsSync(summaryPath))continue;
    const s=read(summaryPath);if(!s.endedUtc||Date.parse(s.endedUtc)>Date.parse(config.registeredUtc))continue;
    const summaryId=file(summaryPath,{kind:'cycle-summary',source:'spacex-starlink'});cycles.push({id:c,summaryId,...s});
    let n=0;
    for(const name of fs.readdirSync(path.join(cycleRoot,c)).filter(n=>/^\d+\.json\.gz$/.test(n)).sort()){
      const f=path.join(cycleRoot,c,name),b=fs.readFileSync(f),x=JSON.parse(gunzipSync(b)),norad=Number(name.split('.')[0]);
      if(x.source.norad!==norad)throw new Error(`Capture identity differs: ${f}`);
      const truth=x.truth||[],id=file(f,{kind:'operator-head',source:'spacex-starlink',lineage:'starlink-capture-heads',cycle:c,summaryId,norad,created:x.source.createdUtc,retrieved:x.source.retrievedUtc,sourceSha256:x.source.sha256,frame:x.frame,units:x.units,start:truth.length?iso(truth[0].ms):null,stop:truth.length?iso(truth.at(-1).ms):null,epochs:truth.length,earthOrientation:x.energyEarthOrientation});
      obj('spacex-starlink','starlink-capture-heads','operator-reconstruction',String(norad),norad).files.push(id);n++;
    }
    if(n!==s.files)issues.push({cycle:c,status:'inventory_count_mismatch',summary:s.files,actual:n});
    console.log(JSON.stringify({stage:'operator-inventory',cycle:c,files:n,objects:objects.size}));
  }
  // Daily Planet OD states include every hardware identity, including unresolved NORAD identities.
  for(const f of walk(path.join(archive,'hac/planet-ephemerides'))){
    if(!f.endsWith('.states'))continue;
    const day=path.basename(f).match(/(\d{8})/)?.[1],cross=path.join(path.dirname(f),day?`planet_mc_${day}.tle`:'planet_mc.tle'),ids=new Map();
    if(fs.existsSync(cross)){
      file(cross,{kind:'identity-crosswalk',source:'planet'});
      const lines=fs.readFileSync(cross,'utf8').split(/\r?\n/);
      for(let i=0;i+1<lines.length;i++)if(lines[i].startsWith('0 ')&&lines[i+1].startsWith('1 '))ids.set(lines[i].trim().split(/\s+/).at(-1).toLowerCase(),Number(lines[i+1].slice(2,7))||null);
    }
    const id=file(f,{kind:'planet-daily-states',source:'planet',cadence:'one OD state per object per daily file'});
    for(const line of fs.readFileSync(f,'utf8').split(/\r?\n/)){
      const fields=line.trim().split(/\s+/);if(fields.length<8||!Number.isFinite(Number(fields[1])))continue;
      const hwid=fields[0].toLowerCase();obj('planet','planet-daily-states','operator-reconstruction',hwid,ids.get(hwid)||null).files.push(id);
    }
  }
  // Retain every additional known ephemeris archive, including formats not yet normalized.
  const rawRoots=[
    ['iss','hac/nasa-iss-oem-archive'],['iss','hac/nasa-iss-oem'],['cpf-edc','hac/ilrs-edc/cpf_predicts_v2'],
    ['eumetsat','hac/eumetsat-metopsg/AUX_POFD'],['sscweb','hac/sscweb-themis'],['mast-tess','hac/mast-tess/models'],
    ['naif-spacecraft','hac/naif-kernels/spk/missions'],['jpl-horizons','hac/jpl-horizons'],
    ['operator-archive','operator-ephemerides/daily'],['operator-derived','operator-ephemerides/derived']
  ];
  const rawArchives=[];
  for(const [source,relative]of rawRoots){
    if(!sourceRows.has(source))sourceRows.set(source,{id:source,name:source,registry:false});
    const ids=[];
    for(const f of walk(path.join(archive,relative))){
      if(/(?:provenance\.json|\.jsonl|README|\.html|hpop\.json|stats\.json)$/.test(f))continue;
      const id=file(f,{kind:'raw-unreconciled',source});ids.push(id);
      if(source==='iss')obj(source,'iss-oem-archive','operator-forecast','25544',25544).files.push(id);
      if(source==='mast-tess')obj(source,'tess-definitive','precise-reconstruction','43435',43435).files.push(id);
      if(source==='cpf-edc'){
        const text=fs.readFileSync(f,'utf8'),h=text.split(/\r?\n/).find(l=>/^H2\s/i.test(l)),norad=Number(h?.trim().split(/\s+/)[3])||null;
        obj(source,'cpf-edc-prediction','operator-forecast',norad?String(norad):path.basename(path.dirname(f)),norad).files.push(id);
      }
    }
    rawArchives.push({source,root:relative,files:ids,status:ids.length?'unsupported_format_or_frame':'unavailable_archive'});
  }
  const fleet=read(config.registry.fleetFile),providers=[];
  for(const n of [...fleet.nodes,...fleet.reusedNodes]){
    const p=await providerInventory(n,dir);providers.push(p);console.log(JSON.stringify({stage:'provider',source:n.sourceId,status:p.status,records:p.advertisedRecords??null}));
  }
  const out={schema:'public-ephemeris-census-v1',...reg,startedUtc:start,frozenUtc:iso(Date.now()),populationCap:null,sourceCap:null,files,objects:[...objects.values()].sort((a,b)=>a.key.localeCompare(b.key)),duplicates,cycles,rawArchives,providers,sources:[...sourceRows.values()],issues,complete:false,
    incompleteness:['Provider inventories and local archives must be reconciled; raw/unparsed files remain visible.','All discovered objects are retained; unknown identities are not asserted to be unique spacecraft.']};
  writeInventory(target,out);write(path.join(dir,'census.sha256.json'),{sha256:hashFile(target),files:files.length,sourceObjects:objects.size});
  console.log(JSON.stringify({stage:'census-frozen',path:target,files:files.length,sourceObjects:objects.size,uniqueNorad:new Set(out.objects.map(o=>o.norad).filter(Boolean)).size}));return out;
}
if(process.argv[1]===new URL(import.meta.url).pathname){const {values}=parseArgs({options:{run:{type:'string',default:'registered'}}});await census(runDir(values.run));}
