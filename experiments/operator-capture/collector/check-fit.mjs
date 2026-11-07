// E2E for E13b amendment A6 (stack issue 224): real capture cycles (runCycle, three live public files, the pinned WASM, a scratch root) write one fitted AP $OCM per file as one
// stream. Each record holds its covariance, the label Uncalibrated, full credit and no states; a forced fit failure is counted and keeps the sidecar; a refused weather source
// flies the fit on the last good rows and says so; one stored record flies through propagate and is compared with a later state of its file. Prints counts and errors in km only.
//   OPERATOR_MODULES_ROOT=<release>/modules OPERATOR_FIT_MODULES_ROOT=<modules checkout> node experiments/operator-capture/collector/check-fit.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as fb from 'flatbuffers';
import {OCM} from 'sds-fit/lib/js/OCM/OCM.js';
import {OEM} from 'sds-fit/lib/js/OEM/OEM.js';
import {covarianceCalibration} from 'sds-fit/lib/js/OCM/covarianceCalibration.js';
import {PCFT} from 'sds-fit/lib/js/PCF/PCF.js';
import {PCFOutputT} from 'sds-fit/lib/js/PCF/PCFOutput.js';
import {pcfOutputFrame} from 'sds-fit/lib/js/PCF/pcfOutputFrame.js';
import {openPhysics} from './physics.mjs';
import {runCycle} from './collect.mjs';
import {openFit,readFitStream,FIT_STREAM,FIT_MODULES} from './fit.mjs';
import {Fetcher,PREFIX_BYTES} from './transport.mjs';
import {openMeme,complete,readRecords} from './meme.mjs';

const modules=process.env.OPERATOR_MODULES_ROOT,fitRoot=process.env.OPERATOR_FIT_MODULES_ROOT??path.join(modules,'..','fit-modules');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'capture-fit-'));
const physics=await openPhysics(modules),fitter=await openFit(fitRoot);
const cycleIn=async(root,fit=fitter)=>{
  const events=[];
  const out=await runCycle({captureRoot:root,physics,fitter:fit,registration:{},producer:'check-fit',subsetsFile:path.join(root,'no-registration'),log:(e,x)=>events.push([e,x]),stop:()=>false,limit:3});
  assert.equal(out.failure,undefined,out.failure?.message);
  const id=fs.readdirSync(path.join(root,'cycles')).sort().at(-1),dir=path.join(root,'cycles',id);
  return {dir,events,names:fs.readdirSync(dir),summary:JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8'))};
};
const ocmOf=bytes=>OCM.getRootAsOCM(new fb.ByteBuffer(bytes)).unpack();
const sidecars=names=>names.filter(n=>/^\d+\.ocm$/.test(n));
try{
  const root=path.join(scratch,'root');fs.mkdirSync(root);

  // 1. One fit per file, on the current rows. The stream's name is not a sidecar's: the readers of states (operator-theory/backtest.mjs, explore.mjs) never open it.
  const one=await cycleIn(root);
  assert.equal(one.summary.fits,3);assert.equal(one.summary.fitsPlanned,3);assert.equal(one.summary.fitFailures,0);
  assert.equal(one.summary.fitWeather.source,'current',`the fit's weather: ${JSON.stringify(one.summary.fitWeather)}`);
  assert.match(one.summary.fitWeather.forecast,/^noaa-45-day-forecast first-day=\d{4}-\d{2}-\d{2} age-days=\d+$/);
  assert.equal(sidecars(one.names).length,3,'the sidecars stay');assert.equal(one.summary.sidecars,3);
  assert.ok(one.names.includes(FIT_STREAM));assert.doesNotMatch(FIT_STREAM,/^\d+\.ocm$/);
  assert.equal(one.names.filter(n=>n.endsWith('.tmp')).length,0);
  assert.equal(one.names.filter(n=>/\.json\.gz$/.test(n)).length,one.summary.files,'the registered records stay as the E13b weather rule decides');
  assert.equal(one.summary.status,one.summary.weather.unavailable?'sidecars-only':'partial');
  const streamBytes=fs.readFileSync(path.join(one.dir,FIT_STREAM));assert.equal(streamBytes.length,one.summary.fitStreamBytes);
  const records=readFitStream(streamBytes);assert.equal(records.length,3);assert.equal(records.reduce((n,r)=>n+r.length,0),one.summary.fitBytes);
  const noradOfSidecars=sidecars(one.names).map(n=>Number(n.split('.')[0])).sort((a,b)=>a-b);
  assert.deepEqual(records.map(r=>ocmOf(r).METADATA.NORAD_CAT_ID).sort((a,b)=>a-b),noradOfSidecars,'one record per file');
  for(const bytes of records){
    const o=ocmOf(bytes),p=o.PROVENANCE;
    assert.equal(o.STATE_DATA?.length??0,0,'no states in a record');
    assert.ok(o.COVARIANCE_DATA.length>=21&&o.COVARIANCE_DATA.every(Number.isFinite),'it has its covariance');
    assert.equal(o.COV_REALISM.length,1);assert.equal(o.COV_REALISM[0].CALIBRATION,covarianceCalibration.Uncalibrated,'it carries Uncalibrated');
    assert.equal(o.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE,31);assert.equal(o.PERTURBATIONS.MAXIMUM_ZONAL_DEGREE,20);assert.ok(o.PERTURBATIONS.SPACE_WEATHER.length>0);
    assert.equal(p.ORIGINATOR,'SpaceX');assert.match(p.LINEAGE,/^spacex-starlink-meme:MEME_\d+_STARLINK-.*\.txt;weather=current:[0-9a-f]{16};noaa-forecast-first-day=/);
    assert.match(p.SOURCE_URL,/^https:\/\/api\.starlink\.com\/public-files\/ephemerides\/MEME_/);assert.ok(Number.isFinite(Date.parse(p.RETRIEVED_AT)));assert.match(p.SOURCE_SHA256,/^[0-9a-f]{64}$/);
    assert.equal(Number(p.SOURCE_BYTES),PREFIX_BYTES);assert.equal(p.LICENSE_ID,'spacex-starlink');assert.equal(p.SOURCE_ID,'spacex-starlink');
    assert.ok(bytes.length<6000,`one record is about 4.4 KB, this is ${bytes.length}`);
  }
  assert.ok(!one.names.some(n=>/odr/i.test(n)),'no $ODR is stored');
  const held=JSON.parse(fs.readFileSync(path.join(root,'_collector/fit-weather/last-good.json'),'utf8'));assert.equal(held.sha256,one.summary.fitWeather.sha256,'the good rows are saved for later');
  console.log('PASS one fit per file:',{fits:one.summary.fits,fitBytes:one.summary.fitBytes,fitStreamBytes:one.summary.fitStreamBytes,cpuPerFit:Number((one.summary.fitCpuSeconds/3).toFixed(3)),forecast:one.summary.fitWeather.forecast,e13bWeather:one.summary.weather.unavailable??'available'});

  // 2. The E13b build keeps its own artifact and its rule: the fit's build is a second binary beside it, and the summary names both.
  const e13bWeather=physics.provenance.find(m=>m.name==='data-source/space-weather'),fitWeatherPin=FIT_MODULES.find(m=>m.name==='data-source/space-weather');
  assert.notEqual(e13bWeather.wasmSha256,fitWeatherPin.wasmSha256);assert.deepEqual(one.summary.modules,physics.provenance);assert.deepEqual(one.summary.fitModules,FIT_MODULES);
  console.log('PASS the registered records keep the E13b space-weather build',e13bWeather.version,'and the fit runs on',fitWeatherPin.version);

  // 3. A forced fit failure is counted and logged and keeps the sidecar and the other fits.
  let calls=0;const failing={...fitter,fit:(arc,rows)=>{calls++;if(calls===2)throw new Error('forced fit failure');return fitter.fit(arc,rows);}};
  const two=await cycleIn(root,failing);
  assert.equal(two.summary.fits,2);assert.equal(two.summary.fitFailures,1);assert.equal(two.summary.sidecars,3);assert.equal(two.summary.sidecarFailures,0);
  assert.equal(sidecars(two.names).length,3,'the failed fit removed nothing');assert.equal(readFitStream(fs.readFileSync(path.join(two.dir,FIT_STREAM))).length,2);
  const failed=fs.readFileSync(path.join(two.dir,'failures.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(f=>f.product==='fit');
  assert.equal(failed.length,1);assert.equal(failed[0].error,'forced fit failure');
  console.log('PASS a forced fit failure is counted and logged; three sidecars and two fits stay');

  // 4. The weather module refuses: the fit flies on the last good rows and says so in the summary and in each record's provenance.
  const refusing={...fitter,weather:async()=>{throw new Error('data-source/space-weather/parse_weather: space-weather-source: Invalid or stale NOAA 45-day forecast.');}};
  const last=JSON.parse(fs.readFileSync(path.join(root,'_collector/fit-weather/last-good.json'),'utf8'));
  const three=await cycleIn(root,refusing);
  assert.equal(three.summary.fits,3);assert.equal(three.summary.fitWeather.source,'held');assert.equal(three.summary.fitWeather.sha256,last.sha256);assert.equal(three.summary.fitWeather.heldFromUtc,last.savedUtc);
  assert.match(three.summary.fitWeather.unavailable,/Invalid or stale NOAA/);
  for(const bytes of readFitStream(fs.readFileSync(path.join(three.dir,FIT_STREAM))))assert.ok(ocmOf(bytes).PROVENANCE.LINEAGE.includes(`weather=held:${last.sha256.slice(0,16)};held-from=${last.savedUtc}`));
  console.log('PASS weather refused: three fits on the last good rows, stated in the summary and in each record');

  // 5. Refused with no good rows held: no fit, every one counted, the sidecars stay.
  const bare=path.join(scratch,'bare');fs.mkdirSync(bare);
  const four=await cycleIn(bare,refusing);
  assert.equal(four.summary.fits,0);assert.equal(four.summary.fitFailures,3);assert.equal(four.summary.fitWeather.source,'none');assert.equal(sidecars(four.names).length,3);assert.ok(!four.names.includes(FIT_STREAM));
  console.log('PASS weather refused with nothing held: no fit, three counted, the sidecars stay');

  // 6. A stored record flies: propagate reads it back and lands on a later state of the file, past the arc it was fitted on.
  const fetcher=new Fetcher();
  try{
    const errors=[];
    for(const bytes of records){
      const o=ocmOf(bytes),file=await fetcher.prefix(path.basename(o.PROVENANCE.SOURCE_URL));
      const meme=openMeme(file.bytes),{points}=readRecords(meme,complete(meme)),last=points.at(-1),later=await physics.normalize(last);
      const hoursPastArc=(last.ms-points[0].ms)/3600000-16;
      assert.ok(hoursPastArc>0,'the state lies past the fitted arc');
      const pcf=new PCFT();pcf.OUTPUT=Object.assign(new PCFOutputT(),{EPOCHS:[new Date(last.ms).toISOString()],FRAME:pcfOutputFrame.GCRF});
      const builder=new fb.Builder(256);builder.finish(pcf.pack(builder),'$PCF');
      const flown=await fitter.invoke('propagator/sdn-ap','propagate',[{portId:'ocm',typeRef:{schemaName:'OCM.fbs',fileIdentifier:'$OCM',rootTypeName:'OCM',wireFormat:'flatbuffer'},payload:bytes},{portId:'configuration',typeRef:{schemaName:'PCF.fbs',fileIdentifier:'$PCF',rootTypeName:'PCF',wireFormat:'flatbuffer'},payload:builder.asUint8Array()}]);
      const payload=new Uint8Array(flown.find(f=>f.portId==='ephemeris').payload),prefixed=Buffer.from(payload).subarray(8,12).toString()==='$OEM';
      const line=OEM[prefixed?'getSizePrefixedRootAsOEM':'getRootAsOEM'](new fb.ByteBuffer(payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
      const km=Math.hypot(line.X-later.stateM[0]/1000,line.Y-later.stateM[1]/1000,line.Z-later.stateM[2]/1000);
      assert.ok(Number.isFinite(km));errors.push({norad:o.METADATA.NORAD_CAT_ID,km:Number(km.toFixed(3)),hoursPastArc:Number(hoursPastArc.toFixed(2))});
    }
    const median=errors.map(e=>e.km).sort((a,b)=>a-b)[1];
    assert.ok(median<10,`the median of three records against a later state is ${median} km`);
    console.log('PASS stored records fly and land near a later state of their files:',JSON.stringify(errors));
  }finally{fetcher.cancel();}
  console.log('CHECK-FIT PASS');
}finally{await physics.destroy();await fitter.destroy();fs.rmSync(scratch,{recursive:true,force:true});}
process.exit(process.exitCode||0);
