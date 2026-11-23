#!/usr/bin/env python3
"""Prepares the film's background music from a downloaded, openly licensed track.

    python3 music.py path/to/track.mp3

Reads build/timeline.json (total length), decodes the track with ffmpeg, loops it if it is
shorter than the film or trims it if longer, fades it in and out, and writes build/music.wav
(44.1 kHz stereo). mix.py then ducks it under the narration. The track and its licence are
recorded in MUSIC_CREDITS.md, which must ship with the film if the licence requires attribution.
"""
import json
import subprocess
import sys
from pathlib import Path
import numpy as np
import soundfile as sf

SR = 44100
HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"
FADE_IN = 2.0
FADE_OUT = 4.0


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()


def fit(track, n):
    """Repeat the track end to end when it is shorter than the film; trim it when longer."""
    reps = -(-n // len(track))
    return np.tile(track, (reps, 1))[:n]


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: music.py <track.mp3|wav|ogg>")
    src = Path(sys.argv[1])
    tl = json.loads((BUILD / "timeline.json").read_text())
    n = int((tl["total"] + 0.5) * SR)
    track = decode(src)
    music = fit(track, n)
    t = np.arange(n) / SR
    fade = np.minimum(1.0, t / FADE_IN) * np.minimum(1.0, (n / SR - t) / FADE_OUT)
    music = music * np.clip(fade, 0, 1)[:, None].astype(np.float32)
    peak = np.abs(music).max()
    if peak > 0:
        music *= 0.9 / peak
    sf.write(BUILD / "music.wav", music, SR)
    print(f"wrote {BUILD / 'music.wav'} from {src.name} ({len(track) / SR:.1f}s source, {n / SR:.1f}s film)")


if __name__ == "__main__":
    main()
