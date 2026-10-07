declare module "signalsmith-stretch" {
  export interface StretchSchedule {
    output?: number;
    active?: boolean;
    input?: number;
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  }
  export interface StretchNode extends AudioNode {
    inputTime: number;
    schedule(s: StretchSchedule): void;
    start(
      when?: number,
      offset?: number,
      duration?: number,
      rate?: number,
      semitones?: number,
    ): void;
    stop(when?: number): void;
    addBuffers(buffers: Float32Array[]): Promise<number>;
    dropBuffers(): Promise<unknown>;
    setUpdateInterval(seconds: number, callback?: (t: number) => void): void;
  }
  export default function SignalsmithStretch(
    context: BaseAudioContext,
    options?: AudioWorkletNodeOptions,
  ): Promise<StretchNode>;
}
