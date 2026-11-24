import "./styles.css";
import { isLocalhost, loadRuntimeConfig } from "./config";
import { FirebaseHybridClient, UnconfiguredClient, type HybridClient } from "./ai/client";
import { getStore } from "./store/db";
import { mountApp } from "./ui/app";
import type { AppSettings } from "./lib/types";

const DEFAULT_SETTINGS: AppSettings = { privacyMode: false, language: "auto" };

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;

  const config = loadRuntimeConfig();
  const store = await getStore();
  const settings = (await store.getMeta<AppSettings>("settings")) ?? DEFAULT_SETTINGS;

  const client: HybridClient = config.firebase
    ? new FirebaseHybridClient({
        firebase: config.firebase,
        cloudModel: config.cloudModel,
        recaptchaSiteKey: config.recaptchaSiteKey,
        debugToken: config.debugToken,
        useDebugToken: isLocalhost() && !config.recaptchaSiteKey
      })
    : new UnconfiguredClient();

  await mountApp(root, {
    client,
    store,
    settings,
    configured: Boolean(config.firebase),
    projectLabel: "Riverside Café — fit-out"
  });

  // Register the shell cache as early as possible: the offline story depends on
  // it, and boot() may finish after the window `load` event has already fired.
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch((err: unknown) => {
        console.warn("Service worker registration failed:", err);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}

void boot();
