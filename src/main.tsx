import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/index.css";
import { App } from "./App";
import { createAudioContext } from "./engine/context";

createAudioContext();

// offline support for the web app (the desktop app ships its files)
if (location.protocol.startsWith("http") && "serviceWorker" in navigator && import.meta.env.PROD)
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.DEV || import.meta.env.MODE === "test") {
  // handle for e2e tests and debugging in the console
  void Promise.all([
    import("./engine/engine"),
    import("./engine/transport"),
    import("./state/store"),
    import("./help/hints"),
    import("./app/commands"),
  ]).then(([engine, transport, store, hints, commands]) => {
    (window as unknown as Record<string, unknown>).__rebeat = {
      engine,
      transport,
      store: store.useStore,
      hints: hints.HINTS,
      commands: commands.allCommands,
    };
  });
}
