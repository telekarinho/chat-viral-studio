/**
 * Melhorias que o Claude registra pelo conector (tabela `melhorias`) → issues do repositório (backlog do dev),
 * e o andamento de volta: issue fechada como concluída = "feita"; fechada como não planejada = "recusada".
 * Roda no workflow do worker com o GITHUB_TOKEN do próprio repositório (sem chave extra).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO = process.env.GITHUB_REPOSITORY ?? "telekarinho/chat-viral-studio";
const LABEL = "melhoria-do-diretor";

type Melhoria = { id: string; titulo: string; descricao: string; prioridade: string; status: string; issue_number: number | null; workspace_id: string | null; created_at: string };

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${required("GITHUB_TOKEN")}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) },
  });
}

/** Corpo do issue: tudo que o Claude escreveu + de onde veio (sem dados pessoais do criador). */
export function issueBody(m: Pick<Melhoria, "id" | "descricao" | "prioridade" | "created_at">): string {
  return `${m.descricao}\n\n---\nPrioridade: **${m.prioridade}** · registrada pelo Claude (conector) em ${m.created_at.slice(0, 10)} · melhoria \`${m.id}\``;
}

async function pushNew(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.from("melhorias").select("*").eq("status", "nova").order("created_at").limit(20);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const m of (data ?? []) as Melhoria[]) {
    const res = await gh("/issues", { method: "POST", body: JSON.stringify({ title: `[Diretor] ${m.titulo}`, body: issueBody(m), labels: [LABEL, `prioridade-${m.prioridade}`] }) });
    if (!res.ok) throw new Error(`GitHub ${res.status}: ${await res.text()}`);
    const issue = (await res.json()) as { number: number };
    const up = await db.from("melhorias").update({ status: "no_backlog", issue_number: issue.number, updated_at: new Date().toISOString() }).eq("id", m.id);
    if (up.error) throw new Error(up.error.message);
    n++;
  }
  return n;
}

async function pullStatus(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.from("melhorias").select("id, issue_number").eq("status", "no_backlog").not("issue_number", "is", null).limit(100);
  if (error) throw new Error(error.message);
  let n = 0;
  for (const m of (data ?? []) as Pick<Melhoria, "id" | "issue_number">[]) {
    const res = await gh(`/issues/${m.issue_number}`);
    if (!res.ok) continue;
    const issue = (await res.json()) as { state: string; state_reason: string | null };
    if (issue.state !== "closed") continue;
    const status = issue.state_reason === "not_planned" ? "recusada" : "feita";
    await db.from("melhorias").update({ status, updated_at: new Date().toISOString() }).eq("id", m.id);
    n++;
  }
  return n;
}

async function main() {
  const db = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const pushed = await pushNew(db);
  const updated = await pullStatus(db);
  process.stdout.write(JSON.stringify({ msg: "melhorias.sync", pushed, updated }) + "\n");
}

if (process.argv[1]?.includes("melhorias-cli")) {
  main().catch((e) => {
    process.stdout.write(JSON.stringify({ level: "error", msg: "melhorias.failed", error: e instanceof Error ? e.message : String(e) }) + "\n");
    process.exit(1);
  });
}
