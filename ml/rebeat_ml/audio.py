"""Reading audio as 16 kHz mono, the rate the model works at."""

from functools import lru_cache
from math import gcd
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

SR = 16000


def to_rate(x: np.ndarray, sr: int, target: int = SR) -> np.ndarray:
    if sr == target:
        return x.astype(np.float32)
    g = gcd(sr, target)
    return resample_poly(x, target // g, sr // g).astype(np.float32)


@lru_cache(maxsize=512)
def load(path: str | Path) -> np.ndarray:
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return to_rate(x.mean(axis=1), sr)
