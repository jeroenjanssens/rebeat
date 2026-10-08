# Performance, MIDI and controllers {#performance}

## The Performance panel

The [Performance](panel:performance) panel puts everything for playing live in one place (try the **Perform** layout, {{key:layout.perform}}).

| Section               | Controls                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pads**              | Big pads for the drum and instrument tracks. Higher on a pad is louder. They record into the pattern while recording.                                                                                                                                                                                    |
| **Pages**             | One button per page: click to queue it (or start from it when stopped). The playing page is lit; the queued page pulses.                                                                                                                                                                                 |
| **Mutes**             | A big button per track: click to mute, **Shift+click** to solo. **Right-click** to put the track on side A or B of the crossfader.                                                                                                                                                                       |
| Mute groups           | **Group 1–4**: right-click to choose its tracks, click to mute or unmute them all at once. **Queue to bar** makes mute changes wait for the next bar.                                                                                                                                                    |
| **Scratch**           | A platter for an audio track (choose which one at the top). Drag around it to scratch; **Cut** silences while held; **Sync / Keep pos** decides whether the record snaps back to the beat when you let go or carries on from where you left it. Right-click the platter to map a MIDI jog wheel.         |
| **Master FX**         | **Filter**: turn left for a low-pass, right for a high-pass sweep on the whole mix; the middle is open. **Rpt 1/4 … 1/32**: beat repeat while held. **Throw verb / Throw delay**: send everything into the reverb or the delay while held. **Tape stop**: slow down to a halt like a stopping turntable. |
| Crossfader            | Fades between the tracks on side A and side B (other tracks aren't affected). Double-click to center.                                                                                                                                                                                                    |
| **Tap**, **−**, **+** | Tap tempo and nudge the tempo by 1 BPM.                                                                                                                                                                                                                                                                  |

## MIDI

Rebeat works with MIDI keyboards, pads and controllers (in Chrome and Edge).

- Turn it on in **Settings → MIDI → Enable MIDI**, and choose which inputs to use.
- **Notes** play the selected instrument track, sounding for as long as you hold the key. On drum tracks, notes from 36 (C1) upwards play pads 1, 2, 3…, as on most pad controllers. They record like pad hits.
- **Pitch bend**, the **mod wheel** (CC 1) and **aftertouch** (channel or per-key pressure) reach the selected synth track: bend moves the pitch by the synth's **Bend** range, and the mod wheel and aftertouch are sources in its mod matrix (vibrato on the mod wheel, say).
- The **sustain pedal** (CC 64) keeps released notes sounding until the pedal comes up.

### MIDI learn {#midi}

Right-click any knob (in the drum machine, the Inspector, the mixer or the Performance panel) → **MIDI learn**, then move a control on your device. The knob follows that control from then on; Esc cancels. Learned mappings are saved with the project and listed in **Settings → MIDI** and in the Inspector, where you can remove them.

## Launchpad and Push

In **Settings → MIDI**, **Connect Launchpad / Push** turns a Novation Launchpad (Mini MK3, X, Pro MK3) or an Ableton Push 2/3 into a step sequencer for the drum machine:

- The 8×8 pads show 8 tracks × 8 steps in the track colors; the playing step is highlighted.
- Press a pad to turn a step on or off.
- The arrow buttons scroll to other tracks and steps; the play button starts and stops.
- On Push, the eight encoders turn the selected track's sound parameters.

Rebeat asks for MIDI access with "system exclusive" messages for this; it's needed to light the pads.
