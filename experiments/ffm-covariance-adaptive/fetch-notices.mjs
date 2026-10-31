// P2's fetch (PLAN.md section 5): the public notice archives, anonymously, one request per 5 s per host, up to the seal (config.exclusions.notices.sealFrom).
//   IAC  the daily bulletins /upload/monitoring/cus/<YYYY>/<MMDD>en.txt of 2025-09-01 .. the day before the seal: no later bulletin is requested.
//        The status messages /news/news_glonass/?PAGEN_1=N as a cross-check: listing rows only, later rows dropped by date before anything else is read.
//   GSC  /system-status/user-notifications-archived sorted by publication date, ascending from 2013; the walk stops at the first row published at or after
//        the seal, and a page holding such a row is not kept. The active page's earlier rows. The detail page of every row published from 2024-09-01, and of older
//        rows of C3's satellites with an open state.
// Files land under <store>/notices/ with provenance.jsonl (url, retrieved, sha256, bytes); a file present is not fetched again. Nothing is committed or republished.
//   node experiments/ffm-covariance-adaptive/fetch-notices.mjs [--only iac|gsc|news]    (stop: touch <store>/notices/stop)
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { config, store, sha256, args, registered, DAY } from './common.mjs';
import { parseGscList, parseGscDetail, parseIacNewsList, gscSvn, parseSinex } from './lib/notices.mjs';

registered();
const SEAL = config.exclusions.notices.sealFrom;
const FROM = '2025-09-01', DETAIL_FROM = '2024-09-01';
const UA = 'Mozilla/5.0 (research; orbit-accuracy-experiments; paced, one request at a time)';
const SPACING_MS = config.network.pacingSeconds * 1000;
const base = path.join(store, 'notices');
const prov = path.join(base, 'provenance.jsonl');
fs.mkdirSync(base, { recursive: true });
const lastAt = new Map();
const log = (r) => fs.appendFileSync(prov, `${JSON.stringify(r)}\n`);

async function get(url) {
  const host = new URL(url).host;
  for (let attempt = 1; ; attempt += 1) {
    if (fs.existsSync(path.join(base, 'stop'))) { console.error('stop file present'); process.exit(3); }
    const wait = (lastAt.get(host) ?? 0) + SPACING_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt.set(host, Date.now());
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(120e3), redirect: 'follow' });
      lastAt.set(host, Date.now());
      return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
    } catch (error) {
      if (attempt >= 4) throw error;
      console.error(`${url}: ${error.cause?.code ?? error.message}, attempt ${attempt}`);
      await sleep(15e3 * attempt);
    }
  }
}
const keep = (rel, bytes, url) => { const f = path.join(base, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${process.pid}.part`; fs.writeFileSync(t, bytes); fs.renameSync(t, f); log({ url, path: rel, retrieved: new Date().toISOString(), sha256: sha256(bytes), bytes: bytes.length }); };

if (!args.only || args.only === 'iac') {
  let got = 0, absent = 0, had = 0;
  const absentFile = path.join(base, 'iac-absent.json');
  const absentDays = new Set(fs.existsSync(absentFile) ? JSON.parse(fs.readFileSync(absentFile)) : []);
  for (let t = Date.parse(`${FROM}T00:00:00Z`); new Date(t).toISOString().slice(0, 10) < SEAL; t += DAY) {
    const d = new Date(t).toISOString().slice(0, 10), rel = `iac/${d.slice(0, 4)}/${d.slice(5, 7)}${d.slice(8, 10)}en.txt`;
    if (fs.existsSync(path.join(base, rel))) { had += 1; continue; }
    const url = `https://glonass-iac.ru/upload/monitoring/cus/${d.slice(0, 4)}/${d.slice(5, 7)}${d.slice(8, 10)}en.txt`;
    const r = await get(url);
    if (r.status === 200 && r.bytes.includes('GLONASS')) { keep(rel, r.bytes, url); got += 1; absentDays.delete(d); }
    else { absent += 1; absentDays.add(d); log({ url, path: rel, retrieved: new Date().toISOString(), absent: true, status: r.status }); }
    fs.writeFileSync(absentFile, JSON.stringify([...absentDays].sort()));
    if ((got + absent) % 25 === 0) console.error(`iac: ${got} fetched, ${absent} absent, at ${d}`);
  }
  console.log(JSON.stringify({ iac: { got, absent, had } }));
}

if (!args.only || args.only === 'news') {
  const rows = new Map();
  for (let n = 1; n < 60; n += 1) {
    const url = `https://glonass-iac.ru/news/news_glonass/?PAGEN_1=${n}`;
    const r = await get(url);
    if (r.status !== 200) throw new Error(`${url}: HTTP ${r.status}`);
    const p = parseIacNewsList(r.bytes.toString('utf8'), SEAL);
    for (const x of p.rows) if (x.date >= FROM) rows.set(x.id, x);
    if (!p.oldest || p.oldest < FROM) break; // the rest is older than the span
  }
  fs.writeFileSync(path.join(base, 'iac-news.json'), JSON.stringify([...rows.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), null, 0));
  console.log(JSON.stringify({ news: { rows: rows.size } }));
}

if (!args.only || args.only === 'gsc') {
  const SORT = 'https://www.gsc-europa.eu/system-status/user-notifications-archived?sort=asc&order=NAGU%20date%20of%20publication%20%28UTC%29';
  const rows = new Map();
  let pages = 0, sealedReached = false;
  for (let n = 0; n < 400; n += 1) {
    const rel = `gsc/list-${String(n).padStart(3, '0')}.html`, f = path.join(base, rel), url = `${SORT}${n ? `&page=${n}` : ''}`;
    let html;
    if (fs.existsSync(f)) html = fs.readFileSync(f, 'utf8');
    else { const r = await get(url); if (r.status !== 200) throw new Error(`${url}: HTTP ${r.status}`); html = r.bytes.toString('utf8'); }
    const p = parseGscList(html, SEAL);
    if (!p.dataRows) break;
    for (const x of p.rows) rows.set(x.number, { ...x, source: 'archived' });
    if (p.sealed) { sealedReached = true; log({ url, retrieved: new Date().toISOString(), note: 'holds a row at or after the seal: earlier rows taken, the page not kept' }); break; }
    if (!fs.existsSync(f)) keep(rel, Buffer.from(html), url);
    pages += 1;
  }
  { // the active page: its rows published before the seal
    const url = 'https://www.gsc-europa.eu/system-status/user-notifications';
    const r = await get(url);
    if (r.status !== 200) throw new Error(`${url}: HTTP ${r.status}`);
    for (const x of parseGscList(r.bytes.toString('utf8'), SEAL).rows) if (!rows.has(x.number)) rows.set(x.number, { ...x, source: 'active' });
    log({ url, retrieved: new Date().toISOString(), note: 'active page: earlier rows taken, the page not kept' });
  }
  const list = [...rows.values()].sort((a, b) => (a.published < b.published ? -1 : a.published > b.published ? 1 : 0));
  fs.writeFileSync(path.join(base, 'gsc-rows.json'), JSON.stringify(list));
  const sinex = parseSinex(fs.readFileSync('/opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx', 'utf8'));
  const P = config.population.judged, pop = new Set([...P.galileo.new, ...P.galileo.c2Six, ...config.population.reported.alsoReported.galileoEccentric]);
  const inPop = (x) => pop.has(sinex.noradOfSvn(gscSvn(x.satellite)));
  const open = (x) => /FURTHER NOTICE|UNAVAILABLE|UNUSABLE|DECOMMISSION|END OF/i.test(`${x.type} ${x.subject}`);
  const wanted = list.filter((x) => x.published.slice(0, 10) >= DETAIL_FROM || (inPop(x) && open(x)));
  let details = 0;
  for (const x of wanted) {
    const rel = `gsc/nagu-${x.number}.html`;
    if (fs.existsSync(path.join(base, rel))) continue;
    const url = `https://www.gsc-europa.eu/notice-advisory-to-galileo-users-nagu-${x.number}`;
    const r = await get(url);
    if (r.status !== 200 || !parseGscDetail(r.bytes.toString('utf8'))) { log({ url, path: rel, retrieved: new Date().toISOString(), absent: true, status: r.status }); continue; }
    keep(rel, r.bytes, url);
    details += 1;
    if (details % 25 === 0) console.error(`gsc: ${details} detail pages`);
  }
  console.log(JSON.stringify({ gsc: { pages, sealedReached, rows: list.length, detailsWanted: wanted.length, detailsFetched: details } }));
}
