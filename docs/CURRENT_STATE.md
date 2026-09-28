# Post.ai — estado atual (2026-09-28)

**Status: BLOQUEADO PARA HOMOLOGAÇÃO (dependências externas).** Código, CI, RLS, APK e E2E Android em emulador estão verdes em `main` (`7e5d876`). Relatório completo: comentário "Relatório de homologação" no PR #53 e [HOMOLOGACAO.md](HOMOLOGACAO.md).

## Pronto e verificado
- Loop diário completo no app (Hoje → roteiro → teleprompter → gravar → salvar local → concluir → legenda → próximo).
- Gravação por partes + plano de edição + montagem final FFmpeg (worker).
- Offline: gravar sem rede, matar app, reabrir, reconectar, MD5 remoto = local (E2E).
- RLS por workspace testado contra Supabase real (local) e em SQL.

## Falta (externo)
1. Projeto Supabase de produção + secrets `POSTAI_SUPABASE_URL` / `POSTAI_SUPABASE_ANON_KEY` → sem isso o APK roda em **modo local** (sem login/sync).
2. `OPENAI_API_KEY` + deploy `apps/api` + secret `POSTAI_API_URL` → sem isso: gerador offline / modo "meu ChatGPT/Claude".
3. Deploy `apps/worker` (service role) → sem isso a montagem final fica na fila.
4. Smoke test no celular do Rodrigo (roteiro de 10 min).

## Próximos passos técnicos
- M3: legenda Manuscrito com fonte final validada, corte de silêncio/retake por transcrição, embelezamento leve opcional.
- Worker de exclusão LGPD (processar `privacy_requests`).
- PostHog (M4). Convite de membros com consentimento.
- UX: mostrar nome do pilar (hoje mostra o slug) nos cards de Hoje.
