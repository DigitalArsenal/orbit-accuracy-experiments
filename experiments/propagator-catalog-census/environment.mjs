// The pilot environment is immutable. Contemporary arcs use the registered newer
// copy of the same daily product, with exactly the same record-selection rules.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { environment as historical } from '../propagator-published-truth/environment.mjs';
import { config as baseline } from '../propagator-published-truth/common.mjs';
import { checked,read,DAY,iso } from './common.mjs';

export const weatherHash='7cc9d6865ebf286891099ff9186f0ca5b05855eba8778b112e5cc6fc83c86bda';
export async function environment(run,W){
  const old=await historical(run,W),file=path.join(run.dir,'environment/Kp_ap_Ap_SN_F107_since_1932.txt');
  const text=checked(file,weatherHash).toString('utf8'),days=new Map();
  for(const line of text.split('\n')){
    if(!line||line.startsWith('#'))continue;
    const t=line.trim().split(/\s+/);if(t.length<27)continue;
    const date=`${t[0]}-${t[1].padStart(2,'0')}-${t[2].padStart(2,'0')}`,ap=Number(t[23]),f107=Number(t[25]);
    if(ap>=0&&f107>0)days.set(date,{ap:Math.round(ap),f107});
  }
  const P=W.PRW,table=(name,fields)=>Object.assign(new P[`${name}T`](),fields);
  const encode=(port,arm,value)=>W.frame(port,'PRW',W.encode(P,'PRW',table('PRW',{[arm]:value}),true));
  const cached=read(baseline.environment),eop=W.unpack(P,'PRW',Buffer.from(cached.inputs.earth_orientation_finals,'base64')).EARTH_ORIENTATION.ROWS;
  const catalog=await import(pathToFileURL(path.join(run.modules,'propagator/ffm/catalog.mjs')).href);
  const kernel=W.frame('kernel','PRW',catalog.kernelRecord(fs.readFileSync(baseline.kernel))),date=t=>iso(t).slice(0,10);
  return arc=>{
    if(arc.E<Date.parse('2026-10-09T00:00:00Z')){const e=old(arc);e.audit.weatherSha256=baseline.weather.sha256;return e;}
    const lastDate=date(Date.parse(`${date(arc.E)}T00:00:00Z`)-DAY),rows=[];
    for(let t=Date.parse(`${date(arc.fit[0].ms-3*DAY)}T00:00:00Z`);date(t)<=lastDate;t+=DAY){
      const d=days.get(date(t));if(!d)continue;
      const a=[];for(let k=-40;k<=40;k++){const q=date(t+k*DAY);if(q<=lastDate&&days.has(q))a.push(days.get(q).f107);}
      if(a.length)rows.push({date:date(t),...d,c81:a.reduce((s,x)=>s+x,0)/a.length});
    }
    if(!rows.length||rows[0].date>date(arc.fit[0].ms-DAY))throw new Error('Weather history missing at fit start');
    const last=rows.at(-1),ffmRows=[...rows];for(let t=Date.parse(`${last.date}T00:00:00Z`)+DAY;t<=arc.E+9*DAY;t+=DAY)ffmRows.push({...last,date:date(t)});
    const lo=arc.fit[0].ms/DAY+40587-2,hi=arc.E/DAY+40587+9,earth=eop.filter(r=>r.MJD>=lo&&r.MJD<=hi);
    if(!earth.length||earth[0].MJD>lo+1||earth.at(-1).MJD<hi-1)throw new Error('EOP coverage insufficient');
    const weather=ffmRows.map(r=>table('SPW',{DATE:r.date,F107_OBS:r.f107,F107_ADJ:r.f107,F107_OBS_CENTER81:r.c81,F107_OBS_LAST81:r.c81,AP_AVG:r.ap,AP1:r.ap,AP2:r.ap,AP3:r.ap,AP4:r.ap,AP5:r.ap,AP6:r.ap,AP7:r.ap,AP8:r.ap}));
    return {ap:W.frame('space_weather','SPW',W.spw(rows)),inputs:[kernel,encode('earth_orientation','EARTH_ORIENTATION',table('PRWEarthOrientation',{ROWS:earth})),encode('space_weather','SPACE_WEATHER',table('PRWSpaceWeatherTable',{ROWS:weather}))],audit:{cutoff:lastDate,lastObserved:last.date,rows:rows.length,forecast:'persistence',eopRows:earth.length,weatherSha256:weatherHash}};
  };
}
