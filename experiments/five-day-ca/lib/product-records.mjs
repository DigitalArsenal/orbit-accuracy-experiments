import fs from 'node:fs';
import {availableAt} from '../../ffm-covariance-adaptive/lib/model.mjs';
export function availability(files,t){
 const covers=(files??[]).filter(f=>f.startMs<=t&&f.stopMs>=t);
 if(!covers.length)return null;
 const values=covers.map(f=>{const family=/ESA0OPSFIN/.test(f.file)?'esa':/nsgf/i.test(f.file)?'nsgf':/ilrsa/i.test(f.file)?'ilrsa':null;return family?availableAt(family,f.stopMs):null;});
 return values.every(Number.isFinite)?Math.max(...values):null;
}
export function saveEndpoints(out,shard,row,entered,bins,files){
 const ends=entered.map(day=>{const l=bins[day].at(-1);return {day,...l,availableAt:availability(files,Date.parse(l.epoch))};});
 fs.appendFileSync(`${out}/endpoints-${shard}.jsonl`,JSON.stringify({key:row.key,group:row.group,norad:row.norad,name:row.name,cutoff:row.cutoff,fitAvailableAt:availability(files,Date.parse(row.cutoff)),ends})+'\n');
}
export function saveOmm(out,shard,key,arm,omm,pcf,extra){fs.appendFileSync(`${out}/omm-products-${shard}.jsonl`,JSON.stringify({key,arm,omm:Buffer.from(omm).toString('base64'),pcf:Buffer.from(pcf).toString('base64'),weather:extra?.rows?Buffer.from(extra.rows).toString('base64'):null})+'\n');}
