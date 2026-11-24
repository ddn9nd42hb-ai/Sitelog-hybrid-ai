/**
 * Domain types for SiteLog.
 *
 * Everything the UI, the store and the AI layer exchange lives here so the
 * routing policy can stay a pure function over plain data.
 */

export type Trade =
  | "structure"
  | "envelope"
  | "plumbing"
  | "electrical"
  | "hvac"
  | "tiling"
  | "joinery"
  | "finishes"
  | "safety"
  | "other";

export const TRADES: readonly Trade[] = [
  "structure",
  "envelope",
  "plumbing",
  "electrical",
  "hvac",
  "tiling",
  "joinery",
  "finishes",
  "safety",
  "other"
];

export type Severity = "low" | "medium" | "high" | "critical";

export const SEVERITIES: readonly Severity[] = ["low", "medium", "high", "critical"];

/** Where a result was actually computed, as reported by the SDK. */
export type InferenceSourceLabel = "on_device" | "in_cloud" | "unknown";

export interface FindingInput {
  trade: Trade;
  severity: Severity;
  /** Room, floor or grid reference: "3F women's restroom", "Grid C-4". */
  location: string;
  /** What is wrong, in the inspector's words. */
  issue: string;
  /** What should happen next. */
  action: string;
  /** Model's self-reported confidence, 0..1. */
  confidence: number;
}

export interface Finding extends FindingInput {
  id: string;
  projectId: string;
  createdAt: number;
  source: InferenceSourceLabel;
  latencyMs: number;
  photoId?: string;
  /** Downscaled JPEG data URL kept with the finding so it survives a reload. */
  photoDataUrl?: string;
  note: string;
}

export interface PhotoRef {
  id: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
}

export type TaskName = "extract" | "report";

export interface TraceEntry {
  id: string;
  at: number;
  task: TaskName;
  /** Mode handed to the SDK. */
  requestedMode: string;
  /** Source the SDK reports for the result. */
  source: InferenceSourceLabel;
  ms: number;
  reason: string;
  note?: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  createdAt: number;
}

export type DeviceStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "unknown";

export interface AppSettings {
  privacyMode: boolean;
  language: "auto" | "en" | "ko";
}
