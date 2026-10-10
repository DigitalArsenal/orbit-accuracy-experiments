#!/usr/bin/env python3
"""CSPICE copies (never refits) DE440s records covering calendar year 2024 TDB.

The procedure of space-data-network-modules
files/orbit-products/tests/fixtures/de440/extract_2026.py, for 2024: NAIF's
spksub_c copies only the records each original segment needs over the span.
Source: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp
(32,726,016 bytes, SHA-256 c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2),
SpiceyPy 8.0.0 (CSPICE N0067).

    python3 data/e10/extract_de440_2024.py <de440s.bsp> data/e10/de440-2024.bsp
"""
import hashlib
import json
import sys
from pathlib import Path

import spiceypy as spice

SOURCE_SHA256 = "c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2"
START_JD, END_JD = 2460310.5, 2460676.5  # 2024-01-01 and 2025-01-01, TDB


def main(source_path, out_path):
    source_path, out_path = Path(source_path), Path(out_path)
    with source_path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != SOURCE_SHA256:
            raise RuntimeError("DE440s SHA-256 mismatch")
    if out_path.exists():
        raise RuntimeError(f"refusing to replace {out_path}")
    source = spice.dafopr(str(source_path))
    target = spice.spkopn(str(out_path), "DE440 2024 COPY VIA NAIF SPKSUB", 0)
    first, last = (START_JD - 2451545.0) * 86400, (END_JD - 2451545.0) * 86400
    segments = []
    try:
        spice.dafbfs(source)
        while spice.daffna():
            descriptor = spice.dafgs(5)
            name = spice.dafgn()
            dc, ic = spice.dafus(descriptor, 2, 6)
            spice.spksub(source, descriptor, name, first, last, target)
            segments.append({"target": int(ic[0]), "center": int(ic[1]), "frame": int(ic[2]), "type": int(ic[3])})
    finally:
        spice.spkcls(target)
        spice.dafcls(source)
    with out_path.open("rb") as stream:
        sha = hashlib.file_digest(stream, "sha256").hexdigest()
    metadata = {"source_file": "de440s.bsp", "source_sha256": SOURCE_SHA256, "output": out_path.name, "sha256": sha,
                "size_bytes": out_path.stat().st_size, "epoch_scale": "TDB", "start_jd": START_JD, "end_jd": END_JD,
                "tool": spice.tkvrsn("TOOLKIT"), "spiceypy": spice.__version__,
                "procedure": "spksub_c copies only the records needed for each original segment; it does not refit or compute coefficients.",
                "source_url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440s.bsp", "segments": segments}
    out_path.with_suffix(".json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"PASS DE440 2024 excerpt {len(segments)} segments; {out_path.stat().st_size} bytes; SHA256 {sha}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
