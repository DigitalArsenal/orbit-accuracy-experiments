#!/bin/zsh
# One Amendment 12 case: label|n|e|i -> one JSON line appended to estar-rows/<label>-<e>.json
IFS='|' read -r name n e i <<< "$1"
/Users/tj/software/terrain-work/body-look/ripple/native/estar "$name" "$n" "$e" "$i" 40 30 10 23051.000694 > "/Users/tj/software/terrain-work/body-look/ripple/native/estar-rows/${name}-${e}.json" 2>/dev/null
