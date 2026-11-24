import { describe, expect, it } from "vitest";
import { AnalyzeError, analyzeNote } from "../src/ai/analyze";
import { FINDING_JSON, FakeClient, GARBAGE } from "./fake-client";

const input = {
  note: "3F women's restroom — water stain spreading on the ceiling under the riser cupboard.",
  photos: [],
  privacyMode: false,
  offline: false,
  deviceSupported: true
};

describe("analyzeNote", () => {
  it("keeps a confident on-device answer on the device", async () => {
    const client = new FakeClient({ replies: [{ text: FINDING_JSON, source: "on_device" }] });
    const result = await analyzeNote(client, input);

    expect(result.escalated).toBe(false);
    expect(result.source).toBe("on_device");
    expect(result.findings).toHaveLength(1);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].params.mode).toBe("prefer_on_device");
    expect(client.calls[0].params.schema).toBeDefined();
  });

  it("escalates to the cloud when the device answer is not valid JSON", async () => {
    const client = new FakeClient({
      replies: [
        { text: GARBAGE, source: "on_device" },
        { text: FINDING_JSON, source: "in_cloud" }
      ]
    });
    const result = await analyzeNote(client, input);

    expect(result.escalated).toBe(true);
    expect(result.source).toBe("in_cloud");
    expect(client.calls).toHaveLength(2);
    expect(client.calls[1].params.mode).toBe("only_in_cloud");
  });

  it("escalates when the device answer is valid but unsure", async () => {
    const unsure = JSON.stringify({
      findings: [
        {
          trade: "plumbing",
          severity: "medium",
          location: "3F",
          issue: "Possible leak",
          action: "Check",
          confidence: 0.31
        }
      ]
    });
    const client = new FakeClient({
      replies: [
        { text: unsure, source: "on_device" },
        { text: FINDING_JSON, source: "in_cloud" }
      ]
    });
    const result = await analyzeNote(client, input);
    expect(result.escalated).toBe(true);
    expect(client.calls).toHaveLength(2);
  });

  it("never escalates in privacy mode", async () => {
    const client = new FakeClient({ replies: [{ text: GARBAGE, source: "on_device" }] });
    await expect(analyzeNote(client, { ...input, privacyMode: true })).rejects.toBeInstanceOf(AnalyzeError);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0].params.mode).toBe("only_on_device");
  });

  it("never calls the cloud when offline", async () => {
    const client = new FakeClient({ replies: [{ text: GARBAGE, source: "on_device" }] });
    await expect(analyzeNote(client, { ...input, offline: true })).rejects.toBeInstanceOf(AnalyzeError);
    expect(client.calls).toHaveLength(1);
  });

  it("sends every photo to the cloud and one to the device", async () => {
    const photos = [
      { id: "a", dataUrl: "data:image/jpeg;base64,AAA", mimeType: "image/jpeg", width: 10, height: 10 },
      { id: "b", dataUrl: "data:image/jpeg;base64,BBB", mimeType: "image/jpeg", width: 10, height: 10 }
    ];

    const cloud = new FakeClient({ replies: [{ text: FINDING_JSON, source: "in_cloud" }] });
    await analyzeNote(cloud, { ...input, note: "x".repeat(2000), photos });
    const cloudParts = cloud.calls[0].params.prompt as unknown as Array<Record<string, unknown>>;
    expect(cloudParts.filter((p) => "inlineData" in p)).toHaveLength(2);

    const device = new FakeClient({ replies: [{ text: FINDING_JSON, source: "on_device" }] });
    await analyzeNote(device, { ...input, photos: photos.slice(0, 1) });
    const deviceParts = device.calls[0].params.prompt as unknown as Array<Record<string, unknown>>;
    expect(deviceParts.filter((p) => "inlineData" in p)).toHaveLength(1);
  });

  it("reports photos that did not fit the on-device session", async () => {
    const photos = [
      { id: "a", dataUrl: "data:image/jpeg;base64,AAA", mimeType: "image/jpeg", width: 10, height: 10 },
      { id: "b", dataUrl: "data:image/jpeg;base64,BBB", mimeType: "image/jpeg", width: 10, height: 10 }
    ];
    const client = new FakeClient({ replies: [{ text: FINDING_JSON, source: "on_device" }] });
    const result = await analyzeNote(client, { ...input, photos, privacyMode: true });
    expect(result.droppedPhotos).toBe(1);
    const parts = client.calls[0].params.prompt as unknown as Array<Record<string, unknown>>;
    expect(parts.filter((p) => "inlineData" in p)).toHaveLength(1);
  });

  it("refuses an empty note", async () => {
    const client = new FakeClient({});
    await expect(analyzeNote(client, { ...input, note: "   " })).rejects.toBeInstanceOf(AnalyzeError);
  });
});
