/** Small fetch wrapper: JSON in/out, hard timeout, readable errors. Read-only use only. */
export async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    throw new Error(`${new URL(url).host} answered ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`${new URL(url).host} answered ${res.status}`);
  }
  return (await res.json()) as T;
}
