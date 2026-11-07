// E2E for E13b amendment A5: when the weather sources refuse, a real capture cycle (three live public files, the pinned WASM, a scratch root)
// still keeps the sidecars, writes no registered record, says why, and ends sidecars-only.
//   OPERATOR_MODULES_ROOT=<release>/modules node experiments/operator-capture/collector/check-no-weather.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openPhysics} from './physics.mjs';
import {runCycle,firstSlot} from './collect.mjs';
import {sidecarCounts} from './sidecar.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'capture-no-weather-'));
const physics=await openPhysics(process.env.OPERATOR_MODULES_ROOT);
try{
  const refused={...physics,weather:async()=>{throw new Error('data-source/space-weather/parse_weather: space-weather-source: Invalid or stale NOAA 45-day forecast.');}};
  const events=[];
  const out=await runCycle({captureRoot:root,physics:refused,registration:{},producer:'check-no-weather',subsetsFile:path.join(root,'no-registration'),log:(e,x)=>events.push([e,x]),stop:()=>false,limit:3});
  assert.equal(out.failure,undefined);
  const [cycle]=fs.readdirSync(path.join(root,'cycles'));
  const dir=path.join(root,'cycles',cycle),summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json'),'utf8')),names=fs.readdirSync(dir);
  assert.equal(summary.status,'sidecars-only');
  assert.match(summary.weather.unavailable,/Invalid or stale NOAA/);
  assert.equal(summary.files,0);
  assert.equal(summary.sidecars,3);
  assert.equal(names.filter(n=>n.endsWith('.json.gz')).length,0,'no registered record without weather');
  const sidecars=names.filter(n=>n.endsWith('.ocm'));
  assert.equal(sidecars.length,3);
  for(const n of sidecars)assert.equal(sidecarCounts(fs.readFileSync(path.join(dir,n))).states,97,n);
  assert.ok(events.some(([e])=>e==='weather-unavailable'));
  // A cycle the disk floor delayed keeps its slot: a restart schedules from the id, not from the late start.
  const paused=path.join(root,'paused');fs.mkdirSync(paused);
  fs.writeFileSync(path.join(paused,'cycles.jsonl'),JSON.stringify({id:'2026-11-07T07-53-00-496Z',startedUtc:'2026-11-07T12:50:34.563Z'})+'\n');
  assert.equal(firstSlot(paused,Date.parse('2026-11-07T15:02:00Z')),Date.parse('2026-11-07T15:53:00.496Z'));
  console.log('CHECK-NO-WEATHER PASS',{status:summary.status,sidecars:summary.sidecars,sidecarBytes:summary.sidecarBytes});
}finally{await physics.destroy();fs.rmSync(root,{recursive:true,force:true});}
