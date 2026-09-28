# Post.ai — Deployment

Legado (Chat Viral Studio web/backend/Flutter): ver `docs/DEPLOY.md`.

## 1. Supabase (Auth + Postgres + Storage)
1. Crie um projeto em supabase.com (região São Paulo).
2. Aplique as migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <REF>
   npx supabase db push          # 202609270001 schema + 202609270002 RLS/RPC/storage
   ```
3. Auth → Providers → Email: habilitado. Para o beta, "Confirm email" pode ficar ligado (o app avisa).
4. Storage: o bucket privado `takes` é criado pela migration. Em plano Free o limite por arquivo é 50 MB;
   vídeos 1080p de 60 s passam disso → **use plano Pro** e ajuste *Storage → Settings → Upload file size limit* (ex.: 500 MB).
5. Anote: `Project URL`, `anon key` (pública) e `service_role key` (secreta, só servidor/CI).

## 2. API (NestJS) — geração de roteiro com OpenAI
Qualquer host de container (Railway, Render, Fly.io, Cloud Run):
```bash
docker build -f apps/api/Dockerfile -t postai-api .
docker run -p 3333:3333 -e SUPABASE_URL=... -e SUPABASE_ANON_KEY=... -e OPENAI_API_KEY=... postai-api
```
Variáveis: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL` (padrão `gpt-4.1-mini`), `RATE_LIMIT_MAX`, `PORT`.
A API usa o JWT do usuário para ler a memória (RLS aplica); **não** usa service role. Health: `GET /health`.
Sem API configurada o app usa o gerador offline e o modo "meu ChatGPT/Claude".

## 3. APK Android
GitHub → Settings → Secrets and variables → Actions → *New repository secret*:

| Secret | Valor |
|---|---|
| `POSTAI_SUPABASE_URL` | Project URL |
| `POSTAI_SUPABASE_ANON_KEY` | anon key |
| `POSTAI_API_URL` | URL pública da API (opcional) |
| `POSTAI_SENTRY_DSN` | DSN Sentry (opcional) |

Depois: Actions → **Post.ai Android APK** → *Run workflow* (marque "Publicar como GitHub Release beta" se quiser Release).
O artifact `post-ai-android-beta` contém `post-ai-beta-v<versão>-<sha>.apk`.
Sem os secrets o APK é gerado em **modo local** (sem login/sincronização).

O APK beta é assinado com a chave de debug (instalação manual). Para Play Store: gerar keystore própria + `eas build` ou `signingConfigs.release`.

## 4. Observabilidade
- Sentry: `POSTAI_SENTRY_DSN` no build (sem DSN, erros ficam em Configurações → Diagnóstico).
- API: logs JSON estruturados em stdout (sem prompts, tokens ou conteúdo do usuário).
- PostHog: previsto no M4, não incluído no beta.

## 5. Privacidade (LGPD)
- Exportação: app → Configurações → Exportar meus dados (local + `export_my_data()` no servidor).
- Exclusão: app → Configurações → Apagar meus dados e conta → cria `privacy_requests(delete_account)` e apaga o local.
  **Pendente de operação**: o worker de exclusão (service role) que apaga `auth.users`, workspace e objetos do Storage — processar manualmente no beta pelo painel do Supabase em até 15 dias.
- Revisão jurídica brasileira necessária antes do lançamento público.
