/**
 * Structured-output contract.
 *
 * The same JSON Schema is handed to the on-device Prompt API
 * (`onDeviceParams.promptOptions.responseConstraint`) and to the cloud model
 * (`generationConfig.responseSchema`), so both sides of the hybrid should
 * return the same shape. Neither is trusted blindly: `parseFindings` is the
 * single gate, and a payload that fails here is what triggers a cloud
 * escalation in `analyze.ts`.
 */
import type { SchemaRequest } from "firebase/ai";
import { SEVERITIES, TRADES, type FindingInput, type Severity, type Trade } from "../lib/types";

export const FINDINGS_RESPONSE_SCHEMA: SchemaRequest = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          trade: { type: "string", enum: [...TRADES] },
          severity: { type: "string", enum: [...SEVERITIES] },
          location: { type: "string" },
          issue: { type: "string" },
          action: { type: "string" },
          confidence: { type: "number" }
        },
        required: ["trade", "severity", "location", "issue", "action", "confidence"]
      }
    }
  },
  required: ["findings"]
};

export interface ParseFindingsResult {
  ok: boolean;
  findings: FindingInput[];
  error?: string;
}

function asTrade(value: unknown): Trade {
  const v = String(value ?? "").toLowerCase().trim();
  const hit = TRADES.find((t) => t === v);
  if (hit) return hit;
  const aliases: Record<string, Trade> = {
    structural: "structure",
    concrete: "structure",
    facade: "envelope",
    waterproofing: "envelope",
    window: "envelope",
    water: "plumbing",
    drain: "plumbing",
    electric: "electrical",
    wiring: "electrical",
    electrics: "electrical",
    air: "hvac",
    ventilation: "hvac",
    tile: "tiling",
    tiles: "tiling",
    carpentry: "joinery",
    millwork: "joinery",
    paint: "finishes",
    finishing: "finishes",
    plaster: "finishes",
    hazard: "safety"
  };
  return aliases[v] ?? "other";
}

function asSeverity(value: unknown): Severity {
  const v = String(value ?? "").toLowerCase().trim();
  const hit = SEVERITIES.find((s) => s === v);
  if (hit) return hit;
  const aliases: Record<string, Severity> = {
    minor: "low",
    cosmetic: "low",
    notice: "low",
    moderate: "medium",
    normal: "medium",
    major: "high",
    serious: "high",
    urgent: "critical",
    blocker: "critical",
    stop: "critical"
  };
  return aliases[v] ?? "medium";
}

function asText(value: unknown, max = 600): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Pulls the outermost JSON object/array out of a model reply. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("empty response");

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const direct = candidate.trim();
    try {
      return JSON.parse(direct);
    } catch {
      // fall through to bracket slicing
    }
    const start = direct.search(/[[{]/);
    const end = Math.max(direct.lastIndexOf("}"), direct.lastIndexOf("]"));
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(direct.slice(start, end + 1));
      } catch {
        // keep trying
      }
    }
  }
  throw new Error("no JSON payload found");
}

interface SanitizeFailure {
  ok: false;
  error: string;
}

/**
 * Validates and repairs a model payload.
 * Repairs are intentionally forgiving (enum aliases, number coercion) because
 * a small on-device model drifts; anything that cannot be repaired fails, and
 * the caller escalates.
 */
export function parseFindings(text: string): ParseFindingsResult {
  let payload: unknown;
  try {
    payload = extractJson(text);
  } catch (err) {
    return { ok: false, findings: [], error: (err as Error).message };
  }

  const list: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { findings?: unknown })?.findings)
      ? ((payload as { findings: unknown[] }).findings as unknown[])
      : [];

  if (list.length === 0) {
    return { ok: false, findings: [], error: "no findings in payload" };
  }

  const findings: FindingInput[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const issue = asText(item.issue);
    if (!issue) continue;

    const confidenceRaw = Number(item.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.6;

    findings.push({
      trade: asTrade(item.trade),
      severity: asSeverity(item.severity),
      location: asText(item.location, 120) || "Unspecified location",
      issue,
      action: asText(item.action) || "Review on site with the responsible trade.",
      confidence
    });
  }

  if (findings.length === 0) {
    return { ok: false, findings: [], error: "no usable findings after validation" };
  }
  return { ok: true, findings };
}

/** A finding the model itself was unsure about is worth a second opinion. */
export function needsSecondOpinion(findings: FindingInput[], threshold = 0.55): boolean {
  return findings.some((f) => f.confidence < threshold);
}

export type { SanitizeFailure };
