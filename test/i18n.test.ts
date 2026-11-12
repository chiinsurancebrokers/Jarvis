import { describe, expect, it } from "vitest";
import { messages, spokenSummary } from "../src/i18n.js";
import type { Report } from "../src/types.js";

describe("i18n", () => {
  it("has the same finding codes in English and Greek", () => {
    expect(Object.keys(messages.el).sort()).toEqual(Object.keys(messages.en).sort());
  });

  it("speaks only what needs attention, in the requested language", () => {
    const report: Report = {
      generatedAt: "2026-11-12T00:00:00Z",
      counts: { railwayServices: 1, netlifySites: 0, githubRepos: 0 },
      findings: [
        { platform: "railway", project: "a/web", severity: "critical", code: "deploy_failed", params: { status: "CRASHED", environment: "production" } },
        { platform: "github", project: "o/x", severity: "info", code: "repo_dormant", params: { days: 300 } },
      ],
    };
    const en = spokenSummary(report, "en");
    const el = spokenSummary(report, "el");
    expect(en).toContain("1 critical");
    expect(en).not.toContain("300");
    expect(el).toContain("κρίσιμα");
  });

  it("says everything is healthy when nothing needs attention", () => {
    const empty: Report = { generatedAt: "", counts: { railwayServices: 0, netlifySites: 0, githubRepos: 0 }, findings: [] };
    expect(spokenSummary(empty, "en")).toMatch(/healthy/);
    expect(spokenSummary(empty, "el")).toMatch(/υγιή/);
  });
});
