#!/usr/bin/env bash
# Generates the new chiptune SFX for the After the Waves Crash port (see docs/after-the-waves-crash/03-new-mechanics.md).
# Requires ffmpeg (native aac encoder). Outputs an OGG master and a mono AAC .m4a per sound.
# Written by Claude Code; synthetic placeholders meant to sit next to the original Pixitracker audio, tune by ear.
set -euo pipefail

OUT="$(dirname "$0")/../src/assets/audio/sfx"
mkdir -p "$OUT"
RATE=44100

encode() { # $1 = name, $2 = input wav
  ffmpeg -hide_banner -loglevel error -y -i "$2" -c:a libvorbis -q:a 4 "$OUT/$1.ogg"
  ffmpeg -hide_banner -loglevel error -y -i "$2" -c:a aac -b:a 64k "$OUT/$1.m4a"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# creak_loop: Brace the Helm hold loop. Loop period 1.6 s; every oscillator completes whole cycles in 1.6 s.
# Rendered 3 periods long, low-passed, then cut to [1.5 s, 3.3 s]: a 0.1 s guard band on each side of the
# exact 1.6 s loop region (play loopStart = 0.1, loopEnd = 1.7), as recommended in 04-implementation-difficulty.md.
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "aevalsrc='0.22*pow(0.55+0.45*sin(2*PI*1.25*t-PI/2),2)*sgn(sin(2*PI*75*t+12*sin(2*PI*1.25*t)))':s=$RATE:d=4.8" \
  -af "lowpass=f=900,atrim=start=1.5:end=3.3,asetpts=PTS-STARTPTS" -ac 1 "$TMP/creak.wav"
encode creak_loop "$TMP/creak.wav"

# haul_tick: Haul the Line knot tick (also usable, pitched via playbackRate, as Chart's per-notch tick).
# 70 ms square blip sweeping ~660 -> ~506 Hz with a fast exponential decay and a 2 ms attack.
ffmpeg -hide_banner -loglevel error -y -f lavfi \
  -i "aevalsrc='0.3*min(1,t/0.002)*exp(-45*t)*sgn(sin(2*PI*(660*t-1100*t*t)))':s=$RATE:d=0.07" \
  -af "lowpass=f=4000" -ac 1 "$TMP/tick.wav"
encode haul_tick "$TMP/tick.wav"

ls -l "$OUT"
