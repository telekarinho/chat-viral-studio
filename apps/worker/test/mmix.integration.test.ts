/** Gravar patrimônio: MMIX bridge against real Supabase (CI) with a fake MMIX API. Skipped without SUPABASE_* env. */
import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_PILLARS, CONTROLPOT_PROFILE, businessRoutine } from "@postai/domain";
import { forwardOne, syncOrders, type MmixConfig } from "../src/mmix";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function signUp(admin: SupabaseClient, tag: string) {
  const email = `${tag}-${Date.now()}@test.local`;
  const password = `pw-${randomUUID()}`;
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password });
  const { data: ws } = await c.rpc("bootstrap_workspace", {
    p_name: tag, p_profile: { ...CONTROLPOT_PROFILE, tone: { kind: "empresa", business: CONTROLPOT_PROFILE.business } }, p_pillars: BUSINESS_PILLARS, p_blocks: businessRoutine(randomUUID),
  });
  return { c, ws: ws as string, uid: (await c.auth.getUser()).data.user!.id };
}

function fakeMmix() {
  const uploads: { id: string; clipe: string; autor: string; size: number; auth: string | null }[] = [];
  const f = (async (input: string, init?: RequestInit) => {
    const q = new URL(input).searchParams;
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (q.get("acao") === "gravacao_solicitacoes_listar") {
      return json({ ok: true, solicitacoes: [
        { id: 42, codigo: "#GRV-0042", produto_id: 348, produto_nome: "Mixer SD 201 (ControlPot)", titulo: "B-Rolls de milk-shake", objetivo: "textura", prioridade: "ALTA", status: "pendente" },
        { id: 7, codigo: "#GRV-0007", produto_id: 1, produto_nome: "x", titulo: "x", objetivo: "x", prioridade: "BAIXA", status: "aprovada" },
      ] });
    }
    if (q.get("acao") === "gravacao_solicitacao_detalhe") {
      return json({ ok: true, id: 42, clipes: [{ clipe: 1, titulo: "Copo inclinado", duracao_min: 3, duracao_max: 6, enquadramento: "Close", instrucao: "incline o copo", status: "pendente" }], checklist: ["Vertical 9:16"], tentativas_historico: [{ big: true }] });
    }
    if (q.get("acao") === "gravacao_solicitacao_upload") {
      const form = init!.body as FormData;
      const video = form.get("video") as Blob;
      uploads.push({ id: String(form.get("id")), clipe: String(form.get("clipe_num")), autor: String(form.get("autor")), size: video.size, auth: new Headers(init!.headers).get("Authorization") });
      return json({ ok: true, qa_status: "aprovado", asset_id: 900, clipe_num: 1, mensagem: "Clipe #1 aprovado" });
    }
    return json({ ok: false, erro: "acao desconhecida" });
  }) as unknown as typeof fetch;
  return { f, uploads };
}

describe.skipIf(!(url && anon && service))("ponte MMIX — gravar patrimônio", () => {
  it("espelha ordens só no perfil vinculado, envia o take e isola outros usuários", async () => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } });
    const a = await signUp(admin, "mmix-a");
    const b = await signUp(admin, "mmix-b");
    const mmix = fakeMmix();
    const cfg: MmixConfig = { baseUrl: "https://mmix.test/api-fabrica.php", token: "test-token", workspaceId: a.ws, fetch: mmix.f };

    expect(await syncOrders(admin, cfg)).toBe(1); // only the open order
    const mine = await a.c.from("mmix_gravacao_ordens").select("id, status, detalhe");
    expect(mine.data).toHaveLength(1);
    expect(mine.data![0]!.detalhe.tentativas_historico).toBeUndefined();
    expect((await b.c.from("mmix_gravacao_ordens").select("id")).data).toHaveLength(0);
    const forged = await a.c.from("mmix_gravacao_ordens").insert({ workspace_id: a.ws, id: 99, codigo: "x", produto_nome: "x", status: "pendente", detalhe: {} });
    expect(forged.error).not.toBeNull();

    // A's take, synced
    const bytes = Buffer.from("fake-mp4-bytes");
    const mediaId = randomUUID();
    const key = `${a.ws}/${mediaId}.mp4`;
    expect((await a.c.storage.from("takes").upload(key, bytes, { contentType: "video/mp4" })).error).toBeNull();
    await a.c.from("media_files").insert({ id: mediaId, workspace_id: a.ws, class: "original", state: "uploaded_original", storage_key: key, size_bytes: bytes.length,
      checksum: createHash("md5").update(bytes).digest("hex"), remote_verified_at: new Date().toISOString() });
    const take = await a.c.from("takes").insert({ workspace_id: a.ws, media_file_id: mediaId, category: "patrimonio" }).select("id").single();

    // B cannot send A's take nor target A's orders from B's workspace
    expect((await b.c.from("patrimonio_envios").insert({ workspace_id: a.ws, take_id: take.data!.id, ordem_id: 42, clipe_num: 1 })).error).not.toBeNull();
    expect((await b.c.from("patrimonio_envios").insert({ workspace_id: b.ws, take_id: take.data!.id, ordem_id: 42, clipe_num: 1 })).error).not.toBeNull();
    // A cannot fake a result
    expect((await a.c.from("patrimonio_envios").insert({ workspace_id: a.ws, take_id: take.data!.id, ordem_id: 42, clipe_num: 1, status: "aprovado" })).error).not.toBeNull();

    const env = await a.c.from("patrimonio_envios").insert({ workspace_id: a.ws, take_id: take.data!.id, ordem_id: 42, clipe_num: 1 }).select("id").single();
    expect(env.error).toBeNull();
    expect(await forwardOne(admin, cfg)).toBe(true);
    const done = await a.c.from("patrimonio_envios").select("status, resultado").eq("id", env.data!.id).single();
    expect(done.data).toMatchObject({ status: "aprovado", resultado: { asset_id: 900 } });
    expect(mmix.uploads).toEqual([{ id: "42", clipe: "1", autor: `postai:${a.uid}`, size: bytes.length, auth: "Bearer test-token" }]);
    expect(await forwardOne(admin, cfg)).toBe(false); // queue empty
  }, 120_000);
});
