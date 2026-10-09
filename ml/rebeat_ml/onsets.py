"""
The app's onset detector (`src/library/beatbox/onsets.ts`), ported so that training windows
start where the app's will: on the attack the detector finds, not where an annotator clicked.
`tests/test_onsets.py` and the app's `onsets.test.ts` check both against the same fixture.
"""

from functools import lru_cache

import numpy as np

from .audio import SR, load

N = 512
HOP = 80


def flux(x: np.ndarray) -> np.ndarray:
    frames = max(0, (len(x) - N) // HOP + 1)
    if not frames:
        return np.zeros(0, dtype=np.float32)
    win = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N) / N)).astype(np.float32)
    idx = np.arange(N)[None, :] + HOP * np.arange(frames)[:, None]
    spec = np.abs(np.fft.rfft(x[idx] * win, axis=1))[:, : N // 2]
    mag = np.log1p(100 * spec)
    mag[:, :2] = 0
    out = np.zeros(frames, dtype=np.float32)
    out[1:] = np.maximum(0, mag[1:] - mag[:-1]).sum(axis=1)
    return out


def peak_after(x, t, span=0.12):
    a = max(0, int(round(t * SR)))
    b = min(len(x), a + int(round(span * SR)))
    return float(np.abs(x[a:b]).max()) if b > a else 0.0


def attack_start(x, t):
    centre = int(round(t * SR))
    lo = max(0, centre - int(round(0.04 * SR)))
    hi = min(len(x), centre + int(round(0.02 * SR)))
    step = 16
    env = [float(np.abs(x[i : min(hi, i + step)]).max()) for i in range(lo, hi, step)]
    if not env:
        return t
    top_at = int(np.argmax(env))
    top = env[top_at]
    k = top_at
    while k > 0 and env[k - 1] > top * 0.1 and env[k - 1] <= env[k] * 1.05:
        k -= 1
    return (lo + k * step) / SR


def detect(x: np.ndarray, sensitivity=0.5, min_gap=0.04) -> list[float]:
    env = flux(x)
    if not len(env) or env.max() <= 0:
        return []
    peak = float(np.abs(x).max())
    floor = peak * 10 ** ((-34 - 20 * sensitivity) / 20)
    delta = env.max() * (0.12 - 0.1 * sensitivity)
    W = 10
    out, last = [], -np.inf
    for f in range(1, len(env) - 1):
        v = env[f]
        if v < env[f - 1] or v < env[f + 1]:
            continue
        lo, hi = max(0, f - W), min(len(env) - 1, f + W)
        if v < env[lo : hi + 1].mean() * 1.4 + delta:
            continue
        if (env[f + 1 : min(len(env) - 1, f + 6) + 1] > v).any():
            continue
        t = attack_start(x, (f * HOP + N / 2) / SR)
        if peak_after(x, t) < floor:
            continue
        if t - last < min_gap:
            continue
        last = t
        out.append(t)
    return out


@lru_cache(maxsize=1024)
def onsets_of(path: str) -> tuple[float, ...]:
    return tuple(detect(load(path)))


def realign(path: str, t: float, before=0.03, after=0.08) -> float:
    """The detected onset nearest an annotation (from 30 ms before to 80 ms after it), else the
    attack start found around it."""
    found = [o for o in onsets_of(path) if t - before <= o <= t + after]
    if found:
        return min(found, key=lambda o: abs(o - t))
    return attack_start(load(path), t + 0.02)
