import type { ProbeResult } from "../types.js";

/** Plain GET of a public page. Read-only: it only checks that the site answers. */
export async function probeUrl(url: string): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "Jarvis-uptime-check" },
    });
    await res.body?.cancel();
    return { url, status: res.status, ms: Date.now() - started, error: null };
  } catch (e) {
    return { url, status: null, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
  }
}

const isHttp = (u: string) => /^https?:\/\//i.test(u);

/** Checks all distinct http(s) URLs in parallel; a failure never throws. */
export async function probeAll(urls: string[]): Promise<ProbeResult[]> {
  const unique = [...new Set(urls.filter(isHttp))];
  return Promise.all(unique.map(probeUrl));
}
