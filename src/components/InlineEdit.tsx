import { useState } from "react";

interface Props {
  value: string;
  onCommit: (v: string) => void;
  trigger?: "click" | "dblclick";
  className?: string;
}

export function InlineEdit({ value, onCommit, trigger = "dblclick", className = "" }: Props) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    const open = () => setEditing(true);
    return (
      <span
        className={`truncate ${className}`}
        onClick={trigger === "click" ? open : undefined}
        onDoubleClick={trigger === "dblclick" ? open : undefined}
        title={trigger === "click" ? "Click to rename" : "Double-click to rename"}
      >
        {value}
      </span>
    );
  }
  return (
    <input
      autoFocus
      defaultValue={value}
      className={`min-w-0 rounded bg-surface px-1 outline outline-1 outline-accent ${className}`}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v && v !== value) onCommit(v);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
