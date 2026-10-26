// One real-feed E2E: native discovery replay, full retained-byte integrity,
// complete queue accounting, and native validation replay by source/format.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {parseArgs} from 'node:util';
import {read,write,sha,iso,registration,runDir,bodyOf,keyOf} from './common.mjs';
import {wire} from './wire.mjs';
import {supplements} from './collect.mjs';
import {report} from './report.mjs';
const {values}=parseArgs({options:{run:{type:'string',default:'direct-20261026-r2'},modules:{type:'string'}}});
if(!values.modules)throw Error('--modules required');
const reg=registration(values.modules),dir=runDir(values.run),manifest=read(path.join(dir,'manifest.json'));
assert.deepEqual(reg.sourceHashes,manifest.sourceHashes,'Run source changed');
assert.equal(sha(fs.readFileSync(path.join(dir,'queue.json'))),manifest.queueSha256);
if(manifest.imported){
  const parent=runDir(manifest.imported.run);
  assert.equal(sha(fs.readFileSync(path.join(parent,'manifest.json'))),manifest.imported.manifestSha256);
  assert.equal(sha(fs.readFileSync(path.join(parent,'queue.json'))),manifest.queueSha256);
  assert.equal(sha(fs.readFileSync(path.join(dir,'imported-receipts.json'))),manifest.imported.receiptsSha256);
  for(const r of read(path.join(dir,'imported-receipts.json')))bodyOf(dir,r);
}
const queue=read(path.join(dir,'queue.json')),registry=read(path.join(values.modules,'data-source/ephemeris-source/sources.json'));
assert.deepEqual(queue.sources.map(x=>x.source_id),registry.sources.map(x=>x.source_id));
const W=await wire(values.modules),keys=new Set(),files=new Set(),replayed=new Set(),gaps=[];
let artifacts=0,listings=0,rawBytes=0;
try{
  for(const source of queue.sources){
    for(const l of source.listings){if(l.file){bodyOf(dir,l);files.add(l.file);}listings++;}
    if(source.credentialed){assert.equal(source.discoveryState,'credential_required');gaps.push(`${source.source_id}: credential required`);continue;}
    const plans=(await W.plan(source.source_id,manifest.epochMs)).map(x=>x.url);
    assert.deepEqual(plans,source.requestUrls);
    let native=[],error;
    try{native=await W.discover(source.source_id,manifest.epochMs,source.listings.filter(x=>x.role==='native').map(l=>({...l,body:l.file?bodyOf(dir,l):Buffer.alloc(0)})));}catch(e){error=e.message;}
    if(source.discoveryState==='discovered'){assert.equal(error,undefined);assert.deepEqual(native.map(x=>x.URL).sort(),source.resources.filter(x=>x.discovery.kind==='native').map(x=>x.URL).sort());}
    else{assert.equal(error,source.error);gaps.push(`${source.source_id}: ${source.error}`);}
    const all=new Set([...native,...supplements(source,source.listings,dir)].map(x=>x.URL));
    assert.deepEqual([...all].sort(),source.resources.map(x=>x.URL).sort());
    for(const r of source.resources){
      const key=keyOf(r);assert(!keys.has(key),'Duplicate source/resource');keys.add(key);
      const file=path.join(dir,'outcomes',key+'.json');assert(fs.existsSync(file),`Pending: ${r.SOURCE_ID}/${r.RESOURCE_ID}`);
      const out=read(file);assert.deepEqual(out.resource,r);assert.equal(out.receipt.url,r.URL);
      let body;if(out.receipt.file){body=bodyOf(dir,out.receipt);files.add(out.receipt.file);}
      for(const a of out.receipt.attempts??[])if(a.file&&!files.has(a.file)){bodyOf(dir,a);files.add(a.file);}
      if(out.receipt.state==='downloaded'){
        assert.equal(out.receipt.status,200);assert(body?.length);assert(['passed','failed'].includes(out.validation.rawValidation));artifacts++;rawBytes+=body.length;
        const kind=`${r.SOURCE_ID}/${r.FORMAT}/${out.validation.rawValidation}`;
        if(!replayed.has(kind)){let validation;try{validation=await W.validate(r,out.receipt,body);}catch(e){validation={rawValidation:'failed',error:e.message,identityCoverage:'unknown'};}assert.deepEqual(validation,out.validation);replayed.add(kind);}
      }else{assert.equal(out.receipt.state,'download_failed');assert(out.receipt.error);assert.equal(out.validation.rawValidation,'not_run');}
    }
  }
  assert.deepEqual(fs.readdirSync(path.join(dir,'outcomes')).filter(x=>x.endsWith('.json')).sort(),[...keys].map(k=>k+'.json').sort());
  const summary=report(values.run);assert.equal(summary.pending,0);assert.equal(summary.downloaded,artifacts);
  const evidence={status:'passed',meaning:'acquisition accounting and integrity; gaps are not coverage passes',verifiedUtc:iso(),manifestSha256:sha(fs.readFileSync(path.join(dir,'manifest.json'))),queueSha256:manifest.queueSha256,sources:queue.sources.length,listings,resources:keys.size,downloaded:artifacts,rawBytes,retainedFilesVerified:files.size,nativeValidationReplayed:[...replayed],gaps,downloadFailures:summary.downloadFailed,validationFailures:summary.rawValidationFailed,completeCatalog:false};
  write(path.join(dir,'verification.json'),evidence);console.log(JSON.stringify(evidence,null,2));
}finally{await W.close();}
