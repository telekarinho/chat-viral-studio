# Post.ai mobile

React Native + TypeScript (strict) · Expo SDK 54 **Development Build** (não Expo Go) · Expo Router.

## O que faz (MVP beta)
- **Hoje**: "o que eu tenho que gravar agora?", progresso do dia, missões da rotina com FEITO / PULAR / NÃO ACONTECEU / REMARCAR / USAR OUTRA CENA.
- **Roteiro**: Pensamento do Dia e Vídeo principal com 3 ganchos, E → MAS → POR ISSO, versões curtas, CTA, cenas/B-roll, legenda por plataforma (Instagram, TikTok, Facebook, YouTube Shorts). Fechamento fixo do perfil (`E se der certo!`) e assinatura (`RodrigoSerra.me`).
- **Memória / anti-repetição**: antes de gerar, compara assunto, frase, metáfora, gancho, CTA e estrutura com o histórico do workspace e troca de ângulo.
- **IA**: API própria (OpenAI no servidor) → se indisponível, gerador offline. Alternativa sem custo: **"Gerar com meu ChatGPT/Claude"** (copiar pedido → colar resposta; validado pelo mesmo contrato).
- **Gravar**: VisionCamera 9:16, frontal/traseira, 1080p / 2K / 4K conforme o aparelho, fps suportado, contagem regressiva, teleprompter (fonte, velocidade, pausa, reiniciar, espelhar, avanço manual).
- **Local-first**: o vídeo é movido para `documents/takes/<id>.mp4`, recebe MD5 e só então é registrado no SQLite. Upload depois, com fila idempotente, retomada após matar o app e verificação de integridade remota (tamanho + MD5).
- **Projetos**: banco de takes (categoria, tags, favorito, status de sincronização) e histórico de roteiros.
- **Resultados**: constância dos últimos 14 dias e pilares gravados vs. meta.
- Lembretes locais por missão, exportação/exclusão de dados (LGPD), Sentry opcional.

## Modos
| Build sem `EXPO_PUBLIC_SUPABASE_*` | **Modo local**: sem login, tudo no aparelho, sem sincronização. |
|---|---|
| Build com Supabase | Login por e-mail/senha, workspace com RLS, sincronização de dados e vídeos. |
| Com `EXPO_PUBLIC_API_URL` | Roteiros pela OpenAI (via API). Sem ela: gerador offline. |

## Rodar
```bash
npm ci                         # na raiz do monorepo
cd apps/mobile
npx expo prebuild -p android
npx expo run:android           # precisa Android SDK + aparelho/emulador
```

## Testes
```bash
npm test          # jest-expo: Hoje, ações de tarefa, teleprompter
npm run typecheck
npm run lint
```
E2E Android (emulador + Maestro) roda no workflow `Post.ai Android APK` — ver `e2e/`.

## Por que Expo SDK 54 + VisionCamera 4.7
Combinação estável e amplamente usada (RN 0.81, nova arquitetura). VisionCamera 5 (Nitro) ainda é recente demais para o beta; migrar depois do M3.
