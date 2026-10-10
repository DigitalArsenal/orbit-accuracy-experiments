# E6 input data

What E6 reads, where it came from, under which terms, and what of it is
published here (`steps/95-publish-data.mjs` writes this directory and
[MANIFEST.json](MANIFEST.json)). Every capture is kept outside the
repository under `/opt/data/sdn-archive/hac/<source>/` with
`provenance.jsonl` (URL, retrieval time, SHA-256, bytes).

## SatNOGS Network (ISS observations)

Terms: "All observations results are public and all data are distributed
freely under the Creative Commons Attribution-ShareAlike license"
(network.satnogs.org/about). Credit: Libre Space Foundation and the
SatNOGS station owners named in each record.

| File | Contents |
| --- | --- |
| `satnogs-iss-waterfall-offsets.jsonl.gz` | One row per 5-second waterfall bin of every pass step 10 accepted: observation id and URL, station (id, name, latitude, longitude, altitude), transmitter, f0, segment, the signal's offset from the frequency the station tuned with its element set (Hz) and its uncertainty. CC BY-SA 4.0. |
| `satnogs-iss-observations.json.gz` | The observation metadata E6 captured (2026-08-31..10-09), as the API served it, without the element-set lines. CC BY-SA 4.0. |

Not published here: the range rates and `$RFO` records. Each depends on
the element set the station tuned with, which SatNOGS serves with every
observation and which comes from Space-Track (no Space-Track per-sample
data leaves the machine); step 10 rebuilds them from the API. The
waterfall images are a release asset (MANIFEST.json), CC BY-SA 4.0.

## ILRS normal points and station coordinates

Terms: ILRS data are free and open, with acknowledgement of the ILRS
(Pearlman, M.R. et al. 2019, J. Geodesy 93, 2181–2194) and its stations;
retrieved anonymously from EDC (DGFI-TUM). Not redistributed: MANIFEST.json
lists each file with its URL and SHA-256, which is enough to fetch the same
bytes.

## SeeSat-L (amateur optical)

Terms: a public mailing list (satobs.org/seesat); no license is stated and
the observations are each observer's. The parsed IOD lines and stated
station coordinates are prepared as a release asset but not published.

## ISS OEM (truth)

Terms: NASA public data; a U.S. Government work. The four provider-node
captures are already in [`data/e4/iss/`](../e4/iss/); the 2026-10-09 capture
is in `iss/` here.

## Not used

CAMRAS Dwingeloo IQ recordings (data.camras.nl/satnogs, CC BY 4.0): no
recording of an object with public truth in E6's windows.
