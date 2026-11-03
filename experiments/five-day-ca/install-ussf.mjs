// Install only staged U rows; validate the entire replacement before writing.
import fs from 'node:fs';
import {config,registration,analysisProvenance,hash} from './guard.mjs';
import {readRows} from './statistics.mjs';
registration();
const plans=[],inputs={},cells=[],stamp=Date.now();
for(const label of ['regimes','truth2','truth']){
 const staged=readRows(`${config.store}/ussf-replay/${label}`),fresh=new Map(staged.map(r=>[r.key,r]));
 if(fresh.size!==staged.length)throw Error('duplicate staged key');
 const dir=`${config.store}/cheap/${label}`;
 const c={label,installedWindows:0,compared:0,differences:0,maxAbsKm:0,oldLeadDifferences:0};
 for(const f of fs.readdirSync(dir).filter(f=>/^rows-\d+\.jsonl$/.test(f))){
  const file=`${dir}/${f}`,bytes=fs.readFileSync(file);inputs[file]=hash(bytes);
  const rows=bytes.toString().split('\n').filter(Boolean).map(JSON.parse);
  for(const r of rows){const replacement=fresh.get(r.key);if(!replacement)continue;fresh.delete(r.key);c.installedWindows++;
   if(Boolean(r.error)!==Boolean(replacement.error))throw Error('window exclusion changed');
   for(const [arm,a]of Object.entries(replacement.arms)){if(!/^U\d+$/.test(arm))throw Error('non-U arm');
    for(const [day,v]of Object.entries(a.days??{}))for(const k of ['e','r','t','n']){const before=r.arms[arm]?.days?.[day]?.[k],delta=Math.abs(v[k]-before);if(!Number.isFinite(delta)||delta>.001)throw Error(`U exceeds 1 m: ${label}/${arm}/${day}/${k}: ${delta}`);c.compared++;c.differences+=delta!==0;c.maxAbsKm=Math.max(c.maxAbsKm,delta);if([1,2,3,7].includes(+day))c.oldLeadDifferences+=delta!==0;}
    r.arms[arm]=a;
   }
  }
  plans.push({file,bytes,output:rows.map(JSON.stringify).join('\n')+'\n'});
 }
 if(fresh.size)throw Error('staged keys outside baseline');
 cells.push(c);
}
for(const {file,bytes,output}of plans){fs.writeFileSync(`${file}.before-resume5-U-${stamp}`,bytes);fs.writeFileSync(file,output);}
const result={provenance:analysisProvenance(),installedAt:new Date().toISOString(),toleranceKm:.001,inputs,cells};
fs.writeFileSync('results/five-day-ca/ussf-install.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(cells));
