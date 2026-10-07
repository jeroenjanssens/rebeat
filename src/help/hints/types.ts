export interface Hint {
  /** Short name, e.g. "Tap tempo". */
  title: string;
  /** One to three plain sentences: what it does and when you'd use it. */
  text: string;
  /** Command whose current shortcut is shown. */
  command?: string;
  /** Extra keys or gestures that aren't commands, e.g. "Shift+click: select a range". */
  keys?: string;
  /** Guide section for "F1: more in the guide". */
  guide?: string;
}

export type Hints = Record<string, Hint>;
