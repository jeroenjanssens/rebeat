# Plan: pad colors after a press, the piano on the keys, the library in the Keys menu, Auto, 26 new synths, a synth wizard

Status: agreed 2026-10-12 (Jeroen: "go with all the defaults and just start implementing"),
decisions D162–D170. How we work: on `main`, commit early and often, e2e once at the end.

## 1. The MiniLab's pads go orange after a press (D165)

What happens: the MiniLab lights a pad itself while it's pressed (its own hit color) and leaves
it that way, so after a press it no longer shows the color Rebeat sent (D144).

Fix (`audio-io/controllers/minilab3.ts`): when a pad is released (a pad's note-off, or its CC at
0, D147), send that pad's color again shortly after (40 ms, then once more at 250 ms: the device
may repaint after the release), and repaint all pads after Shift is let go (as now). Not while
Shift is held. A pad pressed in the picture doesn't touch the device.

## 2. The keys play the Grand Piano by default (D166)

- The keys' target (D126) starts as **the library's Grand Piano** (`smplr:piano`), not "follow
  the selected track" (which played the first track, usually the kick).
- What you pick is **remembered** (`settings.keysTarget`), so the next session starts with it.
- The piano streams its samples on first use: the Keys channel is made when the app starts with a
  sound target, so it's loading (the chip says "Loading…") before the first key.
- e2e tests start with "follow the selected track" (their fixtures), plus one test for the
  default.

## 3. The library in the Keys menu (D167)

The Keys drop-down (top bar and Controller panel, `app/KeysChip.tsx`) gets a **Library ▸** entry:
it opens the library's top categories (as in the Library panel: Synths, General MIDI, Pianos &
keys, Orchestral, Mallets, Double bass, Your sounds, Samples), each opening its sounds (grouped
by their group, "← Back" at the top). Picking one puts it on the keys (as a library sound, D126).
The menu scrolls when a list is long (General MIDI's 128).

## 4. Auto (D162–D164)

As planned in `PLAN-suggestions.md` §3c: the progression plays itself, every 1–8 patterns (or
bars), Loop, armed with Play (after the count-in), melody keys, passing chords on pads 2–8, Free
follows the best suggestion, recording, Fit the page, and song mode across pages (the right page
for every note, Add pages, Make copies, Unroll, Spread over pages).

## 5. 26 new factory synths (D168)

More variety, in the style of well-known sounds (ids stable, house style `voiced()`, loudness
about −21 dB RMS checked by `synthLevels.test.ts`, autoMacros at rest unchanged):

| Group          | New                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Bass           | Lately Bass (TX81Z FM), Synthwave Bass (pulsing saws), Deep House Bass, Garage Bass, Neuro Bass (FM growl), Juno Sub (square + sub)  |
| Leads          | G-Funk Whistle (sine glide), Sync Lead (hard sync), Lucky Man Lead (Moog glide), EDM Saw Lead, Talk Box Lead (formant), Odyssey Lead |
| Pads           | OB Pad (Oberheim), CS-80 Pad (Blade Runner), Choir Pad, Sweep Pad, Solina Strings, Lo-fi Pad                                         |
| Keys           | Wurli (FM), 80s Poly Stab (Prophet), Music Box, Kalimba (FM)                                                                         |
| Plucks & stabs | Future Bass Chord, Marimba (FM), Steel Drum (FM)                                                                                     |
| FX             | Ocean Wind (noise), UFO (ring mod)                                                                                                   |

## 6. The synth wizard (D169–D170)

A noob-friendly way to a new synth: a dialog with one plain question per step (a decision tree:
later questions depend on earlier answers), each answer a short sentence, **Back** and **Next**,
a **▶ Try it** button that plays the sound so far, and at the end a name. It makes a patch
(`model/synthWizard.ts: wizardPatch(answers)`, pure, through `makePatch`), saves it as a new
**Your sounds** synth, puts it on the keys and opens it in the synth editor's **Advanced** view, so
every setting the wizard chose can be seen and changed.

The questions (a choice each; `→` skips or changes later ones):

1. **What is it for?** Bass · Lead (a melody) · Pad (a long background) · Keys (chords you play) ·
   Pluck (short notes, arpeggios) · Sound effect.
2. **How does a note start?** At once (punchy) · Softly (a quick fade in) · Slowly (it swells in).
   (FX: Rising · Falling · Steady.)
3. **And then?** It holds while the key is down · It fades out by itself (like a piano) · It's
   short and percussive (like a pluck). Pads skip to "holds"; plucks to "short".
4. **The tone?** Warm and round · Bright and buzzy · Hollow (like a clarinet) · Glassy and
   bell-like (FM) · Thin and nasal (a pulse).
5. **Clean or dirty?** Clean · A little grit · Distorted.
6. **Should it move?** Still · A slow wobble in its tone · Pulsing with the beat · Vibrato (the
   pitch wavers) · A wah when you play (a filter sweep on each note).
7. **How wide?** One voice (focused) · A few voices, slightly detuned (chorus-like) · A big wall
   of detuned voices (supersaw). (Bass: and a sub an octave down? Yes · No.)
8. **One note or chords?** Chords (several notes at once) · One note at a time · One at a time,
   gliding between notes. (Bass and Lead default to one note; Pad and Keys to chords.)
9. **Anything extra?** None · Air (some noise, breathy) · An octave on top · A fifth on top.
10. **Name it** (a suggestion from the answers: "Bright Gritty Lead").

How answers become settings (`wizardPatch`), in short: the role sets the octave, the filter's
range and the voice mode; the start sets the amp attack; "and then" sets decay/sustain/release;
the tone sets the oscillator shapes (sine/triangle warm, saw bright, square hollow, pulse nasal,
FM 2>1 or 3>1 with a ratio for glassy); grit and distortion the drive (and a little resonance);
movement an LFO on the cutoff (free or synced), the pitch (vibrato) or the filter envelope; width
the unison voices, detune and stereo width; the sub oscillator for bass; extras the noise level or
a second oscillator an octave or a fifth up. Loudness is set so wizard synths sit near the factory
ones (the same −21 dB RMS target, from a few rendered notes in a test).

Entry points: the Library's Synths location ("New synth (wizard)…"), the synth editor's toolbar,
the command palette ("Synth: new with the wizard").

## 7. Build order

| Step | What                                                      | Decisions |
| ---- | --------------------------------------------------------- | --------- |
| 1    | Pad colors after a press                                  | D165      |
| 2    | The piano by default, the target remembered               | D166      |
| 3    | The library in the Keys menu                              | D167      |
| 4    | Auto (PLAN-suggestions §3c)                               | D162–D164 |
| 5    | 26 synths (a background agent, `library/synths.ts` only)  | D168      |
| 6    | The wizard: `model/synthWizard.ts` (an agent), the dialog | D169–D170 |
| 7    | Guide, hints, PLAN.md, AGENTS.md; e2e at the end          | —         |
