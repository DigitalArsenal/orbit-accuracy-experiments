// Positional observations in the IOD format (satobs.org/position/IODformat.html)
// as SeeSat-L messages carry them, and the observers' station coordinates
// stated in the same messages. Text parsing only: angles are converted to
// degrees and times to ISO UTC; no frame or epoch conversion happens here.

// One IOD line -> {norad, cospar, station, status, time (ISO UTC),
// timeSigmaSeconds, angleFormat, epochCode, a, b (degrees: RA/Dec or Az/El),
// sigmaDeg, behavior, raw} or null when the line is not IOD.
export function parseIod(line) {
  const m = /^(\d{5}) (\d\d) (\d{3})(.{3}) {1,2}(\d{4}) (.) (\d{8})(\d{2})(\d{2})(\d{2})(\d{0,3}) ?(\d\d)? (\d)(\d) ([ \d]{2}[ \d.]{5}[ \d]?)([+-][ \d.]{6}) ?(\d\d)? ?(.)?/.exec(line);
  if (!m) return null;
  const [, norad, yy, launch, piece, station, status, date, hh, mi, ss, frac, tu, format, epoch, aText, bText, pu, behavior] = m;
  const time = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${hh}:${mi}:${ss}.${(frac || '0').padEnd(3, '0')}Z`;
  const mx = (t) => (t && /^\d\d$/.test(t) ? Number(t[0]) * 10 ** (Number(t[1]) - 8) : null);
  const a = aText.replace(/ /g, '0'), b = bText.replace(/ /g, '0');
  const sign = b[0] === '-' ? -1 : 1, bd = b.slice(1);
  let ra, dec;
  switch (format) {
    case '1': ra = (Number(a.slice(0, 2)) + Number(a.slice(2, 4)) / 60 + Number(`${a.slice(4, 6)}.${a.slice(6, 7)}`) / 3600) * 15; dec = sign * (Number(bd.slice(0, 2)) + Number(bd.slice(2, 4)) / 60 + Number(bd.slice(4, 6)) / 3600); break;
    case '2': ra = (Number(a.slice(0, 2)) + Number(`${a.slice(2, 4)}.${a.slice(4, 7)}`) / 60) * 15; dec = sign * (Number(bd.slice(0, 2)) + Number(`${bd.slice(2, 4)}.${bd.slice(4, 6)}`) / 60); break;
    case '3': ra = (Number(a.slice(0, 2)) + Number(`${a.slice(2, 4)}.${a.slice(4, 7)}`) / 60) * 15; dec = sign * Number(`${bd.slice(0, 2)}.${bd.slice(2, 6)}`); break;
    case '7': ra = (Number(a.slice(0, 2)) + Number(a.slice(2, 4)) / 60 + Number(`${a.slice(4, 6)}.${a.slice(6, 7)}`) / 3600) * 15; dec = sign * Number(`${bd.slice(0, 2)}.${bd.slice(2, 6)}`); break;
    default: ra = null; dec = null;  // 4-6: azimuth/elevation, not read here
  }
  return {
    norad: Number(norad), cospar: `${Number(yy) < 57 ? 20 : 19}${yy}-${launch}${piece.trim()}`, station, status, time,
    timeSigmaSeconds: mx(tu), angleFormat: Number(format), epochCode: Number(epoch),
    raDeg: ra, decDeg: dec, sigmaDeg: mx(pu), behavior: behavior ?? null, raw: line.trimEnd(),
  };
}

// Station coordinates observers state in their messages, e.g.
// "Station number 9926 , 51.991546 N 4.198860 E , 13 m" or
// "Site 4171 (Leiden): 52.15412 N, 4.49081 E, 0 m". -> [{station, lat, lon, heightM, text}]
export function statedSites(text) {
  const out = [];
  const re = /(?:station|site|cospar)[^\d\n]{0,20}(\d{4})[^\n\d-]{0,40}?(-?\d{1,2}\.\d{3,})\s*°?\s*([NS])?[\s,;]+(-?\d{1,3}\.\d{3,})\s*°?\s*([EW])?[\s,;]+(-?\d{1,4}(?:\.\d+)?)\s*m\b/gi;
  for (const m of text.matchAll(re)) {
    const lat = Number(m[2]) * (m[3]?.toUpperCase() === 'S' ? -1 : 1), lon = Number(m[4]) * (m[5]?.toUpperCase() === 'W' ? -1 : 1);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    out.push({ station: m[1], latDeg: lat, lonDeg: lon, heightM: Number(m[6]), text: m[0] });
  }
  return out;
}

// A hypermail message page as text: the body between the message markers,
// tags removed and entities decoded.
export function messageText(html) {
  const body = /<!-- body="start" -->([\s\S]*?)<!-- body="end" -->/.exec(html)?.[1] ?? html;
  return body.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
