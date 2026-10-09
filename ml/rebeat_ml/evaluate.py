"""
Evaluate a run on the test voices (D116). Run: `uv run python -m rebeat_ml.evaluate runs/<name>`.
Reports per-class precision/recall/F1 and a confusion matrix per dataset, without calibration
and with it (10 hits per class from the same voice as prototypes, D112). Writes report.md and
metrics.json next to the model.
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support

from .calibrate import K, TAU, blend, prototypes
from .classes import CLASSES, INDEX, NAMES
from .data import all_hits
from .model import HitNet
from .windows import centre, segment

CORE = [INDEX[c] for c in ("kick", "snare", "hihat")]


def load_model(run: Path) -> HitNet:
    ck = torch.load(run / "model.pt", weights_only=False)
    m = HitNet(width=ck["width"])
    m.load_state_dict(ck["state"])
    return m.eval()


def infer(model, hits):
    xs = np.stack([centre(segment(h.file, h.start, h.next)) for h in hits])
    logits, embs = [], []
    with torch.no_grad():
        for i in range(0, len(xs), 512):
            lg, e = model(torch.from_numpy(xs[i : i + 512]))
            logits.append(lg.numpy())
            embs.append(e.numpy())
    return np.concatenate(logits), np.concatenate(embs)


def calibrated(logits, emb, y, voices, per_class=10, seed=0, tau=TAU, k=K):
    """Per voice: per_class random hits of each class are the calibration set, the rest is scored."""
    rng = np.random.default_rng(seed)
    pred, truth = [], []
    for v in sorted(set(voices)):
        sel = np.where(voices == v)[0]
        cal = []
        for c in range(len(CLASSES)):
            idx = sel[y[sel] == c]
            cal += list(rng.permutation(idx)[:per_class])
        rest = np.setdiff1d(sel, cal)
        if not len(rest):
            continue
        protos, counts = prototypes(emb[cal], y[cal], len(CLASSES))
        p = blend(logits[rest], emb[rest], protos, counts, tau, k)
        pred += list(p.argmax(1))
        truth += list(y[rest])
    return np.array(pred), np.array(truth)


def table(y, pred):
    present = sorted(set(y) | set(pred))
    p, r, f, n = precision_recall_fscore_support(y, pred, labels=present, zero_division=0)
    rows = ["| class | precision | recall | F1 | hits |", "| --- | ---: | ---: | ---: | ---: |"]
    for i, c in enumerate(present):
        rows.append(f"| {NAMES[CLASSES[c]]} | {p[i]:.2f} | {r[i]:.2f} | {f[i]:.2f} | {n[i]} |")
    cm = confusion_matrix(y, pred, labels=present)
    head = "| truth \\ predicted | " + " | ".join(NAMES[CLASSES[c]] for c in present) + " |"
    rows += ["", head, "|" + " --- |" * (len(present) + 1)]
    for i, c in enumerate(present):
        rows.append(f"| {NAMES[CLASSES[c]]} | " + " | ".join(str(v) for v in cm[i]) + " |")
    return "\n".join(rows)


def core_f1(y, pred):
    sel = np.isin(y, CORE)
    return float(f1_score(y[sel], pred[sel], labels=CORE, average="macro", zero_division=0))


def main():
    run = Path(sys.argv[1])
    model = load_model(run)
    # the run's own test voices (it may have trained on beatboxset1, --with-bbs1)
    test_voices = set(json.loads((run / "split.json").read_text())["test"])
    test = [h for h in all_hits(with_bbs1=True) if h.voice in test_voices]
    by_ds = defaultdict(list)
    for h in test:
        by_ds[h.dataset].append(h)
    metrics, report = {}, [f"# Evaluation of `{run.name}`", ""]
    report.append("Test voices are never trained on (splits by voice, D108). *Calibrated* uses "
                  "10 hits per class of the same voice as prototypes (D112) and scores the rest.")
    for ds, hs in sorted(by_ds.items()):
        y = np.array([INDEX[h.label] for h in hs])
        voices = np.array([h.voice for h in hs])
        logits, emb = infer(model, hs)
        pred = logits.argmax(1)
        cpred, cy = calibrated(logits, emb, y, voices)
        m = {
            "hits": len(hs),
            "voices": len(set(voices)),
            "accuracy": float((pred == y).mean()),
            "core_macro_f1": core_f1(y, pred),
            "calibrated_accuracy": float((cpred == cy).mean()) if len(cy) else None,
            "calibrated_core_macro_f1": core_f1(cy, cpred) if len(cy) else None,
        }
        metrics[ds] = m
        report += ["", f"## {ds}: {m['hits']} hits, {m['voices']} voices", "",
                   f"- Accuracy {m['accuracy']:.3f}; Kick/Snare/Closed hi-hat macro F1 "
                   f"{m['core_macro_f1']:.3f}"]
        if len(cy):
            report.append(f"- Calibrated: accuracy {m['calibrated_accuracy']:.3f}; core macro F1 "
                          f"{m['calibrated_core_macro_f1']:.3f}")
        report += ["", "Without calibration:", "", table(y, pred)]
        if len(cy):
            report += ["", "Calibrated:", "", table(cy, cpred)]
    (run / "metrics.json").write_text(json.dumps(metrics, indent=1))
    (run / "report.md").write_text("\n".join(report) + "\n")
    print(json.dumps(metrics, indent=1))


if __name__ == "__main__":
    main()
