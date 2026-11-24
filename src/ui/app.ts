/**
 * SiteLog UI.
 *
 * Plain DOM, one render function per region, so a streamed token never
 * re-renders the textarea the inspector is typing in.
 */
import { parsePastdConfig, saveLocalFirebaseConfig } from "../config";
import { analyzeNote, AnalyzeError } from "../ai/analyze";
import type { HybridClient } from "../ai/client";
import { generateReport } from "../ai/report";
import { decideRoute, describeMode } from "../ai/router";
import { fileToPhoto } from "../lib/image";
import {
  SEVERITY_LABEL,
  TRADE_LABEL,
  clock,
  escapeHtml,
  isoDate,
  newId,
  renderMarkdown,
  sourceClass,
  sourceLabel,
  timeAgo
} from "../lib/format";
import type { Store } from "../store/db";
import { TRADES, type AppSettings, type DeviceStatus, type Finding, type InferenceSourceLabel, type PhotoRef, type Project, type Trade, type TraceEntry } from "../lib/types";

export const SAMPLE_NOTE = `3F women's restroom — water stain spreading across the ceiling under the riser cupboard, looks like it started this week. Tiles are not laid yet so we can still open the ceiling.
Emergency light above the door is not connected to the circuit, it stayed dark when I tested it.
Kitchen pass counter: welded frame is 20 mm out of level along the wall, the stone top cannot be fitted like this.`;

export interface AppContext {
  client: HybridClient;
  store: Store;
  settings: AppSettings;
  /** False when no Firebase config is present at all. */
  configured: boolean;
  projectLabel: string;
}

type Busy = "idle" | "analyzing" | "reporting" | "preparing";

interface State {
  project: Project;
  findings: Finding[];
  traces: TraceEntry[];
  photos: PhotoRef[];
  tradeHint?: Trade;
  settings: AppSettings;
  device: DeviceStatus;
  online: boolean;
  busy: Busy;
  report: string;
  reportSource?: InferenceSourceLabel;
  status: string;
  downloadProgress?: number;
}

const DEVICE_SUPPORTED: DeviceStatus[] = ["available", "downloadable", "downloading"];

export async function mountApp(root: HTMLElement, ctx: AppContext): Promise<void> {
  const store = ctx.store;
  const savedProject = await store.getMeta<Project>("project");
  const state: State = {
    project: savedProject ?? {
      id: newId(),
      name: ctx.projectLabel,
      client: "",
      createdAt: Date.now()
    },
    findings: [],
    traces: [],
    photos: [],
    settings: ctx.settings,
    device: "unknown",
    online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
    busy: "idle",
    report: "",
    status: ""
  };

  root.innerHTML = shell(state, ctx.configured);
  const $ = <T extends HTMLElement>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`missing element: ${selector}`);
    return node;
  };

  const noteEl = $<HTMLTextAreaElement>("#note");
  const findingsEl = $("#findings");
  const traceEl = $("#trace");
  const reportEl = $("#report-body");
  const statusEl = $("#analyze-status");
  const routeHintEl = $("#route-hint");
  const thumbsEl = $("#photo-thumbs");
  const buttonAnalyze = $<HTMLButtonElement>("#btn-analyze");
  const buttonReport = $<HTMLButtonElement>("#btn-report");
  const pillDevice = $<HTMLButtonElement>("#pill-device");
  const pillNet = $("#pill-net");
  const fileInput = $<HTMLInputElement>("#file-input");
  const settingsDialog = $<HTMLDialogElement>("#settings");

  state.findings = await store.listFindings(state.project.id);
  state.traces = await store.listTraces();

  // ---- rendering -----------------------------------------------------------

  function renderPills(): void {
    pillNet.textContent = state.online ? "Online" : "Offline";
    pillNet.className = `pill ${state.online ? "ok" : "warn"}`;

    const labels: Record<DeviceStatus, string> = {
      available: "Gemini Nano ready",
      downloadable: "Gemini Nano not downloaded",
      downloading: "Gemini Nano downloading",
      unavailable: "No on-device model",
      unknown: "On-device: checking"
    };
    pillDevice.textContent =
      state.busy === "preparing" && state.downloadProgress !== undefined
        ? `Downloading Nano ${Math.round(state.downloadProgress * 100)}%`
        : labels[state.device];
    pillDevice.dataset.status = state.device;
  }

  function renderRouteHint(): void {
    const decision = decideRoute({
      task: "extract",
      chars: noteEl ? noteEl.value.trim().length : 0,
      photos: state.photos.length,
      privacyMode: state.settings.privacyMode,
      offline: !state.online,
      deviceSupported: DEVICE_SUPPORTED.includes(state.device)
    });
    routeHintEl.dataset.code = decision.code;
    routeHintEl.textContent = decision.shortReason;
    routeHintEl.title = decision.reason;
  }

  function renderFindings(): void {
    $("#finding-count").textContent = String(state.findings.length);
    if (state.findings.length === 0) {
      findingsEl.innerHTML = `<p class="empty">No findings yet. Capture a note and press <strong>Analyze note</strong>.</p>`;
      return;
    }
    findingsEl.innerHTML = state.findings
      .map(
        (f) => `
      <article class="finding sev-${f.severity}" data-id="${f.id}">
        <div class="finding-top">
          <span class="sev">${SEVERITY_LABEL[f.severity]}</span>
          <span class="trade">${TRADE_LABEL[f.trade]}</span>
          <span class="src ${sourceClass(f.source)}" title="Where this result was computed">
            ${sourceLabel(f.source)} · ${f.latencyMs} ms
          </span>
          <button class="del" data-action="delete" aria-label="Delete finding">×</button>
        </div>
        <h3>${escapeHtml(f.location)}</h3>
        <p class="issue">${escapeHtml(f.issue)}</p>
        <p class="action"><span>Next</span>${escapeHtml(f.action)}</p>
        ${f.photoDataUrl ? `<div class="thumb-slot"><img alt="Site photo for ${escapeHtml(f.location)}" src="${f.photoDataUrl}"/></div>` : ""}
        <footer>${timeAgo(f.createdAt)} · confidence ${(f.confidence * 100).toFixed(0)}%</footer>
      </article>`
      )
      .join("");
  }

  function renderTrace(): void {
    if (state.traces.length === 0) {
      traceEl.innerHTML = `<li class="empty">Every AI call lands here with the source the SDK reports.</li>`;
      return;
    }
    traceEl.innerHTML = state.traces
      .slice(0, 12)
      .map(
        (t) => `
      <li class="trace-row">
        <div class="trace-line">
          <time>${clock(t.at)}</time>
          <span class="task">${t.task}</span>
          <span class="arrow">${describeMode(t.requestedMode)} →</span>
          <span class="src ${sourceClass(t.source)}">${sourceLabel(t.source)}</span>
          <span class="ms">${t.ms} ms</span>
        </div>
        <p class="reason">${escapeHtml(t.note ? `${t.reason} ${t.note}` : t.reason)}</p>
      </li>`
      )
      .join("");
  }

  function renderReport(): void {
    const sourceEl = $("#report-source");
    sourceEl.className = `src ${sourceClass(state.reportSource ?? "unknown")}`;
    sourceEl.textContent = state.reportSource ? sourceLabel(state.reportSource) : "";
    if (!state.report) {
      reportEl.className = "report-body empty";
      reportEl.textContent = "No report yet. Findings become a client-ready report in one tap.";
      return;
    }
    reportEl.className = "report-body";
    reportEl.innerHTML = renderMarkdown(state.report);
  }

  function setBusy(busy: Busy, status = ""): void {
    state.busy = busy;
    state.status = status;
    buttonAnalyze.disabled = busy !== "idle";
    buttonReport.disabled = busy !== "idle" || state.findings.length === 0;
    buttonAnalyze.textContent =
      busy === "analyzing" ? "Analyzing…" : busy === "preparing" ? "Warming up…" : "Analyze note";
    statusEl.textContent = status;
    statusEl.dataset.state = busy === "idle" ? "idle" : "busy";
    renderPills();
  }

  function toast(message: string, tone: "ok" | "error" = "ok"): void {
    const el = $("#toast");
    el.textContent = message;
    el.className = `toast show ${tone}`;
    window.setTimeout(() => {
      el.className = "toast";
    }, 4200);
  }

  // ---- actions -------------------------------------------------------------

  async function addTrace(entry: Omit<TraceEntry, "id" | "at">): Promise<void> {
    const trace: TraceEntry = { ...entry, id: newId(), at: Date.now() };
    state.traces.unshift(trace);
    renderTrace();
    await store.addTrace(trace);
  }

  async function runAnalysis(): Promise<void> {
    const note = noteEl.value.trim();
    if (!note && state.photos.length === 0) {
      toast("Add a note or a photo first.", "error");
      return;
    }
    if (!ctx.configured) {
      toast("Add your Firebase config in Settings before analyzing.", "error");
      settingsDialog.showModal();
      return;
    }

    const decision = decideRoute({
      task: "extract",
      chars: note.length,
      photos: state.photos.length,
      privacyMode: state.settings.privacyMode,
      offline: !state.online,
      deviceSupported: DEVICE_SUPPORTED.includes(state.device)
    });

    setBusy("analyzing", "Reading the note…");

    if (decision.mode !== "only_in_cloud" && DEVICE_SUPPORTED.includes(state.device)) {
      // Fire and forget: if the model is still downloading the SDK falls back
      // to the cloud instead of blocking the inspector.
      if (state.device !== "available") {
        void ctx.client
          .prepareDevice((p) => {
            state.downloadProgress = p;
            renderPills();
          })
          .catch(() => undefined);
      }
    }

    try {
      const result = await analyzeNote(ctx.client, {
        note,
        photos: state.photos,
        tradeHint: state.tradeHint,
        privacyMode: state.settings.privacyMode,
        offline: !state.online,
        deviceSupported: DEVICE_SUPPORTED.includes(state.device)
      });

      const createdAt = Date.now();
      const saved: Finding[] = result.findings.map((input) => ({
        ...input,
        id: newId(),
        projectId: state.project.id,
        createdAt,
        source: result.source,
        latencyMs: Math.round(result.latencyMs / Math.max(1, result.findings.length)),
        photoId: state.photos[0]?.id,
        photoDataUrl: state.photos[0]?.dataUrl,
        note: note.slice(0, 400)
      }));

      for (const finding of saved) await store.saveFinding(finding);
      state.findings = [...saved, ...state.findings];
      renderFindings();
      buttonReport.disabled = state.findings.length === 0;

      const traceNotes: string[] = [];
      if (result.escalated) traceNotes.push("Validator was not satisfied — escalated to the cloud model.");
      if (result.droppedPhotos > 0) {
        traceNotes.push(`${result.droppedPhotos} extra photo(s) left out: on-device takes one photo per note.`);
      }

      await addTrace({
        task: "extract",
        requestedMode: result.decision.mode,
        source: result.escalated ? "on_device" : result.source,
        ms: result.latencyMs,
        reason: result.decision.reason,
        note: traceNotes.length > 0 ? traceNotes.join(" ") : undefined
      });

      if (result.escalated) {
        await addTrace({
          task: "extract",
          requestedMode: "only_in_cloud",
          source: result.source,
          ms: 0,
          reason: "Escalation: schema validation or low confidence on the device result."
        });
      }

      noteEl.value = "";
      state.photos = [];
      state.tradeHint = undefined;
      renderThumbs();
      renderChips();
      renderRouteHint();
      setBusy("idle");
      toast(`${saved.length} finding${saved.length > 1 ? "s" : ""} added · ${sourceLabel(result.source)}`);
    } catch (err) {
      const analyzeErr = err as AnalyzeError;
      setBusy("idle");
      toast(analyzeErr.message ?? "The model call failed.", "error");
      await addTrace({
        task: "extract",
        requestedMode: decision.mode,
        source: "unknown",
        ms: 0,
        reason: decision.reason,
        note: ["call failed:", analyzeErr.message, analyzeErr.hint].filter(Boolean).join(" ")
      });
    }
  }

  async function runReport(): Promise<void> {
    if (state.findings.length === 0) return;
    if (!ctx.configured) {
      settingsDialog.showModal();
      return;
    }
    setBusy("reporting", "Drafting the client report…");
    state.report = "";
    renderReport();

    try {
      const result = await generateReport(
        ctx.client,
        {
          project: state.project,
          findings: state.findings,
          dateISO: isoDate(),
          privacyMode: state.settings.privacyMode,
          offline: !state.online,
          deviceSupported: DEVICE_SUPPORTED.includes(state.device)
        },
        (chunk) => {
          state.report += chunk;
          renderReport();
        }
      );
      state.reportSource = result.source;
      renderReport();
      await addTrace({
        task: "report",
        requestedMode: result.decision.mode,
        source: result.source,
        ms: result.latencyMs,
        reason: result.decision.reason
      });
      setBusy("idle");
    } catch (err) {
      setBusy("idle");
      state.report = "";
      renderReport();
      toast(err instanceof Error ? err.message : "The report could not be drafted.", "error");
    }
  }

  function renderThumbs(): void {
    thumbsEl.innerHTML = state.photos
      .map(
        (p) => `
      <div class="thumb">
        <img src="${p.dataUrl}" alt="Attached site photo"/>
        <button data-photo="${p.id}" aria-label="Remove photo">×</button>
      </div>`
      )
      .join("");
  }

  function renderChips(): void {
    root.querySelectorAll<HTMLButtonElement>("#trade-chips button").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.trade === state.tradeHint);
    });
  }

  // ---- wiring --------------------------------------------------------------

  noteEl.addEventListener("input", renderRouteHint);

  root.querySelector("#trade-chips")?.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-trade]");
    if (!target) return;
    const trade = target.dataset.trade as Trade;
    state.tradeHint = state.tradeHint === trade ? undefined : trade;
    renderChips();
  });

  $<HTMLButtonElement>("#btn-photo").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const photo = await fileToPhoto(file);
      state.photos.push(photo);
      renderThumbs();
      renderRouteHint();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not read that photo.", "error");
    }
  });

  thumbsEl.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-photo]");
    if (!target) return;
    state.photos = state.photos.filter((p) => p.id !== target.dataset.photo);
    renderThumbs();
    renderRouteHint();
  });

  buttonAnalyze.addEventListener("click", () => void runAnalysis());
  buttonReport.addEventListener("click", () => void runReport());

  $<HTMLButtonElement>("#btn-sample").addEventListener("click", () => {
    noteEl.value = SAMPLE_NOTE;
    noteEl.focus();
    renderRouteHint();
  });

  findingsEl.addEventListener("click", async (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action='delete']");
    if (!target) return;
    const article = target.closest<HTMLElement>("article[data-id]");
    const id = article?.dataset.id;
    if (!id) return;
    state.findings = state.findings.filter((f) => f.id !== id);
    await store.deleteFinding(id);
    renderFindings();
    buttonReport.disabled = state.findings.length === 0;
  });

  $<HTMLButtonElement>("#btn-clear").addEventListener("click", async () => {
    if (!window.confirm("Clear the findings and trace for this site?")) return;
    await store.clearProject(state.project.id);
    state.findings = [];
    state.traces = [];
    state.report = "";
    renderFindings();
    renderTrace();
    renderReport();
  });

  $<HTMLButtonElement>("#btn-copy").addEventListener("click", async () => {
    if (!state.report) return;
    try {
      await navigator.clipboard.writeText(state.report);
      toast("Report copied.");
    } catch {
      toast("Copy failed — select the text instead.", "error");
    }
  });

  $<HTMLButtonElement>("#btn-export").addEventListener("click", () => {
    if (!state.report) return;
    const blob = new Blob([state.report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${state.project.name.replace(/[^\w\-]+/g, "-").toLowerCase()}-${isoDate()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  pillDevice.addEventListener("click", () => {
    if (!ctx.configured) {
      settingsDialog.showModal();
      return;
    }
    state.busy = "preparing";
    renderPills();
    void ctx.client
      .prepareDevice((p) => {
        state.downloadProgress = p;
        renderPills();
      })
      .then(() => ctx.client.deviceStatus())
      .then((status) => {
        state.device = status;
        state.busy = "idle";
        renderPills();
        renderRouteHint();
      })
      .catch((err: Error) => {
        state.busy = "idle";
        renderPills();
        toast(err.message || "Could not prepare the on-device model.", "error");
      });
  });

  $("#settings-button").addEventListener("click", () => settingsDialog.showModal());
  $("#settings-close").addEventListener("click", () => settingsDialog.close());

  const privacyToggle = $<HTMLInputElement>("#privacy-toggle");
  privacyToggle.checked = state.settings.privacyMode;
  privacyToggle.addEventListener("change", () => {
    state.settings.privacyMode = privacyToggle.checked;
    renderRouteHint();
    toast(privacyToggle.checked ? "Privacy mode on: nothing leaves this device." : "Privacy mode off.");
  });

  const projectName = $<HTMLInputElement>("#project-name");
  const projectClient = $<HTMLInputElement>("#project-client");
  const saveProject = async () => {
    state.project = {
      ...state.project,
      name: projectName.value.trim() || "New site",
      client: projectClient.value.trim()
    };
    await store.setMeta("project", state.project);
    $("#project-label").textContent = state.project.name;
  };
  projectName.addEventListener("change", () => void saveProject());
  projectClient.addEventListener("change", () => void saveProject());

  $<HTMLButtonElement>("#config-save").addEventListener("click", () => {
    const input = $<HTMLTextAreaElement>("#config-input");
    try {
      const config = parsePastdConfig(input.value);
      saveLocalFirebaseConfig(config);
      location.reload();
    } catch (err) {
      $("#config-status").textContent = err instanceof Error ? err.message : "Invalid config.";
    }
  });

  window.addEventListener("online", () => {
    state.online = true;
    renderPills();
    renderRouteHint();
  });
  window.addEventListener("offline", () => {
    state.online = false;
    renderPills();
    renderRouteHint();
    toast("Offline — notes will run on the device.", "ok");
  });

  // ---- first paint ---------------------------------------------------------

  $("#project-label").textContent = state.project.name;
  projectName.value = state.project.name;
  projectClient.value = state.project.client;
  renderPills();
  renderRouteHint();
  renderFindings();
  renderTrace();
  renderReport();
  setBusy("idle");

  const status = await ctx.client.deviceStatus();
  state.device = status;
  renderPills();
  renderRouteHint();
}

function configuredLabel(configured: boolean): string {
  return configured ? "Connected to a Firebase project." : "No Firebase project connected yet.";
}

function shell(state: State, configured: boolean): string {
  return `
  <header class="topbar">
    <div class="brand">
      <span class="logo" aria-hidden="true">◲</span>
      <div>
        <strong>SiteLog</strong>
        <span class="brand-sub">hybrid field notes</span>
      </div>
      <span class="project" id="project-label">${escapeHtml(state.project.name)}</span>
    </div>
    <div class="pills">
      <span class="pill ok" id="pill-net">Online</span>
      <button class="pill" id="pill-device" type="button">On-device: checking</button>
      <button class="icon" id="settings-button" type="button" aria-label="Settings">⚙</button>
    </div>
  </header>

  <main class="layout">
    <section class="col">
      <div class="card capture">
        <div class="card-head">
          <h2>Capture a note</h2>
          <span class="hint" id="route-hint">…</span>
        </div>
        <textarea id="note" rows="5" placeholder="3F women's restroom — water stain on the ceiling under the riser cupboard…"></textarea>
        <div class="chips" id="trade-chips">
          ${TRADES.map((t) => `<button type="button" data-trade="${t}">${TRADE_LABEL[t]}</button>`).join("")}
        </div>
        <div class="capture-foot">
          <button class="ghost" id="btn-photo" type="button">＋ Photo</button>
          <div class="thumbs" id="photo-thumbs"></div>
          <input id="file-input" type="file" accept="image/*" capture="environment" hidden />
        </div>
        <div class="actions">
          <button class="primary" id="btn-analyze" type="button">Analyze note</button>
          <button class="ghost" id="btn-sample" type="button">Load sample note</button>
        </div>
        <p class="status" id="analyze-status"></p>
        ${configured ? "" : `<p class="notice">Firebase is not configured yet — open <strong>Settings</strong> and paste your project config to enable AI.</p>`}
      </div>

      <div class="section-head">
        <h2>Findings <span class="count" id="finding-count">0</span></h2>
        <button class="link" id="btn-clear" type="button">Clear site</button>
      </div>
      <div id="findings" class="findings"></div>
    </section>

    <aside class="col">
      <div class="card report">
        <div class="card-head">
          <h2>Client report</h2>
          <span class="src unknown" id="report-source"></span>
        </div>
        <div id="report-body" class="report-body empty">No report yet.</div>
        <div class="actions">
          <button class="primary" id="btn-report" type="button" disabled>Draft report</button>
          <button class="ghost" id="btn-copy" type="button">Copy</button>
          <button class="ghost" id="btn-export" type="button">.md</button>
        </div>
      </div>

      <div class="card trace">
        <div class="card-head">
          <h2>Hybrid trace</h2>
          <span class="muted">where each call actually ran</span>
        </div>
        <ol id="trace"></ol>
      </div>
    </aside>
  </main>

  <dialog id="settings">
    <form method="dialog" class="dialog-body">
      <div class="dialog-head">
        <h2>Settings</h2>
        <button class="icon" id="settings-close" value="close" aria-label="Close">×</button>
      </div>

      <label class="field">
        <span>Project</span>
        <input id="project-name" type="text" placeholder="Riverside Café — fit-out" />
      </label>
      <label class="field">
        <span>Client</span>
        <input id="project-client" type="text" placeholder="Marlow Hospitality" />
      </label>

      <label class="switch">
        <input id="privacy-toggle" type="checkbox" />
        <span>
          <strong>Privacy mode</strong>
          <em>Only the on-device model. Use it on sites where client data must not leave the machine.</em>
        </span>
      </label>

      <p class="muted small">
        Firebase config is injected at build time. To point this build at another project,
        paste the config object from the Firebase console (Project settings → Your apps) below.
        It is stored in this browser only.
      </p>
      <label class="field">
        <span>Firebase config</span>
        <textarea id="config-input" rows="6" spellcheck="false" placeholder='{ "apiKey": "…", "projectId": "…", "appId": "…" }'></textarea>
      </label>
      <div class="actions">
        <button class="primary" type="button" id="config-save">Save &amp; reload</button>
        <span class="muted small" id="config-status">${configuredLabel(configured)}</span>
      </div>
    </form>
  </dialog>

  <div class="toast" id="toast"></div>`;
}
