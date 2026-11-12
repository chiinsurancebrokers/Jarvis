import { anyFlag, healthHandler, inspectDraft, inspectIncoming } from "./guard.js";
import { categoryStats, pickExamples } from "./learning.js";
import { decideRoute } from "./policy.js";
import { buildSystemPrompt, buildUserPrompt, parseTriage } from "./triage.js";
import type {
  AutonomyConfig, Case, Decision, Example, InboxItem, Llm, MailProvider, Store,
} from "./types.js";

export interface Deps {
  store: Store;
  llm: Llm;
  mail: MailProvider;
  rules: string;
  cfg: AutonomyConfig;
  now: () => Date;
}

const excerpt = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Turns one incoming email into a case waiting for the owner. Never sends anything. */
export async function processItem(d: Deps, item: InboxItem): Promise<Case | null> {
  if (await d.store.get("cases", item.id)) return null; // already handled
  const inFlags = inspectIncoming(`${item.subject}\n${item.body}`);
  const base: Case = {
    id: item.id, item, inFlags, triage: null, draft: null,
    status: "needs_human", shadowAuto: false, routeReasons: [], createdAt: d.now().toISOString(),
  };

  // Health information is never sent to the model: a person handles it from the start.
  if (inFlags.health) {
    base.handler = healthHandler(`${item.subject}\n${item.body}`) ?? "asklepios";
    base.routeReasons = ["health information: not sent to the agent"];
    await d.store.put("cases", item.id, base);
    return base;
  }

  try {
    const examples = await pickExamples(d.store, "client_question", "el");
    // First pass classifies with generic examples; categories refine as history grows.
    const raw = await d.llm(buildSystemPrompt(d.rules, examples), buildUserPrompt(item));
    let triage = parseTriage(raw);
    if (triage.category !== "client_question") {
      const better = await pickExamples(d.store, triage.category, triage.language);
      if (better.length > 0) triage = parseTriage(await d.llm(buildSystemPrompt(d.rules, better), buildUserPrompt(item)));
    }
    const draftFlags = triage.draft ? inspectDraft(triage.draft) : { money: false, health: false, commitment: false };
    const stats = (await categoryStats(d.store))[triage.category];
    const route = decideRoute({ triage, inFlags, draftFlags, stats, cfg: d.cfg });
    base.triage = triage;
    base.draft = triage.draft;
    base.routeReasons = route.reasons;
    base.shadowAuto = route.route === "auto_eligible";
    const mustLookClosely = triage.needsHuman || anyFlag(inFlags, draftFlags) || !triage.draft;
    base.status = mustLookClosely ? "needs_human" : "pending";
  } catch (e) {
    base.routeReasons = [`agent unavailable: ${e instanceof Error ? e.message : String(e)}`];
  }
  await d.store.put("cases", item.id, base);
  return base;
}

export async function poll(d: Deps): Promise<number> {
  let created = 0;
  for (const item of await d.mail.listNewItems()) {
    if (await processItem(d, item)) created++;
  }
  return created;
}

export type Action = { type: "approve"; text?: string } | { type: "reject" };

/** The owner's decision. Approval only creates a Gmail draft; the owner presses send. */
export async function decide(d: Deps, id: string, action: Action): Promise<Case> {
  const c = await d.store.get<Case>("cases", id);
  if (!c) throw new Error("case not found");
  if (c.status === "approved" || c.status === "rejected") throw new Error("case already decided");
  const at = d.now().toISOString();
  const category = c.triage?.category ?? "other";

  if (action.type === "reject") {
    c.status = "rejected";
    c.decidedAt = at;
    await d.store.put<Decision>("decisions", id, { id, category, outcome: "rejected", edited: false, at });
  } else {
    const finalText = (action.text ?? c.draft ?? "").trim();
    if (!finalText) throw new Error("nothing to approve: write a reply first");
    await d.mail.createDraftReply(c.item, finalText);
    const edited = c.draft === null || finalText !== c.draft.trim();
    c.status = "approved";
    c.finalText = finalText;
    c.edited = edited;
    c.decidedAt = at;
    await d.store.put<Decision>("decisions", id, { id, category, outcome: "approved", edited, at });
    await d.store.put<Example>("examples", id, {
      id, category, language: c.triage?.language ?? "other",
      incoming: excerpt(c.item.body, 600), reply: finalText, at,
    });
  }
  await d.store.put("cases", id, c);
  return c;
}
