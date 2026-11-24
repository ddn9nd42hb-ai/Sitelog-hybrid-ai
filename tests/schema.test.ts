import { describe, expect, it } from "vitest";
import { extractJson, needsSecondOpinion, parseFindings } from "../src/ai/schema";
import { FINDING_JSON } from "./fake-client";

describe("parseFindings", () => {
  it("parses the documented payload", () => {
    const result = parseFindings(FINDING_JSON);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      trade: "plumbing",
      severity: "high",
      confidence: 0.86
    });
  });

  it("survives a fenced code block with a preamble", () => {
    const text = "Here you go:\n```json\n" + FINDING_JSON + "\n```\nThanks!";
    const result = parseFindings(text);
    expect(result.ok).toBe(true);
    expect(result.findings).toHaveLength(1);
  });

  it("accepts a bare array", () => {
    const result = parseFindings('[{"trade":"tiling","severity":"low","location":"Lobby","issue":"Chipped edge","action":"Replace tile","confidence":0.9}]');
    expect(result.ok).toBe(true);
    expect(result.findings[0].trade).toBe("tiling");
  });

  it("maps small-model enum drift", () => {
    const result = parseFindings(
      '{"findings":[{"trade":"electric","severity":"urgent","location":"Plant room","issue":"Cable not glanded","action":"Gland before energising","confidence":"high"}]}'
    );
    expect(result.findings[0].trade).toBe("electrical");
    expect(result.findings[0].severity).toBe("critical");
    expect(result.findings[0].confidence).toBe(0.6);
  });

  it("clamps confidence into 0..1", () => {
    const result = parseFindings(
      '{"findings":[{"trade":"other","severity":"low","location":"x","issue":"y","action":"z","confidence":4.2}]}'
    );
    expect(result.findings[0].confidence).toBe(1);
  });

  it("rejects prose with no JSON", () => {
    const result = parseFindings("Sure! Here is my analysis: the ceiling looks wet.");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects a payload whose findings have no issue", () => {
    const result = parseFindings('{"findings":[{"trade":"plumbing","severity":"high","location":"3F"}]}');
    expect(result.ok).toBe(false);
  });
});

describe("extractJson", () => {
  it("finds an object embedded in text", () => {
    expect(extractJson('prefix {"a":1} suffix')).toEqual({ a: 1 });
  });

  it("throws on empty input", () => {
    expect(() => extractJson("   ")).toThrow();
  });
});

describe("needsSecondOpinion", () => {
  it("flags low confidence only", () => {
    expect(
      needsSecondOpinion([
        { trade: "other", severity: "low", location: "a", issue: "b", action: "c", confidence: 0.4 }
      ])
    ).toBe(true);
    expect(
      needsSecondOpinion([
        { trade: "other", severity: "low", location: "a", issue: "b", action: "c", confidence: 0.8 }
      ])
    ).toBe(false);
  });
});
