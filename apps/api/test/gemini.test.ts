import { describe, expect, it } from "vitest";
import { geminiClient } from "../src/adapters";

type Call = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function fakeFetch(responses: { status: number; json: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> });
    const r = responses.shift()!;
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const ok = (obj: unknown) => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } });

describe("Gemini (Google AI)", () => {
  it("envia system + user + JSON schema com a chave só no header e devolve o objeto", async () => {
    const { impl, calls } = fakeFetch([ok({ a: 1 })]);
    const out = await geminiClient("KEY", "gemini-flash-latest", impl).complete({ system: "S", user: "U", schema: { type: "object" } });
    expect(out).toEqual({ a: 1 });
    expect(calls[0]!.url).toContain("models/gemini-flash-latest:generateContent");
    expect(calls[0]!.url).not.toContain("KEY");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("KEY");
    expect(calls[0]!.body.generationConfig).toMatchObject({ responseMimeType: "application/json", responseJsonSchema: { type: "object" } });
  });
  it("se o schema for rejeitado (400), tenta de novo só com JSON", async () => {
    const { impl, calls } = fakeFetch([{ status: 400, json: { error: { message: "bad schema" } } }, ok({ b: 2 })]);
    expect(await geminiClient("K", "m", impl).complete({ system: "", user: "", schema: {} })).toEqual({ b: 2 });
    expect((calls[1]!.body.generationConfig as Record<string, unknown>).responseJsonSchema).toBeUndefined();
  });
  it("erro de cota vira exceção (app cai para o gerador offline)", async () => {
    const { impl } = fakeFetch([{ status: 429, json: { error: { message: "quota" } } }]);
    await expect(geminiClient("K", "m", impl).complete({ system: "", user: "", schema: {} })).rejects.toThrow(/429/);
  });
});
