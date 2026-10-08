import { FORMAT_INFO, type AudioFormat } from "../library/encode";

const DEFAULTS: Record<AudioFormat["kind"], AudioFormat> = {
  wav: { kind: "wav", bits: 24 },
  mp3: { kind: "mp3", bitrate: 320 },
  ogg: { kind: "ogg", quality: 6 },
};

/** File format and quality for audio exports. */
export function FormatPicker({
  value,
  onChange,
}: {
  value: AudioFormat;
  onChange: (f: AudioFormat) => void;
}) {
  const options: { label: string; format: AudioFormat }[] =
    value.kind === "wav"
      ? ([16, 24, 32] as const).map((bits) => ({
          label: bits === 32 ? "32 float" : `${bits}-bit`,
          format: { kind: "wav", bits },
        }))
      : value.kind === "mp3"
        ? ([128, 192, 320] as const).map((bitrate) => ({
            label: `${bitrate} kbit/s`,
            format: { kind: "mp3", bitrate },
          }))
        : ([3, 6, 9] as const).map((quality) => ({
            label: quality === 3 ? "Small" : quality === 6 ? "Good" : "Best",
            format: { kind: "ogg", quality },
          }));
  const same = (a: AudioFormat, b: AudioFormat) => JSON.stringify(a) === JSON.stringify(b);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="segmented" data-hint="app.export.format" data-testid="export-format">
        {(["wav", "mp3", "ogg"] as const).map((k) => (
          <button key={k} data-active={value.kind === k} onClick={() => onChange(DEFAULTS[k])}>
            {FORMAT_INFO[k].label}
          </button>
        ))}
      </div>
      <div className="segmented" data-hint={`app.export.quality.${value.kind}`}>
        {options.map((o) => (
          <button
            key={o.label}
            data-active={same(o.format, value)}
            onClick={() => onChange(o.format)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
