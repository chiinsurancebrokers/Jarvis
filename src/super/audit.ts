import { randomUUID } from "node:crypto";
import type { AuditEntry, SuperDeps } from "./types.js";

/** Append-only log of every proposal, decision and execution. Never contains email bodies. */
export async function audit(d: Pick<SuperDeps, "store" | "now">, actor: string, event: string, proposalId?: string, detail?: string) {
  const e: AuditEntry = { id: randomUUID(), at: d.now().toISOString(), actor, event, proposalId, detail };
  await d.store.put("audit", e.id, e);
}
