# Changelog — Post.ai

## 0.2.0-beta — 2026-09-28
Primeiro beta Android do loop diário (issues #49–#52).

### Adicionado
- `packages/domain`: pilares e balanceamento por meta, ciclo de missões (FEITO / PULAR / NÃO ACONTECEU / REMARCAR / USAR OUTRA CENA),
  planejamento do dia a partir da rotina, contrato de IA v1 (Zod + JSON Schema strict), prompt `content-v1.0.0`, gerador offline,
  modo "meu ChatGPT/Claude" (copiar/colar), anti-repetição (assunto, frase, metáfora, gancho, CTA, estrutura), máquina de estados
  de sincronização de mídia, teleprompter, seleção 1080p/2K/4K por capacidade.
- `apps/mobile` (Expo SDK 54): telas Hoje, Plano, Gravar, Projetos, Resultados, roteiro, gravação com VisionCamera + teleprompter,
  take, "aconteceu algo hoje", configurações/LGPD; SQLite local-first, outbox, upload com verificação MD5, lembretes locais.
- `apps/api` (NestJS): `POST /v1/content/generate` com OpenAI Structured Outputs, memória por workspace via JWT/RLS, retry anti-repetição,
  rate limit, logs estruturados; Dockerfile.
- Supabase: schema v1 finalizado, membership, RLS real por workspace, políticas de Storage, RPCs `bootstrap_workspace`,
  `export_my_data`, `request_account_deletion`, auditoria, soma de pilares = 100%, original imutável após verificação.
- CI: lint, typecheck, testes, RLS SQL + integração Auth/Storage no Supabase local, APK beta como artifact, E2E Android com Maestro
  (offline → gravar → matar app → reabrir → reconectar → integridade remota), Release beta opcional.

### Adicionado a pedido do Rodrigo durante o beta
- **Gravação por partes**: teleprompter mostra só o trecho da vez (gancho → E → MAS → POR ISSO → CTA → fechamento), avança sozinho, permite regravar uma parte.
- **Plano de edição automático** (`edit-v1`): efeito por trecho (punch-in, zoom lento, zoom-out na virada, aproximação, zoom-out final), legendas "Manuscrito" de até 22 caracteres, apara o toque do botão.
- **Montagem final** (`apps/worker`, FFmpeg): junta as partes, aplica os efeitos, legendas, assinatura e loudnorm; app baixa e compartilha o vídeo pronto para postar.
- Gravação em **2K** (e 4K) quando o aparelho suporta; modo **"meu ChatGPT/Claude"** sem custo de API.

### Fora do MVP (documentado)
Editor manual tipo CapCut, embelezamento, corte automático de silêncio/retake por transcrição (docs/CAPTION_STYLES.md, M3), publicação automática,
analytics avançado, billing, equipes, PostHog.
