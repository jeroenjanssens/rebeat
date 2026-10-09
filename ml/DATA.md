# Datasets for the beatbox model

Every dataset the model can learn from, with its license and how it's used (PLAN.md D108).
`uv run python -m rebeat_ml.fetch` downloads them into `ml/data/raw/` (not committed), checked
by hash or pinned to a commit.

| Dataset | Source | License | Voices | Hits | Classes | Used for |
| --- | --- | --- | ---: | ---: | --- | --- |
| Amateur Vocal Percussion (AVP), Alejandro Delgado | [Zenodo 5036529](https://zenodo.org/records/5036529) | CC BY 4.0 | 28 | 9,777 | kick, snare, closed and open hi-hat | training (18 voices), validation (3), test (7) |
| beatboxset1, Dan Stowell (2008) | [archive.org/details/beatboxset1](https://archive.org/details/beatboxset1) | CC BY-SA 3.0 | 14 | 3,526 | kick, hi-hats, snares, breath, hum, speech, other | test only, unless `--with-bbs1` |
| beatbox-samples, Jeroen Janssens | [github.com/jeroenjanssens/beatbox-samples](https://github.com/jeroenjanssens/beatbox-samples) @ `4c22aae` | CC BY 4.0 | 1 | 43 one-shots | labeled by their strudel.json key | training; the loops and freestyle are test-only takes (D116) |
| Synthetic takes from beatbox-samples (`synth.py`) | made locally into `ml/data/synth/` | as beatbox-samples | 1 | ~2,600 in 150 takes | Jeroen's one-shot classes | training; 40 more takes of held-out recordings (`synth-test`) test his voice |
| Datasets exported from the Beatbox panel | `ml/data/exports/<name>/` (unzipped) | yours | any | any | the app's classes | training |

Notes:

- **beatboxset1 is ShareAlike.** Whether weights trained on it must be shared alike is unclear,
  so the shipped model doesn't train on it; it measures how the model does on experienced
  beatboxers with other microphones. Training with it (`--with-bbs1`) raised its held-out
  voices from 0.44 to 0.66 macro F1 (0.82 calibrated) in one run.
- Its annotation label `t` isn't documented (85 hits); those hits are dropped, but still end the
  hit before them (the gate).
- AVP's own annotations sit about 14 ms before the attack, beatboxset1's on it; every annotated
  hit is moved to the onset the app's detector finds (`data.py: aligned`), so the model sees the
  windows the app cuts.
- AVP-LVT (Zenodo 5578744, CC BY 4.0) adds annotations for 20 more voices of the LVT dataset,
  whose audio has to be requested separately; it isn't used yet.
- Tom, Clap and Crash have only a handful of examples (Jeroen's), so the model hardly knows them
  until you calibrate; the Model view in the panel says so.
- **Synthetic takes** (`uv run python -m rebeat_ml.synth`) turn Jeroen's one-shots into beats:
  random patterns at 80–145 BPM, every hit with its own velocity (0 to −14 dB), pitch (±1.5
  semitones) and timing, sounds ending where the next begins (as a voice does), sometimes a
  hummed bass or noise under them. One recording per class (`data.py: HELD_OUT`) stays out of
  them and of training; 40 takes made only of those are the test of Jeroen's voice in context.

Attribution for the shipped model (also in `model.json`): the Amateur Vocal Percussion dataset
by Alejandro Delgado (CC BY 4.0), and beatbox-samples
by Jeroen Janssens (CC BY 4.0).
