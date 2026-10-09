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
    # before the audio starts is silence, so a hit at the very start counts
    prev = np.concatenate([np.zeros((1, mag.shape[1]), dtype=mag.dtype), mag[:-1]])
    return np.maximum(0, mag - prev).sum(axis=1).astype(np.float32)


def peak_after(x, t, span=0.12):
    a = max(0, int(round(t * SR)))
    b = min(len(x), a + int(round(span * SR)))
    return float(np.abs(x[a:b]).max()) if b > a else 0.0


def rms(x, a, b):
    i, j = max(0, int(round(a * SR))), min(len(x), int(round(b * SR)))
    return float(np.sqrt(np.mean(x[i:j].astype(np.float64) ** 2))) if j > i else 0.0


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


def detect(
    x: np.ndarray,
    sensitivity=0.5,
    min_gap=0.04,
    mult=1.4,
    base=0.12,
    slope=0.1,
    pct=95.0,
    rise=1.15,
    before=0.02,
    emphasis=True,
    local="mean",
) -> list[float]:
    """Onsets in seconds. The defaults were chosen on AVP, beatboxset1 and synthetic takes of
    Jeroen's sounds (onset F-measure 0.81–0.83 within 30 ms). `rise` keeps the end of a sound (a
    cut-off, a tail) from counting; it's measured on the first difference (`emphasis`), which
    favors the highs, so a hi-hat on a kick's tail still rises."""
    env = flux(x)
    if not len(env) or env.max() <= 0:
        return []
    peak = float(np.abs(x).max())
    floor = peak * 10 ** ((-34 - 20 * sensitivity) / 20)
    # relative to the take's strong hits, not its single loudest moment
    delta = float(np.percentile(env, pct)) * (base - slope * sensitivity)
    W = 10
    dx = np.diff(x, prepend=x[:1]) if emphasis else x
    out, last = [], -np.inf
    for f in range(0, len(env) - 1):
        v = env[f]
        if (f and v < env[f - 1]) or v < env[f + 1]:
            continue
        lo, hi = max(0, f - W), min(len(env) - 1, f + W)
        around = env[lo : hi + 1]
        if v < (np.median(around) if local == "median" else around.mean()) * mult + delta:
            continue
        if (env[f + 1 : min(len(env) - 1, f + 6) + 1] > v).any():
            continue
        t = attack_start(x, (f * HOP + N / 2) / SR)
        if peak_after(x, t) < floor:
            continue
        # a hit gets louder: the end of a sound (a cut-off, a decaying tail) isn't one
        y = dx if emphasis else x
        if rms(y, t, t + 0.03) < rise * rms(y, t - before, t):
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
