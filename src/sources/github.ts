import { getJson } from "./http.js";
import type { GithubRepo } from "../types.js";

interface ApiRepo {
  name: string;
  full_name: string;
  pushed_at: string | null;
  private: boolean;
  archived: boolean;
  owner: { login: string };
}

export async function fetchGithub(token: string, owner: string): Promise<GithubRepo[]> {
  const out: GithubRepo[] = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getJson<ApiRepo[]>(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,organization_member`,
      {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "jarvis",
        "x-github-api-version": "2022-11-28",
      },
    );
    for (const r of batch) {
      if (r.owner.login.toLowerCase() !== owner.toLowerCase() || !r.pushed_at) continue;
      out.push({
        name: r.name,
        fullName: r.full_name,
        pushedAt: r.pushed_at,
        private: r.private,
        archived: r.archived,
      });
    }
    if (batch.length < 100) break;
  }
  return out;
}
