# 🎬 Chat Viral Studio

Gerador de vídeos verticais virais de histórias fictícias em formato de conversa
estilo mensageiro (Chat Verde). Crie roteiros com IA (Google Gemini), narre com
TTS ou com a sua própria voz, anime o chat e exporte MP4 vertical pronto para
TikTok, Reels e Shorts.

> **⚖️ Todas as histórias são tratadas como ficção/dramatização.** O vídeo recebe
> por padrão o selo **"História fictícia para entretenimento"**.

---

## ✨ O que já funciona (MVP — neste repositório)

| Recurso | Status | Onde |
|---|---|---|
| Gerar história viral com IA (Gemini → JSON estruturado) | ✅ | `backend` + `web/src/app/create` |
| Colar texto do usuário → transformar em chat | ✅ | `web/src/app/create` (aba *Colar texto*) |
| Editor de chat (nomes, fotos, temas, bolhas, velocidade, "digitando…") | ✅ | `web/src/app/editor` |
| 4 temas inspirados em mensageiros (Verde, Escuro, Business, Minimalista) | ✅ | `web/src/lib/themes.ts` |
| Preview animado em tempo real (Canvas) | ✅ | `web/src/components/ChatStage.tsx` |
| Narração TTS por IA (Google Cloud TTS) + painel de vozes | ✅ | `backend/src/routes/tts.js` |
| **Modo Eu Narrando** (teleprompter + gravação tela/voz/câmera) | ✅ | `web/src/app/record` |
| Exportar MP4 vertical 1080×1920 / 720×1280 (MediaRecorder + FFmpeg) | ✅ | `web/src/lib/exporter.ts` + `backend/src/routes/render.js` |
| Selo de ficção + marca d'água | ✅ | `ChatStage` overlay |
| Legendas automáticas estilo TikTok | ✅ | `ChatStage` |
| Biblioteca de projetos (SQLite + autosave) | ✅ | `backend/src/routes/projects.js` |
| Exportar roteiro / SRT / thumbnail | ✅ | `web/src/components/ExportPanel.tsx` |
| Viral Score (nota 0–100 + sugestões) | ✅ | `backend/src/routes/generate.js` |
| PWA instalável | ✅ | `web/public/manifest.webmanifest` |
| App Android nativo (Flutter) | 🟡 Scaffold + guia | `android/` |

🟡 = estrutura + instruções fornecidas, implementação nativa completa é fase 2.

---

## 🧱 Arquitetura

```
chat-viral-studio/
├── web/          Next.js 14 (App Router) + React + Tailwind + Zustand + Framer Motion (PWA)
├── backend/      Node.js + Express + SQLite (better-sqlite3) + Gemini + Google TTS + FFmpeg
├── android/      Flutter scaffold (FFmpegKit, câmera, mic) + guia de build APK
└── docs/         ARCHITECTURE.md · INSTALL.md · USAGE.md
```

Veja [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para o detalhe completo.

## 🚀 Começar em 2 minutos

```bash
# 1. Backend
cd backend && cp .env.example .env   # cole sua GEMINI_API_KEY
npm install && npm run dev           # http://localhost:4000

# 2. Web (noutro terminal)
cd web && cp .env.example .env.local # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install && npm run dev           # http://localhost:3000
```

Abra http://localhost:3000 → **Gerar com IA** → escolha categoria/duração →
**Gerar** → edite → escolha voz → **Exportar MP4**.

Sem `GEMINI_API_KEY`? O backend cai num **gerador mock** local — tudo funciona
offline para você testar o fluxo (apenas as histórias são pré-fabricadas).

## 🌐 Publicar online (Vercel — projeto único)

O site sobe inteiro na Vercel **sem backend separado**: as APIs viram rotas do
próprio Next.js (`web/src/app/api/*`), a biblioteca usa localStorage e a
exportação gera WebM. Em https://vercel.com/new importe `telekarinho/1`, defina
**Root Directory = `chat-viral-studio/web`**, deixe `NEXT_PUBLIC_API_URL` vazio e
(opcional) adicione `GEMINI_API_KEY` / `GOOGLE_TTS_API_KEY`. Passo a passo e o
modo com MP4/FFmpeg em [`docs/DEPLOY.md`](docs/DEPLOY.md).

## 📱 Gerar o APK Android

- **No PC** (você já tem Flutter): `cd chat-viral-studio/android && flutter create . --org com.chatviral --project-name chat_viral_studio && flutter pub get && flutter build apk --debug`
- **No GitHub Actions:** Actions → *Build Chat Viral Studio APK (Flutter)* → *Run
  workflow* → baixe o APK no artifact (ou marque `makeRelease=true` para anexar a
  uma Release). Workflow: `.github/workflows/build-chat-viral-apk.yml`.

## 📚 Documentação

- [Publicar online](docs/DEPLOY.md) — Vercel (1 projeto) e modo backend completo
- [Instalação completa](docs/INSTALL.md) — web, backend, FFmpeg, Android, Docker
- [Manual de uso](docs/USAGE.md) — os 4 modos, editor, exportação
- [Arquitetura](docs/ARCHITECTURE.md) — fluxo de dados, schema, API

## ⚖️ Legal & Segurança

- Layout **inspirado** em apps de mensagem — **sem** marca, logo ou assets
  oficiais do WhatsApp/Meta. Identidade própria ("Chat Verde").
- Moderação bloqueia: nomes reais sem autorização, dados pessoais, "isto é real",
  conteúdo criminoso/sexual explícito/ódio/humilhação real, golpes/instruções
  ilegais. Veja `backend/src/lib/moderation.js`.
- Selo de ficção ligado por padrão.

## 📄 Licença

MIT — uso por sua conta e risco. Respeite as políticas de TikTok/Reels/Shorts.
