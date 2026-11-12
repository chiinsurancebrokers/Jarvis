import { readFileSync } from "node:fs";
import { autonomy, config } from "../config.js";
import { GmailProvider } from "../mail/gmail.js";
import { anthropicLlm } from "./anthropic.js";
import { MemoryStore, PgStore } from "./store.js";
import type { Deps } from "./workflow.js";

export interface Runtime {
  deps: Deps;
  /** Which parts are configured; the UI and /api/status show this. */
  ready: { llm: boolean; mail: boolean; persistent: boolean };
}

const notConfigured = (what: string) => async (): Promise<never> => {
  throw new Error(`${what} is not configured`);
};

export function buildRuntime(): Runtime {
  let rules = "";
  try {
    rules = readFileSync(config.rulesPath, "utf8");
  } catch {
    console.warn(`rules file not found at ${config.rulesPath}; running with no owner rules`);
  }
  const llmOk = Boolean(config.anthropicKey);
  const g = config.gmail;
  const mailOk = Boolean(g.clientId && g.clientSecret && g.refreshToken);
  const mail = mailOk
    ? new GmailProvider(g)
    : { listNewItems: async () => [], createDraftReply: notConfigured("Gmail") };
  return {
    deps: {
      store: config.databaseUrl ? new PgStore(config.databaseUrl) : new MemoryStore(),
      llm: llmOk ? anthropicLlm(config.anthropicKey, config.anthropicModel) : notConfigured("ANTHROPIC_API_KEY"),
      mail,
      rules,
      cfg: autonomy,
      now: () => new Date(),
    },
    ready: { llm: llmOk, mail: mailOk, persistent: Boolean(config.databaseUrl) },
  };
}
