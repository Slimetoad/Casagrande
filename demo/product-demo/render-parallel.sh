#!/usr/bin/env bash
# Renders the film in N parallel slices (Chromium's software compositor is single-threaded),
# then joins them without re-encoding. Usage: ./render-parallel.sh [workers]
set -euo pipefail
cd "$(dirname "$0")"
N=${1:-4}
TOTAL=$(node -e "const t=require('./build/timeline.json');console.log(Math.round(t.total*30))")
STEP=$(( (TOTAL + N - 1) / N ))
rm -f build/part-*.mp4 build/parts.txt
for i in $(seq 0 $((N - 1))); do
  A=$((i * STEP)); B=$((A + STEP - 1))
  node render.mjs --frames "$A-$B" --out "build/part-$i.mp4" > "build/render-$i.log" 2>&1 &
  echo "file 'part-$i.mp4'" >> build/parts.txt
done
wait
ffmpeg -y -loglevel error -f concat -safe 0 -i build/parts.txt -c copy -movflags +faststart build/product-demo.mp4
echo "wrote build/product-demo.mp4"
