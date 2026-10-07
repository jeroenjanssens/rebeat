import { Command } from "cmdk";
import { usePortalTarget } from "../components/portal";
import { formatKeys, keysFor, useCommands } from "./commands";
import { useShell } from "./shell";

export function CommandPalette() {
  const open = useShell((s) => s.paletteOpen);
  const set = useShell((s) => s.set);
  const commands = useCommands().filter((c) => !c.hidden && (c.enabled?.() ?? true));
  const container = usePortalTarget();
  const categories = [...new Set(commands.map((c) => c.category))];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => set({ paletteOpen: o })}
      label="Command palette"
      container={container}
      overlayClassName="dialog-overlay"
      contentClassName="dialog !top-[18%] !translate-y-0 w-[560px] max-w-[92vw] overflow-hidden !p-0"
      loop
    >
      <Command.Input
        placeholder="Type a command…"
        className="w-full border-b border-line bg-transparent px-4 py-3 text-[14px] text-ink outline-none placeholder:text-faint"
      />
      <Command.List className="scroll-thin max-h-[360px] overflow-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-[12px] text-faint">
          No matching commands.
        </Command.Empty>
        {categories.map((cat) => (
          <Command.Group
            key={cat}
            heading={cat}
            className="[&_[cmdk-group-heading]]:label [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
          >
            {commands
              .filter((c) => c.category === cat)
              .map((c) => (
                <Command.Item
                  key={c.id}
                  value={`${c.category} ${c.title} ${c.id}`}
                  onSelect={() => {
                    set({ paletteOpen: false });
                    // let the dialog close (and give back focus) before running
                    requestAnimationFrame(() => c.run());
                  }}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12.5px] data-[selected=true]:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)]"
                >
                  <span className="flex-1 truncate">{c.title}</span>
                  {keysFor(c)
                    .slice(0, 1)
                    .map((k) => (
                      <kbd key={k}>{formatKeys(k)}</kbd>
                    ))}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  );
}
