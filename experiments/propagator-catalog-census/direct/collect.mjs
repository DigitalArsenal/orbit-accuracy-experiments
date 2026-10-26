import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {config,read,write,sha,iso,runDir,registration,storeBody,bodyOf,keyOf,pool} from './common.mjs';
import {wire} from './wire.mjs';
import {report} from './report.mjs';

function transport(url){for(const [from,to]of Object.entries(config.transportUpgrades))if(url.startsWith(from+'/'))return to+url.slice(from.length);return url;}
async function get(dir,url,maxBytes){
  const attempts=[];
  for(let attempt=1;attempt<=config.attempts;attempt++){
    const record={url,transportUrl:transport(url),retrievedUtc:iso(),attempt};let retry=false;
    try{
      const res=await fetch(record.transportUrl,{signal:AbortSignal.timeout(config.timeoutMs),headers:{'user-agent':'SDN-orbit-accuracy-research/1.0'}});
      record.status=res.status;record.finalUrl=res.url;record.headers=Object.fromEntries(['content-type','content-length','content-encoding','etag','last-modified'].flatMap(k=>res.headers.has(k)?[[k,res.headers.get(k)]]:[]));
      const chunks=[];let length=0;
      for await(const chunk of res.body){length+=chunk.length;if(length>maxBytes)throw Error(`Response exceeds explicit ${maxBytes}-byte limit`);chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      if(!res.headers.has('content-encoding')&&res.headers.has('content-length')&&Number(res.headers.get('content-length'))!==body.length)throw Error('HTTP entity length mismatch');
      Object.assign(record,storeBody(dir,body));
      if(res.status===200&&body.length){record.state='downloaded';return {...record,attempts:[...attempts,{...record}]};}
      record.error=`HTTP ${res.status}${body.length?'':' empty body'}`;retry=res.status===429||res.status>=500;
    }catch(e){record.error=e.message;record.causeCode=e.cause?.code??e.code??null;retry=true;}
    record.state='download_failed';attempts.push(record);
    if(!retry||attempt===config.attempts)return {...record,attempts};
    await delay(Math.min(5000,1000*2**(attempt-1)));
  }
}
const resource=(source,url,format,discovery)=>({SOURCE_ID:source.source_id,URL:url,RESOURCE_ID:new URL(url).pathname.split('/').at(-1),FORMAT:format||source.format,discovery});
export function supplements(source,listings,dir){
  const result=[];
  for(const l of listings.filter(x=>x.state==='downloaded')){
    const text=bodyOf(dir,l).toString('utf8'),id=source.source_id,add=(url,format)=>result.push(resource(source,url,format,{kind:'supplement',listingSha256:l.sha256,listingUrl:l.url}));
    if(id==='planet'&&l.url.endsWith('planet_mc.tle')){
      const lines=text.split(/\r?\n/);
      for(let i=0;i+1<lines.length;i++)if(lines[i].startsWith('0 ')&&lines[i+1].startsWith('1 ')){
        const hwid=lines[i].trim().split(/\s+/).at(-1).toLowerCase();
        if(!/^[a-z0-9_-]+$/.test(hwid))throw Error('Invalid Planet hardware ID');
        add(`https://ephemerides.planet-labs.com/${hwid}_oem.txt`,'ccsds-oem-kvn');
      }
    }
    if(id==='intelsat')for(const [,name]of text.matchAll(/<option[^>]*\bvalue\s*=\s*["']([^"']+)["']/gi)){
      const kind=name.match(/_([ewxm])_/i)?.[1]?.toLowerCase();if(!kind)continue;
      if(!/^[a-z0-9_.-]+$/i.test(name))throw Error('Invalid Intelsat resource name');
      add(`https://my.intelsat.com/Resource/Ephemeris/${name}.txt`,kind==='e'?'intelsat-ecf':'ses-i11');
    }
    if(['gps-precise','glonass-precise','esa-pod'].includes(id)){
      const links=[...text.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(x=>x[1]).filter(x=>/\.sp3\.gz$/i.test(x));
      const urls=links.map(link=>new URL(link,l.url)).filter(u=>u.origin===new URL(l.url).origin&&u.pathname.startsWith(new URL(l.url).pathname));
      if(l.url.includes('/gnss-products/')||l.url.includes('/IGS/products/'))for(const u of urls)add(u.href,'sp3-gzip');
      if(l.url.endsWith('/swarm/')){
        const newest=new Map();for(const u of urls){const name=u.pathname.split('/').at(-1),group=name.match(/^SWR[ABC]/i)?.[0].toUpperCase();if(group&&(!newest.has(group)||name>newest.get(group).pathname.split('/').at(-1)))newest.set(group,u);}
        for(const u of newest.values())add(u.href,'sp3-gzip');
      }
    }
  }
  return result;
}
export async function discover(dir,modules,W,manifest){
  const registry=read(path.join(modules,'data-source/ephemeris-source/sources.json')),sources=[];
  // All source plans are persisted, including authentication exclusions.
  for(const source of registry.sources){
    const row={...source,listings:[],resources:[],discoveryState:source.credentialed?'credential_required':'planned'};
    if(!source.credentialed)try{row.requestUrls=(await W.plan(source.source_id,manifest.epochMs)).map(r=>r.url);}catch(e){row.discoveryState='plan_failed';row.error=e.message;row.requestUrls=[];}
    sources.push(row);
  }
  const requests=sources.flatMap(s=>(s.requestUrls??[]).map(url=>({source:s,url,role:'native'})));
  const planet=sources.find(s=>s.source_id==='planet');requests.push({source:planet,url:'https://ephemerides.planet-labs.com/planet_mc.tle',role:'supplement'});
  await pool(requests,async({source,url,role})=>{
    const f=path.join(dir,'listing-results',sha(`${source.source_id}\n${url}`)+'.json');
    const rec=fs.existsSync(f)?read(f):await get(dir,url,config.listingMaxBytes);
    if(rec.file)bodyOf(dir,rec);write(f,rec);source.listings.push({...rec,role});
  });
  for(const source of sources.filter(s=>!s.credentialed)){
    source.listings.sort((a,b)=>a.url.localeCompare(b.url));
    try{
      source.resources=(await W.discover(source.source_id,manifest.epochMs,source.listings.filter(x=>x.role==='native').map(x=>({...x,body:x.file?bodyOf(dir,x):Buffer.alloc(0)})))).map(r=>({...r,discovery:{kind:'native'}}));
      source.discoveryState='discovered';
    }catch(e){source.discoveryState='discovery_failed';source.error=e.message;}
    const nativeCount=source.resources.length;
    source.resources.push(...supplements(source,source.listings,dir));
    const unique=new Map();for(const r of source.resources)if(!unique.has(r.URL))unique.set(r.URL,r);
    source.resources=[...unique.values()].sort((a,b)=>a.URL.localeCompare(b.URL));source.nativeResources=nativeCount;source.supplementResources=source.resources.length-nativeCount;
    if(!source.resources.length&&source.discoveryState==='discovered')throw Error('Empty source mislabeled discovered');
    console.log(JSON.stringify({source:source.source_id,discovery:source.discoveryState,resources:source.resources.length,error:source.error}));
  }
  write(path.join(dir,'queue.json'),{epochMs:manifest.epochMs,sources});
  manifest.queueSha256=sha(fs.readFileSync(path.join(dir,'queue.json')));manifest.queueFrozenUtc=iso();write(path.join(dir,'manifest.json'),manifest);
}
export async function collect(run,modules){
  const provenance=registration(modules),dir=runDir(run);fs.mkdirSync(dir,{recursive:true});
  const lock=path.join(dir,'collector.lock');fs.mkdirSync(lock); // A failed process leaves an explicit lock for inspection.
  write(path.join(lock,'owner.json'),{pid:process.pid,startedUtc:iso()});
  let W;
  try{
    let manifest;
    if(fs.existsSync(path.join(dir,'manifest.json'))){manifest=read(path.join(dir,'manifest.json'));if(JSON.stringify(manifest.sourceHashes)!==JSON.stringify(provenance.sourceHashes))throw Error('Acquisition implementation differs from the frozen run');}
    else {manifest={...provenance,epochMs:Date.now(),startedUtc:iso(),modules,scope:'all advertised public spacecraft; current discovery windows plus existing census archives',completeCatalog:false};write(path.join(dir,'manifest.json'),manifest);}
    W=await wire(modules);
    if(!manifest.queueSha256)await discover(dir,modules,W,manifest);
    if(sha(fs.readFileSync(path.join(dir,'queue.json')))!==manifest.queueSha256)throw Error('Frozen discovery queue changed');
    const queue=read(path.join(dir,'queue.json')),resources=queue.sources.flatMap(s=>s.resources),cached=new Map(queue.sources.flatMap(s=>s.listings.filter(l=>l.state==='downloaded').map(l=>[l.url,l])));
    let completed=0,validationTail=Promise.resolve();
    await pool(resources,async r=>{
      const f=path.join(dir,'outcomes',keyOf(r)+'.json');
      if(fs.existsSync(f)){const old=read(f);if(old.receipt?.file)bodyOf(dir,old.receipt);completed++;return;}
      const disk=fs.statfsSync(dir);if(disk.bavail*disk.bsize<config.minimumFreeBytes)throw Error('Free-disk reserve reached; remaining queue stays pending');
      const receipt=cached.get(r.URL)??await get(dir,r.URL,config.artifactMaxBytes),out={resource:r,receipt,completedUtc:iso()};
      if(receipt.state==='downloaded'){
        const validation=validationTail.then(async()=>{try{out.validation=await W.validate(r,receipt,bodyOf(dir,receipt));}catch(e){out.validation={rawValidation:'failed',error:e.message,identityCoverage:'unknown'};}});
        validationTail=validation.catch(()=>{});await validation;
      }else out.validation={rawValidation:'not_run',identityCoverage:'unknown'};
      write(f,out);completed++;
      write(path.join(dir,'progress.json'),{pid:process.pid,completed,total:resources.length,pending:resources.length-completed,updatedUtc:iso(),lastSource:r.SOURCE_ID});
      if(completed%100===0)console.log(JSON.stringify({completed,total:resources.length}));
    });
    write(path.join(dir,'collection.json'),{state:'all_discovered_resources_terminal',completed:resources.length,completedUtc:iso(),completeCatalog:false});
    report(run);
  }finally{await W?.close();fs.rmSync(lock,{recursive:true});}
}
if(process.argv[1]===new URL(import.meta.url).pathname){const {values}=parseArgs({options:{run:{type:'string',default:'direct-20261026'},modules:{type:'string'}}});if(!values.modules)throw Error('--modules required');await collect(values.run,values.modules);}
