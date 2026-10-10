# E6 input data

What E6 reads, where it came from, under which terms, and what of it is
published here (`steps/95-publish-data.mjs` writes this directory and
[MANIFEST.json](MANIFEST.json)). Every capture is kept outside the
repository under `/opt/data/sdn-archive/hac/<source>/` with
`provenance.jsonl` (URL, retrieval time, SHA-256, bytes).

## Licences and attribution

Each source's terms, quoted from its primary document, are in [docs/data-licenses.md](../../docs/data-licenses.md). Files are reproduced here or as release assets only where those terms allow it; results use every source, whatever its licence.

| Source | Licence or terms | Reproduced | Attribution |
| --- | --- | --- | --- |
| [SatNOGS Network observations and SatNOGS DB](../../docs/data-licenses.md#satnogs) | CC BY-SA 4.0 | Yes, with attribution, under the same licence (share-alike) | SatNOGS Network observations (Libre Space Foundation; the station and observer named in each record), https://network.satnogs.org/, CC BY-SA 4.0. |
| [NASA ISS trajectory (ISS.OEM_J2K_EPH.txt)](../../docs/data-licenses.md#nasa-iss-oem) | U.S. Government work, public domain (data.nasa.gov "us-pd") | Yes, with attribution | ISS trajectory: NASA JSC Flight Operations Directorate (TOPO), https://www.nasa.gov/spot-the-station/ (U.S. Government work). |
| [ILRS products via EDC (combined orbits ilrsa, normal points CRD v2, station SINEX, CPF predictions)](../../docs/data-licenses.md#ilrs) | ILRS: data and products not copyrighted; citation requested | Yes, with attribution | ILRS data and products (Pearlman et al. 2019, J Geod 93:2161–2180, doi:10.1007/s00190-019-01241-1), from the EUROLAS Data Center, DGFI-TUM (Noll et al. 2019, J Geod 93:2211–2225, doi:10.1007/s00190-018-1207-2). |
| [SeeSat-L amateur optical observations (IOD lines)](../../docs/data-licenses.md#seesat-l) | No licence stated | No: cited only | SeeSat-L, http://www.satobs.org/seesat/ (each post's author). |
| [CAMRAS Dwingeloo SatNOGS IQ recordings](../../docs/data-licenses.md#camras) | CC BY 4.0 | Yes, with attribution | CAMRAS Dwingeloo Radio Telescope, https://data.camras.nl/, CC BY 4.0. |
| [Space-Track.org GP element sets (gp_history) and SATCAT](../../docs/data-licenses.md#space-track) | Space-Track User Agreement (2019), with USSPACECOM's blanket approval to redistribute basic SSA data (TLE/OMM, SATCAT, decay and reentry) with citation | No: cited only | Source: USSPACECOM / 18th Space Defense Squadron, via Space-Track.org (https://www.space-track.org). |

**SatNOGS Network observations and SatNOGS DB.** The SatNOGS-derived files in data/e6 (satnogs-iss-waterfall-offsets.jsonl.gz, satnogs-iss-observations.json.gz) are licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/), not under this repository's MIT licence. They are adapted from SatNOGS Network observations: the offsets are measured from the waterfall images by experiments/e6-public-observations, and the metadata omit the element-set lines. Each row names its observation and URL; the observation page names the station and observer. The licence's disclaimer of warranties applies.

## SatNOGS Network (ISS observations)

Terms: "All observations results are public and all data are distributed
freely under the Creative Commons Atribution-Share Alike license"
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
889 waterfall images are `e6-satnogs-iss-waterfalls.tar` in release
`e6-inputs-20261010`, unmodified, CC BY-SA 4.0; the MANIFEST.json inside
credits each image's observation, ground station and observer, and the
list `e6-satnogs-iss-waterfalls.json` beside it is the one MANIFEST.json
here records.

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
