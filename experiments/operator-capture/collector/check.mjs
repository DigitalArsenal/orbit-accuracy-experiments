// E2E for E13b amendment A4 (experiments-operator-capture-keep-covariance-20261029): live public SpaceX files, the pinned WASM, counts only.
//   node experiments/operator-capture/collector/check.mjs        (needs: npm ci --prefix experiments/operator-capture/collector)
// It checks, on three live files of 16 hours or more:
//   1. the registered E13b record derived from the 512 KiB range is byte-identical to the one derived from the 256 KiB range of the same file
//      (only the request time is aligned), and it keeps the contract of experiments/e13b-starlink-dca/run.mjs:34-37;
//   2. the sidecar holds 97 ten-minute GCRF states, 21 UVW covariance values each, 16.0 hours, the values exactly as the source gives them;
//   3. a file shorter than 16 hours gives all it holds, and a 256 KiB range cannot give a sidecar;
//   4. a real capture cycle (runCycle, three files, scratch root) writes both products for each file and the counts-only reader reads them.
// Unreachable inputs fail. Nothing is skipped.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {Fetcher,PREFIX_BYTES} from './transport.mjs';
import {openMeme,retainedPoints,STEP,REGISTERED_BYTES,RETAINED_RECORDS} from './meme.mjs';
import {registeredProducts,sidecarProducts} from './capture.mjs';
import {sidecarCounts} from './sidecar.mjs';
import {subsets} from './registration.mjs';
import {runCycle,firstSlot,CYCLE_MS} from './collect.mjs';
import {countCycle} from './count-cycle.mjs';
import {openPhysics} from './physics.mjs';
import {verifyReference} from './verify-reference.mjs';
import * as fb from 'flatbuffers';
import * as O from 'spacedatastandards.org/lib/js/OCM/main.js';

const captureRoot=process.env.OPERATOR_CAPTURE_ROOT??'/opt/data/sdn-archive/operator-capture';
const active=JSON.parse(fs.readFileSync(path.join(captureRoot,'_collector','active.json'),'utf8'));   // no installed release: this fails
const modules=process.env.OPERATOR_MODULES_ROOT??path.join(active.release,'modules');
const registration=JSON.parse(fs.readFileSync(path.join(active.release,'registration.json'),'utf8'));
const producer='sdn-operator-capture check';
await verifyReference(modules);                                         // the pinned orbits module on the public Basilisk case
const physics=await openPhysics(modules),fetcher=new Fetcher(),scratch=fs.mkdtempSync(path.join(os.tmpdir(),'operator-capture-check-'));
const reg=subsets(path.join(scratch,'no-registration'));                // fallback-all, the mode the capture runs in
const report={files:[]};
try{
  const weather=await physics.weather(fetcher),manifest=await fetcher.manifest();
  const gz=record=>gzipSync(JSON.stringify(record)+'\n');
  // The tokens of a prefix, read here independently of meme.mjs: record k holds the epoch, six state values and 21 covariance values.
  const covarianceOf=bytes=>{const lines=bytes.toString().split('\n').slice(4),out=[];for(let k=0;k+3<lines.length&&out.length<RETAINED_RECORDS;k+=4){const t=lines.slice(k,k+4).join(' ').trim().split(/\s+/);if(t.length===28)out.push(t.slice(7).map(Number));}return out;};
  let chosen=0,longFile;
  for(let i=0;i<manifest.names.length&&chosen<3;i+=Math.floor(manifest.names.length/7)){
    const name=manifest.names[i];let r512;
    try{r512=await fetcher.prefix(name);}catch(error){if(error.gone)continue;throw error;}
    const meme=openMeme(r512.bytes);
    if(Math.round((meme.stopMs-meme.startMs)/(meme.step*1000))+1<RETAINED_RECORDS)continue;       // this one is a short file; the short-file path is checked below
    chosen++;longFile??=r512;
    const url=r512.url,r256={name,url,...await fetcher.get(url,[0,REGISTERED_BYTES-1])};
    assert(r256.bytes.equals(r512.bytes.subarray(0,REGISTERED_BYTES)),'the 256 KiB range differs from the first 256 KiB of the 512 KiB range');
    assert.equal(r256.etag,r512.etag);
    const file256={...r256,retrievedUtc:r512.retrievedUtc};             // the request time is the one field the bytes do not give
    const a=await registeredProducts({file:r512,physics,weatherRows:weather.rows,weatherSha256:weather.sha256,reg});
    const b=await registeredProducts({file:file256,physics,weatherRows:weather.rows,weatherSha256:weather.sha256,reg});
    assert(gz(a.record).equals(gz(b.record)),`${name}: the record from the 512 KiB range differs from the record from the 256 KiB range`);
    // experiments/e13b-starlink-dca/run.mjs:34-37, on the new record
    const record=a.record;
    assert.equal(record.samples.length,49);assert.equal(record.source.rawPersisted,false);assert.equal(record.source.bytes,record.source.range[1]+1);assert(record.source.bytes<=262144);
    assert.equal(record.frame,'GCRF');
    record.samples.forEach((p,j)=>{assert.equal(p.ms-record.samples[0].ms,j*600000);assert(Number.isFinite(p.energyJkg));assert(Number.isFinite(p.cumulativeDragWorkB1Jkg));assert.equal(p.meanElements.length,6);assert(p.meanElements.every(Number.isFinite));});
    for(const p of record.truth){assert.equal(p.stateM.length,6);assert(p.stateM.every(Number.isFinite));assert(p.ms>=record.samples[0].ms&&p.ms<=record.samples.at(-1).ms);}
    // the sidecar
    const bytes=await sidecarProducts({file:r512,head:a.head,derived:a.derived,physics,producer}),counts=sidecarCounts(bytes);
    assert.deepEqual({states:counts.states,covariancePerState:counts.covariancePerState,hours:counts.hours,covFrame:counts.covFrame,covOrdering:counts.covOrdering,trajFrame:counts.trajFrame,identifier:counts.identifier},
      {states:97,covariancePerState:21,hours:16,covFrame:'UVW',covOrdering:'LTM',trajFrame:'GCRF',identifier:'$OCM'});
    const ocm=O.OCM.getSizePrefixedRootAsOCM(new fb.ByteBuffer(bytes)).unpack(),source=covarianceOf(r512.bytes);
    assert.equal(ocm.COVARIANCE_DATA.length,97*21);
    for(let s=0;s<97;s++)assert.deepEqual(ocm.COVARIANCE_DATA.slice(s*21,s*21+21),source[s*10],`${name}: covariance of state ${s} is not the source's`);
    assert.equal(Date.parse(ocm.METADATA.START_TIME),record.samples[0].ms);assert.equal(Date.parse(ocm.METADATA.STOP_TIME),record.samples[0].ms+16*3600000);assert.equal(ocm.STATE_STEP_SIZE,600);
    a.truth.forEach((t,j)=>assert.deepEqual(ocm.STATE_DATA.slice(j*6,j*6+6),t.stateM.map(v=>v/1000),`${name}: sidecar state ${j} differs from the registered truth state`));
    for(const v of ocm.STATE_DATA)assert(Number.isFinite(v));
    assert.throws(()=>retainedPoints(file256),/sixteen hours exceed the fixed prefix budget/);
    report.files.push({norad:record.source.norad,recordBytes:gz(record).length,sidecarStates:counts.states,covariancePerState:counts.covariancePerState,hoursRetained:counts.hours,sidecarBytes:bytes.length,byteIdenticalTo256KiB:true});
  }
  assert.equal(chosen,3,'fewer than three files of 16 hours or more among the sampled manifest entries');
  // A file that holds less than 16 hours gives all it holds: a live file cut after 600 records, its header stop epoch cut with it.
  const live=longFile,liveMeme=openMeme(live.bytes),cut=600;
  const lines=live.bytes.toString().split('\n'),stop=new Date(liveMeme.startMs+(cut-1)*STEP*1000).toISOString().slice(0,19).replace('T',' ');
  lines[1]=lines[1].replace(/ephemeris_stop:.+? UTC/,`ephemeris_stop:${stop} UTC`);
  const short=retainedPoints({...live,bytes:Buffer.from(lines.slice(0,4+cut*4).join('\n')+'\n')});
  assert.equal(short.length,60);assert.equal(short.at(-1).ms-short[0].ms,590*STEP*1000);report.shortFile={records:cut,sidecarStates:short.length};
  // a real cycle on a scratch root: both products per file, counted by the guarded reader
  fs.mkdirSync(path.join(scratch,'_collector'));fs.writeFileSync(path.join(scratch,'_collector','active.json'),JSON.stringify({registration:{installedUtc:'2000-01-01T00:00:00.000Z'}}));
  const cycle=await runCycle({captureRoot:scratch,physics,registration,producer,subsetsFile:path.join(scratch,'no-registration'),log:()=>{},stop:()=>false,limit:3});
  assert(cycle&&!cycle.failure,cycle?.failure?.message);
  const ledger=JSON.parse(fs.readFileSync(path.join(scratch,'cycles.jsonl'),'utf8').trim().split('\n').at(-1)),counted=countCycle(scratch,ledger.id);
  assert.equal(ledger.status,'partial');assert.equal(ledger.limit,3);assert.equal(ledger.files+ledger.failures,3);assert.equal(ledger.sidecars,ledger.files);assert.equal(ledger.sidecarFailures,0);
  assert.deepEqual(counted.files,{json:ledger.files,sidecars:ledger.files,paired:ledger.files,jsonOnly:0,sidecarOnly:0});
  assert.deepEqual(counted.covariancePerState,{21:ledger.files});
  assert.deepEqual(counted.recordsPerFile.registeredSamples,{49:ledger.files});assert.equal(counted.hoursRetained.max,16);assert.deepEqual(counted.labels.covFrame,{UVW:ledger.files});
  assert.throws(()=>countCycle(path.join(scratch),'1999-01-01T00-00-00-000Z'),/refused/);          // a cycle older than the release is refused
  // a restart keeps the eight-hour cadence: the first cycle waits for the next slot, a missed slot starts at once, no ledger starts at once
  const t0=Date.parse(ledger.startedUtc);
  assert.equal(firstSlot(scratch,t0+3600000),t0+CYCLE_MS);assert.equal(firstSlot(scratch,t0+CYCLE_MS+5000),t0+CYCLE_MS+5000);assert.equal(firstSlot(path.join(scratch,'none'),123),123);
  report.cycle={files:counted.files,sidecarStates:counted.recordsPerFile.sidecarStates,hoursRetained:counted.hoursRetained,prefixBytes:PREFIX_BYTES,requests:ledger.requests};
  console.log(JSON.stringify({operatorCaptureCheck:'PASS',...report}));
}finally{await physics.destroy();fs.rmSync(scratch,{recursive:true,force:true});}
