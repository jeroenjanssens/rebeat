"""The hit classifier: log-mel → a small CNN → an embedding (for calibration, D112) and class scores."""

import torch
from torch import nn

from .classes import CLASSES
from .frontend import LogMel

EMBED = 64


def block(cin, cout):
    return nn.Sequential(
        nn.Conv2d(cin, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(),
        nn.Conv2d(cout, cout, 3, padding=1, bias=False),
        nn.BatchNorm2d(cout),
        nn.ReLU(),
    )


class HitNet(nn.Module):
    def __init__(self, width=32, n_classes=len(CLASSES)):
        super().__init__()
        self.frontend = LogMel()
        self.norm = nn.BatchNorm2d(1)
        self.body = nn.Sequential(
            block(1, width),
            nn.MaxPool2d(2),
            block(width, width * 2),
            nn.MaxPool2d(2),
            block(width * 2, width * 4),
            nn.MaxPool2d(2),
            block(width * 4, width * 4),
        )
        self.embed = nn.Linear(width * 4, EMBED)
        self.drop = nn.Dropout(0.3)
        self.head = nn.Linear(EMBED, n_classes)

    def features(self, mel: torch.Tensor) -> torch.Tensor:
        h = self.body(self.norm(mel))
        h = h.mean(dim=(2, 3))
        return self.embed(h)

    def forward(self, audio: torch.Tensor):
        mel = self.frontend(audio)
        if self.training:
            mel = spec_augment(mel)
        e = self.features(mel)
        logits = self.head(self.drop(torch.relu(e)))
        return logits, nn.functional.normalize(e, dim=1)


def spec_augment(mel: torch.Tensor, freq=8, time=4) -> torch.Tensor:
    """Training only: hide a random band of frequencies and a few frames per example."""
    b, _, n_mels, frames = mel.shape
    out = mel.clone()
    low = mel.amin(dim=(2, 3), keepdim=True)
    f0 = torch.randint(0, n_mels - freq, (b,), device=mel.device)
    fw = torch.randint(0, freq + 1, (b,), device=mel.device)
    t0 = torch.randint(0, frames - time, (b,), device=mel.device)
    tw = torch.randint(0, time + 1, (b,), device=mel.device)
    fi = torch.arange(n_mels, device=mel.device)[None, :]
    ti = torch.arange(frames, device=mel.device)[None, :]
    fmask = (fi >= f0[:, None]) & (fi < (f0 + fw)[:, None])
    tmask = (ti >= t0[:, None]) & (ti < (t0 + tw)[:, None])
    mask = fmask[:, None, :, None] | tmask[:, None, None, :]
    return torch.where(mask, low.expand_as(out), out)


def supcon(emb: torch.Tensor, labels: torch.Tensor, tau=0.1) -> torch.Tensor:
    """Supervised contrastive loss: hits of a class close together in the embedding (which is
    what calibration's prototypes need, D112)."""
    sim = emb @ emb.T / tau
    n = len(emb)
    eye = torch.eye(n, dtype=torch.bool, device=emb.device)
    sim = sim.masked_fill(eye, -1e9)
    pos = (labels[:, None] == labels[None, :]) & ~eye
    logp = sim - torch.logsumexp(sim, dim=1, keepdim=True)
    count = pos.sum(1).clamp(min=1)
    return -(logp * pos).sum(1).div(count)[pos.any(1)].mean()
