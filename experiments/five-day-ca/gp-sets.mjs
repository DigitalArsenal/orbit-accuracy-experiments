// Local public SGP4 records only; selected records remain in the private archive.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {config,registration,hash} from './guard.mjs';
import {readRows} from './statistics.mjs';
registration();
const rows=['regimes','truth2','truth'].flatMap(l=>readRows(`${config.store}/cheap/${l}`)),want=new Set(rows.map(r=>+r.norad)),days=new Set(),D=86400000;
for(const r of rows)for(let k=0;k<=7;k++)days.add(new Date(Date.parse(r.cutoff)-k*D).toISOString().slice(0,10));
const out=`${config.store}/gp-sets`;fs.mkdirSync(out,{recursive:true});
const fields=['MEAN_MOTION','ECCENTRICITY','INCLINATION','RA_OF_ASC_NODE','ARG_OF_PERICENTER','MEAN_ANOMALY','BSTAR','MEAN_MOTION_DOT','MEAN_MOTION_DDOT'];
for(const d of [...days].sort()){const dest=`${out}/${d}.json`;if(fs.existsSync(dest))continue;const file=`/opt/data/sdn-archive/spacetrack/gp_history/by-creation/${d.slice(0,4)}/${d}.json.gz`;if(!fs.existsSync(file)){fs.writeFileSync(dest,JSON.stringify({file,missing:true,sets:[]}));continue;}const raw=fs.readFileSync(file),sets=[];
 for(const g of JSON.parse(zlib.gunzipSync(raw))){const norad=+g.NORAD_CAT_ID;if(!want.has(norad)||g.MEAN_ELEMENT_THEORY!=='SGP4'||String(g.EPHEMERIS_TYPE)!=='0')continue;sets.push({norad,epoch:g.EPOCH,creationDate:g.CREATION_DATE,gpId:String(g.GP_ID),objectName:g.OBJECT_NAME??'',objectId:g.OBJECT_ID??'',elements:Object.fromEntries(fields.map(f=>[f,+g[f]]))});}
 fs.writeFileSync(dest,JSON.stringify({file,sha256:hash(raw),sets}));
}
console.log(JSON.stringify({days:days.size,objects:want.size}));
