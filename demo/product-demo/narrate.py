#!/usr/bin/env python3
"""Synthesises the English voiceover with Kokoro (kokoro-onnx, voice af_heart).

Writes one WAV per scene to build/narration/<scene>.wav and their lengths to
build/narration.json. render.mjs reads those lengths so every scene is long enough
for its line; mix.py places the lines on the final timeline.

Setup (once):
  python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile huggingface_hub numpy scipy
"""
import json
from pathlib import Path
import numpy as np
import soundfile as sf
from huggingface_hub import hf_hub_download
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"
CACHE = BUILD / "kokoro"
REPO = "onnx-community/Kokoro-82M-v1.0-ONNX"


def ensure_model(voice):
    CACHE.mkdir(parents=True, exist_ok=True)
    model = hf_hub_download(REPO, "onnx/model.onnx", local_dir=CACHE)
    raw = hf_hub_download(REPO, f"voices/{voice}.bin", local_dir=CACHE)
    voices = CACHE / f"voices-{voice}.npz"
    if not voices.exists():
        np.savez(voices, **{voice: np.fromfile(raw, dtype=np.float32).reshape(510, 1, 256)})
    return model, voices


def main():
    spec = json.loads((HERE / "narration" / "lines.json").read_text(encoding="utf-8"))
    model, voices = ensure_model(spec["voice"])
    tts = Kokoro(str(model), str(voices))
    out = BUILD / "narration"
    out.mkdir(parents=True, exist_ok=True)
    lengths = {}
    for scene, text in spec["lines"].items():
        audio, sr = tts.create(text, voice=spec["voice"], speed=spec["speed"], lang=spec["lang"])
        sf.write(out / f"{scene}.wav", audio, sr)
        lengths[scene] = round(len(audio) / sr, 3)
        print(f"{scene:10s} {lengths[scene]:5.2f}s  {text[:70]}")
    (BUILD / "narration.json").write_text(json.dumps(lengths, indent=2))


if __name__ == "__main__":
    main()
