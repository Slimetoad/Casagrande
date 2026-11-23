#!/usr/bin/env python3
"""Mixes the voiceover and the soundtrack and muxes them into the rendered film.

Inputs (all in build/): product-demo.mp4, timeline.json, narration/<scene>.wav, music.wav.
The music is ducked under the voice with a smooth sidechain envelope. Output:
build/product-demo-final.mp4 (video stream copied, AAC 256 kb/s stereo).
"""
import json, subprocess
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"
SR = 44100
MUSIC_BED = 0.065     # music level with no voice (about 10 dB under the voice)
MUSIC_UNDER = 0.035   # music level under the voice (about 15 dB under it)
VOICE = 1.0


def smooth(env, attack, release):
    out = np.empty_like(env)
    a, r = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    level = 0.0
    for i, x in enumerate(env):
        coef = a if x > level else r
        level = coef * level + (1 - coef) * x
        out[i] = level
    return out


def main():
    tl = json.loads((BUILD / "timeline.json").read_text())
    n = int((tl["total"] + 0.5) * SR)
    voice = np.zeros(n, np.float32)
    for scene in tl["scenes"]:
        wav = BUILD / "narration" / f"{scene['id']}.wav"
        if scene.get("narrationStart") is None or not wav.exists():
            continue
        audio, sr = sf.read(wav, dtype="float32")
        if sr != SR:
            audio = resample_poly(audio, SR, sr).astype(np.float32)
        i = int(scene["narrationStart"] * SR)
        j = min(n, i + len(audio))
        voice[i:j] += audio[: j - i]
    voice *= 0.9 / max(1e-6, np.abs(voice).max()) * VOICE

    music, msr = sf.read(BUILD / "music.wav", dtype="float32")
    assert msr == SR
    music = music[:n] if len(music) >= n else np.pad(music, ((0, n - len(music)), (0, 0)))
    # Sidechain: a decimated envelope keeps the loop cheap, then it is upsampled.
    step = 64
    active = (np.abs(voice[: n - n % step]).reshape(-1, step).max(1) > 0.02).astype(np.float32)
    active = np.repeat(smooth(active, 0.3 / step, 1.6 / step), step)
    active = np.pad(active, (0, n - len(active)), constant_values=active[-1] if len(active) else 0)
    gain = MUSIC_BED + (MUSIC_UNDER - MUSIC_BED) * np.clip(active, 0, 1)
    mix = music * gain[:, None] + voice[:, None]
    mix *= 0.93 / max(1e-6, np.abs(mix).max())
    out = BUILD / "soundtrack.wav"
    sf.write(out, mix, SR)
    final = BUILD / "product-demo-final.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(BUILD / "product-demo.mp4"), "-i", str(out),
                    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000",
                    "-c:a", "aac", "-b:a", "256k",
                    "-shortest", "-movflags", "+faststart", str(final)], check=True)
    print("wrote", final)


if __name__ == "__main__":
    main()
