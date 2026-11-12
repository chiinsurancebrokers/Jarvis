export type Lang = "en" | "el";
export type Platform = "railway" | "netlify" | "github" | "jarvis";
export type Severity = "critical" | "warning" | "info";

export type FindingCode =
  | "deploy_failed"
  | "offline"
  | "deploy_stale"
  | "duplicate_site"
  | "dormant_but_deployed"
  | "repo_dormant"
  | "source_unavailable";

export interface Finding {
  platform: Platform;
  project: string;
  severity: Severity;
  code: FindingCode;
  /** Values interpolated into the localized message. */
  params: Record<string, string | number>;
}

export interface RailwayService {
  project: string;
  service: string;
  environment: string;
  /** Railway deployment status, or null when the service has no live deployment. */
  status: string | null;
  deployedAt: string | null;
}

export interface NetlifySite {
  name: string;
  url: string;
  /** Netlify deploy state of the published deploy, e.g. "ready". */
  state: string | null;
  deployedAt: string | null;
  repoUrl: string | null;
}

export interface GithubRepo {
  name: string;
  fullName: string;
  pushedAt: string;
  private: boolean;
  archived: boolean;
}

export interface Snapshot {
  railway: RailwayService[];
  netlify: NetlifySite[];
  github: GithubRepo[];
  /** Per-source error message when that source could not be read. */
  errors: Partial<Record<"railway" | "netlify" | "github", string>>;
}

export interface Report {
  generatedAt: string;
  counts: { railwayServices: number; netlifySites: number; githubRepos: number };
  findings: Finding[];
}
