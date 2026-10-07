import { useEffect, useState } from "react";
import { platform } from "../platform";

/** Menus, dialogs and tooltips render inside the full-screen element when there is one. */
export function usePortalTarget(): HTMLElement {
  const get = () => (platform.fullscreen.element() as HTMLElement | null) ?? document.body;
  const [target, setTarget] = useState<HTMLElement>(get);
  useEffect(() => platform.fullscreen.onChange(() => setTarget(get())), []);
  return target;
}
