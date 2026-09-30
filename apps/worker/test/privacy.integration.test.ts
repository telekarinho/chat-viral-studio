/** LGPD: pedido de exclusão apaga arquivos, workspace e conta (Supabase real no CI). Pula sem SUPABASE_*. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { RODRIGO_PILLARS, RODRIGO_PROFILE, rodrigoRoutine } from "@postai/domain";
import { processDeletionRequest } from "../src/privacy";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!(url && anon && service))("exclusão de conta (LGPD)", () => {
  it("apaga vídeos (inclusive finais), dados e a conta; não mexe em outra pessoa", async () => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } });
    async function newUser() {
      const email = `lgpd-${randomUUID()}@test.local`;
      const password = `pw-${randomUUID()}`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      const client = createClient(url!, anon!, { auth: { persistSession: false } });
      await client.auth.signInWithPassword({ email, password });
      const { data: ws } = await client.rpc("bootstrap_workspace", { p_name: "L", p_profile: RODRIGO_PROFILE, p_pillars: RODRIGO_PILLARS, p_blocks: rodrigoRoutine(randomUUID) });
      return { id: created.data.user!.id, client, ws: ws as string };
    }
    const quem = await newUser();
    const outro = await newUser();
    const bytes = new Uint8Array([1, 2, 3]);
    for (const key of [`${quem.ws}/a.mp4`, `${quem.ws}/finals/f.mp4`, `${outro.ws}/b.mp4`]) {
      const up = await admin.storage.from("takes").upload(key, bytes, { contentType: "video/mp4" });
      expect(up.error).toBeNull();
    }

    const req = await quem.client.rpc("request_account_deletion");
    expect(req.error).toBeNull();
    // só o pedido desta pessoa (outros testes podem ter deixado pedidos na fila)
    while (await processDeletionRequest(admin)) {
      const pending = await admin.from("privacy_requests").select("id").eq("user_id", quem.id);
      if (!pending.data?.length) break;
    }

    expect((await admin.auth.admin.getUserById(quem.id)).data.user).toBeNull();
    expect((await admin.from("workspaces").select("id").eq("id", quem.ws)).data).toEqual([]);
    expect((await admin.from("creator_profiles").select("id").eq("workspace_id", quem.ws)).data).toEqual([]);
    expect((await admin.storage.from("takes").list(quem.ws)).data ?? []).toEqual([]);
    expect((await admin.storage.from("takes").list(`${quem.ws}/finals`)).data ?? []).toEqual([]);
    // a outra pessoa continua intacta
    expect((await admin.auth.admin.getUserById(outro.id)).data.user?.id).toBe(outro.id);
    expect((await admin.storage.from("takes").list(outro.ws)).data?.map((o) => o.name)).toEqual(["b.mp4"]);
  }, 60_000);
});
