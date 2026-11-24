import { describe, expect, it } from "vitest";
import { generateReport } from "../src/ai/report";
import type { Finding, Project } from "../src/lib/types";
import { FakeClient } from "./fake-client";

const project: Project = { id: "p1", name: "Riverside Café", client: "Marlow", createdAt: 0 };
const findings: Finding[] = [
  {
    id: "f1",
    projectId: "p1",
    createdAt: 0,
    trade: "plumbing",
    severity: "high",
    location: "3F restroom",
    issue: "Ceiling stain under riser",
    action: "Pressure-test riser",
    confidence: 0.9,
    source: "on_device",
    latencyMs: 400,
    note: "ceiling stain"
  }
];

describe("generateReport", () => {
  it("streams the report and reports the cloud source", async () => {
    const client = new FakeClient({ streamReply: "## Site report\n\n- one\n- two" });
    const chunks: string[] = [];
    const result = await generateReport(
      client,
      { project, findings, dateISO: "2026-11-24", privacyMode: false, offline: false, deviceSupported: true },
      (chunk) => chunks.push(chunk)
    );

    expect(result.source).toBe("in_cloud");
    expect(result.decision.mode).toBe("prefer_in_cloud");
    expect(chunks.join("")).toBe("## Site report\n\n- one\n- two");
    expect(result.text).toContain("Site report");
  });

  it("keeps the report on the device in privacy mode", async () => {
    const client = new FakeClient({});
    await generateReport(
      client,
      { project, findings, dateISO: "2026-11-24", privacyMode: true, offline: false, deviceSupported: true },
      () => undefined
    );
    expect(client.calls[0].params.mode).toBe("only_on_device");
  });

  it("refuses to draft an empty report", async () => {
    const client = new FakeClient({});
    await expect(
      generateReport(
        client,
        { project, findings: [], dateISO: "2026-11-24", privacyMode: false, offline: false, deviceSupported: true },
        () => undefined
      )
    ).rejects.toThrow(/at least one finding/i);
  });
});
