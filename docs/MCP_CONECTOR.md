# Conector MCP — o assistente de IA do criador trabalhando no Post.ai

O criador usa a assinatura que já tem (Claude; ChatGPT só Business/Enterprise/Edu) como estrategista e roteirista.
Sem custo de API para o Post.ai.

## Como conectar (criador)
1. App → Configurações → **Meu assistente de IA (Claude)** → CONECTAR MEU CLAUDE → COPIAR LINK.
2. Claude → Configurações → Conectores → **Adicionar conector personalizado** → colar o link.
3. Na conversa: “Faz o roteiro do Pensamento do Dia de hoje no Post.ai” ou “Qual o melhor horário para eu postar?”.
4. Abrir o conteúdo no app: o roteiro chega sozinho (“✨ Chegou o roteiro escrito pelo seu assistente”).

Um link por perfil (pessoal, empresa…). Criar outro desliga o anterior; DESLIGAR CONECTOR corta na hora.

## Ferramentas (`apps/api/src/mcp.ts`)
| Ferramenta | O que faz |
|---|---|
| `perfil_e_estrategia` | voz, posicionamento, fechamento, temas com meta, rotina; empresa: produto, dores, objeções, provas, chamadas |
| `desempenho_dos_posts` | posts com dia/hora/rede em que foram postados (anotado sozinho ao tocar em POSTAR) e números de “Como foi este post?” |
| `conteudos_do_dia` | o que está planejado na data (horário de Brasília) |
| `instrucoes_do_roteiro` | o mesmo pedido da IA do app (formatos que viralizam, coerência, JSON) |
| `salvar_roteiro` | valida (contrato, preço, alegação sem prova, repetição) e põe na caixa `assistant_drafts` |

As instruções do servidor pedem ao assistente para pesquisar tendências com a busca dele e basear horário/sequência nos dados.

## Segurança
- Link = `https://<projeto>.supabase.co/functions/v1/mcp/<token>`; o banco guarda só o sha-256 (`mcp_tokens`).
- O link só alcança o workspace dele; quem vira “viewer” ou sai do workspace perde o acesso.
- O app valida de novo tudo que chega de `assistant_drafts` antes de usar.
- Função `mcp` publicada com **Verify JWT desligado** (`supabase/config.toml`) — a autenticação é o token.
- Limite conhecido: quem tiver o link escreve roteiros naquele perfil (não publica nada, não apaga nada).

## Implantação
Migration `202610010001_assistant_mcp.sql`; função gerada por `npm run build:mcp -w @postai/api` → `supabase/functions/mcp/index.ts`.
Teste de ponta a ponta: `apps/api/test/mcp.integration.test.ts` (CI).
