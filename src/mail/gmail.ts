import { getJson, postJson } from "../sources/http.js";
import type { InboxItem, MailProvider } from "../agent/types.js";
import type { Attachment, Sender } from "../super/types.js";

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

const encWord = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
const wrap76 = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n");

/** Plain text, or multipart/mixed with one attachment. Header values are checked for line breaks. */
export function buildMime(to: string, subject: string, text: string, att?: Attachment): string {
  if (/[\r\n]/.test(to + subject)) throw new Error("invalid header value");
  const head = [`To: ${to}`, `Subject: ${encWord(subject)}`, "MIME-Version: 1.0"];
  const body = wrap76(Buffer.from(text, "utf8").toString("base64"));
  if (!att) return [...head, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body].join("\r\n");
  const b = `jarvis_${Date.now().toString(36)}`;
  return [
    ...head, `Content-Type: multipart/mixed; boundary="${b}"`, "",
    `--${b}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body,
    `--${b}`, `Content-Type: ${att.mime}; name="${encWord(att.name)}"`, `Content-Disposition: attachment; filename="${encWord(att.name)}"`,
    "Content-Transfer-Encoding: base64", "", wrap76(att.base64), `--${b}--`, "",
  ].join("\r\n");
}

/**
 * Gmail via OAuth refresh token. Scopes needed: gmail.readonly and gmail.compose.
 * It lists unread mail and creates DRAFTS. `send` exists for owner-approved sends only and is
 * reachable solely through the orchestrator / workflow, which check the ALLOW_SEND switch first.
 * Sending needs the extra scope gmail.send.
 */
export class GmailProvider implements MailProvider, Sender {
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

  /** Sends a message. Callers must have the owner's approval and ALLOW_SEND. */
  async send(to: string, subject: string, text: string, attachment?: Attachment, threadId?: string): Promise<void> {
    const auth = { authorization: `Bearer ${await this.accessToken()}` };
    await postJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { raw: toB64Url(buildMime(to, subject, text, attachment)), ...(threadId ? { threadId } : {}) }, auth);
  }

  async sendReply(item: InboxItem, text: string): Promise<void> {
    const auth = { authorization: `Bearer ${await this.accessToken()}` };
    await postJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { raw: toB64Url(buildReplyMime(item, text)), threadId: item.threadId }, auth);
  }

  async createDraftReply(item: InboxItem, text: string): Promise<void> {
    const auth = { authorization: `Bearer ${await this.accessToken()}` };
    await postJson("https://gmail.googleapis.com/gmail/v1/users/me/drafts", { message: { threadId: item.threadId, raw: toB64Url(buildReplyMime(item, text)) } }, auth);
  }
}
