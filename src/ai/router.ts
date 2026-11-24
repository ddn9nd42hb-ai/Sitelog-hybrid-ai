/**
 * The routing policy: the one place that decides whether a prompt runs on the
 * device or in the cloud.
 *
 * Kept as a pure function so the policy is unit-testable and so the UI can
 * explain *why* a given note went where it went before any model is warmed up.
 *
 * Ground rules taken from the Firebase AI Logic hybrid docs:
 *  - On-device (Chrome Prompt API) only supports **single-turn** text/JPEG/PNG
 *    generation, so long notes and multi-photo batches are not a good fit.
 *  - `PREFER_ON_DEVICE` / `PREFER_IN_CLOUD` fall back automatically, so we
 *    express intent rather than hard failure, except in privacy mode where the
 *    whole point is that nothing leaves the device.
 */
import type { InferenceMode } from "firebase/ai";
import type { TaskName } from "../lib/types";

/** Above this, a note is no longer a "single quick observation". */
export const ON_DEVICE_CHAR_BUDGET = 1200;
/** Photos per request that the on-device session can handle comfortably. */
export const ON_DEVICE_PHOTO_BUDGET = 1;

export type RouteCode =
  | "privacy"
  | "offline"
  | "report"
  | "long-note"
  | "multi-photo"
  | "short-note";

export interface RouteInput {
  task: TaskName;
  chars: number;
  photos: number;
  privacyMode: boolean;
  offline: boolean;
  /** Whether this browser/device can run Gemini Nano at all. */
  deviceSupported: boolean;
}

export interface RouteDecision {
  mode: InferenceMode;
  code: RouteCode;
  /** Short, user-facing sentence shown in the trace rail. */
  reason: string;
  /** Two-to-four word label for the capture hint. */
  shortReason: string;
  /** Set when the decision cannot actually be honoured (e.g. privacy mode without Nano). */
  warning?: string;
}

export function decideRoute(input: RouteInput): RouteDecision {
  const { task, chars, photos, privacyMode, offline, deviceSupported } = input;

  if (privacyMode) {
    return {
      mode: "only_on_device",
      code: "privacy",
      reason: "Privacy mode: client data is not allowed to leave this device.",
      shortReason: "Privacy mode · on-device only",
      warning: deviceSupported
        ? undefined
        : "This browser has no on-device model, so privacy mode cannot run here."
    };
  }

  if (offline) {
    return {
      mode: "prefer_on_device",
      code: "offline",
      reason: "Offline: the cloud is unreachable, so the note is processed on the device.",
      shortReason: "Offline · on-device",
      warning: deviceSupported
        ? undefined
        : "Offline and no on-device model available — this note cannot be processed yet."
    };
  }

  if (task === "report") {
    return {
      mode: "prefer_in_cloud",
      code: "report",
      reason:
        "Long-form client report: the cloud model writes it, and the device takes over if the call fails.",
      shortReason: "Cloud · long-form writing",
      warning: deviceSupported
        ? undefined
        : undefined
    };
  }

  const reasons: string[] = [];
  if (chars > ON_DEVICE_CHAR_BUDGET) {
    reasons.push(`${chars.toLocaleString()} characters exceeds the on-device budget`);
  }
  if (photos > ON_DEVICE_PHOTO_BUDGET) {
    reasons.push(`${photos} photos exceed the on-device single-photo session`);
  }
  if (reasons.length > 0) {
    return {
      mode: "prefer_in_cloud",
      code: chars > ON_DEVICE_CHAR_BUDGET ? "long-note" : "multi-photo",
      reason: `${reasons.join(" and ")} — handed to the cloud model.`,
      shortReason: chars > ON_DEVICE_CHAR_BUDGET ? "Cloud · long note" : "Cloud · multiple photos"
    };
  }

  return {
    mode: "prefer_on_device",
    code: "short-note",
    reason: deviceSupported
      ? "Short note: processed on the device — private, offline-capable and free to run."
      : "Short note: the device model is not available here, so the SDK falls back to the cloud.",
    shortReason: deviceSupported ? "On-device · short note" : "Cloud · no device model"
  };
}

/** Human label for a mode, used in the trace rail and the setup sheet. */
export function describeMode(mode: InferenceMode | string): string {
  switch (mode) {
    case "only_on_device":
      return "On-device only";
    case "prefer_on_device":
      return "Prefer on-device";
    case "only_in_cloud":
      return "Cloud only";
    case "prefer_in_cloud":
      return "Prefer cloud";
    default:
      return String(mode);
  }
}
