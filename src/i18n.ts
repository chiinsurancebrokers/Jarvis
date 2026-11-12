import type { Finding, FindingCode, Lang, Report, Severity } from "./types.js";

type Template = (p: Finding["params"]) => string;

export const messages: Record<Lang, Record<FindingCode, Template>> = {
  en: {
    deploy_failed: (p) => `deployment is ${p.status} in ${p.environment}`,
    offline: (p) => `has no live deployment in ${p.environment}`,
    deploy_stale: (p) => `last deployed ${p.days} days ago`,
    duplicate_site: (p) => `built from the same repository as ${p.others}`,
    dormant_but_deployed: (p) => `no code changes for ${p.days} days, yet it is still deployed`,
    repo_dormant: (p) => `no code changes for ${p.days} days`,
    source_unavailable: (p) => `could not read ${p.source}: ${p.message}`,
  },
  el: {
    deploy_failed: (p) => `η ανάπτυξη είναι ${p.status} στο περιβάλλον ${p.environment}`,
    offline: (p) => `δεν έχει ενεργή ανάπτυξη στο περιβάλλον ${p.environment}`,
    deploy_stale: (p) => `τελευταία ανάπτυξη πριν από ${p.days} ημέρες`,
    duplicate_site: (p) => `χτίζεται από το ίδιο αποθετήριο με: ${p.others}`,
    dormant_but_deployed: (p) =>
      `καμία αλλαγή κώδικα εδώ και ${p.days} ημέρες, αλλά παραμένει σε λειτουργία`,
    repo_dormant: (p) => `καμία αλλαγή κώδικα εδώ και ${p.days} ημέρες`,
    source_unavailable: (p) => `δεν ήταν δυνατή η ανάγνωση του ${p.source}: ${p.message}`,
  },
};

const labels = {
  en: {
    title: "Jarvis audit",
    clean: "Everything looks healthy.",
    severity: { critical: "Critical", warning: "Needs a look", info: "For your information" } as Record<Severity, string>,
    counts: (r: Report) =>
      `${r.counts.railwayServices} Railway services, ${r.counts.netlifySites} Netlify sites, ${r.counts.githubRepos} GitHub repositories`,
    spokenIntro: (c: number, w: number) =>
      `${c} critical and ${w} items that need a look.`,
  },
  el: {
    title: "Έλεγχος Jarvis",
    clean: "Όλα φαίνονται υγιή.",
    severity: { critical: "Κρίσιμο", warning: "Θέλει έλεγχο", info: "Για ενημέρωση" } as Record<Severity, string>,
    counts: (r: Report) =>
      `${r.counts.railwayServices} υπηρεσίες Railway, ${r.counts.netlifySites} ιστότοποι Netlify, ${r.counts.githubRepos} αποθετήρια GitHub`,
    spokenIntro: (c: number, w: number) =>
      `${c} κρίσιμα και ${w} θέματα που θέλουν έλεγχο.`,
  },
};

export const labelsFor = (lang: Lang) => labels[lang];

export const describe = (f: Finding, lang: Lang): string =>
  `${f.project}: ${messages[lang][f.code](f.params)}`;

/** Short text meant to be read aloud by the voice agent: only what needs attention. */
export function spokenSummary(report: Report, lang: Lang): string {
  const l = labels[lang];
  const critical = report.findings.filter((f) => f.severity === "critical");
  const warning = report.findings.filter((f) => f.severity === "warning");
  if (critical.length === 0 && warning.length === 0) return l.clean;
  const top = [...critical, ...warning].slice(0, 5).map((f) => `${describe(f, lang)}.`);
  return [l.spokenIntro(critical.length, warning.length), ...top].join(" ");
}
