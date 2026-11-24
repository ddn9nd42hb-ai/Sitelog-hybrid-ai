/**
 * One site note -> findings.
 *
 * The interesting part is the escalation rule: when the on-device model returns
 * something the validator cannot trust, the same prompt is re-run in the cloud.
 * That is the *point* of hybrid — the cheap path handles the normal case and
 * the expensive path is reserved for the cases that need it.
 */
import type { HybridClient } from "./client";
import { EXTRACT_SYSTEM, buildExtractPrompt } from "./prompts";
import { FINDINGS_RESPONSE_SCHEMA, needsSecondOpinion, parseFindings } from "./schema";
import { decideRoute, type RouteDecision } from "./router";
import type { FindingInput, InferenceSourceLabel, PhotoRef, Trade } from "../lib/types";

export interface AnalyzeInput {
  note: string;
  photos: PhotoRef[];
  tradeHint?: Trade;
  privacyMode: boolean;
  offline: boolean;
  deviceSupported: boolean;
}

export interface AnalyzeResult {
  findings: FindingInput[];
  source: InferenceSourceLabel;
  decision: RouteDecision;
  escalated: boolean;
  latencyMs: number;
  /** Photos that did not fit the on-device single-photo session. */
  droppedPhotos: number;
}

export class AnalyzeError extends Error {
  constructor(
    message: string,
    readonly decision: RouteDecision,
    readonly hint?: string
  ) {
    super(message);
    this.name = "AnalyzeError";
  }
}

function toParts(photos: Array<{ dataUrl: string }>, note: string, maxPhotos: number) {
  const parts: Array<Record<string, unknown>> = [];
  for (const photo of photos.slice(0, maxPhotos)) {
    const comma = photo.dataUrl.indexOf(",");
    const header = photo.dataUrl.slice(0, comma);
    const mimeType = header.slice(header.indexOf(":") + 1, header.indexOf(";"));
    parts.push({ inlineData: { mimeType, data: photo.dataUrl.slice(comma + 1) } });
  }
  parts.push({ text: note });
  return parts;
}

export async function analyzeNote(client: HybridClient, input: AnalyzeInput): Promise<AnalyzeResult> {
  const note = input.note.trim();
  if (!note && input.photos.length === 0) {
    throw new AnalyzeError("Add a note or a photo first.", decideRoute({ ...routeBase(input), task: "extract" }));
  }

  const decision = decideRoute({
    task: "extract",
    chars: note.length,
    photos: input.photos.length,
    privacyMode: input.privacyMode,
    offline: input.offline,
    deviceSupported: input.deviceSupported
  });

  const photoBudget = decision.mode === "prefer_on_device" || decision.mode === "only_on_device"
    ? 1
    : input.photos.length;

  const prompt = toParts(input.photos, buildExtractPrompt(note, { photos: input.photos.length, trade: input.tradeHint }), photoBudget);

  let result;
  try {
    result = await client.generate({
      prompt: prompt as never,
      mode: decision.mode,
      systemInstruction: EXTRACT_SYSTEM,
      schema: FINDINGS_RESPONSE_SCHEMA,
      temperature: 0.15,
      maxOutputTokens: 900
    });
  } catch (err) {
    throw new AnalyzeError(
      err instanceof Error ? err.message : "The model call failed.",
      decision,
      (err as { hint?: string }).hint
    );
  }

  let parsed = parseFindings(result.text);
  let escalated = false;
  let source = result.source;
  let latencyMs = result.ms;

  const canEscalate =
    !parsed.ok || needsSecondOpinion(parsed.findings, 0.55)
      ? decision.mode !== "only_in_cloud" && !input.privacyMode && !input.offline
      : false;

  if (canEscalate) {
    escalated = true;
    try {
      const second = await client.generate({
        prompt: prompt as never,
        mode: "only_in_cloud",
        systemInstruction: EXTRACT_SYSTEM,
        schema: FINDINGS_RESPONSE_SCHEMA,
        temperature: 0.1,
        maxOutputTokens: 900
      });
      const reparsed = parseFindings(second.text);
      if (reparsed.ok) {
        parsed = reparsed;
        source = second.source;
        latencyMs += second.ms;
      }
    } catch {
      // Keep the on-device answer; the trace already records the attempt.
    }
  }

  if (!parsed.ok) {
    throw new AnalyzeError(
      "The model did not return usable findings.",
      decision,
      input.privacyMode
        ? "Privacy mode keeps this on the device. Try a shorter, more concrete note."
        : "Try again, or rephrase the note as one defect per sentence."
    );
  }

  return {
    findings: parsed.findings,
    source,
    decision,
    escalated,
    latencyMs,
    droppedPhotos: Math.max(0, input.photos.length - photoBudget)
  };
}

function routeBase(input: AnalyzeInput) {
  return {
    chars: input.note.trim().length,
    photos: input.photos.length,
    privacyMode: input.privacyMode,
    offline: input.offline,
    deviceSupported: input.deviceSupported
  };
}
