# Beatbox {#beatbox}

The [Beatbox panel](panel:beatbox) turns your beatboxing into step tracks. Beatbox a beat, and Rebeat finds every hit, works out what it is (a kick, a snare, a hi-hat…) and puts your rhythm on the steps of one track per sound, playing your own sounds or a drum kit.

A small machine learning model guesses what each hit is. It was trained on recordings of many people, but every beatboxer's kick sounds different, so it gets much better once it knows yours: label a few of your sounds and it **calibrates** to your voice.

Open it from the layout menu or the command palette (**Show Beatbox**). The model downloads the first time you open the panel (about 6 MB) and works offline after that.

## Recording {#beatbox-recording}

Press **Record** and choose what to record:

- **Single sounds** teach the model one sound at a time. Pick the class (Kick, Snare, Closed hi-hat, Open hi-hat, Tom, Clap, Crash or Other) and how many times (Times), then make that sound each time the light flashes. Every hit is found and labeled for you. Ten of each class is a good start.
- **A take** is a beat to convert. **To the metronome**: a bar of count-in, then the bars you chose at the project's tempo, so the take lines up with the grid. **Free**: record until you press **Stop**; Rebeat finds the tempo.

Clicks go straight to your speakers or headphones, not into the song. With speakers the microphone hears them too, so wear headphones (single sounds pace you with the light only, unless you switch **Click too** on).

**Add** brings in recordings you already have:

- **Audio files or a dataset (.zip)…**: a short file is one sound; a longer one is a take. A name that says what it is labels its hits: `kick2.wav`, `Open hat.wav`, `snare_3.wav`.
- **A folder…**: a folder named after a class (`kicks/`, `hats/`) labels the files in it.
- **From a link…**: a strudel.json or a GitHub repository (`github:user/repo`). Its keys label their sounds, so a collection like `github:jeroenjanssens/beatbox-samples` comes in labeled.
- **The selected Clip track's recording**: a loop you recorded in the [loop station](#loop-station). It keeps the project's tempo, so it lines up with the grid. A Clip track's menu has **Open in Beatbox** too, and so has a sample's menu in the library.

## Voices {#beatbox-voices}

Recordings belong to a **voice**: whoever made the sounds. Each voice has its own calibration, so friends can teach Rebeat their sounds without changing yours. Pick, add, rename or remove voices with the voice menu at the top left. Right-click a recording to move it to another voice.

## Labeling hits {#beatbox-labeling}

Select a recording to see its hits on the waveform: each one a region in its class's color. Solid regions have **your** label; dashed ones show the **model's guess** and how sure it is.

- **Click** a hit to hear and select it; Shift- or ⌘-click to select several.
- Press **1–8** (or the class buttons) to label the selection, **0** to clear a label, **Enter** to accept the model's guess (with nothing selected: for every unlabeled hit).
- **Tab** jumps to the next hit worth a look: an uncertain guess, or a hit where your label and the model's guess differ (≠). **←** and **→** step through all hits.
- **Drag a hit's edges** to trim it. **Drag over empty space** to add a hit the detector missed. **Delete** removes the selected hits (a breath, a lip smack).
- **Find hits** looks for the hits again with the **Sensitivity** you set; the hits you labeled stay.
- Ctrl/⌘ + wheel zooms the waveform, the wheel scrolls, a double-click shows it all again.

The **Hits** tab lists every hit with your label and the model's guess. The filter above the recordings shows only those with unlabeled hits, uncertain guesses, or disagreements.

Your labels are saved as you go (in the browser, with your library), not in the project.

## The model and calibration {#beatbox-model}

The **Model** view shows how well the model knows the selected voice:

- per class, how many examples you've labeled;
- how often the model gets your labeled hits right on its own, and **calibrated** to your voice, where each hit is judged without its own label;
- what to record next ("Record more: 8 open hi-hats").

Calibration works by comparing each hit with your own examples of every class. It needs no training and takes effect at once: every label you add or fix counts. Classes you have no examples of rely on the model alone. Toms, claps and crashes are rare in the model's training data, so it learns those mostly from you.

On voices it never heard, the first model gets about three in four Kick, Snare and Closed hi-hat hits right on its own, and more after calibration. The panel shows its numbers.

## Converting a take {#beatbox-converting}

A take has a **Convert** tab under its waveform:

- **Tempo** and **First beat** place the grid on the take (it shows on the waveform). A take recorded to the metronome knows both. For others, **Detect** finds them from the hits; drag either value to fit.
- **Steps**: the step size, 1/16 for most beats.
- **Timing**: **Snap** puts every hit on its step. **Keep feel** keeps how early or late you were as each step's nudge, by **Strength**.
- **Velocity**: **Detected** maps loudness to velocities from **Min** to **Max**, so ghost notes stay quiet; **Constant** gives every hit the same velocity. **Drop hits quieter than** leaves out the faintest ones.
- **Repetitions**: **Fold into one pattern** lets every repetition vote: a step keeps a hit when most repetitions have it, with their velocity and nudge averaged. **Keep every bar** puts the whole take on pages one after another. **Pattern** sets how many bars one pattern is (Auto finds where it repeats). Hits marked **!** disagree with the other repetitions: worth a listen.
- **Sound**, per class: **Your hit** (the most typical one of the take, saved to the library under **Beatbox**), the matching **kit** sound, or drop any library sample on it.
- **Hear** loops the **Original**, the **Result** or **Both** together on the preview output.

**Create tracks** adds one step track per class (in Hits mode) to the page you're editing, or new pages with Keep every bar, and mutes the take's Clip track. It's one undo step.

## Datasets {#beatbox-datasets}

The **⋯** menu exports a voice's recordings (or every voice's) as a **dataset**: a zip with the recordings as WAV files and `hits.csv` (file, start, end, label, voice). Import brings one back in, voices and labels included: a way to move your recordings to another computer.

It's also the format Rebeat's model is trained on. Its training code is in the `ml/` folder of Rebeat's repository: unzip a dataset into `ml/data/exports/` and the next model learns from your voice too. Only your own labels are exported, not the model's guesses.
