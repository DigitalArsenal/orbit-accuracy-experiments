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
/** The fitted $OCM of an arm, base64: the record carries the weather rows it flies on, so the flight needs no other message. */
export function saveOcm(out,shard,key,arm,ocm){fs.appendFileSync(`${out}/ocm-products-${shard}.jsonl`,JSON.stringify({key,arm,ocm:Buffer.from(ocm).toString('base64')})+'\n');}
