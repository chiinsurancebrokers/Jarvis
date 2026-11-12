import { getJson } from "./http.js";
import type { NetlifySite } from "../types.js";

interface ApiSite {
  name: string;
  ssl_url?: string;
  url?: string;
  published_deploy?: { state?: string; published_at?: string; created_at?: string } | null;
  build_settings?: { repo_url?: string | null } | null;
}

export const toSite = (s: ApiSite): NetlifySite => ({
  name: s.name,
  url: s.ssl_url ?? s.url ?? "",
  state: s.published_deploy?.state ?? null,
  deployedAt: s.published_deploy?.published_at ?? s.published_deploy?.created_at ?? null,
  repoUrl: s.build_settings?.repo_url ?? null,
});

export async function fetchNetlify(token: string): Promise<NetlifySite[]> {
  const out: NetlifySite[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getJson<ApiSite[]>(
      `https://api.netlify.com/api/v1/sites?per_page=100&page=${page}`,
      { authorization: `Bearer ${token}` },
    );
    out.push(...batch.map(toSite));
    if (batch.length < 100) break;
  }
  return out;
}
