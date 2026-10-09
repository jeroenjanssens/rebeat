"""
The model's front end: a window of 16 kHz audio → a log-mel spectrogram. It's part of the
exported graph (D109), so the browser never computes features of its own. The STFT is a
convolution with a fixed windowed DFT basis, which exports to plain ONNX Conv.
"""

import numpy as np
import torch
from torch import nn

from .audio import SR

PRE = 320  # 20 ms of audio before the onset
WINDOW = 3200  # 200 ms in all
N_FFT = 512
HOP = 80
N_MELS = 64
FMIN, FMAX = 40.0, 7600.0


def mel_filters(n_mels=N_MELS, n_fft=N_FFT, sr=SR, fmin=FMIN, fmax=FMAX) -> np.ndarray:
    """Slaney-style triangular mel filters, shape (n_mels, n_fft // 2 + 1)."""

    def hz_to_mel(f):
        return 2595.0 * np.log10(1.0 + f / 700.0)

    def mel_to_hz(m):
        return 700.0 * (10.0 ** (m / 2595.0) - 1.0)

    freqs = np.linspace(0, sr / 2, n_fft // 2 + 1)
    edges = mel_to_hz(np.linspace(hz_to_mel(fmin), hz_to_mel(fmax), n_mels + 2))
    fb = np.zeros((n_mels, len(freqs)), dtype=np.float32)
    for i in range(n_mels):
        lo, mid, hi = edges[i : i + 3]
        up = (freqs - lo) / (mid - lo)
        down = (hi - freqs) / (hi - mid)
        fb[i] = np.maximum(0, np.minimum(up, down)) * (2.0 / (hi - lo))
    return fb


class LogMel(nn.Module):
    """(batch, WINDOW) audio → (batch, 1, N_MELS, frames). Level-independent: each window is
    scaled to its peak first, since loudness is measured separately (velocity)."""

    def __init__(self):
        super().__init__()
        n = np.arange(N_FFT)
        win = 0.5 - 0.5 * np.cos(2 * np.pi * n / N_FFT)
        k = np.arange(N_FFT // 2 + 1)[:, None]
        re = np.cos(2 * np.pi * k * n / N_FFT) * win
        im = -np.sin(2 * np.pi * k * n / N_FFT) * win
        basis = np.concatenate([re, im])[:, None, :].astype(np.float32)
        self.register_buffer("basis", torch.from_numpy(basis))
        self.register_buffer("mel", torch.from_numpy(mel_filters()))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = x / (x.abs().amax(dim=1, keepdim=True) + 1e-4)
        spec = nn.functional.conv1d(x[:, None, :], self.basis, stride=HOP)
        half = spec.shape[1] // 2
        power = spec[:, :half] ** 2 + spec[:, half:] ** 2
        mel = torch.matmul(self.mel, power)
        return torch.log(mel + 1e-6)[:, None]


FRAMES = (WINDOW - N_FFT) // HOP + 1
