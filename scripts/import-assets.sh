#!/usr/bin/env bash
# Imports the After the Waves Crash assets from a local checkout of the Unity project into src/assets/
# (see docs/after-the-waves-crash/m0-plan.md, deliverable 1). Usage: scripts/import-assets.sh <unity-checkout>
# Requires ffmpeg/ffprobe (native aac encoder), no network. Reruns overwrite the outputs in place.
# Written by Claude Code. The anchors and audio timings it prints are mirrored by hand in src/assets/manifest.ts.
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <path to after-the-waves-crash checkout>" >&2
  exit 1
fi

SRC="$1/Assets"
ROOT="$(dirname "$0")/.."
OUT="$ROOT/src/assets"
RATE=44100
GUARD=4410 # 0.1 s at 44.1 kHz, at the start of every audio file (and at the end of loops)
PRIMING_TOLERANCE=1024 # one AAC frame: the decoder may keep the encoder's end padding
MIN_SNR=15 # dB, decoded .m4a against its input PCM at lag 0
MIN_SEAM_SNR=20 # dB, loops only: the band around loopStart against the band around loopEnd

[ -d "$SRC/Graphics/SpritesFinal" ] || { echo "not a Unity checkout: $1" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- Sprites ---------------------------------------------------------------------------------------------------
# Byte-identical copies. Dropped: Graphics/icon.png (unused).
ACTORS=(boat boat_flipped eye_large eye_small monster_a monster_b)
STAGE=(background_pillars background_tentacles bubble clouds flash raindrop sea_b sea_f sea_m
  thunder_0 thunder_1 thunder_2 thunder_3 thunder_4 vignette)
UI=(arrow_down arrow_left arrow_right arrow_up cursor_empty cursor_past cursor_selected text_box title)

# Unity SpriteAlignment presets (pivot in Unity space, y measured from the bottom); 9 = Custom uses spritePivot.
preset_pivot() {
  case "$1" in
    0) echo "0.5 0.5" ;; 1) echo "0 1" ;; 2) echo "0.5 1" ;; 3) echo "1 1" ;; 4) echo "0 0.5" ;;
    5) echo "1 0.5" ;; 6) echo "0 0" ;; 7) echo "0.5 0" ;; 8) echo "1 0" ;;
    *) echo "unknown alignment $1" >&2; return 1 ;;
  esac
}

# Prints "<file> <alignment> <anchor x> <anchor y>"; Pixi anchors are y-down, so anchor y = 1 - Unity pivot y.
sprite_anchor() { # $1 = .meta file
  local mode align pivot px py
  mode="$(awk '$1 == "spriteMode:" { print $2 }' "$1")"
  align="$(awk '$1 == "alignment:" { print $2; exit }' "$1")"
  pivot="$(sed -n 's/^ *spritePivot: {x: \([-0-9.e]*\), y: \([-0-9.e]*\)}.*/\1 \2/p' "$1")"
  [ "$mode" = "1" ] || { echo "$1: spriteMode '$mode' is not 1 (Single)" >&2; return 1; }
  [ -n "$align" ] || { echo "$1: no alignment field" >&2; return 1; }
  [ -n "$pivot" ] || { echo "$1: no spritePivot field" >&2; return 1; }
  read -r px py <<< "$pivot"
  if [ "$align" != "9" ]; then
    local preset
    preset="$(preset_pivot "$align")"
    if ! awk -v a="$preset" -v b="$px $py" 'BEGIN { split(a, p); split(b, q); exit !(p[1] == q[1] && p[2] == q[2]) }'
    then
      echo "$1: stored spritePivot ($px, $py) differs from alignment $align, using the preset" >&2
    fi
    read -r px py <<< "$preset"
  fi
  awk -v f="$(basename "$1" .meta)" -v al="$align" -v x="$px" -v y="$py" \
    'BEGIN { printf "%-26s alignment %s  anchor (%g, %g)\n", f, al, x, 1 - y }'
}

copy_sprites() { # $1 = Unity folder, $2 = output folder, $3... = names
  local from="$1" to="$2"
  shift 2
  mkdir -p "$OUT/sprites/$to"
  for name in "$@"; do
    cp "$SRC/Graphics/SpritesFinal/$from/$name.png" "$OUT/sprites/$to/$name.png"
    sprite_anchor "$SRC/Graphics/SpritesFinal/$from/$name.png.meta"
  done
}

echo "Sprites:"
copy_sprites Actors actors "${ACTORS[@]}"
copy_sprites Stage stage "${STAGE[@]}"
copy_sprites UI ui "${UI[@]}"

# --- Audio -----------------------------------------------------------------------------------------------------
# All work is on raw mono f32le PCM, cut by exact byte counts (4 bytes per sample), then encoded once to AAC.
# Loops:     [last GUARD samples | loop | first GUARD samples]  -> loop region [GUARD, GUARD + length]
# One-shots: [GUARD samples of silence | clip]                   -> clip starts at GUARD
# The shared start offset keeps every clip in phase however a decoder trims the AAC priming.

samples_of() { # $1 = file; exact sample count of the first audio stream
  ffprobe -v error -select_streams a:0 -show_entries stream=duration_ts -of csv=p=0 "$1"
}

# Checks the decoded .m4a: length within one AAC frame of the input, SNR against the input PCM at lag 0
# (a misaligned decode would score near 0 dB), and for loops the seam: the GUARD band around loopStart must match
# the one around loopEnd. Fails below MIN_SNR / MIN_SEAM_SNR.
# $1 = .m4a, $2 = encoded input PCM, $3 = loop length in samples (0 for one-shots).
verify() {
  local expected decoded
  expected=$(( $(stat -c %s "$2") / 4 ))
  ffmpeg -hide_banner -loglevel error -y -i "$1" -f f32le -ac 1 "$TMP/check.raw"
  decoded=$(( $(stat -c %s "$TMP/check.raw") / 4 ))
  if [ "$decoded" -lt "$expected" ] || [ "$decoded" -ge $(( expected + PRIMING_TOLERANCE )) ]; then
    echo "$1: decoded $decoded samples, expected $expected (+ < $PRIMING_TOLERANCE)" >&2
    return 1
  fi
  paste <(od -An -v -t f4 -w4 "$2") <(od -An -v -t f4 -w4 "$TMP/check.raw") | awk -F '\t' \
    -v name="$(basename "$1")" -v expected="$expected" -v decoded="$decoded" -v guard="$GUARD" -v len="$3" \
    -v min_snr="$MIN_SNR" -v min_seam="$MIN_SEAM_SNR" '
    $1 ~ /[0-9]/ { n++; s[n] = $2; sig += $1 * $1; err += ($1 - $2) ^ 2 }
    END {
      snr = 10 * log(sig / err) / log(10)
      line = sprintf("%-22s samples %d (decoded %d, +%d)  SNR %.1f dB", name, expected, decoded,
        decoded - expected, snr)
      if (len > 0) {
        # sample index i (0-based) is s[i + 1]; compare [loopStart - GUARD/2, loopStart + GUARD/2) with loopEnd
        h = int(guard / 2)
        for (i = -h; i < h; i++) {
          a = s[guard + i + 1]; b = s[guard + len + i + 1]
          d = a - b; if (d < 0) { d = -d }; if (d > max) { max = d }
          dif += (a - b) ^ 2; ref += a * a
        }
        seam = 10 * log(ref / dif) / log(10)
        line = line sprintf("  seam s[%d]=%.4f s[%d]=%.4f  max|diff| %.4f  seam SNR %.1f dB", guard, s[guard + 1],
          guard + len, s[guard + len + 1], max, seam)
      }
      print line
      if (snr < min_snr) {
        printf "%s: SNR %.1f dB is below %d dB (bad encode or misaligned decode)\n", name, snr, min_snr > "/dev/stderr"
        exit 1
      }
      if (len > 0 && seam < min_seam) {
        printf "%s: loop seam SNR %.1f dB is below %d dB (loop region does not wrap)\n", name, seam, min_seam \
          > "/dev/stderr"
        exit 1
      }
    }'
}

encode() { # $1 = input raw PCM, $2 = bitrate, $3 = output .m4a; bit-exact and metadata-free for stable reruns
  ffmpeg -hide_banner -loglevel error -y -f f32le -ar "$RATE" -ac 1 -i "$1" -map_metadata -1 \
    -c:a aac -b:a "$2" -fflags +bitexact -flags:a +bitexact "$3"
}

# $1 = source .ogg (relative to Sounds/Pixitracker), $2 = output folder, $3 = output name, $4 = bitrate,
# $5 = "loop" or "once"
import_audio() {
  local in="$SRC/Sounds/Pixitracker/$1" len rate pcm="$TMP/$3"
  rate="$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of csv=p=0 "$in")"
  [ "$rate" = "$RATE" ] || { echo "$in: sample rate $rate, expected $RATE" >&2; return 1; }
  len="$(samples_of "$in")"
  ffmpeg -hide_banner -loglevel error -y -i "$in" -f f32le -ac 1 "$pcm.src.raw"
  [ $(( $(stat -c %s "$pcm.src.raw") / 4 )) -eq "$len" ] || { echo "$in: decoded length != $len" >&2; return 1; }
  if [ "$5" = "loop" ]; then
    { tail -c $(( GUARD * 4 )) "$pcm.src.raw"; cat "$pcm.src.raw"; head -c $(( GUARD * 4 )) "$pcm.src.raw"; } \
      > "$pcm.raw"
  else
    { head -c $(( GUARD * 4 )) /dev/zero; cat "$pcm.src.raw"; } > "$pcm.raw"
  fi
  mkdir -p "$OUT/audio/$2"
  encode "$pcm.raw" "$4" "$OUT/audio/$2/$3.m4a"
  awk -v n="$3" -v l="$len" -v g="$GUARD" -v r="$RATE" -v m="$5" 'BEGIN {
    printf "%-16s %-4s offset %.1f  duration %.6f", n, m, g / r, l / r
    if (m == "loop") { printf "  loopStart %.1f  loopEnd %.6f", g / r, (g + l) / r }
    printf "\n" }'
  verify "$OUT/audio/$2/$3.m4a" "$pcm.raw" "$([ "$5" = "loop" ] && echo "$len" || echo 0)"
}

echo "Audio:"
import_audio BGM/BGM01.ogg music bgm01 96k loop
import_audio BGM/BGM02.ogg music bgm02 96k once
import_audio Overlay/OverlayPhase02.ogg music overlay_phase02 96k loop
import_audio Overlay/OverlayPhase03.ogg music overlay_phase03 96k loop
import_audio Overlay/OverlayPhase04.ogg music overlay_phase04 96k once # restarted on every 9.6 s bar, not looped
import_audio SFX/thunderclap.ogg sfx thunderclap 64k once
import_audio SFX/kraken.ogg sfx kraken 64k once
# SFX/noise.ogg is unused and dropped. creak_loop / haul_tick in audio/sfx come from make-sfx.sh, left untouched.

# --- Font ------------------------------------------------------------------------------------------------------
FONT="$SRC/Font/JosefinSlab-Regular.ttf"
mkdir -p "$OUT/fonts"
cp "$FONT" "$OUT/fonts/JosefinSlab-Regular.ttf"

# The Unity project ships no license text for Josefin Slab. public/fonts/OFL.txt is built from the font's own
# copyright notice (name ID 13) and the SIL OFL 1.1 text bundled with TextMesh Pro's Anton example font (its own
# two-line copyright header dropped). Served unhashed at /fonts/OFL.txt.
OFL_SRC="$SRC/TextMesh Pro/Examples & Extras/Fonts/Anton OFL.txt"
COPYRIGHT="$(strings -e b "$FONT" | grep -o -m 1 'Copyright (c) [0-9]*, [^,]*, with Reserved Font Name [^.]*\.')" || {
  echo "$FONT: no 'Copyright (c) <year>, <author>, with Reserved Font Name <name>.' notice found" >&2
  exit 1
}
sed -n 3p "$OFL_SRC" | grep -q '^This Font Software is licensed under the SIL Open Font License, Version 1.1' || {
  echo "$OFL_SRC: line 3 is not the OFL 1.1 notice; check the header before copying" >&2
  exit 1
}
mkdir -p "$ROOT/public/fonts"
{ echo "$COPYRIGHT"; tail -n +3 "$OFL_SRC"; } > "$ROOT/public/fonts/OFL.txt"

echo "Outputs:"
du -sh "$OUT/sprites" "$OUT/audio/music" "$OUT/audio/sfx" "$OUT/fonts" "$ROOT/public/fonts/OFL.txt"
