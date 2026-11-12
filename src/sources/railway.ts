import { postJson } from "./http.js";
import type { RailwayService } from "../types.js";

const ENDPOINT = "https://backboard.railway.com/graphql/v2";

const PROJECT_FIELDS = `
  id
  name
  environments { edges { node { id name } } }
  services { edges { node { id name
    serviceInstances { edges { node { environmentId
      latestDeployment { status createdAt }
    } } }
  } } }
`;

interface Edge<T> { edges: { node: T }[] }
interface ProjectNode {
  name: string;
  environments: Edge<{ id: string; name: string }>;
  services: Edge<{
    name: string;
    serviceInstances: Edge<{
      environmentId: string;
      latestDeployment: { status: string; createdAt: string } | null;
    }>;
  }>;
}
interface Resp {
  data?: { me?: { projects: Edge<ProjectNode> }; projects?: Edge<ProjectNode> };
  errors?: { message: string }[];
}

async function query(token: string, q: string): Promise<Resp> {
  return postJson<Resp>(ENDPOINT, { query: q }, { authorization: `Bearer ${token}` });
}

export function flatten(projects: ProjectNode[]): RailwayService[] {
  const out: RailwayService[] = [];
  for (const p of projects) {
    const envName = new Map(p.environments.edges.map((e) => [e.node.id, e.node.name]));
    for (const { node: svc } of p.services.edges) {
      for (const { node: inst } of svc.serviceInstances.edges) {
        out.push({
          project: p.name,
          service: svc.name,
          environment: envName.get(inst.environmentId) ?? "unknown",
          status: inst.latestDeployment?.status ?? null,
          deployedAt: inst.latestDeployment?.createdAt ?? null,
        });
      }
    }
  }
  return out;
}

/** Account tokens expose `me.projects`; workspace tokens expose `projects`. Try both. */
export async function fetchRailway(token: string): Promise<RailwayService[]> {
  let res = await query(token, `query { me { projects { edges { node { ${PROJECT_FIELDS} } } } } }`);
  let projects = res.data?.me?.projects.edges.map((e) => e.node);
  if (!projects) {
    res = await query(token, `query { projects { edges { node { ${PROJECT_FIELDS} } } } }`);
    projects = res.data?.projects?.edges.map((e) => e.node);
  }
  if (!projects) {
    throw new Error(res.errors?.[0]?.message ?? "Railway returned no projects");
  }
  return flatten(projects);
}
