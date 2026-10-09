"""Tune calibration's tau and K on the validation voices. Run: `uv run python -m rebeat_ml.tune runs/<name>`."""

import json
import sys
from pathlib import Path

import numpy as np

from .classes import INDEX
from .data import all_hits
from .evaluate import calibrated, core_f1, infer, load_model


def main():
    run = Path(sys.argv[1])
    model = load_model(run)
    val_voices = set(json.loads((run / "split.json").read_text())["val"])
    hits = [h for h in all_hits(with_bbs1=True) if h.voice in val_voices and h.dataset != "beatbox-samples"]
    y = np.array([INDEX[h.label] for h in hits])
    voices = np.array([h.voice for h in hits])
    logits, emb = infer(model, hits)
    best = None
    for tau in (0.03, 0.05, 0.1, 0.2):
        for k in (0.5, 1, 2, 4, 8):
            scores = [
                core_f1(*calibrated(logits, emb, y, voices, seed=s, tau=tau, k=k)[::-1])
                for s in range(3)
            ]
            f = float(np.mean(scores))
            print(f"tau {tau:<5} k {k:<4} core F1 {f:.3f}")
            if best is None or f > best[0]:
                best = (f, tau, k)
    print("best", best)


if __name__ == "__main__":
    main()
