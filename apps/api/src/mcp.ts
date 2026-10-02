import { MCP_TOOLS, callTool, text, type McpContext } from "./mcp-tools";

/**
 * Conector MCP do Post.ai: o criador usa a assinatura dele (Claude, ChatGPT Business…) como diretor de gravações;
 * o assistente chama as ferramentas (mcp-tools.ts) e o roteiro chega no app validado pelo mesmo contrato.
 * Transporte: MCP Streamable HTTP, só respostas JSON (sem stream), sem sessão.
 */
export * from "./mcp-tools";

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
const SERVER_INFO = { name: "postai", title: "Post.ai", version: "2.0.0" };
const INSTRUCTIONS = [
  "Você é o DIRETOR DE GRAVAÇÕES do criador no Post.ai (vídeos curtos; vários perfis — pessoal e empresas).",
  "Critério de sucesso: resultado medido (retenção, envios, salvamentos, seguidores; nos comerciais, leads e vendas). Nunca prometa viralização.",
  "Sempre comece por listar_perfis e use profile_id do perfil certo; nunca misture dados entre perfis.",
  "Antes de decidir: perfil_e_estrategia e desempenho_dos_posts; se tiver busca na web, pesquise o que está em alta no nicho agora.",
  "Planejar: criar_plano (até 14 dias) → para cada conteúdo, ler_roteiro (se já tiver) → instrucoes_do_roteiro (siga À RISCA voz, temas abaixo da meta, assuntos bloqueados e o JSON) → salvar_roteiro. Se voltar erro, corrija o apontado e salve de novo.",
  "Horário e sequência: baseie-se nos horários dos posts com mais visualizações e envios; diga quando há poucos dados.",
  "Toda recomendação de mudança no app ou no conector vai por registrar_melhoria (com critério de aceite).",
  "Nunca invente números, preço, prazo ou prova; não exponha dados de crianças; fechamento do perfil pessoal é exatamente o configurado. Responda em português do Brasil, simples.",
].join("\n");

type Json = Record<string, unknown>;
interface RpcRequest { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Json }

/** Uma mensagem JSON-RPC → resposta (null para notificação). Erros de ferramenta voltam como resultado, não como erro de protocolo. */
export async function handleMcp(msg: unknown, ctx: McpContext, now = new Date()): Promise<Json | null> {
  const req = msg as RpcRequest;
  if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
  if (req.id === undefined) return null; // notificação (ex.: notifications/initialized)
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: req.id, result });
  switch (req.method) {
    case "initialize": {
      const asked = String(req.params?.protocolVersion ?? "");
      const protocolVersion = (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0];
      return ok({ protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: MCP_TOOLS });
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Json;
      try {
        return ok(await callTool(ctx, name, args, now));
      } catch (e) {
        return ok(text(`Não consegui falar com o Post.ai agora (${e instanceof Error ? e.message : "erro"}). Tente de novo em instantes.`, true));
      }
    }
    default:
      return { jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } };
  }
}
