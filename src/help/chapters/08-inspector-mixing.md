# Inspector, effects and mixing {#mixing}

## The Inspector

The [Inspector](panel:inspector) shows everything about the selected track:

- **Sample** (drum and audio tracks): the sound's name, waveform and details. Click the waveform to hear it once; drop a sample here to replace it. The buttons show it in the library and open it in the sample editor.
- **Instrument** (instrument tracks): the sound source, transpose and arpeggiator. See [Instrument tracks](#instruments).
- **Sound** and **Mix**: the same parameters as the encoder banks, all at once.
- **Effects**: the track's insert effects (below).
- **MIDI**: controllers mapped to this track's knobs, with a button to remove each one.

## Effects

Each track has a chain of **insert effects** that its sound goes through, in order. In the Inspector:

- **+ Add** adds an effect at the end of the chain.
- The power button switches an effect off (bypass) without removing it.
- The arrows move it up or down the chain; × removes it.
- Its knobs set the parameters. **Mix** blends the dry and the processed sound.

| Effect                                           | Does                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| **EQ3**                                          | Three-band equalizer (low, mid, high) with adjustable crossover points.    |
| **Filter**                                       | Low-pass, high-pass or band-pass filter with an LFO that moves the cutoff. |
| **Compressor**                                   | Evens out the level; Makeup brings it back up.                             |
| **Distortion**                                   | Saturation, from warm to fuzzy, with a tone control and output level.      |
| **Bitcrusher**                                   | Lo-fi: fewer bits.                                                         |
| **Delay**                                        | Echoes in time with the song (1/32 to 1/2 notes), optionally ping-pong.    |
| **Reverb**                                       | Room and hall reverb.                                                      |
| **Chorus**, **Phaser**, **Tremolo**, **AutoPan** | Movement and width.                                                        |
| **Limiter**                                      | Keeps peaks under a ceiling (part of the master chain).                    |

The **FX** encoder bank in the drum machine controls the same effects (◀ ▶ picks the effect).

## Sends: reverb and delay

Two shared effects, **Reverb** (send A) and **Delay** (send B), sit on **return buses**. A track's **Reverb** and **Delay** knobs (Mix bank, Inspector or mixer) set how much of it goes there. This is the usual way to put many tracks in the same space without running a reverb on each one.

## The mixer

The [Mixer](panel:mixer) has a channel strip per track, then the two return buses, then the master:

| On a strip            | What it does                                                               |
| --------------------- | -------------------------------------------------------------------------- |
| Name and color        | Click the strip to select the track.                                       |
| **FX** button         | The effect chain; click to edit it in a popup.                             |
| **Reverb**, **Delay** | Sends to the return buses (when the mixer is tall enough).                 |
| **Pan**               | Left/right position.                                                       |
| Fader                 | Volume. Drag; double-click for 0 dB. The meter next to it shows the level. |
| **M**, **S**          | Mute and solo.                                                             |

The **return** strips have their effect, a level fader and a mute. The **Master** strip has the master chain (EQ → compressor → limiter by default), the master volume and a stereo meter; **Scope** opens the Master scope.

## The master scope

The [Master scope](panel:master-scope) shows what you hear, after the master chain (without the metronome):

| Control      | What it does                                                            |
| ------------ | ----------------------------------------------------------------------- |
| **L/R**      | Left and right waveforms on top of each other.                          |
| **Mono**     | The sum of both channels.                                               |
| **X-Y**      | The stereo image: a vertical line is mono, a wide shape is wide stereo. |
| **Spectrum** | Frequencies, low to high.                                               |
| Time window  | How much time the waveform shows (5–180 ms).                            |
| Snowflake    | Freeze the picture.                                                     |
| **Trail**    | How long old traces stay visible.                                       |
| **Glow**     | Brightness.                                                             |
| RMS / Peak   | Loudness of the last moment, and the peak level, in dB.                 |

Each track also has its own small scope at the end of its row; click it for a bigger one with a spectrum view.
