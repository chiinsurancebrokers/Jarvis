import type { Lang } from "./types.js";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
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
};
