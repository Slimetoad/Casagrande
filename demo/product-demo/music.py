#!/usr/bin/env python3
"""Procedural soundtrack for the product film, scored to the edit.

Reads build/timeline.json (written by render.mjs: total length and scene list) and writes
build/music.wav: warm pads, plucked arpeggios, sub bass and soft drums at 108 BPM in A major,
with risers into section changes and an impact on every "drop" scene. Everything is
synthesised with numpy/scipy, so there are no samples or licences to track.
"""
import json
from pathlib import Path
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
BPM = 108
BEAT = 60 / BPM
BAR = 4 * BEAT
HERE = Path(__file__).resolve().parent
BUILD = HERE / "build"
rng = np.random.default_rng(7)

def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)

# I-V-vi-IV in A major, two bars per chord: A, E/G#, F#m, D
CHORDS = [[57, 61, 64, 69], [56, 59, 64, 68], [54, 57, 61, 66], [50, 57, 62, 66]]
ROOTS = [45, 40, 42, 38]

def lp(x, f, order=2):
    return sosfilt(butter(order, f, 'low', fs=SR, output='sos'), x, axis=0)

def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x, axis=0)

def env(n, a, r, sustain=1.0):
    e = np.full(n, sustain, dtype=np.float32)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, sustain, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e

def saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return (2 * ((f * t + phase) % 1.0) - 1).astype(np.float32)

def place(buf, sig, t):
    i = int(t * SR)
    if i >= len(buf): return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]

def reverb_ir(seconds=2.4):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)).astype(np.float32) * np.exp(-t / (seconds / 6.5))[:, None]
    return lp(ir, 5000) * 0.18

def stereo(m, width=0.0):
    return np.stack([m * (1 - width), m * (1 + width)], axis=1)

def build(total, scenes):
    n = int((total + 3) * SR)
    pad, arp, bass, drums, fx = (np.zeros((n, 2), np.float32) for _ in range(5))
    kick_times = []

    # Intensity per moment: 0 intro/outro, 1 groove, 2 full. Driven by scene types.
    level_of = {'hook': 0, 'title': 1, 'call': 1, 'closing': 0}
    def level_at(t):
        for s in scenes:
            if s['start'] <= t < s['end']:
                return level_of.get(s['type'], 2)
        return 0

    bars = int(total / BAR) + 2
    for b in range(bars):
        t0 = b * BAR
        ci = (b // 2) % 4
        lvl = level_at(t0 + 0.01)
        # Pads: every two bars, three detuned saws per note, slow filter
        if b % 2 == 0:
            length = 2 * BAR + 1.6
            m = int(length * SR)
            left = np.zeros(m, np.float32); right = np.zeros(m, np.float32)
            for note in CHORDS[ci]:
                f = hz(note)
                for d, side in ((-0.06, 0), (0.0, 2), (0.07, 1)):
                    s = saw(f * 2 ** (d / 12), m, rng.random())
                    if side in (0, 2): left += s
                    if side in (1, 2): right += s
            sig = np.stack([left, right], 1) * 0.035
            cutoff = 900 + 900 * min(lvl, 2)
            sig = lp(sig, cutoff) * env(m, 0.9, 1.6)[:, None]
            place(pad, sig, t0)
        # Arpeggio: 16ths over chord tones, enters from level 1
        if lvl >= 1:
            tones = CHORDS[ci] + [x + 12 for x in CHORDS[ci]]
            pattern = [0, 2, 4, 6, 3, 5, 7, 5, 1, 3, 5, 7, 4, 6, 2, 4]
            for k in range(16):
                f = hz(tones[pattern[k]] + 12)
                m = int(0.45 * SR); t = np.arange(m) / SR
                s = (np.sin(2*np.pi*f*t) + 0.35*np.sin(4*np.pi*f*t) + 0.12*np.sin(6*np.pi*f*t)) * np.exp(-t * 9)
                pan = 0.25 if k % 2 else -0.25
                place(arp, stereo(s.astype(np.float32) * (0.05 if lvl == 1 else 0.065), pan), t0 + k * BEAT / 4)
        # Sub bass on 8ths
        if lvl >= 1:
            f = hz(ROOTS[ci])
            for k in range(8):
                m = int(BEAT / 2 * SR * 0.95); t = np.arange(m) / SR
                s = np.tanh(1.6 * np.sin(2*np.pi*f*t)) * env(m, 0.005, 0.08) * 0.16
                place(bass, stereo(s.astype(np.float32)), t0 + k * BEAT / 2)
        # Drums at full level: kick 4/4, clap 2 & 4, hats on 8ths
        if lvl >= 2:
            for k in range(4):
                tk = t0 + k * BEAT
                m = int(0.42 * SR); t = np.arange(m) / SR
                f = 48 + 110 * np.exp(-t * 28)
                kick = np.sin(2*np.pi*np.cumsum(f)/SR) * np.exp(-t * 7.5) * 0.42
                place(drums, stereo(kick.astype(np.float32)), tk); kick_times.append(tk)
                if k in (1, 3):
                    m2 = int(0.25 * SR); t2 = np.arange(m2) / SR
                    clap = hp(lp(rng.standard_normal(m2).astype(np.float32), 3500), 900) * np.exp(-t2 * 22) * 0.22
                    place(drums, stereo(clap, 0.1), tk)
            for k in range(8):
                m = int(0.06 * SR); t = np.arange(m) / SR
                hat = hp(rng.standard_normal(m).astype(np.float32), 7000) * np.exp(-t * 70) * (0.07 if k % 2 else 0.04)
                place(drums, stereo(hat, 0.3 if k % 2 else -0.3), t0 + k * BEAT / 2)
        elif lvl == 1:
            for k in range(8):  # soft shaker only
                m = int(0.05 * SR); t = np.arange(m) / SR
                hat = hp(rng.standard_normal(m).astype(np.float32), 8000) * np.exp(-t * 80) * 0.03
                place(drums, stereo(hat, 0.3 if k % 2 else -0.3), t0 + k * BEAT / 2)

    # Sidechain pump from the kicks
    duck = np.ones(n, np.float32)
    for tk in kick_times:
        i = int(tk * SR); m = int(0.3 * SR)
        j = min(n, i + m)
        duck[i:j] = np.minimum(duck[i:j], 1 - 0.28 * np.exp(-np.arange(j - i) / SR / 0.09))
    pad *= duck[:, None]; bass *= duck[:, None]

    # Risers into and impacts on each scene change (skip very short gaps)
    for s in scenes[1:]:
        c = s['start']
        m = int(1.6 * SR); t = np.arange(m) / SR
        noise = rng.standard_normal(m).astype(np.float32)
        riser = hp(noise, 1500) * (t / t[-1]) ** 2.2 * 0.05
        place(fx, stereo(riser, 0.2), max(0, c - 1.6))
        if s['type'] in ('section', 'title', 'flywheel', 'closing'):
            m = int(2.5 * SR); t = np.arange(m) / SR
            boom = np.sin(2*np.pi*np.cumsum(40 + 60*np.exp(-t*12))/SR) * np.exp(-t * 2.2) * 0.45
            crash = hp(rng.standard_normal(m).astype(np.float32), 4000) * np.exp(-t * 2.6) * 0.06
            place(fx, stereo((boom + crash).astype(np.float32), 0.15), c)

    wet = np.zeros_like(pad)
    ir = reverb_ir()
    for src, amt in ((pad, 0.6), (arp, 0.9), (fx, 0.7), (drums, 0.15)):
        for ch in range(2):
            wet[:, ch] += fftconvolve(src[:, ch], ir[:, ch])[:n] * amt
    mix = pad + arp + bass + drums + fx + wet
    mix = hp(mix, 32)
    fade = env(n, 1.5, 4.0)
    end = int((total + 0.5) * SR)
    mix = mix[:end] * fade[:end, None]
    mix = np.tanh(mix * 1.3) / np.tanh(1.3)
    mix *= 0.89 / max(1e-6, np.abs(mix).max())
    return mix.astype(np.float32)

def main():
    import soundfile as sf
    tl = json.loads((BUILD / "timeline.json").read_text())
    sf.write(BUILD / "music.wav", build(tl['total'], tl['scenes']), SR)
    print("wrote", BUILD / "music.wav")

if __name__ == "__main__":
    main()
