import { describe, expect, it } from "vitest";
import { analyze, normalize } from "../src/findings.js";
import type { Snapshot } from "../src/types.js";

const now = new Date("2026-11-12T00:00:00Z");
const opts = { now, staleDays: 90, dormantDays: 180 };
const empty: Snapshot = { railway: [], netlify: [], github: [], errors: {} };

describe("analyze", () => {
  it("flags crashed deployments as critical and missing ones as offline", () => {
    const f = analyze(
      {
        ...empty,
        railway: [
          { project: "a", service: "web", environment: "production", status: "CRASHED", deployedAt: null },
          { project: "b", service: "api", environment: "production", status: null, deployedAt: null },
          { project: "c", service: "ok", environment: "production", status: "SUCCESS", deployedAt: null },
        ],
      },
      opts,
    );
    expect(f.map((x) => [x.project, x.code, x.severity])).toEqual([
      ["a/web", "deploy_failed", "critical"],
      ["b/api", "offline", "warning"],
    ]);
  });

  it("flags stale Netlify deploys and duplicate sites built from one repo", () => {
    const f = analyze(
      {
        ...empty,
        netlify: [
          { name: "one", url: "", state: "ready", deployedAt: "2026-05-12T00:00:00Z", repoUrl: "https://github.com/x/y" },
          { name: "two", url: "", state: "ready", deployedAt: "2026-11-05T00:00:00Z", repoUrl: "https://github.com/x/y.git" },
        ],
      },
      opts,
    );
    expect(f.filter((x) => x.code === "duplicate_site").map((x) => x.project).sort()).toEqual(["one", "two"]);
    expect(f.filter((x) => x.code === "deploy_stale").map((x) => x.project)).toEqual(["one"]);
  });

  it("marks a dormant repo that is still deployed as a warning, otherwise info", () => {
    const f = analyze(
      {
        ...empty,
        railway: [{ project: "tzoker", service: "tzoker", environment: "production", status: "SUCCESS", deployedAt: null }],
        github: [
          { name: "tzoker", fullName: "o/tzoker", pushedAt: "2026-01-01T00:00:00Z", private: false, archived: false },
          { name: "old-thing", fullName: "o/old-thing", pushedAt: "2025-01-01T00:00:00Z", private: false, archived: false },
          { name: "fresh", fullName: "o/fresh", pushedAt: "2026-11-01T00:00:00Z", private: false, archived: false },
        ],
      },
      opts,
    );
    expect(f.map((x) => [x.project, x.code, x.severity])).toEqual([
      ["o/tzoker", "dormant_but_deployed", "warning"],
      ["o/old-thing", "repo_dormant", "info"],
    ]);
  });

  it("reports an unreadable source instead of hiding it", () => {
    const f = analyze({ ...empty, errors: { github: "no API token configured" } }, opts);
    expect(f[0]?.code).toBe("source_unavailable");
  });

  it("normalizes names for cross-platform matching", () => {
    expect(normalize("Ashlar-Proposal-Studio")).toBe("ashlarproposalstudio");
  });
});
