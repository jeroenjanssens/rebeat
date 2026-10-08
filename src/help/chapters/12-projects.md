# Projects, export and the desktop app {#projects}

## Projects

Everything you do is **saved automatically** in your browser, a moment after each change. When you open Rebeat again, your last project opens. Projects stay in this browser until you delete them; export a file to move a project to another computer or browser.

The [project browser](command:project.home) ({{key:project.home}}, or click the project name):

- **New project**: start from **Empty** (four drum tracks), **808 starter** (an 808 kit with a groove and a break) or **Loop station** (a beat and three audio tracks).
- **Examples**: the demo and the classics. Changing an example makes a copy in your projects.
- **Your projects**: click to open; double-click the name to rename; the buttons duplicate, export and delete (right-click works too).
- **Import .rebeat**: open a project file (or drop it on the browser).

## Saving a project file

- **Export .rebeat** ({{key:project.export}}) saves a single file with the project and all the samples it uses. Built-in kit sounds aren't included; they're part of Rebeat.
- **Save to folder** (command palette, in Chrome and Edge) writes the .rebeat file into a folder you choose, and remembers it.

## Exporting audio and MIDI

[Export](command:project.exportAudio) ({{key:project.exportAudio}}):

| Option                             | What it does                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Song / Current page**            | What to render.                                                                                                |
| **Source**                         | The full mix, or a single track.                                                                               |
| **Format**                         | WAV (16-bit, 24-bit or 32-bit float), MP3 (128, 192 or 320 kbit/s) or OGG (small, good or best quality).       |
| **Stems**                          | One file per track, in a zip.                                                                                  |
| **Export WAV / MP3 / OGG**         | Render and save. Rendering is faster than real time.                                                           |
| **Export MIDI**                    | The notes and drum hits as a MIDI file, with a track per instrument (drums on channel 10, General MIDI notes). |
| **Resample to library / to track** | Render into a new sample (in Recordings), or straight into a new audio track.                                  |

Sampled instruments (piano, strings…) are included: one that hasn't been downloaded yet is downloaded before rendering (so the first export needs an internet connection; **Make available offline** in the library downloads it ahead of time).

## Undo

Every change to a project can be undone ({{key:edit.undo}}) and redone ({{key:edit.redo}}): steps, tracks, pages, mixer settings, effects… A drag (of a knob, a fader, a painted row of steps) counts as one change.

## Install as an app

In Chrome and Edge you can install Rebeat from the address bar (the install icon). It then opens in its own window and also works offline. Installing also makes the browser remember the microphone permission.

## The desktop app

Rebeat also exists as a desktop app (macOS, Windows, Linux) with the same features, plus: microphone and MIDI access that doesn't need asking again, native file dialogs and menus, opening .rebeat files by double-clicking them, several windows (File → New Window), and **Stage mode** (View → Stage Mode, or Ctrl/Cmd+Shift+K), which hides everything around the app for performing.
