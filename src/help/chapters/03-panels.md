# Panels and layouts {#panels}

Every part of Rebeat lives in a **panel**: [Drum machine](panel:drum-machine), [Library](panel:library), [Inspector](panel:inspector), [Mixer](panel:mixer), [Sample editor](panel:sample-editor), [Piano roll](panel:piano-roll), [Performance](panel:performance), [Master scope](panel:master-scope) and this [Guide](panel:guide).

## Arranging panels

- Every panel's tab shows its icon and its name (a sample or synth editor tab has its panel's icon too); the layout button lists the panels with the same icons.
- **Move** a panel by dragging its tab. Drop it on the edge of another panel to split, or on the tab bar to stack it as a tab.
- **Resize** by dragging the line between two panels.
- **Close** a panel with the × on its tab. Bring it back from the layout button in the transport bar, or with "Show …" in the command palette.

Your arrangement is remembered for next time.

## Layout presets

The layout button in the transport bar (or the command palette) switches between three arrangements:

| Preset      | Shortcut               | For                                                                                                            |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Compose** | {{key:layout.compose}} | Library left, drum machine center, inspector right; mixer, sample editor and piano roll as tabs at the bottom. |
| **Perform** | {{key:layout.perform}} | The drum machine with the Performance panel and the Master scope.                                              |
| **Edit**    | {{key:layout.edit}}    | A large sample editor with the library and inspector, and the drum machine below.                              |

## Bigger panels

Each panel has three buttons at the right of its tab bar:

| Button            | What it does                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pop out           | Moves the panel into a separate window, for example on a second screen.                                                                                                   |
| Panel full screen | Shows only this panel on the whole screen ({{key:view.panelFullscreen}}), with a small transport that appears when you move the mouse to the top. Esc leaves full screen. |
| Maximize          | Makes the panel fill the window while the transport bar stays ({{key:view.maximize}}, or double-click the tab). Click again to restore the layout.                        |

Menus and dialogs keep working in full screen.

## Panels adapt to their size

Panels change their layout to fit the space they get. The drum machine, for example, has three sizes: compact (fewer buttons, with the rest in menus), regular, and large (bigger pads with velocity bars). The library switches between a list, two columns and tiles.
