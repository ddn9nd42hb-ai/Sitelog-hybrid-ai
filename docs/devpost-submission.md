# Devpost submission — paste-ready text

Everything below is written for the Devpost form and must stay in English (Rules §6).

---

## Project name

```
SiteLog
```

## Elevator pitch (one line, ~120 chars)

```
Field notes from a construction site become client-ready findings — on Gemini Nano when the device can, in the cloud when it must.
```

## Which platform is your project built for?

```
Web (Chrome)
```

## Built with (comma-separated tags)

```
Firebase AI Logic, Firebase App Check, Gemini Nano 4, Gemini Developer API, TypeScript, Vite, IndexedDB, Service Worker, Chrome Prompt API
```

## Required text description

> The Rules require the description to cover **how you used Firebase AI Logic**, **a summary of the features**, and **a value proposition**. This version leads with those three.

```
SiteLog is a web app for interior fit-out and construction inspectors. An inspector types a raw site note — "3F women's restroom, water stain on the ceiling under the riser cupboard, tiles not laid yet" — optionally adds a photo, and SiteLog returns structured findings (trade, severity, location, issue, next action, confidence) plus a client-ready daily report.

HOW WE USE FIREBASE AI LOGIC

Every AI call in SiteLog goes through one wrapper, src/ai/client.ts, built on Firebase AI Logic hybrid inference (firebase 13.4.0, Gemini Developer API backend, App Check enforced).

- We call getAI(app, { backend: new GoogleAIBackend() }) and getGenerativeModel(ai, { mode, onDeviceParams, inCloudParams }), setting the inference mode per task instead of globally.
- Short notes (<=1,200 characters, one photo) are requested with InferenceMode.PREFER_ON_DEVICE, so Gemini Nano 4 on Chrome runs them locally: private, offline, and free.
- Long notes, multi-photo batches and the long-form client report are requested with PREFER_IN_CLOUD, because on-device inference is single-turn and a 40-item punch list is not. If that cloud call fails (offline, quota), the SDK falls back to the device automatically.
- Privacy mode pins everything to ONLY_ON_DEVICE for sites where client data may not leave the machine.
- Structured output uses one JSON Schema on both sides: onDeviceParams.promptOptions.responseConstraint on the device, generationConfig.responseSchema in the cloud.
- model.initializeDeviceModel() is called from a user gesture (the header pill or the Analyze button) and reports download progress, so the first request is not a several-minute wait.
- We read response.inferenceSource on every result and show it to the inspector: each finding and each row of the "Hybrid trace" rail says whether that answer came from on_device or in_cloud, with latency and the reason the call was routed there. Hybrid isn't a claim in a README; it's visible in the product.

ESCALATION: the reason to be hybrid is not only availability. When the on-device answer fails schema validation, or the model marks its own confidence below 0.55, SiteLog re-runs the same prompt with ONLY_IN_CLOUD and keeps the better answer. The device handles the normal case; the cloud is reserved for the cases that need it.

FEATURES
- Capture: note, optional photo (camera or file, downscaled to 1280px JPEG), optional trade tag.
- Findings: severity-sorted cards with location, issue, next action, confidence, and where it ran.
- Live routing hint: before you press Analyze, the app says whether this note will run on-device or in the cloud, and why.
- Client report: streamed Markdown grouped by severity, copy and .md export.
- Hybrid trace: requested mode, actual source, latency, reason for every call.
- Offline-first: service worker shell cache, findings in IndexedDB, works with the network off.

VALUE PROPOSITION

Cloud-only AI assistants stop working exactly where construction notes are taken — basements, cores, lift shafts — and send commercially sensitive client data to a server for every trivial observation. On-device-only assistants cannot handle a long punch list and only exist on one desktop browser. SiteLog takes the shape of the site: short observations stay on the machine, bulk work goes to the cloud, and the inspector can always see which happened.
```

## Inspiration

```
The idea came from a real fit-out site: the inspector's notes were in a phone memo app, the daily report was retyped at 9pm, and half the notes were taken in a basement with no signal. The AI tools we tried were cloud-only — useless where the notes were, and awkward to use with a client's defect list in the prompt. Hybrid inference is the first setup where "private and offline" and "long documents" stop being a trade-off.
```

## What it does

```
SiteLog turns one site note into structured findings and, at the end of the day, into the report the client receives.

An inspector types a note and optionally attaches one photo. SiteLog extracts discrete findings — trade, severity (low/medium/high/critical), location, issue, next action, confidence — validating them against a JSON Schema on whichever side ran. Short notes run on Gemini Nano in the browser; long notes and multi-photo batches go to the cloud; a device answer that fails validation is escalated to the cloud automatically.

The findings list is the punch list. One button turns it into a client-ready daily report, streamed so the inspector sees it being written, grouped by severity, with recommended next steps.

Throughout, the app shows what the model is doing and where: a routing hint before the call, and a trace rail with the requested mode, the actual inference source the SDK reported, the latency, and why.
```

## How we built it

```
TypeScript + Vite, no framework, 150 kB of JavaScript (37 kB gzipped).

The important decision was to keep the routing policy separate from the model call. src/ai/router.ts is a pure function over {task, characters, photos, offline, privacyMode, deviceSupported} that returns an InferenceMode plus a reason. That made the hybrid behaviour testable without a browser: unit tests assert that a 1,300-character note goes to the cloud, that privacy mode wins over everything, and that offline prefers the device. It also lets the capture card explain the routing before the call happens, which is what makes the hybrid visible to the user rather than a hidden implementation detail.

src/ai/schema.ts is the single gate on model output: it strips code fences, repairs the enum drift a small model produces ("electric" → electrical, "urgent" → critical), clamps confidence, and fails anything that cannot be repaired. Failure is what triggers the cloud escalation — so the escalation rule lives in one place, not scattered through the UI.

Everything AI-adjacent is behind one interface, HybridClient. The Firebase implementation is ~200 lines; the tests use a fake. That is also how the jsdom UI smoke test can run a full "load sample note → analyze → render finding → draft report" flow without a network.
```

## Challenges we ran into

```
1. The on-device model is not a smaller cloud model. It is single-turn, takes one image, and drifts on enums. Our first version assumed it would always return clean JSON; it did not. The fix was to treat validation as part of the architecture: a schema, a repair pass, and an explicit escalation when repair is not possible.

2. User activation. initializeDeviceModel() must be called from a user gesture, and the model download takes minutes. We call it from the Analyze button and from the header pill, do not await it in PREFER_ON_DEVICE mode, and let the SDK fall back to the cloud while the download runs. The trace says "on-device model still downloading", which is much better than a spinner.

3. Showing where each answer came from, honestly. response.inferenceSource is the only trustworthy source of truth; a UI that guesses looks like it works when it does not. Every badge and every trace row reads from it.
```

## Accomplishments we are proud of

```
- The hybrid behaviour is observable: a routing hint before the call, a trace rail after it, on every call.
- An escalation path that is genuinely useful rather than decorative: schema failure or low confidence re-runs the same prompt in the cloud.
- A product, not a demo: offline shell, IndexedDB persistence, photo pipeline, streamed reports, privacy mode, and a UI that reads well at 400px wide in one hand.
- 38 tests, full type checking, and a clean production build, with the Firebase API surface validated against the SDK's own types.
```

## What we learned

```
- Hybrid is a product decision about *where the user is*, not a performance optimisation. The routing table is easier to defend than any benchmark.
- Small on-device models need engineering around them: schemas, repair, and a fallback decision. That engineering is the product.
- The SDK's inference modes are expressive enough that most of the "when do I use the cloud" logic is a one-line policy, as long as the policy is in one place.
```

## What's next for SiteLog

```
- Multi-photo notes on-device: one session per photo, merged findings.
- A Firestore sync so a site team shares one punch list, with the device still writing when offline.
- Remote Config-driven routing thresholds, so a firm can tune the on-device budget per project.
- Android and iOS builds on the same hybrid SDK, to get the on-device model onto the phones inspectors actually carry.
```

## Try it out / testing instructions

```
Open: <HOSTED URL>
No login required. Press "Load sample note" → "Analyze note" → "Draft report".

On-device half: Chrome on desktop (139+), with chrome://flags/#prompt-api-for-gemini-nano-multimodal-input enabled. Press the "Gemini Nano" pill once to download the model.
Cloud half: runs in any supported browser.

The "Hybrid trace" rail shows, per call, the requested mode, the inference source the SDK actually used, and the latency, so you can verify which half ran.
```

## Video

```
<YOUTUBE URL> — 2:40, English
```

## Repository

```
<GITHUB URL> — Apache-2.0, public
```

---

## Field checklist before you submit

| Devpost field | Value |
| --- | --- |
| Project name | SiteLog |
| Tagline | above |
| Thumbnail | 3:2 image, 1280×853 (use a real screenshot of findings + trace) |
| Video demo link | YouTube, public, ≤ 3 min, English audio |
| "Try it out" links | hosted URL (recommended) + repo URL |
| Platform selection | Web (Chrome) |
| Built with | above |
| Repo license | Apache-2.0, visible in the GitHub About sidebar |

Rules that are easy to miss:

- The GitHub repo must be **public** with the license **detectable in the About section** (GitHub detects `LICENSE` automatically; check that the sidebar shows "Apache-2.0 license").
- The video must be **on YouTube and public**, English or English subtitles, ≤ 3 minutes. Judges may only watch the first 3 minutes.
- Do **not** put an App Check debug token, or anything else secret, in the repo, the form, or the video.
- The project must be free to use for judges until the judging period ends (2026-12-16).
