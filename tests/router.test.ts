import { describe, expect, it } from "vitest";
import { ON_DEVICE_CHAR_BUDGET, decideRoute, describeMode } from "../src/ai/router";

const base = {
  task: "extract" as const,
  chars: 120,
  photos: 0,
  privacyMode: false,
  offline: false,
  deviceSupported: true
};

describe("decideRoute", () => {
  it("keeps a short note on the device", () => {
    const decision = decideRoute(base);
    expect(decision.mode).toBe("prefer_on_device");
    expect(decision.code).toBe("short-note");
    expect(decision.warning).toBeUndefined();
  });

  it("hands a long note to the cloud", () => {
    const decision = decideRoute({ ...base, chars: ON_DEVICE_CHAR_BUDGET + 1 });
    expect(decision.mode).toBe("prefer_in_cloud");
    expect(decision.code).toBe("long-note");
    expect(decision.reason).toContain("budget");
  });

  it("hands a multi-photo batch to the cloud", () => {
    const decision = decideRoute({ ...base, photos: 2 });
    expect(decision.mode).toBe("prefer_in_cloud");
    expect(decision.code).toBe("multi-photo");
  });

  it("lets privacy mode override everything", () => {
    const decision = decideRoute({ ...base, chars: 9000, photos: 4, privacyMode: true, offline: true });
    expect(decision.mode).toBe("only_on_device");
    expect(decision.code).toBe("privacy");
  });

  it("warns when privacy mode has no device model to run on", () => {
    const decision = decideRoute({ ...base, privacyMode: true, deviceSupported: false });
    expect(decision.mode).toBe("only_on_device");
    expect(decision.warning).toMatch(/no on-device model/i);
  });

  it("prefers the device when offline", () => {
    const decision = decideRoute({ ...base, offline: true, chars: 9000 });
    expect(decision.mode).toBe("prefer_on_device");
    expect(decision.code).toBe("offline");
  });

  it("offers report writing to the cloud first", () => {
    const decision = decideRoute({ ...base, task: "report", chars: 400 });
    expect(decision.mode).toBe("prefer_in_cloud");
    expect(decision.code).toBe("report");
  });

  it("still reports a usable mode when the device has no model", () => {
    const decision = decideRoute({ ...base, deviceSupported: false });
    expect(decision.mode).toBe("prefer_on_device");
    expect(decision.reason).toContain("falls back to the cloud");
  });
});

describe("describeMode", () => {
  it("labels every mode", () => {
    expect(describeMode("prefer_on_device")).toBe("Prefer on-device");
    expect(describeMode("only_on_device")).toBe("On-device only");
    expect(describeMode("prefer_in_cloud")).toBe("Prefer cloud");
    expect(describeMode("only_in_cloud")).toBe("Cloud only");
  });
});
