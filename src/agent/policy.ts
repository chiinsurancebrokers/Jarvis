import { anyFlag } from "./guard.js";
import type { AutonomyConfig, CategoryStats, Flags, Triage } from "./types.js";

export interface RouteInput {
  triage: Triage;
  inFlags: Flags;
  draftFlags: Flags;
  stats: CategoryStats | undefined;
  cfg: AutonomyConfig;
}

export interface Route {
  /** "auto_eligible" is only ever reported in shadow mode: v0.2 sends nothing by itself. */
  route: "needs_approval" | "auto_eligible";
  reasons: string[];
}

/**
 * Autonomy is earned per category and can only be unlocked by the owner's switch.
 * Hard guard flags always win, whatever the model or the history says.
 */
export function decideRoute(i: RouteInput): Route {
  const reasons: string[] = [];
  if (i.inFlags.health) reasons.push("health information");
  if (i.inFlags.money || i.draftFlags.money) reasons.push("money or payment content");
  if (i.draftFlags.commitment) reasons.push("draft contains a commitment");
  if (i.triage.needsHuman) reasons.push("agent asked for a person");
  if (!i.triage.draft) reasons.push("no draft");

  if (!i.cfg.enabled) reasons.push("autonomy is switched off");
  else if (!i.cfg.categories.includes(i.triage.category)) reasons.push("category not approved for autonomy");

  const s = i.stats;
  if (!s || s.decisions < i.cfg.minDecisions) {
    reasons.push(`only ${s?.decisions ?? 0} of ${i.cfg.minDecisions} decisions of history`);
  } else if (s.approvedUnchanged / s.decisions < i.cfg.minUnchangedRate) {
    reasons.push("too many past drafts were edited or rejected");
  }
  if (i.triage.confidence < i.cfg.minConfidence) reasons.push("low confidence");

  const blocked = reasons.length > 0 || anyFlag(i.inFlags, i.draftFlags);
  return { route: blocked ? "needs_approval" : "auto_eligible", reasons };
}
