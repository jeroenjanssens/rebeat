import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles/index.css";
import { App } from "./App";
import { createAudioContext } from "./engine/context";

createAudioContext();

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
  ]).then(([engine, transport, store]) => {
    (window as unknown as Record<string, unknown>).__rebeat = {
      engine,
      transport,
      store: store.useStore,
    };
  });
}
