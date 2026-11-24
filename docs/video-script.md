# Demo video — shot list and voiceover (2:40)

Rules: ≤ 3 minutes, uploaded to YouTube and **public**, English audio or English subtitles, must show the project **actually running** on the platform it was built for. Judges may only watch the first 3 minutes, so the first 30 seconds must already show the product working.

**Record at** 1280×800 (or 1440×900), browser zoom 100%, dark room not needed — the UI is high contrast. Use a screen recorder that captures the cursor (QuickTime / OBS). Do a silent rehearsal of clicks 2–3 times; the routing hints change instantly, which is what the video is selling.

---

## Before you record

- [ ] Firebase project connected, App Check debug token safelisted (`docs/firebase-setup.md`)
- [ ] Chrome desktop 139+, `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled, model **already downloaded** (press the Gemini Nano pill and wait until it reads "Gemini Nano ready")
- [ ] SiteLog open, `Clear site` pressed so the findings list is empty
- [ ] DevTools open on the right in a narrow dock (you will use the Network→Offline toggle at 1:00) — or use `chrome://settings` Wi-Fi off, but DevTools is cleaner
- [ ] A long note ready to paste (see step 4)

---

## 0:00 – 0:14 · The problem

**On screen:** a black slide, or the app with the capture box empty.

**VO:**
> "An interior fit-out inspector takes forty notes a day — half of them in a basement with no signal. The AI tools that could turn those notes into a report all need the cloud. That is exactly where they stop working."

## 0:14 – 0:30 · What SiteLog is

**On screen:** the app, cursor over the header pills — `Online`, `Gemini Nano ready`.

**VO:**
> "This is SiteLog. It runs on Firebase AI Logic hybrid inference: Gemini Nano on the device when the device can, the cloud when it cannot. Watch the badge on every result — it tells you which half ran."

## 0:30 – 1:00 · On-device, private, instant

**Actions:**
1. Click **Load sample note** (three findings' worth of raw notes appear).
2. Point at the routing hint pill: **"On-device · short note"**. Hover it to show the tooltip reason.
3. Click **Analyze note**.
4. Three finding cards appear. Point at the badge on the first: **"On-device · 640 ms"**. Point at the Hybrid trace row: `prefer_on_device → On-device`.

**VO:**
> "A note from the third floor. Before I even press the button, SiteLog tells me where this will run and why: short note, on-device. I press analyze — three findings, each one showing it was computed on the device, in six hundred milliseconds. No request left this laptop."

## 1:00 – 1:20 · Offline — the part cloud-only apps can't do

**Actions:**
1. DevTools → Network → **Offline**.
2. Point at the header pill flipping to **Offline**, and the routing hint flipping to **"Offline · on-device"**.
3. Type a short note, press **Analyze note** — findings still appear, badge still `On-device`.
4. Network back **Online**.

**VO:**
> "Now I cut the network. The hint flips to offline, on-device — and the app keeps working. This is the basement case, and it is the reason a cloud-only assistant is the wrong shape for this job."

## 1:20 – 1:42 · Long work goes to the cloud

**Actions:**
1. Paste the long note (a 1,300+ character punch-list dump).
2. Point at the hint flipping to **"Cloud · long note"**.
3. Click **Analyze note**. Result cards carry **"Cloud · … ms"**. Trace row: `prefer_in_cloud → Cloud`.

**VO:**
> "Then a forty-line punch list. That is past what a single on-device session handles, so the routing flips to the cloud by itself — and the SDK puts a cloud badge on the result. Same product, different engine, and you can see which one."

## 1:42 – 2:00 · The client report

**Actions:**
1. Click **Draft report**. Text streams in, grouped by severity. Badge shows **Cloud**.
2. Scroll the report a little. Click **Copy**.

**VO:**
> "One button turns today's findings into the report the client gets at six o'clock. It streams, it is grouped by severity, and it only uses the findings I captured — no invented defects."

## 2:00 – 2:18 · Privacy mode

**Actions:**
1. Open **Settings** (⚙). Toggle **Privacy mode** on. Close.
2. Point at the hint: **"Privacy mode · on-device only"**.
3. Analyze a short note — badge `On-device` again. Trace row: `only_on_device → On-device`.

**VO:**
> "Some clients do not want their defects on anyone's server. Privacy mode pins every call to the device — the routing mode goes to only-on-device, and if the device cannot run it, the app says so instead of quietly going to the cloud."

## 2:18 – 2:34 · The escalation (the clever bit)

**Actions:** scroll the trace rail to a row whose reason reads **"Validator was not satisfied — escalated to the cloud model."** (Record this take after a run where the device answer failed validation; if none appears, narrate it over the trace instead of faking a row.)

**VO:**
> "And when the small on-device model returns something the schema validator will not accept, or marks its own confidence below fifty-five percent, the same prompt is re-run in the cloud. The device handles the normal case; the cloud is saved for the cases that need it."

## 2:34 – 2:40 · Close

**On screen:** the app, findings + trace visible; then the repo URL and "Apache-2.0".

**VO:**
> "SiteLog — hybrid inference you can actually see. Firebase AI Logic, Gemini Nano, on the web."

---

## Captions / description

```
SiteLog turns raw construction site notes into structured findings and a client-ready report.

Every AI call runs through Firebase AI Logic hybrid inference: Gemini Nano 4 on the device when it is available (Chrome desktop), gemini-3.5-flash-lite in the cloud when it is not. Each result and each row of the Hybrid trace shows the inference source the SDK reports, plus the reason the call was routed there.

Built for #BuildHybridAI 2026. Code: <repo URL> (Apache-2.0)
Chapters: 0:00 problem · 0:14 overview · 0:30 on-device · 1:00 offline · 1:20 cloud · 1:42 report · 2:00 privacy mode · 2:18 escalation
```

## Recording pitfalls

- If the app says **"No Firebase project is connected"** on camera, stop: fix `docs/firebase-setup.md` first.
- If every call shows **Cloud** even for short notes, the Nano model is not ready — the pill will say "not downloaded". Download it before recording.
- Do not show the DevTools console while an App Check debug token is printed there. Close that panel before recording.
- Keep the cursor out of the way of the routing hint pill; it is the smallest thing on screen and the most important.
