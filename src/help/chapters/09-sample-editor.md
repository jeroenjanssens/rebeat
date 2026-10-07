# The sample editor {#sample-editor}

Double-click a sample in the library (or use the pencil button in the Inspector) to open it in the [sample editor](panel:sample-editor). Each sample gets its own tab.

## The toolbar

| Control                | What it does                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, length, usage    | Which sample this is, and how many tracks in this project use it.                                                                                 |
| ▶ / ■                  | Play (Space). With a selection, it plays the selection as it is; otherwise the whole sample with all its settings.                                |
| Loop button            | Loop the playback.                                                                                                                                |
| **Wave / Spectrogram** | Show the waveform or the frequencies over time.                                                                                                   |
| Undo / Redo            | The editor's own history (also Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z while the editor has focus).                                                       |
| **Save as new**        | Render everything into a new sample and leave this one unchanged.                                                                                 |
| **Apply**              | Store your changes on this sample. Every track that uses it, in every project, gets the new sound; the button says how many tracks that are here. |

## On the waveform

- The light region is the **trim**: drag its edges to set where the sample starts and ends. **Snap to zero** moves trim points to the nearest zero crossing, to avoid clicks.
- The yellow regions at the ends are the **fades**; drag their inner edge.
- Drag on the waveform to **select** a part (Esc deselects).
- **Scroll** to zoom in and out.
- Orange lines are **slice markers**; drag them to adjust.
- The purple region is the **loop** (when loop points are on).
- The yellow line is the **volume envelope** (when it's on): drag its points, double-click to add one.

## The tabs

| Tab          | What's there                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Edit**     | Snap to zero; **Fade in** / **Fade out** with their curve (linear, exp, log, S-curve); **Gain**; **Normalize**; **Reverse**; **Remove DC** (offset); **Reset trim**; **Strip silence** (removes quiet gaps). For the selection: **Cut**, **Copy**, **Paste**, **Silence**, **Crop**, and **Trim to selection**. Ctrl/Cmd+X / C / V and Delete work too. |
| **Envelope** | An **AHDSR envelope** (attack, hold, decay, sustain, release) and a freely drawn **volume envelope**.                                                                                                                                                                                                                                                   |
| **Tune**     | **Semitones** and **Cents**; **Keep length** changes the pitch without changing the length. **Stretch** makes the sound longer or shorter without changing the pitch; **Stretch to BPM** fits a loop to a tempo. **Render** writes the stretch into the audio.                                                                                          |
| **Loop**     | **Loop points** for sustained sounds, with a **Crossfade** so the loop joins smoothly. **Loop the selection** uses the selection.                                                                                                                                                                                                                       |
| **Slice**    | Cut the sample into slices: **By transients** (at each hit, with a **Sensitivity**), **Equal grid** (a number of equal parts), or **Add marker** at the start of the selection. **Slices to new drum tracks** saves each slice as a sample, adds a drum track for each, and writes a pattern that plays them in the original rhythm.                    |
| **FX**       | Add effects, **Preview** how it sounds, and **Render into the sample**.                                                                                                                                                                                                                                                                                 |
| **Analyze**  | Tempo, key, peak, RMS and loudness (LUFS). **Store tempo** saves the detected tempo with the sample.                                                                                                                                                                                                                                                    |

Fades, gain, normalize, reverse, envelopes, tuning, stretch and loop points are **settings**: they don't change the recording itself, and you can change them again later. Cut, paste, silence, crop, strip silence and rendered effects change the audio; Apply stores the new audio in place of the old.
