// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { mountApp } from "../src/ui/app";
import type { Store } from "../src/store/db";
import type { Finding, TraceEntry } from "../src/lib/types";
import { FINDING_JSON, FakeClient } from "./fake-client";

class TestStore implements Store {
  findings: Finding[] = [];
  traces: TraceEntry[] = [];
  meta = new Map<string, unknown>();

  async listFindings(projectId: string) {
    return this.findings.filter((f) => f.projectId === projectId);
  }
  async saveFinding(finding: Finding) {
    this.findings.push(finding);
  }
  async deleteFinding(id: string) {
    this.findings = this.findings.filter((f) => f.id !== id);
  }
  async listTraces() {
    return this.traces;
  }
  async addTrace(trace: TraceEntry) {
    this.traces.push(trace);
  }
  async clearProject(projectId: string) {
    this.findings = this.findings.filter((f) => f.projectId !== projectId);
    this.traces = [];
  }
  async getMeta<T>(key: string) {
    return this.meta.get(key) as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    this.meta.set(key, value);
  }
}

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("SiteLog UI", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("boots, loads the sample note and renders a finding with its source", async () => {
    const root = document.getElementById("app") as HTMLElement;
    const store = new TestStore();
    const client = new FakeClient({ replies: [{ text: FINDING_JSON, source: "on_device" }] });

    await mountApp(root, {
      client,
      store,
      settings: { privacyMode: false, language: "auto" },
      configured: true,
      projectLabel: "Riverside Café"
    });

    expect(root.querySelector("#btn-analyze")).toBeTruthy();
    expect(root.textContent).toContain("Capture a note");

    (root.querySelector("#btn-sample") as HTMLButtonElement).click();
    const note = root.querySelector("#note") as HTMLTextAreaElement;
    expect(note.value).toContain("3F women's restroom");

    (root.querySelector("#btn-analyze") as HTMLButtonElement).click();
    await flush();

    const cards = root.querySelectorAll(".finding");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("3F women's restroom");
    expect(cards[0].querySelector(".src")?.textContent).toContain("On-device");

    // The trace rail must show where the call ran.
    expect(root.querySelectorAll(".trace-row")).toHaveLength(1);
    expect(root.querySelector("#trace")?.textContent).toContain("Prefer on-device");
    expect(store.findings).toHaveLength(1);
  });

  it("does not call the model when the note is empty", async () => {
    const root = document.getElementById("app") as HTMLElement;
    const store = new TestStore();
    const client = new FakeClient({});
    await mountApp(root, {
      client,
      store,
      settings: { privacyMode: false, language: "auto" },
      configured: true,
      projectLabel: "Test"
    });

    (root.querySelector("#btn-analyze") as HTMLButtonElement).click();
    await flush(2);
    expect(client.calls).toHaveLength(0);
    expect(root.querySelectorAll(".finding")).toHaveLength(0);
  });

  it("drafts a report once findings exist", async () => {
    const root = document.getElementById("app") as HTMLElement;
    const store = new TestStore();
    const client = new FakeClient({ replies: [{ text: FINDING_JSON, source: "on_device" }] });
    await mountApp(root, {
      client,
      store,
      settings: { privacyMode: false, language: "auto" },
      configured: true,
      projectLabel: "Test"
    });

    (root.querySelector("#btn-sample") as HTMLButtonElement).click();
    (root.querySelector("#btn-analyze") as HTMLButtonElement).click();
    await flush();

    (root.querySelector("#btn-report") as HTMLButtonElement).click();
    await flush();

    expect(root.querySelector("#report-body")?.innerHTML).toContain("Site report");
    expect(client.calls.some((c) => (c.params.prompt as string).includes("Project:"))).toBe(true);
  });
});
