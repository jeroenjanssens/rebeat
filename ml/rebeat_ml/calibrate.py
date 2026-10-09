"""
Calibration by prototypes (D112), the same math as the app's `library/beatbox/calibrate.ts`:
each class's prototype is the mean embedding of a voice's labeled hits; a hit's probabilities
blend the model's with a softmax over cosine similarity to the prototypes, by w = n / (n + K)
where n is the average number of examples per calibrated class.
"""

import numpy as np

TAU = 0.05
K = 4.0


def softmax(z, axis=-1):
    z = z - z.max(axis=axis, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=axis, keepdims=True)


def prototypes(emb: np.ndarray, labels: np.ndarray, n_classes: int):
    protos = np.zeros((n_classes, emb.shape[1]), dtype=np.float32)
    counts = np.zeros(n_classes, dtype=np.int64)
    for c in range(n_classes):
        sel = labels == c
        counts[c] = sel.sum()
        if counts[c]:
            p = emb[sel].mean(axis=0)
            protos[c] = p / (np.linalg.norm(p) + 1e-9)
    return protos, counts


def blend(logits, emb, protos, counts, tau=TAU, k=K):
    p_model = softmax(logits)
    have = counts > 0
    if not have.any():
        return p_model
    sim = emb @ protos.T
    sim[:, ~have] = -np.inf
    p_proto = softmax(sim / tau)
    p_proto[:, ~have] = 0
    n = counts[have].mean()
    w = n / (n + k)
    return (1 - w) * p_model + w * p_proto
