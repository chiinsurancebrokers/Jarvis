import { config } from "./config.js";
import { analyze } from "./findings.js";
import { fetchGithub } from "./sources/github.js";
import { fetchNetlify } from "./sources/netlify.js";
import { fetchRailway } from "./sources/railway.js";
import type { Report, Snapshot } from "./types.js";

type Source = "railway" | "netlify" | "github";

async function collect(): Promise<Snapshot> {
  const snap: Snapshot = { railway: [], netlify: [], github: [], errors: {} };
  const jobs: [Source, string, () => Promise<void>][] = [
    ["railway", config.railwayToken, async () => { snap.railway = await fetchRailway(config.railwayToken); }],
    ["netlify", config.netlifyToken, async () => { snap.netlify = await fetchNetlify(config.netlifyToken); }],
    ["github", config.githubToken, async () => { snap.github = await fetchGithub(config.githubToken, config.githubOwner); }],
  ];
  await Promise.all(
    jobs.map(async ([name, token, run]) => {
      if (!token) {
        snap.errors[name] = "no API token configured";
        return;
      }
      try {
        await run();
      } catch (e) {
        snap.errors[name] = e instanceof Error ? e.message : String(e);
      }
    }),
  );
  return snap;
}

export async function runAudit(now = new Date()): Promise<Report> {
  const snap = await collect();
  return {
    generatedAt: now.toISOString(),
    counts: {
      railwayServices: snap.railway.length,
      netlifySites: snap.netlify.length,
      githubRepos: snap.github.length,
    },
    findings: analyze(snap, {
      now,
      staleDays: config.staleDays,
      dormantDays: config.dormantDays,
    }),
  };
}

let latest: Report | null = null;
export const getLatest = () => latest;
export const setLatest = (r: Report) => { latest = r; };
