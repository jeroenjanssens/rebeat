import type { ReactNode } from "react";
import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { usePortalTarget } from "./portal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  width?: number;
  children: ReactNode;
}

/** A modal dialog that stays visible in full screen. */
export function Dialog({ open, onOpenChange, title, width = 560, children }: Props) {
  const container = usePortalTarget();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal container={container}>
        <D.Overlay className="dialog-overlay" />
        <D.Content
          className="dialog flex flex-col"
          style={{ width, maxWidth: "94vw" }}
          aria-describedby={undefined}
        >
          <div className="flex h-11 shrink-0 items-center border-b border-line px-4">
            <D.Title className="label !text-[11px] !text-ink">{title}</D.Title>
            <D.Close className="tool-btn ml-auto" aria-label="Close">
              <X size={14} />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
