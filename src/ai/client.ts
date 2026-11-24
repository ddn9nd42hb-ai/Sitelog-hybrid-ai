/**
 * The one place that talks to Firebase AI Logic.
 *
 * Every model call in SiteLog goes through `FirebaseHybridClient`, which builds
 * a `GenerativeModel` with an explicit `InferenceMode` and reads back
 * `response.inferenceSource` so the UI can show where the answer came from.
 */
import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import {
  GoogleAIBackend,
  getAI,
  getGenerativeModel,
  type AI,
  type GenerativeModel,
  type GenerationConfig,
  type InferenceMode,
  type Part,
  type SchemaRequest
} from "firebase/ai";
import type { DeviceStatus, InferenceSourceLabel } from "../lib/types";

export interface GenerateParams {
  prompt: string | Part[];
  mode: InferenceMode;
  systemInstruction: string;
  schema?: SchemaRequest;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateOutput {
  text: string;
  source: InferenceSourceLabel;
  ms: number;
}

export interface HybridClient {
  readonly ready: boolean;
  deviceStatus(): Promise<DeviceStatus>;
  prepareDevice(onProgress?: (progress: number) => void): Promise<void>;
  generate(params: GenerateParams): Promise<GenerateOutput>;
  stream(params: GenerateParams, onChunk: (text: string) => void): Promise<GenerateOutput>;
}

export class SiteLogAIError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly hint?: string
  ) {
    super(message);
    this.name = "SiteLogAIError";
  }
}

interface SetupOptions {
  firebase: FirebaseOptions;
  cloudModel: string;
  recaptchaSiteKey?: string;
  debugToken?: string;
  useDebugToken?: boolean;
}

export class FirebaseHybridClient implements HybridClient {
  private app: FirebaseApp | null = null;
  private ai: AI | null = null;
  private probe: GenerativeModel | null = null;
  private initError: SiteLogAIError | null = null;

  constructor(private readonly options: SetupOptions) {
    this.init();
  }

  get ready(): boolean {
    return this.ai !== null;
  }

  get lastError(): SiteLogAIError | null {
    return this.initError;
  }

  private init(): void {
    try {
      this.app = getApps().length > 0 ? getApp() : initializeApp(this.options.firebase);

      // App Check: AI Logic requires it. A debug token is acceptable for local
      // development and for hackathon judging (see docs/firebase-setup.md).
      const debug = this.options.useDebugToken === true || Boolean(this.options.debugToken);
      if (debug) {
        const globals = globalThis as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean };
        globals.FIREBASE_APPCHECK_DEBUG_TOKEN = this.options.debugToken || true;
      }
      if (this.options.recaptchaSiteKey) {
        initializeAppCheck(this.app, {
          provider: new ReCaptchaV3Provider(this.options.recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true
        });
      } else if (!debug) {
        // No attestation provider at all: AI Logic will reject calls, so say so now.
        this.initError = new SiteLogAIError(
          "App Check is not configured.",
          "appcheck-missing",
          "Add VITE_RECAPTCHA_SITE_KEY for production, or an App Check debug token for localhost."
        );
      }

      this.ai = getAI(this.app, { backend: new GoogleAIBackend() });
    } catch (err) {
      this.initError = new SiteLogAIError(
        err instanceof Error ? err.message : "Firebase failed to initialize.",
        "init-failed",
        "Check the Firebase config pasted in Settings."
      );
    }
  }

  private requireAI(): AI {
    if (!this.ai) {
      throw (
        this.initError ??
        new SiteLogAIError("Firebase is not configured.", "no-config", "Open Settings and paste your Firebase config.")
      );
    }
    return this.ai;
  }

  private buildModel(params: GenerateParams): GenerativeModel {
    const ai = this.requireAI();
    const generationConfig: GenerationConfig = {
      temperature: params.temperature ?? 0.2,
      ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
      ...(params.schema
        ? { responseMimeType: "application/json", responseSchema: params.schema }
        : {})
    };

    return getGenerativeModel(ai, {
      mode: params.mode,
      inCloudParams: {
        model: this.options.cloudModel,
        systemInstruction: params.systemInstruction,
        generationConfig
      },
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: "text" }, { type: "image" }],
          initialPrompts: [
            { role: "system", content: [{ type: "text", value: params.systemInstruction }] }
          ]
        },
        ...(params.schema ? { promptOptions: { responseConstraint: params.schema } } : {})
      }
    });
  }

  /**
   * Capability probe for the UI chip.
   *
   * The SDK does not expose availability, so we ask the Chrome Prompt API
   * directly. This is a *hint only*: every inference call still goes through
   * Firebase AI Logic, which owns the actual fallback decision.
   */
  async deviceStatus(): Promise<DeviceStatus> {
    return probeDeviceStatus();
  }

  /**
   * Warms up (and if needed downloads) the on-device model.
   * Must be called from a user gesture — Chrome's Prompt API requires it.
   */
  async prepareDevice(onProgress?: (progress: number) => void): Promise<void> {
    if (!this.probe) {
      this.probe = this.buildModel({
        prompt: "warm-up",
        mode: "prefer_on_device",
        systemInstruction: "You are a site inspector assistant."
      });
    }
    try {
      await this.probe.initializeDeviceModel(onProgress);
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  async generate(params: GenerateParams): Promise<GenerateOutput> {
    const model = this.buildModel(params);
    const started = now();
    try {
      const result = await model.generateContent(params.prompt);
      const response = result.response;
      let text = "";
      try {
        text = response.text();
      } catch {
        throw new SiteLogAIError(
          "The model returned no text.",
          "empty-response",
          "Try a shorter note, or check the safety settings in the Firebase console."
        );
      }
      return {
        text,
        source: (response.inferenceSource ?? "unknown") as InferenceSourceLabel,
        ms: Math.round(now() - started)
      };
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  async stream(params: GenerateParams, onChunk: (text: string) => void): Promise<GenerateOutput> {
    const model = this.buildModel(params);
    const started = now();
    try {
      const { stream, response } = await model.generateContentStream(params.prompt);
      let buffer = "";
      for await (const chunk of stream) {
        let piece = "";
        try {
          piece = chunk.text();
        } catch {
          piece = "";
        }
        if (piece) {
          buffer += piece;
          onChunk(piece);
        }
      }
      const final = await response;
      return {
        text: buffer || (final.text?.() ?? ""),
        source: ((final.inferenceSource ?? "unknown") as InferenceSourceLabel),
        ms: Math.round(now() - started)
      };
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  private normalizeError(err: unknown): SiteLogAIError {
    if (err instanceof SiteLogAIError) return err;
    const code = (err as { code?: string })?.code ?? "unknown";
    const message = err instanceof Error ? err.message : String(err);

    switch (code) {
      case "fetch-error":
        return new SiteLogAIError(
          "The cloud model could not be reached.",
          code,
          "You are probably offline. On-device inference still works in Chrome with Gemini Nano."
        );
      case "api-not-enabled":
        return new SiteLogAIError(
          "Firebase AI Logic is not enabled for this project.",
          code,
          "In the Firebase console open AI Services → AI Logic → Get started."
        );
      case "unsupported":
        return new SiteLogAIError(
          "This request needs a capability that is not available on this device.",
          code,
          "Turn off privacy mode, or use a shorter note so the cloud model can take it."
        );
      case "request-error":
      case "response-error":
        return new SiteLogAIError(message, code, "Try again, or shorten the note.");
      default:
        return new SiteLogAIError(message, code);
    }
  }
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Asks the Chrome Prompt API what it can do. A hint for the UI only — the SDK
 * still owns the real fallback decision on every call.
 */
export async function probeDeviceStatus(): Promise<DeviceStatus> {
  const lm = (globalThis as unknown as {
    LanguageModel?: { availability?: (options?: object) => Promise<string> };
  }).LanguageModel;
  if (!lm?.availability) return "unavailable";

  const normalize = (value: string): DeviceStatus =>
    value === "available" || value === "downloadable" || value === "downloading" ? value : "unavailable";

  try {
    return normalize(await lm.availability({ expectedInputs: [{ type: "text" }, { type: "image" }] }));
  } catch {
    try {
      return normalize(await lm.availability());
    } catch {
      return "unknown";
    }
  }
}

/**
 * Stand-in used before a Firebase project is connected, so the product can be
 * explored (and the setup sheet opened) instead of crashing on boot.
 */
export class UnconfiguredClient implements HybridClient {
  readonly ready = false;

  async deviceStatus(): Promise<DeviceStatus> {
    return probeDeviceStatus();
  }

  async prepareDevice(): Promise<void> {
    throw new SiteLogAIError(
      "No Firebase project is connected.",
      "no-config",
      "Open Settings and paste your Firebase config."
    );
  }

  async generate(): Promise<GenerateOutput> {
    throw new SiteLogAIError(
      "No Firebase project is connected.",
      "no-config",
      "Open Settings and paste your Firebase config, then reload."
    );
  }

  async stream(): Promise<GenerateOutput> {
    throw new SiteLogAIError(
      "No Firebase project is connected.",
      "no-config",
      "Open Settings and paste your Firebase config, then reload."
    );
  }
}
