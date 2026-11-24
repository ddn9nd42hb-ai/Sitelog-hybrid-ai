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

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    });
  }
}

void boot();
