let counter = 0;

export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Like uid but truly random — safe for records persisted across sessions (IndexedDB, settings). */
export const persistedUid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
