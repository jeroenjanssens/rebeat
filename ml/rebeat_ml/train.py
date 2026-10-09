"""
Train the hit classifier. Run: `uv run python -m rebeat_ml.train [--epochs 40] [--with-bbs1]`.
Splits are by voice (D108): AVP participants go to train, validation or test by a hash of
their id; beatboxset1 is test-only unless --with-bbs1; Jeroen's one-shots and panel exports
train; Jeroen's labeled takes stay test-only (D116). Writes runs/<name>/model.pt and split.json.
"""

import argparse
import json
import random
import time
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch import nn

from .classes import CLASSES
from .data import Hit, all_hits
from .model import HitNet, supcon
from .windows import augment, centre, label_index, negatives, segment, voice_bucket

RUNS = Path(__file__).resolve().parent.parent / "runs"


def split(hits: list[Hit]):
    train, val, test = [], [], []
    for h in hits:
        if not h.trainable:
            test.append(h)
            continue
        if h.dataset in ("avp", "beatboxset1"):
            b = voice_bucket(h.voice)
            (test if b < 18 else val if b < 26 else train).append(h)
        else:
            train.append(h)
    return train, val, test


def device():
    return torch.device("mps" if torch.backends.mps.is_available() else "cpu")


def batches(segs, labels, rng, batch, aug):
    order = rng.permutation(len(segs))
    for i in range(0, len(order), batch):
        idx = order[i : i + batch]
        x = np.stack([augment(segs[j], rng) if aug else centre(segs[j]) for j in idx])
        yield torch.from_numpy(x), torch.from_numpy(labels[idx])


def balanced(labels: np.ndarray, rng, n: int) -> np.ndarray:
    """Indices drawn with weights ∝ 1/√count, so rare classes are seen more often."""
    counts = np.bincount(labels, minlength=len(CLASSES)).astype(float)
    w = 1 / np.sqrt(np.maximum(counts[labels], 1))
    return rng.choice(len(labels), size=n, p=w / w.sum())


def evaluate_loss(model, segs, labels, dev):
    model.eval()
    correct, total = 0, 0
    with torch.no_grad():
        for i in range(0, len(segs), 512):
            x = torch.from_numpy(np.stack([centre(s) for s in segs[i : i + 512]])).to(dev)
            logits, _ = model(x)
            correct += (logits.argmax(1).cpu().numpy() == labels[i : i + 512]).sum()
            total += len(x)
    return correct / max(1, total)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--width", type=int, default=32)
    ap.add_argument("--with-bbs1", action="store_true")
    ap.add_argument("--final", action="store_true", help="train on train + validation")
    ap.add_argument("--name", default=None)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--supcon", type=float, default=0.5, help="weight of the contrastive loss")
    args = ap.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)

    hits = all_hits(with_bbs1=args.with_bbs1)
    train, val, test = split(hits)
    train = train + negatives(train, rng)
    val = val + negatives(val, rng)
    if args.final:
        train, val = train + val, val
    print("train", len(train), Counter(h.label for h in train))
    print("val", len(val), "test", len(test), "voices", len({h.voice for h in test}))

    t0 = time.time()
    tr_segs = [segment(h.file, h.start, h.next) for h in train]
    tr_y = np.array([label_index(h) for h in train])
    va_segs = [segment(h.file, h.start, h.next) for h in val]
    va_y = np.array([label_index(h) for h in val])
    print(f"windows in {time.time() - t0:.0f}s")

    dev = device()
    model = HitNet(width=args.width).to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-3)
    steps = args.epochs * (len(train) // args.batch + 1)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.05)

    best, best_state = -1.0, None
    for epoch in range(args.epochs):
        model.train()
        idx = balanced(tr_y, rng, len(tr_y))
        segs = [tr_segs[i] for i in idx]
        ys = tr_y[idx]
        total = 0.0
        for x, y in batches(segs, ys, rng, args.batch, aug=True):
            x, y = x.to(dev), y.to(dev)
            logits, emb = model(x)
            loss = loss_fn(logits, y) + args.supcon * supcon(emb, y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            total += loss.item() * len(x)
        acc = evaluate_loss(model, va_segs, va_y, dev)
        print(f"epoch {epoch + 1:3d} loss {total / len(ys):.3f} val acc {acc:.3f}", flush=True)
        if acc >= best or args.final:
            best = acc
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    name = args.name or time.strftime("%Y%m%d-%H%M%S")
    out = RUNS / name
    out.mkdir(parents=True, exist_ok=True)
    torch.save({"state": best_state, "width": args.width, "args": vars(args)}, out / "model.pt")
    voices = lambda hs: sorted({h.voice for h in hs})  # noqa: E731
    (out / "split.json").write_text(
        json.dumps({"train": voices(train), "val": voices(val), "test": voices(test),
                    "datasets": sorted({h.dataset for h in train}), "best_val_acc": best},
                   indent=1)
    )
    print("saved", out)


if __name__ == "__main__":
    main()
