# Evaluation of `v1b`

Test voices are never trained on (splits by voice, D108). *Calibrated* uses 10 hits per class of the same voice as prototypes (D112) and scores the rest.

## avp: 2367 hits, 7 voices

- Accuracy 0.689; Kick/Snare/Closed hi-hat macro F1 0.766
- Calibrated: accuracy 0.736; core macro F1 0.802

Without calibration:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.88 | 0.90 | 0.89 | 674 |
| Snare | 0.69 | 0.67 | 0.68 | 597 |
| Closed hi-hat | 0.60 | 0.60 | 0.60 | 585 |
| Open hi-hat | 0.59 | 0.54 | 0.56 | 511 |
| Other | 0.00 | 0.00 | 0.00 | 0 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat | Other |
| --- | --- | --- | --- | --- | --- |
| Kick | 604 | 6 | 29 | 20 | 15 |
| Snare | 33 | 399 | 91 | 61 | 13 |
| Closed hi-hat | 46 | 72 | 352 | 108 | 7 |
| Open hi-hat | 6 | 104 | 116 | 275 | 10 |
| Other | 0 | 0 | 0 | 0 | 0 |

Calibrated:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.89 | 0.92 | 0.91 | 604 |
| Snare | 0.70 | 0.76 | 0.73 | 527 |
| Closed hi-hat | 0.66 | 0.62 | 0.64 | 515 |
| Open hi-hat | 0.63 | 0.59 | 0.61 | 441 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat |
| --- | --- | --- | --- | --- |
| Kick | 555 | 7 | 28 | 14 |
| Snare | 28 | 402 | 43 | 54 |
| Closed hi-hat | 30 | 81 | 317 | 87 |
| Open hi-hat | 8 | 81 | 91 | 261 |

## beatbox-samples: 6 hits, 1 voices

- Accuracy 0.667; Kick/Snare/Closed hi-hat macro F1 0.667

Without calibration:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 1.00 | 1.00 | 1.00 | 1 |
| Snare | 0.00 | 0.00 | 0.00 | 1 |
| Closed hi-hat | 1.00 | 1.00 | 1.00 | 1 |
| Open hi-hat | 0.00 | 0.00 | 0.00 | 0 |
| Tom | 1.00 | 1.00 | 1.00 | 1 |
| Crash | 0.00 | 0.00 | 0.00 | 1 |
| Other | 0.50 | 1.00 | 0.67 | 1 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat | Tom | Crash | Other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kick | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Snare | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| Closed hi-hat | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| Open hi-hat | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Tom | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| Crash | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| Other | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

## beatboxset1: 3526 hits, 14 voices

- Accuracy 0.406; Kick/Snare/Closed hi-hat macro F1 0.464
- Calibrated: accuracy 0.522; core macro F1 0.649

Without calibration:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.39 | 0.54 | 0.45 | 627 |
| Snare | 0.51 | 0.27 | 0.36 | 703 |
| Closed hi-hat | 0.38 | 0.36 | 0.37 | 882 |
| Open hi-hat | 0.18 | 0.16 | 0.17 | 105 |
| Tom | 0.00 | 0.00 | 0.00 | 0 |
| Clap | 0.00 | 0.00 | 0.00 | 0 |
| Crash | 0.00 | 0.00 | 0.00 | 0 |
| Other | 0.42 | 0.47 | 0.44 | 1209 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat | Tom | Clap | Crash | Other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kick | 337 | 23 | 37 | 2 | 0 | 0 | 0 | 228 |
| Snare | 148 | 193 | 230 | 30 | 2 | 1 | 1 | 98 |
| Closed hi-hat | 111 | 32 | 318 | 5 | 0 | 0 | 0 | 416 |
| Open hi-hat | 12 | 8 | 29 | 17 | 0 | 0 | 0 | 39 |
| Tom | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Clap | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Crash | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Other | 254 | 123 | 222 | 42 | 0 | 2 | 0 | 566 |

Calibrated:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.46 | 0.62 | 0.53 | 499 |
| Snare | 0.69 | 0.59 | 0.64 | 563 |
| Closed hi-hat | 0.53 | 0.50 | 0.51 | 742 |
| Open hi-hat | 0.06 | 0.15 | 0.09 | 39 |
| Other | 0.53 | 0.47 | 0.50 | 1081 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat | Other |
| --- | --- | --- | --- | --- | --- |
| Kick | 311 | 31 | 24 | 1 | 132 |
| Snare | 60 | 332 | 73 | 16 | 82 |
| Closed hi-hat | 103 | 29 | 371 | 10 | 229 |
| Open hi-hat | 7 | 2 | 12 | 6 | 12 |
| Other | 202 | 85 | 224 | 64 | 506 |

## synth-test: 768 hits, 1 voices

- Accuracy 0.720; Kick/Snare/Closed hi-hat macro F1 0.615
- Calibrated: accuracy 0.915; core macro F1 0.920

Without calibration:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.58 | 0.98 | 0.73 | 198 |
| Snare | 0.49 | 0.09 | 0.15 | 207 |
| Closed hi-hat | 1.00 | 0.94 | 0.97 | 332 |
| Tom | 1.00 | 0.90 | 0.95 | 21 |
| Other | 0.15 | 1.00 | 0.27 | 10 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Tom | Other |
| --- | --- | --- | --- | --- | --- |
| Kick | 195 | 0 | 0 | 0 | 3 |
| Snare | 140 | 18 | 0 | 0 | 49 |
| Closed hi-hat | 1 | 19 | 311 | 0 | 1 |
| Tom | 0 | 0 | 0 | 19 | 2 |
| Other | 0 | 0 | 0 | 0 | 10 |

Calibrated:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.89 | 0.98 | 0.93 | 188 |
| Snare | 0.96 | 0.74 | 0.84 | 197 |
| Closed hi-hat | 1.00 | 0.98 | 0.99 | 322 |
| Tom | 1.00 | 0.91 | 0.95 | 11 |
| Other | 0.00 | 0.00 | 0.00 | 0 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Tom | Other |
| --- | --- | --- | --- | --- | --- |
| Kick | 184 | 2 | 0 | 0 | 2 |
| Snare | 23 | 146 | 0 | 0 | 28 |
| Closed hi-hat | 0 | 4 | 317 | 0 | 1 |
| Tom | 0 | 0 | 0 | 10 | 1 |
| Other | 0 | 0 | 0 | 0 | 0 |
