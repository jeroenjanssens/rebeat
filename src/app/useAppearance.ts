import { useEffect, useSyncExternalStore } from "react";
import { applyTheme } from "../render/theme";
import { resolveTheme, useSettings } from "../state/settings";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

function useMedia(q: MediaQueryList) {
  return useSyncExternalStore(
    (fn) => {
      q.addEventListener("change", fn);
      return () => q.removeEventListener("change", fn);
    },
    () => q.matches,
  );
}

/** Apply theme, accent, UI scale, density and motion settings to the document. */
export function useAppearance() {
  const { theme, accent, uiScale, density, reducedMotion, systemDarkTheme, systemLightTheme } =
    useSettings();
  const prefersDark = useMedia(darkQuery);
  const prefersReduced = useMedia(motionQuery);
  const resolved = resolveTheme(theme, prefersDark, {
    dark: systemDarkTheme,
    light: systemLightTheme,
  });

  useEffect(() => applyTheme(resolved, accent), [resolved, accent]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("zoom", String(uiScale));
    root.style.setProperty("--ui-scale", String(uiScale));
    root.dataset.density = density;
    const reduce = reducedMotion === "system" ? prefersReduced : reducedMotion === "on";
    root.dataset.reducedMotion = String(reduce);
  }, [uiScale, density, reducedMotion, prefersReduced]);
  return resolved;
}
