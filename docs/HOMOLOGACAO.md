# Post.ai — Beta Android: instalação, teste e homologação

Status: **BLOQUEADO PARA HOMOLOGAÇÃO** (dependências externas) — relatório completo:
https://github.com/telekarinho/chat-viral-studio/pull/53#issuecomment-5866226914

APK atual (com login e nuvem): https://github.com/telekarinho/chat-viral-studio/releases/tag/postai-beta-f4a9bf1 (`post-ai-beta-v0.2.0-f4a9bf1.apk`).

## Instalar o APK (Rodrigo)
1. No celular Android, abra o link do GitHub Actions → run **Post.ai Android APK** → seção *Artifacts* → baixe `post-ai-android-beta`
   (ou a *Release* `postai-beta-<sha>`, quando publicada).
2. O download vem em `.zip`: abra e toque no arquivo `post-ai-beta-v0.2.0-<sha>.apk`.
3. O Android vai pedir "Permitir instalar apps desta fonte" → permita para o navegador/arquivos.
4. Instale e abra o **Post.ai**. Permita **câmera**, **microfone** e **notificações**.
5. Se já tiver uma versão instalada com a mesma assinatura, ela é atualizada mantendo seus vídeos.

> O APK beta é assinado com chave de desenvolvimento (instalação manual). Não é da Play Store.

## Roteiro de teste de ~10 minutos no seu celular
| Min | O que fazer | O que deve acontecer |
|---|---|---|
| 0–1 | Abrir o app, entrar (ou "modo local" se o APK não tiver nuvem) | Onboarding já preenchido com RodrigoSerra.me, 40/20/15/10/10/5, "E se der certo!" |
| 1–2 | Toque em **COMEÇAR MEU DIA** | Tela **Hoje** com "AGORA", progresso e missões (seg–sex) |
| 2–3 | **GERAR ROTEIRO** do Vídeo principal | 3 ganchos, E / MAS / POR ISSO, roteiro terminando em "E se der certo!" |
| 3 | Legenda → TikTok → **COPIAR** | Legenda com RodrigoSerra.me e hashtags copiada |
| 3–4 | **GERAR** o Pensamento do Dia | Assunto diferente do vídeo principal (anti-repetição) |
| 4–6 | Roteiro do vídeo → **GRAVAR POR PARTES** | Teleprompter mostra só a Parte 1 (gancho). Grave, pare → "Parte 1 salva ✓" → **GRAVAR PARTE 2** mostra o próximo trecho |
| 6 | Na gravação: A+/A−, 🐢/🐇, ⇋ espelho, ❚❚ pausa, ↺ reiniciar, ▲▼ avançar | Tudo responde; 2K/4K só aparecem se o aparelho suporta |
| 6–7 | **Modo avião**, grave um take de uma missão, toque **ANEXAR E MARCAR FEITO** | "Salvo no aparelho ✓"; missão vira FEITO; badge "Offline" |
| 7–8 | Feche o app pelo multitarefa, abra de novo | Take continua em Projetos ("NA FILA PARA ENVIAR") |
| 8–9 | Desligue o modo avião | Em até ~1 min: "SINCRONIZADO"; no take: "Integridade na nuvem confirmada" |
| 9 | Numa missão: **REMARCAR +1h**, outra **USAR OUTRA CENA**, outra **PULAR** | Lista atualiza sem culpa; progresso recalcula |
| 9–10 | Com todas as partes gravadas: **MONTAR VÍDEO FINAL** (precisa do worker) → **BAIXAR** → **COMPARTILHAR** | Vídeo 9:16 com zoom por trecho, legenda manuscrita e assinatura |

Anote qualquer coisa estranha em Plano → Configurações → Diagnóstico (mostra os erros recentes) e mande um print.

## Configurações externas (preencher antes do uso diário com nuvem)
| O quê | Onde | Quem |
|---|---|---|
| Projeto Supabase + `npx supabase db push` | supabase.com | Rodrigo/dev |
| Secrets `POSTAI_SUPABASE_URL`, `POSTAI_SUPABASE_ANON_KEY` | GitHub → Settings → Secrets → Actions | Rodrigo |
| Storage: limite por arquivo ≥ 500 MB (plano Pro) | Supabase → Storage → Settings | Rodrigo |
| API (OpenAI): `OPENAI_API_KEY` + deploy `apps/api` → secret `POSTAI_API_URL` | host de container | Rodrigo/dev |
| Worker de montagem: deploy `apps/worker` com `SUPABASE_SERVICE_ROLE_KEY` | host de container | Rodrigo/dev |
| Sentry DSN → secret `POSTAI_SENTRY_DSN` (opcional) | sentry.io | Rodrigo |
| Rodar de novo: Actions → Post.ai Android APK → Run workflow (marcar Release) | GitHub | Rodrigo |

Detalhes em [DEPLOYMENT.md](DEPLOYMENT.md).
