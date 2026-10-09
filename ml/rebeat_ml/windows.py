"""Windows of audio around hits, with the augmentation used in training (D108)."""

import zlib

import numpy as np
from scipy.signal import butter, fftconvolve, lfilter, sosfilt

from .audio import SR, load
from .classes import INDEX
from .data import Hit
from .frontend import PRE, WINDOW

MARGIN = 0.06  # seconds of room around a window, for jitter and pitch shifts


GATE_FADE = 80  # 5 ms


def gate(w: np.ndarray, at: int) -> np.ndarray:
    """Silence a window from sample `at` on (the next hit), with a 5 ms fade before it. The app
    does the same (`onsets.ts: hitWindow`)."""
    if at >= len(w):
        return w
    w = w.copy()
    a = max(0, at - GATE_FADE)
    w[a:at] *= np.linspace(1, 0, at - a, endpoint=False, dtype=np.float32)
    w[max(0, at):] = 0
    return w


def segment(path: str, start: float, next: float | None = None) -> np.ndarray:
    """Audio from `start - PRE - MARGIN` for WINDOW + 2·MARGIN, zero-padded at the ends, and
    silenced from the next hit on."""
    x = load(path)
    m = int(MARGIN * SR)
    a = int(round(start * SR)) - PRE - m
    n = WINDOW + 2 * m
    out = np.zeros(n, dtype=np.float32)
    lo, hi = max(0, a), min(len(x), a + n)
    if hi > lo:
        out[lo - a : hi - a] = x[lo:hi]
    if next is not None:
        out = gate(out, int(round(next * SR)) - a)
    return out


def centre(seg: np.ndarray) -> np.ndarray:
    m = (len(seg) - WINDOW) // 2
    return seg[m : m + WINDOW]


def negatives(hits: list[Hit], rng: np.random.Generator, per_file=6) -> list[Hit]:
    """Other: windows between hits (breaths, tails, room), like the false onsets a take has."""
    by_file: dict[str, list[float]] = {}
    for h in hits:
        if h.dataset != "beatbox-samples":
            by_file.setdefault(h.file, []).append(h.start)
    out = []
    for f, times in by_file.items():
        times = sorted(times)
        gaps = [(a + 0.08, b - 0.08) for a, b in zip(times, times[1:]) if b - a > 0.25]
        for i in rng.permutation(len(gaps))[:per_file]:
            lo, hi = gaps[i]
            src = next(h for h in hits if h.file == f)
            t = float(rng.uniform(lo, hi))
            later = [x for x in times if x > t]
            out.append(Hit(src.dataset, src.voice, f, t, "other", None, src.trainable,
                           later[0] if later else None))
    return out


def _room(rng):
    n = int(SR * rng.uniform(0.05, 0.3))
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 6))
    ir[0] = 1 / rng.uniform(0.15, 0.6)
    return ir / np.abs(ir).sum() * 4


def _shelf(x, rng):
    # one-pole tilt: brighter or darker microphones
    a = rng.uniform(-0.6, 0.6)
    y = lfilter([1 - abs(a)], [1, -abs(a)], x)
    return y if a > 0 else x - 0.7 * y


def augment(seg: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    x = seg
    # pitch ±2 semitones by resampling (also moves the timing, which jitter covers)
    r = 2 ** (rng.uniform(-2, 2) / 12)
    idx = np.arange(0, len(x) - 1, r)
    x = np.interp(idx, np.arange(len(x)), x).astype(np.float32)
    if len(x) < len(seg):
        x = np.pad(x, (0, len(seg) - len(x)))
    x = x[: len(seg)]
    if rng.random() < 0.5:
        x = _shelf(x, rng)
    if rng.random() < 0.4:
        # dull recordings: low sample rates, lossy files, cheap mics
        sos = butter(int(rng.integers(2, 5)), rng.uniform(2500, 7000), fs=SR, output="sos")
        x = sosfilt(sos, x).astype(np.float32)
    if rng.random() < 0.3:
        # proximity: a close mic boosts the bass
        sos = butter(2, rng.uniform(120, 300), fs=SR, output="sos")
        x = (x + rng.uniform(0.5, 2.0) * sosfilt(sos, x)).astype(np.float32)
    if rng.random() < 0.3:
        x = fftconvolve(x, _room(rng))[: len(seg)]
    if rng.random() < 0.25:
        # a hum or rumble under the hit (beatboxers hum basslines; rooms rumble)
        t = np.arange(len(x)) / SR
        f = rng.uniform(55, 220)
        peak = np.abs(x).max() + 1e-9
        hum = np.sin(2 * np.pi * f * t + rng.uniform(0, 6.3)) + 0.3 * np.sin(4 * np.pi * f * t)
        x = x + (hum * peak * 10 ** (rng.uniform(-30, -10) / 20)).astype(np.float32)
    if rng.random() < 0.6:
        peak = np.abs(x).max() + 1e-9
        x = x + rng.standard_normal(len(x)) * peak * 10 ** (rng.uniform(-60, -25) / 20)
    # onset jitter: −10..+15 ms (the app's onsets are found, not annotated)
    m = (len(seg) - WINDOW) // 2 + int(rng.uniform(-0.010, 0.015) * SR)
    return x[m : m + WINDOW].astype(np.float32)


def label_index(h: Hit) -> int:
    return INDEX[h.label]


def voice_bucket(voice: str, buckets=100) -> int:
    return zlib.crc32(voice.encode()) % buckets
