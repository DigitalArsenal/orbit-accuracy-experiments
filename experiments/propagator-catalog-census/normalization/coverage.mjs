// Relate direct identities to existing work without promoting a candidate
// catalog number, an older epoch, or a diagnostic reference into new truth.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,read,write,sha,sourceDir,keyOf,hashFile} from './common.mjs';
const priorDir=path.join(root,'runs/propagator-catalog-census/catalog-epochs-full-replay');
const identityFile=path.join(root,'runs/propagator-catalog-census/direct-identity-20261027/reconciled-identities.json');
const identities=read(identityFile),censusFile=path.join(priorDir,'census.json'),census=read(censusFile);
const queue=read(path.join(sourceDir,'queue.json')),resources=new Map();
for(const s of queue.sources)for(const r of s.resources)resources.set(keyOf(r),r);
const byNumber=new Map(),outcomeHashes=[],failureReasons={},arms=['xp-native','ap-msis','ffm'];
for(const object of census.objects){
  const file=path.join(priorDir,'outcomes',sha(object.key).slice(0,32)+'.json'),bytes=fs.readFileSync(file),o=JSON.parse(bytes);
  assert.equal(o.key,object.key);assert.ok(o.finishedUtc);outcomeHashes.push([o.key,sha(bytes)]);
  const warnings=[...new Set((o.audit?.files??[]).flatMap(f=>[
    ...(/UT1=UTC|xp=yp=0/.test(f.earthOrientation??'')?['diagnostic_earth_orientation']:[]),
    ...(/assum(?:ed|ption)|placeholder/i.test(f.uncertainty??'')?['assumed_reference_uncertainty']:[])
  ]))];
  const saved={key:o.key,source:o.source,lineage:o.lineage,evidence:o.evidence,issue:o.issue??null,status:o.status,
    outcomeSha256:sha(bytes),referenceProvenanceWarnings:warnings,
    rawSourceSha256:[...new Set((o.audit?.files??[]).map(f=>f.sourceSha256).filter(Boolean))],
    arms:Object.fromEntries(arms.map(a=>[a,o.arms?.[a]?{ok:!!o.arms[a].ok,status:o.arms[a].status,reason:o.arms[a].reason??null}:null]))};
  for(const a of arms)if(saved.arms[a]&&!saved.arms[a].ok){const k=a+': '+saved.arms[a].reason;failureReasons[k]=(failureReasons[k]??0)+1;}
  if(object.norad){if(!byNumber.has(object.norad))byNumber.set(object.norad,[]);byNumber.get(object.norad).push(saved);}
}
// Hardware IDs remain distinct even when Planet's provisional mapping gives
// multiple spacecraft the same catalog ID. Preserve each competing match.
const planetByNumber=new Map();
for(const r of identities.filter(r=>r.source==='planet'&&r.norad&&r.status==='operator_crosswalk_unverified')){
  const hwid=String(r.input?.objectId??r.input?.sourceObjectId??'').toLowerCase();
  if(!planetByNumber.has(r.norad))planetByNumber.set(r.norad,new Set());planetByNumber.get(r.norad).add(hwid);
}
const collisions=[...planetByNumber].filter(([,h])=>h.size>1).map(([norad,h])=>({norad,hardwareIds:[...h].sort(),status:'candidate_cross_tagging_unresolved'}));
const collisionIds=new Set(collisions.map(x=>x.norad)),rows=[];
for(const r of identities){
  assert.ok(resources.has(r.resourceKey));const receipt=read(path.join(sourceDir,'outcomes',r.resourceKey+'.json'));
  const prior=r.norad?byNumber.get(r.norad)??[]:[],raw=receipt.receipt.sha256??null;
  rows.push({resourceKey:r.resourceKey,source:r.source,index:r.index,input:r.input,norad:r.norad,identityStatus:r.status,
    identityCollision:r.source==='planet'&&collisionIds.has(r.norad),rawSha256:raw,
    priorCandidateObjectResults:prior,exactRawSourcePresentInPriorResults:!!raw&&prior.some(p=>p.rawSourceSha256.includes(raw)),
    interpretation:'Prior results retain their original source, epoch and reference limitations. Candidate identity overlap is not a new direct-feed accuracy or calibration result.'});
}
const counts=a=>Object.fromEntries([...new Set(a)].sort().map(k=>[k,a.filter(v=>v===k).length]));
const bySource={};
for(const source of queue.sources){
  const rr=rows.filter(r=>r.source===source.source_id),ids=[...new Set(rr.map(r=>r.norad).filter(Boolean))],records=ids.map(id=>byNumber.get(id)??[]);
  bySource[source.source_id]={resources:source.resources.length,identityRows:rr.length,unresolvedRows:rr.filter(r=>!r.norad).length,
    candidateNumericIds:ids.length,identityCollisionRows:rr.filter(r=>r.identityCollision).length,
    arms:Object.fromEntries(arms.map(a=>[a,{attemptedCandidateIds:records.filter(ps=>ps.some(p=>p.arms[a])).length,
      successfulCandidateIds:records.filter(ps=>ps.some(p=>p.arms[a]?.ok)).length,
      candidateIdsWithoutAttempt:ids.filter((id,i)=>!records[i].some(p=>p.arms[a]))}])),
    rowsWithPriorDiagnosticReference:rr.filter(r=>r.priorCandidateObjectResults.some(p=>p.referenceProvenanceWarnings.length)).length,
    exactRawSourcePresentRows:rr.filter(r=>r.exactRawSourcePresentInPriorResults).length};
}
const file=path.join(root,'runs/propagator-catalog-census/direct-identity-20261027/prior-work-coverage.json');write(file,rows);
const out={schema:'direct-feed-prior-work-audit',status:'ACCOUNTING_ONLY',completeDirectScoring:false,
  provenance:{sourceSha256:hashFile(new URL(import.meta.url)),identitiesSha256:hashFile(identityFile),censusSha256:hashFile(censusFile),
    inventoryQueueSha256:hashFile(path.join(sourceDir,'queue.json')),priorOutcomeHashesSha256:sha(JSON.stringify(outcomeHashes)),detailSha256:hashFile(file)},
  counts:{resources:resources.size,identityRows:rows.length,priorSourceObjects:census.objects.length,identityStatuses:counts(rows.map(r=>r.identityStatus))},
  sources:bySource,planetCandidateCollisions:collisions,priorNumericalFailureReasons:failureReasons,
  limitations:['No new propagator residual, covariance-calibration or collision-risk result is calculated.',
    'Archive results are reused as historical evidence, never as current-feed results. Diagnostic EOP and assumed reference uncertainty are explicitly flagged.',
    'An unsuccessful prior arm remains a failure. New data, corrected normalization or changed numerical code requires a separately registered comparison.',
    'Unresolved source-local identities and failed resources remain in the denominator. Planet candidate collisions must not merge hardware identities.']};
write(path.join(root,'results/propagator-catalog-census/normalization/prior-work-coverage.json'),out);
console.log(JSON.stringify({counts:out.counts,planetCandidateCollisions:collisions,sources:bySource},null,2));
