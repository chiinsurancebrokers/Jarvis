import type { Lang } from "../types.js";
import type { Case, Decision } from "./types.js";

export interface DayStats {
  day: number;
  received: number;
  waiting: number;
  needsYou: number;
  approved: number;
  edited: number;
  rejected: number;
  wouldAuto: number;
}

export function dayStats(cases: Case[], decisions: Decision[], now: Date): DayStats {
  const since = now.getTime() - 86_400_000;
  const recent = cases.filter((c) => Date.parse(c.createdAt) >= since);
  const decided = decisions.filter((d) => Date.parse(d.at) >= since);
  const firstAt = Math.min(now.getTime(), ...cases.map((c) => Date.parse(c.createdAt)));
  return {
    day: Math.floor((now.getTime() - firstAt) / 86_400_000) + 1,
    received: recent.length,
    waiting: cases.filter((c) => c.status === "pending").length,
    needsYou: cases.filter((c) => c.status === "needs_human").length,
    approved: decided.filter((d) => d.outcome === "approved" && !d.edited).length,
    edited: decided.filter((d) => d.outcome === "approved" && d.edited).length,
    rejected: decided.filter((d) => d.outcome === "rejected").length,
    wouldAuto: recent.filter((c) => c.shadowAuto).length,
  };
}

const text = {
  en: (s: DayStats) =>
    `Day ${s.day} report. ${s.received} new messages in the last 24 hours. ${s.waiting} drafts are waiting for your approval and ${s.needsYou} need you personally. You approved ${s.approved} as written, edited ${s.edited} and rejected ${s.rejected}. ${s.wouldAuto} could have been handled automatically under your rules.`,
  el: (s: DayStats) =>
    `Αναφορά ημέρας ${s.day}. ${s.received} νέα μηνύματα τις τελευταίες 24 ώρες. ${s.waiting} προσχέδια περιμένουν την έγκρισή σου και ${s.needsYou} χρειάζονται εσένα προσωπικά. Ενέκρινες ${s.approved} όπως ήταν, διόρθωσες ${s.edited} και απέρριψες ${s.rejected}. ${s.wouldAuto} θα μπορούσαν να έχουν διεκπεραιωθεί αυτόματα με τους κανόνες σου.`,
} satisfies Record<Lang, (s: DayStats) => string>;

export const dayReportText = (s: DayStats, lang: Lang): string => text[lang](s);
