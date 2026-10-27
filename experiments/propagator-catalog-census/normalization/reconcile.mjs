import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,read,write,sha,sourceDir,outputDir,keyOf,bodyOf,hashFile} from './common.mjs';
const identityDir=path.join(root,'runs/propagator-catalog-census/direct-identity-20261027');
const acquired=id=>{const file=path.join(identityDir,'receipts',id+'-node-fetch.json'),receipt=read(file);assert.equal(receipt.state,'downloaded');return{text:bodyOf(identityDir,receipt).toString(),receipt,receiptSha256:hashFile(file)};};
const igs=acquired('igs-satellite-metadata'),nasa=acquired('nasa-sp3-correspondence'),planet=acquired('planet-matches');
const block=name=>{const parts=igs.text.split('+'+name);assert.equal(parts.length,2);return parts[1].split('-'+name)[0].split(/\r?\n/).filter(l=>l.startsWith(' ')).map(l=>l.trim().split(/\s+/));};
const svn=new Map();for(const a of block('SATELLITE/IDENTIFIER')){assert.ok(!svn.has(a[0]));svn.set(a[0],{cospar:a[1],norad:Number(a[2]),block:a[3]});}
const time=(s,end)=>s==='0000:000:00000'?(end?Infinity:-Infinity):Date.UTC(+s.slice(0,4),0,+s.slice(5,8))+(+s.slice(9))*1000;
const prn=block('SATELLITE/PRN').map(a=>({svn:a[0],from:time(a[1],false),to:time(a[2],true),prn:a[3],fromText:a[1],toText:a[2]}));
const nasaIds=new Map();
for(const match of nasa.text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim());
  if(cells.length<4||!/^L\d{2}$/.test(cells[1]))continue;const norad=Number(cells[3]);if(!Number.isSafeInteger(norad)||norad<=0)continue;
  if(!nasaIds.has(cells[1]))nasaIds.set(cells[1],[]);nasaIds.get(cells[1]).push({norad,name:cells[0],ilrs:cells[2]});
}
assert.ok(nasaIds.size>50);assert.equal(nasaIds.get('L12')?.[0].norad,36508);
const planetMatches=new Map();for(const line of planet.text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#'))){
  const a=line.trim().split(/\s{2,}/);assert.equal(a.length,10);assert.ok(!planetMatches.has(a[0]));
  planetMatches.set(a[0],{hwid:a[0],planetName:a[1],catalogName:a[2],catid:/^\d+$/.test(a[3])?Number(a[3]):null,rmsKmText:a[4],
    candidates:a[5]==='-'?[]:a[5].split('/').map(Number),correctNameFlags:a[6].split('/'),catalogued:a[7]==='True',temporaryCatid:a[8],supplementalCatid:a[9]});
}
const queue=read(path.join(sourceDir,'queue.json')),planetSource=queue.sources.find(s=>s.source_id==='planet');
const tleListing=planetSource.listings.find(l=>l.url.endsWith('/planet_mc.tle')),tle=bodyOf(sourceDir,tleListing).toString().split(/\r?\n/),planetSnapshot=new Map();
const checksum=s=>s.length===69&&[...s.slice(0,68)].reduce((n,c)=>n+(/\d/.test(c)?Number(c):c==='-'?1:0),0)%10===Number(s[68]);
for(let i=0;i<tle.length-2;i++)if(tle[i].startsWith('0 ')&&tle[i+1].startsWith('1 ')&&tle[i+2].startsWith('2 ')){
  const hwid=tle[i].trim().split(/\s+/).at(-1).toLowerCase(),id=tle[i+1].slice(2,7).trim();assert.match(hwid,/^[0-9a-f]{4}$/);
  assert.equal(tle[i+2].slice(2,7).trim(),id);assert.ok(checksum(tle[i+1])&&checksum(tle[i+2]));assert.match(id,/^\d+$/);
  if(!planetSnapshot.has(hwid))planetSnapshot.set(hwid,[]);planetSnapshot.get(hwid).push(Number(id));
}
const censusFile=path.join(root,'runs/propagator-catalog-census/catalog-epochs-full-replay/census.json'),census=read(censusFile),archive=new Set(census.objects.map(x=>x.norad).filter(Boolean));
const epoch=t=>Date.parse(/[zZ]$/.test(t)?t:t+'Z'),rows=[];
for(const source of queue.sources)for(const resource of source.resources){
  const key=keyOf(resource),outcome=read(path.join(outputDir,'outcomes',key+'.json'));
  for(let i=0;i<(outcome.identities??[]).length;i++){
    const input=outcome.identities[i],b=outcome.blocks?.[i],row={resourceKey:key,source:source.source_id,index:i,input,status:'unresolved',norad:null,evidence:[]};
    if(Number.isSafeInteger(input.norad)&&input.norad>0){row.status='source_declared_numeric';row.norad=input.norad;}
    else if(source.source_id==='planet'){
      const hwid=String(input.objectId??input.sourceObjectId??'').toLowerCase(),snapshot=[...new Set(planetSnapshot.get(hwid)??[])],fresh=planetMatches.get(hwid)??null;
      row.evidence.push({kind:'snapshot_operator_tle_hwid',sha256:tleListing.sha256,candidates:snapshot},{kind:'later_operator_best_guess',sha256:planet.receipt.sha256,match:fresh});
      if(snapshot.length===1){row.norad=snapshot[0];row.status='operator_crosswalk_unverified';if(fresh?.catid&&fresh.catid!==row.norad){row.status='crosswalk_disagreement';row.norad=null;}}
      else if(snapshot.length>1)row.status='ambiguous_snapshot_crosswalk';
      if(fresh?.candidates.length>1)row.competingCandidateIds=fresh.candidates;
    }else if(b&&resource.FORMAT==='sp3-gzip'){
      const id=input.objectId;
      if(/^L\d{2}$/.test(id??'')){
        const candidates=nasaIds.get(id)??[];row.evidence.push({kind:'nasa_sp3_correspondence',sha256:nasa.receipt.sha256,candidates});
        if(candidates.length===1){row.norad=candidates[0].norad;row.status='authoritative_identifier_crosswalk';}
        else if(candidates.length>1)row.status='ambiguous_sp3_crosswalk';
      }else{
        const start=epoch(b.first),stop=epoch(b.last);assert.ok(Number.isFinite(start)&&Number.isFinite(stop));
        // Identity-only guard: require the same association for every epoch and
        // a 60-second margin in either time convention. No time conversion is
        // claimed; boundary products await the native time module.
        const candidates=prn.filter(p=>p.prn===id&&p.from<=start-60000&&p.to>stop+60000).map(p=>({...p,...svn.get(p.svn),from:undefined,to:undefined}));
        row.evidence.push({kind:'igs_prn_svn_identifier',sha256:igs.receipt.sha256,first:b.first,last:b.last,sourceTimeSystem:b.timeSystem,boundaryGuardSeconds:60,candidates});
        if(candidates.length===1&&candidates[0].norad>0){row.norad=candidates[0].norad;row.status='authoritative_interval_crosswalk';}
        else if(candidates.length>1)row.status='ambiguous_prn_interval';else row.status='missing_or_boundary_crossing_prn_interval';
      }
    }
    row.inFrozenArchive=row.norad?archive.has(row.norad):null;rows.push(row);
  }
  if(!outcome.identities?.length)rows.push({resourceKey:key,source:source.source_id,index:null,input:null,status:'resource_without_decoded_identity',norad:null,evidence:[],inventoryStatus:outcome.status});
}
const tally=items=>Object.fromEntries([...items.reduce((m,k)=>m.set(k,(m.get(k)??0)+1),new Map())].sort());
const numeric=[...new Set(rows.map(r=>r.norad).filter(Boolean))].sort((a,b)=>a-b),bySource={};
for(const source of queue.sources){const selected=rows.filter(r=>r.source===source.source_id);bySource[source.source_id]={resources:source.resources.length,discoveryState:source.discoveryState,identityRows:selected.length,statuses:tally(selected.map(r=>r.status)),uniqueCandidateNumericIds:new Set(selected.map(r=>r.norad).filter(Boolean)).size};}
const prior=read(path.join(root,'results/propagator-catalog-census/normalization/summary.json'));
const result={schema:'direct-identity-reconciliation',completeResourceAccounting:true,completeScientificComparison:false,
  provenance:{normalizationId:prior.provenance.normalizationId,inventoryOutcomesSha256:prior.provenance.outcomeHashesSha256,censusSha256:hashFile(censusFile),sourceSha256:hashFile(new URL(import.meta.url)),
    crosswalks:[igs,nasa,planet].map(x=>({url:x.receipt.url,sha256:x.receipt.sha256,receiptSha256:x.receiptSha256})),planetSnapshotTleSha256:tleListing.sha256},
  counts:{resources:queue.sources.reduce((n,s)=>n+s.resources.length,0),identityOrMissingRows:rows.length,statuses:tally(rows.map(r=>r.status)),uniqueCandidateNumericIds:numeric.length,numericIdsAbsentFromArchive:numeric.filter(x=>!archive.has(x))},sources:bySource,
  limitations:['Candidate identity resolution does not verify physical identity or remove cross-tagging risk. Planet matches remain explicitly unverified.',
    'Repeated versions, duplicate payloads, source-local slots and failed resources remain separate records. No spacecraft are merged by a loose name.',
    'IGS interval checks use a conservative time-label margin for identity only; physical time/frame conversion remains a native-module requirement.',
    'No propagator, covariance calibration or collision-risk result is generated by identity reconciliation.']};
write(path.join(identityDir,'reconciled-identities.json'),rows);result.provenance.identityRowsSha256=hashFile(path.join(identityDir,'reconciled-identities.json'));
write(path.join(root,'results/propagator-catalog-census/normalization/identity-summary.json'),result);console.log(JSON.stringify(result.counts));
