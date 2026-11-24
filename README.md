# SiteLog — hybrid field notes for construction sites

**Field notes in, client-ready report out — on the device when it can, in the cloud when it must.**

SiteLog is a web app for interior fit-out and construction inspectors. An inspector walks a site, types a raw note (and optionally snaps a photo), and SiteLog turns it into structured, actionable findings and a client-ready daily report.

Everything AI runs through **Firebase AI Logic hybrid inference**: Gemini Nano 4 on Chrome when the device has it, `gemini-3.5-flash-lite` in the cloud when it does not.

Built for the **Google #BuildHybridAI 2026** hackathon (Web / Chrome platform).

---

## Why hybrid is the right shape for this job

Construction sites are the worst place for a cloud-only assistant and the best place for a hybrid one:

| Site reality | What it does to a cloud-only app | What SiteLog does |
| --- | --- | --- |
| Basements, cores and lift shafts have no signal | The app stops working exactly where the notes are taken | Writes the report on the device, queues the rest |
| Client names, defects and photos are commercially sensitive | Every note leaves the building | Short notes stay on the device |
| A 40-item punch list is long | Cloud round-trip on every tap | Bulk work is handed to the cloud in one call |
| Free-tier quotas | Burns quota on trivia | Only the work the device cannot do reaches the cloud |

## What runs where

Every call carries an explicit `InferenceMode` and the UI shows the `inferenceSource` the SDK reports back.

| Task | Mode | Why |
| --- | --- | --- |
| One short note (≤1,200 chars, ≤1 photo) | `prefer_on_device` | Private, instant, free, works offline |
| A long note or several photos | `prefer_in_cloud` | Exceeds what a single on-device session handles |
| Client report (long-form writing) | `prefer_in_cloud` | Cloud writes it; the device takes over if the call fails |
| Privacy mode (any task) | `only_on_device` | Client data must not leave the machine, full stop |
| Offline | `prefer_on_device` | The cloud is unreachable, so do not wait for it |

**Escalation:** a device answer that fails schema validation, or that the model itself marks below 0.55 confidence, is re-run `only_in_cloud`. That is the second reason to be hybrid: the cheap path handles the normal case, the expensive path is reserved for the cases that need it.

## Features

- **Capture** — one note, optional photo (camera or file), optional trade tag.
- **Structured findings** — each note becomes JSON findings (`trade`, `severity`, `location`, `issue`, `action`, `confidence`) via a JSON Schema handed to *both* paths: `onDeviceParams.promptOptions.responseConstraint` on device, `generationConfig.responseSchema` in the cloud.
- **Live routing hint** — the capture card tells you, before you press the button, whether this note will run on-device or in the cloud, and why.
- **Hybrid trace** — a rail showing every call: requested mode, the source the SDK actually used, latency, and the reason.
- **Client report** — streamed Markdown, grouped by severity, copyable and downloadable.
- **Privacy mode** — pins every call to `only_on_device`.
- **Offline-first** — service worker shell cache, findings in IndexedDB, works with the network off.

## How it works

```
note + photo
     │
     ▼
decideRoute()            src/ai/router.ts      pure policy: chars, photos, offline, privacy
     │
     ▼
FirebaseHybridClient     src/ai/client.ts      getAI + getGenerativeModel({ mode, onDeviceParams, inCloudParams })
     │
     ▼  response.inferenceSource
parseFindings()          src/ai/schema.ts      validate / repair; failure ⇒ escalate
     │
     ▼
Finding → IndexedDB → findings list → generateReport() → streamed client report
```

### Where Firebase AI Logic is called

| File | Call |
| --- | --- |
| `src/ai/client.ts` | `getAI(app, { backend: new GoogleAIBackend() })`, `getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })`, `model.initializeDeviceModel()`, `model.generateContent()`, `model.generateContentStream()` |
| `src/ai/client.ts` | `initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey) })` |
| `src/ai/router.ts` | `InferenceMode.PREFER_ON_DEVICE` / `PREFER_IN_CLOUD` / `ONLY_ON_DEVICE` / `ONLY_IN_CLOUD` |
| `src/ui/app.ts` | renders `response.inferenceSource` (`on_device` / `in_cloud`) on every finding and trace row |

Requires `firebase@13.4.0` (hybrid inference landed in the 12.5 line; this project pins 13.4.0 because it uses `initializeDeviceModel`).

## Quick start

**Requirements:** Node 20+, and for on-device inference **Chrome on desktop, version 139+**.

```bash
npm install
cp .env.example .env      # then fill in your Firebase config (see docs/firebase-setup.md)
npm run dev               # http://localhost:5173
```

Without a Firebase project the app still boots and shows its setup sheet — it just cannot run AI yet.

For on-device inference on localhost:

1. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled**, restart Chrome.
2. Open DevTools → Console once to read the App Check debug token, and safelist it in the Firebase console (Security → App Check → Apps → Manage debug tokens). See `docs/firebase-setup.md`.
3. Click the "Gemini Nano" pill in the header to download the model (several hundred MB, once).

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest: 38 tests, including a jsdom UI smoke test
npm run build       # tsc --noEmit && vite build
```

The suite covers the routing policy, schema validation and repair, the escalation path, report streaming, markdown escaping and a full DOM flow (load sample note → analyze → render finding → draft report) against a fake `HybridClient`.

## Project structure

```
src/
  ai/       client.ts (the only Firebase AI Logic caller) · router.ts · schema.ts · prompts.ts · analyze.ts · report.ts
  store/    db.ts (IndexedDB with an in-memory fallback)
  ui/       app.ts (one render function per region)
  lib/      image.ts (downscale to 1280px JPEG) · format.ts · types.ts
tests/      router · schema · analyze · report · format · UI smoke
docs/       firebase-setup.md · devpost-submission.md · video-script.md
```

## Limitations

- On-device inference is **desktop Chrome only** (Chrome's Prompt API). On a phone, SiteLog runs cloud-first; the trace says so on every call.
- On-device inference is single-turn: one photo per note. Extra photos are reported in the trace and left for a cloud escalation.
- The Firebase web config is a public identifier; protection comes from App Check and security rules. Never commit an App Check **debug token**.

## License

Apache-2.0 — see [LICENSE](LICENSE).
