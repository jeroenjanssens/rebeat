/**
 * Explain-mode hints for all param.* and fx.* ids.
 *
 * IDs follow the scheme in src/model/params.ts:
 *   param.<group>.<id>   — sound, mix, or step encoder params
 *   fx.<EffectType>      — effect header (used in EffectEditor)
 *   fx.<EffectType>.<id> — individual effect parameter
 */
import type { Hints } from "./types";

const hints: Hints = {
  // ─── Sound params (drum) ──────────────────────────────────────────────────
  // prefix: "sound", used as track.params["sound.<id>"]

  "param.sound.tune": {
    title: "Tune",
    text: "Shifts the pitch of the sound up or down by up to 24 semitones. Use it to tune a drum to a key or to detune a sample for effect.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "param.sound.decay": {
    title: "Decay",
    text: "How long each hit of the sample plays before it fades out — 'Full' plays it to the end.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-sound-sources",
  },
  "param.sound.start": {
    title: "Start",
    text: "Sets where in the sample playback begins. Drag it up to skip a silent intro or find a better hit point.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "param.sound.cutoff": {
    title: "Cutoff",
    text: "Low-pass filter cutoff frequency. Turning it down removes high frequencies, making the sound darker and more muffled.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "param.sound.reso": {
    title: "Reso",
    text: "Filter resonance. Increases the emphasis around the cutoff frequency, adding a nasal or whistling quality.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "param.sound.drive": {
    title: "Drive",
    text: "Adds soft saturation to the sound. A little adds warmth; higher values crunch and distort.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "param.sound.choke": {
    title: "Choke",
    text: "Assigns this sound to a choke group (1–8). Sounds in the same group cut each other off when they play, like an open and closed hi-hat.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },
  "param.sound.gain": {
    title: "Gain",
    text: "Trims the level of this sound by up to ±12 dB, before the mix fader. Useful for balancing sounds within a kit.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-the-display-and-the-eight-encoders",
  },

  // ─── Sound params (instrument, additional / different meanings) ───────────

  "param.sound.macro": {
    title: "Macro",
    text: "On synth tracks the SOUND knobs are the synth's 8 macros: each moves a few of its settings at once (Brightness, Bite, Attack…). Name them and choose what they move in the synth editor (Advanced → Macros). Lock them per step and map them to MIDI like any knob.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-macros",
  },
  "param.sound.envDecay": {
    title: "Decay",
    text: "How quickly each note falls from its peak to the sustain level after the attack.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-sound-sources",
  },
  "param.sound.attack": {
    title: "Attack",
    text: "How long the sound takes to ramp up to full volume after a note starts. Short = snappy; long = slow fade-in.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-sound-sources",
  },
  "param.sound.sustain": {
    title: "Sustain",
    text: "The level the sound holds at while a note is held, after the attack and decay phases. Lower values give a more plucked feel.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-sound-sources",
  },
  "param.sound.release": {
    title: "Release",
    text: "How long the sound fades out after the note ends. Longer release values leave a tail.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-sound-sources",
  },
  "param.sound.glide": {
    title: "Glide",
    text: "Portamento time — how long the pitch takes to slide from one note to the next. 0 ms = instant; higher values create a smooth slide.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-sound-sources",
  },
  "param.sound.detune": {
    title: "Detune",
    text: "Spreads the synthesizer voices slightly in pitch for a thicker, chorus-like sound (±1 semitone).",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "instruments-sound-sources",
  },

  // ─── Sound params (audio track, additional / different meanings) ──────────

  "param.sound.pitch": {
    title: "Pitch",
    text: "Transposes the audio clip up or down by up to ±12 semitones without changing the tempo.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-audio-tracks",
  },
  "param.sound.warp": {
    title: "Warp",
    text: "When on, time-stretches the loop to match the song tempo so it stays in sync as you change the BPM.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-audio-tracks",
  },
  "param.sound.fadein": {
    title: "Fade in",
    text: "Volume ramp at the very start of the clip. Avoids clicks and softens the entry.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-audio-tracks",
  },
  "param.sound.fadeout": {
    title: "Fade out",
    text: "Volume ramp at the very end of the clip. Smooths out a hard stop.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "drum-machine-audio-tracks",
  },

  // ─── Mix params ───────────────────────────────────────────────────────────
  // prefix: "mix", used as track.params["mix.<id>"] (except volume → track.volume)

  "param.mix.volume": {
    title: "Level",
    text: "The track's output volume. Turn it down to bring a track back in the mix, or up if it's too quiet.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-the-inspector",
  },
  "param.mix.pan": {
    title: "Pan",
    text: "Left/right position in the stereo field. C = center; drag right for right, left for left.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-the-inspector",
  },
  "param.mix.sendA": {
    title: "Reverb",
    text: "How much of this track goes to the shared reverb return bus. Adding reverb to several tracks at the same amount puts them in the same space.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-sends-reverb-and-delay",
  },
  "param.mix.sendB": {
    title: "Delay",
    text: "How much of this track goes to the shared delay return bus. The delay time and feedback are set on the return bus itself.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-sends-reverb-and-delay",
  },
  "param.mix.width": {
    title: "Width",
    text: "Stereo width of this track's signal. 100% keeps it as-is; 0% collapses it to mono. Useful before a bus compressor.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-the-inspector",
  },
  "param.mix.low": {
    title: "Low",
    text: "Low-frequency shelf: boost or cut the bass by up to ±15 dB.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-the-inspector",
  },
  "param.mix.mid": {
    title: "Mid",
    text: "Mid-frequency shelf: boost or cut the mids by up to ±15 dB.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-the-inspector",
  },
  "param.mix.high": {
    title: "High",
    text: "High-frequency shelf: boost or cut the treble by up to ±15 dB.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-the-inspector",
  },

  // ─── Step params ─────────────────────────────────────────────────────────
  // prefix: "step" (used in the drum machine STEP encoder bank)

  "param.step.velocity": {
    title: "Velocity",
    text: "How hard this step plays (MIDI 1–127). Higher velocity usually means louder and brighter.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },
  "param.step.probability": {
    title: "Probability",
    text: "The chance this step plays each time the pattern passes through it. 100% = always; lower values add randomness.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },
  "param.step.nudge": {
    title: "Nudge",
    text: "Shifts this step slightly earlier or later in time, for swing or a more human feel. Positive = late, negative = early.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },
  "param.step.ratchet": {
    title: "Ratchet",
    text: "Repeats this step up to 8 times within its slot (like a roll or trill). Great for build-ups and fills.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },
  "param.step.note": {
    title: "Note",
    text: "The pitch of this step on an instrument track, from C2 to C7. Use the Note encoder to set melodic lines directly in the grid.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "instruments-entering-notes",
  },
  "param.step.pitch": {
    title: "Pitch",
    text: "Fine pitch offset for this step on a drum or audio track (±12 semitones). Useful for pitch-glide effects across steps.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },
  "param.step.length": {
    title: "Length",
    text: "How many steps this note holds on an instrument track (1–16). Longer lengths create tied or legato notes.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "instruments-entering-notes",
  },
  "param.step.gate": {
    title: "Gate",
    text: "How long the sound plays within the step's slot, as a percentage. Lower gate values create a staccato feel.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },
  "param.step.condition": {
    title: "Condition",
    text: "Play condition for this step: '1:2' plays every other bar, 'FILL' only fires during fill patterns, '!FILL' skips during fills. Leave as '—' to always play.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },
  "param.step.accent": {
    title: "Accent",
    text: "Marks this step for the accent function. When Accent mode is active, accented steps play louder.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset",
    guide: "drum-machine-parameter-locks",
  },

  // ─── Effect headers (used on the effect name row in EffectEditor) ─────────

  "fx.EQ3": {
    title: "EQ3",
    text: "Three-band equalizer with adjustable crossover points between low, mid and high shelves.",
    guide: "mixing-effects",
  },
  "fx.Filter": {
    title: "Filter",
    text: "Resonant low-pass, high-pass or band-pass filter with an optional LFO that sweeps the cutoff.",
    guide: "mixing-effects",
  },
  "fx.Compressor": {
    title: "Compressor",
    text: "Evens out dynamic range by turning down peaks above the threshold. Use Makeup to bring the level back up.",
    guide: "mixing-effects",
  },
  "fx.Distortion": {
    title: "Distortion",
    text: "Saturation effect from warm overdrive to heavy fuzz, with a tone control and output level.",
    guide: "mixing-effects",
  },
  "fx.Bitcrusher": {
    title: "Bitcrusher",
    text: "Lo-fi effect that reduces the bit depth. Lower Bits values give a crunchy, retro digital sound.",
    guide: "mixing-effects",
  },
  "fx.Delay": {
    title: "Delay",
    text: "Echo effect synced to the song tempo, from 1/32 to 1/2 notes, optionally ping-ponging left and right.",
    guide: "mixing-effects",
  },
  "fx.Reverb": {
    title: "Reverb",
    text: "Room and hall reverb. Adjust Size, Decay and Pre-delay to shape the space.",
    guide: "mixing-effects",
  },
  "fx.Chorus": {
    title: "Chorus",
    text: "Thickens the sound by layering slightly pitch-modulated copies of it.",
    guide: "mixing-effects",
  },
  "fx.Phaser": {
    title: "Phaser",
    text: "Sweeping notch filter that creates a swirling phase-shift effect.",
    guide: "mixing-effects",
  },
  "fx.Tremolo": {
    title: "Tremolo",
    text: "Oscillates the volume at a set rate and depth. Spread adds stereo movement.",
    guide: "mixing-effects",
  },
  "fx.AutoPan": {
    title: "AutoPan",
    text: "Automatically moves the sound left and right in the stereo field at a set rate.",
    guide: "mixing-effects",
  },
  "fx.Limiter": {
    title: "Limiter",
    text: "Hard peak limiter: no signal gets above the Ceiling level. Part of the master chain by default.",
    guide: "mixing-effects",
  },

  // ─── EQ3 params ──────────────────────────────────────────────────────────

  "fx.EQ3.low": {
    title: "Low",
    text: "Low shelf: boost or cut frequencies below the Lo freq crossover point (±15 dB).",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.EQ3.mid": {
    title: "Mid",
    text: "Mid shelf: boost or cut frequencies between the two crossover points (±15 dB).",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.EQ3.high": {
    title: "High",
    text: "High shelf: boost or cut frequencies above the Hi freq crossover point (±15 dB).",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.EQ3.lowFreq": {
    title: "Lo freq",
    text: "Crossover frequency between the low and mid bands. Move it to focus the low shelf on bass or sub-bass.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.EQ3.highFreq": {
    title: "Hi freq",
    text: "Crossover frequency between the mid and high bands. Move it to control how much of the upper mids belong to the high shelf.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Filter params ────────────────────────────────────────────────────────

  "fx.Filter.type": {
    title: "Type",
    text: "Filter mode: LP = low-pass (removes highs), HP = high-pass (removes lows), BP = band-pass (keeps only the band around the cutoff).",
    keys: "Drag or scroll · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Filter.cutoff": {
    title: "Cutoff",
    text: "The filter's center frequency. In LP mode it removes everything above this point; in HP mode, below it.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Filter.reso": {
    title: "Reso",
    text: "Resonance: boosts the frequencies around the cutoff. High values create a pronounced peak or whistle.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Filter.rate": {
    title: "LFO rate",
    text: "How fast the LFO sweeps the cutoff frequency up and down. Higher values give a faster wobble.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Filter.depth": {
    title: "LFO amt",
    text: "How far the LFO moves the cutoff. Set to 0% to disable the LFO and use the filter as a static effect.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Filter.mix": {
    title: "Mix",
    text: "Blends the dry (unfiltered) and wet (filtered) signal. Below 100% is parallel filtering.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Compressor params ────────────────────────────────────────────────────

  "fx.Compressor.threshold": {
    title: "Thresh",
    text: "The level above which compression starts. Signals louder than this are turned down by the ratio.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Compressor.ratio": {
    title: "Ratio",
    text: "How much peaks are reduced above the threshold. 4:1 is moderate; 20:1 is near-limiting.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Compressor.attack": {
    title: "Attack",
    text: "How fast the compressor clamps down after a peak crosses the threshold. Fast = no transient; slow = punchier.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Compressor.release": {
    title: "Release",
    text: "How quickly the compressor stops after the signal falls back below the threshold.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Compressor.makeup": {
    title: "Makeup",
    text: "Gain added after compression to restore the overall volume that was turned down.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Compressor.mix": {
    title: "Mix",
    text: "Blends the dry and compressed signal for parallel compression. 100% = fully compressed.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Distortion params ───────────────────────────────────────────────────

  "fx.Distortion.drive": {
    title: "Drive",
    text: "Amount of distortion. Low values add warm saturation; high values go full fuzz.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Distortion.tone": {
    title: "Tone",
    text: "Tilt the distorted sound: lower values are bassier, higher values are brighter.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Distortion.output": {
    title: "Output",
    text: "Output level after distortion (±12 dB). Compensates for the volume increase that drive can cause.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Distortion.mix": {
    title: "Mix",
    text: "Blends the dry and distorted signal for parallel distortion.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Bitcrusher params ───────────────────────────────────────────────────

  "fx.Bitcrusher.bits": {
    title: "Bits",
    text: "Bit depth of the crushed signal: 16 = clean, 8 = classic digital, 2 = extreme crunch.",
    keys: "Drag or scroll · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Bitcrusher.tone": {
    title: "Tone",
    text: "Low-pass filter on the crushed signal. Turn it down to remove harsh aliasing from the bit reduction.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Bitcrusher.mix": {
    title: "Mix",
    text: "Blends the dry and bit-crushed signal for parallel crushing.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Delay params ────────────────────────────────────────────────────────

  "fx.Delay.time": {
    title: "Time",
    text: "Delay time, synced to the song tempo: from 1/32 (very short) to 1/2 (half-bar echoes).",
    keys: "Drag or scroll · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Delay.feedback": {
    title: "Feedback",
    text: "How many times the echoes repeat. Low = one or two echoes; high = many, fading echoes; at maximum it sustains forever.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Delay.tone": {
    title: "Tone",
    text: "Tone of the echo repeats. Higher values keep the echoes bright; lower values make them darker and more distant.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Delay.spread": {
    title: "Ping-pong",
    text: "Bounces echoes between left and right channels for a wide stereo ping-pong effect.",
    keys: "Drag or scroll · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Delay.mix": {
    title: "Mix",
    text: "Blends the dry signal and the delay echoes. 0% = no echo; 100% = only echo.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Reverb params ───────────────────────────────────────────────────────

  "fx.Reverb.size": {
    title: "Size",
    text: "Perceived size of the reverberant space, from a small room to a huge hall.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Reverb.decay": {
    title: "Decay",
    text: "How long the reverb tail rings out. Short values are room-like; long values are cathedral or plate.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Reverb.predelay": {
    title: "Pre-delay",
    text: "A short delay before the reverb starts. Keeps the direct sound clear and punchy even with a lush reverb.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Reverb.damp": {
    title: "Damp",
    text: "How quickly high frequencies fade in the reverb tail. More damping = a warmer, less bright reverb.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Reverb.mix": {
    title: "Mix",
    text: "Blends the dry and reverb signal. When Reverb is used as a send effect, 100% is typical.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Chorus params ───────────────────────────────────────────────────────

  "fx.Chorus.rate": {
    title: "Rate",
    text: "How fast the chorus LFO modulates. Slow rates give a gentle shimmer; faster rates are more intense.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Chorus.depth": {
    title: "Depth",
    text: "How wide the pitch and delay variation is. Higher depth = a lusher, more pronounced chorus.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Chorus.delay": {
    title: "Delay",
    text: "Base delay time before the modulation is added. Longer values give a more spatially wide effect.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Chorus.mix": {
    title: "Mix",
    text: "Blends the dry and chorus signal.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Phaser params ───────────────────────────────────────────────────────

  "fx.Phaser.rate": {
    title: "Rate",
    text: "How fast the phaser sweeps. Slow rates create a gentle swirl; faster rates give a more obvious effect.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Phaser.octaves": {
    title: "Octaves",
    text: "The frequency range the phaser sweeps across. More octaves = a wider, more dramatic sweep.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Phaser.base": {
    title: "Base",
    text: "The lowest frequency the phaser sweeps from. Move it to focus the effect on bass, mids or highs.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Phaser.q": {
    title: "Q",
    text: "Resonance at the notch frequencies. Higher Q values make the notches sharper and the effect more pronounced.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Phaser.mix": {
    title: "Mix",
    text: "Blends the dry and phased signal. Lower values let you dial in a subtle phase shift.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Tremolo params ──────────────────────────────────────────────────────

  "fx.Tremolo.rate": {
    title: "Rate",
    text: "How fast the volume oscillates. Low rates give a smooth pulse; high rates create a buzzing effect.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Tremolo.depth": {
    title: "Depth",
    text: "How much the volume swings. 0% = no effect; 100% = the volume drops to silence at the bottom of the wave.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Tremolo.spread": {
    title: "Spread",
    text: "Offsets the LFO phase between the left and right channel. At 100% they're opposite, creating a panning tremolo.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.Tremolo.mix": {
    title: "Mix",
    text: "Blends the dry and tremolo signal.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── AutoPan params ──────────────────────────────────────────────────────

  "fx.AutoPan.rate": {
    title: "Rate",
    text: "How fast the sound moves left and right. Slow rates give a gentle sweep; faster rates are more dramatic.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.AutoPan.depth": {
    title: "Depth",
    text: "How wide the panning swings. 0% = the sound stays centered; 100% = full left-to-right movement.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
  "fx.AutoPan.mix": {
    title: "Mix",
    text: "Blends the dry (static) and auto-panned signal.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },

  // ─── Limiter params ──────────────────────────────────────────────────────

  "fx.Limiter.ceiling": {
    title: "Ceiling",
    text: "The maximum peak level that can pass through. Set it to around −0.3 dB to prevent clipping during export.",
    keys: "Drag or scroll · Shift = fine · Double-click = reset · Right-click: MIDI learn",
    guide: "mixing-effects",
  },
};

export default hints;
