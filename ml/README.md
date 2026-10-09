# Rebeat's beatbox model

Training the hit classifier behind the Beatbox panel (PLAN.md §0.6h, D105–D116). Python via
[uv](https://docs.astral.sh/uv/) (never pip). The datasets are in [DATA.md](DATA.md).

```sh
just ml-fetch                 # download the datasets (~330 MB) into ml/data/raw
just ml-train v2 --epochs 60 --final   # train runs/v2 and write runs/v2/report.md
just ml-export v2 2           # ship it as public/models/beatbox/2 (+ the app's parity fixtures)
just ml-test                  # the Python tests
```

Then set `MODEL_VERSION` in `src/library/beatbox/modelInfo.ts` and run the app's checks: the
parity tests compare ONNX Runtime Web's outputs with PyTorch's, and the app's onset detector and
windows with the Python port's.

## How it works

- **A hit** is an onset in a recording with a label and a voice (`data.py`). Every dataset is
  read into hits; annotated onsets move to where the app's detector (`onsets.py`, a port of
  `src/library/beatbox/onsets.ts`) finds them.
- **The window** is 200 ms of 16 kHz mono audio from 20 ms before the onset, silenced from the
  next hit on with a 5 ms fade (`windows.py: gate`), as the app cuts it.
- **The model** (`model.py`): a log-mel front end inside the graph (`frontend.py`: the STFT is a
  convolution with a fixed DFT basis, so it exports to plain ONNX), a 4-block CNN, a 64-d
  embedding and 8 class scores. Trained with cross entropy plus a supervised contrastive loss
  on the embedding (it's what calibration compares), SpecAugment, class-balanced sampling and
  augmentation: pitch ±2 semitones, EQ tilt, low-pass (dull recordings), bass boost
  (proximity), rooms, hum, noise, onset jitter.
- **Splits are by voice**: nobody is in both training and test. `--final` trains on training
  and validation voices; the test voices stay out.
- **Calibration** (`calibrate.py`, the same math as `calibrate.ts`): prototypes per class from a
  voice's own labeled hits, blended with the model's scores. `tune.py` picks tau and K on the
  validation voices.
- **Export** (`export.py`) writes `model.onnx`, `model.json` (classes, window, calibration,
  credits, the evaluation) and `report.md`, checks ONNX against PyTorch, and writes the parity
  fixtures for the app's tests.

## Model 1 (2026-10-09)

Kick / Snare / Closed hi-hat macro F1 on voices it never heard (`public/models/beatbox/1/report.md`):

| Test voices | Model alone | Calibrated (10 hits per class) |
| --- | ---: | ---: |
| AVP, 7 amateurs | 0.76 | 0.81 |
| beatboxset1, 14 beatboxers | 0.46 | 0.67 |

The go/no-go target (D116: 0.85 on unseen voices) isn't met: there are only 18 training voices,
all amateurs on one laptop microphone. What closes the gap is more voices: your own labeled
recordings (calibration, then exported into training) and, if its license is acceptable,
beatboxset1.
