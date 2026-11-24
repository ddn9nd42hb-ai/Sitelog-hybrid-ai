# Verification log

What was actually run, on 2026-11-24, in the workspace (`work/buildhybridai_2026`).
Node v22.14.0, npm 10.9.2, `firebase@13.4.0`.

## 1. Type check — `npm run typecheck`

```
tsc --noEmit   →  exit 0, no diagnostics
```

This is not cosmetic: the Firebase AI Logic surface (`getAI`, `getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams })`, `InferenceMode`, `InferenceSource`, `initializeDeviceModel`, `response.inferenceSource`, `SchemaRequest`) is checked against the SDK's own `.d.ts`, so a wrong signature or a renamed export fails here.

## 2. Tests — `npm test` (vitest)

```
Test Files  6 passed (6)
     Tests  38 passed (38)
```

| File | Covers |
| --- | --- |
| `tests/router.test.ts` (9) | every routing branch: short note → device, long note → cloud, multi-photo → cloud, privacy override, offline, report, no-device-model |
| `tests/schema.test.ts` (10) | JSON extraction from fenced/prose replies, enum drift repair, confidence clamping, rejection of prose and of findings with no issue |
| `tests/analyze.test.ts` (8) | device answer kept; invalid JSON escalates to `only_in_cloud`; low confidence escalates; privacy mode never escalates; offline never calls the cloud; photo budget per path |
| `tests/report.test.ts` (3) | streamed report, source propagation, privacy mode pins `only_on_device`, empty report refused |
| `tests/format.test.ts` (5) | markdown rendering escapes model output, headings/lists, source labels, relative time |
| `tests/ui.smoke.test.ts` (3) | **jsdom end-to-end**: mount → "Load sample note" → "Analyze note" → finding card with an `On-device` badge + trace row → "Draft report" renders the streamed markdown; empty note makes no model call |

The UI smoke test runs the real `mountApp` with the real `analyzeNote`/`generateReport` pipelines against a fake `HybridClient`, so the wiring between UI, policy, schema and escalation is exercised, not mocked out.

## 3. Production build — `npm run build`

```
vite v6.4.6 building for production...
28 modules transformed
dist/index.html                    1.00 kB │ gzip:  0.54 kB
dist/assets/index-*.css           10.97 kB │ gzip:  3.15 kB
dist/assets/index-*.js           150.62 kB │ gzip: 36.92 kB
✓ built in 1.46s
```

## 4. Offline behaviour, verified in Chromium

Served `dist/` (built with the precache step) and drove it in headless Chromium 159:

```
ONLINE hint:  On-device · short note
SW registrations: 1   caches: ['sitelog-e5b7ef2a2084']
OFFLINE hint: Offline · on-device
net pill:     Offline
reload while offline OK · title: SiteLog — hybrid field notes
pageerrors:   []
```

The reload line is the important one: with the network cut, the service worker serves the app shell **and** the hashed JS/CSS bundle, so the app boots offline on a first-visit device. `scripts/precache.mjs` injects the build asset list into `dist/sw.js` at build time; without it the first-visit-then-offline case fails (found and fixed during this verification).

## 5. Real-browser render (headless Chromium 159)

The built `dist/` was served locally and opened in headless Chromium at 1280×980 and 402×860:

- app boots, no `pageerror`, no console errors
- header pills resolve: `Online`, and the Chrome Prompt API probe returns `downloadable` on that build → "Gemini Nano not downloaded" (correct: the model was not downloaded in that profile)
- "Load sample note" fills the note, the routing hint reads **"On-device · short note"**
- a 2,200-character note flips the hint to **"Cloud · long note"**
- Settings dialog opens; the config-paste field is present
- mobile layout (402 px) stacks capture → findings → report → trace with no horizontal overflow

Rendered screenshots of the empty state, the populated state (seeded preview data), the report and the mobile layout were reviewed during design QA.

## 6. The Firebase SDK path executes in a real browser

With a placeholder config in `.env` (fake apiKey, real-shaped projectId/appId) the built app was driven again:

```
notice present: 0                      # "Firebase is not configured" gone
toast:          The cloud model could not be reached.
trace row:      extract · Prefer on-device → · Unknown · 0 ms · call failed: …
console:        "This page uses Chrome's Built-In AI features (LanguageModel)!"
                "Failed to load resource: the server responded with a status of 400"
```

That is the intended evidence: `initializeApp` → `getAI` → `getGenerativeModel({ mode, onDeviceParams, inCloudParams })` → `generateContent` all executed, Chrome reported that the built-in `LanguageModel` API was touched, the request reached Google's endpoint, and only the API call itself failed — with a 400 from the placeholder key. The error was normalized into the product's own message and recorded in the trace instead of throwing into the void.

## 7. What is **not** verified yet

The live AI calls. Firebase AI Logic requires a Firebase project with AI Logic enabled and App Check enforced, and the App Check debug token must be safelisted in that project's console. Both need the account owner's sign-in, so this step is documented in `docs/firebase-setup.md` and then a single `npm run dev` verifies:

1. header pill → "Gemini Nano ready" after the model download
2. a short note → finding badge `On-device`
3. DevTools offline → short note still produces `On-device`
4. a long note → finding badge `Cloud`, trace row `prefer_in_cloud → Cloud`
5. "Draft report" streams with a `Cloud` badge
