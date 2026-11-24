import { describe, expect, it } from "vitest";
import { renderMarkdown, sourceLabel, timeAgo } from "../src/lib/format";

describe("renderMarkdown", () => {
  it("renders headings and bullets", () => {
    const html = renderMarkdown("## Site report\n\n- one\n- two");
    expect(html).toContain("<h3>Site report</h3>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
  });

  it("escapes model output before rendering", () => {
    const html = renderMarkdown('<script>alert("x")</script>\n\n**bold**');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("keeps paragraphs separated", () => {
    expect(renderMarkdown("a\n\nb")).toBe("<p>a</p><p>b</p>");
  });
});

describe("labels", () => {
  it("names the inference source", () => {
    expect(sourceLabel("on_device")).toBe("On-device");
    expect(sourceLabel("in_cloud")).toBe("Cloud");
    expect(sourceLabel("unknown")).toBe("Unknown");
  });

  it("formats relative time", () => {
    const now = 1_700_000_000_000;
    expect(timeAgo(now - 5_000, now)).toBe("just now");
    expect(timeAgo(now - 120_000, now)).toBe("2 min ago");
    expect(timeAgo(now - 7_200_000, now)).toBe("2 h ago");
  });
});
