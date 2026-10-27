import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,read,write,sourceDir,keyOf,bodyOf,storeBody,hashFile} from './common.mjs';
const dir=path.join(root,'runs/propagator-catalog-census/ses-identity-20261027');
const queue=read(path.join(sourceDir,'queue.json')),source=queue.sources.find(s=>s.source_id==='ses');
const listing=source.listings.find(l=>l.role==='native');
assert.equal(listing.sha256,'c17f7881691a2b74ade7fa54080853ba32be261e6228e68fb7be3712e941f766');
const html=bodyOf(sourceDir,listing).toString();
const rows=html.split(/<div\b[^>]*class="satellite-tools__table-row"[^>]*>/i).slice(1).map(s=>[...s.matchAll(/href="([^"]+)"/g)].map(m=>m[1]));
assert.ok(rows.length>=source.resources.length);
const provenance={sourceSha256:hashFile(new URL(import.meta.url)),planSha256:hashFile(new URL('./OPERATOR-IDENTITIES.md',import.meta.url)),listingSha256:listing.sha256,queueSha256:hashFile(path.join(sourceDir,'queue.json'))};
const checksum=s=>s.length===69&&[...s.slice(0,68)].reduce((n,c)=>n+(/\d/.test(c)?Number(c):c==='-'?1:0),0)%10===Number(s[68]);
function catalogNumber(s){if(/^\d{1,5}$/.test(s))return Number(s);assert.match(s,/^[A-HJ-NP-Z]\d{4}$/);return '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'.indexOf(s[0])*10000+Number(s.slice(1));}
const outcomes=[];
for(const resource of source.resources){
  const resourceKey=keyOf(resource),file=path.join(dir,'outcomes',resourceKey+'.json');let out;
  if(fs.existsSync(file)){out=read(file);assert.deepEqual(out.provenance,provenance);if(out.receipt?.file)bodyOf(dir,out.receipt);}
  else{
    out={resourceKey,resource,provenance,status:'unresolved',norad:null};
    const matched=rows.filter(r=>r.includes(resource.URL)),links=[...new Set(matched.flat().filter(u=>/\/public\/norad_tle\/[^/]+\.TLE$/.test(u)))];
    out.matchedListingRows=matched.length;out.candidateTleUrls=links;
    if(matched.length!==1||links.length!==1){out.reason='Listing does not establish one explicit row and one linked TLE';}
    else{
      const receipt={url:links[0],retrievedUtc:new Date().toISOString()};out.receipt=receipt;
      try{
        const response=await fetch(receipt.url,{signal:AbortSignal.timeout(30000),headers:{'user-agent':'SDN-orbit-accuracy-research/1.0'}});
        receipt.status=response.status;receipt.finalUrl=response.url;receipt.headers=Object.fromEntries(['content-type','last-modified','etag'].filter(k=>response.headers.has(k)).map(k=>[k,response.headers.get(k)]));
        const bytes=Buffer.from(await response.arrayBuffer());Object.assign(receipt,storeBody(dir,bytes));receipt.state=response.status===200&&bytes.length?'downloaded':'download_failed';
        assert.equal(receipt.state,'downloaded',`HTTP ${response.status}`);
        const lines=bytes.toString().split(/\r?\n/).filter(l=>l.trim()),one=lines.filter(l=>l.startsWith('1 ')),two=lines.filter(l=>l.startsWith('2 '));
        assert.equal(one.length,1);assert.equal(two.length,1);assert.ok(checksum(one[0])&&checksum(two[0]),'TLE checksum');
        const id=one[0].slice(2,7).trim();assert.equal(two[0].slice(2,7).trim(),id);out.norad=catalogNumber(id);assert.ok(out.norad>0);
        out.tleEpochLabel=one[0].slice(18,32);out.status='operator_explicit_listing_crosswalk';
      }catch(e){out.reason=e.message;if(!receipt.state)receipt.state='download_failed';receipt.error=e.message;receipt.causeCode=e.cause?.code??e.code??null;}
    }
    write(file,out);
  }
  outcomes.push(out);console.log(JSON.stringify({resource:resource.RESOURCE_ID,status:out.status,norad:out.norad,reason:out.reason}));
}
const count=status=>outcomes.filter(o=>o.status===status).length;
write(path.join(root,'results/propagator-catalog-census/normalization/ses-identities.json'),{
  schema:'supplemental-operator-identity',provenance,resources:source.resources.length,finished:outcomes.length,
  resolved:count('operator_explicit_listing_crosswalk'),unresolved:count('unresolved'),
  records:outcomes.map(o=>({resourceKey:o.resourceKey,resourceId:o.resource.RESOURCE_ID,status:o.status,norad:o.norad,
    url:o.receipt?.url??null,bodySha256:o.receipt?.sha256??null,receiptSha256:hashFile(path.join(dir,'outcomes',o.resourceKey+'.json')),tleEpochLabel:o.tleEpochLabel??null,reason:o.reason??null})),
  limitations:['Explicit operator listing correspondence, not independently verified physical identity or precise ephemeris truth.',
    'Later TLE epochs are retained and do not replace original I11 epochs. Original identity and inventory outcomes remain unchanged.']});
