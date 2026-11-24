/**
 * Findings -> client-facing daily report (streamed).
 *
 * Report writing is the one task that is always offered to the cloud first:
 * long-form generation is where the cloud model earns its keep, and the SDK's
 * `prefer_in_cloud` mode falls back to the device when the call fails.
 */
import type { HybridClient } from "./client";
import { REPORT_SYSTEM, buildReportPrompt } from "./prompts";
import { decideRoute, type RouteDecision } from "./router";
import type { Finding, InferenceSourceLabel, Project } from "../lib/types";

export interface ReportInput {
  project: Project;
  findings: Finding[];
  dateISO: string;
  privacyMode: boolean;
  offline: boolean;
  deviceSupported: boolean;
}

export interface ReportResult {
  text: string;
  source: InferenceSourceLabel;
  decision: RouteDecision;
  latencyMs: number;
}

export async function generateReport(
  client: HybridClient,
  input: ReportInput,
  onChunk: (text: string) => void
): Promise<ReportResult> {
  if (input.findings.length === 0) {
    throw new Error("Capture at least one finding before drafting a report.");
  }

  const prompt = buildReportPrompt(input.findings, input.project, input.dateISO);
  const decision = decideRoute({
    task: "report",
    chars: prompt.length,
    photos: 0,
    privacyMode: input.privacyMode,
    offline: input.offline,
    deviceSupported: input.deviceSupported
  });

  const result = await client.stream(
    {
      prompt,
      mode: decision.mode,
      systemInstruction: REPORT_SYSTEM,
      temperature: 0.35,
      maxOutputTokens: 1600
    },
    onChunk
  );

  return { text: result.text, source: result.source, decision, latencyMs: result.ms };
}
