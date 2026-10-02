/**
 * Conector MCP de ponta a ponta: Supabase local (Auth + banco + Edge Function `mcp` servida pelo CLI).
 * Pula sem SUPABASE_*. Roda no CI depois do `supabase start`.
 */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { RODRIGO_PILLARS, RODRIGO_PROFILE, generateLocal, rodrigoRoutine } from "@postai/domain";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!(url && anon && service))("conector MCP (Supabase local)", () => {
  it("link do perfil: lista o dia, entrega regras, salva roteiro na caixa do app; link desligado para de funcionar", async () => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } });
    const email = `mcp-${randomUUID()}@test.local`;
    const password = `pw-${randomUUID()}`;
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const user = createClient(url!, anon!, { auth: { persistSession: false } });
    await user.auth.signInWithPassword({ email, password });
    const { data: ws } = await user.rpc("bootstrap_workspace", { p_name: "R", p_profile: RODRIGO_PROFILE, p_pillars: RODRIGO_PILLARS, p_blocks: rodrigoRoutine(randomUUID) });
    const contentId = randomUUID();
    const ins = await user.from("content_items").insert({ id: contentId, workspace_id: ws, format: "thought", pillar_slug: "familia", plan_date: "2026-10-01", title: "Pensamento do Dia" });
    expect(ins.error).toBeNull();

    const tok = await user.rpc("create_mcp_token", { p_workspace: ws });
    expect(tok.error).toBeNull();
    const endpoint = `${url}/functions/v1/mcp/${tok.data as string}`;
    let id = 0;
    const rpc = async (method: string, params?: unknown) => {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      return { status: res.status, body: res.status === 200 ? await res.json() : null };
    };
    const tool = async (name: string, args: Record<string, unknown>) => (await rpc("tools/call", { name, arguments: args })).body.result.content[0].text as string;

    expect((await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste" } })).body.result.serverInfo.name).toBe("postai");
    expect((await rpc("tools/list")).body.result.tools.length).toBeGreaterThanOrEqual(5);
    expect(await tool("conteudos_do_dia", { data: "2026-10-01" })).toContain(contentId);
    expect(await tool("instrucoes_do_roteiro", { content_id: contentId })).toContain("E se der certo!");
    expect(await tool("perfil_e_estrategia", {})).toContain("Família");

    const raw = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "familia", pillarName: "Família", format: "thought", eventText: null, recent: [] }).draft;
    const draft = { ...raw, hook_options: ["Ninguém te conta isso sobre ter 40", "Eu quase desisti hoje", "Você já sentiu isso?"], screen_text: "Vida real 40+",
      duration_seconds: Math.max(3, Math.round(raw.script.split(/\s+/).filter(Boolean).length / 2.5)) };
    expect(await tool("salvar_roteiro", { content_id: contentId, roteiro: draft })).toContain("enviado para o Post.ai");
    // diretor: perfis do dono, roteiro salvo legível, plano de dia futuro no fuso de Brasília, melhoria no backlog
    expect(await tool("listar_perfis", {})).toContain(`id ${ws}`);
    const lido = JSON.parse(await tool("ler_roteiro", { content_id: contentId }));
    expect(lido).toMatchObject({ content_id: contentId, pendingFromAssistant: true, draft: null });
    expect(lido.pendente.draft.title).toBe(draft.title);
    expect(await tool("conteudos_do_dia", { data: "2026-10-01" })).toContain("roteiro do assistente aguardando abertura no app");
    // o roteiro pendente já bloqueia o mesmo assunto em outro conteúdo
    const other = randomUUID();
    await user.from("content_items").insert({ id: other, workspace_id: ws, format: "thought", pillar_slug: "familia", plan_date: "2026-10-01", title: "Pensamento do Dia" });
    expect(await tool("salvar_roteiro", { content_id: other, roteiro: draft })).toContain("repetição — assunto");
    const plano = await tool("criar_plano", { data_inicio: "2027-03-01", dias: 2 });
    expect(plano).toContain("2027-03-01 (plano criado agora)");
    const future = await admin.from("recording_tasks").select("scheduled_for").eq("workspace_id", ws).gte("scheduled_for", "2027-03-01T03:00:00Z").lt("scheduled_for", "2027-03-02T03:00:00Z");
    expect(future.data!.length).toBeGreaterThan(0); // segunda-feira tem rotina
    expect(await tool("criar_plano", { data_inicio: "2027-03-01", dias: 1 })).not.toContain("plano criado agora"); // não duplica
    expect(await tool("registrar_melhoria", { titulo: "Teste de melhoria", descricao: "problema, proposta e aceite", prioridade: "baixa" })).toContain("Melhoria registrada");
    expect((await user.from("melhorias").select("titulo, status").eq("workspace_id", ws)).data).toEqual([{ titulo: "Teste de melhoria", status: "nova" }]);
    // perfil novo criado pelo Claude: workspace do mesmo dono, isolado, com pilares e rotina; casos reais no perfil certo
    const novo = await tool("criar_perfil", { perfil: {
      nome: "Clube do Natural", tipo: "empresa", posicionamento: "Natural sem complicar.", voz: ["simples"], assinatura: "Clube do Natural",
      dores: ["não sabe o que é natural"], ctas: ["Me chama no direct."], pilares: [{ nome: "Educação", meta: 70 }, { nome: "Histórias", meta: 30 }],
    } });
    const newId = /id ([0-9a-f-]{36})/.exec(novo)![1]!;
    expect((await user.from("workspace_members").select("role").eq("workspace_id", newId)).data).toEqual([{ role: "owner" }]);
    expect((await user.from("content_pillars").select("slug").eq("workspace_id", newId).order("slug")).data).toEqual([{ slug: "educacao" }, { slug: "historias" }]);
    expect((await user.from("routine_blocks").select("id").eq("workspace_id", newId)).data!.length).toBeGreaterThan(0);
    expect(await tool("listar_perfis", {})).toContain(`id ${newId} · Clube do Natural · empresa`);
    expect(await tool("cadastrar_caso_real", { profile_id: newId, cliente_segmento: "mercearia", problema: "cliente não confia", resultado: "voltou a comprar", autorizacao: "dona autorizou" })).toContain("liberado");
    expect((await user.from("casos_reais").select("cliente_segmento").eq("workspace_id", newId)).data).toEqual([{ cliente_segmento: "mercearia" }]);
    expect((await user.from("casos_reais").select("id").eq("workspace_id", ws)).data).toEqual([]);
    expect(await tool("atualizar_perfil", { profile_id: newId, campos: { metas: "100 leads" } })).toContain("Perfil atualizado");
    const tone = (await user.from("creator_profiles").select("tone").eq("workspace_id", newId).single()).data!.tone as { kind: string; extras: { goals: string } };
    expect(tone).toMatchObject({ kind: "empresa", extras: { goals: "100 leads" } });

    const box = await user.from("assistant_drafts").select("draft, consumed_at").eq("content_item_id", contentId);
    expect(box.data).toHaveLength(1);
    expect(box.data![0]!.draft.title).toBe(draft.title);

    // o banco nunca guarda o token, só o hash; outro usuário não vê os links
    const rows = await admin.from("mcp_tokens").select("token_hash").eq("workspace_id", ws);
    expect(rows.data![0]!.token_hash).not.toBe(tok.data);

    await user.rpc("revoke_mcp_tokens", { p_workspace: ws });
    expect((await rpc("tools/list")).status).toBe(404);
    expect((await fetch(`${url}/functions/v1/mcp/${"0".repeat(64)}`, { method: "POST", body: "{}" })).status).toBe(404);
  }, 60_000);
});
