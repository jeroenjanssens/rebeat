import json
from pathlib import Path

import numpy as np
import soundfile as sf

from rebeat_ml.onsets import detect
from rebeat_ml.windows import gate

FX = Path(__file__).resolve().parents[2] / "src" / "library" / "beatbox" / "fixtures"


def test_onsets_match_the_fixture():
    spec = json.loads((FX / "onsets.json").read_text())
    x, sr = sf.read(FX / spec["file"], dtype="float32")
    assert sr == 16000
    found = detect(x)
    assert np.allclose(found, spec["onsets"], atol=1e-4)


def test_gate_fades_then_silences():
    w = gate(np.ones(400, dtype=np.float32), 200)
    assert w[119] == 1 and w[200:].sum() == 0
    assert np.isclose(w[120], 1) and np.isclose(w[160], 0.5)
