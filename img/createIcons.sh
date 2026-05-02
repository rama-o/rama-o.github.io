#!/usr/bin/env bash

# PNG output sizes
sizes=(256 128 64 48 32 24 16 180)

# SVG filenames without extension
files=("chip_copper")

for f in "${files[@]}"; do
  for s in "${sizes[@]}"; do
    echo "Generating ${f}_${s}x${s}.png"

      magick \
      -background none \
      "${f}.svg" \
      -resize "${s}x${s}" \
      -alpha on \
      "${f}_${s}x${s}.png"
  done
done
