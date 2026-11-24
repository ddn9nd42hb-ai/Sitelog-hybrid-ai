import type { GenerateOutput, GenerateParams, HybridClient } from "../src/ai/client";
import type { DeviceStatus, InferenceSourceLabel } from "../src/lib/types";

export interface FakeCall {
  params: GenerateParams;
}

export interface FakeClientOptions {
  device?: DeviceStatus;
  /** Ordered replies for generate(). */
  replies?: Array<{ text: string; source?: InferenceSourceLabel } | Error>;
  streamReply?: string;
}

export class FakeClient implements HybridClient {
  readonly ready = true;
  readonly calls: FakeCall[] = [];
  readonly prepared: number[] = [];
  private replies: Array<{ text: string; source?: InferenceSourceLabel } | Error>;

  constructor(private readonly options: FakeClientOptions = {}) {
    this.replies = [...(options.replies ?? [{ text: '{"findings":[]}', source: "on_device" }])];
  }

  async deviceStatus(): Promise<DeviceStatus> {
    return this.options.device ?? "available";
  }

  async prepareDevice(onProgress?: (progress: number) => void): Promise<void> {
    onProgress?.(1);
    this.prepared.push(1);
  }

  async generate(params: GenerateParams): Promise<GenerateOutput> {
    this.calls.push({ params });
    const reply = this.replies.shift() ?? { text: '{"findings":[]}', source: "on_device" as const };
    if (reply instanceof Error) throw reply;
    return { text: reply.text, source: reply.source ?? "on_device", ms: 420 };
  }

  async stream(params: GenerateParams, onChunk: (text: string) => void): Promise<GenerateOutput> {
    this.calls.push({ params });
    const text = this.options.streamReply ?? "## Site report\n\nAll good today.";
    for (const chunk of text.match(/.{1,8}/gs) ?? []) onChunk(chunk);
    return { text, source: "in_cloud", ms: 900 };
  }
}

export const FINDING_JSON = JSON.stringify({
  findings: [
    {
      trade: "plumbing",
      severity: "high",
      location: "3F women's restroom",
      issue: "Water stain spreading on the ceiling under the riser cupboard.",
      action: "Open the ceiling and pressure-test the riser before tiling.",
      confidence: 0.86
    }
  ]
});

export const GARBAGE = "Sure! Here is my analysis: the ceiling looks wet.";
