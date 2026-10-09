"""
Export a run for the app (D109). Run: `uv run python -m rebeat_ml.export runs/<name> <version>`.
Writes public/models/beatbox/<version>/{model.onnx, model.json, report.md} and the parity
fixtures (src/library/beatbox/fixtures/parity.json): fixed audio windows with the scores and
embeddings PyTorch computed, which the app's tests compare with ONNX Runtime Web's.
"""

import json
import shutil
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

from .audio import SR
from .calibrate import K, TAU
from .classes import CLASSES, NAMES
from .evaluate import load_model
from .frontend import PRE, WINDOW
from .windows import centre, segment

REPO = Path(__file__).resolve().parents[2]
CREDITS = {
    "avp": "Amateur Vocal Percussion dataset (Alejandro Delgado, CC BY 4.0)",
    "beatboxset1": "beatboxset1 (Stowell, CC BY-SA 3.0)",
    "beatbox-samples": "beatbox-samples (Jeroen Janssens, CC BY 4.0)",
    "synth": "synthetic takes made from beatbox-samples",
}
PARITY_FILES = ["kick1.wav", "snare2.wav", "hihat1.wav", "tom1.wav", "laser4.wav"]


class Wrapped(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, audio):
        logits, emb = self.m(audio)
        return logits, emb


def write_onset_fixture(fx: Path):
    """One of Jeroen's loops at 16 kHz (CC BY 4.0), with the onsets and gated windows Python
    finds in it: the app's tests must find the same (onsets.test.ts)."""
    import soundfile as sf

    from .data import RAW
    from .audio import load
    from .onsets import detect
    from .windows import gate

    x = load(RAW / "beatbox-samples" / "wav" / "loop4.wav")
    x = (np.round(x * 32767) / 32767).astype(np.float32)  # what the 16-bit file holds
    sf.write(fx / "loop4-16k.wav", x, SR, subtype="PCM_16")
    onsets = detect(x)
    windows = []
    for i, t in enumerate(onsets[:4]):
        a = int(round(t * SR)) - PRE
        w = np.zeros(WINDOW, dtype=np.float32)
        lo, hi = max(0, a), min(len(x), a + WINDOW)
        w[lo - a : hi - a] = x[lo:hi]
        if i + 1 < len(onsets):
            w = gate(w, int(round(onsets[i + 1] * SR)) - a)
        windows.append([round(float(v), 6) for v in w])
    (fx / "onsets.json").write_text(json.dumps({
        "file": "loop4-16k.wav",
        "source": "beatbox-samples by Jeroen Janssens (CC BY 4.0)",
        "onsets": [round(t, 6) for t in onsets],
        "windows": windows,
    }))


def main():
    run, version = Path(sys.argv[1]), sys.argv[2]
    model = load_model(run)
    out = REPO / "public" / "models" / "beatbox" / version
    out.mkdir(parents=True, exist_ok=True)
    onnx_path = out / "model.onnx"
    torch.onnx.export(
        Wrapped(model), (torch.zeros(1, WINDOW),), str(onnx_path),
        input_names=["audio"], output_names=["logits", "embedding"],
        dynamic_axes={"audio": {0: "n"}, "logits": {0: "n"}, "embedding": {0: "n"}},
        opset_version=17, dynamo=False,
    )

    # parity: PyTorch vs ONNX Runtime here, and the same fixtures for the app's tests
    from .data import RAW, first_onset
    from .audio import load

    xs = []
    for name in PARITY_FILES:
        p = RAW / "beatbox-samples" / "wav" / name
        xs.append(centre(segment(str(p), first_onset(load(p)))))
    xs.append(np.zeros(WINDOW, dtype=np.float32))
    x = np.stack(xs).astype(np.float32)
    model.eval()  # export may leave the model in training mode
    with torch.no_grad():
        lt, et = (t.numpy() for t in model(torch.from_numpy(x)))
    sess = ort.InferenceSession(str(onnx_path))
    lo, eo = sess.run(None, {"audio": x})
    assert np.abs(lt - lo).max() < 1e-3 and np.abs(et - eo).max() < 1e-3, "ONNX differs"
    fx = REPO / "src" / "library" / "beatbox" / "fixtures"
    fx.mkdir(parents=True, exist_ok=True)
    (fx / "parity.json").write_text(json.dumps({
        "version": version,
        "files": PARITY_FILES + ["silence"],
        "audio": [[round(float(v), 7) for v in row] for row in x],
        "logits": lo.round(5).tolist(),
        "embedding": eo.round(5).tolist(),
    }))

    write_onset_fixture(fx)

    metrics = json.loads((run / "metrics.json").read_text()) if (run / "metrics.json").exists() else {}
    meta = {
        "format": "rebeat-beatbox-model",
        "version": version,
        "sampleRate": SR,
        "window": WINDOW,
        "pre": PRE,
        "classes": [{"id": c, "name": NAMES[c]} for c in CLASSES],
        "embedding": int(eo.shape[1]),
        "calibration": {"tau": TAU, "k": K},
        "trainedOn": [CREDITS.get(d, d) for d in
                      json.loads((run / "split.json").read_text())["datasets"]],
        "metrics": metrics,
    }
    (out / "model.json").write_text(json.dumps(meta, indent=1) + "\n")
    if (run / "report.md").exists():
        shutil.copy(run / "report.md", out / "report.md")
    print("exported", out, f"{onnx_path.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
