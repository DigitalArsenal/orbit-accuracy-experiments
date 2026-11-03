import fs from 'node:fs';
import crypto from 'node:crypto';
const dir = '/opt/data/sdn-archive/operator-theory/ap-gap/ap';
const files = fs.readdirSync(dir).filter(x=>/^rows-\d+\.jsonl$/.test(x));
const rows = files.flatMap(f=>fs.readFileSync(`${dir}/${f}`,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)));
const status = {status:'blocked', reason:'Held Galileo files decoded during MGEX metadata selection; no held objects fitted or scored.', methodsComplete:0, methodsRequired:5, repeatabilityMeasured:false, completedRows:rows.length, scoredHeldRows:rows.filter(r=>[43567,37847,41862,41174,43055,41175].includes(r.norad)).length, groups:Object.fromEntries(['GD','IG','GE','LS','DO','HX','HE','GN'].map(g=>[g,rows.filter(r=>r.group===g).length])), rowFiles:files.map(f=>({path:`${dir}/${f}`,sha256:crypto.createHash('sha256').update(fs.readFileSync(`${dir}/${f}`)).digest('hex')}))};
fs.writeFileSync(new URL('../../results/ap-gap/status.json',import.meta.url),JSON.stringify(status,null,2)+'\n');
console.log(JSON.stringify(status,null,2));
