import numpy as np

from rebeat_ml.data import HELD_OUT
from rebeat_ml.synth import make_take, pool


def test_takes_are_repeatable_and_labeled():
    sounds = pool()
    a, hits_a, bpm_a = make_take(np.random.default_rng(3), sounds)
    b, hits_b, bpm_b = make_take(np.random.default_rng(3), sounds)
    assert np.array_equal(a, b) and hits_a == hits_b and bpm_a == bpm_b
    assert 80 <= bpm_a <= 145
    assert hits_a and all(c in sounds for _, c in hits_a)
    times = [t for t, _ in hits_a]
    assert times == sorted(times) and np.abs(a).max() <= 1


def test_held_out_recordings_stay_out_of_the_training_pool():
    train = {name for items in pool().values() for _, name in items}
    held = {name for items in pool(held_out=True).values() for _, name in items}
    assert not train & held
    assert held == HELD_OUT
