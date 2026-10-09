# The library {#library}

The [Library](panel:library) holds your samples. It's shared by all projects: a sample you import once can be used everywhere.

## Importing

- Drop audio files, whole **folders**, or **zip** files onto the library (or onto the drum machine).
- Or use the import buttons: the arrow for files, the folder for a folder, the **link** for a link.
- **Import from a link** accepts:
  - a link to an audio file or a zip: imported right away (into the folder Downloads);
  - a link to a **strudel.json** sample map, a **GitHub repository** (`https://github.com/user/repo`, also a folder in it), or Strudel's shorthand `github:user/repo`: added as a **source** at the top of **Online kits**, where you can listen to its sounds and add the ones you want (or all of them). A repository without a strudel.json lists its audio files, grouped by folder. Sources stay until you remove them with ×.
- WAV, MP3, OGG, FLAC, AIFF, M4A and other formats the browser can play are supported.

Importing the same file twice doesn't make a duplicate. Loops get their **tempo** detected (shown as a small number next to them).

## Finding sounds

- **Search** looks in names, folders and tags.
- **Filter**: loops (with a tempo) or one-shots, short / medium / long, and tags.
- **Sort**: by name, duration or date added, each in either direction (A → Z or Z → A, shortest or longest first, newest or oldest first). The button shows the current order, e.g. **Name ↑**; it applies to every view, the built-in kits included.
- The list on the left (or the menu at the top in a narrow library): **All samples**, **Favorites**, **Used in project**, **Recordings**, your folders, the built-in **909** and **808 kits**, and **Online kits**. **Used in project** shows every sample the tracks play, built-in kit sounds included.

A dot next to a sample means it's used in the open project. Selecting a track shows its sample in the library.

## Listening

**Click** a sample to hear it. Use ↑ ↓ to go through the list while listening, Space to play the selected one again, Enter to add it as a new track, Esc to stop. The slider at the bottom sets the preview volume; **Sync** plays loops at the song tempo, starting on the beat.

## Using samples

- **Drag** a sample onto a track to replace its sound, or onto the drop zone under the tracks for a new track. Loops become audio tracks; one-shots drum tracks.
- **Right-click** a sample for: Audition, Add as new track, Use on (the selected track), Open in sample editor, **Export…**, Add to favorites, Rename, Tags, Folder, which tracks use it, and Delete.
- **Double-click** a sample to open it in the [sample editor](#sample-editor) (or right-click → **Open in sample editor**). Built-in sounds can't change, so Rebeat edits a copy in your library.
- **Double-click** an instrument to open it in its editor (or right-click → **Open in …**): a synth in the [synth editor](#instruments-the-synth-editor), a single-sample sampler in the sample editor, other instruments in the Inspector. The editor works on a track that plays it (the selected one first), or a new track with it.
- **Export…** saves a sample as a file: as heard (with the sample editor's settings) in WAV, MP3 or OGG, or the original file as it was imported.
- Drag a sample onto a folder on the left to move it there.

## Kits

The **909 kit** and **808 kit** are built in (they're synthesized, so there are no licensing questions). **Load kit as tracks** adds all their sounds at once; you can also drag the kit's title onto the drum machine.

**Online kits** browses more than 70 classic drum machines from the community _tidal-drum-machines_ collection. Click a machine to see its sounds and click a sound to hear it: listening doesn't add anything to your library. To use sounds:

- **+** next to a sound adds it to your library (folder Kits/<machine>).
- **Drag a sound onto a track** to replace that track's sound (Alt+drop adds it as a new track; drop it below the tracks for a new one). It's added to your library at the same time.
- The folder button next to a machine adds one of each of its sound types to your library; the **Load as tracks** button (the list with a plus) also makes a track for each.

The search box finds machines _and_ sounds: type "hat", "808 snare" or "cowbell" to list matching sounds across all machines (by sound type or file name), handy for comparing the same sound on different machines.

Check the sounds' licensing before you publish music made with them.

## Instruments

The library also holds everything an **instrument track** can play, under **Instruments** in the list on the left:

- **Synths**: 37 built-in synths in the style of well-known songs and synths, grouped Bass, Leads, Pads, Keys, Plucks & stabs and FX. Hover over one to see what it's in the style of.
- **Pianos & keys**, **General MIDI** (all 128 GM sounds), **Mallets**, **Orchestral** (the Versilian Community Sample Library) and **Double bass**: sampled instruments. They download the first time you play one (a small cloud shows the ones that haven't been yet) and are kept after that. Right-click → **Make available offline** downloads one right away. The line at the top shows where the samples come from and their license.
- **Your instruments**: synths and sounds you save, and instruments you bring:
  - **SoundFonts**: import a `.sf2` file like a sample (the import button, or drop it on the library). Each instrument inside it becomes one of your instruments.
  - **Synth files**: a `.rbsynth` file (exported from the [synth editor](#instruments-the-synth-editor)) imports the same way, as one of your instruments, with its macros and effects.
  - **Multi-sample instruments**: right-click a sample → **Make instrument from "folder"** turns the samples of its folder into one instrument, each at the note in its file name ("Piano C4.wav"); without notes in the names, they're laid out a semitone apart from C3. Every note plays from the nearest sample.
  - **Pitched sounds in a strudel.json** (a sound that maps notes to files) show as instruments in Online kits: **Add instrument** downloads them as a multi-sample instrument.

Working with instruments:

- **Click** one to hear a short phrase. While it's selected, the keys **A** to **L** play it like a piano (**W E T Y U O** are the black keys); **Z** and **X** move an octave down or up (selecting another sound starts at its own octave again).
- **Drag** it onto an instrument track to play it there, onto a drum or audio track to turn that track into an instrument track, or below the tracks for a new one. **Enter** adds it as a new track too.
- The heart adds it to **Favorites**; **Used in project** lists the instruments your tracks play.
- Searching in **All samples** finds instruments as well; the filter's **Instruments** type shows only them.

## Recording into the library

Open **Recordings** to record from your microphone: pick the input device, watch the input level, turn on monitoring (use headphones) if you want to hear yourself, and press **Record** / stop. **Trim silence** removes silence at both ends. The recording is saved as a new sample. Your browser asks for microphone access the first time.
