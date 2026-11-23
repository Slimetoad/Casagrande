#!/usr/bin/env python3
"""Narrates the product demo with Kokoro (kokoro-onnx), then muxes the track into the film.

Setup (once):
  python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile huggingface_hub numpy
Run:
  .venv/bin/python narrate.py            # build/product-demo-narrated.mp4

The model and voice files come from the onnx-community/Kokoro-82M-v1.0-ONNX repository
on Hugging Face and are cached under build/kokoro/. The video is not re-rendered: its
video stream is copied and only the audio track is added.
"""
import json, os, subprocess, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from huggingface_hub import hf_hub_download
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"
CACHE = BUILD / "kokoro"
REPO = "onnx-community/Kokoro-82M-v1.0-ONNX"
SR = 24000
VIDEO = BUILD / "product-demo.mp4"
OUT = BUILD / "product-demo-narrated.mp4"


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
    total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                  "-of", "csv=p=0", str(VIDEO)], capture_output=True, text=True, check=True).stdout) if VIDEO.exists() else None
    track = np.zeros(int(((total or 130) + 1) * SR), dtype=np.float32)
    problems = []
    tts_cache = {}
    for i, line in enumerate(spec["lines"]):
        audio, sr = tts.create(line["text"], voice=spec["voice"], speed=spec["speed"], lang=spec["lang"])
        assert sr == SR, sr
        audio = audio.astype(np.float32)
        tts_cache[line["text"]] = audio
        start = int(line["start"] * SR)
        end = start + len(audio)
        if end / SR > line["scene_end"] - 0.2:
            problems.append(f"line {i} runs to {end / SR:.2f}s, scene ends {line['scene_end']}s")
        track[start:end] += audio
        print(f"{line['start']:7.2f}s  {len(audio) / SR:5.2f}s  {line['text'][:60]}")
    ordered = sorted(spec["lines"], key=lambda l: l["start"])
    for a, b in zip(ordered, ordered[1:]):
        dur_a = len(tts_cache[a["text"]]) / SR
        if a["start"] + dur_a > b["start"]:
            problems.append(f"line at {a['start']}s overlaps the line at {b['start']}s")
    np.clip(track, -1.0, 1.0, out=track)
    wav = BUILD / "narration.wav"
    sf.write(wav, track, SR)
    if problems:
        print("WARNING: narration overruns its scene:\n  " + "\n  ".join(problems), file=sys.stderr)
    if VIDEO.exists():
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(VIDEO), "-i", str(wav),
            "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest", "-movflags", "+faststart", str(OUT)], check=True)
        print("wrote", OUT)


if __name__ == "__main__":
    main()
