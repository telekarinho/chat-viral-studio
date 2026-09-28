/** Render queue end-to-end against real Supabase (CI). Skipped without SUPABASE_* env or ffmpeg. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { RODRIGO_PILLARS, RODRIGO_PROFILE, buildSegments, generateLocal, rodrigoRoutine } from "@postai/domain";
import { runOnce } from "../src/job";
import { probe } from "../src/ffmpeg";

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FONT = [process.env.FONT_FILE, "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => f && existsSync(f));
const ready = url && anon && service && FONT;

describe.skipIf(!ready)("fila de montagem final (Supabase + FFmpeg reais)", () => {
  it("monta o vídeo final a partir das partes sincronizadas e entrega para o criador", async () => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } });
    const email = `render-${Date.now()}@test.local`;
    const password = `pw-${randomUUID()}`;
    await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const user = createClient(url!, anon!, { auth: { persistSession: false } });
    await user.auth.signInWithPassword({ email, password });
    const { data: ws } = await user.rpc("bootstrap_workspace", { p_name: "R", p_profile: RODRIGO_PROFILE, p_pillars: RODRIGO_PILLARS, p_blocks: rodrigoRoutine(randomUUID) });

    const draft = generateLocal({ profile: RODRIGO_PROFILE, pillarSlug: "familia", pillarName: "Família", format: "main_video", eventText: null, recent: [] }).draft;
    const contentId = randomUUID();
    await user.from("content_items").insert({ id: contentId, workspace_id: ws, format: "main_video", title: draft.title, structured_payload: { selected_hook: 0 } });
    await user.from("scripts").insert({ workspace_id: ws, content_item_id: contentId, prompt_version: "v1", model: "local", script: draft.script, draft });
    const segments = buildSegments(draft, { selectedHook: 0, userEdited: false, closingPhrase: RODRIGO_PROFILE.closingPhrase });

    const dir = mkdtempSync(join(tmpdir(), "postai-worker-"));
    for (const seg of segments) {
      const f = join(dir, `p${seg.index}.mp4`);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=30:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", f]);
      const bytes = readFileSync(f);
      const mediaId = randomUUID();
      const key = `${ws}/${mediaId}.mp4`;
      const up = await user.storage.from("takes").upload(key, bytes, { contentType: "video/mp4" });
      expect(up.error).toBeNull();
      await user.from("media_files").insert({ id: mediaId, workspace_id: ws, class: "original", state: "uploaded_original", storage_key: key, size_bytes: bytes.length,
        checksum: createHash("md5").update(bytes).digest("hex"), duration_ms: (await probe(f)).durationMs, remote_verified_at: new Date().toISOString() });
      const tk = await user.from("takes").insert({ workspace_id: ws, content_item_id: contentId, media_file_id: mediaId, segment_index: seg.index, category: "main_video" });
      expect(tk.error).toBeNull();
    }
    // a malicious device plan is ignored: the worker rebuilds the plan from server data
    const job = await user.from("render_jobs").insert({ workspace_id: ws, content_item_id: contentId, plan: { evil: "'; rm -rf /" } }).select().single();
    expect(job.error).toBeNull();

    expect(await runOnce(admin, FONT!)).toBe(true);
    const done = await user.from("render_jobs").select("status, output_key, error").eq("id", job.data!.id).single();
    expect(done.data).toMatchObject({ status: "done", error: null });

    const dl = await user.storage.from("takes").download(done.data!.output_key!);
    const out = join(dir, "final.mp4");
    writeFileSync(out, Buffer.from(await dl.data!.arrayBuffer()));
    const p = await probe(out);
    expect(p).toMatchObject({ width: 1080, height: 1920, hasAudio: true });
    expect(p.durationMs).toBeGreaterThan(segments.length * 1000);
    expect(await runOnce(admin, FONT!)).toBe(false); // queue empty
  }, 240_000);
});
