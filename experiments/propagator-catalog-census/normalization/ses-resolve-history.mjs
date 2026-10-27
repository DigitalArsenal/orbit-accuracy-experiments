// Some operator TLE links contain several dated sets for the same spacecraft.
// Resolve their common identity without discarding the original strict-parser
// failure or choosing a preferred epoch.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,read,write,bodyOf,hashFile} from './common.mjs';
const dir=path.join(root,'runs/propagator-catalog-census/ses-identity-20261027');
const first=read(path.join(root,'results/propagator-catalog-census/normalization/ses-identities.json')),records=[];
const checksum=s=>s.length===69&&[...s.slice(0,68)].reduce((n,c)=>n+(/\d/.test(c)?Number(c):c==='-'?1:0),0)%10===Number(s[68]);
const number=s=>/^\d+$/.test(s)?Number(s):/^[A-HJ-NP-Z]\d{4}$/.test(s)?'0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'.indexOf(s[0])*10000+Number(s.slice(1)):null;
for(const prior of first.records){
  const file=path.join(dir,'outcomes',prior.resourceKey+'.json');assert.equal(hashFile(file),prior.receiptSha256);const o=read(file);
  const r={...prior,originalStatus:prior.status,originalReason:prior.reason,tleSets:[]};
  if(o.matchedListingRows===1&&o.candidateTleUrls.length===1&&o.receipt?.state==='downloaded')try{
    const lines=bodyOf(dir,o.receipt).toString().split(/\r?\n/),used=new Set();
    for(let i=0;i<lines.length;i++)if(lines[i].startsWith('1 ')){
      const a=lines[i],b=lines[i+1];assert.ok(b?.startsWith('2 '));assert.ok(checksum(a)&&checksum(b));assert.equal(a.slice(2,7),b.slice(2,7));
      const norad=number(a.slice(2,7).trim());assert.ok(norad>0);r.tleSets.push({norad,epochLabel:a.slice(18,32)});used.add(i+1);
    }
    assert.ok(r.tleSets.length);assert.equal(lines.filter(l=>l.startsWith('2 ')).length,used.size);
    const ids=[...new Set(r.tleSets.map(t=>t.norad))];assert.equal(ids.length,1,'Multiple catalog identities in explicitly linked TLE history');
    r.norad=ids[0];r.status='operator_explicit_listing_crosswalk';r.reason=null;
  }catch(e){r.status='unresolved';r.norad=null;r.reason=e.message;}
  records.push(r);
}
const out={...first,sourceSha256:hashFile(new URL(import.meta.url)),acquisitionSummarySha256:hashFile(path.join(root,'results/propagator-catalog-census/normalization/ses-identities.json')),
  resolved:records.filter(r=>r.norad).length,unresolved:records.filter(r=>!r.norad).length,records};
write(path.join(root,'results/propagator-catalog-census/normalization/ses-identity-history.json'),out);
console.log(JSON.stringify({resolved:out.resolved,unresolved:out.unresolved,multipleSets:records.filter(r=>r.tleSets.length>1).length,failures:records.filter(r=>!r.norad)}));
