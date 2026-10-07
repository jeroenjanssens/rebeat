import { Dialog } from "../components/Dialog";
import { useSettings } from "../state/settings";
import { formatKeys } from "./commands";
import { openGuide } from "./openers";
import { newFromTemplate } from "./projectActions";
import { useShell } from "./shell";

const TIPS: [string, string][] = [
  ["Space", "Play / stop"],
  ["D · E · S", "Draw, erase and select steps"],
  ["V", "Grid ↔ pads (the keyboard plays the pads)"],
  ["Mod+K", "Command palette: every action, searchable"],
  ["Shift+/", "All keyboard shortcuts (and rebind them)"],
  ["R", "Record: live pads, or a loop on an armed audio track"],
];

/** First run: what Rebeat is, a few shortcuts, and where to start. */
export function WelcomeDialog() {
  const onboarded = useSettings((s) => s.onboarded);
  const audio = useShell((s) => s.audio);
  const done = () => useSettings.getState().set({ onboarded: true });
  return (
    <Dialog
      open={!onboarded && audio === "running"}
      onOpenChange={(o) => !o && done()}
      title="Welcome to Rebeat"
      width={560}
    >
      <div className="flex flex-col gap-4 p-5 text-[12.5px]">
        <p className="text-dim">
          A drum machine and loop station in your browser. The demo song{" "}
          <span className="text-ink">Night Drive</span> is open: press Space to hear it. Everything
          saves automatically in this browser; export a <span className="num">.rebeat</span> file to
          move a project to another machine.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {TIPS.map(([keys, what]) => (
            <div key={keys} className="flex items-center gap-2">
              <kbd>{keys.includes("Mod") || keys.includes("Shift") ? formatKeys(keys) : keys}</kbd>
              <span className="text-dim">{what}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button className="hw-btn" onClick={done} data-testid="welcome-demo">
            Explore the demo
          </button>
          <button
            className="tool-btn border border-line"
            onClick={() => {
              done();
              void newFromTemplate("808");
            }}
          >
            Start from the 808 kit
          </button>
          <button
            className="tool-btn border border-line"
            onClick={() => {
              done();
              void newFromTemplate("loops");
            }}
          >
            Loop station
          </button>
          <button
            className="tool-btn ml-auto border border-line"
            onClick={() => {
              done();
              openGuide("getting-started");
            }}
            data-testid="welcome-guide"
          >
            Read the guide (F1)
          </button>
        </div>
      </div>
    </Dialog>
  );
}
