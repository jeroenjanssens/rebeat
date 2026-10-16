/** Alt+L: a lock column for one of the track's sound knobs, picked in the knob picker (D208). */
import { openKnobPicker } from "../../components/KnobPicker";
import { useStore } from "../../state/store";
import { addLockColumn } from "../../state/tracker";

export function openLockPicker(trackId: string) {
  const track = useStore.getState().project.tracks.find((t) => t.id === trackId);
  const prefix = `track:${trackId}:`;
  const el = document.querySelector<HTMLElement>('[data-testid="tracker-pattern"]');
  openKnobPicker(el ?? { clientX: window.innerWidth / 2, clientY: 160 }, {
    // a step locks its track's sound knobs (the macros, on a synth)
    only: (target) => target.startsWith(`${prefix}sound.`),
    open: track?.name,
    onPick: (target) => {
      addLockColumn(trackId, target.slice(prefix.length));
      el?.closest<HTMLElement>("[data-scope]")?.focus();
    },
  });
}
