import fs from 'node:fs';
import path from 'node:path';
import {root,read,write,sha,sourceDir,outputDir,keyOf,hashFile,config} from './common.mjs';

const count=xs=>Object.fromEntries([...xs.reduce((m,x)=>m.set(x,(m.get(x)??0)+1),new Map())].sort(([a],[b])=>String(a).localeCompare(String(b))));
const sorted=xs=>[...new Set(xs)].sort();
const groups=(rows,key)=>{const m=new Map();for(const row of rows){const k=key(row);if(k==null)continue;if(!m.has(k))m.set(k,[]);m.get(k).push(row);}return m;};
const positiveId=x=>Number.isSafeInteger(x)&&x>0;
const localIdentity=(source,x)=>positiveId(x.norad)?`norad:${x.norad}`:`${source}:${x.objectId??x.sourceObjectId??x.name??'UNRESOLVED'}`;

export function aggregate(){
  const manifest=read(path.join(outputDir,'manifest.json')),queue=read(path.join(sourceDir,'queue.json'));
  if(hashFile(path.join(sourceDir,'queue.json'))!==manifest.queueSha256)throw Error('Queue identity differs');
  const rows=[],fingerprints=[];
  for(const source of queue.sources)for(const resource of source.resources){
    const key=keyOf(resource),file=path.join(outputDir,'outcomes',`${key}.json`),original=path.join(sourceDir,'outcomes',`${key}.json`);
    if(!fs.existsSync(file)){rows.push({resource,key,status:'pending',states:0,identities:[]});continue;}
    const result=read(file);
    if(result.normalizationId!==manifest.normalizationId||result.inputReceiptSha256!==hashFile(original)||JSON.stringify(resource)!==JSON.stringify(result.resource))throw Error(`Foreign inventory row: ${key}`);
    fingerprints.push([key,hashFile(file)]);rows.push({...result,key});
  }
  const censusFile=path.join(root,'runs/propagator-catalog-census/catalog-epochs-full-replay/census.json');
  const census=read(censusFile),archiveIds=new Set(census.objects.map(x=>x.norad).filter(positiveId));
  const sourceRows={};
  for(const source of queue.sources){
    const selected=rows.filter(r=>r.resource.SOURCE_ID===source.source_id),blocks=selected.flatMap(r=>r.blocks??[]),identities=selected.flatMap(r=>r.identities??[]);
    const numericIds=sorted(identities.map(x=>x.norad).filter(positiveId)),localIds=sorted(identities.map(x=>localIdentity(source.source_id,x)));
    sourceRows[source.source_id]={name:source.name,discoveryState:source.discoveryState,credentialRequired:source.credentialed,
      resources:selected.length,statuses:count(selected.map(r=>r.status)),stateRows:selected.reduce((n,r)=>n+r.states,0),
      blocks:blocks.length,covarianceRows:blocks.reduce((n,b)=>n+b.covarianceRows,0),blocksWithoutCovariance:blocks.filter(b=>!b.covarianceRows).length,
      positionOnlyBlocks:blocks.filter(b=>b.velocityAvailable===false).length,frames:count(blocks.map(b=>b.frame??'unavailable')),timeSystems:count(blocks.map(b=>b.timeSystem??'unavailable')),
      identityRows:identities.length,distinctSourceIdentityKeys:localIds.length,declaredNumericIds:numericIds.length,
      declaredNumericIdsInArchive:numericIds.filter(x=>archiveIds.has(x)).length,declaredNumericIdsAbsentFromArchive:numericIds.filter(x=>!archiveIds.has(x)),
      identitiesWithoutNumericId:sorted(identities.filter(x=>!positiveId(x.norad)).map(x=>localIdentity(source.source_id,x))),
      evidenceClasses:count(selected.map(r=>r.evidence??'unavailable')),
      failures:selected.filter(r=>!['decoded_native_frame','decoded_source_states','catalog_elements_only'].includes(r.status)).map(r=>({key:r.key,resourceId:r.resource.RESOURCE_ID,status:r.status,reason:r.reason??null,identityRows:r.identities.length}))};
  }
  const downloaded=rows.filter(r=>r.rawSha256&&r.status!=='download_unavailable');
  const duplicateContent=[...groups(downloaded,r=>r.rawSha256).entries()].filter(([,r])=>r.length>1).map(([sha256,rs])=>({sha256,resources:rs.map(r=>({key:r.key,source:r.resource.SOURCE_ID,url:r.resource.URL}))}));
  const duplicateUrls=[...groups(rows,r=>r.resource.URL).entries()].filter(([,r])=>r.length>1).map(([url,rs])=>({url,resourceKeys:rs.map(r=>r.key)}));
  const allNumeric=sorted(rows.flatMap(r=>r.identities??[]).map(x=>x.norad).filter(positiveId)),pending=rows.filter(r=>r.status==='pending').length;
  return{schema:'direct-native-inventory',completeResourceAccounting:pending===0,completeScientificComparison:false,
    provenance:{normalizationId:manifest.normalizationId,modulesCommit:config.modulesCommit,queueSha256:manifest.queueSha256,manifestSha256:hashFile(path.join(outputDir,'manifest.json')),
      censusSha256:hashFile(censusFile),outcomeHashesSha256:sha(JSON.stringify(fingerprints)),reportSourceSha256:hashFile(new URL(import.meta.url))},
    counts:{registryEntries:queue.sources.length,credentialRequiredEntries:queue.sources.filter(s=>s.credentialed).length,resources:rows.length,pending,
      statuses:count(rows.map(r=>r.status)),stateRows:rows.reduce((n,r)=>n+r.states,0),uniqueDownloadedContent:groups(downloaded,r=>r.rawSha256).size,
      duplicateContentGroups:duplicateContent.length,duplicateContentResourceExcess:duplicateContent.reduce((n,g)=>n+g.resources.length-1,0),duplicateUrlGroups:duplicateUrls.length,
      declaredNumericIds:allNumeric.length,declaredNumericIdsInArchive:allNumeric.filter(x=>archiveIds.has(x)).length,
      declaredNumericIdsAbsentFromArchive:allNumeric.filter(x=>!archiveIds.has(x)).length},
    sources:sourceRows,duplicateContent,duplicateUrls,
    limitations:[
      'Complete accounting means one terminal record for every discovered resource. It does not mean complete truth coverage, every historical product, or successful scientific scoring.',
      'No GCRF conversion or propagator accuracy calculation is performed here. Native-frame state counts include repeated products and are not counts of independent observations.',
      'Source identity keys may be slots, names or constellation identifiers, not unique spacecraft. No name-based or unpinned crosswalk merges are included.',
      'The frozen Starlink reader drops covariance and imposes a compact epoch grid. Raw epochs and covariance remain preserved; this inventory is not admitted for covariance scoring. The corrected reader requires a separately registered amendment.',
      'CPF, Intelsat ECF and position-only SP3 outputs contain native zero velocity slots; these are explicitly unavailable velocities, not measurements.',
      'SP3 per-epoch prediction/event flags are retained in hashed sidecars. A product label alone does not classify every sample as reconstructed truth.',
      'The two unsuccessful downloads and all four credential-required providers remain explicit gaps. Unsupported OneWeb orbital encoding and Telesat center-of-box data remain in denominators.',
      'Covariance availability is not calibration. The failed original calibration results are unchanged.'
    ]};
}

function markdown(out){
  const lines=['# Direct-feed native inventory','',`All ${out.counts.resources.toLocaleString()} discovered resources have ${out.completeResourceAccounting?'terminal':'not yet terminal'} inventory records. **Scientific comparison remains incomplete.**`,
    '',`${out.counts.registryEntries} registry entries, including ${out.counts.credentialRequiredEntries} access gaps. ${out.counts.uniqueDownloadedContent.toLocaleString()} distinct downloaded byte payloads; ${out.counts.duplicateContentResourceExcess} additional resource records repeat exact content.`,
    '', '| Source | Resources | Native state rows | Declared numeric IDs | Statuses |','|---|---:|---:|---:|---|'];
  for(const [id,s]of Object.entries(out.sources))lines.push(`| ${id} | ${s.resources} | ${s.stateRows} | ${s.declaredNumericIds} | ${s.resources?Object.entries(s.statuses).map(([k,v])=>`${k}: ${v}`).join('; '):s.discoveryState} |`);
  lines.push('',`The direct snapshot declares ${out.counts.declaredNumericIds.toLocaleString()} unique numeric spacecraft IDs; ${out.counts.declaredNumericIdsAbsentFromArchive} are absent from the frozen archive census. Unresolved source identities and complete duplicate groups are retained in the JSON report. Explicit crosswalk reconciliation is separate.`,
    '', 'Reproduce with `node experiments/propagator-catalog-census/normalization/report.mjs` after the registered inventory run. Reader validation and raw-byte verification are separate from this aggregation.','');
  for(const limit of out.limitations)lines.push(`- ${limit}`);
  return lines.join('\n')+'\n';
}
if(process.argv[1]===new URL(import.meta.url).pathname){const out=aggregate(),dir=path.join(root,'results/propagator-catalog-census/normalization');write(path.join(dir,'summary.json'),out);fs.writeFileSync(path.join(dir,'README.md'),markdown(out));console.log(JSON.stringify(out.counts));}
