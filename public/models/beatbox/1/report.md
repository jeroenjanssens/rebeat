# Evaluation of `v1`

Test voices are never trained on (splits by voice, D108). *Calibrated* uses 10 hits per class of the same voice as prototypes (D112) and scores the rest.

## avp: 2367 hits, 7 voices

- Accuracy 0.681; Kick/Snare/Closed hi-hat macro F1 0.759
- Calibrated: accuracy 0.735; core macro F1 0.813

Without calibration:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.89 | 0.89 | 0.89 | 674 |
| Snare | 0.71 | 0.65 | 0.68 | 597 |
| Closed hi-hat | 0.59 | 0.56 | 0.58 | 585 |
| Open hi-hat | 0.53 | 0.57 | 0.55 | 511 |
| Other | 0.00 | 0.00 | 0.00 | 0 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat | Other |
| --- | --- | --- | --- | --- | --- |
| Kick | 602 | 6 | 26 | 26 | 14 |
| Snare | 27 | 388 | 89 | 80 | 13 |
| Closed hi-hat | 41 | 59 | 330 | 152 | 3 |
| Open hi-hat | 5 | 95 | 116 | 291 | 4 |
| Other | 0 | 0 | 0 | 0 | 0 |

Calibrated:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.91 | 0.93 | 0.92 | 604 |
| Snare | 0.72 | 0.75 | 0.73 | 527 |
| Closed hi-hat | 0.66 | 0.63 | 0.65 | 515 |
| Open hi-hat | 0.58 | 0.57 | 0.58 | 441 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat |
| --- | --- | --- | --- | --- |
| Kick | 561 | 5 | 26 | 12 |
| Snare | 24 | 393 | 42 | 68 |
| Closed hi-hat | 21 | 66 | 327 | 101 |
| Open hi-hat | 8 | 82 | 99 | 252 |

## beatboxset1: 3526 hits, 14 voices

- Accuracy 0.361; Kick/Snare/Closed hi-hat macro F1 0.457
- Calibrated: accuracy 0.488; core macro F1 0.668

Without calibration:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.31 | 0.84 | 0.45 | 627 |
| Snare | 0.44 | 0.19 | 0.26 | 703 |
| Closed hi-hat | 0.47 | 0.38 | 0.42 | 882 |
| Open hi-hat | 0.06 | 0.18 | 0.08 | 105 |
| Tom | 0.00 | 0.00 | 0.00 | 0 |
| Clap | 0.00 | 0.00 | 0.00 | 0 |
| Crash | 0.00 | 0.00 | 0.00 | 0 |
| Other | 0.55 | 0.22 | 0.31 | 1209 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat | Tom | Clap | Crash | Other |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kick | 525 | 6 | 13 | 15 | 0 | 0 | 0 | 68 |
| Snare | 201 | 131 | 157 | 169 | 1 | 3 | 0 | 41 |
| Closed hi-hat | 409 | 46 | 333 | 13 | 0 | 1 | 0 | 80 |
| Open hi-hat | 27 | 11 | 22 | 19 | 0 | 0 | 0 | 26 |
| Tom | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Clap | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Crash | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Other | 524 | 102 | 186 | 128 | 0 | 4 | 1 | 264 |

Calibrated:

| class | precision | recall | F1 | hits |
| --- | ---: | ---: | ---: | ---: |
| Kick | 0.39 | 0.87 | 0.54 | 499 |
| Snare | 0.68 | 0.54 | 0.60 | 563 |
| Closed hi-hat | 0.51 | 0.54 | 0.53 | 742 |
| Open hi-hat | 0.13 | 0.67 | 0.21 | 39 |
| Other | 0.67 | 0.25 | 0.36 | 1081 |

| truth \ predicted | Kick | Snare | Closed hi-hat | Open hi-hat | Other |
| --- | --- | --- | --- | --- | --- |
| Kick | 432 | 7 | 9 | 15 | 36 |
| Snare | 71 | 305 | 111 | 33 | 43 |
| Closed hi-hat | 225 | 40 | 398 | 27 | 52 |
| Open hi-hat | 8 | 3 | 2 | 26 | 0 |
| Other | 365 | 93 | 254 | 104 | 265 |
