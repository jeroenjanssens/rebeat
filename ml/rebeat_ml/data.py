"""
Every dataset as one table of hits (D108, D110): a hit is a labeled onset in an audio file,
spoken by a voice. The dataset format the Rebeat panel exports (a folder of WAVs and
`hits.csv`: file, start, end, label, voice) reads through `read_folder`, and Jeroen's
recordings are turned into it, so new recordings from the panel train the same way.
"""

import csv
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .audio import SR, load
from .classes import AVP, BEATBOX_SAMPLES, BEATBOXSET1, CLASSES

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
HELD_OUT = {"kick3.wav", "snare6.wav", "hihat2.wav", "tom3.wav", "crash3.wav", "trumpet4.wav"}


@dataclass(frozen=True)
class Hit:
    dataset: str
    voice: str
    file: str
    start: float  # seconds
    label: str
    end: float | None = None
    # the shipped model may train on it (license, D108) and it isn't held out for testing (D116)
    trainable: bool = True
    # where the next hit in the same file starts: the window is silenced from there (gate)
    next: float | None = None


def first_onset(x: np.ndarray, threshold_db=-30.0) -> float:
    """Where a one-shot starts: the first sample within `threshold_db` of the peak, 5 ms early."""
    peak = np.abs(x).max() + 1e-9
    i = int(np.argmax(np.abs(x) > peak * 10 ** (threshold_db / 20)))
    return max(0.0, i / SR - 0.005)


def read_folder(folder: Path, dataset: str, trainable=True) -> list[Hit]:
    """The dataset format (D110). Unlabeled hits are skipped."""
    out = []
    with open(folder / "hits.csv", newline="") as f:
        for row in csv.DictReader(f):
            if row["label"] not in CLASSES:
                continue
            end = float(row["end"]) if row.get("end") else None
            out.append(
                Hit(dataset, row["voice"] or dataset, str(folder / row["file"]),
                    float(row["start"]), row["label"], end, trainable)
            )
    return out


def avp(trainable=True) -> list[Hit]:
    """AVP (CC BY 4.0): 28 participants × personal and fixed imitations, onsets per file in CSVs."""
    root = RAW / "avp"
    out = []
    for wav in sorted(root.rglob("*.wav")):
        if "__MACOSX" in wav.parts:
            continue
        ann = wav.with_suffix(".csv")
        if not ann.exists():
            continue
        voice = "avp-" + next(p for p in wav.parts if p.lower().startswith("participant"))
        with open(ann, newline="") as f:
            for row in csv.reader(f):
                if len(row) < 2:
                    continue
                try:
                    t = float(row[0])
                except ValueError:
                    continue
                label = AVP.get(row[1].strip())
                if label:
                    out.append(Hit("avp", voice, str(wav), t, label, None, trainable))
    return out


def beatboxset1(trainable=False) -> list[Hit]:
    """beatboxset1 (CC BY-SA 3.0): one contributor per file. Annotator DR's labels. Not used
    for the shipped model's training unless asked (ShareAlike, D108)."""
    root = RAW / "beatboxset1"
    out = []
    for ann in sorted((root / "Annotations_DR").glob("*.csv")):
        wav = root / (ann.stem + ".wav")
        with open(ann, newline="") as f:
            for row in csv.reader(f):
                label = BEATBOXSET1.get(row[1].strip()) if len(row) > 1 else None
                if label:
                    out.append(Hit("beatboxset1", "bbs1-" + ann.stem, str(wav), float(row[0]),
                                   label, None, trainable))
    return out


def beatbox_samples() -> list[Hit]:
    """Jeroen's recordings (CC BY 4.0): one-shots labeled by their strudel.json key, everything
    else as Other; the loops and the freestyle are takes, labeled in the panel (D116)."""
    root = RAW / "beatbox-samples"
    spec = json.loads((root / "strudel.json").read_text())
    out = []
    for key, value in spec.items():
        if key.startswith("_") or key in ("loop", "freestyle", "bass"):
            continue
        label = BEATBOX_SAMPLES.get(key, "other")
        for rel in value if isinstance(value, list) else [value]:
            path = root / rel
            # the ones the synthetic takes leave out are test-only (synth.py: HELD_OUT)
            held = Path(rel).name in HELD_OUT
            out.append(Hit("beatbox-samples", "jeroen-heldout" if held else "jeroen", str(path),
                           first_onset(load(path)), label, None, not held))
    labels = Path(__file__).resolve().parent.parent / "labels" / "jeroen-takes"
    if (labels / "hits.csv").exists():
        out += read_folder(labels, "jeroen-takes", trainable=False)
    return out


def exported() -> list[Hit]:
    """Datasets exported from the Beatbox panel and unzipped into ml/data/exports/<name>/."""
    root = RAW.parent / "exports"
    out = []
    for folder in sorted(root.glob("*/")) if root.exists() else []:
        if (folder / "hits.csv").exists():
            out += read_folder(folder, "export-" + folder.name)
    return out


def with_next(hits: list[Hit], also: dict[str, list[float]] | None = None) -> list[Hit]:
    """Each hit with the start of the next onset in its file (from any annotation)."""
    from dataclasses import replace

    times: dict[str, list[float]] = {}
    for h in hits:
        times.setdefault(h.file, []).append(h.start)
    for f, ts in (also or {}).items():
        times.setdefault(f, []).extend(ts)
    for ts in times.values():
        ts.sort()
    out = []
    for h in hits:
        later = [t for t in times[h.file] if t > h.start + 0.03]
        out.append(replace(h, next=later[0] if later else None))
    return out


def aligned(hits: list[Hit]) -> list[Hit]:
    """Annotated hits moved to where the app's onset detector puts them (D108): annotators
    click at different moments of an attack, and the model must see the app's windows."""
    from dataclasses import replace

    from .onsets import realign

    return [replace(h, start=realign(h.file, h.start)) for h in hits]


def synthetic() -> list[Hit]:
    """Takes made from Jeroen's one-shots (`synth.py`), if they've been made."""
    out = []
    for name, trainable in (("synth", True), ("synth-test", False)):
        folder = RAW.parent / name
        if (folder / "hits.csv").exists():
            out += read_folder(folder, name, trainable)
    return out


def all_hits(with_bbs1=False, with_synth=True) -> list[Hit]:
    return with_next(
        aligned(
            avp()
            + beatboxset1(trainable=with_bbs1)
            + beatbox_samples()
            + (synthetic() if with_synth else [])
        )
        + exported(),
        also=_unlabeled_onsets(),
    )


def _unlabeled_onsets() -> dict[str, list[float]]:
    """Annotated onsets whose labels we drop ("?", "t") still end the hit before them."""
    root = RAW / "beatboxset1" / "Annotations_DR"
    out: dict[str, list[float]] = {}
    for ann in sorted(root.glob("*.csv")) if root.exists() else []:
        wav = str(RAW / "beatboxset1" / (ann.stem + ".wav"))
        with open(ann, newline="") as f:
            for row in csv.reader(f):
                if len(row) > 1 and row[1].strip() not in BEATBOXSET1:
                    out.setdefault(wav, []).append(float(row[0]))
    return out
