import type { Case } from "../../agent/types.js";
import { getLatest } from "../../audit.js";
import type { Agent } from "../types.js";

/** Morning brief: what waits for the owner and what is broken. Proposes one note per day. */
export const dailyOps: Agent = {
  id: "daily_ops",
  async run(d) {
    const cases = await d.store.list<Case>("cases");
    const open = cases.filter((c) => c.status === "pending" || c.status === "needs_human");
    const old = open.filter((c) => d.now().getTime() - Date.parse(c.createdAt) > 24 * 3_600_000);
    const health = open.filter((c) => c.handler).length;
    const report = getLatest();
    const critical = report?.findings.filter((f) => f.severity === "critical").length ?? 0;
    const lines = [
      `${open.length} email case(s) waiting (${old.length} older than 24h, ${health} health messages for you).`,
      `${critical} critical platform finding(s).`,
    ];
    if (open.length === 0 && critical === 0) return [];
    return [{
      agent: "daily_ops", kind: "note", title: "Morning brief", summary: lines.join(" "),
      payload: { open: open.length, older: old.length, health, critical }, reasons: [],
    }];
  },
};
