import type { AutonomyConfig, Category } from "./agent/types.js";
import { CATEGORIES } from "./agent/types.js";
import type { Lang } from "./types.js";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const categories = (process.env.AUTONOMY_CATEGORIES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s): s is Category => (CATEGORIES as string[]).includes(s));

export const autonomy: AutonomyConfig = {
  enabled: process.env.AUTONOMY_ENABLED === "true",
  categories,
  minDecisions: num(process.env.AUTONOMY_MIN_DECISIONS, 20),
  minUnchangedRate: num(process.env.AUTONOMY_MIN_UNCHANGED_RATE, 0.9),
  minConfidence: num(process.env.AUTONOMY_MIN_CONFIDENCE, 0.8),
};

export const config = {
  port: num(process.env.PORT, 3000),
  token: process.env.JARVIS_TOKEN ?? "",
  railwayToken: process.env.RAILWAY_API_TOKEN ?? "",
  netlifyToken: process.env.NETLIFY_TOKEN ?? "",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  githubOwner: process.env.GITHUB_OWNER ?? "chiinsurancebrokers",
  defaultLang: (process.env.DEFAULT_LANG === "el" ? "el" : "en") as Lang,
  staleDays: num(process.env.STALE_DAYS, 90),
  dormantDays: num(process.env.DORMANT_DAYS, 180),
  auditIntervalHours: num(process.env.AUDIT_INTERVAL_HOURS, 6),
  // Agent
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  databaseUrl: process.env.DATABASE_URL ?? "",
  rulesPath: process.env.RULES_PATH ?? "rules/jarvis-rules.md",
  pollMinutes: num(process.env.POLL_MINUTES, 5),
  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID ?? "",
    clientSecret: process.env.GMAIL_CLIENT_SECRET ?? "",
    refreshToken: process.env.GMAIL_REFRESH_TOKEN ?? "",
  },
};
