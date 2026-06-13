# Arquitetura — Chat Viral Studio

## Visão geral

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLIENTE                                  │
│                                                                   │
│   Web (Next.js PWA)              Android (Flutter)                │
│   ─────────────────              ────────────────                │
│   • Dashboard / Templates        • Mesma API REST                 │
│   • Gerar com IA / Colar texto   • FFmpegKit (render local)       │
│   • Editor de chat (Zustand)     • Câmera + microfone             │
│   • ChatStage (Canvas engine)    • Export MP4 local               │
│   • Modo Eu Narrando (teleprompter + MediaRecorder)               │
│   • ExportPanel (MP4/SRT/thumb)                                   │
└───────────────┬───────────────────────────────────────────────────┘
                │ REST (JSON)
┌───────────────▼───────────────────────────────────────────────────┐
│                       BACKEND (Express)                           │
│                                                                   │
│   POST /api/generate     Gemini → JSON estruturado + Viral Score  │
│   POST /api/text-to-chat Texto colado → conversa estruturada      │
│   POST /api/tts          Google Cloud TTS → áudio por bloco       │
│   POST /api/render       WebM (upload) → MP4 H.264/AAC (FFmpeg)    │
│   CRUD  /api/projects    Biblioteca (SQLite)                      │
│   POST /api/viral-score  Avalia roteiro                           │
│                                                                   │
│   lib/gemini.js · lib/prompt.js · lib/moderation.js · db.js       │
└───────────────┬───────────────────────────────────────────────────┘
                │
        ┌───────▼────────┐   ┌──────────────┐   ┌─────────────┐
        │ SQLite (local) │   │ Gemini API   │   │ Google TTS  │
        │ projects.db    │   │ (Generative) │   │ (Cloud TTS) │
        └────────────────┘   └──────────────┘   └─────────────┘
```

## Fluxo de dados — Modo IA Total

1. `web/create` envia `POST /api/generate` com `{ category, duration, intensity, emotion, ending, messageCount }`.
2. `backend` monta o prompt (`lib/prompt.js`), chama Gemini (`lib/gemini.js`),
   valida o JSON contra o schema, passa por `lib/moderation.js`.
3. Resposta = objeto `Story` (ver schema abaixo) + `viralScore`.
4. `web` carrega no Zustand store, renderiza no `ChatStage`.
5. Usuário ajusta → `POST /api/tts` por mensagem → áudios sincronizados.
6. `Exportar` → `ChatStage` desenha frame-a-frame no Canvas, `MediaRecorder`
   grava `canvas.captureStream()` + faixa de áudio → WebM → `POST /api/render`
   → FFmpeg converte para MP4 1080×1920 H.264/AAC 30fps.

## Schema da história (`Story`)

```jsonc
{
  "id": "uuid",
  "title": "string",
  "hook": "string",            // primeira frase forte
  "category": "namoro",
  "theme": "verde",            // verde | escuro | business | minimalista
  "characters": [
    { "id": "c1", "name": "", "avatarColor": "#25D366", "side": "left|right", "online": true }
  ],
  "messages": [
    {
      "id": "m1",
      "sender": "c1",
      "type": "text",          // text | audio | image | call_missed | deleted | system | sticker
      "text": "",
      "emotion": "raiva",      // usado pela TTS
      "delay": 1.2,            // segundos antes desta mensagem
      "time": "21:48",
      "status": "read",        // sent | delivered | read
      "audioUrl": null         // preenchido após TTS
    }
  ],
  "narration": "",             // narração contínua opcional
  "hashtags": ["#viral"],
  "caption": "",
  "part2_hook": "",
  "viralScore": { "hook": 80, "curiosity": 75, "retention": 70, "emotion": 85, "ending": 90, "part2": 60, "total": 77, "suggestions": [] }
}
```

## Schema do projeto (SQLite `projects`)

| coluna | tipo | nota |
|---|---|---|
| id | TEXT PK | uuid |
| title | TEXT | |
| status | TEXT | draft / rendered |
| duration | REAL | segundos |
| format | TEXT | 1080x1920 / 720x1280 |
| thumbnail | TEXT | data URL ou caminho |
| story_json | TEXT | `Story` serializado |
| created_at | INTEGER | epoch ms |
| updated_at | INTEGER | epoch ms |

## Engine de vídeo

- **Web:** `ChatStage` é um componente React que também expõe `drawFrame(ctx, t)`.
  No preview anima via `requestAnimationFrame`; na exportação roda em Canvas
  off-DOM gravado por `MediaRecorder`. Áudio: `AudioContext` mixa os blocos TTS +
  música de fundo num `MediaStreamDestination`.
- **Backend:** FFmpeg só **transcodifica/normaliza** o WebM para MP4 (rápido,
  sem re-renderizar o chat). Comando em `routes/render.js`.
- **Android:** Flutter renderiza o mesmo modelo `Story` com widgets, grava com
  `RepaintBoundary`/screen capture, combina com FFmpegKit. Ver `android/README.md`.

## Decisões

- **Canvas-first no web** em vez de gravar a DOM: determinístico, mesmo resultado
  em qualquer navegador, e o mesmo `drawFrame` serve preview e export.
- **better-sqlite3** (síncrono, zero-config) para o MVP; trocável por
  Supabase/Firebase mudando só `db.js`.
- **Mock fallback** no Gemini para o app rodar sem chave (DX + CI).
