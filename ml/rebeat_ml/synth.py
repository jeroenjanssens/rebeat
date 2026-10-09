"""
Synthetic takes made from one-shots (D108): random beats at random tempos, every hit with its
own velocity (gain), pitch and timing, overlapping tails, and sometimes a hummed bass or room
noise under it. They give a few recordings many variations in the dense context of real
beatboxing, and labeled onsets to tune the detector on.

Run: `uv run python -m rebeat_ml.synth` (writes ml/data/synth/, read by data.py).
"""

import csv
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from .audio import SR, load
from .classes import BEATBOX_SAMPLES
from .data import HELD_OUT, RAW, first_onset

OUT = RAW.parent / "synth"

# where each class likes to sit in a bar of 16 steps (probability per step)
PLACES = {
    "kick": [0.9, 0, 0.1, 0.15, 0, 0, 0.3, 0, 0.6, 0, 0.25, 0.1, 0, 0.15, 0.2, 0],
    "snare": [0, 0, 0, 0, 0.95, 0, 0, 0.1, 0, 0, 0, 0.1, 0.95, 0, 0.1, 0.15],
    "hihat": [0.3, 0.2, 0.7, 0.2, 0.2, 0.2, 0.7, 0.2, 0.3, 0.2, 0.7, 0.2, 0.2, 0.2, 0.7, 0.3],
    "openhat": [0, 0, 0.15, 0, 0, 0, 0.1, 0, 0, 0, 0.15, 0, 0, 0, 0.2, 0],
    "tom": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.15, 0.25, 0.3, 0.3],
    "clap": [0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0],
    "crash": [0.25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "other": [0, 0, 0, 0.05, 0, 0.05, 0, 0.05, 0, 0.05, 0, 0.05, 0, 0.05, 0, 0.05],
}


def pool(held_out=False):
    """Jeroen's one-shots by class: (audio from its onset, file name); the training pool, or
    with `held_out` only the recordings kept out of it (for test takes)."""
    root = RAW / "beatbox-samples"
    spec = json.loads((root / "strudel.json").read_text())
    out: dict[str, list[tuple[np.ndarray, str]]] = {}
    for key, value in spec.items():
        if key.startswith("_") or key in ("loop", "freestyle", "bass"):
            continue
        label = BEATBOX_SAMPLES.get(key, "other")
        for rel in value if isinstance(value, list) else [value]:
            name = Path(rel).name
            if (name in HELD_OUT) != held_out:
                continue
            x = load(root / rel)
            a = int(first_onset(x) * SR)
            out.setdefault(label, []).append((x[a : a + int(0.8 * SR)], name))
    return out


def shift(x: np.ndarray, semitones: float) -> np.ndarray:
    r = 2 ** (semitones / 12)
    idx = np.arange(0, len(x) - 1, r)
    return np.interp(idx, np.arange(len(x)), x).astype(np.float32)


def make_take(rng: np.random.Generator, sounds, bars=2):
    """One take: (audio, [(onset, label)])."""
    bpm = rng.uniform(80, 145)
    step = 60 / bpm / 4
    n = bars * 16
    length = int((n * step + 1.0) * SR)
    x = np.zeros(length, dtype=np.float32)
    hits = []
    # a few classes per take, like a beatboxer's kit
    classes = [c for c in sounds if rng.random() < (0.9 if c in ("kick", "snare", "hihat") else 0.35)]
    picks = {c: sounds[c][int(rng.integers(len(sounds[c])))][0] for c in classes}
    swing = rng.uniform(0, 0.12) if rng.random() < 0.4 else 0.0
    for i in range(n):
        for c in sorted(classes, key=lambda c: -max(PLACES[c])):
            if rng.random() < PLACES[c][i % 16] * rng.uniform(0.6, 1.2):
                t = 0.25 + i * step + (swing * step if i % 2 else 0) + rng.normal(0, 0.006)
                hits.append((t, c))
                break  # one sound at a time, as a voice makes them
    for k, (t, c) in enumerate(hits):
        s = picks[c] if rng.random() < 0.8 else sounds[c][int(rng.integers(len(sounds[c])))][0]
        s = shift(s, rng.uniform(-1.5, 1.5))
        gain = 10 ** (rng.uniform(-14, 0) / 20)  # velocity
        # a voice ends one sound to make the next: cut at the next hit, with a short tail
        if k + 1 < len(hits):
            s = s[: max(1, int((hits[k + 1][0] - t + rng.uniform(0.0, 0.012)) * SR))].copy()
        fade = min(len(s), 160)
        s[-fade:] *= np.linspace(1, 0, fade)
        a = int(t * SR)
        x[a : a + len(s)] += gain * s[: len(x) - a]
    if rng.random() < 0.35:
        # a hummed bass line under the beat
        tt = np.arange(length) / SR
        f = rng.choice([55, 65.4, 73.4, 82.4, 98.0]) * 2 ** (rng.integers(-2, 3) / 12)
        env = 0.5 + 0.5 * np.sin(2 * np.pi * tt * bpm / 60 / rng.choice([1, 2, 4]))
        x += (0.08 * rng.uniform(0.3, 1.5) * env * np.sin(2 * np.pi * f * tt)).astype(np.float32)
    if rng.random() < 0.5:
        x += (rng.standard_normal(length) * 10 ** (rng.uniform(-60, -38) / 20)).astype(np.float32)
    peak = np.abs(x).max()
    if peak > 0.99:
        x *= 0.99 / peak
    return x, hits, bpm


def write(folder: Path, count: int, seed: int, held_out: bool):
    rng = np.random.default_rng(seed)
    sounds = pool(held_out)
    folder.mkdir(parents=True, exist_ok=True)
    voice = "jeroen-heldout" if held_out else "jeroen"
    rows = []
    for k in range(count):
        x, hits, _ = make_take(rng, sounds, bars=int(rng.choice([1, 2, 2, 4])))
        name = f"take{k:03d}.wav"
        sf.write(folder / name, x, SR, subtype="PCM_16")
        rows += [
            {"file": name, "start": f"{t:.4f}", "end": "", "label": c, "voice": voice}
            for t, c in hits
        ]
    with open(folder / "hits.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["file", "start", "end", "label", "voice"])
        w.writeheader()
        w.writerows(rows)
    print(f"{count} takes, {len(rows)} hits in {folder}")


def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    write(OUT, count, seed=7, held_out=False)
    # takes made only of recordings the training never sees: a test of Jeroen's voice
    write(OUT.parent / "synth-test", 40, seed=99, held_out=True)


if __name__ == "__main__":
    main()
