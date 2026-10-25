// The windows of M24 on NASA's ISS archive (amendment A11): the planned burns of the header event tables (delta-v above zero), one window around each in two files (pre: the
// latest file with at least 24 h of states before the burn and 24 h after it, whose burn is still to come; for a burn planned at short notice, 6 h before and 12 h after; post: the first file made
// after the burn that still starts 12 h before it, 6 h for the short-notice ones), and the
// burn-free windows (the leading 72 h of every file whose header lists no burn in or within an hour of it). TIG and delta-v are the headers' planned values.
import fs from 'node:fs';
import path from 'node:path';
import { issArchiveFiles, parseIssOem } from './iss-oem.mjs';

const H = 3600e3;
export const WINDOW_H = 72;

/** The parsed headers of the archive (events only, no states): [{ date, header, events }] in date order. */
export function archiveHeaders() {
  return issArchiveFiles().map(({ date, file }) => {
    const p = parseIssOem(fs.readFileSync(file, 'utf8'));
    return { date, file, header: p.header, events: p.events, states: p.states.length, creationMs: Date.parse(`${p.header.creationUtc}Z`) };
  });
}

/** Distinct burns: events with delta-v above zero, clustered when their TIGs are within 12 h of the previous one. */
export function burnClusters(files) {
  const members = files.flatMap((f) => f.events.filter((e) => e.dvMS > 0).map((e) => ({ ...e, date: f.date })));
  members.sort((a, b) => a.tigMs - b.tigMs);
  const clusters = [];
  for (const m of members) {
    const last = clusters.at(-1);
    if (last && m.tigMs - last.members.at(-1).tigMs <= 12 * H) last.members.push(m); else clusters.push({ members: [m] });
  }
  return clusters.map((c, i) => ({ id: i + 1, ...c, medianTigMs: c.members.map((m) => m.tigMs).sort((a, b) => a - b)[Math.floor(c.members.length / 2)] }));
}

const clip = (tig, startMs, stopMs) => {
  let a = tig - (WINDOW_H / 2) * H;
  if (a < startMs) a = startMs;
  let b = a + WINDOW_H * H;
  if (b > stopMs) { b = stopMs; a = Math.max(startMs, b - WINDOW_H * H); }
  return [a, b];
};

/**
 * The windows. A burn window carries the member event of its file (name, TIG, delta-v, HA, HP as that file's header gives them).
 * pre: among the files that list a member of the cluster, the latest-created one with START <= TIG - 24 h and STOP >= TIG + 24 h (for a burn planned at short notice, when no file has that:
 * START <= TIG - 6 h and STOP >= TIG + 12 h, flagged short); post: the earliest-created file (listing a member, made at least an hour after that TIG) with START <= TIG - 12 h and STOP >= TIG + 24 h
 * (short-notice tier: START <= TIG - 3 h, STOP >= TIG + 12 h).
 */
export function issWindows(files = archiveHeaders()) {
  const clusters = burnClusters(files);
  const windows = [], notScored = [];
  for (const c of clusters) {
    const byFile = new Map();
    for (const m of c.members) byFile.set(m.date, m);
    const listing = files.filter((f) => byFile.has(f.date)).map((f) => ({ f, e: byFile.get(f.date) }));
    // margins [states before TIG, states after TIG]: the first tier, then, for the burns planned at short notice, a second tier (flagged short)
    const tiers = [[24, 24, false], [6, 12, true]];
    const pick = (test, order) => { for (const [before, after, short] of tiers) { const hit = listing.filter((x) => test(x, before * H, after * H)).sort(order)[0]; if (hit) return { ...hit, short }; } return null; };
    const pre = pick(({ f, e }, before, after) => f.header.startMs <= e.tigMs - before && f.header.stopMs >= e.tigMs + after, (a, b) => b.f.creationMs - a.f.creationMs);
    const post = pick(({ f, e }, before, after) => f.creationMs >= e.tigMs + H && f.header.startMs <= e.tigMs - before / 2 && f.header.stopMs >= e.tigMs + after, (a, b) => a.f.creationMs - b.f.creationMs);
    if (!pre && !post) notScored.push({ cluster: c.id, tigUtc: new Date(c.medianTigMs).toISOString(), reason: 'no file with 6 h of states before the burn and 12 h after', files: listing.map((x) => x.f.date) });
    for (const [kind, hit] of [['pre', pre], ['post', post]]) {
      if (!hit) continue;
      const [a, b] = clip(hit.e.tigMs, hit.f.header.startMs, hit.f.header.stopMs);
      const others = clusters.filter((o) => o.id !== c.id && o.medianTigMs >= a - H && o.medianTigMs <= b + H).map((o) => o.id);
      windows.push({ kind: `burn-${kind}`, cluster: c.id, date: hit.f.date, startMs: a, stopMs: b, tigMs: hit.e.tigMs, name: hit.e.name, dvMS: hit.e.dvMS, haKm: hit.e.haKm, hpKm: hit.e.hpKm, creationUtc: hit.f.header.creationUtc, otherBurns: others, short: hit.short });
    }
  }
  const burnTigs = clusters.flatMap((c) => c.members.map((m) => ({ date: m.date, tigMs: m.tigMs })));
  for (const f of files) {
    const a = f.header.startMs, b = a + WINDOW_H * H;
    if (f.states < 100 || b > f.header.stopMs) continue;
    const mine = burnTigs.filter((t) => t.date === f.date);
    if (mine.some((t) => t.tigMs >= a - H && t.tigMs <= b + H)) continue;
    windows.push({ kind: 'free', cluster: null, date: f.date, startMs: a, stopMs: b, creationUtc: f.header.creationUtc });
  }
  windows.sort((x, y) => x.startMs - y.startMs || x.kind.localeCompare(y.kind));
  return { clusters: clusters.map((c) => ({ id: c.id, tigUtc: new Date(c.medianTigMs).toISOString(), members: c.members.length, files: c.members.map((m) => m.date), names: [...new Set(c.members.map((m) => m.name))], dvMS: c.members.map((m) => m.dvMS) })), windows, notScored };
}

export const windowsFile = (dir) => path.join(dir, 'iss-windows.json');
