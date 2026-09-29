/** Estúdio da fábrica + curso against real Supabase (CI). Skipped without SUPABASE_* env. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_PILLARS, CONTROLPOT_PROFILE, businessRoutine, initialCourse } from "@postai/domain";

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
  return { c, ws: ws as string };
}

describe.skipIf(!(url && anon && service))("estúdio da fábrica e curso (Supabase real)", () => {
  it("projeto balde/expresso guarda origem, derivadas são marcadas, aula não é publicada pelo app, catálogo só leitura", async () => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } });
    const a = await signUp(admin, "estudio-a");
    const b = await signUp(admin, "estudio-b");

    // projeto com sorvete de balde e SKU ControlPot; outro com expresso
    const balde = { mode: "comece_balde", sku: "CF-MIXERP-1778541098", skuNome: "Mixer SD 201", fonteSorvete: "balde" };
    const origem = randomUUID();
    expect((await a.c.from("content_items").insert({ id: origem, workspace_id: a.ws, format: "main_video", title: "Comece com balde", structured_payload: { project: balde } })).error).toBeNull();
    const expresso = randomUUID();
    expect((await a.c.from("content_items").insert({ id: expresso, workspace_id: a.ws, format: "main_video", title: "Demonstração", structured_payload: { project: { ...balde, mode: "demonstracao_mixer", fonteSorvete: "expresso" } } })).error).toBeNull();

    // gravação → aula e vídeo curto, mantendo a origem (e uma derivada da derivada)
    const aula = randomUUID();
    const curto = randomUUID();
    const neta = randomUUID();
    for (const [id, from] of [[aula, origem], [curto, origem], [neta, curto]] as const) {
      expect((await a.c.from("content_items").insert({ id, workspace_id: a.ws, format: "main_video", title: "derivada", derived_from: from, structured_payload: { project: balde } })).error).toBeNull();
    }
    // correção na origem marca TODAS as derivadas
    const flagged = await a.c.rpc("flag_derived_for_review", { p_origin: origem, p_motivo: "SKU corrigido" });
    expect(flagged.data).toBe(3);
    const rows = await a.c.from("content_items").select("id, precisa_revisao, derived_from").in("id", [aula, curto, neta]);
    expect(rows.data!.every((r) => r.precisa_revisao === "SKU corrigido")).toBe(true);
    // B não marca nada de A
    expect((await b.c.rpc("flag_derived_for_review", { p_origin: origem, p_motivo: "x" })).data).toBe(0);

    // clipe guarda os metadados (projeto, SKU, fonte, medidas, revisão)
    const mediaId = randomUUID();
    await a.c.from("media_files").insert({ id: mediaId, workspace_id: a.ws, class: "original", size_bytes: 10, checksum: "x" });
    const meta = { ...balde, shot: "preparo", tempoPreparoSeg: 31, medidas: "300 ml de leite (ficha aprovada)", permissoes: { imagemPessoas: true, marcasTerceiros: true } };
    const tk = await a.c.from("takes").insert({ workspace_id: a.ws, content_item_id: origem, media_file_id: mediaId, category: "main_video", meta }).select("meta").single();
    expect(tk.data?.meta).toMatchObject({ sku: balde.sku, fonteSorvete: "balde", tempoPreparoSeg: 31 });

    // curso: estrutura inicial, gravação ligada, aprovação; "publicada" só pela plataforma do curso
    const lessons = initialCourse(randomUUID).map((l) => ({ id: l.id, workspace_id: a.ws, modulo: l.modulo, ordem: l.ordem, titulo: l.titulo, objetivo: l.objetivo, fonte_sorvete: l.fonteSorvete }));
    expect((await a.c.from("course_lessons").insert(lessons)).error).toBeNull();
    const l0 = lessons[0]!.id;
    expect((await a.c.from("course_lessons").update({ content_item_id: aula, status: "aprovada" }).eq("id", l0)).error).toBeNull();
    const pub = await a.c.from("course_lessons").update({ status: "publicada" }).eq("id", l0).select("id");
    expect(pub.error !== null || (pub.data ?? []).length === 0).toBe(true);
    expect((await admin.from("course_lessons").select("status").eq("id", l0).single()).data?.status).toBe("aprovada");
    expect((await b.c.from("course_lessons").select("id")).data).toHaveLength(0);

    // catálogo MMIX: membro lê, ninguém escreve pelo app
    await admin.from("mmix_produtos").insert({ workspace_id: a.ws, id: 348, sku: balde.sku, nome: "Mixer SD 201" });
    expect((await a.c.from("mmix_produtos").select("sku")).data).toEqual([{ sku: balde.sku }]);
    expect((await a.c.from("mmix_produtos").insert({ workspace_id: a.ws, id: 1, sku: "X", nome: "forjado" })).error).not.toBeNull();
    expect((await b.c.from("mmix_produtos").select("sku")).data).toHaveLength(0);
  }, 120_000);
});
