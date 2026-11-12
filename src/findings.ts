import type {
  Finding,
  GithubRepo,
  NetlifySite,
  ProbeResult,
  RailwayService,
  Snapshot,
} from "./types.js";

export interface AnalyzeOptions {
  now: Date;
  staleDays: number;
  dormantDays: number;
  /** A page slower than this many milliseconds is flagged. */
  slowMs?: number;
}

const DAY_MS = 86_400_000;

export const daysSince = (iso: string | null, now: Date): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / DAY_MS);
};

/** Lowercase alphanumerics only, so "Ashlar-Proposal-Studio" matches "ashlarproposalstudio". */
export const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const BAD_STATUSES = new Set(["FAILED", "CRASHED"]);
const OFFLINE_STATUSES = new Set(["REMOVED", "REMOVING"]);

function railwayFindings(services: RailwayService[]): Finding[] {
  const out: Finding[] = [];
  for (const s of services) {
    const project = `${s.project}/${s.service}`;
    if (s.status && BAD_STATUSES.has(s.status)) {
      out.push({
        platform: "railway",
        project,
        severity: "critical",
        code: "deploy_failed",
        params: { status: s.status, environment: s.environment },
      });
    } else if (s.status === null || OFFLINE_STATUSES.has(s.status)) {
      out.push({
        platform: "railway",
        project,
        severity: "warning",
        code: "offline",
        params: { environment: s.environment },
      });
    }
  }
  return out;
}

function netlifyFindings(sites: NetlifySite[], o: AnalyzeOptions): Finding[] {
  const out: Finding[] = [];
  for (const s of sites) {
    if (s.state && s.state !== "ready") {
      out.push({
        platform: "netlify",
        project: s.name,
        severity: "critical",
        code: "deploy_failed",
        params: { status: s.state, environment: "production" },
      });
    }
    const age = daysSince(s.deployedAt, o.now);
    if (age !== null && age > o.staleDays) {
      out.push({
        platform: "netlify",
        project: s.name,
        severity: "info",
        code: "deploy_stale",
        params: { days: age },
      });
    }
  }
  // Sites built from the same repository are almost always copies of each other.
  const byRepo = new Map<string, string[]>();
  for (const s of sites) {
    if (!s.repoUrl) continue;
    const key = s.repoUrl.toLowerCase().replace(/\.git$/, "");
    byRepo.set(key, [...(byRepo.get(key) ?? []), s.name]);
  }
  for (const names of byRepo.values()) {
    if (names.length < 2) continue;
    for (const name of names) {
      out.push({
        platform: "netlify",
        project: name,
        severity: "warning",
        code: "duplicate_site",
        params: { others: names.filter((n) => n !== name).join(", ") },
      });
    }
  }
  return out;
}

function githubFindings(
  repos: GithubRepo[],
  snap: Snapshot,
  o: AnalyzeOptions,
): Finding[] {
  const out: Finding[] = [];
  const deployed = new Set<string>([
    ...snap.railway.flatMap((s) => [normalize(s.project), normalize(s.service)]),
    ...snap.netlify.map((s) => normalize(s.name)),
  ]);
  for (const r of repos) {
    if (r.archived) continue;
    const age = daysSince(r.pushedAt, o.now);
    if (age === null || age <= o.dormantDays) continue;
    const isDeployed = deployed.has(normalize(r.name));
    out.push({
      platform: "github",
      project: r.fullName,
      severity: isDeployed ? "warning" : "info",
      code: isDeployed ? "dormant_but_deployed" : "repo_dormant",
      params: { days: age },
    });
  }
  return out;
}

function probeFindings(probes: ProbeResult[], o: AnalyzeOptions): Finding[] {
  const out: Finding[] = [];
  const slow = o.slowMs ?? 4000;
  for (const p of probes) {
    const host = p.url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    if (p.status === null || p.status >= 500) {
      out.push({ platform: "jarvis", project: host, severity: "critical", code: "url_down", params: { status: p.status ?? "no answer" } });
    } else if (p.status >= 400) {
      out.push({ platform: "jarvis", project: host, severity: "warning", code: "url_error", params: { status: p.status } });
    } else if (p.ms > slow) {
      out.push({ platform: "jarvis", project: host, severity: "info", code: "url_slow", params: { seconds: Math.round(p.ms / 100) / 10 } });
    }
  }
  return out;
}

export function analyze(snap: Snapshot, o: AnalyzeOptions): Finding[] {
  const findings: Finding[] = [];
  for (const [source, message] of Object.entries(snap.errors)) {
    findings.push({
      platform: "jarvis",
      project: source,
      severity: "warning",
      code: "source_unavailable",
      params: { source, message: message ?? "" },
    });
  }
  findings.push(
    ...railwayFindings(snap.railway),
    ...netlifyFindings(snap.netlify, o),
    ...githubFindings(snap.github, snap, o),
    ...probeFindings(snap.probes ?? [], o),
  );
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.project.localeCompare(b.project),
  );
}
