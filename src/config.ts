/**
 * Runtime configuration.
 *
 * The Firebase web config is a public identifier (security comes from App Check
 * and security rules), but it is still injected at build time through Vite env
 * vars so that no project identifiers land in a repository by accident.
 *
 * Resolution order:
 *   1. Vite env vars (VITE_FIREBASE_*)
 *   2. A config pasted into the in-app setup sheet (localStorage) — lets a judge
 *      point the app at their own Firebase project without rebuilding.
 */
import type { FirebaseOptions } from "firebase/app";

const STORAGE_KEY = "sitelog.firebase.config.v1";

export interface RuntimeConfig {
  firebase: FirebaseOptions | null;
  /** Where the config came from, for the setup sheet. */
  origin: "env" | "local" | "none";
  recaptchaSiteKey: string;
  /** Fixed App Check debug token for localhost development. */
  debugToken: string;
  cloudModel: string;
}

function envFirebase(): FirebaseOptions | null {
  const cfg = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
  };
  const complete = cfg.apiKey && cfg.projectId && cfg.appId;
  if (!complete) return null;
  return {
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain ?? `${cfg.projectId}.firebaseapp.com`,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket ?? `${cfg.projectId}.appspot.com`,
    messagingSenderId: cfg.messagingSenderId,
    appId: cfg.appId
  };
}

export function isCompleteFirebaseConfig(value: unknown): value is FirebaseOptions {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.apiKey === "string" && typeof v.projectId === "string" && typeof v.appId === "string";
}

export function readLocalFirebaseConfig(): FirebaseOptions | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCompleteFirebaseConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLocalFirebaseConfig(config: FirebaseOptions | null): void {
  if (config) localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  else localStorage.removeItem(STORAGE_KEY);
}

export function loadRuntimeConfig(): RuntimeConfig {
  const fromEnv = envFirebase();
  const fromLocal = fromEnv ? null : readLocalFirebaseConfig();
  return {
    firebase: fromEnv ?? fromLocal,
    origin: fromEnv ? "env" : fromLocal ? "local" : "none",
    recaptchaSiteKey: (import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined) ?? "",
    debugToken: (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined) ?? "",
    cloudModel: (import.meta.env.VITE_CLOUD_MODEL as string | undefined) ?? "gemini-3.5-flash-lite"
  };
}

/** True when the app runs from a local address, where App Check debug tokens are allowed. */
export function isLocalhost(): boolean {
  if (typeof location === "undefined") return false;
  return location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.hostname === "[::1]";
}

/**
 * Accepts either the JSON blob copied from the Firebase console "Add app" panel
 * or the bare `{...}` object, then returns a normalized FirebaseOptions.
 */
export function parsePastdConfig(input: string): FirebaseOptions {
  const text = input.trim().replace(/^const\s+\w+\s*=\s*/, "").replace(/;$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Allow JS-object style: `apiKey: "..."` without quotes on the keys.
    const normalized = text
      .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"');
    try {
      parsed = JSON.parse(normalized);
    } catch {
      throw new Error("That does not look like a Firebase config object.");
    }
  }
  if (!isCompleteFirebaseConfig(parsed)) {
    throw new Error("The config needs at least apiKey, projectId and appId.");
  }
  return parsed;
}
