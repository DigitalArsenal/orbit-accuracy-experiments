// C3-small's operator notices (PLAN.md section 1, exclusion 4; P2): parsing of the GSC NAGU pages and the IAC daily bulletins, the IGS SINEX mapping
// from slot, PRN or spacecraft number to NORAD, and each notice's stated interval. Text parsing only; dates are read before anything else, and a row
// at or after the seal is dropped before any other field of it is looked at.
import fs from 'node:fs';
import path from 'node:path';

const MSK_MS = 3 * 3600e3;
const msk = (d, hm) => { const [dd, mm, yy] = d.split('.'); return Date.parse(`20${yy}-${mm}-${dd}T${hm.slice(0, 2)}:${hm.slice(2, 4)}:00Z`) - MSK_MS; };
const stripTags = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** GSC listing rows: { number, satellite, start, published, type, subject } with published before `seal` (ISO date); `sealed` is true when a later row was on the page. */
export function parseGscList(html, seal) {
  const rows = [];
  let sealed = false, dataRows = 0;
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? []) {
    const c = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map(stripTags);
    if (c.length !== 6 || !/^\d{7}$/.test(c[0])) continue;
    dataRows += 1;
    if (c[3].slice(0, 10) >= seal) { sealed = true; continue; }
    rows.push({ number: c[0], satellite: c[1], start: c[2], published: c[3], type: c[4], subject: c[5] });
  }
  return { rows, sealed, dataRows };
}

/** A GSC NAGU page: its labeled fields. */
export function parseGscDetail(html) {
  const t = stripTags(html);
  const at = t.indexOf('DATE GENERATED (UTC)');
  if (at < 0) return null;
  const s = t.slice(at);
  const field = (name, next) => { const m = new RegExp(`${name}:\\s*(.*?)\\s*(?:${next}:|$)`).exec(s); return m ? m[1] : null; };
  return { generated: field('DATE GENERATED \\(UTC\\)', 'NAGU TYPE'), type: field('NAGU TYPE', 'NAGU NUMBER'), number: field('NAGU NUMBER', 'NAGU SUBJECT'), subject: field('NAGU SUBJECT', 'NAGU REFERENCED TO'), referencedTo: field('NAGU REFERENCED TO', 'START DATE EVENT'),
    start: field('START DATE EVENT \\(UTC\\)', 'END DATE EVENT'), end: field('END DATE EVENT \\(UTC\\)', 'SATELLITE AFFECTED'), satellite: field('SATELLITE AFFECTED', 'SPACE VEHICLE ID'), svid: field('SPACE VEHICLE ID', 'SIGNAL'), description: (s.match(/EVENT DESCRIPTION:\s*(.{0,600})/) ?? [])[1] ?? null };
}

/** One IAC daily bulletin: its status table, its advisory lines and its full NAGU texts. */
export function parseIacBulletin(text) {
  const t = text.replace(/\r/g, '');
  const status = [];
  for (const m of t.matchAll(/^\|\s*(\d{3})\s*\|\s*(\d+)\s*\|\s*(\d)\/(\d\d)\s*\|\s*(-?\d+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]*)\s*\|\s*([a-zA-Z ]+?)\s*\|\s*([\d.]*)\s*\|/gm)) status.push({ sc: m[1], cosmos: m[2], plane: Number(m[3]), slot: m[4], channel: Number(m[5]), launch: m[6], intro: m[7], status: m[8], outage: m[9] });
  const lines = [];
  for (const m of t.matchAll(/^(\d{3})-(\d{6})-(\d\d\.\d\d\.\d\d)-(\d{4})-(\S+?)-(FCST|ADVS|GNRL)-(.*)$/gm)) lines.push({ id: `${m[1]}-${m[2]}`, issuedUtc: new Date(msk(m[3], m[4])).toISOString(), place: m[5], kind: m[6], summary: m[7].trim() });
  const notices = {};
  for (const m of t.matchAll(/NOTICE ADVISORY TO GLONASS USERS \(NAGU\)\s*(\d{3}-\d{6})\s*\n([\s\S]*?)(?=\n\s*\n\s*\n|\n\d{3}-\d{6}\s*\n|$)/g)) notices[m[1]] = m[2].replace(/\s+/g, ' ').trim();
  return { status, lines, notices };
}

/** Listing rows of the IAC status messages: { id, date, text } with date before `seal`, the page's oldest date, and whether a later row was on it. */
export function parseIacNewsList(html, seal) {
  const rows = [];
  let sealed = false, oldest = null;
  for (const m of html.matchAll(/<div class="news-item-date">(\d\d)\.(\d\d)\.(\d{4})<\/div>\s*<div class="news-item-text">\s*<h3[^>]*>\s*<a href="\/news\/news_glonass\/(\d+)\/">/g)) {
    const date = `${m[3]}-${m[2]}-${m[1]}`;
    if (!oldest || date < oldest) oldest = date;
    if (date >= seal) { sealed = true; continue; }
    const end = html.indexOf('</a>', m.index + m[0].length);
    rows.push({ id: m[4], date, text: stripTags(html.slice(m.index + m[0].length, end)) });
  }
  return { rows, sealed, oldest };
}

/** The IGS SINEX: SVN to NORAD and block; PRN validity (a slot's PRN at a date to its SVN). */
export function parseSinex(text) {
  const block = (name) => { const m = new RegExp(`\\+${name}[^\\n]*\\n([\\s\\S]*?)-${name}`).exec(text); return (m ? m[1] : '').split('\n').filter((l) => l.trim() && !l.startsWith('*')); };
  const doy = (s) => { const [y, d, sec] = s.split(':').map(Number); return y === 0 ? Infinity : Date.UTC(y, 0, 1) + (d - 1) * 86400e3 + sec * 1000; };
  const identifier = new Map(), prn = [], plane = [];
  for (const l of block('SATELLITE/IDENTIFIER')) { const t = l.trim().split(/\s+/); identifier.set(t[0], { svn: t[0], cospar: t[1], norad: Number(t[2]), block: t[3] }); }
  for (const l of block('SATELLITE/PRN')) { const t = l.trim().split(/\s+/); prn.push({ svn: t[0], from: doy(t[1]), to: doy(t[2]), prn: t[3] }); }
  for (const l of block('SATELLITE/PLANE')) { const t = l.trim().split(/\s+/); plane.push({ svn: t[0], from: doy(t[1]), to: doy(t[2]), plane: t[3], slot: t[4] }); }
  return {
    identifier, prn, plane,
    noradOfSvn: (svn) => identifier.get(svn)?.norad ?? null,
    svnOfPrn: (p, t) => prn.find((x) => x.prn === p && t >= x.from && t < x.to)?.svn ?? null,
    svnOfNorad: (n) => [...identifier.values()].find((x) => x.norad === n)?.svn ?? null,
    planeOf: (svn, t) => plane.find((x) => x.svn === svn && t >= x.from && t < x.to)?.plane ?? null,
  };
}

const TIME = /(\d\d\.\d\d\.\d\d)[/ ](\d\d):?(\d\d)/g;
/**
 * An IAC line's stated interval: { from, to (null when open), rts } in ms UTC. The summary's times are MSK. Return to service: PUT INTO OPERATION. A stated range gives both ends;
 * FURTHER NOTICE, or a state change with one time (a put-into-diagnostics, an unusable), is open; a frequency or point change with no FURTHER NOTICE is instantaneous.
 */
export function iacInterval(line) {
  const times = [...line.summary.matchAll(TIME)].map((m) => msk(m[1], `${m[2]}${m[3]}`));
  const s = line.summary.toUpperCase();
  const rts = /PUT[ -]INTO[ -]OPERATION/.test(s) || /\bRESTORED\b/.test(s);
  const issued = Date.parse(line.issuedUtc);
  if (rts) return { from: times[0] ?? issued, to: times[0] ?? issued, rts: true };
  if (/FURTHER NOTICE/.test(s)) return { from: times[0] ?? issued, to: null, rts: false };
  if (times.length >= 2) return { from: times[0], to: times[1], rts: false };
  if (/FREQ-CHNG/.test(s)) return { from: times[0] ?? issued, to: times[0] ?? issued, rts: false };
  return { from: times[0] ?? issued, to: null, rts: false };
}
/** The spacecraft a line or its NAGU text names: an SVN like R744, else the slot's PRN at the issue time. */
export function iacSvn(line, text, sinex) {
  const m = /\((\d{3})\)/.exec(text ?? '') ?? /\bSC (\d{3})\b/.exec(text ?? '') ?? /\bКА (\d{3})\b/.exec(text ?? '');
  if (m) return `R${m[1]}`;
  const slot = /^(\d\d)\//.exec(line.place);
  return slot ? sinex.svnOfPrn(`R${slot[1]}`, Date.parse(line.issuedUtc)) : null;
}
/** A GSC row's satellite: GSAT0218 to E218. */
export const gscSvn = (name) => { const m = /^GSAT0?(\d{3})$/.exec(name ?? ''); return m ? `E${m[1]}` : null; };
/** Every satellite a GSC row names (a row may name several): GSAT0216, GSAT0221 AND GSAT0223 to E216, E221, E223. "ALL" names none. */
export const gscSvns = (name) => [...String(name ?? '').matchAll(/GSAT0?(\d{3})/g)].map((m) => `E${m[1]}`);
const utc = (s) => (s && /^\d{4}-\d\d-\d\d/.test(s) ? Date.parse(`${s.replace(' ', 'T').slice(0, 16)}:00Z`) : null);
/**
 * A GSC NAGU's stated interval. Return to service: its USABLE and AVAILABLE types (never UNAVAILABLE). The end comes from the page, else the subject's UNTIL date; UNTIL FURTHER NOTICE is open;
 * a notice that states no end (a launch, a recovered short outage, a general notice with END N/A) is instantaneous.
 */
export function gscInterval(row, detail) {
  const type = String(row.type ?? '').toUpperCase();
  const rts = /(^|\s)USABLE/.test(type) || /(^|\s)AVAILABLE/.test(type);
  const from = utc(detail?.start) ?? utc(row.start);
  const text = `${detail?.end ?? ''} ${row.subject ?? ''} ${type}`.toUpperCase();
  const open = /UNTIL FURTHER NOTICE/.test(text);
  const until = /UNTIL (\d{4}-\d\d-\d\d)/.exec(String(row.subject ?? '').toUpperCase());
  const to = rts ? from : open ? null : utc(detail?.end) ?? (until ? Date.parse(`${until[1]}T24:00:00Z`) : from);
  return { from, to, rts, published: utc(detail?.generated) ?? utc(row.published) };
}

/**
 * Every fetched notice of the two archives: { notices [{ source, id, svn, norad, kind, summary, issued, from, to, rts }], overlap(norad, fromMs, toMs, asOfMs), iacList, gscRows, bulletins, texts, details }.
 * Exclusion 4: a notice naming the satellite, except return to service, over its stated interval (open: to the next return to service), issued by asOfMs.
 */
export function loadNotices(base, sinex, seal, opened) {
  const read = (f, label) => (opened ? opened.read(f, label) : fs.readFileSync(f));
  const iacDir = path.join(base, 'iac');
  const bulletins = new Map(), lines = new Map(), texts = new Map();
  for (const y of fs.readdirSync(iacDir).sort()) for (const f of fs.readdirSync(path.join(iacDir, y)).sort()) {
    if (!f.endsWith('en.txt')) continue;
    const day = `${y}-${f.slice(0, 2)}-${f.slice(2, 4)}`;
    if (day >= seal) throw new Error(`a bulletin at or after the seal: ${f}`);
    const b = parseIacBulletin(read(path.join(iacDir, y, f), 'IAC bulletin').toString());
    bulletins.set(day, b);
    for (const l of b.lines) if (l.issuedUtc.slice(0, 10) < seal && !lines.has(l.id)) lines.set(l.id, l);
    for (const [id, t] of Object.entries(b.notices)) if (!texts.has(id)) texts.set(id, t);
  }
  const iacList = [...lines.values()].sort((a, b) => (a.issuedUtc < b.issuedUtc ? -1 : 1));
  const gscRows = JSON.parse(read(path.join(base, 'gsc-rows.json'), 'GSC rows'));
  for (const x of gscRows) if (x.published.slice(0, 10) >= seal) throw new Error(`a GSC row at or after the seal: ${x.number}`);
  const details = new Map();
  for (const x of gscRows) { const f = path.join(base, 'gsc', `nagu-${x.number}.html`); if (fs.existsSync(f)) details.set(x.number, parseGscDetail(read(f, 'GSC NAGU').toString())); }
  const notices = [];
  for (const l of iacList) { const text = texts.get(l.id), svn = iacSvn(l, text, sinex), iv = iacInterval(l); notices.push({ source: 'IAC', id: l.id, svn, norad: sinex.noradOfSvn(svn), kind: l.kind, summary: l.summary, issued: Date.parse(l.issuedUtc), ...iv }); }
  for (const x of gscRows) { const d = details.get(x.number), iv = gscInterval(x, d), svns = gscSvns(x.satellite); for (const svn of svns.length ? svns : [null]) notices.push({ source: 'GSC', id: x.number, svn, norad: svn ? sinex.noradOfSvn(svn) : null, kind: x.type, summary: x.subject, issued: iv.published, from: iv.from, to: iv.to, rts: iv.rts }); }
  const byNorad = new Map();
  for (const n of notices) if (n.norad) { if (!byNorad.has(n.norad)) byNorad.set(n.norad, []); byNorad.get(n.norad).push(n); }
  for (const v of byNorad.values()) v.sort((a, b) => a.from - b.from);
  // an open notice closes at the next return to service, or at the stated end of a later notice of the same event (same start or later): IAC's SC-SRV T-T after SC-SRV T-FURTHER NOTICE, GSC's EXTENSION
  const closeOf = (n, own) => { let c = Infinity; for (const r of own) { if (r === n || r.issued < n.issued) continue; if (r.rts && r.from > n.from) c = Math.min(c, r.from); else if (!r.rts && r.to != null && r.from >= n.from) c = Math.min(c, r.to); } return c; };
  const spans = (norad, asOf) => { const own = (byNorad.get(norad) ?? []).filter((n) => n.issued <= asOf); return own.filter((n) => !n.rts).map((n) => ({ ...n, closeMs: n.to ?? closeOf(n, own) })); };
  return { notices, iacList, gscRows, bulletins, texts, details, spans, overlap: (norad, fromMs, toMs, asOf) => spans(norad, asOf).filter((n) => n.from <= toMs && n.closeMs >= fromMs) };
}
