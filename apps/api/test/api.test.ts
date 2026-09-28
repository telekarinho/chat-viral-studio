import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { RODRIGO_PROFILE, fingerprintsFor, generateLocal, type ContentDraft, type Fingerprint } from "@postai/domain";
import { createApp } from "../src/app";
import { generateContent, LlmUnavailableError, type LlmClient, type MemoryStore } from "../src/generation.service";

const WS = "11111111-1111-4111-8111-111111111111";
const sample = (pillarSlug: string, recent: Fingerprint[] = []) =>
  generateLocal({ profile: RODRIGO_PROFILE, pillarSlug, pillarName: pillarSlug, format: "main_video", eventText: null, recent }).draft;

function fakeMemory(recent: Fingerprint[] = []) {
  const runs: { accepted: boolean; rejectionReason: string | null }[] = [];
  const mem: MemoryStore = {
    canWrite: async () => true,
    profile: async () => RODRIGO_PROFILE,
    pillarName: async (_ws, slug) => slug,
    recentFingerprints: async () => recent,
    recentSummaries: async () => [],
    saveRun: async (r) => void runs.push(r),
  };
  return { mem, runs };
}

function scriptedLlm(outputs: unknown[]): LlmClient & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    model: "fake-model",
    prompts,
    async complete({ user }) {
      prompts.push(user);
      const next = outputs.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const body = { workspace_id: WS, content_item_id: null, format: "main_video", pillar_slug: "reflexao", event_text: null };

describe("generateContent (IA estruturada)", () => {
  it("aceita saída válida, aplica fechamento/assinatura e registra run", async () => {
    const { mem, runs } = fakeMemory();
    const draft = { ...sample("reflexao"), script: "Roteiro da IA" };
    const res = await generateContent(body as never, scriptedLlm([draft]), mem);
    expect(res.draft.script).toBe("Roteiro da IA\n\nE se der certo!");
    expect(res.meta).toMatchObject({ source: "openai", model: "fake-model", attempts: 1 });
    expect(res.fingerprints.length).toBeGreaterThan(4);
    expect(runs).toEqual([expect.objectContaining({ accepted: true })]);
  });

  it("rejeita JSON fora do schema e tenta de novo", async () => {
    const { mem, runs } = fakeMemory();
    const res = await generateContent(body as never, scriptedLlm([{ title: "incompleto" }, sample("humor")]), mem);
    expect(res.meta.attempts).toBe(2);
    expect(runs[0]).toMatchObject({ accepted: false });
    expect(runs[0]!.rejectionReason).toMatch(/^schema/);
  });

  it("anti-repetição: rascunho repetido é rejeitado e o prompt pede outro ângulo", async () => {
    const used = sample("reflexao");
    const recent = fingerprintsFor(used).map((f) => ({ ...f, contentItemId: "old" }));
    const { mem, runs } = fakeMemory(recent);
    const llm = scriptedLlm([used, sample("academia")]);
    const res = await generateContent(body as never, llm, mem);
    expect(runs.map((r) => r.rejectionReason)).toEqual(["repetition", null]);
    expect(llm.prompts[1]).toMatch(/OUTRO ângulo/);
    expect(res.notices.join(" ")).toMatch(/Evitei repetir/);
    expect(res.draft.topic).not.toBe(used.topic);
  });

  it("quem não pode escrever no workspace não dispara geração", async () => {
    const { mem } = fakeMemory();
    const llm = scriptedLlm([sample("humor")]);
    await expect(generateContent(body as never, llm, { ...mem, canWrite: async () => false })).rejects.toMatchObject({ status: 403 });
    expect(llm.prompts).toHaveLength(0);
  });

  it("LLM fora do ar vira erro tratável (app cai para o gerador offline)", async () => {
    await expect(generateContent(body as never, scriptedLlm([new Error("timeout")]), fakeMemory().mem)).rejects.toBeInstanceOf(LlmUnavailableError);
  });
});

describe("HTTP", () => {
  let app: INestApplication;
  let llmOutputs: unknown[];
  beforeAll(async () => {
    llmOutputs = [];
    app = await createApp({
      verifyToken: async (t) => (t === "good" ? { id: "user-1", accessToken: t } : null),
      memoryFor: () => fakeMemory().mem,
      llm: { model: "fake", complete: async () => llmOutputs.shift() },
      rateLimit: { max: 3, windowMs: 60_000 },
    });
    await app.init();
  });
  afterAll(() => app.close());

  it("health não expõe segredo", async () => {
    const r = await request(app.getHttpServer()).get("/health").expect(200);
    expect(r.body).toEqual({ ok: true, llm: "fake" });
  });
  it("401 sem token ou token inválido", async () => {
    await request(app.getHttpServer()).post("/v1/content/generate").send(body).expect(401);
    await request(app.getHttpServer()).post("/v1/content/generate").set("Authorization", "Bearer bad").send(body).expect(401);
  });
  it("400 para corpo inválido", async () => {
    await request(app.getHttpServer()).post("/v1/content/generate").set("Authorization", "Bearer good").send({ workspace_id: "x" }).expect(400);
  });
  it("200 com rascunho validado e 429 no limite", async () => {
    llmOutputs.push(sample("familia"));
    const r = await request(app.getHttpServer()).post("/v1/content/generate").set("Authorization", "Bearer good").send(body).expect(201);
    expect((r.body.draft as ContentDraft).hook_options).toHaveLength(3);
    llmOutputs.push(sample("humor"), sample("humor"));
    await request(app.getHttpServer()).post("/v1/content/generate").set("Authorization", "Bearer good").send(body);
    await request(app.getHttpServer()).post("/v1/content/generate").set("Authorization", "Bearer good").send(body);
    await request(app.getHttpServer()).post("/v1/content/generate").set("Authorization", "Bearer good").send(body).expect(429);
  });
});
