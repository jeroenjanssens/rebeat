import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "../components/Dialog";
import { platform } from "../platform";
import { ACCENTS, THEMES, useSettings, type Settings, type ThemeId } from "../state/settings";
import { CalibrationDialog } from "./CalibrationDialog";
import { MidiSettings } from "./MidiSettings";
import { useShell } from "./shell";

type Tab = "appearance" | "audio" | "midi" | "project" | "storage";

const TABS: { id: Tab; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "audio", label: "Audio" },
  { id: "midi", label: "MIDI" },
  { id: "project", label: "Projects" },
  { id: "storage", label: "Storage" },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="w-44 shrink-0">
        <div className="text-[12px] text-ink">{label}</div>
        {hint && <div className="text-[10.5px] leading-tight text-faint">{hint}</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  hint,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <div className="segmented" data-hint={hint}>
      {options.map((o) => (
        <button key={o.id} data-active={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function useDevices(kind: MediaDeviceKind) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const load = () =>
      platform.media.devices().then((d) => setDevices(d.filter((x) => x.kind === kind)));
    load();
    return platform.media.onDevicesChange(load);
  }, [kind]);
  return devices;
}

function DeviceSelect({
  kind,
  value,
  onChange,
  hint,
}: {
  kind: MediaDeviceKind;
  value: string;
  onChange: (id: string) => void;
  hint?: string;
}) {
  const devices = useDevices(kind);
  return (
    <select
      className="input min-w-[240px]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-hint={hint}
    >
      <option value="">System default</option>
      {devices
        .filter((d) => d.deviceId && d.deviceId !== "default")
        .map((d, i) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `${kind === "audioinput" ? "Input" : "Output"} ${i + 1}`}
          </option>
        ))}
    </select>
  );
}

function Toggle({
  value,
  onChange,
  hint,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <Segmented
      value={value ? "on" : "off"}
      options={[
        { id: "on", label: "On" },
        { id: "off", label: "Off" },
      ]}
      onChange={(v) => onChange(v === "on")}
      hint={hint}
    />
  );
}

function StorageInfo() {
  const [info, setInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    platform.storage.estimate().then(setInfo);
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  return (
    <>
      <Row label="Used" hint="Projects, samples and recordings in this browser">
        <span className="num text-[12px]" data-hint="app.settings.storageused">
          {info ? `${mb(info.usage)} of ${mb(info.quota)}` : "Unknown"}
        </span>
      </Row>
      <Row label="Persistent storage" hint="Asks the browser never to evict your data">
        <span className="text-[12px] text-dim">{persisted ? "Granted" : "Not granted"}</span>
        {!persisted && (
          <button
            className="tool-btn border border-line"
            onClick={() => platform.storage.persist().then(setPersisted)}
            data-hint="app.settings.persiststorage"
          >
            Request
          </button>
        )}
      </Row>
    </>
  );
}

export function SettingsDialog() {
  const open = useShell((s) => s.settingsOpen);
  const shell = useShell((s) => s.set);
  const s = useSettings();
  const [tab, setTab] = useState<Tab>("appearance");
  const [calibrating, setCalibrating] = useState(false);
  const set = (p: Partial<Settings>) => s.set(p);

  return (
    <>
      <CalibrationDialog open={calibrating} onClose={() => setCalibrating(false)} />
      <Dialog
        open={open}
        onOpenChange={(o) => shell({ settingsOpen: o })}
        title="Settings"
        width={720}
      >
        <div className="flex min-h-[420px]">
          <nav className="flex w-36 shrink-0 flex-col gap-0.5 border-r border-line p-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                className="tool-btn !justify-start"
                data-active={tab === t.id}
                onClick={() => setTab(t.id)}
                data-hint="app.settings.tab"
              >
                {t.label}
              </button>
            ))}
            <div className="flex-1" />
            <button
              className="tool-btn !justify-start"
              onClick={() => shell({ settingsOpen: false, shortcutsOpen: true })}
              data-hint="app.settings.shortcuts"
            >
              Shortcuts…
            </button>
          </nav>
          <div className="min-w-0 flex-1 divide-y divide-line px-5 py-2">
            {tab === "appearance" && (
              <>
                <Row label="Theme" hint="System follows your OS light/dark setting">
                  <select
                    className="input"
                    value={s.theme}
                    onChange={(e) => set({ theme: e.target.value as Settings["theme"] })}
                    data-testid="theme-select"
                    data-hint="app.settings.theme"
                  >
                    <option value="system">System (follows your OS)</option>
                    {[true, false].map((dark) => (
                      <optgroup key={String(dark)} label={dark ? "Dark" : "Light"}>
                        {THEMES.filter((t) => t.dark === dark).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Row>
                {s.theme === "system" &&
                  (
                    [
                      ["systemDarkTheme", "When the OS is dark", true],
                      ["systemLightTheme", "When the OS is light", false],
                    ] as const
                  ).map(([key, label, dark]) => (
                    <Row key={key} label={label}>
                      <select
                        className="input"
                        value={s[key]}
                        onChange={(e) => set({ [key]: e.target.value as ThemeId })}
                        data-testid={`theme-${dark ? "dark" : "light"}`}
                        data-hint="app.settings.systemtheme"
                      >
                        {THEMES.filter((t) => t.dark === dark).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </Row>
                  ))}
                <Row label="Accent color">
                  <div
                    className="flex flex-wrap items-center gap-2"
                    data-hint="app.settings.accent"
                  >
                    <button
                      className="tool-btn border border-line"
                      data-active={s.accent === null}
                      onClick={() => set({ accent: null })}
                    >
                      Theme
                    </button>
                    {ACCENTS.map((c) => (
                      <button
                        key={c}
                        className="h-6 w-6 rounded-full"
                        style={{
                          background: c,
                          outline: s.accent === c ? "2px solid var(--select)" : undefined,
                          outlineOffset: 2,
                        }}
                        onClick={() => set({ accent: c })}
                        aria-label={`Accent ${c}`}
                      />
                    ))}
                    <input
                      type="color"
                      className="h-6 w-8 cursor-pointer rounded border border-line bg-transparent"
                      value={s.accent ?? "#7dd3fc"}
                      onChange={(e) => set({ accent: e.target.value })}
                    />
                  </div>
                </Row>
                <Row label="UI scale" hint="80–150%">
                  <input
                    type="range"
                    min={0.8}
                    max={1.5}
                    step={0.05}
                    value={s.uiScale}
                    onChange={(e) => set({ uiScale: Number(e.target.value) })}
                    className="w-48 accent-[var(--accent)]"
                    data-hint="app.settings.scale"
                  />
                  <span className="num w-10 text-[12px]">{Math.round(s.uiScale * 100)}%</span>
                  <button
                    className="tool-btn border border-line"
                    onClick={() => set({ uiScale: 1 })}
                  >
                    Reset
                  </button>
                </Row>
                <Row label="Spacing">
                  <Segmented
                    value={s.density}
                    options={[
                      { id: "comfortable", label: "Comfortable" },
                      { id: "compact", label: "Compact" },
                    ]}
                    onChange={(density) => set({ density })}
                    hint="app.settings.density"
                  />
                </Row>
                <Row label="Explain mode">
                  <Toggle
                    value={s.explain}
                    onChange={(explain) => set({ explain })}
                    hint="app.settings.explain"
                  />
                </Row>
                <Row label="Reduced motion">
                  <Segmented
                    value={s.reducedMotion}
                    options={[
                      { id: "system", label: "System" },
                      { id: "on", label: "On" },
                      { id: "off", label: "Off" },
                    ]}
                    onChange={(reducedMotion) => set({ reducedMotion })}
                    hint="app.settings.reducedmotion"
                  />
                </Row>
              </>
            )}
            {tab === "audio" && (
              <>
                <Row label="Output device" hint="Chromium browsers only">
                  <DeviceSelect
                    kind="audiooutput"
                    value={s.outputDeviceId}
                    onChange={(outputDeviceId) => set({ outputDeviceId })}
                    hint="app.settings.outputdevice"
                  />
                </Row>
                <Row label="Input device" hint="Names appear after the first microphone permission">
                  <DeviceSelect
                    kind="audioinput"
                    value={s.inputDeviceId}
                    onChange={(inputDeviceId) => set({ inputDeviceId })}
                    hint="app.settings.inputdevice"
                  />
                </Row>
                <Row
                  label="Latency"
                  hint="Lower = more responsive, higher = fewer dropouts (applies after a reload)"
                >
                  <Segmented
                    value={s.latencyMode}
                    options={[
                      { id: "interactive", label: "Low" },
                      { id: "balanced", label: "Balanced" },
                      { id: "playback", label: "Safe" },
                    ]}
                    onChange={(latencyMode) => set({ latencyMode })}
                    hint="app.settings.latency"
                  />
                </Row>
                <Row label="Recording latency" hint="Compensation for recorded audio">
                  <input
                    type="number"
                    className="input w-24"
                    value={s.recordLatencyMs}
                    min={0}
                    max={1000}
                    onChange={(e) => set({ recordLatencyMs: Number(e.target.value) || 0 })}
                    data-hint="app.settings.reclatency"
                  />
                  <span className="text-[12px] text-dim">ms</span>
                  <button
                    className="tool-btn border border-line"
                    onClick={() => setCalibrating(true)}
                    data-hint="app.settings.calibrate"
                  >
                    Calibrate…
                  </button>
                </Row>
                <Row
                  label="Let effects ring out after stop"
                  hint="Off: stop is silent at once. On: notes end, reverb and delay tails ring out"
                >
                  <Toggle
                    value={s.ringOutOnStop}
                    onChange={(ringOutOnStop) => set({ ringOutOnStop })}
                    hint="app.settings.ringout"
                  />
                </Row>
                <Row
                  label="Free first loop"
                  hint="When nothing plays yet, the first loop recording sets the tempo"
                >
                  <Toggle
                    value={s.freeFirstLoop}
                    onChange={(freeFirstLoop) => set({ freeFirstLoop })}
                    hint="app.settings.freefirstloop"
                  />
                </Row>
                <Row
                  label="Monitor while armed"
                  hint="Turn off if your interface monitors directly"
                >
                  <Toggle
                    value={s.monitorWhileArmed}
                    onChange={(monitorWhileArmed) => set({ monitorWhileArmed })}
                    hint="app.settings.monitor"
                  />
                </Row>
                <Row
                  label="Speaker mode"
                  hint="Echo cancellation on, for recording without headphones"
                >
                  <Toggle
                    value={s.speakerMode}
                    onChange={(speakerMode) => set({ speakerMode })}
                    hint="app.settings.speakermode"
                  />
                </Row>
              </>
            )}
            {tab === "midi" && <MidiSettings />}
            {tab === "project" && (
              <>
                <Row label="Autosave" hint="Saves to this browser while you work">
                  <Toggle
                    value={s.autosave}
                    onChange={(autosave) => set({ autosave })}
                    hint="app.settings.autosave"
                  />
                </Row>
                <Row label="Page switch" hint="When a queued page starts while playing">
                  <Segmented
                    value={s.pageSwitch}
                    options={[
                      { id: "page", label: "End of page" },
                      { id: "bar", label: "Next bar" },
                      { id: "beat", label: "Next beat" },
                    ]}
                    onChange={(pageSwitch) => set({ pageSwitch })}
                    hint="app.settings.pageswitch"
                  />
                </Row>
                <Row label="Count-in length">
                  <Segmented
                    value={String(s.countInBars) as "1" | "2"}
                    options={[
                      { id: "1", label: "1 bar" },
                      { id: "2", label: "2 bars" },
                    ]}
                    onChange={(v) => set({ countInBars: Number(v) })}
                    hint="app.settings.countinlen"
                  />
                </Row>
              </>
            )}
            {tab === "storage" && <StorageInfo />}
          </div>
        </div>
      </Dialog>
    </>
  );
}
