# Connect SiteLog to your Firebase project

SiteLog needs its own Firebase project: Firebase AI Logic bills and rate-limits per project, and App Check tokens are issued per project. The whole setup is ~10 minutes and stays inside the free tier (Gemini Developer API backend).

## 1. Create the project (2 min)

1. Open <https://console.firebase.google.com/> and sign in.
2. **Create a project** → name it e.g. `sitelog-hybrid` → Google Analytics is **not** needed → Create.

## 2. Turn on AI Logic (3 min)

1. In the project, go to **AI Services → AI Logic** → **Get started**.
2. Choose **Gemini Developer API** as the provider (this is the free-tier, no-billing option).
3. Continue through the guided workflow. It enables the required APIs and **enforces App Check for AI Logic** — leave that on.

## 3. Register the web app and copy the config (1 min)

1. **Project settings (⚙) → Your apps → Web (</>)** → register an app named `sitelog-web`.
2. Copy the `firebaseConfig` object it shows:

```js
const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "sitelog-hybrid.firebaseapp.com",
  projectId: "sitelog-hybrid",
  storageBucket: "sitelog-hybrid.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef"
};
```

## 4. Put it in `.env`

```bash
cd work/buildhybridai_2026
cp .env.example .env
```

Fill in, from the config above:

```
VITE_FIREBASE_API_KEY=AIza…
VITE_FIREBASE_AUTH_DOMAIN=sitelog-hybrid.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sitelog-hybrid
VITE_FIREBASE_STORAGE_BUCKET=sitelog-hybrid.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
```

`npm run dev`, open <http://localhost:5173>. The header pill should stop saying "Firebase is not configured".

## 5. App Check on localhost (debug token)

App Check is enforced, and `localhost` cannot be attested with reCAPTCHA, so local development uses the debug provider.

1. With the app open on `localhost`, open **DevTools → Console**.
2. You will see:

   ```
   AppCheck debug token: "123a4567-b89c-12d3-e456-789012345678".
   ```

3. In the Firebase console: **Security → App Check → Apps** → find `sitelog-web` → **⋮ → Manage debug tokens → Add** → paste the token → Save.
4. Reload the page. If the token is not safelisted, AI Logic answers `app-check` / `permission-denied`.

**Do not commit the debug token.** In `.env` you can pin one with `VITE_APPCHECK_DEBUG_TOKEN=…` so it stays stable between restarts; keep that line out of any public build.

## 6. Gemini Nano on the device (one-time)

1. Chrome **desktop, version 139+**. On phones there is no Prompt API, so SiteLog runs cloud-first there.
2. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled** → relaunch Chrome.
3. Open DevTools → Console and check:

```js
await LanguageModel.availability();   // "available" | "downloadable" | "downloading" | "unavailable"
```

4. Press the **Gemini Nano** pill in SiteLog's header to start the download (several hundred MB, once). Until it finishes, calls fall back to the cloud and the trace says so.

## 7. Production hosting (optional but recommended)

Judges are much more likely to open a URL than to build the repo.

```bash
npm i -g firebase-tools
firebase login
firebase init hosting      # public dir: dist, single-page app: yes
npm run build
firebase deploy --only hosting
```

For production App Check, register a key in **Security → App Check → Apps → sitelog-web**. The console now offers **Fraud Defense (reCAPTCHA Enterprise)** for web apps (the classic reCAPTCHA v3 provider is being retired), and `src/ai/client.ts` wires the key through `ReCaptchaEnterpriseProvider`. Put the site key in `VITE_RECAPTCHA_SITE_KEY`, rebuild and deploy. Do not ship the debug provider to a public URL.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `api-not-enabled` | AI Logic not enabled for the project | AI Logic → Get started |
| `app-check` / permission denied | Debug token not safelisted | Step 5 |
| Every call lands `in_cloud` | No Prompt API (not desktop Chrome, or flag off) | Step 6 |
| `initializeDeviceModel` throws `unsupported` | Called before a user gesture | It must run from a click — the pill and Analyze button both satisfy this |
| Cloud calls fail with `fetch-error` | Offline or quota | Expected: the app falls back to the device |
