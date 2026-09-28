/**
 * Real Supabase (Auth + PostgREST + Storage) cross-tenant test.
 * Runs in CI against `supabase start`; skipped when SUPABASE_* env is absent.
 */
import { randomUUID, createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RODRIGO_PILLARS, RODRIGO_PROFILE, rodrigoRoutine } from "@postai/domain";
import { supabaseMemory, userSupabase } from "../src/adapters";
import { generateContent } from "../src/generation.service";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = url && anon && service ? describe : describe.skip;

async function signUp(email: string): Promise<{ client: SupabaseClient; id: string; token: string }> {
  const admin = createClient(url!, service!, { auth: { persistSession: false } });
  const password = `pw-${randomUUID()}`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  const { data, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { client, id: created.user.id, token: data.session!.access_token };
}

async function bootstrap(c: SupabaseClient): Promise<string> {
  const { data, error } = await c.rpc("bootstrap_workspace", {
    p_name: "RodrigoSerra.me",
    p_profile: RODRIGO_PROFILE,
    p_pillars: RODRIGO_PILLARS,
    p_blocks: rodrigoRoutine(randomUUID),
  });
  if (error) throw error;
  return data as string;
}

run("Auth + RLS cross-tenant (Supabase real)", () => {
  let A: Awaited<ReturnType<typeof signUp>>;
  let B: Awaited<ReturnType<typeof signUp>>;
  let wsA: string;
  let wsB: string;
  const contentId = randomUUID();
  const taskId = randomUUID();
  const mediaId = randomUUID();
  const video = Buffer.from("fake mp4 bytes " + randomUUID());

  beforeAll(async () => {
    A = await signUp(`a-${Date.now()}@test.local`);
    B = await signUp(`b-${Date.now()}@test.local`);
    wsA = await bootstrap(A.client);
    wsB = await bootstrap(B.client);
    const ins = async (table: string, row: Record<string, unknown>) => {
      const { error } = await A.client.from(table).insert(row);
      if (error) throw new Error(`${table}: ${error.message}`);
    };
    await ins("content_items", { id: contentId, workspace_id: wsA, format: "main_video", title: "Roteiro secreto A" });
    await ins("scripts", { workspace_id: wsA, content_item_id: contentId, prompt_version: "v1", model: "local", script: "texto A", draft: { topic: "segredo" } });
    await ins("recording_tasks", { id: taskId, workspace_id: wsA, scheduled_for: new Date().toISOString(), title: "Tarefa A", kind: "main_video" });
    await ins("media_files", { id: mediaId, workspace_id: wsA, class: "original", size_bytes: video.length, checksum: createHash("md5").update(video).digest("hex"), storage_key: `${wsA}/${mediaId}.mp4` });
    await ins("takes", { workspace_id: wsA, media_file_id: mediaId, recording_task_id: taskId });
    const up = await A.client.storage.from("takes").upload(`${wsA}/${mediaId}.mp4`, video, { contentType: "video/mp4", upsert: true });
    if (up.error) throw up.error;
  });

  it("onboarding cria workspace próprio, idempotente, com seed do Rodrigo", async () => {
    expect(await bootstrap(A.client)).toBe(wsA);
    const { data } = await A.client.from("content_pillars").select("slug,target_percent").eq("workspace_id", wsA);
    expect(data!.map((p) => Number(p.target_percent)).reduce((a, b) => a + b, 0)).toBe(100);
    const { data: prof } = await A.client.from("creator_profiles").select("closing_phrase,signature").single();
    expect(prof).toEqual({ closing_phrase: "E se der certo!", signature: "RodrigoSerra.me" });
  });

  it("usuário B não lê dados, roteiros, tarefas nem vídeos de A", async () => {
    for (const table of ["content_items", "scripts", "recording_tasks", "takes", "media_files", "task_events"]) {
      const { data, error } = await B.client.from(table).select("*").eq("workspace_id", wsA);
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const { data: ws } = await B.client.from("workspaces").select("id");
    expect(ws!.map((w) => w.id)).toEqual([wsB]);
    const dl = await B.client.storage.from("takes").download(`${wsA}/${mediaId}.mp4`);
    expect(dl.data).toBeNull();
    const signed = await B.client.storage.from("takes").createSignedUrl(`${wsA}/${mediaId}.mp4`, 60);
    expect(signed.data).toBeNull();
  });

  it("usuário B não escreve no workspace de A", async () => {
    const ins = await B.client.from("recording_tasks").insert({ workspace_id: wsA, scheduled_for: new Date().toISOString(), title: "x", kind: "broll" });
    expect(ins.error).not.toBeNull();
    const upd = await B.client.from("recording_tasks").update({ title: "hacked" }).eq("id", taskId).select();
    expect(upd.data).toEqual([]);
    const up = await B.client.storage.from("takes").upload(`${wsA}/evil.mp4`, Buffer.from("x"), { contentType: "video/mp4" });
    expect(up.error).not.toBeNull();
    const join = await B.client.from("workspace_members").insert({ workspace_id: wsA, user_id: B.id, role: "owner" });
    expect(join.error).not.toBeNull();
    const { data } = await A.client.from("recording_tasks").select("title").eq("id", taskId).single();
    expect(data!.title).toBe("Tarefa A");
  });

  it("A baixa o próprio vídeo íntegro (checksum igual)", async () => {
    const dl = await A.client.storage.from("takes").download(`${wsA}/${mediaId}.mp4`);
    const bytes = Buffer.from(await dl.data!.arrayBuffer());
    expect(createHash("md5").update(bytes).digest("hex")).toBe(createHash("md5").update(video).digest("hex"));
  });

  it("memória da IA de B não enxerga A (gerar para workspace alheio é negado)", async () => {
    const memB = supabaseMemory(userSupabase(url!, anon!, B.token), B.id);
    const llm = { model: "fake", complete: async () => ({}) };
    await expect(generateContent({ workspace_id: wsA, content_item_id: null, format: "thought", pillar_slug: "reflexao", event_text: null }, llm, memB)).rejects.toMatchObject({ status: 403 });
  });

  it("anon não lê nada; exportação LGPD só traz dados próprios", async () => {
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    const { data } = await anonClient.from("content_items").select("*");
    expect(data ?? []).toEqual([]);
    const exp = await B.client.rpc("export_my_data");
    expect(exp.error).toBeNull();
    expect((exp.data as { content_items: unknown[] }).content_items).toEqual([]);
    const del = await B.client.rpc("request_account_deletion");
    expect(del.error).toBeNull();
  });
});
