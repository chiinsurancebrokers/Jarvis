import { getJson, postJson } from "../sources/http.js";
import type { InboxItem, MailProvider } from "../agent/types.js";

interface Part { mimeType?: string; body?: { data?: string }; parts?: Part[] }
interface GmailMessage {
  id: string; threadId: string; internalDate?: string;
  payload?: Part & { headers?: { name: string; value: string }[] };
}

const fromB64Url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const toB64Url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const stripHtml = (h: string) => h.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

/** Prefers text/plain; falls back to stripped text/html. */
export function extractBody(part: Part | undefined): string {
  if (!part) return "";
  const find = (p: Part, type: string): string | null => {
    if (p.mimeType === type && p.body?.data) return fromB64Url(p.body.data);
    for (const c of p.parts ?? []) {
      const r = find(c, type);
      if (r) return r;
    }
    return null;
  };
  const plain = find(part, "text/plain");
  if (plain) return plain;
  const html = find(part, "text/html");
  return html ? stripHtml(html) : "";
}

export function buildReplyMime(item: InboxItem, text: string): string {
  const subject = /^re:/i.test(item.subject) ? item.subject : `Re: ${item.subject}`;
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  const wrapped = b64(text).replace(/(.{76})/g, "$1\r\n");
  return [
    `To: ${item.from}`,
    `Subject: =?UTF-8?B?${b64(subject)}?=`,
    ...(item.messageId ? [`In-Reply-To: ${item.messageId}`, `References: ${item.messageId}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapped,
  ].join("\r\n");
}

/**
 * Gmail via OAuth refresh token. Scopes needed: gmail.readonly and gmail.compose.
 * It lists unread mail and creates DRAFTS. There is no send call anywhere in this class.
 */
export class GmailProvider implements MailProvider {
  constructor(private creds: { clientId: string; clientSecret: string; refreshToken: string }) {}

  private async accessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.creds.clientId, client_secret: this.creds.clientSecret,
      refresh_token: this.creds.refreshToken, grant_type: "refresh_token",
    });
    const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Google token endpoint answered ${res.status}`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async listNewItems(): Promise<InboxItem[]> {
    const auth = { authorization: `Bearer ${await this.accessToken()}` };
    const q = encodeURIComponent("in:inbox is:unread -category:promotions -category:social -category:updates newer_than:2d");
    const list = await getJson<{ messages?: { id: string }[] }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=20`, auth);
    const items: InboxItem[] = [];
    for (const m of list.messages ?? []) {
      const msg = await getJson<GmailMessage>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`, auth);
      const h = (n: string) => msg.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
      items.push({
        id: msg.id, threadId: msg.threadId, messageId: h("message-id"), from: h("from"), subject: h("subject"),
        body: extractBody(msg.payload), receivedAt: new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
      });
    }
    return items;
  }

  async createDraftReply(item: InboxItem, text: string): Promise<void> {
    const auth = { authorization: `Bearer ${await this.accessToken()}` };
    await postJson("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { message: { threadId: item.threadId, raw: toB64Url(buildReplyMime(item, text)) } }, auth);
  }
}
