#!/usr/bin/env bash
set -euo pipefail

OUT="public/fixtures"
mkdir -p "$OUT"

# 5s 1280x720 moving test pattern (good for crop/fit testing)
ffmpeg -hide_banner -y \
  -f lavfi -i "testsrc=duration=5:size=1280x720:rate=30" \
  -pix_fmt yuv420p -c:v libx264 -crf 28 \
  "$OUT/testsrc_720p_5s.mp4"

# 5s SMPTE HD bars (good for verifying scaling/positioning)
ffmpeg -hide_banner -y \
  -f lavfi -i "smptehdbars=s=1280x720:r=30,format=yuv420p" \
  -c:v libx264 -crf 28 -t 5 \
  "$OUT/bars_720p_5s.mp4"

# 10s 440Hz tone (simple audio fixture)
ffmpeg -hide_banner -y \
  -f lavfi -i "sine=f=440:r=48000" -t 10 \
  "$OUT/tone_440hz_10s.wav"

echo "Fixtures written to $OUT/"
