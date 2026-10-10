# Performance, MIDI and controllers {#performance}

## The Performance panel

The [Performance](panel:performance) panel puts everything for playing live in one place (try the **Perform** layout, {{key:layout.perform}}).

| Section               | Controls                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pads**              | Big pads for the step tracks that play hits or notes. Higher on a pad is louder. They record into the pattern while recording.                                                                                                                                                                           |
| **Pages**             | One button per page: click to queue it (or start from it when stopped). The playing page is lit; the queued page pulses.                                                                                                                                                                                 |
| **Mutes**             | A big button per track: click to mute, **Shift+click** to solo. **Right-click** to put the track on side A or B of the crossfader.                                                                                                                                                                       |
| Mute groups           | **Group 1–4**: right-click to choose its tracks, click to mute or unmute them all at once. **Queue to bar** makes mute changes wait for the next bar.                                                                                                                                                    |
| **Scratch**           | A platter for a Clip track (choose which one at the top). Drag around it to scratch; **Cut** silences while held; **Sync / Keep pos** decides whether the record snaps back to the beat when you let go or carries on from where you left it. Right-click the platter to map a MIDI jog wheel.           |
| **Master FX**         | **Filter**: turn left for a low-pass, right for a high-pass sweep on the whole mix; the middle is open. **Rpt 1/4 … 1/32**: beat repeat while held. **Throw verb / Throw delay**: send everything into the reverb or the delay while held. **Tape stop**: slow down to a halt like a stopping turntable. |
| Crossfader            | Fades between the tracks on side A and side B (other tracks aren't affected). Double-click to center.                                                                                                                                                                                                    |
| **Tap**, **−**, **+** | Tap tempo and nudge the tempo by 1 BPM.                                                                                                                                                                                                                                                                  |

## MIDI

Rebeat works with MIDI keyboards, pads and controllers (in Chrome and Edge, and in the desktop app; Safari has no Web MIDI).

- Turn it on in **Settings → MIDI → Enable MIDI**, and choose which inputs to use. Controllers that plug in over USB need no driver.
- **Keys** play the selected Notes track, sounding for as long as you hold the key. They record like pad hits.
- **Pads**: notes on the **pads channel** (Settings → MIDI, channel 10 by default, which pad controllers use) always play step tracks by position: note 36 (C1) plays track 1, 37 track 2, up to 51 for track 16. Other channels play the selected Notes track; with no Notes track selected they play tracks by position too.
- **Pitch bend**, the **mod wheel** (CC 1) and **aftertouch** (channel or per-key pressure) reach the synth of the selected track: bend moves the pitch by the synth's **Bend** range, and the mod wheel and aftertouch are sources in its mod matrix (vibrato on the mod wheel, say).
- The **sustain pedal** (CC 64) keeps released notes sounding until the pedal comes up.
- **MIDI Start and Stop** (from a controller's Play button, or another app) play and stop Rebeat, unless you switch **Follow MIDI Start/Stop** off.

### MIDI learn {#midi}

Right-click a knob or a fader → **MIDI learn**, then move a control on your device; Esc cancels. Rebeat notices how the control sends values: **absolute** (a position, most knobs and faders) or **relative** (steps, from endless encoders), and you can change it in Settings → MIDI if a knob jumps or barely moves.

A learned control is saved in one of two places:

- **In this project**: for one track's knob (the Inspector, the synth editor, the Performance panel). These are saved with the project.
- **In every project**: for your controller. The encoder strip's knobs and the mixer's faders offer both: _MIDI learn: Selected track · SOUND knob 3 (every project)_ follows whichever track you select, so the same knob on your controller turns the third SOUND knob of the kick, then of the bass. Faders can be _Track 2 · Level_, a bus or the master.

**Buttons** run commands: in the **Shortcuts** dialog ({{key:app.shortcuts}}), click **MIDI** next to a command and press a button or pad on your controller (Play / stop, Record, Metronome, Next page, Select the next track, Fill…). Right-clicking the transport bar's Play, Rec, Tap, Click and Loop/Song buttons does the same. Held commands (Fill) last while you hold the button.

Settings → MIDI lists both kinds of mappings, where you can change a control's mode or remove it. Mappings in this project win over the ones in every project.

## Your controller {#performance-your-controller}

**Settings → MIDI → Controller** has maps for some controllers: what their knobs, faders and pads do, in every project. Rebeat recognizes them when they're connected and offers their map.

- The **knobs** turn the selected track's **SOUND knobs 1–8** (the encoder strip's knobs, whatever the track plays: a sample's Tune and Decay, a synth's macros). Select another track and the knobs follow; **Select the next / previous track** are commands you can put on buttons.
- The **faders** (if it has them) are the selected track's level, its Reverb and Delay sends, and the master level.
- The **pads** play tracks 1–16 on channel 10.
- **Learn** next to a slot teaches it another control; **Learn every control** walks through all of them ("move knob 1… now knob 2…"). Use it when your controller is set up differently, or has no factory assignment.
- **Pick up** (off by default) makes absolute knobs and faders take over only when they reach the value on screen, so nothing jumps when you select another track. **Relative knobs** sets how far one step of an endless encoder turns a knob.
- **Mackie Control**: inputs named MCU (or ones you tick) run the transport: Play, Stop, Record, Cycle (loop or song), rewind and forward (pages), the jog wheel.
- The **Monitor** at the bottom lists the last messages and what Rebeat did with each: the first place to look when something doesn't respond.

| Controller                      | Knobs                                                                                     | Pads                                                | Transport                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| **Arturia MiniLab 3**           | ARTURIA mode (Shift + Pad 3): CC 74, 71, 76, 77, 93, 18, 19, 16; faders CC 82, 83, 85, 17 | channel 10, bank A tracks 1–8, bank B 9–16          | DAW mode, Shift + Pads 5–7 (its MCU port)                 |
| **Akai MPK Mini MK3**           | factory program: CC 70–77 (not confirmed: learn them if they don't respond)               | channel 10, banks A and B                           | none on the device; learn buttons if you map pads to them |
| **Novation Launchkey Mini MK3** | CC 21–28                                                                                  | Drum mode, channel 10, notes 36–51                  | only in DAW mode: learn them                              |
| **Novation Launchkey Mini MK4** | no factory assignment: **Learn every control**                                            | Drum mode, channel 10, bottom row 1–8, top row 9–16 | Play sends MIDI Start, Shift + Play Stop                  |

A keyboard or chord instrument without knobs (such as the Telepathic Instruments **Orchid**) needs no map: its notes play the selected Notes track, chords and all, and its Start/Stop (if it sends them) play and stop Rebeat. Choose **Custom** to build a map for any other controller from scratch.

## Launchpad and Push

In **Settings → MIDI**, **Connect Launchpad / Push** turns a Novation Launchpad (Mini MK3, X, Pro MK3) or an Ableton Push 2/3 into a step sequencer for the drum machine:

- The 8×8 pads show 8 tracks × 8 steps in the track colors; the playing step is highlighted.
- Press a pad to turn a step on or off.
- The arrow buttons scroll to other tracks and steps; the play button starts and stops.
- On Push, the eight encoders turn the selected track's sound parameters.

Rebeat asks for MIDI access with "system exclusive" messages for this; it's needed to light the pads.
