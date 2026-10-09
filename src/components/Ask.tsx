/**
 * A small confirm-or-name dialog you can await: `await ask({ title, message, confirm })`
 * resolves true/false, and with `input` it resolves the text (or null when cancelled).
 */
import { useState } from "react";
import { create } from "zustand";
import { Dialog } from "./Dialog";

interface Question {
  title: string;
  message?: string;
  confirm?: string;
  danger?: boolean;
  /** Ask for a text, starting with this value. */
  input?: string;
  placeholder?: string;
  resolve: (v: string | boolean | null) => void;
}

const useAsk = create<{ q: Question | null }>()(() => ({ q: null }));

export function ask(q: Omit<Question, "resolve" | "input">): Promise<boolean>;
export function ask(q: Omit<Question, "resolve"> & { input: string }): Promise<string | null>;
export function ask(q: Omit<Question, "resolve">): Promise<string | boolean | null> {
  return new Promise((resolve) => useAsk.setState({ q: { ...q, resolve } }));
}

export function AskHost() {
  const q = useAsk((s) => s.q);
  if (!q) return null;
  return <AskDialog key={q.title + (q.input ?? "")} q={q} />;
}

function AskDialog({ q }: { q: Question }) {
  const [text, setText] = useState(q.input ?? "");
  const done = (v: string | boolean | null) => {
    useAsk.setState({ q: null });
    q.resolve(v);
  };
  const asking = q.input !== undefined;
  const ok = () => (asking ? text.trim() && done(text.trim()) : done(true));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && done(asking ? null : false)}
      title={q.title}
      width={400}
    >
      <form
        className="flex flex-col gap-3 p-4 text-[12.5px]"
        data-testid="ask"
        onSubmit={(e) => {
          e.preventDefault();
          ok();
        }}
      >
        {q.message && <p className="text-dim">{q.message}</p>}
        {asking && (
          <input
            autoFocus
            className="input"
            value={text}
            placeholder={q.placeholder}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="ask-input"
          />
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="tool-btn border border-line"
            onClick={() => done(asking ? null : false)}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`tool-btn border border-line ${q.danger ? "!text-[#ef4444]" : "!text-ink"}`}
            data-testid="ask-ok"
            disabled={asking && !text.trim()}
          >
            {q.confirm ?? "OK"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
